import re

class EntityExtractor:
    """Extract structured entities from user queries"""
    
    def __init__(self, config):
        self.config = config
        self.places = config['places']
        
        # Entity patterns
        self.budget_indicators = {
            'cheap': ['cheap', 'budget', 'affordable', 'mura', 'murang'],
            'mid': ['mid-range', 'moderate', 'medium'],
            'expensive': ['luxury', 'expensive', 'high-end', 'mahal', 'premium']
        }
        
        self.skill_levels = {
            'beginner': ['beginner', 'first time', 'new', 'starter', 'baguhan'],
            'intermediate': ['intermediate', 'some experience'],
            'expert': ['expert', 'advanced', 'pro', 'professional', 'experienced']
        }
        
        self.group_types = {
            'solo': ['solo', 'alone', 'myself', 'ako lang'],
            'couple': ['couple', 'two', 'date', 'romantic', 'dalawa'],
            'family': ['family', 'kids', 'children', 'pamilya', 'bata'],
            'group': ['group', 'friends', 'barkada', 'grupo']
        }
        
        self.time_periods = {
            'morning': ['morning', 'umaga', 'early'],
            'afternoon': ['afternoon', 'hapon'],
            'evening': ['evening', 'night', 'gabi', 'sunset'],
            'weekend': ['weekend', 'saturday', 'sunday'],
            'weekday': ['weekday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        }
        
        self.municipalities = [
            'virac', 'baras', 'pandan', 'bato', 'gigmoto',
            'san andres', 'bagamanoc', 'viga', 'caramoran',
            'panganiban', 'san miguel'
        ]
    
    def extract(self, user_input):
        query_lower = user_input.lower()
        
        # 1. Extract Places first so we can pass them to intent detection
        found_places = self._extract_places(query_lower)
        
        entities = {
            'places': found_places,
            'activities': self._extract_activities(query_lower),
            'budget': self._extract_budget(query_lower),
            'skill_level': self._extract_skill_level(query_lower),
            'group_type': self._extract_group_type(query_lower),
            'time_period': self._extract_time_period(query_lower),
            'proximity': self._extract_proximity(query_lower),
            # NEW: Add these two (Updated inference and detection)
            'inferred_town': self._infer_municipality(user_input),
            'is_listing': self._detect_listing_intent(user_input, found_places)
        }
        
        return entities
    
    def _extract_places(self, query_lower):
        """Extract place names mentioned in query (Fuzzy Matching Implemented)"""
        found = []

        # Clean input: remove punctuation, extra spaces
        # "Hinik-Hinik" -> "hinik hinik"
        clean_input = re.sub(r'[^\w\s]', ' ', query_lower)

        # Check specific places first (longer matches)
        sorted_places = sorted(self.places.keys(), key=len, reverse=True)
        
        for place in sorted_places:
            # Clean the config place name too
            clean_place_name = re.sub(r'[^\w\s]', ' ', place.lower())
            
            # Check if cleaned name exists in cleaned input
            if clean_place_name in clean_input:
                found.append(place)
                # Remove from input to avoid double matching
                clean_input = clean_input.replace(clean_place_name, "")

        # Also check for standalone municipality names
        for municipality in self.municipalities:
            # We use the fuzzy clean_input here too
            if municipality in clean_input and municipality.title() not in found:
                found.append(municipality.title())

        return found
    
    def _extract_activities(self, query_lower):
        """Extract activity types from query using word boundaries"""
        found = []
        
        for topic, keywords in self.config['keywords'].items():
            # Build pattern with word boundaries
            pattern = r'\b(' + '|'.join(map(re.escape, keywords)) + r')s?\b'
            if re.search(pattern, query_lower):
                found.append(topic)
        
        return found
    
    def _extract_budget(self, query_lower):
        """Extract budget preference using word boundaries"""
        for budget, indicators in self.budget_indicators.items():
            pattern = r'\b(' + '|'.join(map(re.escape, indicators)) + r')s?\b'
            
            if re.search(pattern, query_lower):
                return budget
        return None
    
    def _extract_skill_level(self, query_lower):
        """Extract skill level using word boundaries"""
        for level, indicators in self.skill_levels.items():
            pattern = r'\b(' + '|'.join(map(re.escape, indicators)) + r')s?\b'
            
            if re.search(pattern, query_lower):
                return level
        return None
    
    def _extract_group_type(self, query_lower):
        """Extract group type using word boundaries"""
        for group, indicators in self.group_types.items():
            pattern = r'\b(' + '|'.join(map(re.escape, indicators)) + r')s?\b'
            
            if re.search(pattern, query_lower):
                return group
        return None
    
    def _extract_time_period(self, query_lower):
        """Extract time period using word boundaries"""
        for period, indicators in self.time_periods.items():
            pattern = r'\b(' + '|'.join(map(re.escape, indicators)) + r')s?\b'
            
            if re.search(pattern, query_lower):
                return period
        return None
    
    def _extract_proximity(self, query_lower):
        """Extract proximity indicators using word boundaries"""
        proximity_patterns = {
            'near': r'\b(near|close to|around|malapit)\b',
            'in': r'\b(in|at|sa)\b',
            'from': r'\bfrom\b'
        }
        
        for prox_type, pattern in proximity_patterns.items():
            if re.search(pattern, query_lower):
                return prox_type
        
        return None
    
    # ========================================================================
    # NEW METHOD 1: Municipality Inference (Rule-Based Hints)
    # ========================================================================
    def _infer_municipality(self, query):
        """Infer municipality from implicit hints when not explicitly mentioned"""
        query_lower = query.lower()
        
        # Implicit location hints (Common tourist landmarks/features)
        hints = {
            'airport': 'VIRAC',
            'downtown': 'VIRAC',
            'capital': 'VIRAC',
            'town center': 'VIRAC',
            'public market': 'VIRAC'
        }
        
        for keyword, town in hints.items():
            if keyword in query_lower:
                return town
        
        # Default fallback: Return None (Let RAG search everywhere)
        return None
    
    # ========================================================================
    # NEW METHOD 2: Listing Intent Detection (Multi-Signal)
    # ========================================================================
    def _detect_listing_intent(self, query, found_places):
        """Detect if user wants a list/browsing experience"""
        query_lower = query.lower()
        
        # Strong listing keywords
        listing_keywords = ['all', 'list', 'show me', 'what are', 'which', 'any', 'options', 'where can i', 'where to', 'places for', 'places to' ]
        if any(kw in query_lower for kw in listing_keywords):
            return True
        
        # Plural nouns indicate browsing
        plurals = [
            'beaches', 'hotels', 'cafes', 'restaurants', 'falls', 
            'resorts', 'waterfalls', 'viewpoints', 'activities',
            'burgers', 'pizzas', 'coffee shops', 'bars'  # NEW
        ]
        
        has_plural = any(plural in query_lower for plural in plurals)

        specific_spots = [
            p for p in found_places 
            if p.lower() not in self.municipalities
        ]
        
        if has_plural and len(specific_spots) == 0:
            return True
        
        if re.search(r'\b(in|at|around|near)\s+(virac|baras|pandan|bato|gigmoto|san andres)\b', query_lower):
            if len(specific_spots) == 0:
                return True
        
        return False
    
    def build_enhanced_query(self, entities):
        """Build enhanced search query from entities"""
        query_parts = []
        
        # Add activities
        if entities['activities']:
            query_parts.extend(entities['activities'])
        
        # Add places
        if entities['places']:
            query_parts.extend(entities['places'])
        
        # Add budget modifier
        if entities['budget']:
            query_parts.append(entities['budget'])
        
        # Add skill level
        if entities['skill_level']:
            query_parts.append(entities['skill_level'])
        
        # Add group type
        if entities['group_type']:
            query_parts.append(entities['group_type'])
        
        return ' '.join(query_parts)