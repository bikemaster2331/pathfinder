import chromadb
from chromadb.utils import embedding_functions
import json
import torch
from deep_translator import GoogleTranslator
import requests
import time
import os
from dotenv import load_dotenv
import re
import uuid
from better_profanity import profanity
import hashlib
import yaml
import re
from pathlib import Path
from controller import Controller
from entity_extractor import EntityExtractor
from sentence_transformers import SentenceTransformer

BASE_DIR = Path(__file__).parent 
DATASET = BASE_DIR / "dataset" / "dataset.json"
CONFIG = BASE_DIR / "config" / "config.yaml"
CHROMA_STORAGE = BASE_DIR / "chroma_storage" 

class Pipeline:
    def __init__(self, dataset_path=str(DATASET), db_path = str(CHROMA_STORAGE), config_path=str(CONFIG)):

        self.config = self.load_config(config_path)
        print(f"[DEBUG] Loaded thresholds:")
        print(self.config['system']['welcome_message'])
        load_dotenv()
        # Internet tracking
        self.internet_status = None
        self.last_internet_check = 0
        
        # Setup RAG
        RAG_MODEL = os.path.join(os.path.dirname(__file__), "..", "models", self.config['rag']['model_path'])
        self.raw_model = SentenceTransformer(RAG_MODEL, device="cpu")
        self.client = chromadb.PersistentClient(path=db_path)
        self.embedding = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=RAG_MODEL,
            device="cpu"                     
        )
        

        self.controller = Controller(self.config, self.raw_model)
        print("[INFO] Rule-based controller initialized")
        self.entity_extractor = EntityExtractor(self.config)
        print("[INFO] Entity extractor initialized")

        profanity.load_censor_words()
        profanity.add_censor_words(self.config['profanity'])

        current_data_hash = self.dataset_hash(dataset_path)
        stored_hash = None

        hash_file_path = os.path.join(db_path, self.config['system']['hash_file'])
        if os.path.exists(hash_file_path):
            with open(hash_file_path, 'r') as f:
                stored_hash = f.read().strip()

        rebuild_required = (current_data_hash is None)

        try:
            self.collection = self.client.get_collection(
                name=self.config['rag']['collection_name'],
                embedding_function=self.embedding
            )
            if stored_hash == current_data_hash and current_data_hash is not None:
                print("No rebuild required")
                rebuild_required = False
            else:
                print("Rebuilding database...")
                rebuild_required = True

        except Exception:
            rebuild_required = True
        
        if rebuild_required:
            try:
                self.client.delete_collection(name=self.config['rag']['collection_name'])
            except:
                pass
            
            try:
                self.collection = self.client.create_collection(
                    name=self.config['rag']['collection_name'],
                    embedding_function=self.embedding
                )
                self.load_dataset(dataset_path) 
                print("Created and loaded NEW knowledge_base with data.")
                
                # 4. Save the new hash to disk
                os.makedirs(db_path, exist_ok=True)
                with open(hash_file_path, 'w') as f:
                    f.write(current_data_hash)
                    
            except Exception as create_error:
                print(f"Can not create: {create_error}")
                exit(1)

    def load_config(self, config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        except FileNotFoundError:
            print(f"Config file not found {config_path}")
            exit(1)
        except yaml.YAMLError as e:
            print(f"Invalid YAML in config {e}")
            exit(1)

    def dataset_hash(self, dataset_path):
        hasher = hashlib.md5()
        try:
            with open(dataset_path, 'rb') as f:
                buf = f.read()
                hasher.update(buf)
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
            print(f"Invalid JSON in dataset: {e}")
            exit(1)

        for idx, item in enumerate(data):
            if 'input' not in item or 'output' not in item:
                print(f"Skipping invalid entry at index {idx}")
                continue

        documents = []
        metadatas = []
        ids = []

        for idx, item in enumerate(data):
            if 'input' not in item or 'output' not in item:
                print(f"Skipping invalid entry at index {idx}")
                continue
                
            documents.append(item['input'])
            metadatas.append({
                "question": item['input'],
                "answer": item['output'],
                "title": item.get('title', 'General Info'),
                "topic": item.get('topic', 'General'),
                "summary_offline": item.get('summary_offline', item['output'])
            })
            ids.append(str(idx))

        
        self.collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
        print(f"Loaded {len(documents)} Q&A pairs")

    def checkint(self):
        """Check internet with caching"""
        current_time = time.time()
        
        if self.internet_status is not None and \
        (current_time - self.last_internet_check) < self.config['internet']['cache_duration']:
            return self.internet_status
        
        try:
            requests.get(
                self.config['internet']['test_url'], 
                timeout=self.config['internet']['timeout']
                )
            self.internet_status = True
        except (requests.ConnectionError, requests.Timeout):
            self.internet_status = False
        
        self.last_internet_check = current_time
        return self.internet_status
        
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

        # Translate the rest
        try:    
            temp = GoogleTranslator(source='auto', target='en').translate(temp)
            print(f"[DEBUG] Translated: '{user_input}' → '{temp}'")
        except Exception as e:
            print(f"[DEBUG] Translation failed: {e}")

        # Restore place names
        for marker, place_input in markers.items():
            temp = temp.replace(marker, place_input)

        return temp

    def search_multi_topic(self, topics, translated_query, results_per_topic=1):
        all_results = []
        n_results = self.config['rag']['search_results']

        for topic in topics:
            print(f"[DEBUG] Searching RAG for topic: '{topic}'")

            search_query = f"{topic}"

            results = self.collection.query(
                query_texts=[search_query],
                n_results=n_results
            )

            if not results['documents'][0]:
                print(f"[DEBUG] No results found for topic: {topic}")
                continue
            
            # Collect results for this topic
            topic_results = []
            for i, metadata in enumerate(results['metadatas'][0]):
                confidence = results['distances'][0][i]
                print(f"[DEBUG]   Result {i+1} for '{topic}': confidence={confidence:.3f}")

                if confidence <= self.config['rag']['multi_topic_threshold']:
                    topic_results.append({
                        'text': metadata.get('summary_offline', metadata['answer']),
                        'confidence': confidence,
                        'topic': topic
                    })
                    print(f"[DEBUG]   Added (passed threshold)")
                else:
                    print(f"[DEBUG]   Rejected (> {self.config['rag']['multi_topic_threshold']})")

            # Sort by confidence and take top N for this topic
            topic_results.sort(key=lambda x: x['confidence'])
            selected = topic_results[:results_per_topic]
            all_results.extend(selected)

            print(f"[DEBUG] Selected {len(selected)} result(s) for '{topic}'")

        # Limit total results to prevent spam
        max_total_results = 3
        all_results.sort(key=lambda x: x['confidence'])
        all_results = all_results[:max_total_results]

        if all_results:
            print(f"[DEBUG] Total results: {len(all_results)} from {len(topics)} topics")
        else:
            print(f"[DEBUG] No results passed threshold for any topic!")

        return [r['text'] for r in all_results]
    
    def search(self, question):
        """Search with multiple results and deduplication - NO Gemini"""
        print(f"[DEBUG] Searching for: '{question}'")

        if len(question) < 3:
            return "Please ask a question."
        
        # Detect listing queries for more results
        listing_words = ['all', 'top', 'best', 'list', 'recommend', 'show me', 'what are', 'multiple']
        is_listing = any(word in question.lower() for word in listing_words)
        
        # Get more results for listing queries
        n_results = 20 if is_listing else 10
        print(f"[DEBUG] Listing query: {is_listing}, fetching {n_results} results")
        
        results = self.collection.query(
            query_texts=[question],
            n_results=n_results
        )
        
        if not results['documents'][0]:
            return "I don't have information about that. Ask about beaches, food, or activities!"
        
        # Collect multiple good matches with deduplication
        good_answers = []
        seen_places = set()
        
        for i, metadata in enumerate(results['metadatas'][0]):
            confidence = results['distances'][0][i]
            
            if confidence <= self.config['rag']['confidence_threshold']:
                answer = metadata['answer']
                
                # Extract places to avoid duplicates
                places_in_answer = self.key_places(answer)
                
                # Skip if we already covered this place
                if places_in_answer and places_in_answer[0] in seen_places:
                    print(f"[DEBUG] Match {i+1} skipped (duplicate: {places_in_answer[0]})")
                    continue
                
                good_answers.append(answer)
                seen_places.update(places_in_answer)
                print(f"[DEBUG] Match {i+1} confidence: {confidence:.3f} - Added")
                
                # More results for listing queries
                max_results = 10 if is_listing else 3
                if len(good_answers) >= max_results:
                    print(f"[DEBUG] Reached max {max_results} results")
                    break
        
        if not good_answers:
            return "I'm not sure about that. Can you rephrase or ask about Catanduanes tourism?"
        
        print(f"[DEBUG] Returning {len(good_answers)} unique answers")
        
        # Return all answers concatenated
        return " ".join(good_answers)

    def make_natural(self, question, fact):
        """Simple wrapper - NO Gemini processing"""
        
        # Check if the RAG search found an error message
        if "don't have information" in fact.lower() or "not sure" in fact.lower():
            return fact  # Return error as-is
        
        # Just return the raw RAG facts
        print(self.config['offline']['intent'])
        return f"{fact}"
    
    def key_places(self, facts):
        """Extract places with word boundaries for better matching"""
        places = self.config['places']
        found_places = []
        facts_lower = facts.lower()
        
        # Sort by length (longest first) to match "Bato Church" before "Bato"
        sorted_places = sorted(places, key=len, reverse=True)
        
        for place in sorted_places:
            place_lower = place.lower()
            
            # Try word boundary match first (more precise)
            pattern = r'\b' + re.escape(place_lower) + r'\b'
            if re.search(pattern, facts_lower) and place not in found_places:
                found_places.append(place)
                continue
            
            # Fallback: substring match (catches "near Puraran" for "Puraran Beach")
            if place_lower in facts_lower and place not in found_places:
                found_places.append(place)

        return found_places
    
    def get_place_data(self, found_places):
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
    
    def check_profanity(self, text):
        return profanity.contains_profanity(text)
        
    def ask(self, user_input):
        
        if self.check_profanity(user_input):
            return ("I am unable to process that language. Please ask your question politely so I can assist you with Catanduanes tourism", [])
        
        analysis = self.controller.analyze_query(user_input)
        print(f"[DEBUG] Controller: {analysis['intent']} (confidence: {analysis['confidence']})")

        if analysis['intent'] == 'greeting':
            return (self.controller.get_greeting_response(), [])
        if analysis.get('has_greeting', False):
            print("[DEBUG] Greeting detected, but also has question - processing...")
        
        if analysis['intent'] == 'nonsense':
            return (self.controller.get_nonsense_response(), [])
        
        if analysis['confidence'] < 0.5:
            print(f"[WARN] Low confidence query: {analysis['reason']}")
            if analysis['confidence'] < 0.4:
                suggestions = [
                    "Try: 'Where can I surf?'",
                    "Or: 'What food should I try?'",
                    "Or: 'Where can I stay?'"
                ]
                return (
                    f"I'm not sure what you're asking about. {' '.join(suggestions)}", 
                    []
                )
            
        entities = self.entity_extractor.extract(user_input)
        print(f"[DEBUG] Extracted entities: {entities}")

        if any(entities.values()):
            enhanced_query = self.entity_extractor.build_enhanced_query(entities)
            print(f"[DEBUG] Enhanced query: '{enhanced_query}'")
            if not enhanced_query or len(enhanced_query.strip()) < 2:
                print("[DEBUG] Enhanced query too short, using original input")
                convert = self.protect(user_input)
            else:
                convert = self.protect(enhanced_query)
        else:
            convert = self.protect(user_input)
        
        topics = self.extract_keywords(convert)
        print(f"[DEBUG] Detected topics: {topics}")
        
        if len(topics) > 1 and topics != ['general']:
            results_per_topic = self.config['rag'].get('results_per_topic', 3)
            answers = self.search_multi_topic(topics, convert, results_per_topic)
            fact = " ".join(answers) if answers else "I don't have info about those topics"
        else:
            fact = self.search(convert)  # Now returns multiple deduplicated results

        # 4. Extract places from the retrieved facts
        places = self.key_places(fact)
        places = places[:5]
        
        # 5. Check if error message
        if "don't have information" in fact.lower() or "not sure" in fact.lower():
            return (fact, [])
        
        # 6. Simple wrapper (no Gemini)
        natural_response = self.make_natural(user_input, fact)
        
        # 7. Return the processed response and the extracted places list
        return (natural_response, places)

    def guide_question(self):

        messages = self.config['messages']

        print(messages['intro_message'])
        if self.checkint():
            print(messages['mode_online'])
        else:
            print(messages['mode_offline'])
        print(messages['exit_commands'])

        def response(user_input):
            if user_input.lower() in self.config['exit_commands']:
                print(messages['enjoy_stay'])
                exit()
            
            if not user_input.strip():
                print(f"Pathfinder: {messages['enter_something']}")
                return
            
            natural_response, places = self.ask(user_input) 
            print(f"Pathfinder: {natural_response}\n")
            
            if places:
                print(f"[DEBUG] Found places: {places}")

        # Initial preference question
        pref = input(messages['initial_question']).strip()
        if pref:
            response(pref)

        # Main loop
        while True:
            qry = input("You: ").strip()
            response(qry)

if __name__ == '__main__':
    cbot = Pipeline(dataset_path=str(DATASET), config_path=str(CONFIG))
    cbot.guide_question()