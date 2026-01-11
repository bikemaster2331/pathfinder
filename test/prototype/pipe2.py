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

class Pipeline:
    def __init__(self, dataset_path="dataset/dataset.json"):
        print("Welcome to Catanduanes!!")

        load_dotenv()

        # Internet tracking
        self.internet_status = None
        self.last_internet_check = 0
        
        # Setup Gemini
        self.setup_gemini()
        
        # Setup RAG
        self.client = chromadb.Client()
        self.embedding = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
            device="cuda" if torch.cuda.is_available() else "cpu"
        )

        try:
            self.collection = self.client.get_collection(
                name="knowledge_base",
                embedding_function=self.embedding
            )
        except:
            self.collection = self.client.create_collection(
                name="knowledge_base",
                embedding_function=self.embedding
            )
            self.load_dataset(dataset_path)
    
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
        with open(dataset_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        documents = []
        metadatas = []
        ids = []

        for idx, item in enumerate(data):
            doc = item['input']
            documents.append(doc)
            metadatas.append({
                "question": item['input'],
                "answer": item['output']
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
            'swimming': ['swim', 'swimming', 'langoy', 'lumangoy', 'maligo'],  # Removed 'beach'
            'beaches': ['beach', 'dalampasigan'],  # Separate beaches category
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
        
        # Mark all protected place names
        for i, place_input in enumerate(protected):
            if place_input.lower() in user_input.lower():
                marker = f"__PLACE{i}__"
                temp = re.sub(re.escape(place_input), marker, temp, flags=re.IGNORECASE, count=1)
                markers[marker] = place_input

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
                    all_results.append(metadata['answer'])
                    print(f"[DEBUG] Added result with confidence: {confidence:.3f}")
        
        return all_results
    
    def search(self, question, n_results=5):
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
            if confidence <= 0.7:
                good_answers.append(metadata['answer'])
                print(f"[DEBUG] Match {i+1} confidence: {confidence:.3f}")
        
        if not good_answers:
            return "I'm not sure about that. Can you rephrase or ask about Catanduanes tourism?"
        
        # Return all good answers combined
        return " ".join(good_answers)

    def make_natural(self, question, fact):
        """Make response natural using Gemini or fallback"""
        
        # Try Gemini if online
        if self.has_gemini and self.checkint():
            try:
                prompt = f"""You are Pathfinder — a calm, polite, and helpful Catanduanes tourism assistant, similar to Baymax.
Your responses should sound gentle, clear, and factual, while maintaining a friendly tone.

Tourist asked: {question}
Facts: {fact}

Respond in the same language as the tourist’s question.
Use only the information from the facts.
Give a single, concise, and natural-sounding sentence.
Do not add greetings, emotions, or extra commentary — be direct yet kind."""
                
                response = self.gemini.generate_content(prompt)
                return response.text
                
            except Exception as e:
                print(f"[DEBUG] Gemini error: {e}")
        
        # Offline fallback - return fact as-is
        return f"{fact}"
    
    def key_places(self, facts):
        """Extract places from facts - now includes partial matches"""
        places = [
            "Puraran Beach", "Twin Rock Beach", "Binurong Point",
            "Balacay Point", "Bato Church", "Mount Cagmasoso",
            "Maribina Falls", "Virac", "Baras", "Mamita's Grill",
            "Bato",  # Added standalone Bato
            "Puraran", "Twin Rock", "Binurong", "Balacay",  # Added short names
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