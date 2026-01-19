import re
import unicodedata
from sentence_transformers import util
import torch

class Controller:
    # --- CONFIGURATION CONSTANTS (Adjustable) ---
    MAX_CONSONANT_RUN = 5
    MIN_UNIQUE_RATIO = 0.35
    MIN_LENGTH_FOR_CHECKS = 3
    
    VOWELS = set('aeiouyàáâäæãåāéèêëēėęîïíīįìôöòóœøōõûüùúūu̧ÿñ')
    
    ALLOW_LIST = {
        'pathfinder', 'catanduanes', 'hardware', 'software', 'raspberry', 'pi', 
        'virac', 'bato', 'baras', 'pandan', 'viga', 'gigmoto', 
        'panganiban', 'bagamanoc', 'caramoran', 'san miguel', 'san andres',
        'puraran', 'beaches', 'falls', 'cave', 'church', 'bus', 'van'
    }

    RE_REPEATED_CHARS = re.compile(r'(.)\1{3,}')
    
    KEYBOARD_SEQUENCES = [
        'asdfghjkl', 'qwertyuiop', 'zxcvbnm', '1234567890',
        'lkjhgfdsa', 'poiuytrewq', 'mnbvcxz', '0987654321'
    ]

    def __init__(self, config, embedding_model):
        self.greetings = [
            'hi', 'hello', 'hey', 'kumusta', 'good morning',
            'good afternoon', 'good evening', 'musta', 'kamusta', 'yo'
        ]
        
        self.question_indicator = [
            'what', 'where', 'how', 'when', 'who', 'why', 'which',
            'can', 'is', 'are', 'do', 'does', 'will', 'should',
            'tell', 'show', 'give',
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
        
        # Add municipalities to semantic cache for robust matching
        self.keywords_topic.extend(['location'] * 11)
        all_kw_text.extend(['virac', 'baras', 'bato', 'pandan', 'viga', 'gigmoto', 'panganiban', 'bagamanoc', 'caramoran', 'san miguel', 'san andres'])

        print("[INFO] Caching keyword embeddings...")
        self.cached_kw_embeddings = self.embedding_model.encode(all_kw_text, convert_to_tensor=True)

    def _normalize_text(self, text):
        """Normalize unicode to ASCII for structure checking"""
        text = text.lower().strip()
        normalized = ''.join(
            c for c in unicodedata.normalize('NFD', text)
            if unicodedata.category(c) != 'Mn'
        )
        return normalized

    def _is_gibberish(self, text):
        """Robust gibberish detection - returns True if text looks like nonsense"""
        if not text:
            return False
        
        clean_text = self._normalize_text(text)
        text_len = len(clean_text)

        # Short circuit
        if clean_text in self.ALLOW_LIST:
            return False
        if text_len < self.MIN_LENGTH_FOR_CHECKS:
            return False

        # 1. Regex for repeated characters (e.g., "aaaa")
        if self.RE_REPEATED_CHARS.search(clean_text):
            return True

        # 2. Entropy Check
        unique_chars = len(set(clean_text))
        unique_ratio = unique_chars / text_len
        
        # Stricter ratio for short strings
        threshold = 0.50 if text_len < 10 else self.MIN_UNIQUE_RATIO
        
        if unique_ratio < threshold:
            return True

        # 3. Consonant run check
        consonant_run = 0
        max_run = 0
        for char in clean_text:
            if char.isalpha():
                if char not in self.VOWELS:
                    consonant_run += 1
                else:
                    max_run = max(max_run, consonant_run)
                    consonant_run = 0
            else:
                max_run = max(max_run, consonant_run)
                consonant_run = 0
        
        if max(max_run, consonant_run) > self.MAX_CONSONANT_RUN:
            return True

        # 4. Keyboard pattern
        if text_len > 3:
            for pattern in self.KEYBOARD_SEQUENCES:
                if clean_text in pattern:
                    return True

        return False

    def check_semantic_match(self, user_input):
        # CRITICAL FIX: Removed the ' ' not in user_input check to allow single words
        if len(user_input) < 3: 
            return False

        query_embedding = self.embedding_model.encode(user_input, convert_to_tensor=True)
        cosine_scores = util.cos_sim(query_embedding, self.cached_kw_embeddings)[0]
        best_score, best_index = torch.max(cosine_scores, dim=0)
        
        # Lower threshold slightly for short specific queries
        threshold = 0.80 if len(user_input) < 10 else 0.85
        
        if best_score > threshold:
            # matched_topic = self.keywords_topic[best_index.item()]
            # print(f"[DEBUG] Semantic Match: '{user_input}' (Score: {best_score:.2f})")
            return True
        
        return False

    def analyze_query(self, user_input):
        """
        Improved intent analysis with scoring system.
        """
        clean_text = self._normalize_text(user_input)
        
        # Rule 1: Still catch truly empty
        if len(clean_text) < 2:
            return {
                "intent": "nonsense",
                "is_valid": False,
                "confidence": 0.0,
                "reason": "too_short"
            }

        # Check for gibberish
        is_gibberish = self._is_gibberish(user_input)
        
        # Check for core identifiers
        has_greeting = any(g == clean_text for g in self.greetings)
        if not has_greeting:
             has_greeting = any(g in clean_text.split() for g in self.greetings)
        
        has_question_word = any(q in clean_text.split() for q in self.question_indicator)
        
        # Better keyword matching including province name
        has_tourism_keyword = any(word in clean_text for word in self.ALLOW_LIST)
        
        if not has_tourism_keyword:
            for topic, keywords in self.tourism_keywords.items():
                if any(self._normalize_text(kw) in clean_text for kw in keywords):
                    has_tourism_keyword = True
                    break
        
        if not has_tourism_keyword:
            has_tourism_keyword = self.check_semantic_match(user_input)

        # STRATEGIC CONFIDENCE SCORING
        confidence = 0.0
        
        if has_tourism_keyword:
            confidence += 0.6
        if has_question_word:
            confidence += 0.3
        if has_greeting:
            confidence += 0.1
        
        # Penalize hard if gibberish
        if is_gibberish:
            confidence -= 0.6
        
        # Final Intent Assignment
        if confidence >= 0.5:
            return {
                "intent": "tourism_query",
                "is_valid": True,
                "confidence": min(confidence, 1.0),
                "reason": "scored_as_tourism"
            }
        elif has_greeting and not is_gibberish:
            return {
                "intent": "greeting",
                "is_valid": True,
                "confidence": 1.0,
                "reason": "greeting_only"
            }
        else:
            return {
                "intent": "nonsense" if is_gibberish else "tourism_query", 
                "is_valid": not is_gibberish,
                "confidence": 0.3 if not is_gibberish else 0.0,
                "reason": "uncertain"
            }
    
    def get_greeting_response(self):
        return "Hello! I'm Pathfinder, your Catanduanes tourism guide. Ask me about beaches, food, activities, or where to stay!"
    
    def get_nonsense_response(self):
        return "I'm sorry, I didn't understand that. Try asking about beaches, surfing, food, accommodations, or activities in Catanduanes!"