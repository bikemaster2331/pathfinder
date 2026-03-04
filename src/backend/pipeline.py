import os
import warnings
import logging
import json
import time
import yaml
import hashlib
import threading
import re
from pathlib import Path
from dotenv import load_dotenv
from difflib import get_close_matches 

# 1. NOISE SUPPRESSION & OFFLINE MODE
logging.getLogger("stanza").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", category=UserWarning)
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import chromadb
from chromadb.utils import embedding_functions
from sentence_transformers import SentenceTransformer, util
import torch
from langdetect import detect, LangDetectException
import requests
from better_profanity import profanity
from collections import deque
from queue import Queue

# INTERNAL MODULES
from controller import Controller
from entity_extractor import EntityExtractor

BASE_DIR = Path(__file__).parent 
DATASET_PATH = BASE_DIR / "dataset" / "dataset.json"
GEOJSON_PATH = BASE_DIR.parent.parent / "public" / "catanduanes_datafile.geojson"
CONFIG_PATH = BASE_DIR / "config" / "config.yaml"
CHROMA_STORAGE = BASE_DIR / "chroma_storage" 

# ============================================================================
# WORD TO NUMBER HELPER
# ============================================================================
WORD_NUMBERS = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
}

def parse_count_from_query(user_input):
    """
    Extract a requested count from the query.
    Handles both digits ("top 5") and words ("top ten").
    Returns default of 5 if nothing found.
    """
    query_lower = user_input.lower()

    digit_match = re.search(r'\b(top|best|give me|show me)?\s*(\d+)\b', query_lower)
    if digit_match:
        n = int(digit_match.group(2))
        if 1 <= n <= 10:
            print(f"[COUNT] Detected digit count: {n}")
            return n

    for word, num in WORD_NUMBERS.items():
        pattern = r'\b(top|best|give me|show me)?\s*' + word + r'\b'
        if re.search(pattern, query_lower):
            print(f"[COUNT] Detected word count: '{word}' -> {num}")
            return num

    print(f"[COUNT] No count found, defaulting to 5")
    return 5


def normalize_activities(raw):
    """
    FIX: ChromaDB rejects list values in metadata.
    Safely converts activities field to a comma-separated lowercase string.
    Handles: list ["hiking", "swimming"] → "hiking, swimming"
             string "hiking"             → "hiking"
             empty None / []             → ""
    """
    if not raw:
        return ""
    if isinstance(raw, list):
        return ", ".join(str(x) for x in raw).lower()
    if isinstance(raw, str):
        return raw.lower()
    return ""


