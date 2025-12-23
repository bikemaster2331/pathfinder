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
        """
        Extract all entities from user input
        Returns: dict with extracted entities
        """
        query_lower = user_input.lower()
        
        entities = {
            'places': self._extract_places(query_lower),
            'activities': self._extract_activities(query_lower),
            'budget': self._extract_budget(query_lower),
            'skill_level': self._extract_skill_level(query_lower),
            'group_type': self._extract_group_type(query_lower),
            'time_period': self._extract_time_period(query_lower),
            'proximity': self._extract_proximity(query_lower)
        }
        
        return entities
    
    def _extract_places(self, query_lower):
        """Extract place names mentioned in query"""
        found = []

        # Check specific places first (longer matches)
        sorted_places = sorted(self.places.keys(), key=len, reverse=True)
        for place in sorted_places:
            pattern = r'\b' + re.escape(place.lower()) + r'\b'
            if re.search(pattern, query_lower):
                found.append(place)

        # NEW: Also check for standalone municipality names
        for municipality in self.municipalities:
            pattern = r'\b' + re.escape(municipality) + r'\b'
            if re.search(pattern, query_lower) and municipality.title() not in found:
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
            # Build pattern: \b(cheap|budget|affordable|mura|murang)\b
            pattern = r'\b(' + '|'.join(map(re.escape, indicators)) + r')s?\b'
            
            if re.search(pattern, query_lower):
                return budget
        return None
    
    def _extract_skill_level(self, query_lower):
        """Extract skill level using word boundaries"""
        for level, indicators in self.skill_levels.items():
            # Escape special regex characters and add word boundaries
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