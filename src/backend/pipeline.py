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
        if not place_name:
            return None
        query = place_name.lower().strip()

        exact = self.places_db.get(query)
        if exact:
            print(f"[GEO] Exact Match: '{place_name}'")
            return exact

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

    def update(self, query, enhanced_answer, places=None):
        # Guard 1 — never write a non-answer to cache.
        # Catches: exact "no answer", empty string, and polite refusals where
        # Gemini admits it couldn't find relevant info in the candidates.
        NO_ANSWER_SIGNALS = [
            'no answer',
            'do not mention',
            'does not mention',
            "don't mention",
            'do not provide',
            'does not provide',
            'no information about',
            'no specific information',
            'cannot provide',
            'not mention any',
        ]
        cleaned = enhanced_answer.strip().lower() if enhanced_answer else ''
        if not cleaned or any(sig in cleaned for sig in NO_ANSWER_SIGNALS):
            print(f"[CACHE] Rejected — Gemini non-answer detected, cache unchanged")
            return False

        with self.lock:
            try:
                results = self.cache_collection.query(query_texts=[query], n_results=1)

                if not results['documents'][0]:
                    return False

                distance   = results['distances'][0][0]
                similarity = 1 - distance

                if similarity >= self.similarity_threshold:
                    cache_id      = results['ids'][0][0]
                    old_metadata  = results['metadatas'][0][0]
                    old_version   = old_metadata.get('version', 'raw')
                    old_answer    = old_metadata.get('answer', '')
                    is_t3_redirect = 'tourism office in Virac' in old_answer

                    # Guard 2 — T1 lock.
                    # 'raw'      → always allow Gemini to enhance
                    # 'enhanced' + T3 redirect → allow (recovering a dead end)
                    # 'enhanced' + real answer → LOCKED, Gemini's noisy pool cannot improve it
                    if old_version == 'enhanced' and not is_t3_redirect:
                        print(f"[CACHE] Locked — already enhanced with real answer, skipping")
                        return False

                    self.cache_collection.update(
                        ids=[cache_id],
                        metadatas=[{
                            "answer":    enhanced_answer,
                            "places":    json.dumps(places) if places is not None
                                         else old_metadata.get('places', '[]'),
                            "timestamp": time.time(),
                            "version":   "enhanced"
                        }]
                    )
                    print(f"[CACHE UPDATED] Was '{old_version}' → 'enhanced': '{query[:50]}...'")
                    return True
                return False
            except Exception as e:
                print(f"[CACHE UPDATE ERROR] {e}")
                return False


