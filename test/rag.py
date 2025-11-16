import chromadb
from chromadb.utils import embedding_functions
import json
import torch
from deep_translator import GoogleTranslator
import requests, time

#leaf branch


class Pipeline:

    # Initializes the system, sets up components (LLMs, RAG), and loads/creates the ChromaDB knowledge base.
    def __init__(self, dataset_path="dataset/dataset.json"):
        print("Welcome to Catanduanes!!")

        # Setup online and offline
        self.gemini_setup() 
        self.local_llm_setup() 
        self.rag_setup()

        # Track internet status
        self.interet_stat = None # Stores the last known internet status (True/False/None).
        self.last_internet_check = 0 # Stores the timestamp (seconds since epoch) of the last internet check.

        self.client = chromadb.Client() # Initializes the ChromaDB client, the vector database.
        self.embedding = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
            device="cuda" if torch.cuda.is_available() else "cpu"
        ) # Defines the embedding model (converts text to numerical vectors) to be used.

        try:
            self.collection = self.client.get_collection(
                name="knowledge_base",
                embedding_function=self.embedding
            ) # Tries to load an existing Chroma collection named 'knowledge_base'.
        except:
            self.collection = self.client.create_collection(
                name="knowledge_base",
                embedding_function=self.embedding
            ) # If the collection doesn't exist, it creates a new one.
            self.load_dataset(dataset_path) # Calls load_dataset to populate the new collection.

    # Loads Q&A data from a JSON file, embeds it, and adds it to the ChromaDB vector store.
    def load_dataset(self, dataset_path):
        """
        Loads Q&A data from a JSON file, processes it, and adds it to the ChromaDB collection.
        This function is crucial for building the RAG's knowledge base.
        """
        with open(dataset_path, "r", encoding="utf-8") as f:
            data = json.load(f) # Opens and loads the Q&A data from the specified JSON file.

        documents = [] # List to hold the main documents (questions) to be embedded.
        metadatas = [] # List to hold metadata (original question and answer).
        ids = [] # List to hold unique IDs for each document.

        for idx, item in enumerate(data):
            doc = item['input']  # Store only question for better matching
            documents.append(doc) # Adds the question to the documents list.
            metadatas.append({
                "question": item['input'],
                "answer": item['output']
            }) # Stores the full Q&A pair in metadata.
            ids.append(str(idx)) # Assigns a unique ID to the document.
        
        self.collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        ) # Embeds the documents and stores them along with metadata in ChromaDB.
        print(f"📊 Loaded {len(documents)} Q&A pairs") # Confirms successful loading.

    # Analyzes a question and identifies relevant topics (e.g., 'surfing', 'food') based on keywords.
    def extract_keywords(self, question):
        """
        Identifies relevant topics (e.g., 'surfing', 'food') within a user's question
        based on a predefined keyword dictionary. Used to enable multi-topic searching.
        """
        keywords = {
            'surfing': ['surf', 'surfing', 'waves', 'board'],
            'swimming': ['swim', 'swimming', 'beach', 'bath'],
            'hiking': ['hike', 'hiking', 'trek', 'trail'],
            'food': ['eat', 'food', 'foodtrip', 'restaurant', 'dining'],
            'accommodation': ['stay', 'hotel', 'resort', 'lodge']
        }
        
        found = []
        question_lower = question.lower() # Converts question to lowercase for case-insensitive matching.
        
        for topic, words in keywords.items():
            if any(word in question_lower for word in words):
                found.append(topic) # Adds the topic if any of its keywords are found in the question.
        
        return found if found else ['general'] # Returns list of topics or defaults to 'general'.
    
    # Searches the RAG knowledge base for multiple topics and collects the best answers for each.
    def search_multi_topic(self, topics, n_results=2):
        """
        Performs separate RAG searches for each identified topic and aggregates the answers.
        This is used when a user's query covers multiple subjects (e.g., "Where to surf and eat?").
        """
        all_results = []
        
        for topic in topics:
            # Translate to English
            try:
                translated = GoogleTranslator(source='auto', target='en').translate(topic) # Translates topic keyword to English (as the embedding model works better with English).
            except:
                translated = topic  # Fallback if translation fails
            
            # Search in RAG
            results = self.collection.query(
                query_texts=[translated],
                n_results=n_results
            ) # Queries ChromaDB for the translated topic.
            
            if results['documents'][0]:
                for metadata, distance in zip(results['metadatas'][0], results['distances'][0]):
                    if distance < 0.8:  # Good match
                        all_results.append(metadata['answer']) # Appends the answer if the match confidence (distance) is high enough (less than 0.8).
        
        return all_results # Returns a list of collected answers.
    
    # Executes a standard RAG query for a single user question, handles translation, and checks confidence.
    def search(self, question, n_results=3):
        """
        Performs a standard RAG search for a single user question.
        """
        # Translate to English
        try:
            translated = GoogleTranslator(source='auto', target='en').translate(question) # Translates the full question to English.
        except:
            translated = question
        
        print(f"[DEBUG] Searching for: '{translated}'")
        
        results = self.collection.query(
            query_texts=[translated],
            n_results=n_results
        ) # Queries ChromaDB for the translated question.
        
        if not results['documents'][0]:
            return "I don't have information about that. Ask about beaches, food, or activities!" # Returns a default message if no results are found.
        
        best_match = results['metadatas'][0][0] # Gets the metadata of the top-ranked result.
        confidence = results['distances'][0][0] # Gets the confidence score (distance) of the top result.
                
        if confidence > 0.7:
            return "I'm not sure about that. Can you rephrase or ask about Catanduanes tourism?" # Returns an uncertainty message if the confidence is too low (distance > 0.7).
        
        return best_match['answer'] # Returns the best matching answer from the knowledge base.

    # Primary function for generating a response; orchestrates keyword extraction and chooses between single or multi-topic search.
    def ask(self, user_input):
        """
        The main public function to get a response. It decides whether to use
        single-topic search or multi-topic search.
        """
        # Extract keywords
        convert = GoogleTranslator(source='auto', target='en').translate(user_input) # Translates the entire user input to English for keyword extraction.
        topics = self.extract_keywords(convert) # Extracts topic keywords from the translated input.
        
        print(f"[DEBUG] Detected topics: {topics}")
        
        # If multiple topics found
        if len(topics) > 1 and topics != ['general']:
            answers = self.search_multi_topic(topics) # Calls multi-topic search.
            if answers:
                # Combine multiple answers
                combined = " ".join(answers) # Joins the list of answers into a single string.
                return combined
            else:
                return "I don't have info about those topics yet."
        
        # Single topic or general question - use original search
        else:
            return self.search(user_input) # Calls the standard single-question search.
        
    # Checks internet connectivity using a caching mechanism to minimize actual network calls.
    def checkint(self, timeout=2, cache_duration = 60):
        """
        Checks internet connectivity with a caching mechanism to avoid redundant network calls.
        """
        current_time = time.time() # Gets the current time for freshness comparison.

        if self.interet_stat is not None and \
        (current_time - self.last_internet_check) < cache_duration:
            return self.interet_stat # Returns the cached status if it exists and is not stale (less than cache_duration old).
        try:
            requests.get("https://www.google.com", timeout=timeout) # Tries to connect to Google within the specified timeout.
            self.interet_stat = True # Sets status to True if the connection succeeds.
            print("Online Mode")
        except (requests.ConnectionError, requests.Timeout):
            self.interet_stat = False # Sets status to False if connection fails or times out.
            print("Offline Mode")

        self.last_internet_check = current_time # Updates the timestamp of the last check (resets the cache timer).
        return self.interet_stat # Returns the newly determined internet status.

    # Runs the main command-line chat interface, handles user input, and prints responses.
    def guide_question(self):
        """
        The main conversational loop for interacting with the user guide.
        """
        print("\nI am Katniss, your personal guide!")
        print("Type 'exit' or 'quit' to end conversation\n")

        def response(user_input):
            # ... exit logic ...
            
            # ... empty input logic ...
            
            # Get answer    
            answer = self.ask(user_input) # Calls the main ask function to get a response.
            print(f"Katniss: {answer}\n")

        # Initial preference question
        pref = input("What activities do you prefer? (Hiking/Swimming/Surfing/etc...): ").strip() # Gets an initial preference from the user.

        try:
            translate = GoogleTranslator(source='auto', target='en').translate(pref) # Tries to translate the initial preference.
        except:
            translate = pref
        if pref:
            response(translate) # Gets a response for the initial question.

        # Main loop
        while True:
            qry = input("You: ").strip() # Gets subsequent user input.
            response(qry) # Processes the input and provides a response.


if __name__ == '__main__':
    cbot = Pipeline(dataset_path="dataset/dataset.json") # Creates an instance of the Pipeline class (runs __init__).
    cbot.guide_question() # Starts the interactive conversation loop.