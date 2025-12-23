# src/rag_chatbot.py
import chromadb
from chromadb.utils import embedding_functions
import json
import torch

class RAGChatbot:
    def __init__(self, dataset_path="dataset/dataset.json"):
        print("Initializing RAG Chatbot...")
        

        self.client = chromadb.Client()
        
        # Use sentence transformer for embeddings
        self.embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2",
            device="cuda" if torch.cuda.is_available() else "cpu"
        )
        
        # Create or get collection
        try:
            self.collection = self.client.get_collection(
                name="knowledge_base",
                embedding_function=self.embedding_function
            )
            print("Loaded existing knowledge base")
        except:
            self.collection = self.client.create_collection(
                name="knowledge_base",
                embedding_function=self.embedding_function
            )
            self._load_dataset(dataset_path)
            print("Created new knowledge base")
    
    def _load_dataset(self, dataset_path):
        print(f"Loading dataset from {dataset_path}...")
        with open(dataset_path, "r") as f:
            data = json.load(f)
        
        # Add each Q&A pair
        documents = []
        metadatas = []
        ids = []
        
        for idx, item in enumerate(data):
            # Store both question and answer
            doc = f"Question: {item['input']}\nAnswer: {item['output']}"
            documents.append(doc)
            metadatas.append({
                "question": item['input'],
                "answer": item['output']
            })
            ids.append(str(idx))

        
        # Add to collection
        self.collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
        print(f"Loaded {len(documents)} Q&A pairs into knowledge base")
    
    def ask(self, question, n_results=3):
        # Search for similar questions
        results = self.collection.query(
            query_texts=[question],
            n_results=n_results
        )

        if not results['documents'][0]:
            return "I don't have information about that in my knowledge base."
        
        # Get the best matching answer
        best_match = results['metadatas'][0][0]
        confidence = results['distances'][0][0] if 'distances' in results else None
        if confidence < 75:
            return "The query is out of context, please try again" 
        else:
            answer = best_match['answer']
            return answer


    
    def chat(self):
        """Interactive chat loop"""
        print("\n🤖 RAG Chatbot Ready!")
        print("Type 'exit' or 'quit' to end conversation\n")
        
        while True:
            user_input = input("You: ").strip()
            
            if user_input.lower() in ['exit', 'quit', 'bye']:
                print("Bot: Goodbye! 👋")
                break
            
            if not user_input:
                continue
            
            # Get answer
            answer = self.ask(user_input)
            print(f"Bot: {answer}\n")

# Main execution
if __name__ == "__main__":
    # Initialize chatbot
    chatbot = RAGChatbot(dataset_path="dataset/dataset.json")
    
    # Start chat
    chatbot.chat()