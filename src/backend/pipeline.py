import chromadb
from chromadb.utils import embedding_functions
import json
import torch
import requests
import time
import os
from dotenv import load_dotenv
import re
import uuid
from better_profanity import profanity
import hashlib
import yaml
from pathlib import Path
from controller import Controller
from entity_extractor import EntityExtractor
from sentence_transformers import SentenceTransformer
from collections import deque
import threading
from queue import Queue

BASE_DIR = Path(__file__).parent 
DATASET = BASE_DIR / "dataset" / "dataset.json"
CONFIG = BASE_DIR / "config" / "config.yaml"
CHROMA_STORAGE = BASE_DIR / "chroma_storage" 

# ============================================================================
# SEMANTIC CACHE - NEW COMPONENT (PERSISTENT)
# ============================================================================
class SemanticCache:
    """Fast vector-based cache with ChromaDB persistence"""
    def __init__(self, client, embedding_function, collection_name="query_cache", similarity_threshold=0.88):
        self.similarity_threshold = similarity_threshold
        self.lock = threading.Lock()
        
        # Try to get or create persistent cache collection
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
                metadata={"hnsw:space": "cosine"}  # Use cosine similarity
            )
            print(f"[CACHE] Created new cache collection")
    
    def get(self, query):
        """Check if similar query exists in cache"""
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
                    # NEW: Get the version flag
                    version = metadata.get('version', 'raw') 
                    
                    import json
                    try:
                        places_list = json.loads(places)
                    except:
                        places_list = []
                    
                    print(f"[CACHE HIT] Similarity: {similarity:.3f} | Ver: {version} | '{cached_query[:30]}...'")
                    
                    # NEW: Return version too
                    return (answer, places_list, version) 
                
                print(f"[CACHE MISS] Best similarity: {similarity:.3f}")
                return None
                
            except Exception as e:
                print(f"[CACHE ERROR] {e}")
                return None
    
    def set(self, query, answer, places):
        """Store query-answer pair in cache"""
        import json
        
        with self.lock:
            try:
                # Generate unique ID based on query + timestamp
                cache_id = f"cache_{hashlib.md5(query.encode()).hexdigest()}_{int(time.time())}"
                
                # Store in ChromaDB
                self.cache_collection.add(
                    documents=[query],
                    metadatas=[{
                        "answer": answer,
                        "places": json.dumps(places),  # Store as JSON string
                        "timestamp": time.time(),
                        "version": "raw"  # Track if enhanced or not
                    }],
                    ids=[cache_id]
                )
                
                print(f"[CACHE SET] Stored: '{query[:50]}...' (id: {cache_id})")
                
            except Exception as e:
                print(f"[CACHE SET ERROR] {e}")
    
    def update(self, query, enhanced_answer):
        """Update existing cache entry with enhanced version"""
        import json
        
        with self.lock:
            try:
                # Find the most similar entry
                results = self.cache_collection.query(
                    query_texts=[query],
                    n_results=1
                )
                
                if not results['documents'][0]:
                    print(f"[CACHE UPDATE FAILED] No entry found for: '{query[:50]}...'")
                    return False
                
                distance = results['distances'][0][0]
                similarity = 1 - distance
                
                if similarity >= self.similarity_threshold:
                    cache_id = results['ids'][0][0]
                    old_metadata = results['metadatas'][0][0]
                    
                    # Update the entry with enhanced answer
                    self.cache_collection.update(
                        ids=[cache_id],
                        metadatas=[{
                            "answer": enhanced_answer,
                            "places": old_metadata.get('places', '[]'),
                            "timestamp": time.time(),
                            "version": "enhanced"  # Mark as enhanced
                        }]
                    )
                    
                    print(f"[CACHE UPDATED] Enhanced: '{query[:50]}...' (id: {cache_id})")
                    return True
                
                print(f"[CACHE UPDATE FAILED] Similarity too low: {similarity:.3f}")
                return False
                
            except Exception as e:
                print(f"[CACHE UPDATE ERROR] {e}")
                return False


