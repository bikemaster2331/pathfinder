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

class Pipeline:
    def __init__(self, dataset_path="dataset/dataset.json", db_path ="./chroma_storage"):
        print("Welcome to Catanduanes!!")

        load_dotenv()

        # Internet tracking
        self.internet_status = None
        self.last_internet_check = 0
        
        # Setup Gemini
        self.setup_gemini()
        
        # Setup RAG
        RAG_MODEL = os.path.join(os.path.dirname(__file__), "..", "models", "multilingual-MiniLM-L12-v2")
        self.client = chromadb.PersistentClient(path=db_path)
        self.embedding = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=RAG_MODEL,
            device="cpu"                     
        )

        try:
            self.collection = self.client.get_collection(
                name="knowledge_base",
                embedding_function=self.embedding
            )
        except Exception as e:
            print(f"❌ Failed to load knowledge base, creating new collection: {e}")
            try:
                self.collection = self.client.create_collection(
                    name="knowledge_base",
                    embedding_function=self.embedding
                )
                self.load_dataset(dataset_path) 
                print("✅ Created and loaded knowledge_base with data.")
            except Exception as create_error:
                print(f"Can not create: {create_error}")
                exit(1)
    
    def setup_gemini(self):
        try:
            import google.generativeai as genai
            api_key = os.getenv("GEMINI_API_KEY")  
            if not api_key:
                print("⚠️ GEMINI_API_KEY not found in environment")
                self.has_gemini = False
                return
            
            genai.configure(api_key=api_key)
            self.gemini = genai.GenerativeModel('gemini-2.5-flash')
            self.has_gemini = True
        except Exception as e:
            print(f"⚠️ Gemini setup failed: {e}")
            self.has_gemini = False

    def load_dataset(self, dataset_path):
        try:
            with open(dataset_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except FileNotFoundError:
            print(f"❌ Dataset not found: {dataset_path}")
            exit(1)
        except json.JSONDecodeError as e:
            print(f"❌ Invalid JSON in dataset: {e}")
            exit(1)

        for idx, item in enumerate(data):
            if 'input' not in item or 'output' not in item:
                print(f"⚠️ Skipping invalid entry at index {idx}")
                continue

        documents = []
        metadatas = []
        ids = []

        for idx, item in enumerate(data):
            doc = item['input']
            documents.append(doc)
            metadatas.append({
                "question": item['input'],
                "answer": item['output'],
                # 🛑 FIX: Use .get() method instead of callable ()
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
        print(f"📊 Loaded {len(documents)} Q&A pairs")

    def checkint(self, timeout=2, cache_duration=60):
        """Check internet with caching"""
        current_time = time.time()
        
        if self.internet_status is not None and \
        (current_time - self.last_internet_check) < cache_duration:
            return self.internet_status
        
        try:
            requests.get("https://www.google.com", timeout=timeout)
            self.internet_status = True
        except (requests.ConnectionError, requests.Timeout):
            self.internet_status = False
        
        self.last_internet_check = current_time
        return self.internet_status
        
    def extract_keywords(self, question):
        """Extract topic keywords from question"""
        keywords = {
            'surfing': ['surf', 'surfing', 'waves', 'board', 'mag-surf'],
            'swimming': ['swim', 'swimming', 'langoy', 'lumangoy', 'maligo'],  
            'beaches': ['beach', 'dalampasigan'],  
            'hiking': ['hike', 'hiking', 'trek', 'trail', 'bundok', 'akyat'],
            'food': ['eat', 'food', 'restaurant', 'kain', 'kumain', 'pagkain', 'masarap'],
            'accommodation': ['stay', 'hotel', 'resort', 'tulog', 'matulog', 'pahinga'],
            'sightseeing': ['visit', 'see', 'tour', 'bisita', 'tingnan', 'puntahan', 'activity', 'activities', 'gawing']
        }

        found = []
        question_lower = question.lower()
        
        for topic, words in keywords.items():
            if any(word in question_lower for word in words):
                found.append(topic)
        
        return found if found else ['general']
    
    def protect(self, user_input):
        """Protect place names during translation"""
        protected = [
            "Puraran Beach", "Twin Rock Beach", "Binurong Point", "Balacay Point",
            "Bato Church", "Mount Cagmasoso", "Maribina Falls",
            "Puraran", "Twin Rock", "Binurong", "Balacay", "Bato", 
            "Cagmasoso", "Maribina", "Virac", "Baras", "Catanduanes"
        ]

        temp = user_input
        markers = {}

        for place_name in protected:
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

    def search_multi_topic(self, topics, translated_query, n_results=3):
        """Search RAG for multiple topics - increased to 3 results per topic"""
        all_results = []
        
        for topic in topics:
            print(f"[DEBUG] Searching RAG for topic: '{topic}'")
            
            # Combine topic with translated query for better context
            search_query = f"{topic} {translated_query}"
            
            results = self.collection.query(
                query_texts=[search_query],
                n_results=n_results
            )
            
            if not results['documents'][0]:
                print(f"[DEBUG] No results found for topic: {topic}")
                continue
            
            # Get all results with good confidence
            for i, metadata in enumerate(results['metadatas'][0]):
                confidence = results['distances'][0][i]
                if confidence <= 0.7:  # Only include good matches
                    all_results.append({
                        'text': metadata['summary_offline'],
                        'confidence': confidence,
                        'topic': topic
                    })
        all_results.sort(key=lambda x: x['confidence'])
        print(f"[DEBUG] Added result with confidence: {all_results[-1]['confidence']:.3f}") # Print highest confidence result added
        
        return [r['text'] for r in all_results[:3]]

    
    def search(self, question, n_results=3):
        """Search for single question - increased results"""
        print(f"[DEBUG] Searching for: '{question}'")
        
        results = self.collection.query(
            query_texts=[question],
            n_results=n_results
        )
        
        if not results['documents'][0]:
            return "I don't have information about that. Ask about beaches, food, or activities!"
        
        # Collect all good matches
        good_answers = []
        for i, metadata in enumerate(results['metadatas'][0]):
            confidence = results['distances'][0][i]
            if confidence <= 0.473:
                good_answers.append(metadata['answer'])
                print(f"[DEBUG] Match {i+1} confidence: {confidence:.3f}")
        
        if not good_answers:
            return "I'm not sure about that. Can you rephrase or ask about Catanduanes tourism?"
        
        # Return all good answers combined
        return " ".join(good_answers)

    def make_natural(self, question, fact):
        """Make response natural using Gemini or fallback"""
        
        # 1. Try Gemini if online
        if self.has_gemini and self.checkint():
            try:
                prompt = f"""You are Pathfinder — a calm, polite, helpful, always excited Catanduanes tourism assistant, similar to Baymax.
Your responses should sound gentle, clear, and factual, while maintaining a friendly tone. 

Tourist asked: {question}
Facts: {fact}

Respond in the same language as the tourist's question.
Use only the information from the facts.
Give a single, concise, and natural-sounding sentence.
Do not add greetings or extra commentary be direct yet kind. You may include exclamation marks at the end to sound excited."""
                
                response = self.gemini.generate_content(prompt)
                return response.text
                
            except Exception as e:
                print(f"[DEBUG] Gemini error: {e}")
                # Fall through to the OFFLINE FALLBACK
        
        # 2. 🛑 FIX: STRUCTURED OFFLINE FALLBACK (Always returns a clean, templated response)

        # Check if the RAG search found an error message string (from step 5 of ask)
        if "don't have information" in fact.lower() or "not sure" in fact.lower():
            return f"I am currently offline, and I apologize for the limited service. {fact}"
        
        print("[DEBUG] Falling back to structured offline RAG fact.")
        
        return (
            f" I cannot provide a conversational response right now, but here is the essential information I found for you:\n\n"
            f"➡️ {fact}"
        )
    
    def key_places(self, facts):
        """Extract places from facts - now includes partial matches"""
        places = [
            "Puraran Beach", "Twin Rock Beach", "Binurong Point",
            "Balacay Point", "Bato Church", "Mount Cagmasoso",
            "Maribina Falls", "Virac", "Baras", "Mamita's Grill",
            "Bato",
            "Puraran", "Twin Rock", "Binurong", "Balacay", 
        ]

        found_places = []
        facts_lower = facts.lower()
        
        # Sort by length (longest first) to match "Bato Church" before "Bato"
        sorted_places = sorted(places, key=len, reverse=True)
        
        for place in sorted_places:
            if place.lower() in facts_lower and place not in found_places:
                found_places.append(place)

        return found_places
        
    def ask(self, user_input):
        """Main ask function with multi-topic support and natural responses"""
        
        # 1. Preprocess and Translate Input
        convert = self.protect(user_input)
        
        # 2. Extract keywords
        topics = self.extract_keywords(convert)
        print(f"[DEBUG] Detected topics: {topics}")
        
        # 3. Get facts from RAG
        if len(topics) > 1 and topics != ['general']:
            answers = self.search_multi_topic(topics, convert)
            fact = " ".join(answers) if answers else "I don't have info about those topics"
        else:
            fact = self.search(convert)

        # 4. Extract places from the retrieved fact
        places = self.key_places(fact)
        
        # 5. Check if error message
        if "don't have information" in fact.lower() or "not sure" in fact.lower():
            return (fact, [])
        
        # 6. Make it natural - pass ORIGINAL user_input, not translated
        natural_response = self.make_natural(user_input, fact)
        
        # 7. Return the processed response and the extracted places list
        return (natural_response, places)

    def guide_question(self):
        print("\nI am Pathfinder, your personal guide!")
        
        if self.checkint():
            print("Online mode - Enhanced responses")
        else:
            print("Offline mode - Basic responses")
        
        print("Type 'exit' or 'quit' to end conversation\n")

        def response(user_input):
            if user_input.lower() in ['exit', 'quit', 'bye']:
                print("Pathfinder: Enjoy your stay!")
                exit()
            
            if not user_input.strip():
                print("Pathfinder: Please enter something.\n")
                return
            
            natural_response, places_list = self.ask(user_input) 
            print(f"Pathfinder: {natural_response}\n")
            
            if places_list:
                print(f"[DEBUG] Found places: {places_list}")

        # Initial preference question
        pref = input("What activities do you prefer? (Hiking/Swimming/Surfing/etc...): ").strip()
        if pref:
            response(pref)

        # Main loop
        while True:
            qry = input("You: ").strip()
            response(qry)

    def maps(self, places):
        pass

if __name__ == '__main__':
    cbot = Pipeline(dataset_path="dataset/dataset.json")
    cbot.guide_question()