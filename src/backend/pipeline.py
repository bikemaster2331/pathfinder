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

# --- FORCE OFFLINE MODE ---
# This prevents the "HTTPSConnectionPool" crash by stopping model update checks
# os.environ["HF_HUB_OFFLINE"] = "1" 
# --------------------------

import chromadb
from chromadb.utils import embedding_functions
from sentence_transformers import SentenceTransformer, util
import torch
from langdetect import detect, LangDetectException
import argostranslate.translate
import requests
from better_profanity import profanity
from collections import deque
from queue import Queue

# INTERNAL MODULES
from controller import Controller
from entity_extractor import EntityExtractor

BASE_DIR = Path(__file__).parent 
DATASET_PATH = BASE_DIR / "dataset" / "dataset.json"
GEOJSON_PATH = BASE_DIR.parent.parent / "public" / "catanduanes_full.geojson"
CONFIG_PATH = BASE_DIR / "config" / "config.yaml"
CHROMA_STORAGE = BASE_DIR / "chroma_storage" 

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
            
            # Pre-compute embeddings for semantic search
            if self.place_names:
                self.place_embeddings = self.model.encode(self.place_names, convert_to_tensor=True)
                
        except Exception as e:
            print(f"[GEO ERROR] {e}")

    def get_coords(self, place_name):
        """Finds coordinates for a specific place name tag"""
        if not place_name: return None
        query = place_name.lower().strip()
        
        # Step 1: Exact Match (Fastest)
        exact = self.places_db.get(query)
        if exact: return exact
        
        # Step 2: Semantic Match (Accurate for variations like "Falls" vs "Waterfalls")
        if self.place_names:
            query_embedding = self.model.encode(query, convert_to_tensor=True)
            scores = util.cos_sim(query_embedding, self.place_embeddings)[0]
            best_idx = torch.argmax(scores).item()
            best_score = scores[best_idx].item()
            
            if best_score > 0.85: # High confidence threshold
                match_name = self.place_names[best_idx]
                print(f"[GEO] Semantic Match: '{query}' -> '{match_name}' ({best_score:.2f})")
                return self.places_db[match_name]

        # Step 3: Fuzzy Fallback (Catches typos like "Mribina")
        matches = get_close_matches(query, self.place_names, n=1, cutoff=0.8)
        if matches:
            print(f"[GEO] Fuzzy Match: '{query}' -> '{matches[0]}'")
            return self.places_db[matches[0]]
            
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
    
    def get(self, query):
        if self.cache_collection.count() == 0:
            return None
        
        with self.lock:
            try:
                results = self.cache_collection.query(
                    query_texts=[query],
                    n_results=1
                )
                
                if not results['documents'][0]:
                    return None
                
                distance = results['distances'][0][0]
                similarity = 1 - distance
                
                if similarity >= self.similarity_threshold:
                    metadata = results['metadatas'][0][0]
                    cached_query = results['documents'][0][0]
                    answer = metadata.get('answer', '')
                    places = metadata.get('places', '[]')
                    version = metadata.get('version', 'raw') 
                    
                    try:
                        places_list = json.loads(places)
                    except:
                        places_list = []
                    
                    print(f"[CACHE HIT] Similarity: {similarity:.3f} | Ver: {version} | '{cached_query[:30]}...'")
                    return (answer, places_list, version) 
                
                print(f"[CACHE MISS] Best similarity: {similarity:.3f}")
                return None
                
            except Exception as e:
                print(f"[CACHE ERROR] {e}")
                return None
    
    def set(self, query, answer, places):
        with self.lock:
            try:
                cache_id = f"cache_{hashlib.md5(query.encode()).hexdigest()}_{int(time.time())}"
                self.cache_collection.add(
                    documents=[query],
                    metadatas=[{
                        "answer": answer,
                        "places": json.dumps(places),
                        "timestamp": time.time(),
                        "version": "raw"
                    }],
                    ids=[cache_id]
                )
                print(f"[CACHE SET] Stored: '{query[:50]}...' (id: {cache_id})")
            except Exception as e:
                print(f"[CACHE SET ERROR] {e}")
    
    def update(self, query, enhanced_answer):
        with self.lock:
            try:
                results = self.cache_collection.query(query_texts=[query], n_results=1)
                
                if not results['documents'][0]:
                    return False
                
                distance = results['distances'][0][0]
                similarity = 1 - distance
                
                if similarity >= self.similarity_threshold:
                    cache_id = results['ids'][0][0]
                    old_metadata = results['metadatas'][0][0]
                    
                    self.cache_collection.update(
                        ids=[cache_id],
                        metadatas=[{
                            "answer": enhanced_answer,
                            "places": old_metadata.get('places', '[]'),
                            "timestamp": time.time(),
                            "version": "enhanced"
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
        self.api_key = api_key
        self.cache = cache
        self.config = config
        self.job_queue = Queue()
        self.worker_thread = None
        self.running = False
    
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
            'query': query,
            'raw_facts': raw_facts,
            'raw_answer': raw_answer,
            'timestamp': time.time()
        }
        self.job_queue.put(job)
        print(f"[ENHANCER] Job queued: '{query[:50]}...'")
    
    def _worker_loop(self):
        print("[ENHANCER] Worker loop started")
        while self.running:
            try:
                job = self.job_queue.get(timeout=2)
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
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_alias}:generateContent?key={self.api_key}"
        
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
        self.max_request = max_request
        self.period_seconds = period_seconds
        self.timestamps = deque()

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
        now = time.time()
        expiry = self.timestamps[0] + self.period_seconds
        return max(0, int(expiry - now))


# ============================================================================
# MAIN PIPELINE
# ============================================================================
class Pipeline:
    def __init__(self, dataset_path=str(DATASET_PATH), config_path=str(CONFIG_PATH)):
        
        self.config = self.load_config(config_path)
        print(f"[INFO] Loaded config")
        load_dotenv()
        self.internet_status = True
        self.dataset_path = dataset_path 

        # Initialize rate limiter
        sec_conf = self.config.get('security', {})
        rate_limit_conf = sec_conf.get('rate_limit', {})
        max_req = rate_limit_conf.get('max_request', 5)
        period = rate_limit_conf.get('period_seconds', 60)
        self.limiter = RateLimiter(max_request=max_req, period_seconds=period)
        
        # Setup RAG model
        # Uses config value (e.g., 'all-MiniLM-L6-v2')
        RAG_MODEL = "sentence-transformers/" + self.config['rag']['model_path']
        self.raw_model = SentenceTransformer(RAG_MODEL, device="cpu")
        self.client = chromadb.PersistentClient(path=str(CHROMA_STORAGE))
        self.embedding = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=RAG_MODEL, device="cpu"
        )
        
        # Initialize GeoLookup Engine
        self.geo_engine = GeoLookup(str(GEOJSON_PATH), self.raw_model)
        
        # Initialize semantic cache
        cache_threshold = self.config.get('cache', {}).get('similarity_threshold', 0.88)
        cache_collection_name = self.config.get('cache', {}).get('collection_name', 'query_cache')
        self.semantic_cache = SemanticCache(
            client=self.client,
            embedding_function=self.embedding,
            collection_name=cache_collection_name,
            similarity_threshold=cache_threshold
        )
        
        # Initialize background enhancer
        gemini_key = os.getenv('GEMINI_API_KEY')
        self.enhancer = BackgroundEnhancer(gemini_key, self.semantic_cache, self.config)
        self.enhancer.start()
        
        # Initialize controller and entity extractor
        self.controller = Controller(self.config, self.raw_model)
        self.entity_extractor = EntityExtractor(self.config)
        
        # Profanity filter
        profanity.load_censor_words()
        profanity.add_censor_words(self.config['profanity'])
        
        # Setup ChromaDB collection
        try:
            self.collection = self.client.get_collection(
                name=self.config['rag']['collection_name'],
                embedding_function=self.embedding
            )
            count = self.collection.count()
            print(f"[INFO] Brain loaded. Facts available: {count}")
            if count == 0:
                print("[WARN] Brain is empty! Run 'ingest.py' to read dataset.json.")
        except Exception:
            print("[WARN] Collection not found. Creating new empty one.")
            self.collection = self.client.create_collection(
                name=self.config['rag']['collection_name'],
                embedding_function=self.embedding
            )

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

    # =========================================================
    # UPDATED: Load Dataset (Now saves place_name metadata)
    # =========================================================
    def load_dataset(self, dataset_path):
        try:
            with open(dataset_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"Dataset error: {e}")
            return
        
        documents = []
        metadatas = []
        ids = []
        
        for idx, item in enumerate(data):
            if 'input' not in item or 'output' not in item:
                continue
            
            documents.append(item['input'])
            
            # HERE IS THE KEY CHANGE:
            # We capture 'place_name' and 'location' from the JSON
            meta = {
                "question": item['input'],
                "answer": item['output'],
                "title": item.get('title', 'General Info'),
                "topic": item.get('topic', 'General'),
                "summary_offline": item.get('summary_offline', item['output']),
                "place_name": item.get('place_name', ''), 
                "location": str(item.get('location', '')).upper() 
            }
            
            # Optional filters
            for field in ['budget', 'activities', 'group_type', 'skill_level']:
                if field in item:
                    meta[field] = item[field]
            
            metadatas.append(meta)
            ids.append(str(idx))
        
        if documents:
            self.collection.add(documents=documents, metadatas=metadatas, ids=ids)
            print(f"[INFO] Loaded {len(documents)} Q&A pairs with Metadata Tags")

    # =========================================================
    # REBUILD METHOD (For ingest.py)
    # =========================================================
    def rebuild_index(self):
        print("[INGEST] Wiping old memory...")
        try:
            self.client.delete_collection(name=self.config['rag']['collection_name'])
        except:
            pass
        
        self.collection = self.client.create_collection(
            name=self.config['rag']['collection_name'],
            embedding_function=self.embedding
        )
        
        self.load_dataset(self.dataset_path)
        print(f"[INGEST] SUCCESS.")

    def check_profanity(self, text):
        return profanity.contains_profanity(text)

    def normalize_query(self, text):
        return text.strip().lower()

    def protect(self, user_input):
        if not user_input or not user_input.strip():
            return ""

        try:
            lang = detect(user_input)
            if lang == 'en':
                return user_input
        except LangDetectException:
            pass

        temp = user_input
        markers = {}
        sorted_places = sorted(self.config['protected_places'], key=len, reverse=True)

        for i, place_name in enumerate(sorted_places):
            if re.search(re.escape(place_name), temp, re.IGNORECASE):
                marker = f"__P{i}__"
                markers[marker] = place_name
                pattern = re.compile(re.escape(place_name), re.IGNORECASE)
                temp = pattern.sub(marker, temp)

        try:
            translated = argostranslate.translate.translate(temp, "tl", "en")
            temp = translated
        except Exception as e:
            print(f"[TRANSLATE ERROR] {e}")
            return user_input

        for marker, place_input in markers.items():
            temp = temp.replace(marker, place_input)

        return temp
    
    def extract_keywords(self, question):
        found = []
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
        """Extract place names from text (Legacy scan)"""
        places = self.config['places']
        found = []
        text_lower = text.lower()
        sorted_places = sorted(places, key=len, reverse=True)
        for place in sorted_places:
            pattern = r'\b' + re.escape(place.lower()) + r'\b'
            if re.search(pattern, text_lower) and place not in found:
                found.append(place)
        return found

    def get_place_data(self, found_places):
        """Get coordinates for places (Legacy)"""
        places_data = []
        for place_name in found_places:
            if place_name in self.config['places']:
                place_info = self.config['places'][place_name]
                places_data.append({
                    "name": place_name,
                    "lat": place_info['lat'],
                    "lng": place_info['lng'],
                    "type": place_info['type']
                })
        return places_data
    
    def extract_location_fallback(self, query):
        query_lower = query.lower()
        municipalities = ['virac', 'baras', 'pandan', 'bato', 'gigmoto', 
                        'san andres', 'bagamanoc', 'viga', 'caramoran']
        for place in municipalities:
            patterns = [f" in {place}", f" at {place}", f" near {place}", f"{place} ", f" {place}"]
            for pattern in patterns:
                if pattern in query_lower:
                    return place.title()
        return None


    # ========================================================================
    # MAIN ASK METHOD - INTEGRATED WITH CONTROLLER & EXTRACTOR
    # ========================================================================
    def ask(self, user_input):
        start_time = time.time()

        # 1-5. Same validation logic
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

        normalized = self.normalize_query(user_input)

        # 5. Cache check
        cached = self.semantic_cache.get(normalized)
        if cached:
            answer, places, version = cached
            if version == 'raw': self.enhancer.enqueue(normalized, answer, answer)
            return {"answer": answer, "locations": places}

        # 6. Entity Extraction
        entities = self.entity_extractor.extract(user_input)
        print(f"[ENTITIES] {entities}")

        # 7. Separate towns vs specific places
        target_towns = []
        specific_places_found = []

        for p in entities['places']:
            if p.lower() in self.entity_extractor.municipalities:
                target_towns.append(p.upper())
            else:
                specific_places_found.append(p)

        # Implicit town inference
        if not target_towns and entities.get('inferred_town'):
            target_towns.append(entities['inferred_town'])
            print(f"[PIPELINE] Inferred Town: {target_towns[0]}")

        # 8. Listing detection
        is_browsing = entities.get('is_listing', False)

        # ====================================================================
        # NEW: MULTI-PLACE SEARCH LOGIC (Gemini's "Smart Checklist")
        # ====================================================================

        if specific_places_found and len(specific_places_found) > 1:
            print(f"[MULTI-PLACE] Detected {len(specific_places_found)} places: {specific_places_found}")

            # Search each place separately
            all_answers = []
            all_locations = []
            seen_places = set()

            for place_name in specific_places_found:
                print(f"[SEARCH] Querying: '{place_name}'")

                # Individual search for this place
                place_results = self.collection.query(
                    query_texts=[place_name],  # Search just this place name
                    n_results=2,  # Get top 2 results per place
                    where={"place_name": place_name} if place_name else None
                )

                if place_results['documents'][0]:
                    # Take the best result for this place
                    meta = place_results['metadatas'][0][0]
                    doc_id = place_results['ids'][0][0]
                    doc_text = place_results['documents'][0][0]
                    
                    # --- DEBUG AUDIT FOR MULTI SEARCH ---
                    print(f"\n[DEBUG AUDIT MULTI] Found ID: {doc_id}")
                    print(f"[DEBUG AUDIT MULTI] Meta Name: {meta.get('place_name')}")
                    print(f"[DEBUG AUDIT MULTI] Raw Text: {doc_text[:100]}...\n")
                    # ------------------------------------

                    confidence = 1 - place_results['distances'][0][0]

                    if confidence > 0.30:  # Reasonable threshold
                        answer_text = meta.get('summary_offline', meta['answer'])
                        all_answers.append(answer_text)

                        # Get coordinates
                        place_key = meta.get('place_name')
                        if place_key:
                            loc_data = self.geo_engine.get_coords(place_key)
                            if loc_data and loc_data['name'] not in seen_places:
                                all_locations.append(loc_data)
                                seen_places.add(loc_data['name'])

            # Combine results
            if all_answers:
                raw_answer = " ".join(all_answers)
                final_locations = all_locations
            else:
                raw_answer = "I couldn't find specific information about those places."
                final_locations = []

        # ====================================================================
        # ORIGINAL LOGIC (Single place or browsing)
        # ====================================================================
        else:
            # Determine search parameters
            if specific_places_found:
                is_browsing = False
                n_results = max(3, len(specific_places_found) * 3)
            else:
                n_results = 15 if is_browsing else 3

            print(f"[PIPELINE] Mode: {'BROWSING' if is_browsing else 'SPECIFIC'} | N={n_results}")

            # Build filter
            where_filter = None
            if specific_places_found:
                if len(specific_places_found) == 1:
                    where_filter = {"place_name": specific_places_found[0]}
                else:
                    where_filter = {"$or": [{"place_name": p} for p in specific_places_found]}
            elif target_towns:
                if len(target_towns) == 1:
                    where_filter = {"location": target_towns[0]}
                else:
                    where_filter = {"$or": [{"location": t} for t in target_towns]}

            # Query
            results = self.collection.query(
                query_texts=[user_input],
                n_results=n_results,
                where=where_filter
            )

            answers_found = []
            final_locations = []
            seen_places = set()

            if results['documents'][0]:
                for i, doc in enumerate(results['documents'][0]):
                    meta = results['metadatas'][0][i]
                    name = meta.get('place_name', '').lower()
                    text = meta.get('summary_offline', '').lower()
                    
                    # --- DEBUG AUDIT FOR SINGLE SEARCH ---
                    # This allows you to trace why it selected a specific document
                    print(f"\n[DEBUG AUDIT SINGLE] ID: {results['ids'][0][i]}")
                    print(f"[DEBUG AUDIT SINGLE] Name: {meta.get('place_name')}")
                    print(f"[DEBUG AUDIT SINGLE] Text: {meta.get('summary_offline', '')[:50]}...") 

                    if entities['activities']:
                        # Define keywords that MUST appear for specific activities
                        required_keywords = []
                        if 'beaches' in entities['activities']:
                            required_keywords = ['beach', 'resort', 'island', 'cove', 'shore']
                        
                        # If we have requirements, check if the result passes
                        if required_keywords:
                            # Check if ANY required keyword is in the Name or Text
                            is_relevant = any(kw in name or kw in text for kw in required_keywords)
                            if not is_relevant:
                                print(f"[FILTERED OUT] {meta.get('place_name')} (Not a beach)")
                                continue

                    confidence = 1 - results['distances'][0][i]

                    # Filtering logic
                    if specific_places_found:
                        if meta.get('place_name') not in specific_places_found:
                            continue
                    else:
                        threshold = 0.30 if is_browsing else 0.40
                        if confidence < threshold: 
                            continue
                        if target_towns and meta.get('location') not in target_towns:
                            continue
                        
                    answers_found.append(meta.get('summary_offline', meta['answer']))

                    # Get coordinates
                    place_key = meta.get('place_name')
                    if place_key:
                        loc_data = self.geo_engine.get_coords(place_key)
                        if loc_data and loc_data['name'] not in seen_places:
                            final_locations.append(loc_data)
                            seen_places.add(loc_data['name'])

            # Format answer
            if not answers_found:
                town_str = target_towns[0].title() if target_towns else "that area"
                raw_answer = f"I'm sorry, I don't have information on that in {town_str}." if target_towns else "I don't have information on that."
                final_locations = []
            else:
                if is_browsing:
                    raw_answer = f"Here are the options I found: " + ", ".join([l['name'] for l in final_locations[:5]]) + "."
                else:
                    raw_answer = " ".join(answers_found[:2])

        # ====================================================================
        # FINAL STEPS
        # ====================================================================

        # Cache and enhance
        self.semantic_cache.set(normalized, raw_answer, final_locations)
        if "don't have information" not in raw_answer.lower() and not is_browsing:
            self.enhancer.enqueue(normalized, raw_answer, raw_answer)

        # Format for frontend
        formatted_places = []
        for p in final_locations:
            formatted_places.append({
                "name": p['name'],
                "coordinates": p['coordinates'],
                "type": p['type'],
                "municipality": p['municipality']
            })

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
            
            # Updated to handle Dictionary return
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