# ============================================================================
# BACKGROUND ENHANCER - NEW COMPONENT
# ============================================================================
class BackgroundEnhancer:
    """Background worker for Gemini-based answer enhancement"""
    def __init__(self, api_key, cache, config):
        self.api_key = api_key
        self.cache = cache
        self.config = config
        self.job_queue = Queue()
        self.worker_thread = None
        self.running = False
    
    def start(self):
        """Start background worker thread"""
        if self.worker_thread is not None:
            print("[ENHANCER] Already running")
            return
        
        self.running = True
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()
        print("[ENHANCER] Background worker started")
    
    def stop(self):
        """Stop background worker"""
        self.running = False
        if self.worker_thread:
            self.worker_thread.join(timeout=2)
        print("[ENHANCER] Background worker stopped")
    
    def enqueue(self, query, raw_facts, raw_answer):
        """Add enhancement job to queue"""
        job = {
            'query': query,
            'raw_facts': raw_facts,
            'raw_answer': raw_answer,
            'timestamp': time.time()
        }
        self.job_queue.put(job)
        print(f"[ENHANCER] Job queued: '{query[:50]}...'")
    
    def _worker_loop(self):
        """Main worker loop - processes jobs"""
        print("[ENHANCER] Worker loop started")
        while self.running:
            try:
                # Wait for job (timeout to check running flag)
                job = self.job_queue.get(timeout=1)
                
                print(f"[ENHANCER] Processing: '{job['query'][:50]}...'")
                
                try:
                    enhanced = self._enhance_with_gemini(job)
                    
                    if enhanced:
                        # Update cache with enhanced version
                        success = self.cache.update(job['query'], enhanced)
                        if success:
                            print(f"[ENHANCER] ✓ Job completed and cached")
                        else:
                            print(f"[ENHANCER] ⚠ Enhanced but cache update failed")
                    else:
                        print(f"[ENHANCER] ✗ Enhancement failed, keeping raw answer")
                except Exception as job_error:
                    print(f"[ENHANCER] Job processing error: {job_error}")
                    import traceback
                    traceback.print_exc()
                
                self.job_queue.task_done()
                
            except Exception as e:
                # Handle queue.Empty gracefully
                if "Empty" not in str(type(e).__name__):
                    print(f"[ENHANCER] Loop error: {type(e).__name__}: {e}")
                continue
        
        print("[ENHANCER] Worker loop stopped")
    
    def _enhance_with_gemini(self, job):
        """Final Robust Version: Handles Safety Refusals & Empty Responses"""
        if not self.api_key:
            return None
        
        # Use the alias that always points to the current stable model
        model_name = "gemini-flash-latest"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={self.api_key}"

        prompt = f"""You are Pathfinder — a calm, polite, helpful, always excited Catanduanes tourism assistant. Your responses should sound gentle, clear, and factual, while maintaining a friendly tone.

USER QUESTION: {job['query']}
FACTUAL INFO: {job['raw_facts']}

Respond in a helpful way using only the information from the facts. 
If the facts partially match the query, answer as best as possible using the facts.
Do not make up information not in the facts.
Respond in the same language as the tourist's question.

Use only the information from the facts. Summarize the facts into a cohesive answer. Do not just list them one by one.
Give a single, concise, and natural-sounding sentence, include all the facts and the place mentioned.
Connect the ideas naturally (e.g., use "You can also try..." instead of just a comma).
Do not add greetings or extra commentary be direct yet kind. You may include exclamation marks to sound excited.
If you detect any profanity in any language, return "I am unable to process that language. Please ask your question politely so I can assist you with Catanduanes tourism."""
        
        payload = {
            'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': {'temperature': 0.7, 'maxOutputTokens': 600}
        }
        
        try:
            response = requests.post(url, json=payload, timeout=10)
            
            if response.status_code == 200:
                result = response.json()
                
                # Check if we have candidates
                if 'candidates' not in result or not result['candidates']:
                    return None
                
                candidate = result['candidates'][0]
                
                # CHECK 1: Did the model finish successfully?
                if 'content' not in candidate:
                    return None
                    
                # CHECK 2: Does the content have parts?
                content = candidate['content']
                if 'parts' not in content or not content['parts']:
                    return None
                    
                # Success
                return content['parts'][0]['text'].strip()

            elif response.status_code == 503:
                # print("[ENHANCER] Server Busy")
                return None
            else:
                # print(f"[ENHANCER] API Error {response.status_code}")
                return None

        except Exception as e:
            # print(f"[ENHANCER] Error: {e}")
            return None