# ============================================================================
# BACKGROUND ENHANCER
# ============================================================================
class BackgroundEnhancer:
    def __init__(self, api_key, cache, config, geo_db=None):
        self.api_key   = api_key
        self.cache     = cache
        self.config    = config
        self.geo_db    = geo_db or {}   # keyed by lowercase place name → {name, coordinates, type, municipality}
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

    def enqueue(self, query, raw_facts, raw_answer, candidates=None, rag_tier='T3'):
        job = {
            'query':      query,
            'raw_facts':  raw_facts,
            'raw_answer': raw_answer,
            'candidates': candidates or [],
            'rag_tier':   rag_tier,
            'timestamp':  time.time()
        }
        self.job_queue.put(job)
        print(f"[ENHANCER] Queued | tier={rag_tier} | "
              f"candidates={len(candidates or [])} | '{query[:50]}...'")

    def _worker_loop(self):
        print("[ENHANCER] Worker loop started")
        while self.running:
            try:
                job      = self.job_queue.get(timeout=2)
                enhanced = self._enhance_with_gemini(job)

                if enhanced:
                    # Resolve pins from Gemini's text — these replace RAG pins entirely
                    # since Gemini's answer is more accurate than what survived the filters.
                    resolved = self._resolve_places_from_enhanced(enhanced, job.get('candidates', []))
                    success  = self.cache.update(job['query'], enhanced,
                                                 places=resolved if resolved else None)
                    print(f"[ENHANCER] ✓ Cache update: {success}"
                          + (f" | {len(resolved)} pins resolved" if resolved else " | no pins resolved"))
                else:
                    # None = either "no answer" (discard silently) or API failure.
                    # _enhance_with_gemini logs the reason itself.
                    print(f"[ENHANCER] ✗ No enhancement produced")

                self.job_queue.task_done()
            except Exception as e:
                if "Empty" not in str(type(e).__name__):
                    print(f"[ENHANCER ERROR] Loop crashed: {e}")
                    time.sleep(60)
                continue

    def _resolve_places_from_enhanced(self, enhanced_text, candidates):
        """
        Resolve geo pins from the places Gemini actually mentioned in its response.
        Replaces RAG pins entirely — Gemini's answer is more accurate than filter artifacts.
        Place names are matched verbatim (prompt instructs Gemini to copy names from brackets).
        Only entries with valid coordinates in geo_db are returned.
        """
        if not self.geo_db or not candidates:
            return []

        enhanced_lower = enhanced_text.lower()
        seen   = set()
        places = []

        for c in candidates:
            pname = c.get('place', '').strip()  # candidates use 'place' key, not 'place_name'
            if not pname or pname in seen:
                continue
            if pname.lower() in enhanced_lower:
                seen.add(pname)
                geo = self.geo_db.get(pname.lower())
                if geo and geo.get('coordinates'):
                    places.append({
                        'name':         geo['name'],
                        'coordinates':  geo['coordinates'],
                        'type':         geo.get('type', 'PLACE'),
                        'municipality': geo.get('municipality', '')
                    })

        return places

    # Signals that mean Gemini/Groq found nothing useful — discard, don't overwrite cache.
    NO_ANSWER_SIGNALS = [
        'no answer',
        'do not mention',
        'does not mention',
        "don't mention",
        'do not provide',
        'does not provide',
        'no information about',
        'no specific information',
        'cannot provide',
        'not mention any',
    ]

    def _build_prompt(self, job):
        """Build the prompt string and facts_text from a job dict."""
        candidates = job.get('candidates', [])
        rag_tier   = job.get('rag_tier', 'T3')

        if candidates:
            facts_text = "\n".join([
                f"- [{c.get('place', 'General')}]: {c.get('text', '')}"
                for c in candidates if c.get('text')
            ])
            print(f"[ENHANCER] Candidate pool | tier={rag_tier} | count={len(candidates)}")
        else:
            facts_text = job['raw_facts']
            print(f"[ENHANCER] No pool — raw_facts fallback | tier={rag_tier}")

        gemini_cfg   = self.config.get('gemini', {})
        template_key = ('enhancer_prompt_template'
                        if 'enhancer_prompt_template' in gemini_cfg
                        else 'prompt_template')
        raw_template = gemini_cfg[template_key]

        try:
            return raw_template.format(question=job['query'], candidates=facts_text)
        except KeyError:
            return raw_template.format(question=job['query'], fact=facts_text)

    def _is_non_answer(self, text):
        """Return True if the LLM admitted it couldn't answer — discard these."""
        return any(sig in text.lower() for sig in self.NO_ANSWER_SIGNALS)

    def _call_gemini(self, prompt):
        """
        Call Gemini. Model is read from config gemini.model_name.
        Returns (text, retry_after_seconds).
        retry_after_seconds is set on 429, None otherwise.
        """
        gemini_cfg = self.config.get('gemini', {})
        # Strip "models/" prefix if present — the URL builder adds the path itself
        model = gemini_cfg.get('model_name', 'gemini-2.5-flash').replace('models/', '')
        url   = (f"https://generativelanguage.googleapis.com/v1beta/models/"
                 f"{model}:generateContent?key={self.api_key}")
        payload = {
            'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': {'temperature': 0.1}
        }
        try:
            resp = requests.post(url, json=payload,
                                 headers={'Content-Type': 'application/json'}, timeout=15)
            if resp.status_code == 200:
                text = resp.json()['candidates'][0]['content']['parts'][0]['text'].strip()
                return text, None
            elif resp.status_code == 429:
                # Read retryDelay from the error body if present
                retry_after = 60  # safe default
                try:
                    details = resp.json().get('error', {}).get('details', [])
                    for d in details:
                        if d.get('@type', '').endswith('RetryInfo'):
                            delay_str = d.get('retryDelay', '60s')
                            retry_after = int(delay_str.replace('s', '').strip().split('.')[0])
                            break
                except Exception:
                    pass
                print(f"[ENHANCER] Gemini 429 — retry after {retry_after}s")
                return None, retry_after
            else:
                print(f"[ENHANCER ERROR] Gemini {resp.status_code}: {resp.text[:200]}")
                return None, None
        except Exception as e:
            print(f"[ENHANCER ERROR] Gemini network failure: {e}")
            return None, None

    def _call_groq(self, prompt):
        """
        Call Groq llama-3.1-8b-instant as fallback. Returns text or None.
        Uses OpenAI-compatible chat completions endpoint.
        """
        groq_key = os.getenv('GROQ_API_KEY')
        if not groq_key:
            print("[ENHANCER] Groq fallback skipped — GROQ_API_KEY not set")
            return None

        url     = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            'Content-Type':  'application/json',
            'Authorization': f'Bearer {groq_key}',
        }
        payload = {
            'model':       self.config.get('groq', {}).get('model_name', 'llama-3.1-8b-instant'),
            'messages':    [{'role': 'user', 'content': prompt}],
            'temperature': 0.1,
            'max_tokens':  512,
        }
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=15)
            if resp.status_code == 200:
                text = resp.json()['choices'][0]['message']['content'].strip()
                print(f"[ENHANCER] ✓ Provider=GROQ | answer={len(text)} chars")
                return text
            else:
                print(f"[ENHANCER ERROR] Groq {resp.status_code}: {resp.text[:200]}")
                return None
        except Exception as e:
            print(f"[ENHANCER ERROR] Groq network failure: {e}")
            return None

    def _enhance_with_gemini(self, job):
        """
        Primary: Gemini 2.5 Flash.
        Fallback: Groq llama-3.1-8b-instant (if Gemini hits 429).
        Both checked against NO_ANSWER_SIGNALS before returning.
        """
        if not self.api_key:
            # No Gemini key — try Groq directly
            print("[ENHANCER] No GEMINI_API_KEY — using Groq directly")
            prompt = self._build_prompt(job)
            text   = self._call_groq(prompt)
            if text and not self._is_non_answer(text):
                return text
            return None

        prompt = self._build_prompt(job)

        # ── Try Gemini first ──────────────────────────────────────────────
        text, retry_after = self._call_gemini(prompt)

        if text:
            if self._is_non_answer(text):
                print("[ENHANCER] ✗ Gemini non-answer — discarding, cache unchanged")
                return None
            print(f"[ENHANCER] ✓ Provider=GEMINI | answer={len(text)} chars")
            return text

        # ── Gemini failed — decide whether to try Groq ───────────────────
        if retry_after is not None:
            # 429 rate limit — wait the requested delay then try Groq
            wait = min(retry_after, 120)   # cap at 2 min so queue doesn't freeze
            print(f"[ENHANCER] Waiting {wait}s before Groq fallback...")
            time.sleep(wait)
            text = self._call_groq(prompt)
        else:
            # Non-429 error (network, 500, etc.) — try Groq immediately
            text = self._call_groq(prompt)

        if text:
            if self._is_non_answer(text):
                print("[ENHANCER] Groq non-answer — discarding, cache unchanged")
                return None 
            return text

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
        self.enhancer = BackgroundEnhancer(gemini_key, self.semantic_cache, self.config,
                                           geo_db=self.geo_engine.places_db)
        self.enhancer.start()

        # Controller and entity extractor
        self.controller       = Controller(self.config, self.raw_model)
        self.entity_extractor = EntityExtractor(self.config)

        self.session_context = {
            "last_place":    None,
            "last_places":   [],
            "last_location": None,
            "active_pin":    None
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

        rag_conf = self.config.get('rag', {})
        self.confidence_t1 = rag_conf.get('confidence_threshold_t1', 0.72)
        self.confidence_t2 = rag_conf.get('confidence_threshold_t2', 0.60)
        self.browsing_min  = rag_conf.get('browsing_min_confidence',  0.30)
        self.specific_min  = rag_conf.get('specific_min_confidence',  0.40)
        print(f"[INFO] Confidence tiers — T1≥{self.confidence_t1} | "
            f"T2≥{self.confidence_t2} | "
            f"browsing_min={self.browsing_min} | specific_min={self.specific_min}")

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
                "activities_tag":  normalize_activities(item.get('activities', [])),
                "skill_level":     str(item.get('skill_level', '')).lower(),
                "group_type":      str(item.get('group_type', '')).lower(),
            }

            metadatas.append(meta)
            ids.append(str(idx))

        if documents:
            self.collection.add(documents=documents, metadatas=metadatas, ids=ids)
            print(f"[INFO] Loaded {len(documents)} Q&A pairs with Metadata Tags")

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

    def _passes_activity_filter(self, meta, required_keywords, strict=False):
        if not required_keywords:
            return True

        name           = meta.get('place_name', '').lower()
        activities_tag = meta.get('activities_tag', '').lower()

        # strict=True (browsing mode): check activities_tag and place name only.
        # A place must BE that type, not merely mention it in its summary text.
        # This prevents "Virac Town Center" winning a hotel search just because
        # its summary says "hotels are available in the town center".
        #
        # strict=False (specific mode): also check summary text, which is useful
        # when looking up a specific place that may describe related activities.
        if strict:
            is_relevant = any(
                kw in name or kw in activities_tag
                for kw in required_keywords
            )
        else:
            text = meta.get('summary_offline', '').lower()
            is_relevant = any(
                kw in name or kw in text or kw in activities_tag
                for kw in required_keywords
            )

        if not is_relevant:
            print(f"[FILTER] ✗ Skipped '{meta.get('place_name', 'Unknown')}' — "
                  f"no match for keywords: {required_keywords[:5]}")

        return is_relevant

    # ========================================================================
    # CONTEXT RESOLUTION
    # ========================================================================
    def _resolve_context(self, entities, query_lower):
        # A query needs context only when it is incomplete on its own:
        # no places, no activities, no inferred town.
        # Word-matching on REFERENCE_WORDS was wrong because:
        #   "are there jellyfish" → existential 'there', complete query
        #   "how to go there"    → referential 'there', incomplete query
        # Entity completeness catches the difference naturally.
        query_is_incomplete = (
            not entities['places'] and
            not entities['activities'] and
            not entities.get('inferred_town')
        )
        # Secondary guard: "is/are/was/were there X" is existential — asking
        # if something exists, not referencing a previous place.
        is_existential = bool(
            re.search(r'\b(is|are|was|were)\s+there\b', query_lower)
        )
        has_place_already = bool(entities['places'])

        if not query_is_incomplete or has_place_already or is_existential:
            return entities, None, None

        if not self.session_context['last_place']:
            return entities, None, None

        context_note = None
        clarification = None

        if self.session_context['active_pin']:
            resolved = self.session_context['active_pin']
            print(f"[CONTEXT] Scenario B — using active pin: '{resolved}'")
            entities['places'].append(resolved)

        elif len(self.session_context['last_places']) == 1:
            resolved = self.session_context['last_places'][0]
            print(f"[CONTEXT] Scenario A — single last place: '{resolved}'")
            entities['places'].append(resolved)

        else:
            last_places = self.session_context['last_places']

            if len(last_places) <= 3:
                entities['places'].extend(last_places)
                print(f"[CONTEXT] Scenario C — small list ({len(last_places)}), querying all")
                context_note = None
                clarification = None
            else:
                place_list = ", ".join(last_places[:5])
                if len(last_places) > 5:
                    place_list += f" and {len(last_places) - 5} more"
                clarification = f"Which place are you asking about? You can say the name or click a pin on the map. I mentioned: {place_list}."
                return entities, None, clarification

        return entities, context_note, None

    def _update_session_context(self, final_locations, specific_places_found, target_towns, displayed_count=None):
        if final_locations:
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
    # CONTEXT QUERY REWRITER
    # ========================================================================
    def _rewrite_context_query(self, user_input, resolved_place):
        """
        Replaces vague reference words with the actual resolved place name
        so ChromaDB gets a semantically rich query instead of "how to go there".

        "how to go there"          → "how to go to Puraran Beach"
        "how much is the fee doon" → "how much is the fee Binurong Point"
        "is it safe"               → "is Puraran Beach safe"
        """
        query_lower = user_input.lower()
        for ref_word in self.REFERENCE_WORDS:
            pattern = r'\b' + re.escape(ref_word) + r'\b'
            if re.search(pattern, query_lower):
                rewritten = re.sub(pattern, resolved_place, user_input,
                                   count=1, flags=re.IGNORECASE)
                print(f"[CONTEXT] Query rewritten: '{user_input}' → '{rewritten}'")
                return rewritten
        # Fallback: append place name if no reference word found to replace
        rewritten = f"{user_input} {resolved_place}"
        print(f"[CONTEXT] Query appended: '{rewritten}'")
        return rewritten

    # ========================================================================
    # MULTI-ACTIVITY HANDLER
    # ========================================================================
    def _handle_multi_activity(self, activities, target_towns, user_input):
        """
        Runs one focused sub-query per activity and builds a grouped answer.

        "i want to surf then eat" → surfing query + dining query separately.
        Each activity gets its best-matching doc. Returns:
        "For surfing: [answer]. For food and dining: [answer]."
        """
        ACTIVITY_LABELS = {
            'surfing':       'surfing',
            'dining':        'food and dining',
            'accommodation': 'places to stay',
            'swimming':      'swimming',
            'hiking':        'hiking and nature',
            'sightseeing':   'sightseeing',
            'shopping':      'shopping',
            'beaches':       'beaches',
            'transport':     'getting around',
            'budget':        'budget tips',
            'safety':        'safety',
            'planning':      'trip planning',
            'photography':   'photography spots',
            'nightlife':     'nightlife',
        }

        where_filter = None
        if target_towns:
            where_filter = ({"location": target_towns[0]}
                            if len(target_towns) == 1
                            else {"$or": [{"location": t} for t in target_towns]})

        grouped_answers = []
        all_locations   = []
        seen_places     = set()
        top_confidence  = 0.0
        multi_gemini_pool = []   # collects loose candidates across all sub-queries

        for activity in activities:
            keywords       = self._build_required_keywords([activity])
            activity_query = f"{activity} catanduanes"
            if target_towns:
                activity_query += f" {target_towns[0].lower()}"

            print(f"[MULTI-ACT] Querying activity='{activity}' → '{activity_query}'")

            results = self.collection.query(
                query_texts=[activity_query],
                n_results=15,
                where=where_filter
            )

            if not results['documents'][0]:
                print(f"[MULTI-ACT] No results for '{activity}'")
                continue

            # Collect loose candidates for Gemini pool (no activity filter, conf ≥ browsing_min)
            for i, meta in enumerate(results['metadatas'][0]):
                conf = 1 - results['distances'][0][i]
                if conf >= self.browsing_min:
                    fact_text = meta.get('summary_offline', meta.get('answer', ''))
                    if fact_text:
                        multi_gemini_pool.append({
                            'place': meta.get('place_name', ''),
                            'text':  fact_text,
                            'conf':  round(conf, 3)
                        })

            best_meta = None
            best_conf = 0.0
            for i, meta in enumerate(results['metadatas'][0]):
                conf = 1 - results['distances'][0][i]
                if conf < self.browsing_min:
                    continue
                if not self._passes_activity_filter(meta, keywords):
                    continue
                if conf > best_conf:
                    best_conf = conf
                    best_meta = meta

            if not best_meta:
                print(f"[MULTI-ACT] No passing doc for '{activity}'")
                continue

            top_confidence = max(top_confidence, best_conf)
            label          = ACTIVITY_LABELS.get(activity, activity)
            answer_text    = best_meta.get('summary_offline', best_meta.get('answer', ''))
            grouped_answers.append(f"For {label}: {answer_text}")

            place_key = best_meta.get('place_name', '').strip()
            if place_key and place_key not in seen_places:
                loc_data = self.geo_engine.get_coords(place_key)
                if loc_data:
                    all_locations.append(loc_data)
                    seen_places.add(place_key)

            print(f"[MULTI-ACT] ✓ '{activity}' → "
                  f"'{best_meta.get('place_name','general')}' conf={best_conf:.3f}")

        raw_answer = (" ".join(grouped_answers)
                      if grouped_answers else "I don't have information on that.")
        return raw_answer, all_locations, top_confidence, multi_gemini_pool

    # ========================================================================
    # ITINERARY GENERATOR
    # ========================================================================
    def generate_itinerary(self, days: int, activities: list,
                           group_type: str, budget: str) -> dict:
        """
        Builds a day-by-day itinerary from RAG facts only. No Gemini.

        Parameters
        ----------
        days        : 1–7
        activities  : list of activity category strings e.g. ['surfing', 'hiking']
        group_type  : 'solo' | 'couple' | 'family' | 'group'
        budget      : 'budget' | 'mid' | 'luxury'

        Returns
        -------
        {
            "itinerary": [{"day": 1, "label": "...", "slots": [...]}],
            "notes":     ["..."],
            "locations": [...]
        }

        Known limitations:
        - No travel-time sequencing between slots.
        - Budget filter biases queries but doesn't guarantee price-matched results.
        - Sparse dataset coverage for days 5+ may repeat activity categories.
        - 'luxury' options are limited on the island; mid-range is the ceiling.
        """
        print(f"[ITINERARY] Generating {days}-day plan | "
              f"activities={activities} | group={group_type} | budget={budget}")

        DAY1_SLOTS = [
            ('Morning',   'transport',     'Getting to Catanduanes'),
            ('Afternoon', 'accommodation', 'Checking in'),
            ('Evening',   'dining',        'First dinner'),
        ]

        user_activities = activities if activities else ['sightseeing']

        # 2-day edge case: no middle days, so inject main activity into last day
        LAST_DAY_SLOTS = [
            ('Morning',   user_activities[0] if days == 2 else 'sightseeing',
                          'Last morning exploration'),
            ('Afternoon', 'transport', 'Heading home'),
            ('Evening',   None,        None),
        ]

        BUDGET_MODIFIER = {
            'budget':  'cheap affordable budget',
            'mid':     'mid-range comfortable',
            'luxury':  'luxury premium',
        }
        GROUP_HINT = {
            'solo':   'solo traveler',
            'couple': 'couple romantic',
            'family': 'family kids children',
            'group':  'group friends barkada',
        }
        budget_hint = BUDGET_MODIFIER.get(budget, '')
        group_hint  = GROUP_HINT.get(group_type, '')

        def fetch_best_fact(activity_category, extra_hint='', exclude_places=None):
            if exclude_places is None:
                exclude_places = set()
            keywords  = self._build_required_keywords([activity_category])
            search_q  = f"{activity_category} catanduanes {extra_hint}".strip()
            print(f"[ITINERARY] Fetching: '{search_q}'")
            results = self.collection.query(query_texts=[search_q], n_results=20)
            if not results['documents'][0]:
                return None, None
            for i, meta in enumerate(results['metadatas'][0]):
                conf       = 1 - results['distances'][0][i]
                place_name = meta.get('place_name', '').strip()
                if conf < self.browsing_min:
                    break
                if place_name in exclude_places:
                    continue
                if not self._passes_activity_filter(meta, keywords):
                    continue
                fact = meta.get('summary_offline', meta.get('answer', ''))
                if fact:
                    print(f"[ITINERARY] ✓ '{place_name}' conf={conf:.3f}")
                    return fact, place_name
            return None, None

        itinerary_days = []
        all_locations  = []
        seen_places    = set()
        notes          = []

        for day_num in range(1, days + 1):
            is_first = (day_num == 1)
            is_last  = (day_num == days) and (days > 1)

            if is_first:
                slot_defs = DAY1_SLOTS
                day_label = "Arrival & Virac Orientation"
            elif is_last:
                slot_defs = LAST_DAY_SLOTS
                day_label = "Departure Day"
            else:
                act_index = (day_num - 2) % len(user_activities)
                main_act  = user_activities[act_index]
                day_label = f"Day {day_num} — {main_act.title()} & Exploration"
                slot_defs = [
                    ('Morning',   main_act,      f'Main activity: {main_act}'),
                    ('Afternoon', 'sightseeing', 'Afternoon sightseeing'),
                    ('Evening',   'dining',       'Dinner'),
                ]

            slots = []
            for time_label, activity_cat, _ in slot_defs:
                if activity_cat is None:
                    continue
                extra = budget_hint
                if activity_cat == 'accommodation':
                    extra = f"{budget_hint} {group_hint}".strip()
                fact, place_name = fetch_best_fact(activity_cat, extra, seen_places)
                if fact is None:
                    continue
                slots.append({"time": time_label, "fact": fact,
                               "place": place_name or "General info"})
                if place_name:
                    seen_places.add(place_name)
                    if place_name not in {p['name'] for p in all_locations}:
                        loc = self.geo_engine.get_coords(place_name)
                        if loc:
                            all_locations.append(loc)

            if slots:
                itinerary_days.append({"day": day_num, "label": day_label,
                                       "slots": slots})

        notes.append("Travel times between places are not included — "
                     "verify distances with your accommodation or a local guide.")
        if days > 4:
            notes.append("Activity variety may repeat for longer trips — "
                         "dataset coverage is most detailed for 1–4 day visits.")
        if budget == 'luxury':
            notes.append("Luxury options in Catanduanes are limited — "
                         "mid-range resorts may be the best available.")
        if group_type == 'family':
            notes.append("Twin Rock Beach Resort is the most family-friendly option.")

        formatted_locations = [
            {"name": p['name'], "coordinates": p['coordinates'],
             "type": p['type'], "municipality": p['municipality']}
            for p in all_locations
        ]

        print(f"[ITINERARY] Done — {len(itinerary_days)} days, "
              f"{sum(len(d['slots']) for d in itinerary_days)} slots, "
              f"{len(formatted_locations)} map pins")

        return {"itinerary": itinerary_days, "notes": notes,
                "locations": formatted_locations}

    # ========================================================================
    # P5 HELPER: THREE-TIER CONFIDENCE FRAMING
    # ========================================================================
    def _apply_confidence_tier(self, raw_answer, top_confidence, is_browsing, entities):
        """
        Wraps raw_answer with appropriate framing based on RAG confidence score.

        Tiers (derived from calibrate.py ground-truth run on 57 queries):
          T1 >= 0.72 → Full trust. Answer presented as authoritative.
          T2  0.60-0.71 → Qualified. Prefix added; price disclaimer if budget query.
          T3 < 0.60  → Hard stop. Generic redirect returned.

        Browsing results (lists) are never modified — they come from ranked
        aggregation across many docs so a single confidence number is misleading.
        "I don't have information" responses are also never modified.
        """
        # Never modify browsing results or existing "no answer" responses
        if is_browsing:
            return raw_answer
        if "don't have information" in raw_answer.lower():
            return raw_answer
        if "i'm sorry" in raw_answer.lower() and "don't have" in raw_answer.lower():
            return raw_answer

        is_budget_query = 'budget' in entities.get('activities', [])

        if top_confidence >= self.confidence_t1:
            # T1 — Full confidence, no modification needed
            print(f"[TIER] T1 ({top_confidence:.3f} >= {self.confidence_t1}) — authoritative answer")
            return raw_answer

        elif top_confidence >= self.confidence_t2:
            # T2 — Qualified answer
            print(f"[TIER] T2 ({top_confidence:.3f}, {self.confidence_t2}–{self.confidence_t1}) — qualified answer")
            framed = "Based on available records, " + raw_answer
            if is_budget_query:
                framed += " Please verify prices directly on-site as they may have changed."
            return framed

        else:
            # T3 — Hard stop, score too low to trust
            print(f"[TIER] T3 ({top_confidence:.3f} < {self.confidence_t2}) — hard stop, redirecting")
            return ("I don't have reliable information on that yet. "
                    "You may want to ask at the local tourism office in Virac "
                    "or a nearby guide for accurate details.")

    # ========================================================================
    # MAIN ASK METHOD
    # ========================================================================
    def ask(self, user_input, active_pin=None):
        start_time = time.time()

        if active_pin is not None:
            self.session_context['active_pin'] = active_pin
            print(f"[CONTEXT] Active pin from frontend: '{active_pin}'")
        else:
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

        # ── Context resolution ────────────────────────────────────────────
        entities, context_note, clarification = self._resolve_context(entities, query_lower)

        if clarification:
            print(f"[CONTEXT] Scenario C trigger -> Asking for clarification.")
            return {"answer": clarification, "locations": []}

        if context_note:
            print(f"[CONTEXT] Will prepend assumption note for: '{context_note}'")

        # ── Budget signal override ─────────────────────────────────────────
        BUDGET_SIGNALS = ['how much', 'magkano', 'cost', 'price', 'fee', 'entrance',
                          'bayad', 'libre', 'expensive', 'cheap', 'afford']
        if any(re.search(r'\b' + re.escape(sig) + r'\b', query_lower) for sig in BUDGET_SIGNALS):
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

        # ── Activity keywords ──────────────────────────────────────────────
        required_keywords = []
        if entities.get('activities'):
            required_keywords = self._build_required_keywords(entities['activities'])
            print(f"[FILTER] Activity filter active. Keywords: {required_keywords}")
        else:
            print(f"[FILTER] No activity filter active — all document types will pass")

        # ── P3: Track top RAG confidence across all paths ─────────────────
        top_rag_confidence = 0.0

        # gemini_pool: loose candidate docs collected from the single/browsing
        # path for the background enhancer. Empty for multi-activity/multi-place
        # (those paths use raw_answer as fallback).
        gemini_pool  = []
        # answers_found initialized here so is_vague_query check in FINAL STEPS
        # works regardless of which path ran.
        answers_found = []

        # ── Multi-activity detection ──────────────────────────────────────
        # "i want to surf then eat" → 2 activities, no specific place
        # Route to _handle_multi_activity which runs one sub-query per intent.
        is_multi_activity = (
            len(entities.get('activities') or []) > 1
            and not specific_places_found
        )
        if is_multi_activity:
            print(f"[PIPELINE] Multi-activity query — activities={entities['activities']}")

        # ====================================================================
        # MULTI-ACTIVITY SEARCH LOGIC
        # ====================================================================
        if is_multi_activity:
            raw_answer, final_locations, top_rag_confidence, multi_pool = self._handle_multi_activity(
                activities   = entities['activities'],
                target_towns = target_towns,
                user_input   = user_input
            )
            gemini_pool.extend(multi_pool)
            print(f"[MULTI-ACT] Gemini pool from sub-queries: {len(multi_pool)} docs")

        # ====================================================================
        # MULTI-PLACE SEARCH LOGIC
        # ====================================================================
        elif specific_places_found and len(specific_places_found) > 1:
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

                    # P2: use config-driven browsing_min (was hardcoded 0.30)
                    if confidence > self.browsing_min:
                        # P4: track highest confidence seen in multi-place path
                        top_rag_confidence = max(top_rag_confidence, confidence)
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
            activity_count = max(1, len(entities.get('activities') or []))
            scaled_specific_n = 5 * activity_count

            if specific_places_found:
                is_browsing = False
                n_results   = max(40, scaled_specific_n, len(specific_places_found) * 3)
            else:
                n_results = 100 if is_browsing else max(40, scaled_specific_n)

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

            # When context resolution injected a place from a vague query
            # ("how to go there" → "Binurong Point"), rewrite the query so
            # ChromaDB gets "how to go to Binurong Point" instead of
            # "how to go there" which scores ~0.35 against transport docs.
            is_context_query = (
                not entities['places']
                and specific_places_found
                and self.session_context.get('last_place')
            )
            if is_context_query and specific_places_found:
                search_query = self._rewrite_context_query(
                    user_input, specific_places_found[0])
            else:
                search_query = user_input

            results = self.collection.query(
                query_texts=[search_query],
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

                    # Collect for Gemini pool — town-scoped, NO activity filter.
                    # Gemini picks relevant facts itself from this wider set.
                    # Runs BEFORE the strict RAG filter so T3 dead-end queries
                    # still build a pool even when nothing passes RAG threshold.
                    if confidence >= self.browsing_min:
                        if not target_towns or meta.get('location') in target_towns:
                            fact_text = meta.get('summary_offline', meta.get('answer', ''))
                            if fact_text:
                                gemini_pool.append({
                                    'place': meta.get('place_name', ''),
                                    'text':  fact_text,
                                    'conf':  round(confidence, 3)
                                })
                    # NOTE: no continue — doc still goes through strict RAG filter below

                    if specific_places_found:
                        if meta.get('place_name') not in specific_places_found:
                            print(f"[FILTER] ✗ Skipped '{place_name_tag}' — not in specific_places_found")
                            continue
                    else:
                        if not self._passes_activity_filter(meta, required_keywords, strict=is_browsing):
                            continue
                        # P2: replaced hardcoded 0.30/0.40 with config-driven values
                        threshold = self.browsing_min if is_browsing else self.specific_min
                        if confidence < threshold:
                            print(f"[FILTER] ✗ Skipped '{place_name_tag}' — "
                                f"confidence {confidence:.3f} < threshold {threshold}")
                            continue
                        if target_towns and meta.get('location') not in target_towns:
                            print(f"[FILTER] ✗ Skipped '{place_name_tag}' — "
                                f"location '{meta.get('location')}' not in {target_towns}")
                            continue

                    print(f"[FILTER] ✓ Kept '{place_name_tag}'")

                    # P4: record confidence of the first kept doc (primary answer source)
                    if top_rag_confidence == 0.0:
                        top_rag_confidence = confidence
                        print(f"[TIER] Primary doc confidence captured: {confidence:.3f}")

                    place_key = meta.get('place_name', '').strip()
                    if not place_key:
                        print(f"[FILTER] ✓ Kept (no pin) — general/province-level entry")
                        answers_found.append(meta.get('summary_offline', meta['answer']))
                        continue

                    is_general_query = not specific_places_found and not target_towns
                    if is_general_query and answers_found:
                        print(f"[FILTER] ✓ Kept text only (no pin) — general query, specific place suppressed")
                        answers_found.append(meta.get('summary_offline', meta['answer']))
                        continue

                    answers_found.append(meta.get('summary_offline', meta['answer']))

                    if not is_browsing:
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
                    place_best = {}
                    for i, meta in enumerate(results['metadatas'][0]):
                        name = meta.get('place_name', '').strip()
                        conf = 1 - results['distances'][0][i]
                        if not name or conf < self.browsing_min:
                            continue
                        if not self._passes_activity_filter(meta, required_keywords, strict=True):
                            continue
                        if name not in place_best or conf > place_best[name][0]:
                            place_best[name] = (conf, i)

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
                        raw_answer = answers_found[0]
                        print(f"[SPECIFIC] Single place mode — using top result only (of {len(answers_found)} found)")
                    elif len(specific_places_found) > 1:
                        deduped_answers = list(dict.fromkeys(answers_found))
                        raw_answer = " ".join(deduped_answers)
                    else:
                        # Entity extractor found nothing — check if RAG has a dominant match.
                        # If top result >= T1 confidence, RAG is confident it found the right
                        # place even though the name didn't match. Show a "did you mean?" prompt
                        # so the user can confirm rather than dumping all answers.
                        # Below T1, show top 5 by confidence as a best-guess browsing list.
                        top_name = results['metadatas'][0][0].get('place_name', '').strip() if results['metadatas'][0] else ''
                        if top_rag_confidence >= self.confidence_t1 and top_name:
                            print(f"[SPECIFIC] T1 dominant match '{top_name}' ({top_rag_confidence:.3f}) — did you mean?")
                            raw_answer = f"I couldn't find an exact match. Did you mean {top_name}?"
                            # Pin the dominant place so user can see it on the map
                            loc_data = self.geo_engine.get_coords(top_name)
                            if loc_data and loc_data['name'] not in seen_places:
                                final_locations = [loc_data]
                        else:
                            # Below T1 — show top 5 most relevant as a browsing fallback
                            print(f"[SPECIFIC] No dominant match — falling back to top-5 browsing display")
                            ranked = {}
                            for i, meta in enumerate(results['metadatas'][0]):
                                pname = meta.get('place_name', '').strip()
                                conf  = 1 - results['distances'][0][i]
                                if pname and (pname not in ranked or conf > ranked[pname][0]):
                                    ranked[pname] = (conf, meta.get('summary_offline', meta.get('answer', '')))
                            top5 = sorted(ranked.items(), key=lambda x: x[1][0], reverse=True)[:5]
                            descriptions = [name for name, _ in top5]
                            raw_answer = ("Here are some options: " + "; ".join(descriptions) + "."
                                          if descriptions
                                          else "I don't have enough information for that query.")

        # ====================================================================
        # FINAL STEPS
        # ====================================================================

        # Scenario C assumption note
        if context_note:
            raw_answer = f"(Assuming you mean {context_note}) " + raw_answer

        # P5: Apply three-tier confidence framing BEFORE caching.
        # This ensures the tier qualifier is stored in cache so subsequent
        # identical queries get the same hedged response without re-running RAG.
        raw_answer = self._apply_confidence_tier(
            raw_answer, top_rag_confidence, is_browsing, entities
        )

        # Context-dependent queries should not be cached — the answer depends
        # on session state which differs per user/turn.
        is_context_query = (
            not entities.get('activities')
            and not entities.get('inferred_town')
            and specific_places_found
            and self.session_context.get('last_place')
            and specific_places_found[0] == self.session_context.get('last_place')
        )
        is_vague_query = (
            not specific_places_found
            and not target_towns
            and not entities.get('activities')
            and not answers_found  # only truly vague if we found nothing useful
        )
        if not is_context_query and not is_vague_query:
            self.semantic_cache.set(normalized, raw_answer, final_locations, requested_count)
        else:
            print(f"[CACHE] Skipped caching — context-dependent or vague query")

        # ── Gemini background enhancement ─────────────────────────────────
        # Determine tier from RAG confidence and filter the pool to the
        # matching floor threshold. Same thresholds as the RAG response —
        # no new config values needed.
        #
        #   T1 (≥0.72) → pool floor = 0.72  → tight ~10 high-quality docs
        #   T2 (≥0.60) → pool floor = 0.60  → medium ~20 docs
        #   T3 (<0.60) → pool floor = 0.35  → full wide pool, recovery mode
        #
        # Always enqueue unless context/vague — T3 failures are the most
        # important case to send: first user gets redirect, Gemini recovers
        # it in background so second user gets a real answer.
        if top_rag_confidence >= self.confidence_t1:
            rag_tier   = 'T1'
            pool_floor = self.confidence_t1
        elif top_rag_confidence >= self.confidence_t2:
            rag_tier   = 'T2'
            pool_floor = self.confidence_t2
        else:
            rag_tier   = 'T3'
            pool_floor = self.browsing_min

        tiered_candidates = [c for c in gemini_pool if c['conf'] >= pool_floor]

        # Minimum pool size guard — if a tight T1/T2 floor leaves fewer than 5
        # candidates (sparse towns like Pandan), widen to browsing_min so Gemini
        # has enough context to work with.
        MIN_POOL_SIZE = 5
        if len(tiered_candidates) < MIN_POOL_SIZE and rag_tier != 'T3':
            tiered_candidates = [c for c in gemini_pool if c['conf'] >= self.browsing_min]
            print(f"[ENHANCER] Pool too sparse ({len(tiered_candidates)} after widening) "
                  f"— fell back to browsing_min floor={self.browsing_min}")
        print(f"[ENHANCER] Tier={rag_tier} | floor={pool_floor} | "
              f"pool={len(tiered_candidates)}/{len(gemini_pool)} docs")

        if not is_context_query and not is_vague_query:
            self.enhancer.enqueue(
                normalized, raw_answer, raw_answer,
                candidates = tiered_candidates,
                rag_tier   = rag_tier
            )
        else:
            print(f"[ENHANCER] Skipped enqueue — context/vague query")

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