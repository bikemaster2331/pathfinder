from sentence_transformers import util
import torch

class Controller:
    def __init__(self, config, embedding_model):
        self.greetings = [
            'hi', 'hello', 'hey', 'kumusta', 'good morning', 
            'good afternoon', 'good evening', 'musta', 'kamusta'
        ]

        self.question_indicator = [
            'what', 'where', 'how', 'when', 'who', 'why', 'which',
            'can', 'is', 'are', 'do', 'does', 'will', 'should',
            'ano', 'saan', 'paano', 'kailan', 'sino', 'bakit',
            'may', 'meron', 'pwede', 'gusto'
        ]

        self.tourism_keywords = config['keywords']
        self.embedding_model = embedding_model

        # Setup semantic search
        self.keywords_topic = []
        all_kw_text = []

        for topic, keywords in self.tourism_keywords.items():
            for k in keywords:
                self.keywords_topic.append(topic)
                all_kw_text.append(k)

        print("Caching keyword embeddings...")
        self.cached_kw_embeddings = self.embedding_model.encode(all_kw_text, convert_to_tensor=True)

    def _is_gibberish(self, text):
        """Detect gibberish patterns"""
        
        # Check 1: No vowels (for long strings)
        vowel_count = sum(1 for c in text if c in 'aeiou')
        if len(text) > 5 and vowel_count == 0:
            return True
        
        # Check 2: Too many consecutive consonants
        consonant_run = 0
        max_consonants = 0
        for char in text:
            if char.isalpha() and char not in 'aeiou':
                consonant_run += 1
                max_consonants = max(max_consonants, consonant_run)
            else:
                consonant_run = 0
        
        if max_consonants > 4:
            return True
        
        # Check 3: Very low vowel ratio
        if len(text) > 3:
            vowel_ratio = vowel_count / len(text)
            if vowel_ratio < 0.15:
                return True
        
        # Check 4: Repeated characters (aaaa, xxxx)
        for i in range(len(text) - 3):
            if len(set(text[i:i+4])) == 1:
                return True
        
        return False

    def check_semantic_match(self, user_input):
        """Semantic matching with higher threshold"""
        query_embedding = self.embedding_model.encode(user_input, convert_to_tensor=True)
        cosine_scores = util.cos_sim(query_embedding, self.cached_kw_embeddings)[0]
        best_score, best_index = torch.max(cosine_scores, dim=0)
        
        # Raised threshold to reduce false positives
        if best_score > 0.7:  # Changed from 0.6
            matched_topic = self.keywords_topic[best_index.item()]
            print(f"[DEBUG] Semantic Match: '{user_input}' → '{matched_topic}' (Score: {best_score:.2f})")
            return True
        
        return False

    def analyze_query(self, user_input):
        query_lower = user_input.lower().strip()
        words = query_lower.split()

        # Rule 1: Empty or too short
        if len(query_lower) < 2 or len(words) == 0:
            return {
                "intent": "nonsense",
                "is_valid": False,
                "confidence": 0.0,
                "reason": "too_short"
            }

        # Rule 1.5: Gibberish detection BEFORE semantic matching
        if self._is_gibberish(query_lower):
            return {
                "intent": "nonsense",
                "is_valid": False,
                "confidence": 0.0,
                "reason": "gibberish_detected"
            }

        has_greeting = any(greeting in query_lower for greeting in self.greetings)
        has_question_word = any(q in words for q in self.question_indicator)

        # Keyword check: exact match first
        has_tourism_keyword = False
        for topic, keywords in self.tourism_keywords.items():
            if any(kw in query_lower for kw in keywords):
                has_tourism_keyword = True
                break
        
        # Semantic match as fallback (only for legitimate-looking text)
        if not has_tourism_keyword and not self._is_gibberish(query_lower):
            has_tourism_keyword = self.check_semantic_match(query_lower)
            
        # Rule 2: Greeting + Question
        if has_greeting and (has_question_word or has_tourism_keyword):
            return {
                "intent": "tourism_query",
                "is_valid": True,
                "confidence": 1.0,
                "reason": "greeting_with_question",
                "has_greeting": True 
            }

        # Rule 3: Pure greeting
        if has_greeting:
            return {
                "intent": "greeting",
                "is_valid": True,
                "confidence": 1.0,
                "reason": "greeting_only"
            }

        # Rule 4: Tourism query (question + keyword)
        if has_question_word and has_tourism_keyword:
            return {
                "intent": "tourism_query",
                "is_valid": True,
                "confidence": 1.0,
                "reason": "clear_tourism_query"
            }

        # Rule 5: Has tourism keyword only
        elif has_tourism_keyword:
            return {
                "intent": "tourism_query",
                "is_valid": True,
                "confidence": 0.8,
                "reason": "has_tourism_keywords"
            }

        # Rule 6: Has question structure only
        elif has_question_word:
            return {
                "intent": "tourism_query",
                "is_valid": True,
                "confidence": 0.6,
                "reason": "has_question_structure"
            }

        # Rule 7: Default - uncertain
        return {
            "intent": "unclear",
            "is_valid": True,
            "confidence": 0.3,
            "reason": "uncertain"
        }
    
    def get_greeting_response(self):
        return "Hello! I'm Pathfinder, your Catanduanes tourism guide. Ask me about beaches, food, activities, or where to stay!"
    
    def get_nonsense_response(self):
        return "I'm sorry, I didn't understand that. Try asking about beaches, surfing, food, accommodations, or activities in Catanduanes! 🏖️"
