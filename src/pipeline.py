import chromadb
from chromadb.utils import embedding_functions
import json
import torch
from deep_translator import GoogleTranslator


class Pipeline:
    def __init__(self, dataset_path = "dataset/dataset.json"):
        print("Welcome to Catanduanes!!")

        self.client = chromadb.Client()
        self.embedding = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name= "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
            device = "cuda" if torch.cuda.is_available() else "cpu"
        )

        try:
            self.collection = self.client.get_collection(
                name = "knowledge_base",
                embedding_function=self.embedding
            )
        except:
            self.collection = self.client.create_collection(
                name="knowledge_base",
                embedding_function=self.embedding
            )
            self.load_dataset(dataset_path)
    
    def load_dataset(self, dataset_path):
        with open(dataset_path, "r") as f:
            data = json.load(f)

        documents = []
        metadatas = []
        ids = []

        for idx, item in enumerate(data):
            doc = f"Question: {item['input']}\nAnswer: {item['output']}"
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

    def keywords(self, question):
        keywords = {
            'surfing': ['surf', 'surfing', 'waves'],
            'swimming': ['swim'],
            'food': ['eat', 'food', 'foodtrip', 'restaurant']
        }
        found = []
        for topic, words in keywords.items():
            if any(word in question.lower() for word in words):
                found.append(topic)
        return found
    
    def search(self, topic, n_results=3):
        translated = GoogleTranslator(source='auto', target='en').translate(topic)
        results = self.collection.query(
            query_texts=[translated],
            n_results=n_results
        )
        if not results['documents'][0]:

            return "I don't have information about that in my knowledge base."

        best_match = results['metadatas'][0][0]
        confidence = results['distances'][0][0] if 'distances' in results else None
        if confidence > 0.6:
            return "The query is out of context, please try again" 
        else:
            answer = best_match['answer']
            return answer


    def guide_question(self):
        print("\nI am Katniss, your personal guide!")
        print("Type 'exit' or 'quit' to end conversation\n")

        def response(user_input):
            if user_input.lower() in ['exit', 'quit']:
                print("Enjoy your stay!")
                exit()
            if not user_input:
                print("Katniss: Please enter something.")
                return
            
            answer = self.keywords(user_input)
            searched = self.search(answer)
            print(f"Katniss: {searched}\n")

        pref = input("What activities do you prefer? (Hiking/Swimming/Surfing/etc...): ")
        response(pref)

        while True:
            qry = input("\nDo you have any questions?: ")
            response(qry)

if __name__ == '__main__':
    cbot = Pipeline(dataset_path="dataset/dataset.json")
    cbot.guide_question()