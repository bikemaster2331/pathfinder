class Controller:
    def __init__(self, config):
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

        has_greeting = any(greeting in query_lower for greeting in self.greetings)
        has_question_word = any(q in words for q in self.question_indicator)

        # Check for tourism keywords
        has_tourism_keyword = False
        for topic, keywords in self.tourism_keywords.items():
            if any(kw in query_lower for kw in keywords):
                has_tourism_keyword = True
                break
            
        # Rule 2: Greeting + Question = Treat as question (prioritize)
        if has_greeting and (has_question_word or has_tourism_keyword):
            return {
                "intent": "tourism_query",
                "is_valid": True,
                "confidence": 1.0,
                "reason": "greeting_with_question",
                "has_greeting": True  # ← Flag to acknowledge greeting in response
            }

        # Rule 3: Pure greeting (no question)
        if has_greeting:
            return {
                "intent": "greeting",
                "is_valid": True,
                "confidence": 1.0,
                "reason": "greeting_only"
            }

        # Rule 4: Tourism query with question word and keyword
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

        # Rule 7: Check for gibberish (no vowels)
        vowel_count = sum(1 for c in query_lower if c in 'aeiou')
        if len(query_lower) > 5 and vowel_count == 0:
            return {
                "intent": "nonsense",
                "is_valid": False,
                "confidence": 0.0,
                "reason": "no_vowels"
            }

        # Rule 8: Default - uncertain, let RAG try
        return {
            "intent": "unclear",
            "is_valid": True,
            "confidence": 0.3,
            "reason": "uncertain"
        }
    
    def get_greeting_response(self):
        """Return friendly greeting"""
        return "Hello! I'm Pathfinder, your Catanduanes tourism guide. Ask me about beaches, food, activities, or where to stay! 😊"
    
    def get_nonsense_response(self):
        """Return polite rejection"""
        return "I'm sorry, I didn't understand that. Try asking about beaches, surfing, food, accommodations, or activities in Catanduanes! 🏖️"