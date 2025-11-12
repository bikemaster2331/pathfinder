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
import webbrowser
import hashlib

HASH_FILE = "dataset_hash.txt"

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

        # --- HASHING LOGIC START ---
        current_data_hash = self.dataset_hash(dataset_path)
        stored_hash = None

        hash_file_path = os.path.join(db_path, HASH_FILE)
        if os.path.exists(hash_file_path):
            with open(hash_file_path, 'r') as f:
                stored_hash = f.read().strip()

        rebuild_required = (current_data_hash is None)

        try:
            self.collection = self.client.get_collection(
                name="knowledge_base",
                embedding_function=self.embedding
            )
            if stored_hash == current_data_hash and current_data_hash is not None:
                print("no rebuild required")
                rebuild_required = False
            else:
                print("rebuilding")
                rebuild_required = True

        except Exception:
            rebuild_required = True
        
        if rebuild_required:
            # If the collection exists but has old data, we must delete it first.
            try:
                self.client.delete_collection(name="knowledge_base")
            except:
                pass # Ignore if it didn't exist
            
            try:
                self.collection = self.client.create_collection(
                    name="knowledge_base",
                    embedding_function=self.embedding
                )
                self.load_dataset(dataset_path) 
                print("✅ Created and loaded NEW knowledge_base with data.")
                
                # 4. Save the new hash to disk
                os.makedirs(db_path, exist_ok=True)
                with open(hash_file_path, 'w') as f:
                    f.write(current_data_hash)
                    
            except Exception as create_error:
                print(f"Can not create: {create_error}")
                exit(1)
        # --- HASHING LOGIC END ---

        # --- Memory and Caching Initialization ---
        self.history = []
        self.max_history = 5
        self.last_place = [] # Will store list of place dictionaries (lat, lng, name, type)
        self.last_topic = None
        # --- End Memory Initialization ---


    def dataset_hash(self, dataset_path):
        hasher = hashlib.md5()
        try:
            with open(dataset_path, 'rb') as f:
                buf = f.read()
                hasher.update(buf)
            return hasher.hexdigest()
        except FileNotFoundError:
            return None

    # --- MEMORY FUNCTIONS START ---
    def convo_history(self, user_input, bot_response, places, topics): # <-- FIX: Now accepts 4 arguments
        """Logs the conversation turn and updates context pointers."""
        self.history.append({
            'user': user_input,
            'bot': bot_response,
            'places': places,
            'timestamp': time.time()
        })
        if len(self.history) > self.max_history:
            self.history.pop(0)

        if places:
            # 🛑 CRITICAL FIX: Store the full list of dictionaries (places), not just names.
            self.last_place = places 
        
        # Store the primary topic
        if topics and topics != ['general']:
            self.last_topic = topics[0]
            
    
    def get_context(self):
        """Retrieves formatted history for the Gemini prompt."""
        if not self.history:
            return ""
        
        context_parts = []
        for turn in self.history[-3:]: # Use last 3 turns
            context_parts.append(f"User asked: {turn['user']}")
            context_parts.append(f"Bot said: {turn['bot']}")

        return "\n".join(context_parts)
    
    def resolve(self, user_input):
        """Checks if the input contains a memory-linked pronoun."""
        pronouns = ['there', 'it', 'that place', 'doon', 'dito', 'iyan']
        user_lower = user_input.lower()

        # Check if memory exists AND if a pronoun is present
        if self.last_place:
            return any(re.search(r'\b' + pronoun + r'\b', user_lower, re.IGNORECASE) for pronoun in pronouns)
        
        return False
    # --- MEMORY FUNCTIONS END ---


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
            print(f"Dataset not found: {dataset_path}")
            exit(1)
        except json.JSONDecodeError as e:
            print(f"Invalid JSON in dataset: {e}")
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
        
        if all_results:
            print(f"[DEBUG] Added result with confidence: {all_results[0]['confidence']:.3f}") 
        
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
            if confidence <= 0.7: # Changed confidence limit back to 0.7 for stable testing
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
                context_str = self.get_context()
                
                prompt = f"""You are Pathfinder — a calm, polite, helpful, always excited Catanduanes tourism assistant, similar to Baymax.
Your responses should sound gentle, clear, and factual, while maintaining a friendly tone.

[Conversation Context]
{context_str}

Tourist asked: {question}
Facts: {fact}

Respond in the same language as the tourist's question.
Use only the information from the facts and the Conversation Context to maintain coherence.
Give a single, concise, and natural-sounding sentence.
Do not add greetings or extra commentary be direct yet kind. You may include exclamation marks to sound excited."""
                
                response = self.gemini.generate_content(prompt)
                return response.text
                
            except Exception as e:
                print(f"[DEBUG] Gemini error: {e}")
                # Fall through to the OFFLINE FALLBACK

        # 2. FIX: STRUCTURED OFFLINE FALLBACK (Always returns a clean, templated response)

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
        places = {
            "Puraran Beach": {"lat": 13.6918, "lng": 124.3988, "type": "surfing"},
            "Twin Rock Beach": {"lat": 13.5227, "lng": 124.2226, "type": "swimming"},
            "Binurong Point": {"lat": 13.6690, "lng": 124.4145, "type": "hiking"},
            "Maribina Falls": {"lat": 13.6017, "lng": 124.2707, "type": "swimming"},
            "Face of Jesus Beach": {"lat": 13.5188, "lng": 124.2060, "type": "general"},
            "Nahulugan Falls": {"lat": 13.7886, "lng": 124.3678, "type": "swimming"},
            "Tuwad-Tuwadan Blue Lagoon": {"lat": 14.0586, "lng": 124.1266, "type": "surfing"},
            "St. John the Baptist Church": {"lat": 13.9832, "lng": 124.1343, "type": "sightseeing"},
            "Mamangal Beach": {"lat": 13.5550, "lng": 124.1492, "type": "swimming"},
            "Ba-Haw Falls": {"lat": 13.7538, "lng": 124.3833, "type": "swimming"},
            "ARDCI Corporate Inn": {"lat": 13.5813, "lng": 124.2301, "type": "accommodation"},
            "Rhaj Inn": {"lat": 13.5791, "lng": 124.2263, "type": "accommodation"},
            "Majestic Puraran Beach Resort": {"lat": 13.6888, "lng": 124.3969, "type": "accommodation"},
            "Pacific Surfers Paradise Resort": {"lat": 13.6894, "lng": 124.3952, "type": "accommodation"},
            "Catanduanes Midtown Inn Resort": {"lat": 13.5403, "lng": 124.1638, "type": "accommodation"},
            "Nitto Lodge": {"lat": 13.5833, "lng": 124.2054, "type": "accommodation"},
            "Renel's Traveller's Inn": {"lat": 13.5795, "lng": 124.2280, "type": "accommodation"},
            "Bagamanoc Guest House": {"lat": 13.9416, "lng": 124.2870, "type": "accommodation"},
            "Pusgo Island Guest House": {"lat": 13.9700, "lng": 124.3237, "type": "accommodation"},
            "Sonia's Island Stay": {"lat": 13.5850, "lng": 124.2388, "type": "accommodation"},
            "The Lumber": {"lat": 13.5922, "lng": 124.2484, "type": "accommodation"},
            "Ecrown Hotel and Resort": {"lat": 13.5939, "lng": 124.2562, "type": "accommodation"},
        }

        found_places = []
        facts_lower = facts.lower()
        
        # Sort by length (longest first) to match "Bato Church" before "Bato"
        sorted_places = sorted(places, key=len, reverse=True)
        
        for place in sorted_places:
            if place.lower() in facts_lower:
                # Only add if it hasn't been added yet (to prevent overlap)
                if not any(p['name'] == place for p in found_places):
                    found_places.append({
                        'name': place,
                        'lat': places[place]['lat'],
                        'lng': places[place]['lng'],
                        'type': places[place]['type']
                    })

        return found_places
        
    def ask(self, user_input):
        """Main ask function with multi-topic support and natural responses"""
        
        # 1. Pronoun Resolution (Returns augmented string if memory exists, else returns original string)
        resolved_input = user_input # Start with the original input
        
        # Check if the user used a memory pronoun (e.g., "there," "it")
        if self.resolve(user_input):
            # --- Brute-Force Replacement Logic ---
            pronouns = ['there', 'it', 'that place', 'doon', 'dito', 'iyan']
            # Get the most recent place name from the list of dictionaries
            place = self.last_place[0]['name'] 
            for pronoun in pronouns:
                resolved_input = re.sub(r'\b' + pronoun + r'\b', place, resolved_input, flags=re.IGNORECASE)
            print(f"[DEBUG] Resolved pronoun: '{resolved_input}'")
            # --- End Brute-Force Replacement Logic ---
        
        # 2. Translate/Protect place names (uses resolved input)
        translated_query = self.protect(resolved_input)
        
        # 3. Context Augmentation (for RAG efficiency)
        context_for_rag = self.get_context()
        augmented_rag_query = translated_query
        
        # Only augment the query if context exists
        if context_for_rag:
            # Add context to the RAG query for better vector matching
            augmented_rag_query = f"[CONTEXT:{context_for_rag}] {translated_query}"
            print(f"[DEBUG] Augmented RAG Query: '{augmented_rag_query[:100]}...'")

        # --- RAG Execution ---
        
        # 4. Extract keywords from the AUGMENTED query
        topics = self.extract_keywords(augmented_rag_query)
        print(f"[DEBUG] Detected topics: {topics}")
        
        # 5. Get facts from RAG
        if len(topics) > 1 and topics != ['general']:
            answers = self.search_multi_topic(topics, augmented_rag_query)
            fact = " ".join(answers) if answers else "I don't have info about those topics"
        else:
            fact = self.search(augmented_rag_query)

        # 6. Extract places
        places = self.key_places(fact)
        
        # 7. Check if error message
        if "don't have information" in fact.lower() or "not sure" in fact.lower():
            # Log the error turn
            self.convo_history(user_input, fact, places, topics)
            return (fact, [])
        
        # 8. Make it natural
        natural_response = self.make_natural(user_input, fact)
        
        # 9. Log the successful turn (CRITICAL FIX)
        self.convo_history(user_input, natural_response, places, topics)
        
        # 10. Return the processed response and the extracted places list
        return (natural_response, places)
    
    def reset_conversation(self):
        """Clear conversation history"""
        self.history = []
        self.last_place = []
        self.last_topic = None
        print("[DEBUG] Conversation memory cleared")

    def maps(self, places, user_preference=None):
        if not places:
            print("⚠️ No places to display on map")
            return None

        # Filter by preference if provided
        filtered_places = places
        if user_preference:
            filtered_places = [p for p in places if p['type'] == user_preference.lower()]
            if not filtered_places:
                filtered_places = places  # Show all if no match

        # Calculate map center (average of all coordinates)
        avg_lat = sum(p['lat'] for p in filtered_places) / len(filtered_places)
        avg_lng = sum(p['lng'] for p in filtered_places) / len(filtered_places)

        # Generate HTML
        html_content = f"""<!DOCTYPE html>
    <html>
    <head>
        <title>Pathfinder - Catanduanes Map</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <style>
            body {{ margin: 0; padding: 0; font-family: Arial, sans-serif; }}
            #map {{ height: 100vh; width: 100%; }}

            .filter-panel {{
                position: absolute; top: 10px; right: 10px;
                background: white; padding: 15px; border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: 1000;
            }}

            .filter-btn {{
                display: block; width: 100%; padding: 8px; margin: 5px 0;
                border: none; border-radius: 5px;
                background: #4299e1; color: white;
                cursor: pointer; font-weight: bold;
            }}

            .filter-btn:hover {{ background: #2c5282; }}

            .place-popup {{
                padding: 10px; text-align: center;
            }}
            .place-popup h3 {{
                margin: 0 0 10px 0; color: #2c5282;
            }}
        </style>
    </head>
    <body>
        <div id="map"></div>

        <div class="filter-panel">
            <h4 style="margin-top: 0;">Filter by Activity</h4>
            <button class="filter-btn" onclick="filterPlaces('all')">🌴 Show All</button>
            <button class="filter-btn" onclick="filterPlaces('surfing')">🏄 Surfing</button>
            <button class="filter-btn" onclick="filterPlaces('swimming')">🏊 Swimming</button>
            <button class="filter-btn" onclick="filterPlaces('hiking')">🥾 Hiking</button>
            <button class="filter-btn" onclick="filterPlaces('sightseeing')">👀 Sightseeing</button>
            <button class="filter-btn" onclick="filterPlaces('accommodation')">🏨 Hotels</button>
        </div>

        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script>
            // Initialize map
            var map = L.map('map').setView([{avg_lat}, {avg_lng}], 11);

            // Add OpenStreetMap tiles (FREE!)
            L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }}).addTo(map);

            // Place data
            var places = {json.dumps(filtered_places)};
            var markers = {{}};

            // Icon mapping
            var icons = {{
                'surfing': '🏄', 'swimming': '🏊', 'hiking': '🥾',
                'sightseeing': '👀', 'accommodation': '🏨',
                'food': '🍽️', 'general': '📍'
            }};

            // Add markers
            places.forEach(function(place) {{
                var emoji = icons[place.type] || '📍';

                var icon = L.divIcon({{
                    html: '<div style="font-size: 30px;">' + emoji + '</div>',
                    className: 'custom-marker',
                    iconSize: [30, 30]
                }});

                var marker = L.marker([place.lat, place.lng], {{icon: icon}}).addTo(map);

                marker.bindPopup(
                    '<div class="place-popup">' +
                    '<h3>' + place.name + '</h3>' +
                    '<p>Type: ' + place.type + '</p>' +
                    '<p><small>Lat: ' + place.lat.toFixed(4) + ', Lng: ' + place.lng.toFixed(4) + '</small></p>' +
                    '</div>'
                );

                // Store for filtering
                if (!markers[place.type]) markers[place.type] = [];
                markers[place.type].push(marker);
            }});

            // Filter function
            function filterPlaces(type) {{
                Object.values(markers).forEach(function(typeMarkers) {{
                    typeMarkers.forEach(function(m) {{ map.removeLayer(m); }});
                }});

                if (type === 'all') {{
                    Object.values(markers).forEach(function(typeMarkers) {{
                        typeMarkers.forEach(function(m) {{ m.addTo(map); }});
                    }});
                }} else if (markers[type]) {{
                    markers[type].forEach(function(m) {{ m.addTo(map); }});
                }}
            }}
        </script>
    </body>
    </html>
    """
    
    # Save to file
        output_path = "pathfinder_map.html"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_content)
        
        print(f"🗺️  Map saved: {output_path}")
        
        # Open in browser
        try:
            webbrowser.open('file://' + os.path.abspath(output_path))
            print("📱 Opening map in browser...")
        except Exception as e:
            print(f"⚠️  Could not open browser: {e}")
            print(f"   Manually open: {os.path.abspath(output_path)}")
        
        return output_path

    def guide_question(self):
        print("\nI am Pathfinder, your personal guide!")
        
        if self.checkint():
            print("Online mode - Enhanced responses")
        else:
            print("Offline mode - Basic responses")
        
        print("Type 'exit' or 'quit' to end conversation")
        print("Type 'map' or 'show map' to see locations\n")

        def response(user_input):
            if user_input.lower() in ['exit', 'quit', 'bye']:
                print("Pathfinder: Enjoy your stay!")
                exit()
            
            if not user_input.strip():
                print("Pathfinder: Please enter something.\n")
                return

            # --- 🛑 FIX: Explicit Map Command ---
            if any(word in user_input.lower() for word in ['map', 'show map', 'show me map']):
                
                # Use the last places extracted and saved in memory
                if self.last_place: 
                    print("Pathfinder: Here is the map showing the last places we discussed.\n")
                    # Pass self.last_place which contains the full coordinate list
                    self.maps(self.last_place) 
                else:
                    print("Pathfinder: I need to find some relevant places for you first! Ask me about a resort or a waterfall.\n")
                return # Crucial: Exit the function after map command
            # --- End Map Command Fix ---

            # Normal RAG query processing:
            natural_response, places = self.ask(user_input) 
            
            # 🛑 CRITICAL FIX: Extract topics and update memory.
            # Extract topics from the final query sent to RAG (which includes resolved pronouns)
            topics = self.extract_keywords(self.ask.resolved_query) if hasattr(self.ask, 'resolved_query') else self.extract_keywords(user_input)
            
            # Log the memory with the correct arguments (4 arguments)
            self.convo_history(user_input, natural_response, places, topics)
            
            print(f"Pathfinder: {natural_response}\n")
        
            if places:
                print(f"[DEBUG] Found places: {[p['name'] for p in places]}")
                print("💡 Type 'map' to see these locations on a map!")
                
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