# ============================================================================
# GEO LOOKUP
# ============================================================================
class GeoLookup:
    """Loads GeoJSON once and provides coordinates based on place_name matches"""
    def __init__(self, geojson_path, model):
        self.places_db = {}
        self.model = model
        self.place_names = []
        self.place_embeddings = None
        
        try:
            with open(geojson_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            for feature in data.get('features', []):
                props = feature.get('properties', {})
                geom = feature.get('geometry', {})
                name = props.get('name', '').strip()
                
                if name and geom.get('type') == 'Point':
                    clean_name = name.lower()
                    self.places_db[clean_name] = {
                        "name": name,
                        "coordinates": geom.get('coordinates'),
                        "type": props.get('type', 'place'),
                        "municipality": props.get('municipality', 'Catanduanes')
                    }
                    self.place_names.append(clean_name)
            
            print(f"[GEO] Loaded {len(self.places_db)} locations. Computing embeddings...")
            
            if self.place_names:
                self.place_embeddings = self.model.encode(self.place_names, convert_to_tensor=True)
                
        except Exception as e:
            print(f"[GEO ERROR] {e}")

    def get_coords(self, place_name):
        """Finds coordinates for a specific place name tag"""
        if not place_name:
            return None
        query = place_name.lower().strip()
        
        # Step 1: Exact Match (Fastest)
        exact = self.places_db.get(query)
        if exact:
            print(f"[GEO] Exact Match: '{place_name}'")
            return exact
        
        # Step 2: Semantic Match
        if self.place_names:
            query_embedding = self.model.encode(query, convert_to_tensor=True)
            scores = util.cos_sim(query_embedding, self.place_embeddings)[0]
            best_idx = torch.argmax(scores).item()
            best_score = scores[best_idx].item()
            
            if best_score > 0.92:
                match_name = self.place_names[best_idx]
                print(f"[GEO] Semantic Match: '{query}' -> '{match_name}' ({best_score:.2f})")
                return self.places_db[match_name]
            else:
                print(f"[GEO] Semantic match too weak: '{query}' best was '{self.place_names[best_idx]}' ({best_score:.2f}) — skipping")

        # Step 3: Fuzzy Fallback
        matches = get_close_matches(query, self.place_names, n=1, cutoff=0.85)
        if matches:
            print(f"[GEO] Fuzzy Match: '{query}' -> '{matches[0]}'")
            return self.places_db[matches[0]]
        
        print(f"[GEO] No match found for: '{place_name}'")
        return None


# ============================================================================
# SEMANTIC CACHE
# ============================================================================
class SemanticCache:
    """Fast vector-based cache with ChromaDB persistence"""
    def __init__(self, client, embedding_function, collection_name="query_cache", similarity_threshold=0.88):
        self.similarity_threshold = similarity_threshold
        self.lock = threading.Lock()
        
        try:
            self.cache_collection = client.get_collection(
                name=collection_name,
                embedding_function=embedding_function
            )
            print(f"[CACHE] Loaded existing cache collection with {self.cache_collection.count()} entries")
        except Exception:
            self.cache_collection = client.create_collection(
                name=collection_name,
                embedding_function=embedding_function,
                metadata={"hnsw:space": "cosine"}
            )
            print(f"[CACHE] Created new cache collection")
    
    def get(self, query, requested_count=None):
        if self.cache_collection.count() == 0:
            return None
        
        with self.lock:
            try:
                # FIX: fetch top 5 candidates so we can check count on each
                results = self.cache_collection.query(
                    query_texts=[query],
                    n_results=5
                )
                
                if not results['documents'][0]:
                    return None
                
                for i in range(len(results['documents'][0])):
                    distance   = results['distances'][0][i]
                    similarity = 1 - distance

                    if similarity < self.similarity_threshold:
                        continue

                    metadata     = results['metadatas'][0][i]
                    cached_query = results['documents'][0][i]

                    # FIX: count must match if both sides have it stored
                    stored_count = metadata.get('requested_count', None)
                    if requested_count is not None and stored_count is not None:
                        if stored_count != requested_count:
                            print(f"[CACHE] Similarity OK ({similarity:.3f}) but count mismatch: "
                                  f"stored={stored_count} requested={requested_count} — skipping")
                            continue

                    answer  = metadata.get('answer', '')
                    places  = metadata.get('places', '[]')
                    version = metadata.get('version', 'raw')
                    
                    try:
                        places_list = json.loads(places)
                    except:
                        places_list = []
                    
                    print(f"[CACHE HIT] Similarity: {similarity:.3f} | Count: {stored_count} | "
                          f"Ver: {version} | '{cached_query[:30]}...'")
                    return (answer, places_list, version)

                print(f"[CACHE MISS] No matching entry (count={requested_count})")
                return None
                
            except Exception as e:
                print(f"[CACHE ERROR] {e}")
                return None
    
    def set(self, query, answer, places, requested_count=None):
        with self.lock:
            try:
                cache_id = f"cache_{hashlib.md5(query.encode()).hexdigest()}_{int(time.time())}"
                metadata = {
                    "answer":    answer,
                    "places":    json.dumps(places),
                    "timestamp": time.time(),
                    "version":   "raw"
                }
                # FIX: store count so future get() can verify it
                if requested_count is not None:
                    metadata["requested_count"] = requested_count

                self.cache_collection.add(
                    documents=[query],
                    metadatas=[metadata],
                    ids=[cache_id]
                )
                print(f"[CACHE SET] Stored: '{query[:50]}...' (count={requested_count})")
            except Exception as e:
                print(f"[CACHE SET ERROR] {e}")
    
    def update(self, query, enhanced_answer):
        with self.lock:
            try:
                results = self.cache_collection.query(query_texts=[query], n_results=1)
                
                if not results['documents'][0]:
                    return False
                
                distance   = results['distances'][0][0]
                similarity = 1 - distance
                
                if similarity >= self.similarity_threshold:
                    cache_id     = results['ids'][0][0]
                    old_metadata = results['metadatas'][0][0]
                    
                    self.cache_collection.update(
                        ids=[cache_id],
                        metadatas=[{
                            "answer":    enhanced_answer,
                            "places":    old_metadata.get('places', '[]'),
                            "timestamp": time.time(),
                            "version":   "enhanced"
                        }]
                    )
                    print(f"[CACHE UPDATED] Enhanced: '{query[:50]}...'")
                    return True
                return False
            except Exception as e:
                print(f"[CACHE UPDATE ERROR] {e}")
                return False


# ============================================================================
# BACKGROUND ENHANCER
# ============================================================================
class BackgroundEnhancer:
    def __init__(self, api_key, cache, config):
        self.api_key   = api_key
        self.cache     = cache
        self.config    = config
        self.job_queue = Queue()
        self.worker_thread = None
        self.running   = False
    
    def start(self):
        if self.worker_thread is not None:
            print("[ENHANCER] Already running")
            return
        self.running = True
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()
        print("[ENHANCER] Background worker started")
    
    def stop(self):
        self.running = False
        if self.worker_thread:
            self.worker_thread.join(timeout=2)
        print("[ENHANCER] Background worker stopped")
    
    def enqueue(self, query, raw_facts, raw_answer):
        job = {
            'query':      query,
            'raw_facts':  raw_facts,
            'raw_answer': raw_answer,
            'timestamp':  time.time()
        }
        self.job_queue.put(job)
        print(f"[ENHANCER] Job queued: '{query[:50]}...'")
    
    def _worker_loop(self):
        print("[ENHANCER] Worker loop started")
        while self.running:
            try:
                job      = self.job_queue.get(timeout=2)
                enhanced = self._enhance_with_gemini(job)
                
                if enhanced:
                    success = self.cache.update(job['query'], enhanced)
                    print(f"[ENHANCER] ✓ Success: {success}")
                else:
                    print(f"[ENHANCER] ✗ Job failed at the API level")
                    time.sleep(60)
                
                self.job_queue.task_done()
            except Exception as e:
                if "Empty" not in str(type(e).__name__):
                    print(f"[ENHANCER ERROR] Loop crashed: {e}")
                continue

    def _enhance_with_gemini(self, job):
        if not self.api_key:
            return None
        
        model_alias = "gemini-2.5-flash-lite"
        url     = f"https://generativelanguage.googleapis.com/v1beta/models/{model_alias}:generateContent?key={self.api_key}"
        headers = {'Content-Type': 'application/json'}

        raw_template = self.config['gemini']['prompt_template']
        prompt = raw_template.format(
            question=job['query'], 
            fact=job['raw_facts']
        )
        
        payload = {
            'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': {'temperature': 0.1}
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=15)
            if response.status_code == 200:
                result = response.json()
                return result['candidates'][0]['content']['parts'][0]['text'].strip()
            else:
                print(f"[ENHANCER ERROR] Status {response.status_code}: {response.text}")
                return None
        except Exception as e:
            print(f"[ENHANCER ERROR] Network failure: {e}")
            return None


# ============================================================================
# RATE LIMITER
# ============================================================================
class RateLimiter:
    def __init__(self, max_request, period_seconds):
        self.max_request    = max_request
        self.period_seconds = period_seconds
        self.timestamps     = deque()

    def is_allowed(self):
        now = time.time()
        while self.timestamps and self.timestamps[0] < now - self.period_seconds:
            self.timestamps.popleft()
        if len(self.timestamps) < self.max_request:
            self.timestamps.append(now)
            return True
        return False
    
    def get_remaining_time(self):
        if not self.timestamps:
            return 0
        now    = time.time()
        expiry = self.timestamps[0] + self.period_seconds
        return max(0, int(expiry - now))


# ============================================================================
# MAIN PIPELINE
# ============================================================================
class Pipeline:

    # Reference words that signal a follow-up about a previously mentioned
    # place. Class-level so _resolve_context can always access them.
    REFERENCE_WORDS = [
        'there', 'that place', 'it', 'that spot', 'the place',
        'doon', 'dun', 'yun', 'yung', 'dito', 'that area',
        'how about there', 'what about there', 'over there',
        'that one', 'that location', 'that destination'
    ]

    def __init__(self, dataset_path=str(DATASET_PATH), config_path=str(CONFIG_PATH)):
        
        self.config = self.load_config(config_path)
        print(f"[INFO] Loaded config")
        load_dotenv()
        self.internet_status = True
        self.dataset_path    = dataset_path 

        # Rate limiter
        sec_conf        = self.config.get('security', {})
        rate_limit_conf = sec_conf.get('rate_limit', {})
        self.limiter    = RateLimiter(
            max_request    = rate_limit_conf.get('max_request', 5),
            period_seconds = rate_limit_conf.get('period_seconds', 60)
        )
        
        # RAG model
        RAG_MODEL      = "sentence-transformers/" + self.config['rag']['model_path']
        self.raw_model = SentenceTransformer(RAG_MODEL, device="cpu")
        self.client    = chromadb.PersistentClient(path=str(CHROMA_STORAGE))
        self.embedding = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=RAG_MODEL, device="cpu"
        )
        
        # GeoLookup
        self.geo_engine = GeoLookup(str(GEOJSON_PATH), self.raw_model)
        
        # Semantic cache
        cache_threshold       = self.config.get('cache', {}).get('similarity_threshold', 0.88)
        cache_collection_name = self.config.get('cache', {}).get('collection_name', 'query_cache')
        self.semantic_cache   = SemanticCache(
            client               = self.client,
            embedding_function   = self.embedding,
            collection_name      = cache_collection_name,
            similarity_threshold = cache_threshold
        )
        
        # Background Gemini enhancer
        gemini_key    = os.getenv('GEMINI_API_KEY')
        self.enhancer = BackgroundEnhancer(gemini_key, self.semantic_cache, self.config)
        self.enhancer.start()
        
        # Controller and entity extractor
        self.controller       = Controller(self.config, self.raw_model)
        self.entity_extractor = EntityExtractor(self.config)

        # --------------------------------------------------------------------
        # SESSION CONTEXT
        # Tracks what was discussed last turn so follow-up queries like
        # "how much is the fee there?" resolve to the correct place.
        #
        # Scenarios handled:
        #   A) last_places has 1 entry   → use it directly, no note needed
        #   B) active_pin set by frontend → most specific signal, use it
        #   C) last_places has N entries  → use first + prepend assumption note
        # --------------------------------------------------------------------
        self.session_context = {
            "last_place":    None,  # highest-confidence place from last response
            "last_places":   [],    # ALL places from last response
            "last_location": None,  # municipality of last_place e.g. "BARAS"
            "active_pin":    None   # set by frontend when user clicks a map pin
        }

        # Profanity filter
        profanity.load_censor_words()
        profanity.add_censor_words(self.config['profanity'])
        
        # ChromaDB collection
        try:
            self.collection = self.client.get_collection(
                name               = self.config['rag']['collection_name'],
                embedding_function = self.embedding
            )
            count = self.collection.count()
            print(f"[INFO] Brain loaded. Facts available: {count}")
            if count == 0:
                print("[WARN] Brain is empty! Run 'ingest.py' to read dataset.json.")
        except Exception:
            print("[WARN] Collection not found. Creating new empty one.")
            self.collection = self.client.create_collection(
                name               = self.config['rag']['collection_name'],
                embedding_function = self.embedding
            )

    # ========================================================================
    # CONFIG / DATASET
    # ========================================================================
    def load_config(self, config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        except Exception as e:
            print(f"Config Error: {e}")
            exit(1)

    def dataset_hash(self, dataset_path):
        hasher = hashlib.md5()
        try:
            with open(dataset_path, 'rb') as f:
                hasher.update(f.read())
            return hasher.hexdigest()
        except FileNotFoundError:
            return None

    def load_dataset(self, dataset_path):
        try:
            with open(dataset_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"Dataset error: {e}")
            return
        
        documents = []
        metadatas = []
        ids       = []
        
        for idx, item in enumerate(data):
            if 'input' not in item or 'output' not in item:
                continue
            
            documents.append(item['input'])
            
            meta = {
                "question":        item['input'],
                "answer":          item['output'],
                "title":           item.get('title', 'General Info'),
                "topic":           item.get('topic', 'General'),
                "summary_offline": item.get('summary_offline', item['output']),
                "place_name":      item.get('place_name', ''), 
                "location":        str(item.get('location', '')).upper(),
                # FIX: activities MUST be stored as string — ChromaDB rejects lists.
                # normalize_activities() handles both list and string formats safely.
                "activities_tag":  normalize_activities(item.get('activities', [])),
                "skill_level":     str(item.get('skill_level', '')).lower(),
                "group_type":      str(item.get('group_type', '')).lower(),
            }
            
            metadatas.append(meta)
            ids.append(str(idx))
        
        if documents:
            self.collection.add(documents=documents, metadatas=metadatas, ids=ids)
            print(f"[INFO] Loaded {len(documents)} Q&A pairs with Metadata Tags")

            # Sanity check — confirm activities_tag looks right
            sample = next((m for m in metadatas if m.get('activities_tag')), None)
            if sample:
                print(f"[INFO] Sample activities_tag: '{sample['activities_tag']}' ← should be words not characters")

    def rebuild_index(self):
        print("[INGEST] Wiping old memory...")
        try:
            self.client.delete_collection(name=self.config['rag']['collection_name'])
        except:
            pass
        
        self.collection = self.client.create_collection(
            name               = self.config['rag']['collection_name'],
            embedding_function = self.embedding
        )
        
        self.load_dataset(self.dataset_path)
        print(f"[INGEST] SUCCESS.")

    # ========================================================================
    # MISC HELPERS
    # ========================================================================
    def check_profanity(self, text):
        return profanity.contains_profanity(text)

    def normalize_query(self, text):
        return text.strip().lower()

    def protect(self, user_input):
        if not user_input or not user_input.strip():
            return ""
        if hasattr(self, 'check_profanity') and self.check_profanity(user_input):
            return "[PROFANITY DETECTED]"
        return user_input
    
    def extract_keywords(self, question):
        found          = []
        question_lower = question.lower()
        for topic, words in self.config['keywords'].items():
            for word in words:
                pattern = r'\b' + re.escape(word) + r'\b'
                if re.search(pattern, question_lower):
                    found.append(topic)
                    break
        return found if found else ['general']

    def search(self, question, where_filter=None, entities=None):
        results = self.collection.query(
            query_texts=[question],
            n_results=15,
            where=where_filter
        )
        if not results['documents'][0]:
            return "I don't have information about that."
        return results['metadatas'][0][0].get('summary_offline', '')

    def key_places(self, text):
        places        = self.config['places']
        found         = []
        text_lower    = text.lower()
        sorted_places = sorted(places, key=len, reverse=True)
        for place in sorted_places:
            pattern = r'\b' + re.escape(place.lower()) + r'\b'
            if re.search(pattern, text_lower) and place not in found:
                found.append(place)
        return found

    def get_place_data(self, found_places):
        places_data = []
        for place_name in found_places:
            if place_name in self.config['places']:
                place_info = self.config['places'][place_name]
                places_data.append({
                    "name": place_name,
                    "lat":  place_info['lat'],
                    "lng":  place_info['lng'],
                    "type": place_info['type']
                })
        return places_data
    
    def extract_location_fallback(self, query):
        query_lower    = query.lower()
        municipalities = ['virac', 'baras', 'pandan', 'bato', 'gigmoto', 
                          'san andres', 'bagamanoc', 'viga', 'caramoran']
        for place in municipalities:
            patterns = [f" in {place}", f" at {place}", f" near {place}", f"{place} ", f" {place}"]
            for pattern in patterns:
                if pattern in query_lower:
                    return place.title()
        return None

    # ========================================================================
    # ACTIVITY FILTER HELPERS
    # ========================================================================
    def _build_required_keywords(self, activities):
        required_keywords = []
        keyword_config    = self.config.get('keywords', {})

        for act in activities:
            found_in_config = False

            if act in keyword_config:
                required_keywords.extend(keyword_config[act])
                found_in_config = True

            if not found_in_config:
                for category, synonyms in keyword_config.items():
                    if act in synonyms:
                        required_keywords.extend(synonyms)
                        found_in_config = True
                        break

            if not found_in_config:
                required_keywords.append(act)

        return required_keywords

    def _passes_activity_filter(self, meta, required_keywords):
        if not required_keywords:
            return True

        name           = meta.get('place_name', '').lower()
        text           = meta.get('summary_offline', '').lower()
        activities_tag = meta.get('activities_tag', '').lower()

        is_relevant = any(
            kw in name or kw in text or kw in activities_tag
            for kw in required_keywords
        )

        if not is_relevant:
            print(f"[FILTER] ✗ Skipped '{meta.get('place_name', 'Unknown')}' — "
                  f"no match for keywords: {required_keywords[:5]}")

        return is_relevant

    # ========================================================================
    # CONTEXT RESOLUTION — Conversational Memory
    #
    # Called right after entity extraction, before the place/town split.
    # Only activates when:
    #   1. A reference word is present ("there", "doon", "that place", etc.)
    #   2. No place was already found in the current query
    #   3. session_context has a last_place stored
    #
    # Three scenarios:
    #   A) last_places has exactly 1 entry  → use it, no note needed
    #   B) active_pin is set by frontend    → highest priority, use it
    #   C) last_places has N>1 entries      → use first, prepend assumption note
    # ========================================================================
    def _resolve_context(self, entities, query_lower):
        """
        Injects the correct place from session_context into entities so
        the rest of the pipeline handles the follow-up like a normal query.

        Returns (entities, context_note, clarification).
        context_note is a string for Scenario C (ambiguous), None otherwise.
        """
        # FIX: use word boundary regex so 'it' doesn't match substrings like
        # 'capital', 'activity', 'visit', 'historic', etc.
        has_reference = any(
            re.search(r'\b' + re.escape(w) + r'\b', query_lower)
            for w in self.REFERENCE_WORDS
        )
        has_place_already = bool(entities['places'])

        # Not a follow-up — pass through untouched
        if not has_reference or has_place_already:
            return entities, None, None

        # No prior context — can't resolve
        if not self.session_context['last_place']:
            return entities, None, None

        context_note = None
        clarification = None

        # ── Scenario B: frontend told us the active pin ───────────────────
        if self.session_context['active_pin']:
            resolved = self.session_context['active_pin']
            print(f"[CONTEXT] Scenario B — using active pin: '{resolved}'")
            entities['places'].append(resolved)

        # ── Scenario A: only one place in last response ───────────────────
        elif len(self.session_context['last_places']) == 1:
            resolved = self.session_context['last_places'][0]
            print(f"[CONTEXT] Scenario A — single last place: '{resolved}'")
            entities['places'].append(resolved)

        # ── Scenario C: multiple places, assume the first one ─────────────
        else:
            last_places = self.session_context['last_places']
            
            if len(last_places) <= 3:
                # Few enough — query all of them, return combined answer
                entities['places'].extend(last_places)
                print(f"[CONTEXT] Scenario C — small list ({len(last_places)}), querying all")
                context_note = None
                clarification = None
            else:
                # Too many to query all — ask user to pick
                place_list = ", ".join(last_places[:5])
                if len(last_places) > 5:
                    place_list += f" and {len(last_places) - 5} more"
                clarification = f"Which place are you asking about? You can say the name or click a pin on the map. I mentioned: {place_list}."
                return entities, None, clarification

        return entities, context_note, None

    def _update_session_context(self, final_locations, specific_places_found, target_towns, displayed_count=None):
        if final_locations:
            # Cap to displayed_count so last_places only has what was actually shown
            shown = final_locations[:displayed_count] if displayed_count else final_locations
            self.session_context['last_place']    = shown[0]['name']
            self.session_context['last_location'] = shown[0]['municipality']
            self.session_context['last_places']   = [p['name'] for p in shown]
        elif specific_places_found:
            self.session_context['last_place']    = specific_places_found[0]
            self.session_context['last_places']   = specific_places_found
            self.session_context['last_location'] = target_towns[0] if target_towns else None

            print(f"[CONTEXT] Updated → last_place='{self.session_context['last_place']}' | "
                f"last_places={self.session_context['last_places']}")

    # ========================================================================
    # MAIN ASK METHOD
    # ========================================================================
    def ask(self, user_input, active_pin=None):
        """
        Main entry point.

        active_pin (str | None): name of the map pin currently selected in
            the frontend. Pass this from your API route so Scenario B works.
            Example (Flask): result = pipeline.ask(query, active_pin=request.json.get('active_pin'))
        """
        start_time = time.time()

        # Sync active_pin from frontend into session context every call
        if active_pin is not None:
            self.session_context['active_pin'] = active_pin
            print(f"[CONTEXT] Active pin from frontend: '{active_pin}'")
        else:
            # Clear it so a previous pin doesn't bleed into unrelated queries
            self.session_context['active_pin'] = None

        # ── Gate checks ───────────────────────────────────────────────────
        if not self.limiter.is_allowed():
            return {"answer": f"Please wait {self.limiter.get_remaining_time()}s.", "locations": []}

        if self.check_profanity(user_input):
            return {"answer": "I cannot process that language.", "locations": []}

        analysis = self.controller.analyze_query(user_input)

        if not analysis['is_valid'] or analysis['intent'] == 'nonsense':
            print(f"[GATEKEEPER] Blocked: {user_input} (Reason: {analysis['reason']})")
            return {"answer": self.controller.get_nonsense_response(), "locations": []}

        if analysis['intent'] == 'greeting':
            return {"answer": self.controller.get_greeting_response(), "locations": []}

        normalized  = self.normalize_query(user_input)
        query_lower = normalized

        # ── Cache check ───────────────────────────────────────────────────
        requested_count = parse_count_from_query(user_input)
        cached = self.semantic_cache.get(normalized, requested_count)
        if cached:
            answer, places, version = cached
            if version == 'raw':
                self.enhancer.enqueue(normalized, answer, answer)
            return {"answer": answer, "locations": places}

        # ── Entity extraction ─────────────────────────────────────────────
        entities = self.entity_extractor.extract(user_input)
        print(f"[ENTITIES] {entities}")
        print(f"[COUNT] Requested count: {requested_count}")

        # ── Context resolution (must run before place/town split) ─────────
        entities, context_note, clarification = self._resolve_context(entities, query_lower)
        
        if clarification:
            # Short-circuit — don't run the full pipeline
            # Passing True as flag ensures context stays the same so the user can easily select the next place
            print(f"[CONTEXT] Scenario C trigger -> Asking for clarification.")
            return {"answer": clarification, "locations": []}
            
        if context_note:
            print(f"[CONTEXT] Will prepend assumption note for: '{context_note}'")

        # ── Budget signal override ─────────────────────────────────────────
        # If the query contains cost/price/fee words, treat the intent as 'budget'
        # regardless of what else the entity extractor detected. This prevents
        # "how much does it cost to stay there" from activating the accommodation
        # filter (via 'stay') and blocking budget/fee entries for a tourist spot.
        BUDGET_SIGNALS = ['how much', 'magkano', 'cost', 'price', 'fee', 'entrance',
                          'bayad', 'libre', 'expensive', 'cheap', 'afford']
        if any(sig in query_lower for sig in BUDGET_SIGNALS):
            if 'budget' not in entities.get('activities', []):
                entities['activities'] = ['budget']
                print(f"[ENTITIES] Budget signal detected — overriding activity to ['budget']")

        # ── Separate towns vs specific places ─────────────────────────────
        target_towns          = []
        specific_places_found = []

        for p in entities['places']:
            if p.lower() in self.entity_extractor.municipalities:
                target_towns.append(p.upper())
            else:
                specific_places_found.append(p)

        if not target_towns and entities.get('inferred_town'):
            target_towns.append(entities['inferred_town'])
            print(f"[PIPELINE] Inferred Town: {target_towns[0]}")

        # ── Listing detection ─────────────────────────────────────────────
        is_browsing = entities.get('is_listing', False)
        if re.search(r'\b\d+\b', user_input) or any(w in user_input.lower() for w in WORD_NUMBERS):
            is_browsing = True
            print(f"[PIPELINE] Listing forced ON due to count word/number in query")

        # ── Activity keywords (built once, used in both loops below) ──────
        required_keywords = []
        if entities.get('activities'):
            required_keywords = self._build_required_keywords(entities['activities'])
            print(f"[FILTER] Activity filter active. Keywords: {required_keywords}")
        else:
            print(f"[FILTER] No activity filter active — all document types will pass")

        # ====================================================================
        # MULTI-PLACE SEARCH LOGIC
        # ====================================================================
        if specific_places_found and len(specific_places_found) > 1:
            print(f"[MULTI-PLACE] Detected {len(specific_places_found)} places: {specific_places_found}")

            all_answers   = []
            all_locations = []
            seen_places   = set()

            for place_name in specific_places_found:
                print(f"[SEARCH] Querying: '{place_name}'")

                place_results = self.collection.query(
                    query_texts=[f"{place_name} location information"],
                    n_results=3,
                    where={"place_name": {"$eq": place_name}}
                )

                if place_results['documents'][0]:
                    meta       = place_results['metadatas'][0][0]
                    doc_id     = place_results['ids'][0][0]
                    doc_text   = place_results['documents'][0][0]
                    confidence = 1 - place_results['distances'][0][0]

                    print(f"[DEBUG AUDIT MULTI] Found ID: {doc_id}")
                    print(f"[DEBUG AUDIT MULTI] Meta Name: {meta.get('place_name')} | conf={confidence:.3f}")
                    print(f"[DEBUG AUDIT MULTI] Raw Text: {doc_text[:50]}...")

                    if confidence > 0.30:
                        all_answers.append(meta.get('summary_offline', meta['answer']))

                        place_key = meta.get('place_name')
                        if place_key:
                            loc_data = self.geo_engine.get_coords(place_key)
                            if loc_data and loc_data['name'] not in seen_places:
                                all_locations.append(loc_data)
                                seen_places.add(loc_data['name'])

            if all_answers:
                raw_answer      = " ".join(all_answers)
                final_locations = all_locations
            else:
                raw_answer      = "I couldn't find specific information about those places."
                final_locations = []

        # ====================================================================
        # SINGLE PLACE OR BROWSING LOGIC
        # ====================================================================
        else:
            if specific_places_found:
                is_browsing = False
                n_results   = max(3, len(specific_places_found) * 3)
            else:
                n_results = 100 if is_browsing else 5

            print(f"[PIPELINE] Mode: {'BROWSING' if is_browsing else 'SPECIFIC'} | "
                f"N={n_results} | Target towns: {target_towns}")

            where_filter = None
            if specific_places_found:
                where_filter = ({"place_name": {"$eq": specific_places_found[0]}}
                                if len(specific_places_found) == 1
                                else {"$or": [{"place_name": p} for p in specific_places_found]})
            elif target_towns:
                where_filter = ({"location": target_towns[0]}
                                if len(target_towns) == 1
                                else {"$or": [{"location": t} for t in target_towns]})

            print(f"[PIPELINE] where_filter: {where_filter}")

            results   = self.collection.query(
                query_texts=[user_input],
                n_results=n_results,
                where=where_filter
            )

            total_raw = len(results['documents'][0]) if results['documents'][0] else 0
            print(f"[RAG] Raw results from ChromaDB: {total_raw} documents")

            answers_found   = []
            final_locations = []
            seen_places     = set()

            if results['documents'][0]:
                for i, doc in enumerate(results['documents'][0]):
                    meta           = results['metadatas'][0][i]
                    confidence     = 1 - results['distances'][0][i]
                    place_name_tag = meta.get('place_name', 'N/A')

                    print(f"[RAW DOC {i}] '{place_name_tag}' | conf={confidence:.3f} | "
                          f"loc={meta.get('location', '?')} | "
                          f"activities_tag='{meta.get('activities_tag', '')[:25]}'")

                    # FIX: Skip activity filter when a specific place is already resolved.
                    # When specific_places_found is set, the where_filter already scoped
                    # ChromaDB to that exact place. Running activity filter here risks
                    # dropping the only 3 Puraran/Maribina docs because their activities_tag
                    # is 'surfing' not 'dining'. The user asked about the place — trust
                    # semantic match, not tag matching.
                    # Activity filter only makes sense for browsing (no locked place).
                    if not specific_places_found and not self._passes_activity_filter(meta, required_keywords):
                        continue

                    if specific_places_found:
                        if meta.get('place_name') not in specific_places_found:
                            print(f"[FILTER] ✗ Skipped '{place_name_tag}' — not in specific_places_found")
                            continue
                    else:
                        threshold = 0.30 if is_browsing else 0.40
                        if confidence < threshold:
                            print(f"[FILTER] ✗ Skipped '{place_name_tag}' — "
                                f"confidence {confidence:.3f} < threshold {threshold}")
                            continue
                        if target_towns and meta.get('location') not in target_towns:
                            print(f"[FILTER] ✗ Skipped '{place_name_tag}' — "
                                f"location '{meta.get('location')}' not in {target_towns}")
                            continue

                    print(f"[FILTER] ✓ Kept '{place_name_tag}'")
                    place_key = meta.get('place_name', '').strip()
                    if not place_key:
                        # FIX: General/province-level entries have no place_name (e.g. "where is
                        # catanduanes located", "is catanduanes safe"). Their conf=0.9+ answers
                        # were being silently dropped. Collect the answer — just skip geo lookup
                        # since there is no specific pin to show for a province-level fact.
                        print(f"[FILTER] ✓ Kept (no pin) — general/province-level entry")
                        answers_found.append(meta.get('summary_offline', meta['answer']))
                        continue

                    # FIX: Suppress specific-place pins when query is clearly general
                    # (no target place or town) and general entries already have high
                    # confidence answers. Prevents unrelated hotel/airport pins from
                    # appearing on answers like "where is catanduanes located".
                    is_general_query = not specific_places_found and not target_towns
                    if is_general_query and answers_found:
                        # We already have general entries answering the question.
                        # Still collect the answer text but skip the geo pin.
                        print(f"[FILTER] ✓ Kept text only (no pin) — general query, specific place suppressed")
                        answers_found.append(meta.get('summary_offline', meta['answer']))
                        continue

                    answers_found.append(meta.get('summary_offline', meta['answer']))

                    if not is_browsing:   # ← ONLY do geo lookup in specific mode
                        place_key = meta.get('place_name')
                        if place_key:
                            loc_data = self.geo_engine.get_coords(place_key)
                            if loc_data and loc_data['name'] not in seen_places:
                                final_locations.append(loc_data)
                                seen_places.add(loc_data['name'])
                            elif not loc_data:
                                print(f"[GEO] ✗ No coordinates found for '{place_key}' — pin will not appear")

            print(f"[PIPELINE] Docs after filtering: {len(answers_found)} | "
                f"Locations found: {len(final_locations)}")

            if not answers_found:
                town_str   = target_towns[0].title() if target_towns else "that area"
                raw_answer = (f"I'm sorry, I don't have information on that in {town_str}."
                            if target_towns else "I don't have information on that.")
                final_locations = []
            else:
                if is_browsing:
                    # FIX: Best-conf-per-place aggregation before dedup.
                    # Old code was first-seen: if a place had 3 entries and the activity
                    # filter happened to skip its highest-conf entry, the place got
                    # represented by a weaker entry. Now we pick the best-passing entry
                    # per place first, then rank unique places by that best score.
                    place_best = {}  # place_name → (best_conf, index)
                    for i, meta in enumerate(results['metadatas'][0]):
                        name = meta.get('place_name', '').strip()
                        conf = 1 - results['distances'][0][i]
                        if not name or conf < 0.30:
                            continue
                        if not self._passes_activity_filter(meta, required_keywords):
                            continue
                        if name not in place_best or conf > place_best[name][0]:
                            place_best[name] = (conf, i)

                    # Sort places by their best confidence, take top requested_count
                    ranked_places = sorted(place_best.items(), key=lambda x: x[1][0], reverse=True)
                    ranked_places = ranked_places[:requested_count]
                    print(f"[BROWSING] Best-conf per place: {[(n, f'{c:.3f}') for n,(c,_) in ranked_places]}")

                    descriptions = []
                    for name, (conf, _) in ranked_places:
                        descriptions.append(name)
                        loc_data = self.geo_engine.get_coords(name)
                        if loc_data and loc_data['name'] not in seen_places:
                            final_locations.append(loc_data)
                            seen_places.add(loc_data['name'])

                    print(f"[BROWSING] Final descriptions ({len(descriptions)}): {descriptions}")

                    raw_answer = ("Here are some options: " + "; ".join(descriptions) + "."
                                if descriptions
                                else "I don't have enough information to list spots for that query.")
                else:
                    if len(specific_places_found) == 1:
                        # Single specific place — use only the best match (highest confidence)
                        # Joining multiple entries causes unrelated info from the same place to bleed in
                        raw_answer = answers_found[0]
                        print(f"[SPECIFIC] Single place mode — using top result only (of {len(answers_found)} found)")
                    else:
                        # Multiple specific places (comparison) — join all
                        deduped_answers = list(dict.fromkeys(answers_found))
                        raw_answer = " ".join(deduped_answers)

        # ====================================================================
        # FINAL STEPS
        # ====================================================================

        # Scenario C assumption note — prepended so the user knows what
        # place we assumed when their follow-up was ambiguous
        if context_note:
            raw_answer = f"(Assuming you mean {context_note}) " + raw_answer

        # FIX: use word boundary regex — same fix as _resolve_context.
        # Previously 'it' in REFERENCE_WORDS matched 'capital', 'activity', etc.
        # causing valid queries to skip the cache unnecessarily.
        is_context_query = any(
            re.search(r'\b' + re.escape(w) + r'\b', query_lower)
            for w in self.REFERENCE_WORDS
        )
        # FIX: old is_vague_query was too aggressive — it classified ANY province-level
        # query (no place, no town, no activity) as vague and skipped caching entirely.
        # "where is catanduanes", "how do i get to catanduanes", "historic sites in
        # catanduanes" all hit this. Now: only skip caching if we actually have NO answer.
        is_vague_query = (
            not specific_places_found
            and not target_towns
            and not entities.get('activities')
            and not answers_found  # ← only truly vague if we found nothing useful
        )
        if not is_context_query and not is_vague_query:
            self.semantic_cache.set(normalized, raw_answer, final_locations, requested_count)
        else:
            print(f"[CACHE] Skipped caching — context-dependent or vague query")

        if "don't have information" not in raw_answer.lower() and not is_browsing:
            self.enhancer.enqueue(normalized, raw_answer, raw_answer)

        # Update session context for the next query's follow-up resolution
        self._update_session_context(final_locations, specific_places_found, target_towns, displayed_count=requested_count)

        formatted_places = [
            {
                "name":         p['name'],
                "coordinates":  p['coordinates'],
                "type":         p['type'],
                "municipality": p['municipality']
            }
            for p in final_locations
        ]

        print(f"[RESPONSE] Answer: '{raw_answer[:80]}...'")
        print(f"[RESPONSE] Locations returned: {len(formatted_places)}")
        print(f"[RESPONSE TIME] {time.time() - start_time:.3f}s")

        return {"answer": raw_answer, "locations": formatted_places}

    def guide_question(self):
        """Interactive CLI"""
        messages = self.config['messages']
        print(messages['intro_message'])
        print(messages['exit_commands'])
        
        def response(user_input):
            if user_input.lower() in self.config['exit_commands']:
                self.enhancer.stop()
                exit()
            if not user_input.strip():
                print(f"Pathfinder: {messages['enter_something']}")
                return
            
            result = self.ask(user_input)
            print(f"Pathfinder: {result['answer']}\n")
            if result['locations']:
                print(f"[PLACES] {result['locations']}")
        
        pref = input(messages['initial_question']).strip()
        if pref:
            response(pref)
        
        while True:
            qry = input("You: ").strip()
            response(qry)


if __name__ == '__main__':
    pipeline = Pipeline(dataset_path=str(DATASET_PATH), config_path=str(CONFIG_PATH))
    pipeline.guide_question()