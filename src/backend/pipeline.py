# =============================================================================
# pipeline.py — Pathfinder RAG Query Pipeline
# =============================================================================
# PROCESS FLOW (top-to-bottom execution order):
#
#   1. STARTUP      → imports, env config, path constants
#   2. HELPERS      → parse_count_from_query(), normalize_activities()
#   3. GeoLookup    → loads GeoJSON, resolves place name → coordinates
#   4. SemanticCache → get / set / update cached Q&A pairs in ChromaDB
#   5. BackgroundEnhancer → Gemini/Groq async rewriter for cache upgrade
#   6. RateLimiter  → sliding-window request throttle
#   7. Pipeline     → __init__ wires everything together
#       └─ ask()    → main query entry point
#           ├─ Gate checks      (rate limit, profanity, intent)
#           ├─ Cache check      (semantic similarity hit?)
#           ├─ Entity extraction + context resolution
#           ├─ Budget / listing overrides
#           ├─ Route: multi-activity | multi-place | single/browsing
#           ├─ RAG filter + answer assembly
#           ├─ Confidence tiering (T1/T2/T3)
#           ├─ Cache set + enhancer enqueue
#           └─ Return {answer, locations}
#
# *mll
# =============================================================================

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

# =============================================================================
# SECTION 1 — NOISE SUPPRESSION & OFFLINE MODE
# =============================================================================
# ("STARTUP ENV": Silences TF/HuggingFace console spam and disables HF
#  network calls so the local model cache is used without retrying huggingface.co.
#  Must run BEFORE heavy imports so the env vars are seen at import time.
#  From: module load → To: all downstream imports | *mll)
logging.getLogger("stanza").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", category=UserWarning)
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"       # suppress TensorFlow C++ logs
os.environ['TRANSFORMERS_OFFLINE'] = '1'        # use cached HF model, no network
os.environ['HF_DATASETS_OFFLINE']  = '1'        # same for datasets

import chromadb
from chromadb.utils import embedding_functions
from sentence_transformers import SentenceTransformer, util
import torch
from langdetect import detect, LangDetectException
import requests
from better_profanity import profanity
from collections import deque
from queue import Queue

# Internal modules (same package)
from controller import Controller
from entity_extractor import EntityExtractor

# =============================================================================
# SECTION 2 — PATH CONSTANTS
# =============================================================================
# ("PATH CONFIG": Resolves all file paths relative to this script's location
#  so the app works from any working directory.
#  From: module load → To: Pipeline.__init__, GeoLookup.__init__ | *mll)
BASE_DIR       = Path(__file__).parent
DATASET_PATH   = BASE_DIR / "dataset" / "dataset.json"
GEOJSON_PATH   = BASE_DIR.parent.parent / "public" / "catanduanes_datafile.geojson"
CONFIG_PATH    = BASE_DIR / "config" / "config.yaml"
CHROMA_STORAGE = BASE_DIR / "chroma_storage"


# =============================================================================
# SECTION 3 — GLOBAL HELPERS
# =============================================================================

# ("WORD_NUMBERS": Lookup table for word → integer conversion.
#  Used by parse_count_from_query() to handle "top five beaches"-style queries.
#  From: module load → To: parse_count_from_query() | *mll)
WORD_NUMBERS = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
}


def parse_count_from_query(user_input):
    # ("COUNT PARSER": Detects how many results the user wants ("top 3", "give me five").
    #  Returns (count, is_explicit). Controls browsing list length and map pin limits.
    query_lower = user_input.lower()
    digit_match = re.search(r'\b(top|best|give me|show me)?\s*(\d+)\b', query_lower)
    if digit_match:
        n = int(digit_match.group(2))
        if 1 <= n <= 50:
            print(f"[COUNT] Detected digit count: {n}")
            return n, True  # <-- Added True
    for word, num in WORD_NUMBERS.items():
        pattern = r'\b(top|best|give me|show me)?\s*' + word + r'\b'
        if re.search(pattern, query_lower):
            print(f"[COUNT] Detected word count: '{word}' -> {num}")
            return num, True # <-- Added True
    print(f"[COUNT] No count found, defaulting to 5")
    return 5, False # <-- Added False


def normalize_activities(raw):
    # ("ACTIVITY NORMALIZER": Converts raw activity tags (list or string) to a
    #  lowercase comma-separated string for consistent ChromaDB metadata storage.
    #  From: Pipeline.load_dataset() → To: ChromaDB metadatas['activities_tag'] | *mll)
    if not raw:
        return ""
    if isinstance(raw, list):
        return ", ".join(str(x) for x in raw).lower()
    if isinstance(raw, str):
        return raw.lower()
    return ""


