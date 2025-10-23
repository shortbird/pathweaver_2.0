"""
Quest Concept Matching Service
Detects similar quests through concept extraction and comparison
"""

import re
from typing import Dict, List, Set, Tuple, Optional
from collections import defaultdict
import hashlib
import json

from utils.logger import get_logger

logger = get_logger(__name__)

class QuestConceptMatcher:
    """Handles concept extraction and similarity matching for quests"""
    
    def __init__(self):
        """Initialize the concept matcher with common word lists"""
        
        # Common words to filter out
        self.common_words = {
            'the', 'and', 'for', 'with', 'this', 'that', 'your', 'will', 
            'can', 'how', 'what', 'when', 'where', 'why', 'are', 'was',
            'were', 'been', 'have', 'has', 'had', 'does', 'did', 'shall',
            'would', 'could', 'should', 'may', 'might', 'must', 'from',
            'into', 'through', 'during', 'before', 'after', 'above', 'below',
            'between', 'under', 'but', 'not', 'such', 'then', 'once',
            'here', 'there', 'these', 'those', 'than', 'very', 'too'
        }
        
        # Action words for activity extraction
        self.action_verbs = {
            'build', 'create', 'explore', 'discover', 'learn', 'make',
            'design', 'investigate', 'connect', 'share', 'document',
            'analyze', 'transform', 'grow', 'develop', 'research',
            'write', 'present', 'demonstrate', 'practice', 'implement',
            'solve', 'experiment', 'observe', 'measure', 'calculate',
            'compose', 'perform', 'express', 'communicate', 'collaborate',
            'evaluate', 'compare', 'synthesize', 'apply', 'test'
        }
        
        # Skill keywords
        self.skill_keywords = {
            'using', 'with', 'through', 'via', 'by', 'applying',
            'leveraging', 'utilizing', 'employing', 'incorporating'
        }
        
        # Topic patterns (for noun extraction)
        self.noun_patterns = [
            re.compile(r'\b(\w+ing)\b'),  # Gerunds
            re.compile(r'\b(\w+tion)\b'), # -tion words
            re.compile(r'\b(\w+ment)\b'), # -ment words
            re.compile(r'\b(\w+ness)\b'), # -ness words
            re.compile(r'\b(\w+ity)\b'),  # -ity words
        ]
        
        # Concept cache for performance
        self.concept_cache = {}
        self.max_cache_size = 1000
    
    def extract_concepts(self, quest: Dict) -> Dict[str, List[str]]:
        """
        Extract key concepts from a quest
        
        Args:
            quest: Quest data dictionary
        
        Returns:
            Dictionary of concept categories and their values
        """
        
        # Check cache first
        cache_key = self._get_cache_key(quest)
        if cache_key in self.concept_cache:
            return self.concept_cache[cache_key]
        
        concepts = {
            'primary': [],      # Main concepts from title and big_idea
            'activities': [],   # Action verbs and activities
            'topics': [],       # Subject matter and topics
            'skills': [],       # Skills and tools
            'context': []       # Setting and context
        }
        
        # Extract from title and big_idea
        title = quest.get('title', '')
        big_idea = quest.get('big_idea', quest.get('description', ''))
        main_text = f"{title} {big_idea}".lower()
        
        # Extract primary concepts (important words from title)
        title_words = self._tokenize(title.lower())
        concepts['primary'] = [
            word for word in title_words 
            if len(word) > 3 and word not in self.common_words
        ][:5]  # Keep top 5 primary concepts
        
        # Extract topics (nouns)
        concepts['topics'] = self._extract_nouns(main_text)
        
        # Extract activities (verbs)
        concepts['activities'] = self._extract_verbs(main_text)
        
        # Extract from tasks
        tasks = quest.get('tasks', quest.get('suggested_tasks', []))
        for task in tasks:
            if isinstance(task, dict):
                task_concepts = self._extract_task_concepts(task)
                concepts['activities'].extend(task_concepts.get('activities', []))
                concepts['skills'].extend(task_concepts.get('skills', []))
                concepts['topics'].extend(task_concepts.get('topics', []))
        
        # Extract context from difficulty and pillars
        if quest.get('difficulty'):
            concepts['context'].append(quest['difficulty'])
        
        if quest.get('pillar'):
            concepts['context'].append(quest['pillar'].lower().replace(' & ', '_'))
        
        # Clean and deduplicate concepts
        for key in concepts:
            concepts[key] = self._clean_concepts(concepts[key])
        
        # Cache the result
        self._cache_concepts(cache_key, concepts)
        
        return concepts
    
    def calculate_similarity(
        self,
        quest1_concepts: Dict[str, List[str]],
        quest2_concepts: Dict[str, List[str]]
    ) -> float:
        """
        Calculate similarity score between two quest concept sets
        
        Args:
            quest1_concepts: Concepts from first quest
            quest2_concepts: Concepts from second quest
        
        Returns:
            Similarity score between 0 and 1
        """
        
        # Weights for different concept types
        weights = {
            'primary': 0.35,    # Main theme is most important
            'activities': 0.25, # What they're doing
            'topics': 0.20,     # Subject matter
            'skills': 0.15,     # Skills/tools used
            'context': 0.05     # Setting is least important
        }
        
        total_similarity = 0.0
        total_weight = 0.0
        
        for concept_type, weight in weights.items():
            set1 = set(quest1_concepts.get(concept_type, []))
            set2 = set(quest2_concepts.get(concept_type, []))
            
            # Skip if either set is empty
            if not set1 or not set2:
                continue
            
            # Calculate Jaccard similarity
            intersection = set1.intersection(set2)
            union = set1.union(set2)
            
            if len(union) > 0:
                similarity = len(intersection) / len(union)
                total_similarity += similarity * weight
                total_weight += weight
        
        # Normalize by actual weight used
        if total_weight > 0:
            return total_similarity / total_weight
        
        return 0.0
    
    def check_quest_similarity(
        self,
        new_quest: Dict,
        existing_quests: List[Dict],
        threshold: float = 0.7
    ) -> Dict:
        """
        Check similarity of new quest against existing quests
        
        Args:
            new_quest: Quest to check
            existing_quests: List of existing quests
            threshold: Similarity threshold for flagging
        
        Returns:
            Similarity analysis results
        """
        
        # Extract concepts from new quest
        new_concepts = self.extract_concepts(new_quest)
        
        # Pre-filter candidates for efficiency
        candidates = self._prefilter_candidates(new_quest, existing_quests)
        
        # Calculate similarities
        similarities = []
        for existing in candidates:
            existing_concepts = self.extract_concepts(existing)
            similarity = self.calculate_similarity(new_concepts, existing_concepts)
            
            if similarity > 0.1:  # Only track meaningful similarities
                similarities.append({
                    'quest_id': existing.get('id'),
                    'title': existing.get('title'),
                    'similarity': similarity,
                    'concepts': existing_concepts
                })
        
        # Sort by similarity
        similarities.sort(key=lambda x: x['similarity'], reverse=True)
        
        # Get top match
        top_match = similarities[0] if similarities else None
        
        # Analyze uniqueness
        unique_aspects = None
        if top_match and top_match['similarity'] > threshold:
            unique_aspects = self._identify_unique_aspects(
                new_concepts,
                top_match['concepts'],
                top_match['similarity']
            )
        
        return {
            'score': top_match['similarity'] if top_match else 0,
            'exceeds_threshold': (top_match['similarity'] if top_match else 0) > threshold,
            'most_similar': top_match,
            'top_matches': similarities[:5],
            'unique_aspects': unique_aspects,
            'recommendation': self._get_recommendation(top_match, threshold)
        }
    
    def _prefilter_candidates(
        self,
        new_quest: Dict,
        existing_quests: List[Dict]
    ) -> List[Dict]:
        """Pre-filter quests to reduce comparison overhead"""
        
        candidates = []
        new_pillars = set()
        
        # Get pillars from new quest
        if new_quest.get('pillar'):
            new_pillars.add(new_quest['pillar'])
        
        # Get pillars from tasks
        for task in new_quest.get('tasks', []):
            if isinstance(task, dict) and task.get('pillar'):
                new_pillars.add(task['pillar'])
        
        for existing in existing_quests:
            # Skip if very different quest types
            if (existing.get('source') and new_quest.get('source') and
                existing['source'] != new_quest['source']):
                continue
            
            # Check for pillar overlap
            existing_pillars = set()
            if existing.get('pillar'):
                existing_pillars.add(existing['pillar'])
            
            for task in existing.get('tasks', existing.get('quest_tasks', [])):
                if isinstance(task, dict) and task.get('pillar'):
                    existing_pillars.add(task['pillar'])
            
            # Include if there's pillar overlap or no pillars defined
            if not new_pillars or not existing_pillars or new_pillars.intersection(existing_pillars):
                candidates.append(existing)
        
        return candidates
    
    def _identify_unique_aspects(
        self,
        new_concepts: Dict,
        similar_concepts: Dict,
        similarity_score: float
    ) -> Dict:
        """Identify what makes the new quest unique"""
        
        unique = {
            'is_unique': similarity_score < 0.7,
            'unique_elements': {},
            'suggestions': []
        }
        
        # Find unique concepts in each category
        for concept_type in ['activities', 'topics', 'skills']:
            new_set = set(new_concepts.get(concept_type, []))
            similar_set = set(similar_concepts.get(concept_type, []))
            
            unique_items = new_set - similar_set
            if unique_items:
                unique['unique_elements'][concept_type] = list(unique_items)
        
        # Generate suggestions
        if unique['unique_elements'].get('activities'):
            unique['suggestions'].append(
                f"Focus on unique activities: {', '.join(unique['unique_elements']['activities'][:3])}"
            )
        
        if unique['unique_elements'].get('topics'):
            unique['suggestions'].append(
                f"Emphasize distinctive topics: {', '.join(unique['unique_elements']['topics'][:3])}"
            )
        
        if unique['unique_elements'].get('skills'):
            unique['suggestions'].append(
                f"Highlight special skills: {', '.join(unique['unique_elements']['skills'][:3])}"
            )
        
        if not unique['suggestions']:
            unique['suggestions'].append(
                'Consider adding a unique angle, local context, or personal twist to differentiate this quest'
            )
        
        return unique
    
    def _get_recommendation(self, top_match: Optional[Dict], threshold: float) -> str:
        """Generate recommendation based on similarity results"""
        
        if not top_match:
            return "This quest appears to be unique. Proceed with creation."
        
        score = top_match['similarity']
        
        if score > 0.9:
            return f"Very similar to '{top_match['title']}' ({score:.0%}). Consider significant modifications or use existing quest."
        elif score > threshold:
            return f"Similar to '{top_match['title']}' ({score:.0%}). Consider emphasizing unique aspects."
        elif score > 0.5:
            return f"Some similarity to '{top_match['title']}' ({score:.0%}). Quest is sufficiently unique."
        else:
            return "Quest appears unique. Proceed with creation."
    
    def _extract_nouns(self, text: str) -> List[str]:
        """Extract noun-like words from text"""
        
        nouns = []
        words = self._tokenize(text)
        
        for word in words:
            # Check noun patterns
            for pattern in self.noun_patterns:
                if pattern.match(word) and len(word) > 4:
                    nouns.append(word)
                    break
            
            # Check for capitalized words (proper nouns)
            if word[0].isupper() and len(word) > 3:
                nouns.append(word.lower())
        
        return nouns
    
    def _extract_verbs(self, text: str) -> List[str]:
        """Extract action verbs from text"""
        
        words = self._tokenize(text)
        verbs = [word for word in words if word in self.action_verbs]
        
        # Also look for imperative verbs at start of sentences
        sentences = text.split('.')
        for sentence in sentences:
            words = self._tokenize(sentence.strip())
            if words and words[0] in self.action_verbs:
                verbs.append(words[0])
        
        return verbs
    
    def _extract_task_concepts(self, task: Dict) -> Dict:
        """Extract concepts from a task"""
        
        concepts = {'activities': [], 'skills': [], 'topics': []}
        
        title = task.get('title', '')
        description = task.get('description', '')
        
        # Extract action from task title
        title_words = self._tokenize(title.lower())
        if title_words and title_words[0] in self.action_verbs:
            concepts['activities'].append(title_words[0])
        
        # Extract skills using keyword patterns
        full_text = f"{title} {description}".lower()
        for keyword in self.skill_keywords:
            pattern = f"{keyword}\\s+(\\w+)"
            matches = re.findall(pattern, full_text)
            concepts['skills'].extend(matches)
        
        # Extract topic nouns from description
        concepts['topics'] = self._extract_nouns(description)[:3]
        
        return concepts
    
    def _tokenize(self, text: str) -> List[str]:
        """Tokenize text into words"""
        
        # Remove punctuation and split
        text = re.sub(r'[^\w\s]', ' ', text)
        words = text.lower().split()
        
        # Filter short words and numbers
        return [word for word in words if len(word) > 2 and not word.isdigit()]
    
    def _clean_concepts(self, concepts: List[str]) -> List[str]:
        """Clean and deduplicate concept list"""
        
        # Remove duplicates
        unique = list(set(concepts))
        
        # Filter common words and short words
        cleaned = [
            word for word in unique
            if word not in self.common_words and len(word) > 2
        ]
        
        # Sort by frequency (most common first)
        from collections import Counter
        counter = Counter(concepts)
        cleaned.sort(key=lambda x: counter[x], reverse=True)
        
        return cleaned[:20]  # Limit to top 20 concepts
    
    def _get_cache_key(self, quest: Dict) -> str:
        """Generate cache key for quest"""
        
        # Use title and description for cache key
        key_data = f"{quest.get('title', '')}{quest.get('description', '')}"
        return hashlib.md5(key_data.encode()).hexdigest()
    
    def _cache_concepts(self, key: str, concepts: Dict):
        """Cache extracted concepts"""
        
        # Limit cache size
        if len(self.concept_cache) >= self.max_cache_size:
            # Remove oldest entry (FIFO)
            first_key = next(iter(self.concept_cache))
            del self.concept_cache[first_key]
        
        self.concept_cache[key] = concepts
    
    async def build_concept_index(self, quests: List[Dict]) -> Dict:
        """
        Build concept index for fast lookup
        
        Args:
            quests: List of quests to index
        
        Returns:
            Concept index structure
        """
        
        index = {
            'by_activity': defaultdict(list),
            'by_topic': defaultdict(list),
            'by_skill': defaultdict(list),
            'concepts': {},
            'total_quests': len(quests)
        }
        
        for quest in quests:
            quest_id = quest.get('id', quest.get('title'))
            concepts = self.extract_concepts(quest)
            
            # Store concepts
            index['concepts'][quest_id] = concepts
            
            # Index by activity
            for activity in concepts.get('activities', []):
                index['by_activity'][activity].append(quest_id)
            
            # Index by topic
            for topic in concepts.get('topics', []):
                index['by_topic'][topic].append(quest_id)
            
            # Index by skill
            for skill in concepts.get('skills', []):
                index['by_skill'][skill].append(quest_id)
        
        return index
    
    def find_related_quests(
        self,
        quest: Dict,
        index: Dict,
        limit: int = 10
    ) -> List[Tuple[str, float]]:
        """
        Find related quests using concept index
        
        Args:
            quest: Quest to find relations for
            index: Concept index
            limit: Maximum number of related quests
        
        Returns:
            List of (quest_id, relevance_score) tuples
        """
        
        concepts = self.extract_concepts(quest)
        quest_scores = defaultdict(float)
        
        # Score by activity matches
        for activity in concepts.get('activities', []):
            for quest_id in index['by_activity'].get(activity, []):
                quest_scores[quest_id] += 0.35
        
        # Score by topic matches
        for topic in concepts.get('topics', []):
            for quest_id in index['by_topic'].get(topic, []):
                quest_scores[quest_id] += 0.25
        
        # Score by skill matches
        for skill in concepts.get('skills', []):
            for quest_id in index['by_skill'].get(skill, []):
                quest_scores[quest_id] += 0.15
        
        # Sort by score
        sorted_quests = sorted(
            quest_scores.items(),
            key=lambda x: x[1],
            reverse=True
        )
        
        return sorted_quests[:limit]