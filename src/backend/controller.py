import re
import unicodedata
from sentence_transformers import util
import torch

class Controller:
    # --- CONFIGURATION CONSTANTS (Adjustable) ---
    MAX_CONSONANT_RUN = 6       # Allow "schmaltz" (6) but flag 7+
    MIN_UNIQUE_RATIO = 0.35     # Threshold for entropy check
    MIN_LENGTH_FOR_CHECKS = 4   # Short words (<4) skip most checks
    
    # Extended vowel set including common accents
    VOWELS = set('aeiouyàáâäæãåāéèêëēėęîïíīįìôöòóœøōõûüùúūu̧ÿñ') 
    
    # Exceptions: Valid words that look like gibberish
    ALLOW_LIST = {
        'hmm', 'hmmm', 'shh', 'shhh', 'psst', 'tsk', 'brrr', 
        'pfft', 'php', 'html', 'css', 'sql'
    }

    # Pre-compiled Regex patterns for performance
    RE_REPEATED_CHARS = re.compile(r'(.)\1{3,}')  # Matches "aaaa"
    
    # Keyboard patterns (QWERTY + common numeric)
    # Stored as a joined string for faster substring checking
    KEYBOARD_SEQUENCES = [
        'asdfghjkl', 'qwertyuiop', 'zxcvbnm', '1234567890',
        'lkjhgfdsa', 'poiuytrewq', 'mnbvcxz', '0987654321' # Reverse included
    ]

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

        print("[INFO] Caching keyword embeddings...")
        self.cached_kw_embeddings = self.embedding_model.encode(all_kw_text, convert_to_tensor=True)

    def _normalize_text(self, text):
        """
        Normalize unicode characters to ASCII approximation for structure checking.
        E.g., "Naïve" -> "naive", "Façade" -> "facade"
        """
        text = text.lower().strip()
        # Decompose unicode (NFD) and filter non-spacing marks
        normalized = ''.join(
            c for c in unicodedata.normalize('NFD', text)
            if unicodedata.category(c) != 'Mn'
        )
        return normalized

    def _is_gibberish(self, text):
        """
        Robust gibberish detection.
        Returns True if text appears to be nonsense.
        """
        # 0. Basic Validation
        if not text: return False
        
        # 1. Normalize for Analysis (Case folding + Accent stripping)
        clean_text = self._normalize_text(text)
        text_len = len(clean_text)

        # 2. Short Circuit for Allow List & Length
        if clean_text in self.ALLOW_LIST:
            return False
        if text_len < self.MIN_LENGTH_FOR_CHECKS:
            return False

        # 3. Check for Character Repetition (aaaaa)
        if self.RE_REPEATED_CHARS.search(clean_text):
            return True

        # 4. Entropy Check (Unique Character Ratio)
        # Catches "sadasdsad" (9 chars, 3 unique -> 0.33 < 0.35)
        unique_chars = len(set(clean_text))
        unique_ratio = unique_chars / text_len
        
        # Only apply strict entropy check on longer strings to avoid false positives on "banana"
        if text_len > 6 and unique_ratio < self.MIN_UNIQUE_RATIO:
            return True

        # 5. Consonant/Vowel Run Check
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
                # Reset on spaces/numbers/punctuation
                max_run = max(max_run, consonant_run)
                consonant_run = 0
        
        # Capture the final run
        max_run = max(max_run, consonant_run)
        
        if max_run > self.MAX_CONSONANT_RUN:
            return True

        # 6. Keyboard Pattern Walk
        # Checks if the input is a substring of common keyboard rows (forward or backward)
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
        clean_text = self._normalize_text(user_input)
        
        # Rule 1: Empty or too short
        if len(clean_text) < 2:
            return {
                "intent": "nonsense",
                "is_valid": False,
                "confidence": 0.0,
                "reason": "too_short"
            }

        # Rule 1.5: Gibberish detection BEFORE semantic matching
        if re.search(r'[a-z]+[;:<>/][a-z]*', clean_text):
            return True
        

        if self._is_gibberish(user_input): # Pass original input, function handles normalization
            return {
                "intent": "nonsense",
                "is_valid": False,
                "confidence": 0.0,
                "reason": "gibberish_detected"
            }

        # Use normalized text for keyword matching to ensure robustness
        has_greeting = any(g in clean_text for g in self.greetings)
        has_question_word = any(q in clean_text.split() for q in self.question_indicator)

        has_tourism_keyword = False
        for topic, keywords in self.tourism_keywords.items():
            # Check keywords against normalized text
            if any(self._normalize_text(kw) in clean_text for kw in keywords):
                has_tourism_keyword = True
                break
        
        if not has_tourism_keyword:
            has_tourism_keyword = self.check_semantic_match(user_input)
            
        if has_greeting and (has_question_word or has_tourism_keyword):
            return {"intent": "tourism_query", "is_valid": True, "confidence": 1.0, "reason": "greeting_with_question", "has_greeting": True}

        if has_greeting:
            return {"intent": "greeting", "is_valid": True, "confidence": 1.0, "reason": "greeting_only"}

        if has_question_word and has_tourism_keyword:
            return {"intent": "tourism_query", "is_valid": True, "confidence": 1.0, "reason": "clear_tourism_query"}

        elif has_tourism_keyword:
            return {"intent": "tourism_query", "is_valid": True, "confidence": 0.8, "reason": "has_tourism_keywords"}

        elif has_question_word:
            return {"intent": "tourism_query", "is_valid": True, "confidence": 0.6, "reason": "has_question_structure"}

        return {"intent": "unclear", "is_valid": True, "confidence": 0.3, "reason": "uncertain"}
    
    def get_greeting_response(self):
        return "Hello! I'm Pathfinder, your Catanduanes tourism guide. Ask me about beaches, food, activities, or where to stay!"
    
    def get_nonsense_response(self):
        return "I'm sorry, I didn't understand that. Try asking about beaches, surfing, food, accommodations, or activities in Catanduanes! 🏖️"