"""
Quest Framework Validator
Ensures all AI-generated quests comply with the Quest Creation Framework
"""

from typing import Dict, List, Tuple, Optional

class QuestFrameworkValidator:
    """Validates quests against the Quest Creation Framework requirements"""
    
    VALID_PILLARS = ['creativity', 'critical_thinking', 'practical_skills', 'communication', 'cultural_literacy']
    VALID_INTENSITIES = ['light', 'moderate', 'intensive']
    
    # Action verbs that quests should start with
    ACTION_VERBS = [
        'build', 'create', 'launch', 'design', 'develop', 'craft', 'produce',
        'compose', 'construct', 'establish', 'organize', 'host', 'lead',
        'explore', 'investigate', 'analyze', 'document', 'capture', 'record',
        'transform', 'remix', 'reimagine', 'prototype', 'experiment', 'test',
        'perform', 'present', 'teach', 'share', 'publish', 'broadcast',
        'discover', 'uncover', 'reveal', 'decode', 'solve', 'master',
        'write', 'draw', 'paint', 'sculpt', 'film', 'photograph',
        'plan', 'map', 'chart', 'track', 'measure', 'calculate',
        'start', 'begin', 'initiate', 'become', 'join', 'form'
    ]
    
    @staticmethod
    def validate_quest(quest_data: Dict) -> Tuple[bool, List[str]]:
        """
        Validate a quest against the framework requirements
        Returns: (is_valid, list_of_errors)
        """
        errors = []
        
        # 1. THE BIG PICTURE validation
        if not quest_data.get('title'):
            errors.append("Missing required field: title")
        else:
            # Check if title starts with action verb
            title_lower = quest_data['title'].lower()
            starts_with_action = any(title_lower.startswith(verb) for verb in QuestFrameworkValidator.ACTION_VERBS)
            if not starts_with_action:
                errors.append(f"Title should start with an action verb (e.g., Build, Create, Launch). Current: '{quest_data['title']}'")
            
            # Check title length
            if len(quest_data['title']) > 100:
                errors.append("Title exceeds 100 characters")
        
        if not quest_data.get('big_idea'):
            errors.append("Missing required field: big_idea")
        elif len(quest_data['big_idea']) > 200:
            errors.append("Big idea exceeds 200 characters")
        
        what_youll_create = quest_data.get('what_youll_create', [])
        if not what_youll_create or not isinstance(what_youll_create, list):
            errors.append("what_youll_create must be a non-empty array")
        elif len(what_youll_create) < 2 or len(what_youll_create) > 4:
            errors.append("what_youll_create should have 2-4 outcomes")
        
        if quest_data.get('primary_pillar') not in QuestFrameworkValidator.VALID_PILLARS:
            errors.append(f"Invalid primary_pillar. Must be one of: {', '.join(QuestFrameworkValidator.VALID_PILLARS)}")
        
        # 2. YOUR TOOLKIT validation
        if not quest_data.get('estimated_time'):
            errors.append("Missing required field: estimated_time")
        
        if quest_data.get('intensity') not in QuestFrameworkValidator.VALID_INTENSITIES:
            errors.append(f"Invalid intensity. Must be one of: {', '.join(QuestFrameworkValidator.VALID_INTENSITIES)}")
        
        helpful_resources = quest_data.get('helpful_resources', {})
        if not isinstance(helpful_resources, dict):
            errors.append("helpful_resources must be an object with tools, materials, and links")
        else:
            total_resources = len(helpful_resources.get('tools', [])) + \
                            len(helpful_resources.get('materials', [])) + \
                            len(helpful_resources.get('links', []))
            if total_resources == 0:
                errors.append("helpful_resources must contain at least one tool, material, or link")
        
        # 3. THE JOURNEY validation
        your_mission = quest_data.get('your_mission', [])
        if not your_mission or not isinstance(your_mission, list):
            errors.append("your_mission must be a non-empty array")
        elif len(your_mission) < 3 or len(your_mission) > 5:
            errors.append("your_mission should have 3-5 steps")
        
        if not quest_data.get('showcase_your_journey'):
            errors.append("Missing required field: showcase_your_journey")
        
        # 4. THE LEARNING LOG validation
        log_bonus = quest_data.get('log_bonus')
        if not log_bonus or not isinstance(log_bonus, dict):
            errors.append("log_bonus must be an object with description and xp_amount")
        else:
            if not log_bonus.get('description'):
                errors.append("log_bonus missing description")
            if log_bonus.get('xp_amount') != 25:
                errors.append("log_bonus xp_amount should be 25")
        
        # 5. GO FURTHER validation
        if not quest_data.get('collaboration_spark'):
            errors.append("Missing required field: collaboration_spark")
        
        real_world_bonus = quest_data.get('real_world_bonus')
        if not real_world_bonus or not isinstance(real_world_bonus, dict):
            errors.append("real_world_bonus must be an object with description and xp_amount")
        else:
            if not real_world_bonus.get('description'):
                errors.append("real_world_bonus missing description")
            if real_world_bonus.get('xp_amount') != 50:
                errors.append("real_world_bonus xp_amount should be 50")
        
        # 6. FINE PRINT validation (optional fields)
        if not quest_data.get('location'):
            errors.append("Missing required field: location (use 'anywhere' as default)")
        
        # Check for process-focused language
        showcase = quest_data.get('showcase_your_journey', '')
        if showcase and 'reflect' not in showcase.lower() and 'process' not in showcase.lower():
            errors.append("showcase_your_journey should ask for reflection on the process, not just the product")
        
        is_valid = len(errors) == 0
        return is_valid, errors
    
    @staticmethod
    def enhance_quest(quest_data: Dict) -> Dict:
        """
        Enhance a quest to better comply with the framework
        Adds missing optional fields and improves existing ones
        """
        enhanced = quest_data.copy()
        
        # Ensure title starts with action verb
        if enhanced.get('title'):
            title_lower = enhanced['title'].lower()
            starts_with_action = any(title_lower.startswith(verb) for verb in QuestFrameworkValidator.ACTION_VERBS)
            if not starts_with_action:
                # Try to prepend an appropriate action verb
                if 'learn' in title_lower:
                    enhanced['title'] = enhanced['title'].replace('Learn', 'Explore').replace('learn', 'Explore')
                elif 'understand' in title_lower:
                    enhanced['title'] = enhanced['title'].replace('Understand', 'Investigate').replace('understand', 'Investigate')
                elif not enhanced['title'].startswith(('The', 'A', 'An')):
                    enhanced['title'] = 'Create ' + enhanced['title']
        
        # Ensure showcase_your_journey includes reflection
        if enhanced.get('showcase_your_journey'):
            if 'reflect' not in enhanced['showcase_your_journey'].lower():
                enhanced['showcase_your_journey'] += " Include a reflection on what surprised you most during the process."
        
        # Add default location if missing
        if not enhanced.get('location'):
            enhanced['location'] = 'anywhere'
        
        # Ensure proper XP amounts
        if enhanced.get('log_bonus') and isinstance(enhanced['log_bonus'], dict):
            enhanced['log_bonus']['xp_amount'] = 25
        
        if enhanced.get('real_world_bonus') and isinstance(enhanced['real_world_bonus'], dict):
            enhanced['real_world_bonus']['xp_amount'] = 50
        
        return enhanced
    
    @staticmethod
    def calculate_quality_score(quest_data: Dict) -> float:
        """
        Calculate a quality score for the quest based on framework compliance
        Returns a score from 0-100
        """
        score = 0.0
        max_score = 100.0
        
        # Title quality (15 points)
        if quest_data.get('title'):
            title_lower = quest_data['title'].lower()
            if any(title_lower.startswith(verb) for verb in QuestFrameworkValidator.ACTION_VERBS):
                score += 10
            if 20 < len(quest_data['title']) <= 80:
                score += 5
        
        # Big idea clarity (15 points)
        if quest_data.get('big_idea'):
            if 50 < len(quest_data['big_idea']) <= 150:
                score += 10
            if any(word in quest_data['big_idea'].lower() for word in ['create', 'build', 'explore', 'discover']):
                score += 5
        
        # Tangible outcomes (15 points)
        what_youll_create = quest_data.get('what_youll_create', [])
        if isinstance(what_youll_create, list):
            if 2 <= len(what_youll_create) <= 4:
                score += 10
            if all(len(outcome) > 10 for outcome in what_youll_create):
                score += 5
        
        # Mission clarity (15 points)
        your_mission = quest_data.get('your_mission', [])
        if isinstance(your_mission, list):
            if 3 <= len(your_mission) <= 5:
                score += 10
            if all(step.startswith(('Step', '1.', '2.', '3.')) for step in your_mission[:3]):
                score += 5
        
        # Process focus (15 points)
        showcase = quest_data.get('showcase_your_journey', '')
        if showcase:
            if 'reflect' in showcase.lower() or 'process' in showcase.lower():
                score += 10
            if len(showcase) > 50:
                score += 5
        
        # Collaboration (10 points)
        if quest_data.get('collaboration_spark'):
            score += 10
        
        # Real-world connection (10 points)
        if quest_data.get('real_world_bonus') and isinstance(quest_data['real_world_bonus'], dict):
            if quest_data['real_world_bonus'].get('description'):
                score += 10
        
        # Resources provided (5 points)
        if quest_data.get('helpful_resources'):
            score += 5
        
        return min(score, max_score)