# =============================================================================
# SECTION 4 — GEO LOOKUP
# =============================================================================
class GeoLookup:
    # ("GEO LOOKUP CLASS": Loads the island's GeoJSON and resolves any place name
    #  string to {name, coordinates, type, municipality} via three strategies:
    #  exact → semantic (cosine >0.92) → fuzzy (difflib >0.85).
    #  Feeds map pins to the frontend.
    #  From: Pipeline.__init__ → To: ask() final_locations assembly | *mll)

    def __init__(self, geojson_path, model):
        self.places_db        = {}
        self.model            = model
        self.place_names      = []
        self.place_embeddings = None

        try:
            with open(geojson_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            for feature in data.get('features', []):
                props = feature.get('properties', {})
                geom  = feature.get('geometry', {})
                name  = props.get('name', '').strip()

                if name and geom.get('type') == 'Point':
                    clean_name = name.lower()
                    self.places_db[clean_name] = {
                        "name":         name,
                        "coordinates":  geom.get('coordinates'),
                        "type":         props.get('type', 'place'),
                        "municipality": props.get('municipality', 'Catanduanes')
                    }
                    self.place_names.append(clean_name)

            print(f"[GEO] Loaded {len(self.places_db)} locations. Computing embeddings...")

            # Pre-compute embeddings for all place names once at startup
            # so get_coords() semantic matching is fast at query time.
            if self.place_names:
                self.place_embeddings = self.model.encode(self.place_names,
                                                          convert_to_tensor=True)

        except Exception as e:
            print(f"[GEO ERROR] {e}")

    def get_coords(self, place_name):
        # ("GET COORDS": Resolves a place name string to its geo data.
        #  Called from answer assembly in ask(), _handle_multi_activity(),
        #  generate_itinerary(), and BackgroundEnhancer._resolve_places_from_enhanced().
        #  From: any pin-building step → To: final_locations list | *mll)
        if not place_name:
            return None
        query = place_name.lower().strip()

        # Strategy 1: exact dictionary match (fastest)
        exact = self.places_db.get(query)
        if exact:
            print(f"[GEO] Exact Match: '{place_name}'")
            return exact

        # Strategy 2: semantic cosine similarity (handles slight wording differences)
        if self.place_names:
            query_embedding = self.model.encode(query, convert_to_tensor=True)
            scores          = util.cos_sim(query_embedding, self.place_embeddings)[0]
            best_idx        = torch.argmax(scores).item()
            best_score      = scores[best_idx].item()

            if best_score > 0.92:
                match_name = self.place_names[best_idx]
                print(f"[GEO] Semantic Match: '{query}' -> '{match_name}' ({best_score:.2f})")
                return self.places_db[match_name]
            else:
                print(f"[GEO] Semantic match too weak: '{query}' best was "
                      f"'{self.place_names[best_idx]}' ({best_score:.2f}) — skipping")

        # Strategy 3: fuzzy string matching (typos, short forms)
        matches = get_close_matches(query, self.place_names, n=1, cutoff=0.85)
        if matches:
            print(f"[GEO] Fuzzy Match: '{query}' -> '{matches[0]}'")
            return self.places_db[matches[0]]

        print(f"[GEO] No match found for: '{place_name}'")
        return None


# =============================================================================
# SECTION 5 — SEMANTIC CACHE
# =============================================================================
class SemanticCache:
    # ("SEMANTIC CACHE CLASS": Stores and retrieves Q&A pairs by semantic similarity
    #  instead of exact-string matching. A cache hit avoids a full RAG + Gemini
    #  round-trip. Versioned as 'raw' or 'enhanced' so the background enhancer
    #  can upgrade entries without losing the original answer.
    #  From: Pipeline.__init__ → To: ask() cache check & cache set steps | *mll)

    def __init__(self, client, embedding_function,
                 collection_name="query_cache", similarity_threshold=0.88):
        self.similarity_threshold = similarity_threshold
        self.lock = threading.Lock()

        try:
            self.cache_collection = client.get_collection(
                name=collection_name,
                embedding_function=embedding_function
            )
            print(f"[CACHE] Loaded existing cache collection "
                  f"with {self.cache_collection.count()} entries")
        except Exception:
            self.cache_collection = client.create_collection(
                name=collection_name,
                embedding_function=embedding_function,
                metadata={"hnsw:space": "cosine"}
            )
            print(f"[CACHE] Created new cache collection")

    def get(self, query, requested_count=None):
        # ("CACHE GET": Checks if a semantically similar query was answered before.
        #  Also validates count match to prevent a "top 3" result returning for "top 5".
        #  From: ask() after gate checks → To: early return (hit) or RAG path (miss) | *mll)
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
                    version      = metadata.get('version', 'raw')

                    if requested_count is not None and stored_count is not None:
                        # STRICT MATCH: If the numbers don't match, skip this cache entry.
                        # It doesn't matter if it is raw or enhanced.
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
        # ("CACHE SET": Stores a new Q&A pair as 'raw' version.
        #  The BackgroundEnhancer will later call update() to upgrade it to 'enhanced'.
        #  From: ask() final steps (non-context, non-vague queries only) → To: future cache.get() | *mll)
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
        # ("CACHE UPDATE": Upgrades a 'raw' entry to 'enhanced' with Gemini's rewrite.
        #  Two guards prevent bad writes:
        #    Guard 1 — rejects non-answers (Gemini couldn't find info).
        #    Guard 2 — T1 lock: already-enhanced real answers are frozen.
        #  From: BackgroundEnhancer._worker_loop() → To: future cache.get() returning enhanced | *mll)

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

                    new_metadata = old_metadata.copy()
                    new_metadata["answer"] = enhanced_answer
                    new_metadata["timestamp"] = time.time()
                    new_metadata["version"] = "enhanced"
                    if places is not None:
                        new_metadata["places"] = json.dumps(places)

                    self.cache_collection.update(
                        ids=[cache_id],
                        metadatas=[new_metadata]
                    )
                    print(f"[CACHE UPDATED] Was '{old_version}' → 'enhanced': '{query[:50]}...'")
                    return True
                return False
            except Exception as e:
                print(f"[CACHE UPDATE ERROR] {e}")
                return False


# =============================================================================
# SECTION 6 — BACKGROUND ENHANCER
# =============================================================================
class BackgroundEnhancer:
    # ("BACKGROUND ENHANCER CLASS": Runs a daemon thread that upgrades 'raw' cache
    #  entries using Gemini 2.5 Flash (primary) or Groq llama (fallback).
    #  Decoupled from the main ask() path so the user gets a fast raw answer first
    #  and the next identical query gets a richer enhanced answer.
    #  From: Pipeline.__init__ (start) / ask() (enqueue) → To: SemanticCache.update() | *mll)

    def __init__(self, api_key, cache, config, geo_db=None):
        self.api_key       = api_key
        self.cache         = cache
        self.config        = config
        self.geo_db        = geo_db or {}   # keyed by lowercase name → geo record
        self.job_queue     = Queue()
        self.worker_thread = None
        self.running       = False

    def start(self):
        # ("ENHANCER START": Launches the daemon worker thread once at init time.
        #  From: Pipeline.__init__ → To: _worker_loop() | *mll)
        if self.worker_thread is not None:
            print("[ENHANCER] Already running")
            return
        self.running       = True
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()
        print("[ENHANCER] Background worker started")

    def stop(self):
        # ("ENHANCER STOP": Gracefully joins the worker thread on app exit.
        #  From: Pipeline.guide_question() exit command → To: clean shutdown | *mll)
        self.running = False
        if self.worker_thread:
            self.worker_thread.join(timeout=2)
        print("[ENHANCER] Background worker stopped")

    def enqueue(self, query, raw_facts, raw_answer, candidates=None, rag_tier='T3', is_browsing=False, requested_count=5, is_explicit_count=False):
        job = {
            'query':      query,
            'raw_facts':  raw_facts,
            'raw_answer': raw_answer,
            'candidates': candidates or [],
            'rag_tier':   rag_tier,
            'is_browsing': is_browsing,
            'requested_count': requested_count,
            'is_explicit_count': is_explicit_count,
            'timestamp':  time.time()
        }
        self.job_queue.put(job)
        print(
            f"[ENHANCER] Queued | tier={rag_tier} | "
            f"candidates={len(candidates or [])} | '{query[:50]}...'"
        )

    def _worker_loop(self):
        # ("WORKER LOOP": Continuously drains the job queue.
        #  For each job: calls Gemini/Groq, resolves pins from the response text,
        #  then writes the upgrade to cache.
        #  From: start() thread → To: _enhance_with_gemini() + cache.update() | *mll)
        print("[ENHANCER] Worker loop started")
        while self.running:
            try:
                job      = self.job_queue.get(timeout=2)
                enhanced = self._enhance_with_gemini(job)

                if enhanced:
                    # 1. Split the Text UI from the Map Pins
                    if "APPROVED_PINS:" in enhanced:
                        parts = enhanced.split("APPROVED_PINS:")
                        display_text = parts[0].strip()
                        hidden_pins_text = parts[1].strip()
                    else:
                        display_text = enhanced.strip()
                        hidden_pins_text = enhanced.strip()

                    # 2. Resolve the pins
                    resolved = self._resolve_places_from_enhanced(hidden_pins_text, job.get('candidates', []))

                    # 3. IDIOT-PROOF THE LLM: If the user explicitly asked for 3, force the list to 3.
                    if job.get('is_explicit_count') and resolved:
                        resolved = resolved[:job.get('requested_count')]

                    # 4. Update the cache
                    success = self.cache.update(
                        job['query'],
                        display_text, 
                        places=resolved if resolved else None,
                    )
                    
                    print(
                        f"[ENHANCER] ✓ Cache update: {success}"
                        + (f" | {len(resolved)} pins resolved from hidden list" if resolved else " | no pins resolved")
                    )
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
        # ("PIN RESOLVER": Scans Gemini's response for place names mentioned in
        #  the candidate pool and maps each to geo coordinates.
        #  Verbatim match works because the prompt instructs Gemini to copy names
        #  exactly from the bracketed candidate list.
        #  From: _worker_loop() → To: cache.update() places argument | *mll)
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
        # ("PROMPT BUILDER": Assembles the enhancement prompt from the candidate
        #  pool docs and the config template. Falls back to raw_facts if no pool.
        #  Both Gemini and Groq use this same prompt.
        #  From: _enhance_with_gemini() → To: _call_gemini() / _call_groq() | *mll)
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
        # ("NON-ANSWER CHECK": Returns True if the LLM admitted it couldn't answer.
        #  Prevents garbage from being written to cache.
        #  From: _enhance_with_gemini() → To: discard branch | *mll)
        """Return True if the LLM admitted it couldn't answer — discard these."""
        return any(sig in text.lower() for sig in self.NO_ANSWER_SIGNALS)

    def _call_gemini(self, prompt):
        # ("GEMINI CALL": Sends prompt to Gemini 2.5 Flash via REST.
        #  Returns (text, retry_after_seconds). retry_after is set on 429,
        #  None on success or non-429 error.
        #  From: _enhance_with_gemini() → To: fallback decision | *mll)
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
                            delay_str   = d.get('retryDelay', '60s')
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
        # ("GROQ CALL": Fallback LLM via Groq's OpenAI-compatible endpoint.
        #  Model is read from config groq.model_name (llama-3.3-70b-versatile recommended).
        #  Called when Gemini hits 429 or has no API key configured.
        #  From: _enhance_with_gemini() fallback branch → To: cache.update() | *mll)
        """
        Call Groq llama as fallback. Returns text or None.
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
        # ("ENHANCE ORCHESTRATOR": Tries Gemini first, falls back to Groq on 429
        #  or missing key. Validates both responses against NO_ANSWER_SIGNALS
        #  before returning.
        #  From: _worker_loop() → To: _resolve_places_from_enhanced() + cache.update() | *mll)
        """
        Primary: Gemini 2.5 Flash.
        Fallback: Groq llama (if Gemini hits 429).
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


# =============================================================================
# SECTION 7 — RATE LIMITER
# =============================================================================
class RateLimiter:
    # ("RATE LIMITER CLASS": Sliding-window throttle. Configured via config.yaml
    #  security.rate_limit.max_request and .period_seconds.
    #  Prevents abuse without blocking legitimate back-to-back queries.
    #  From: Pipeline.__init__ → To: ask() gate check | *mll)

    def __init__(self, max_request, period_seconds):
        self.max_request    = max_request
        self.period_seconds = period_seconds
        self.timestamps     = deque()

    def is_allowed(self):
        # ("IS ALLOWED": Prunes expired timestamps and checks if request count
        #  is within the window limit. Stamps the request if allowed.
        #  From: ask() first gate check → To: early return with wait message | *mll)
        now = time.time()
        while self.timestamps and self.timestamps[0] < now - self.period_seconds:
            self.timestamps.popleft()
        if len(self.timestamps) < self.max_request:
            self.timestamps.append(now)
            return True
        return False

    def get_remaining_time(self):
        # ("GET REMAINING TIME": Calculates seconds until the oldest request
        #  expires from the window — used in the "please wait Xs" message.
        #  From: ask() gate check → To: rate limit response string | *mll)
        if not self.timestamps:
            return 0
        now    = time.time()
        expiry = self.timestamps[0] + self.period_seconds
        return max(0, int(expiry - now))


# =============================================================================
# SECTION 8 — MAIN PIPELINE CLASS
# =============================================================================
class Pipeline:
    # ("PIPELINE CLASS": Top-level orchestrator. Wires together all subsystems
    #  at __init__ and exposes ask() as the single public query interface.
    #  From: Flask/FastAPI server or guide_question() CLI | *mll)

    # Reference words that signal a follow-up query pointing to the last place
    # INIT — WIRE ALL SUBSYSTEMS
    def __init__(self, dataset_path=str(DATASET_PATH), config_path=str(CONFIG_PATH)):
        # ("PIPELINE INIT": Loads config, then builds each subsystem in dependency
        #  order: model → geo → cache → enhancer → controller → collection.
        #  From: __main__ / server startup → To: ask() is now ready | *mll)

        self.config = self.load_config(config_path)
        print(f"[INFO] Loaded config")
        load_dotenv()
        self.internet_status = True
        self.dataset_path    = dataset_path

        # -- Rate limiter --
        sec_conf        = self.config.get('security', {})
        rate_limit_conf = sec_conf.get('rate_limit', {})
        self.limiter    = RateLimiter(
            max_request    = rate_limit_conf.get('max_request', 5),
            period_seconds = rate_limit_conf.get('period_seconds', 60)
        )

        # -- RAG embedding model --
        # SentenceTransformer is the shared model used by both RAG retrieval
        # and GeoLookup semantic matching.
        RAG_MODEL      = "sentence-transformers/" + self.config['rag']['model_path']
        self.raw_model = SentenceTransformer(RAG_MODEL, device="cpu")
        self.client    = chromadb.PersistentClient(path=str(CHROMA_STORAGE))
        self.embedding = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=RAG_MODEL, device="cpu"
        )

        # -- GeoLookup: must come after model is ready --
        self.geo_engine = GeoLookup(str(GEOJSON_PATH), self.raw_model)

        # -- Semantic cache --
        cache_threshold       = self.config.get('cache', {}).get('similarity_threshold', 0.88)
        cache_collection_name = self.config.get('cache', {}).get('collection_name', 'query_cache')
        self.semantic_cache   = SemanticCache(
            client               = self.client,
            embedding_function   = self.embedding,
            collection_name      = cache_collection_name,
            similarity_threshold = cache_threshold
        )

        # -- Background Gemini enhancer: starts daemon thread --
        gemini_key    = os.getenv('GEMINI_API_KEY')
        self.enhancer = BackgroundEnhancer(gemini_key, self.semantic_cache, self.config,
                                           geo_db=self.geo_engine.places_db)
        self.enhancer.start()

        # -- Controller (intent / validity) and entity extractor --
        self.controller       = Controller(self.config, self.raw_model)
        self.entity_extractor = EntityExtractor(self.config)

        # -- Profanity filter --
        profanity.load_censor_words()
        profanity.add_censor_words(self.config['profanity'])

        # -- ChromaDB knowledge collection (loaded by ingest.py) --
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

        # -- Confidence thresholds from config --
        # T1 ≥ 0.72 → authoritative | T2 ≥ 0.60 → qualified | T3 < 0.60 → hard stop
        rag_conf           = self.config.get('rag', {})
        self.confidence_t1 = rag_conf.get('confidence_threshold_t1', 0.72)
        self.confidence_t2 = rag_conf.get('confidence_threshold_t2', 0.60)
        self.browsing_min  = rag_conf.get('browsing_min_confidence',  0.30)
        self.specific_min  = rag_conf.get('specific_min_confidence',  0.40)
        print(f"[INFO] Confidence tiers — T1≥{self.confidence_t1} | "
              f"T2≥{self.confidence_t2} | "
              f"browsing_min={self.browsing_min} | specific_min={self.specific_min}")

    # CONFIG / DATASET HELPERS
    def load_config(self, config_path):
        # ("LOAD CONFIG": Reads config.yaml at startup. Exits immediately if missing
        #  or malformed — nothing else can run without config.
        #  From: __init__ → To: all subsystems that read self.config | *mll)
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        except Exception as e:
            print(f"Config Error: {e}")
            exit(1)

    def dataset_hash(self, dataset_path):
        # ("DATASET HASH": MD5 fingerprint of dataset.json used by ingest.py
        #  to detect whether a re-index is needed.
        #  From: ingest.py → To: rebuild_index() decision | *mll)
        hasher = hashlib.md5()
        try:
            with open(dataset_path, 'rb') as f:
                hasher.update(f.read())
            return hasher.hexdigest()
        except FileNotFoundError:
            return None

    def load_dataset(self, dataset_path):
        # ("LOAD DATASET": Reads dataset.json and inserts all Q&A pairs into
        #  ChromaDB with rich metadata tags (place_name, activities_tag, location…).
        #  Only called by rebuild_index() / ingest.py — not at query time.
        #  From: rebuild_index() → To: self.collection (ChromaDB) | *mll)
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
                print(f"[INFO] Sample activities_tag: '{sample['activities_tag']}' "
                      f"← should be words not characters")

    def rebuild_index(self):
        # ("REBUILD INDEX": Wipes and re-populates ChromaDB from dataset.json.
        #  Called by ingest.py when a dataset change is detected.
        #  From: ingest.py → To: load_dataset() | *mll)
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

    # MISC HELPERS
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
        # ("EXTRACT KEYWORDS": Maps query text to topic category labels defined
        #  in config.yaml keywords section. Utility — not in main ask() path.
        #  From: (utility) | *mll)
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
        # ("SIMPLE SEARCH": Direct ChromaDB query returning top-1 summary.
        #  Utility method — ask() uses the collection directly for finer control.
        #  From: (utility) | *mll)
        results = self.collection.query(
            query_texts=[question],
            n_results=15,
            where=where_filter
        )
        if not results['documents'][0]:
            return "I don't have information about that."
        return results['metadatas'][0][0].get('summary_offline', '')

    def key_places(self, text):
        # ("KEY PLACES": Scans text for config-defined place names (longest-first
        #  to prevent partial matches). Utility — not in main ask() path.
        #  From: (utility) | *mll)
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
        # ("GET PLACE DATA": Returns lat/lng/type for config-defined places.
        #  Utility — not in main ask() path.
        #  From: (utility) | *mll)
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
        # ("LOCATION FALLBACK": Pattern-matches municipality names in the query
        #  as a last resort when entity extractor misses them.
        #  From: (utility, not in main ask path) | *mll)
        query_lower    = query.lower()
        municipalities = ['virac', 'baras', 'pandan', 'bato', 'gigmoto',
                          'san andres', 'bagamanoc', 'viga', 'caramoran']
        for place in municipalities:
            patterns = [f" in {place}", f" at {place}", f" near {place}",
                        f"{place} ", f" {place}"]
            for pattern in patterns:
                if pattern in query_lower:
                    return place.title()
        return None

    # ACTIVITY FILTER HELPERS
    def _build_required_keywords(self, activities):
        # ("BUILD KEYWORDS": Expands activity labels to all synonym keywords from
        #  config.yaml so the activity filter checks against the full synonym group.
        #  From: ask(), _handle_multi_activity(), generate_itinerary()
        #  → To: _passes_activity_filter() | *mll)
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
        # ("ACTIVITY FILTER": Decides whether a ChromaDB doc is relevant to the
        #  requested activity. Two modes:
        #    strict=True  (browsing): place must BE that type (activities_tag/name).
        #    strict=False (specific): summary text also checked — broader.
        #  From: ask() RAG loop, _handle_multi_activity(), generate_itinerary()
        #  → To: include/skip each doc | *mll)
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

    # ACTIVE PIN INJECTION
    def _inject_active_pin(self, specific_places_found, active_pin_ctx):
        # ("ACTIVE PIN INJECTION": If the frontend sent a clicked map pin,
        #  inject that place into specific_places_found so the query is scoped to it.
        #  From: ask() after place classification → To: specific_places_found | *mll)
        if not active_pin_ctx:
            return specific_places_found, active_pin_ctx

        # If the user explicitly typed a DIFFERENT specific place in this query,
        # drop the active pin to avoid a multi-place conflict.
        if any(p != active_pin_ctx for p in specific_places_found):
            print(f"[CONTEXT] User query explicitly mentions another place. Dropping active pin: '{active_pin_ctx}'")
            return specific_places_found, None

        if active_pin_ctx not in specific_places_found:
            print(f"[CONTEXT] Active pin injected: '{active_pin_ctx}'")
            specific_places_found.append(active_pin_ctx)

        return specific_places_found, active_pin_ctx

    def _build_where_filter(self, specific_places_found, target_towns):
        """Build ChromaDB where filter consistent with main single/browsing path."""
        if specific_places_found:
            return ({"place_name": {"$eq": specific_places_found[0]}}
                    if len(specific_places_found) == 1
                    else {"$or": [{"place_name": p} for p in specific_places_found]})
        if target_towns:
            return ({"location": target_towns[0]}
                    if len(target_towns) == 1
                    else {"$or": [{"location": t} for t in target_towns]})
        return None

    def _probe_retrieval_path(self, user_input, entities, specific_places_found,
                              target_towns, required_keywords, is_browsing, active_pin_ctx):
        """
        Lightweight quality probe for arbitration:
        compares retrieval fitness for a candidate context setup without assembling full answers.
        """
        activity_count = max(1, len(entities.get('activities') or []))
        scaled_specific_n = 5 * activity_count
        if specific_places_found:
            n_results = max(40, scaled_specific_n, len(specific_places_found) * 3)
        else:
            n_results = 100 if is_browsing else max(40, scaled_specific_n)

        where_filter = self._build_where_filter(specific_places_found, target_towns)
        search_query = user_input + (f" {active_pin_ctx}" if active_pin_ctx else "")

        try:
            results = self.collection.query(
                query_texts=[search_query],
                n_results=n_results,
                where=where_filter
            )
        except Exception as e:
            print(f"[ARBITRATE] Probe query failed: {e}")
            return {'score': -1.0, 'kept': 0, 'top_conf': 0.0, 'town_ratio': 0.0}

        docs = results.get('documents', [[]])[0] if results.get('documents') else []
        if not docs:
            return {'score': 0.0, 'kept': 0, 'top_conf': 0.0, 'town_ratio': 0.0}

        kept = 0
        top_conf = 0.0
        town_hits = 0
        unique_places = set()
        threshold = self.browsing_min if is_browsing else self.specific_min

        for i, _ in enumerate(docs):
            meta = results['metadatas'][0][i]
            conf = 1 - results['distances'][0][i]

            if conf < threshold:
                continue
            if required_keywords and not self._passes_activity_filter(
                meta, required_keywords, strict=is_browsing
            ):
                continue

            kept += 1
            top_conf = max(top_conf, conf)

            pname = meta.get('place_name', '').strip()
            if pname:
                unique_places.add(pname)

            if target_towns and meta.get('location') in target_towns:
                town_hits += 1

        town_ratio = (town_hits / kept) if target_towns and kept else (1.0 if not target_towns else 0.0)
        score = top_conf + min(kept, 5) * 0.05 + min(len(unique_places), 5) * 0.03 + (0.60 * town_ratio)

        return {
            'score': round(score, 3),
            'kept': kept,
            'top_conf': round(top_conf, 3),
            'town_ratio': round(town_ratio, 3)
        }

    def _probe_multi_activity_path(self, activities, target_towns):
        """
        Lightweight probe for multi-activity route quality.
        Scores how well one best doc per requested activity can be satisfied.
        """
        if not activities:
            return {'score': 0.0, 'coverage': 0.0, 'matched': 0, 'top_conf': 0.0, 'named_ratio': 0.0}

        where_filter = None
        if target_towns:
            where_filter = ({"location": target_towns[0]}
                            if len(target_towns) == 1
                            else {"$or": [{"location": t} for t in target_towns]})

        matched = 0
        conf_sum = 0.0
        top_conf = 0.0
        named_count = 0
        unique_places = set()

        for activity in activities:
            keywords = self._build_required_keywords([activity])
            activity_query = f"{activity} catanduanes"
            if target_towns:
                activity_query += f" {target_towns[0].lower()}"

            try:
                results = self.collection.query(
                    query_texts=[activity_query],
                    n_results=15,
                    where=where_filter
                )
            except Exception:
                continue

            if not results.get('documents') or not results['documents'][0]:
                continue

            best_conf = 0.0
            best_meta = None
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
                continue

            matched += 1
            conf_sum += best_conf
            top_conf = max(top_conf, best_conf)
            place_name = best_meta.get('place_name', '').strip()
            if place_name:
                named_count += 1
                unique_places.add(place_name)

        coverage = matched / max(1, len(activities))
        avg_conf = (conf_sum / matched) if matched else 0.0
        named_ratio = (named_count / matched) if matched else 0.0

        score = (
            (1.2 * coverage) +
            top_conf +
            (0.35 * avg_conf) +
            (0.45 * named_ratio) +
            (min(len(unique_places), 5) * 0.03)
        )
        return {
            'score': round(score, 3),
            'coverage': round(coverage, 3),
            'matched': matched,
            'top_conf': round(top_conf, 3),
            'named_ratio': round(named_ratio, 3)
        }

    # MULTI-ACTIVITY HANDLER
    def _handle_multi_activity(self, activities, target_towns, user_input):
        # ("MULTI-ACTIVITY HANDLER": Splits compound queries ("surf then eat") into
        #  one focused sub-query per activity. Each sub-query gets its best-matching
        #  doc. Returns a grouped answer string + merged locations + top confidence.
        #  From: ask() multi-activity branch
        #  → To: raw_answer, final_locations, top_rag_confidence, gemini_pool | *mll)
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

        grouped_answers   = []
        all_locations     = []
        seen_places       = set()
        top_confidence    = 0.0
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

    # ITINERARY GENERATOR
    def generate_itinerary(self, days: int, activities: list,
                           group_type: str, budget: str) -> dict:
        # ("ITINERARY GENERATOR": Builds a structured day-by-day plan using RAG
        #  facts only — no Gemini. Day 1 is always arrival, last day is departure,
        #  middle days rotate through user activities.
        #  From: external API endpoint (not ask())
        #  → To: returns {itinerary, notes, locations} | *mll)
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
            # ("FETCH BEST FACT": Inner helper — queries ChromaDB for the best
            #  fact for one activity slot, skipping already-used places.
            #  From: generate_itinerary() slot loop → To: slots list | *mll)
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

    # P5 HELPER: THREE-TIER CONFIDENCE FRAMING
    def _apply_confidence_tier(self, raw_answer, top_confidence, is_browsing, entities):
        # ("CONFIDENCE TIER FRAMING": Wraps the raw answer with context-appropriate
        #  framing based on how confident RAG was.
        #    T1 ≥ 0.72 → return as-is (authoritative)
        #    T2 ≥ 0.60 → prefix "Based on available records," + price disclaimer
        #    T3 < 0.60 → hard stop, redirect to tourism office
        #  Applied BEFORE caching so the framing is stored and reused on cache hits.
        #  From: ask() final steps → To: raw_answer (framed) → cache.set() | *mll)
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
            print(f"[TIER] T2 ({top_confidence:.3f}, {self.confidence_t2}–{self.confidence_t1}) "
                f"— qualified answer")
            framed = "Based on available records, " + raw_answer
            if is_budget_query:
                framed += " Please verify prices directly on-site as they may have changed."
            return framed

        else:
            # T3 — Hard stop, score too low to trust
            print(f"[TIER] T3 ({top_confidence:.3f} < {self.confidence_t2}) "
                f"— hard stop, redirecting")
            return ("I don't have reliable information on that yet. "
                    "You may want to ask at the local tourism office in Virac "
                    "or a nearby guide for accurate details.")

    # MAIN ASK METHOD — ENTRY POINT FOR ALL QUERIES
    def ask(self, user_input, active_pin=None):
        # ("ASK METHOD": The single public query interface. Orchestrates the full
        #  pipeline from input validation to response assembly.
        #  From: Flask/FastAPI server or guide_question() CLI
        #  → To: returns {answer: str, locations: list} | *mll)
        start_time = time.time()

        # Request-local pin context only (never stored on self to avoid cross-request bleed)
        active_pin_ctx = active_pin.strip() if isinstance(active_pin, str) and active_pin.strip() else None
        if active_pin_ctx:
            print(f"[CONTEXT] Active pin from frontend: '{active_pin_ctx}'")

        # STEP 1 — GATE CHECKS
        # ("GATE CHECKS": Hard stops before any expensive processing.
        #  Order: rate limit → profanity → intent validation → greeting.
        #  From: ask() entry → To: early return or continue to cache | *mll)

        if not self.limiter.is_allowed():
            return {"answer": f"Please wait {self.limiter.get_remaining_time()}s.",
                    "locations": []}

        if self.check_profanity(user_input):
            return {"answer": "I cannot process that language.", "locations": []}

        analysis = self.controller.analyze_query(user_input)

        if not analysis['is_valid'] or analysis['intent'] == 'nonsense':
            print(f"[GATEKEEPER] Blocked: {user_input} (Reason: {analysis['reason']})")
            return {"answer": self.controller.get_nonsense_response(), "locations": []}

        if analysis['intent'] == 'greeting':
            return {"answer": self.controller.get_greeting_response(), "locations": []}

        normalized_base = self.normalize_query(user_input)
        normalized = normalized_base
        if active_pin_ctx:
            normalized = f"{normalized_base} (context: {active_pin_ctx})"
        query_lower = normalized.lower()

        # STEP 2 — CACHE CHECK
        # ("CACHE CHECK": Semantic similarity lookup against stored Q&A pairs.
        #  Hit → return immediately (fast path). Raw hit → re-enqueue for enhancement.
        #  Miss → continue to entity extraction and RAG.
        #  From: gate checks → To: early return (hit) or entity extraction (miss) | *mll)
        requested_count, is_explicit_count = parse_count_from_query(user_input)
        cached = self.semantic_cache.get(normalized, requested_count)
        if cached:
            answer, places, version = cached
            if version == 'raw':
                self.enhancer.enqueue(normalized, answer, answer)
            return {"answer": answer, "locations": places}

        # STEP 3 — ENTITY EXTRACTION + CONTEXT RESOLUTION
        # ("ENTITY EXTRACTION": Pulls structured intent from the raw query —
        #  places, activities, listing intent, inferred town.
        #  From: cache miss → To: active pin injection, budget override, routing | *mll)
        entities = self.entity_extractor.extract(user_input)
        print(f"[ENTITIES] {entities}")
        print(f"[COUNT] Requested count: {requested_count}")

        # STEP 4 — BUDGET SIGNAL OVERRIDE
        # ("BUDGET OVERRIDE": Detects price-intent keywords and forces activity
        #  to 'budget' so the activity filter targets cost-related docs.
        #  From: context resolution → To: entities['activities'] | *mll)
        BUDGET_SIGNALS = ['how much', 'magkano', 'cost', 'price', 'fee', 'entrance',
                          'bayad', 'libre', 'expensive', 'cheap', 'afford']
        if any(re.search(r'\b' + re.escape(sig) + r'\b', query_lower) for sig in BUDGET_SIGNALS):
            if 'budget' not in entities.get('activities', []):
                entities['activities'] = ['budget']
                print(f"[ENTITIES] Budget signal detected — overriding activity to ['budget']")

        # STEP 5 — CLASSIFY PLACES: TOWNS vs SPECIFIC PLACES
        # ("PLACE CLASSIFICATION": Splits extracted places into municipalities
        #  (used as location filter) vs specific named places (used as exact match).
        #  From: entity extraction → To: where_filter construction in RAG | *mll)
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

        # STEP 6 — LISTING / BROWSING DETECTION
        # ("BROWSING DETECTION": Forces browsing mode if a count word/number is in
        #  the query or entity extractor flagged is_listing. Browsing returns a
        #  ranked list; specific mode returns a focused single answer.
        #  From: entity extraction → To: n_results, filter strictness, answer assembly | *mll)
        is_browsing = entities.get('is_listing', False)
        if re.search(r'\b\d+\b', user_input) or any(w in user_input.lower() for w in WORD_NUMBERS):
            is_browsing = True
            print(f"[PIPELINE] Listing forced ON due to count word/number in query")

        # STEP 7 — BUILD ACTIVITY KEYWORDS
        # ("ACTIVITY KEYWORDS": Expands activity labels to full synonym set.
        #  Empty list = no filter = all docs pass through.
        #  From: entity extraction → To: _passes_activity_filter() in RAG loop | *mll)
        required_keywords = []
        if entities.get('activities'):
            required_keywords = self._build_required_keywords(entities['activities'])
            print(f"[FILTER] Activity filter active. Keywords: {required_keywords}")
        else:
            print(f"[FILTER] No activity filter active — all document types will pass")

        # ("PIN ARBITRATION": When frontend provides active_pin, evaluate two retrieval paths:
        #  with pin-context vs without pin-context. Choose the stronger retrieval fit.
        #  This avoids sticky pin lock without regex/time heuristics.
        #  From: post-entity setup → To: specific_places_found, active_pin_ctx | *mll)
        base_specific_places = list(specific_places_found)
        if active_pin_ctx:
            pin_specific_places, pin_candidate = self._inject_active_pin(
                list(base_specific_places), active_pin_ctx
            )
            if pin_candidate:
                with_pin = self._probe_retrieval_path(
                    user_input=user_input,
                    entities=entities,
                    specific_places_found=pin_specific_places,
                    target_towns=target_towns,
                    required_keywords=required_keywords,
                    is_browsing=is_browsing,
                    active_pin_ctx=pin_candidate
                )
                without_pin = self._probe_retrieval_path(
                    user_input=user_input,
                    entities=entities,
                    specific_places_found=base_specific_places,
                    target_towns=target_towns,
                    required_keywords=required_keywords,
                    is_browsing=is_browsing,
                    active_pin_ctx=None
                )
                print(f"[ARBITRATE] with_pin={with_pin} | without_pin={without_pin}")

                if with_pin['top_conf'] >= self.specific_min:
                    specific_places_found = pin_specific_places
                    active_pin_ctx = pin_candidate
                    print("[ARBITRATE] Using active pin context (High Confidence)")
                elif with_pin['score'] > without_pin['score'] + 0.05:
                    specific_places_found = pin_specific_places
                    active_pin_ctx = pin_candidate
                    print("[ARBITRATE] Using active pin context (Higher Score)")
                else:
                    specific_places_found = base_specific_places
                    active_pin_ctx = None
                    print("[ARBITRATE] Dropping active pin context for this query")
            else:
                specific_places_found = base_specific_places
                active_pin_ctx = None
        else:
            specific_places_found = base_specific_places

        # Rebuild canonical cache/enhancer key from final arbitration outcome.
        # This prevents storing global answers under a stale "(context: ...)" key.
        normalized = normalized_base
        if active_pin_ctx:
            normalized = f"{normalized_base} (context: {active_pin_ctx})"

        # Track top RAG confidence across all search paths (used by tier framing + enhancer)
        top_rag_confidence = 0.0

        # gemini_pool: loose candidate docs for the background enhancer.
        # Built in the single/browsing path; empty for multi-activity/multi-place.
        gemini_pool   = []
        answers_found = []   # initialized here so is_vague_query check always works

        # STEP 8 — ROUTE TO SEARCH PATH

        # Multi-activity: 2+ activities, no specific place.
        # Route is chosen via evidence-based arbitration against listing/browsing path.
        multi_candidate = (
            len(entities.get('activities') or []) > 1
            and not specific_places_found
        )
        use_multi_activity = False
        if multi_candidate:
            multi_probe = self._probe_multi_activity_path(entities['activities'], target_towns)
            listing_probe = self._probe_retrieval_path(
                user_input=user_input,
                entities=entities,
                specific_places_found=specific_places_found,
                target_towns=target_towns,
                required_keywords=required_keywords,
                is_browsing=True,
                active_pin_ctx=active_pin_ctx
            )
            print(f"[ROUTE ARBITRATE] multi={multi_probe} | listing={listing_probe}")
            use_multi_activity = multi_probe['score'] > listing_probe['score'] + 0.05
            if use_multi_activity:
                print(f"[ROUTE ARBITRATE] Selected MULTI-ACTIVITY route")
            else:
                is_browsing = True
                print(f"[ROUTE ARBITRATE] Selected LISTING/BROWSING route")

        is_multi_activity = multi_candidate and use_multi_activity
        if is_multi_activity:
            print(f"[PIPELINE] Multi-activity query — activities={entities['activities']}")

        # ── PATH A: MULTI-ACTIVITY ────────────────────────────────────────────
        if is_multi_activity:
            # ("MULTI-ACTIVITY PATH": Delegates to _handle_multi_activity() which
            #  runs one sub-query per intent and merges the results.
            #  From: routing → To: raw_answer, final_locations, gemini_pool | *mll)
            raw_answer, final_locations, top_rag_confidence, multi_pool = self._handle_multi_activity(
                activities   = entities['activities'],
                target_towns = target_towns,
                user_input   = user_input
            )
            gemini_pool.extend(multi_pool)
            print(f"[MULTI-ACT] Gemini pool from sub-queries: {len(multi_pool)} docs")

        # ── PATH B: MULTI-PLACE ───────────────────────────────────────────────
        elif specific_places_found and len(specific_places_found) > 1:
            # ("MULTI-PLACE PATH": Runs one focused query per named place and
            #  merges answers + pins. Strict exact-match filter on place_name.
            #  From: routing → To: raw_answer, final_locations | *mll)
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

        # ── PATH C: SINGLE PLACE OR BROWSING ─────────────────────────────────
        else:
            # ("SINGLE/BROWSING PATH": Handles all remaining queries — single named
            #  place lookups and open browsing ("best beaches in Pandan").
            #  n_results is scaled to activity count and mode.
            #  From: routing → To: answers_found, final_locations, gemini_pool | *mll)
            activity_count    = max(1, len(entities.get('activities') or []))
            scaled_specific_n = 5 * activity_count

            if specific_places_found:
                is_browsing = False
                n_results   = max(40, scaled_specific_n, len(specific_places_found) * 3)
            else:
                n_results = 100 if is_browsing else max(40, scaled_specific_n)

            print(f"[PIPELINE] Mode: {'BROWSING' if is_browsing else 'SPECIFIC'} | "
                  f"N={n_results} | Target towns: {target_towns}")

            # Build ChromaDB where_filter:
            #   specific place → exact match on place_name
            #   town query     → filter by location
            #   general        → no filter
            where_filter = self._build_where_filter(specific_places_found, target_towns)

            print(f"[PIPELINE] where_filter: {where_filter}")

            search_query = user_input
            if active_pin_ctx:
                search_query += f" {active_pin_ctx}"
            # ── ChromaDB query ────────────────────────────────────────────────
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

                    # ("GEMINI POOL COLLECTION": Gathers loose candidates for the
                    #  background enhancer — town-scoped, no activity filter.
                    #  Runs BEFORE the strict RAG filter so T3 dead-end queries
                    #  still build a pool for Gemini to recover from.
                    #  From: RAG loop → To: BackgroundEnhancer.enqueue() | *mll)
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

                    # ── RAG DOC FILTER ────────────────────────────────────────
                    # ("RAG FILTER": Decides whether each retrieved doc passes into
                    #  answers_found. Sub-checks: place match, activity match,
                    #  confidence threshold, location filter.
                    #  From: ChromaDB results loop → To: answers_found, final_locations | *mll)
                    if specific_places_found:
                        if meta.get('place_name') not in specific_places_found:
                            print(f"[FILTER] ✗ Skipped '{place_name_tag}' — not in specific_places_found")
                            continue
                    else:
                        if not self._passes_activity_filter(meta, required_keywords,
                                                            strict=is_browsing):
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
                        print(f"[FILTER] ✓ Kept text only (no pin) — general query, "
                              f"specific place suppressed")
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
                                print(f"[GEO] ✗ No coordinates found for '{place_key}' "
                                      f"— pin will not appear")

            print(f"[PIPELINE] Docs after filtering: {len(answers_found)} | "
                  f"Locations found: {len(final_locations)}")

            # ── ANSWER ASSEMBLY ───────────────────────────────────────────────
            if not answers_found:
                town_str   = target_towns[0].title() if target_towns else "that area"
                raw_answer = (f"I'm sorry, I don't have information on that in {town_str}."
                              if target_towns else "I don't have information on that.")
                final_locations = []
            else:
                if is_browsing:
                    # ("BROWSING ASSEMBLY": Picks the highest-confidence doc per
                    #  place, ranks by confidence, slices to requested_count, and
                    #  builds the "Here are some options: X; Y; Z" list string.
                    #  From: answer assembly → To: raw_answer | *mll)
                    place_best = {}
                    for i, meta in enumerate(results['metadatas'][0]):
                        name = meta.get('place_name', '').strip()
                        conf = 1 - results['distances'][0][i]
                        if not name or conf < self.browsing_min:
                            continue
                        if not self._passes_activity_filter(meta, required_keywords,
                                                            strict=True):
                            continue
                        if name not in place_best or conf > place_best[name][0]:
                            place_best[name] = (conf, i)

                   # 1. Sort all found places by confidence
                    # 1. Sort all found places by confidence
                    all_ranked_places = sorted(place_best.items(),
                                           key=lambda x: x[1][0], reverse=True)
                    
                    # 2. Create the curated list for the Text Response (Top N)
                    top_places_for_text = all_ranked_places[:requested_count]
                    print(f"[BROWSING] Best-conf per place (Top {requested_count}): "
                          f"{[(n, f'{c:.3f}') for n,(c,_) in top_places_for_text]}")

                    descriptions = []
                    for name, (conf, _) in top_places_for_text:
                        descriptions.append(name)

                    # 3. DECISION: If explicit count (Top 3), pin 3. If default, pin ALL.
                    places_to_pin = top_places_for_text if is_explicit_count else all_ranked_places

                    # 4. Create the map pins using the decided list
                    for name, (conf, _) in places_to_pin:
                        loc_data = self.geo_engine.get_coords(name)
                        if loc_data and loc_data['name'] not in seen_places:
                            final_locations.append(loc_data)
                            seen_places.add(loc_data['name'])

                    print(f"[BROWSING] Final descriptions ({len(descriptions)}): {descriptions}")

                    raw_answer = ("Here are some options: " + "; ".join(descriptions) + "."
                                  if descriptions
                                  else "I don't have enough information to list spots for that query.")
                else:
                    # ── SPECIFIC ANSWER ASSEMBLY ──────────────────────────────
                    if len(specific_places_found) == 1:
                        raw_answer = answers_found[0]
                        print(f"[SPECIFIC] Single place mode — using top result only "
                              f"(of {len(answers_found)} found)")
                    elif len(specific_places_found) > 1:
                        deduped_answers = list(dict.fromkeys(answers_found))
                        raw_answer = " ".join(deduped_answers)
                    else:
                        # ("GENERAL INFO ASSEMBLY": No specific place was extracted but
                        #  RAG returned docs that passed the filter (e.g. general questions
                        #  like "can I use my credit card in catanduanes"). Use answers_found
                        #  directly — they already passed confidence + activity filters above.
                        #
                        #  Only fall back to "Did you mean?" when answers_found is EMPTY,
                        #  meaning nothing whatsoever passed — treat that as a place-name
                        #  lookup that failed (e.g. typo like "purraran").
                        #
                        #  From: answer assembly (empty specific_places_found)
                        #  → To: raw_answer | *mll)
                        if answers_found:
                            # Docs passed the filter — use the best one(s)
                            deduped = list(dict.fromkeys(answers_found))
                            raw_answer = deduped[0]
                            print(f"[SPECIFIC] General info — using top answer "
                                  f"({len(answers_found)} docs passed filter)")
                        else:
                            # Nothing passed — guess from top RAG result
                            top_name = (results['metadatas'][0][0].get('place_name', '').strip()
                                        if results['metadatas'][0] else '')
                            if top_rag_confidence >= self.confidence_t1 and top_name:
                                print(f"[SPECIFIC] T1 dominant match '{top_name}' "
                                      f"({top_rag_confidence:.3f}) — did you mean?")
                                raw_answer = f"I couldn't find an exact match. Did you mean {top_name}?"
                                loc_data = self.geo_engine.get_coords(top_name)
                                if loc_data and loc_data['name'] not in seen_places:
                                    final_locations = [loc_data]
                            else:
                                print(f"[SPECIFIC] No dominant match — top-5 browsing fallback")
                                ranked = {}
                                for i, meta in enumerate(results['metadatas'][0]):
                                    pname = meta.get('place_name', '').strip()
                                    conf  = 1 - results['distances'][0][i]
                                    if pname and (pname not in ranked or conf > ranked[pname][0]):
                                        ranked[pname] = (conf, meta.get('summary_offline',
                                                                         meta.get('answer', '')))
                                top5 = sorted(ranked.items(), key=lambda x: x[1][0], reverse=True)[:5]
                                for name, _ in top5:
                                    loc_data = self.geo_engine.get_coords(name)
                                    if loc_data and loc_data['name'] not in seen_places:
                                        final_locations.append(loc_data)
                                        seen_places.add(loc_data['name'])
                                raw_answer = ("Here are some options: " + "; ".join(n for n, _ in top5) + "."
                                              if top5
                                              else "I don't have enough information for that query.")

        # STEP 9 — FINAL STEPS

        # Prepend context assumption note (Scenario C)
        # ("CONFIDENCE TIER FRAMING": Applied before caching so the framing
        #  (T2 qualifier, T3 redirect) is stored and reused on future cache hits.
        #  From: answer assembly → To: cache.set() + return value | *mll)
        raw_answer = self._apply_confidence_tier(
            raw_answer, top_rag_confidence, is_browsing, entities
        )

        # ("CACHE WRITE GUARD": Context-dependent and vague queries are NOT cached —
        #  context queries depend on per-session state that differs across users,
        #  vague queries have no useful answer to store.
        #  From: confidence framing → To: cache.set() and enhancer.enqueue() | *mll)
        is_context_query = False  # session context removed
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

        # ("ENHANCER ENQUEUE — FLAT POOL": Sends all collected candidate docs to
        #  Gemini/Groq regardless of confidence score. Tiering was removed because
        #  for specific-place queries the top doc (general description) scores highest
        #  while the actually-needed doc (hours, transport, fees) scores lower — a
        #  floor cutoff was silently discarding the exact doc Gemini needed.
        #  Gemini is better at picking the right doc from a full set than RAG is at
        #  pre-filtering. T1/T2/T3 is retained only for RAG response framing.
        #  From: cache write guard → To: BackgroundEnhancer.enqueue() | *mll)
        print(f"[ENHANCER] Pool={len(gemini_pool)} docs — sending all to enhancer")

        if not is_context_query and not is_vague_query:
            self.enhancer.enqueue(
                normalized, raw_answer, raw_answer,
                candidates = gemini_pool,
                rag_tier   = 'ALL',
                is_browsing = is_browsing,
                requested_count = requested_count,
                is_explicit_count = is_explicit_count
            )
        else:
            print(f"[ENHANCER] Skipped enqueue — context/vague query")


        # ── SAFETY NET: catch-all pin resolver ────────────────────────────────
        # Scans the final answer for any known place name from the geo database
        # that wasn't already pinned by branch logic. Prevents "mentioned but
        # not pinned" bugs regardless of which code path produced the answer.
        is_t3_fallback = "don't have reliable information" in raw_answer
        
        if not is_t3_fallback:
            already_pinned = {p['name'] for p in final_locations}
            answer_lower   = raw_answer.lower()
            net_added      = 0

            for geo_name in self.geo_engine.place_names:          # lowercase list
                if geo_name in answer_lower and geo_name not in {n.lower() for n in already_pinned}:
                    loc_data = self.geo_engine.get_coords(geo_name)
                    if loc_data and loc_data['name'] not in already_pinned:
                        final_locations.append(loc_data)
                        already_pinned.add(loc_data['name'])
                        net_added += 1

            if net_added:
                print(f"[SAFETY NET] Resolved {net_added} extra pin(s) from answer text")
        else:
            # Force locations to empty so the frontend does not redirect
            print("[SAFETY NET] T3 Fallback detected — wiping locations")
            final_locations = []

        # ── Format locations for frontend ─────────────────────────────────────
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

    # CLI INTERFACE (DEV / TEST)
    def guide_question(self):
        # ("GUIDE QUESTION": Interactive CLI loop for local testing.
        #  Not used in production — Flask/FastAPI calls ask() directly.
        #  From: __main__ → To: ask() | *mll)
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


# =============================================================================
# ENTRYPOINT
# =============================================================================
if __name__ == '__main__':
    pipeline = Pipeline(dataset_path=str(DATASET_PATH), config_path=str(CONFIG_PATH))
    pipeline.guide_question()
