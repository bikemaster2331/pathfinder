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
    # ----------------------------------------------------
    # 1. INITIALIZATION AND SETUP
    # ... (omitted for brevity) ...
    # ----------------------------------------------------
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
    
    # Sets up the connection to the Gemini API using an environment variable.
    def setup_gemini(self):
        # Setup gemini
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

    # Loads Q&A data from a JSON file, embeds it, and adds it to the ChromaDB vector store.
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

    # ----------------------------------------------------
    # 2. UTILITIES (Internet Check, Keyword Extraction)
    # ----------------------------------------------------

    # Checks internet connectivity using a caching mechanism to minimize actual network calls.
    def checkint(self, timeout=2, cache_duration=60):
        """Check internet with caching"""
        current_time = time.time()
        
        # Use cached result if recent 
        if self.internet_status is not None and \
        (current_time - self.last_internet_check) < cache_duration:
            return self.internet_status
        
        # Check internet
        try:
            requests.get("https://www.google.com", timeout=timeout)
            self.internet_status = True
        except (requests.ConnectionError, requests.Timeout):
            self.internet_status = False
        
        self.last_internet_check = current_time
        return self.internet_status
        
    # Analyzes a question and identifies relevant topics (e.g., 'surfing', 'food') based on keywords.
    def extract_keywords(self, question):
        
        """Extract topic keywords from question"""

        keywords = {
            'surfing': ['surf', 'surfing', 'waves', 'board', 'surf', 'mag-surf'],
            'swimming': ['swim', 'swimming', 'beach', 'langoy', 'lumangoy', 'maligo'],
            'hiking': ['hike', 'hiking', 'trek', 'trail', 'bundok', 'akyat'],
            'food': ['eat', 'food', 'restaurant', 'kain', 'kumain', 'pagkain', 'masarap'],
            'accommodation': ['stay', 'hotel', 'resort', 'tulog', 'matulog', 'pahinga']
        }

        found = []
        question_lower = question.lower()
        
        for topic, words in keywords.items():
            if any(word in question_lower for word in words):
                found.append(topic)
        
        return found if found else ['general']
    
    # ----------------------------------------------------
    # 3. RAG SEARCH LOGIC
    # ----------------------------------------------------

    # Searches the RAG knowledge base for multiple topics and collects the best answers for each.
    def search_multi_topic(self, topics, user_input, n_results=2): # user_input is the original, untranslated input

        all_results = []
        
        # We need the translated sentence for RAG query text. We should re-run the protect logic here
        # or simplify the way we get the translated keyword, since the current approach is causing confusion.
        
        # FIX 1: We must use the original structure of the multi-topic search
        # where the individual topic is translated and queried.
        # This requires the topics list to contain the *translated* topics, not the original Tagalog ones.
        
        # Since 'topics' contains translated keywords from 'ask', we can simplify this function:

        for topic in topics:
            # Re-translate the topic keyword here to ensure it's in English for the query
            try:
                translated_topic = GoogleTranslator(source='auto', target='en').translate(topic)
            except:
                translated_topic = topic
                
            print(f"[DEBUG] Searching RAG for topic: '{translated_topic}'")

            results = self.collection.query(
                query_texts=[translated_topic], # FIX 2: Query using the single, translated topic keyword
                n_results=n_results
            )
            
            if not results['documents'][0]:
                print(f"[DEBUG] No results found for topic: {topic}")
                continue
            
            best_match = results['metadatas'][0][0]
            confidence = results['distances'][0][0]

            if confidence > 0.7:
                print(f"[DEBUG] Low confidence for topic: {topic}")
                continue

            all_results.append(best_match['answer'])
        
        return all_results
    
    # Executes a standard RAG query for a single user question, handles translation, and checks confidence.
    def search(self, question, n_results=3):
        """Search for single question"""
        
        
        print(f"[DEBUG] Searching for: '{question}'")
        
        results = self.collection.query(
            query_texts=[question],
            n_results=n_results
        )
        
        if not results['documents'][0]:
            return "I don't have information about that. Ask about beaches, food, or activities!"
        
        best_match = results['metadatas'][0][0]
        confidence = results['distances'][0][0]
                
        if confidence > 0.7:
            return "I'm not sure about that. Can you rephrase or ask about Catanduanes tourism?"
        
        return best_match['answer']

    # ----------------------------------------------------
    # 4. RESPONSE AUGMENTATION
    # ----------------------------------------------------

    # Uses Gemini (if online) to rewrite the retrieved facts into a friendly, natural response, or uses a basic fallback.
    def make_natural(self, question, fact):
        """Make response natural using Gemini or fallback"""
        
        # Try Gemini if online
        if self.has_gemini and self.checkint():
            try:
                prompt = f"""You are Katniss, an extremely enthusiastic and knowledgeable Catanduanes tourism guide. Your tone is cheerful and you love sharing local tips.

Tourist asked: {question}
Facts: {fact}
Your goal is to answer the question using ONLY the 'Core Information Retrieved' and deliver the answer in a single, exciting, and straight-to-the-point sentence. Do not add any extra greeting or closing remarks. Start your response directly with the answer."""
                
                response = self.gemini.generate_content(prompt)
                return response.text
                
            except Exception as e:
                print(f"[DEBUG] Gemini error: {e}")
        
        # Offline fallback - fact
        return f"{fact}"
    
    
    def protect(self, user_input):

        protected = ["Puraran Beach", "Twin Rock Beach", "Binurong Point", "Balacay Point",
        "Bato Church", "Mount Cagmasoso", "Maribina Falls",
        "Puraran", "Twin Rock", "Binurong", "Balacay", "Bato", 
        "Cagmasoso", "Maribina", "Virac", "Baras", "Catanduanes"
        ]

        temp = user_input
        markers = {}
        for i, place_input in enumerate(protected):
            if place_input.lower() in user_input.lower():
                marker = f"__PLACE{i}__"
                temp = re.sub(re.escape(place_input), marker, temp, flags=re.IGNORECASE, count=1)
                markers[marker] = place_input

        try:
            temp = GoogleTranslator(source='auto', target='en').translate(temp)
        except Exception as e:
            # FIX 3: Removed buggy time.sleep retry logic and cleaned up print statement
            print(f"[DEBUG] Translation attempt failed: {e}")
            pass # Keep the marked text if translation fails

        for marker, place_input in markers.items():
            temp = temp.replace(marker, place_input)

        return temp
    

    def key_places(self, facts):
        #Extract places
        places = [
            "Puraran Beach", "Twin Rock Beach", "Binurong Point",
            "Balacay Point", "Bato Church", "Mount Cagmasoso",
            "Maribina Falls", "Virac", "Baras", "Mamita's Grill",
            # Add all tourist spots here
        ]

        found_places = []
        for place in places:
            if place.lower() in facts.lower():
                found_places.append(place)

        #found_places holds all the extract places you can use for google maps api request
        return found_places
        
    # Primary function for generating a response; orchestrates keyword extraction, RAG search, and augmentation.
    def ask(self, user_input):
        """Main ask function with multi-topic support and natural responses"""
        
        # 1. Preprocess and Translate Input
        convert = self.protect(user_input)
        
        # 2. Extract keywords
        topics = self.extract_keywords(convert)
        print(f"[DEBUG] Detected topics: {topics}")
        
        # 3. Get facts from RAG
        if len(topics) > 1 and topics != ['general']:
            # Call multi-topic search, passing the original user_input for the full context translation
            answers = self.search_multi_topic(topics, user_input)
            fact = " ".join(answers) if answers else "I don't have info about those topics"
        else:
            # Use the translated input for single-topic RAG search
            fact = self.search(convert)

        # 4. Extract places from the retrieved fact
        places = self.key_places(fact)
        
        # 5. Check if error message
        if "don't have information" in fact.lower() or "not sure" in fact.lower():
            # If RAG failed, return the error message string and an empty list of places
            return (fact, [])
        
        # 6. Make it natural
        natural_response = self.make_natural(user_input, fact)
        
        # 7. Return the processed response and the extracted places list
        return (natural_response, places)
        

    # ----------------------------------------------------
    # 5. ENTRY POINT
    # ----------------------------------------------------

    # Runs the main command-line chat interface, handles user input, and prints responses.
    def guide_question(self):
        print("\nI am Katniss, your personal guide!")
        
        # Show status
        if self.checkint():
            print("Online mode - Enhanced responses")
        else:
            print("Offline mode - Basic responses")
        
        print("Type 'exit' or 'quit' to end conversation\n")

        def response(user_input):
            if user_input.lower() in ['exit', 'quit', 'bye']:
                print("Katniss: Enjoy your stay!")
                exit()
            
            if not user_input.strip():
                print("Katniss: Please enter something.\n")
                return
            
            # Unpack the two returned values
            natural_response, places_list = self.ask(user_input) 
            
            # Print only the response
            print(f"Katniss: {natural_response}\n")

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
