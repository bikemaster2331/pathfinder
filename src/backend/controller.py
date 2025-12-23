import re
import unicodedata
from sentence_transformers import util
import torch

class Controller:
    # --- CONFIGURATION CONSTANTS (Adjustable) ---
    MAX_CONSONANT_RUN = 6
    MIN_UNIQUE_RATIO = 0.35
    MIN_LENGTH_FOR_CHECKS = 4
    
    VOWELS = set('aeiouyàáâäæãåāéèêëēėęîïíīįìôöòóœøōõûüùúūu̧ÿñ')
    
    ALLOW_LIST = {
        'hmm', 'hmmm', 'shh', 'shhh', 'psst', 'tsk', 'brrr',
        'pfft', 'php', 'html', 'css', 'sql', 'pathfinder',
        'catanduanes', 'hardware', 'software', 'raspberry', 'pi', 'created', 
        'developed', 'researchers', 'university'
    }

    RE_REPEATED_CHARS = re.compile(r'(.)\1{3,}')
    
    KEYBOARD_SEQUENCES = [
        'asdfghjkl', 'qwertyuiop', 'zxcvbnm', '1234567890',
        'lkjhgfdsa', 'poiuytrewq', 'mnbvcxz', '0987654321'
    ]

    def __init__(self, config, embedding_model):
        self.greetings = [
            'hi', 'hello', 'hey', 'kumusta', 'good morning',
            'good afternoon', 'good evening', 'musta', 'kamusta'
        ]
        
        self.question_indicator = [
            'what', 'where', 'how', 'when', 'who', 'why', 'which',
            'can', 'is', 'are', 'do', 'does', 'will', 'should',
            'tell', 'show', 'give',  # ADD: Commands
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
        """Robust gibberish detection - returns confidence penalty"""
        if not text:
            return False
        
        clean_text = self._normalize_text(text)
        text_len = len(clean_text)

        # Short circuit
        if clean_text in self.ALLOW_LIST:
            return False
        if text_len < self.MIN_LENGTH_FOR_CHECKS:
            return False

        # Character repetition
        if self.RE_REPEATED_CHARS.search(clean_text):
            return True

        # Entropy check
        unique_chars = len(set(clean_text))
        unique_ratio = unique_chars / text_len
        
        if text_len > 6 and unique_ratio < self.MIN_UNIQUE_RATIO:
            return True

        # Consonant run check
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
        
        max_run = max(max_run, consonant_run)
        
        if max_run > self.MAX_CONSONANT_RUN:
            return True

        # Keyboard pattern
        if text_len > 3:
            for pattern in self.KEYBOARD_SEQUENCES:
                if clean_text in pattern:
                    return True

        return False

    def check_semantic_match(self, user_input):
        """Semantic matching with higher threshold"""
        query_embedding = self.embedding_model.encode(user_input, convert_to_tensor=True)
        cosine_scores = util.cos_sim(query_embedding, self.cached_kw_embeddings)[0]
        best_score, best_index = torch.max(cosine_scores, dim=0)
        
        if best_score > 0.85:
            matched_topic = self.keywords_topic[best_index.item()]
            print(f"[DEBUG] Semantic Match: '{user_input}' → '{matched_topic}' (Score: {best_score:.2f})")
            return True
        
        return False

    def analyze_query(self, user_input):
        """
        Improved intent analysis with scoring system.
        Philosophy: Be helpful, not gatekeeping!
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

        # ❌ REMOVED: Rule 1.5 technical char check (too strict!)
        # The RAG will handle technical queries naturally

        # Check for gibberish (but soften the impact)
        is_gibberish = self._is_gibberish(user_input)
        
        # Check for core identifiers
        has_greeting = any(g in clean_text for g in self.greetings)
        has_question_word = any(q in clean_text.split() for q in self.question_indicator)
        
        # NEW: Better keyword matching including province name
        has_tourism_keyword = any(word in clean_text for word in [
            'catanduanes', 'island', 'province', 'virac', 'baras',
            'pandan', 'bato', 'pathfinder'
        ])
        
        if not has_tourism_keyword:
            for topic, keywords in self.tourism_keywords.items():
                if any(self._normalize_text(kw) in clean_text for kw in keywords):
                    has_tourism_keyword = True
                    break
        
        if not has_tourism_keyword:
            has_tourism_keyword = self.check_semantic_match(user_input)

        # STRATEGIC CONFIDENCE SCORING (The Document's Approach)
        confidence = 0.0
        
        if has_tourism_keyword:
            confidence += 0.6
        if has_question_word:
            confidence += 0.3
        if has_greeting:
            confidence += 0.1
        
        # Penalize but don't kill if gibberish
        if is_gibberish:
            confidence -= 0.5
        
        # Final Intent Assignment
        if confidence >= 0.5:
            return {
                "intent": "tourism_query",
                "is_valid": True,
                "confidence": min(confidence, 1.0),
                "reason": "scored_as_tourism"
            }
        elif has_greeting:
            return {
                "intent": "greeting",
                "is_valid": True,
                "confidence": 1.0,
                "reason": "greeting_only"
            }
        else:
            # CHANGED: Don't block, let RAG try (it will return "not sure" if no match)
            return {
                "intent": "tourism_query",  # Changed from "unclear"
                "is_valid": True,
                "confidence": 0.3,
                "reason": "uncertain_let_rag_try"
            }
    
    def get_greeting_response(self):
        return "Hello! I'm Pathfinder, your Catanduanes tourism guide. Ask me about beaches, food, activities, or where to stay!"
    
    def get_nonsense_response(self):
        return "I'm sorry, I didn't understand that. Try asking about beaches, surfing, food, accommodations, or activities in Catanduanes! 🏖️"