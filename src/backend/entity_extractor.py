class EntityExtractor:
    """Extract structured entities from user queries"""
    
    def __init__(self, config):
        self.config = config
        self.places = config['places']
        
        # Entity patterns
        self.budget_indicators = {
            'cheap': ['cheap', 'budget', 'affordable', 'mura', 'murang', 'tipid', 'low cost', 'libreng'],
            'mid': ['mid-range', 'moderate', 'medium', 'standard', 'average', 'kasya'],
            'expensive': ['luxury', 'expensive', 'high-end', 'mahal', 'premium', 'sosyal', 'magastos', 'deluxe']
        }
        
        self.skill_levels = {
            'beginner': ['beginner', 'first time', 'new', 'starter', 'baguhan', 'walang alam', 'kailangan matuto'],
            'intermediate': ['intermediate', 'some experience', 'medyo marunong', 'kaswal', 'regular'],
            'expert': ['expert', 'advanced', 'pro', 'professional', 'experienced', 'guro', 'matindi', 'bihasa']
        }
        
        self.group_types = {
            'solo': ['solo', 'alone', 'myself', 'ako lang', 'mag-isa', 'sarili ko'],
            'couple': ['couple', 'two', 'date', 'romantic', 'dalawa', 'mag-jowa', 'magkasintahan'],
            'family': ['family', 'kids', 'children', 'pamilya', 'bata', 'magulang', 'anak', 'kamag-anak'],
            'group': ['group', 'friends', 'barkada', 'grupo', 'kasmahan', 'marami', 'team']
        }
        
        self.time_periods = {
            'morning': ['morning', 'am', 'umaga', 'early', 'pagka gising', 'alas-siyete', 'hapon'],
            'afternoon': ['afternoon', 'pm', 'hapon', 'tanghali', 'bandang hapon'],
            'evening': ['evening', 'night', 'gabi', 'sunset', 'madilim', 'pagsikat', 'hatinggabi'],
            'weekend': ['weekend', 'saturday', 'sunday', 'sabado', 'linggo', 'katapusan ng linggo'],
            'weekday': ['weekday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'lunes', 'martes', 'miyercu', 'huwebes', 'biyernes']
        }
    
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
        
        # Sort by length to match longer names first
        sorted_places = sorted(self.places.keys(), key=len, reverse=True)
        
        for place in sorted_places:
            if place.lower() in query_lower:
                found.append(place)
        
        return found
    
    def _extract_activities(self, query_lower):
        """Extract activity types from query"""
        found = []
        
        for topic, keywords in self.config['keywords'].items():
            if any(kw in query_lower for kw in keywords):
                found.append(topic)
        
        return found
    
    def _extract_budget(self, query_lower):
        """Extract budget preference"""
        for budget, indicators in self.budget_indicators.items():
            if any(ind in query_lower for ind in indicators):
                return budget
        return None
    
    def _extract_skill_level(self, query_lower):
        """Extract skill level (for activities)"""
        for level, indicators in self.skill_levels.items():
            if any(ind in query_lower for ind in indicators):
                return level
        return None
    
    def _extract_group_type(self, query_lower):
        """Extract group type"""
        for group, indicators in self.group_types.items():
            if any(ind in query_lower for ind in indicators):
                return group
        return None
    
    def _extract_time_period(self, query_lower):
        """Extract time period"""
        for period, indicators in self.time_periods.items():
            if any(ind in query_lower for ind in indicators):
                return period
        return None
    
    def _extract_proximity(self, query_lower):
        """Extract proximity indicators"""
        proximity_words = {
            'near': ['near', 'close to', 'around', 'malapit'],
            'in': ['in', 'at', 'sa'],
            'from': ['from']
        }
        
        for prox_type, words in proximity_words.items():
            if any(word in query_lower for word in words):
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