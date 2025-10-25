import chromadb
from chromadb.utils import embedding_functions
import json
import torch
from deep_translator import GoogleTranslator
import requests
import time
import os
from dotenv import load_dotenv 

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

    def extract_keywords(self, question):
        """Extract topic keywords from question"""
        keywords = {
            'surfing': ['surf', 'surfing', 'waves', 'board'],
            'swimming': ['swim', 'swimming', 'beach', 'bath'],
            'hiking': ['hike', 'hiking', 'trek', 'trail'],
            'food': ['eat', 'food', 'foodtrip', 'restaurant', 'dining'],
            'accommodation': ['stay', 'hotel', 'resort', 'lodge']
        }
        
        found = []
        question_lower = question.lower()
        
        for topic, words in keywords.items():
            if any(word in question_lower for word in words):
                found.append(topic)
        
        return found if found else ['general']
    
    def search_multi_topic(self, topics, n_results=2):
        all_results = []
        
        for topic in topics:
            try:
                translated = GoogleTranslator(source='auto', target='en').translate(topic)
            except:
                translated = topic
            
            results = self.collection.query(
                query_texts=[translated],
                n_results=n_results
            )
            
            if results['documents'][0]:
                for metadata, distance in zip(results['metadatas'][0], results['distances'][0]):
                    if distance < 0.8:
                        all_results.append(metadata['answer'])
        
        return all_results
    
    def search(self, question, n_results=3):
        """Search for single question"""
        try:
            translated = GoogleTranslator(source='auto', target='en').translate(question)
        except:
            translated = question
        
        print(f"[DEBUG] Searching for: '{translated}'")
        
        results = self.collection.query(
            query_texts=[translated],
            n_results=n_results
        )
        
        if not results['documents'][0]:
            return "I don't have information about that. Ask about beaches, food, or activities!"
        
        best_match = results['metadatas'][0][0]
        confidence = results['distances'][0][0]
        
        print(f"[DEBUG] Best match distance: {confidence:.3f}")
        
        if confidence > 0.7:
            return "I'm not sure about that. Can you rephrase or ask about Catanduanes tourism?"
        
        return best_match['answer']
    
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
    
    def make_natural(self, question, fact):
        """Make response natural using Gemini or fallback"""
        
        # Try Gemini if online
        if self.has_gemini and self.checkint():
            try:
                prompt = f"""You're a friendly Catanduanes tourism guide.

Tourist asked: {question}
Facts: {fact}

Respond naturally and helpfully in 1-2 sentences:"""
                
                response = self.gemini.generate_content(prompt)
                return response.text
                
            except Exception as e:
                print(f"[DEBUG] Gemini error: {e}")
        
        # Offline fallback - fact
        return f"{fact}"

    def ask(self, user_input):
        """Main ask function with multi-topic support and natural responses"""
        
        # Translate input
        try:
            convert = GoogleTranslator(source='auto', target='en').translate(user_input)
        except:
            convert = user_input
        
        # Extract keywords
        topics = self.extract_keywords(convert)
        print(f"[DEBUG] Detected topics: {topics}")
        
        # Get facts from RAG
        if len(topics) > 1 and topics != ['general']:
            answers = self.search_multi_topic(topics)
            if answers:
                fact = " ".join(answers)
            else:
                return "I don't have info about those topics yet."
        else:
            fact = self.search(user_input)
        
        # Check if error message
        if "don't have information" in fact.lower() or "not sure" in fact.lower():
            return fact
        
        # Make it natural
        natural_response = self.make_natural(user_input, fact)
        return natural_response

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
            
            # Get answer
            answer = self.ask(user_input)
            print(f"Katniss: {answer}\n")

        # Initial preference question
        pref = input("What activities do you prefer? (Hiking/Swimming/Surfing/etc...): ").strip()
        if pref:
            response(pref)

        # Main loop
        while True:
            qry = input("You: ").strip()
            response(qry)


if __name__ == '__main__':

    
    cbot = Pipeline(dataset_path="dataset/dataset.json")
    cbot.guide_question()