# ============================================================================
# RATE LIMITER (unchanged)
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
# MAIN PIPELINE (REFACTORED)
# ============================================================================
class Pipeline:
    def __init__(self, dataset_path=str(DATASET), db_path=str(CHROMA_STORAGE), config_path=str(CONFIG)):
        
        self.config = self.load_config(config_path)
        print(f"[INFO] Loaded config")
        load_dotenv()
        self.internet_status = True
        
        # Initialize rate limiter
        sec_conf = self.config.get('security', {})
        rate_limit_conf = sec_conf.get('rate_limit', {})
        max_req = rate_limit_conf.get('max_request', 5)
        period = rate_limit_conf.get('period_seconds', 60)
        self.limiter = RateLimiter(max_request=max_req, period_seconds=period)
        print(f"[INFO] Rate limiter: {max_req}/{period}s")
        
        # Setup RAG model
        RAG_MODEL = os.path.join(os.path.dirname(__file__), "..", "models", self.config['rag']['model_path'])
        self.raw_model = SentenceTransformer(RAG_MODEL, device="cpu")
        self.client = chromadb.PersistentClient(path=db_path)
        self.embedding = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=RAG_MODEL, device="cpu"
        )
        
        # Initialize semantic cache (NEW - uses separate ChromaDB collection)
        cache_threshold = self.config.get('cache', {}).get('similarity_threshold', 0.88)
        cache_collection_name = self.config.get('cache', {}).get('collection_name', 'query_cache')
        self.semantic_cache = SemanticCache(
            client=self.client,
            embedding_function=self.embedding,
            collection_name=cache_collection_name,
            similarity_threshold=cache_threshold
        )
        print(f"[INFO] Semantic cache initialized (threshold: {cache_threshold})")
        
        # Initialize background enhancer (NEW)
        gemini_key = os.getenv('GEMINI_API_KEY')
        if gemini_key:
            print(f"[INFO] Gemini API key loaded (ends with: ...{gemini_key[-4:]})")
        else:
            print("[WARN] No GEMINI_API_KEY in environment - background enhancement disabled")
        
        self.enhancer = BackgroundEnhancer(gemini_key, self.semantic_cache, self.config)
        self.enhancer.start()
        print("[INFO] Background enhancer started")
        
        # Initialize controller and entity extractor
        self.controller = Controller(self.config, self.raw_model)
        print("[INFO] Rule-based controller initialized")
        self.entity_extractor = EntityExtractor(self.config)
        print("[INFO] Entity extractor initialized")
        
        # Profanity filter
        profanity.load_censor_words()
        profanity.add_censor_words(self.config['profanity'])
        
        # Setup ChromaDB collection (unchanged logic)
        current_data_hash = self.dataset_hash(dataset_path)
        stored_hash = None
        hash_file_path = os.path.join(db_path, self.config['system']['hash_file'])
        
        if os.path.exists(hash_file_path):
            with open(hash_file_path, 'r') as f:
                stored_hash = f.read().strip()
        
        rebuild_required = (current_data_hash is None)
        
        try:
            # This is the STATIC collection (your original dataset)
            self.collection = self.client.get_collection(
                name=self.config['rag']['collection_name'],
                embedding_function=self.embedding
            )
            if stored_hash == current_data_hash and current_data_hash is not None:
                print("[INFO] Using existing STATIC dataset")
                rebuild_required = False
            else:
                print("[INFO] STATIC dataset rebuild required")
                rebuild_required = True
        except Exception:
            rebuild_required = True
        
        if rebuild_required:
            try:
                self.client.delete_collection(name=self.config['rag']['collection_name'])
            except:
                pass
            
            self.collection = self.client.create_collection(
                name=self.config['rag']['collection_name'],
                embedding_function=self.embedding
            )
            self.load_dataset(dataset_path)
            
            os.makedirs(db_path, exist_ok=True)
            with open(hash_file_path, 'w') as f:
                f.write(current_data_hash)
            print("[INFO] STATIC dataset rebuilt and loaded")

    def load_config(self, config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        except FileNotFoundError:
            print(f"Config file not found: {config_path}")
            exit(1)
        except yaml.YAMLError as e:
            print(f"Invalid YAML: {e}")
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
        except FileNotFoundError:
            print(f"Dataset not found: {dataset_path}")
            exit(1)
        except json.JSONDecodeError as e:
            print(f"Invalid JSON: {e}")
            exit(1)
        
        documents = []
        metadatas = []
        ids = []
        
        for idx, item in enumerate(data):
            if 'input' not in item or 'output' not in item:
                continue
            
            documents.append(item['input'])
            
            meta = {
                "question": item['input'],
                "answer": item['output'],
                "title": item.get('title', 'General Info'),
                "topic": item.get('topic', 'General'),
                "summary_offline": item.get('summary_offline', item['output'])
            }
            
            # Optional filters
            for field in ['budget', 'location', 'activities', 'group_type', 'skill_level']:
                if field in item:
                    meta[field] = item[field]
            
            metadatas.append(meta)
            ids.append(str(idx))
        
        self.collection.add(documents=documents, metadatas=metadatas, ids=ids)
        print(f"[INFO] Loaded {len(documents)} Q&A pairs")

    def check_profanity(self, text):
        return profanity.contains_profanity(text)

    def normalize_query(self, text):
        """Simple normalization - lowercase and trim"""
        return text.strip().lower()

    def protect(self, user_input):
        """Protect place names during translation"""
        if not user_input or not user_input.strip():
            return user_input or ""

        temp = user_input
        markers = {}

        for place_name in self.config['protected_places']:
            if place_name.lower() in temp.lower():
                # Use UUID to avoid collision
                marker = f"__PLACE_{uuid.uuid4().hex[:8]}__"
                temp = re.sub(
                    re.escape(place_name), 
                    marker, 
                    temp, 
                    flags=re.IGNORECASE, 
                    count=1
                )
                markers[marker] = place_name

        try:
            from deep_translator import GoogleTranslator

            
            if self.internet_status: # Only try if we know we have internet
                temp = GoogleTranslator(source='auto', target='en').translate(temp)
                print(f"[TRANSLATE] '{user_input}' → '{temp}'")
        except Exception as e:
            print(f"[TRANSLATE ERROR] {e}")
            # Fallback: Just use the original input if translation fails
            temp = user_input

        # Restore place names
        for marker, place_input in markers.items():
            temp = temp.replace(marker, place_input)

        return temp

    def extract_keywords(self, question):
        """Extract topic keywords from question"""
        found = []
        question_lower = question.lower()
        
        for topic, words in self.config['keywords'].items():
            for word in words:
                pattern = r'\b' + re.escape(word) + r'\b'
                if re.search(pattern, question_lower):
                    found.append(topic)
                    break
        
        return found if found else ['general']

    def search(self, question, where_filter=None):
        """Core RAG search - returns raw facts"""
        print(f"[RAG SEARCH] Query: '{question[:50]}...'")
        
        if len(question) < 3:
            return "Please ask a complete question."
        
        # Detect listing queries
        listing_words = ['all', 'top', 'best', 'list', 'recommend', 'show me', 'what are', 'multiple']
        is_listing = any(word in question.lower() for word in listing_words)
        n_results = 20 if is_listing else 10
        
        results = self.collection.query(
            query_texts=[question],
            n_results=n_results,
            where=where_filter
        )
        
        if not results['documents'][0]:
            return "I don't have information about that. Ask about beaches, food, or activities in Catanduanes!"
        
        # Collect good matches with deduplication
        good_answers = []
        seen_places = set()
        
        for i, metadata in enumerate(results['metadatas'][0]):
            confidence = results['distances'][0][i]
            
            if confidence <= self.config['rag']['confidence_threshold']:
                answer = metadata.get('summary_offline', metadata['answer'])
                
                # Extract places for deduplication
                places_in_answer = self.key_places(answer)
                if places_in_answer and places_in_answer[0] in seen_places:
                    continue
                
                good_answers.append(answer)
                seen_places.update(places_in_answer)
                
                max_results = 10 if is_listing else 3
                if len(good_answers) >= max_results:
                    break
        
        if not good_answers:
            return "I'm not sure about that. Can you rephrase or ask about Catanduanes tourism?"
        print(f"[RAG DEBUG] Retrieved {len(good_answers)} facts from database.")
        return " ".join(good_answers)

    def key_places(self, text):
        """Extract place names from text"""
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
        """Get coordinates for places"""
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

    # ========================================================================
    # MAIN ASK METHOD - CORRECTED FLOW
    # ========================================================================
    def ask(self, user_input):
        start_time = time.time()
        
        # 1. Rate limiting (Fastest check)
        if not self.limiter.is_allowed():
            wait_time = self.limiter.get_remaining_time()
            return (f"You are sending messages too fast! Please wait {wait_time} seconds.", [])
        
        # 2. Profanity check (Fast string check)
        if self.check_profanity(user_input):
            return ("I am unable to process that language. Please ask politely about Catanduanes tourism.", [])
        
        # 3. Normalize input
        normalized = self.normalize_query(user_input)

        if self.controller._is_gibberish(normalized):
            print(f"[BLOCK] Gibberish detected in raw input: '{normalized}'")
            return (self.controller.get_nonsense_response(), [])
        
        # 5. Semantic cache check (Now safe to check)
        cached = self.semantic_cache.get(normalized)
        if cached:
            answer, places, version = cached
            if version == 'raw':
                print("[CACHE] Entry is RAW. Retrying background enhancement...")
                self.enhancer.enqueue(normalized, answer, answer)
                
            elapsed = time.time() - start_time
            print(f"[RESPONSE TIME] {elapsed:.3f}s (CACHE HIT)")
            return (answer, places)
        
        # 6. Protect place names and translate (Expensive API call)
        translated_query = self.protect(user_input)
        print(f"[QUERY] Original: '{user_input}' → Translated: '{translated_query}'")
        
        # 7. Intent analysis (Full check)
        analysis = self.controller.analyze_query(translated_query)
        print(f"[INTENT] {analysis['intent']} (confidence: {analysis['confidence']:.2f})")
        
        if analysis['intent'] == 'greeting':
            response = self.controller.get_greeting_response()
            return (response, [])
        
        if analysis['intent'] == 'nonsense':
            response = self.controller.get_nonsense_response()
            return (response, [])
        
        if analysis['intent'] == 'unclear' or analysis['confidence'] < 0.5:
            print(f"[BLOCK] Low confidence ({analysis['confidence']:.2f}). Blocking RAG.")
            return (self.controller.get_nonsense_response(), [])
        
        # 8. Entity extraction
        entities = self.entity_extractor.extract(translated_query)
        print(f"[ENTITIES] {entities}")
        
        # Build ChromaDB filter
        constraints = []
        if entities.get('places'):
            constraints.append({"location": entities['places'][0]})
        if entities.get('budget'):
            constraints.append({"budget": entities['budget']})
        if entities.get('activities') and len(entities['activities']) > 0:
            constraints.append({"activities": entities['activities'][0]})
        if entities.get('group_type'):
            constraints.append({"group_type": entities['group_type']})
        if entities.get('skill_level'):
            constraints.append({"skill_level": entities['skill_level']})
        
        where_filter = None
        if len(constraints) > 1:
            where_filter = {"$and": constraints}
        elif len(constraints) == 1:
            where_filter = constraints[0]
        
        # 9. RAG retrieval
        raw_facts = self.search(translated_query, where_filter=where_filter)
        
        # Extract places
        places = self.key_places(raw_facts)[:5]
        
        # Check if error response
        if "don't have information" in raw_facts.lower() or "not sure" in raw_facts.lower():
            return (raw_facts, [])
        
        # Construct raw answer
        raw_answer = f"{raw_facts}"
        
        # Store in cache
        self.semantic_cache.set(normalized, raw_answer, places)
        
        # Enqueue background enhancement
        self.enhancer.enqueue(normalized, raw_facts, raw_answer)
        
        elapsed = time.time() - start_time
        print(f"[RESPONSE TIME] {elapsed:.3f}s (RAW + QUEUED)")
        
        # Return RAW answer immediately
        return (raw_answer, places)

    def guide_question(self):
        """Interactive CLI"""
        messages = self.config['messages']
        print(messages['intro_message'])
        print(messages['exit_commands'])
        
        def response(user_input):
            if user_input.lower() in self.config['exit_commands']:
                print(messages['enjoy_stay'])
                self.enhancer.stop()  # Clean shutdown
                exit()
            
            if not user_input.strip():
                print(f"Pathfinder: {messages['enter_something']}")
                return
            
            natural_response, places = self.ask(user_input)
            print(f"Pathfinder: {natural_response}\n")
            
            if places:
                print(f"[PLACES] {places}")
        
        # Initial question
        pref = input(messages['initial_question']).strip()
        if pref:
            response(pref)
        
        # Main loop
        while True:
            qry = input("You: ").strip()
            response(qry)


if __name__ == '__main__':
    pipeline = Pipeline(dataset_path=str(DATASET), config_path=str(CONFIG))
    pipeline.guide_question()