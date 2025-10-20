import chromadb
from chromadb.utils import embedding_functions
import json
import torch
from deep_translator import GoogleTranslator


class Pipeline:
    def __init__(self, dataset_path="dataset/dataset.json"):
        print("Welcome to Catanduanes!!")

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

    def load_dataset(self, dataset_path):
        with open(dataset_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        documents = []
        metadatas = []
        ids = []

        for idx, item in enumerate(data):
            doc = item['input']  # Store only question for better matching
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
            'swimming': ['swim', 'swimming', 'beach'],
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
        """Search for multiple topics and combine results"""
        all_results = []
        
        for topic in topics:
            # Translate to English
            try:
                translated = GoogleTranslator(source='auto', target='en').translate(topic)
            except:
                translated = topic  # Fallback if translation fails
            
            # Search in RAG
            results = self.collection.query(
                query_texts=[translated],
                n_results=n_results
            )
            
            if results['documents'][0]:
                for metadata, distance in zip(results['metadatas'][0], results['distances'][0]):
                    if distance < 0.7:  # Good match
                        all_results.append(metadata['answer'])
        
        return all_results
    
    def search(self, question, n_results=3):
        """Search for single question"""
        # Translate to English
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

    def ask(self, user_input):
        """Main ask function with multi-topic support"""
        # Extract keywords
        topics = self.extract_keywords(user_input)
        
        print(f"[DEBUG] Detected topics: {topics}")
        
        # If multiple topics found
        if len(topics) > 1 and topics != ['general']:
            answers = self.search_multi_topic(topics)
            if answers:
                # Combine multiple answers
                combined = " ".join(answers)
                return combined
            else:
                return "I don't have info about those topics yet."
        
        # Single topic or general question - use original search
        else:
            return self.search(user_input)

    def guide_question(self):
        print("\nI am Katniss, your personal guide!")
        print("Type 'exit' or 'quit' to end conversation\n")

        def response(user_input):
            if user_input.lower() in ['exit', 'quit', 'bye']:
                print("Katniss: Enjoy your stay! 👋")
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