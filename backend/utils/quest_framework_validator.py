"""
Visual Quest Framework Validator
Ensures all AI-generated quests comply with the Visual Quest Framework
Loads framework from quest_framework.md for consistency
"""

from typing import Dict, List, Tuple, Optional
import os

class QuestFrameworkValidator:
    """Validates quests against the Visual Quest Framework requirements"""
    
    VALID_PILLARS = ['creativity', 'critical_thinking', 'practical_skills', 'communication', 'cultural_literacy']
    VALID_INTENSITIES = ['light', 'moderate', 'intensive']
    
    # Pillar visual identities from framework
    PILLAR_INFO = {
        'creativity': {'icon': '🎨', 'color': '#FFCA3A'},
        'critical_thinking': {'icon': '🧠', 'color': '#8B5CF6'},
        'practical_skills': {'icon': '🛠️', 'color': '#F97316'},
        'communication': {'icon': '💬', 'color': '#3B82F6'},
        'cultural_literacy': {'icon': '🌍', 'color': '#10B981'}
    }
    
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
        Validate a quest against the Visual Quest Framework requirements
        Returns: (is_valid, list_of_errors)
        """
        errors = []
        
        # 1. THE QUEST HEADER validation
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
        
        # Check for visual framework fields
        if not quest_data.get('primary_pillar_icon'):
            errors.append("Missing required field: primary_pillar_icon")
        
        if not quest_data.get('collaboration_bonus'):
            errors.append("Missing required field: collaboration_bonus (should be '2x XP Bonus')")
        
        if not quest_data.get('estimated_time'):
            errors.append("Missing required field: estimated_time")
        
        if not quest_data.get('total_xp'):
            errors.append("Missing required field: total_xp")
        
        what_youll_create = quest_data.get('what_youll_create', [])
        if not what_youll_create or not isinstance(what_youll_create, list):
            errors.append("what_youll_create must be a non-empty array")
        elif len(what_youll_create) < 2 or len(what_youll_create) > 4:
            errors.append("what_youll_create should have 2-4 outcomes")
        
        if quest_data.get('primary_pillar') not in QuestFrameworkValidator.VALID_PILLARS:
            errors.append(f"Invalid primary_pillar. Must be one of: {', '.join(QuestFrameworkValidator.VALID_PILLARS)}")
        
        # 2. YOUR TOOLKIT validation
        if quest_data.get('intensity') not in QuestFrameworkValidator.VALID_INTENSITIES:
            errors.append(f"Invalid intensity. Must be one of: {', '.join(QuestFrameworkValidator.VALID_INTENSITIES)}")
        
        # Check core competencies
        core_competencies = quest_data.get('core_competencies', [])
        if not core_competencies or not isinstance(core_competencies, list):
            errors.append("core_competencies must be a non-empty array")
        
        # Updated for new framework - helpful_resources is now an array of objects
        helpful_resources = quest_data.get('helpful_resources', [])
        if not isinstance(helpful_resources, list):
            errors.append("helpful_resources must be an array of resource objects")
        elif len(helpful_resources) == 0:
            errors.append("helpful_resources must contain at least one resource")
        
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
            errors.append("log_bonus must be an object with prompt and xp_amount")
        else:
            if not log_bonus.get('prompt'):
                errors.append("log_bonus missing prompt")
            if log_bonus.get('xp_amount') != 25:
                errors.append("log_bonus xp_amount should be 25")
        
        # 5. GO FURTHER validation
        if not quest_data.get('collaboration_spark'):
            errors.append("Missing required field: collaboration_spark")
        
        # Updated for new framework - real_world_bonus is now an array
        real_world_bonus = quest_data.get('real_world_bonus', [])
        if not isinstance(real_world_bonus, list):
            errors.append("real_world_bonus must be an array of bonus objects")
        elif len(real_world_bonus) > 0:
            for i, bonus in enumerate(real_world_bonus):
                if not isinstance(bonus, dict):
                    errors.append(f"real_world_bonus[{i}] must be an object")
                elif not bonus.get('description'):
                    errors.append(f"real_world_bonus[{i}] missing description")
                elif bonus.get('xp_amount', 0) <= 0:
                    errors.append(f"real_world_bonus[{i}] xp_amount must be positive")
        
        # 6. FINE PRINT validation (optional fields)
        # location is optional - only if location-specific
        
        # Check for process-focused language
        showcase = quest_data.get('showcase_your_journey', '')
        if showcase and ('reflect' not in showcase.lower() and 'surprising' not in showcase.lower() and 'learned' not in showcase.lower()):
            errors.append("showcase_your_journey should ask for reflection on surprises, learning, or the process")
        
        is_valid = len(errors) == 0
        return is_valid, errors
    
    @staticmethod
    def enhance_quest(quest_data: Dict) -> Dict:
        """
        Enhance a quest to better comply with the Visual Quest Framework
        Adds missing optional fields and improves existing ones
        """
        enhanced = quest_data.copy()
        
        # Ensure visual framework fields
        if enhanced.get('primary_pillar') and not enhanced.get('primary_pillar_icon'):
            pillar = enhanced['primary_pillar']
            if pillar in QuestFrameworkValidator.PILLAR_INFO:
                enhanced['primary_pillar_icon'] = QuestFrameworkValidator.PILLAR_INFO[pillar]['icon']
        
        # Add total_xp if missing
        if not enhanced.get('total_xp'):
            intensity = enhanced.get('intensity', 'moderate')
            xp_map = {'light': 100, 'moderate': 200, 'intensive': 350}
            enhanced['total_xp'] = xp_map.get(intensity, 200)
        
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
        
        # Add collaboration_bonus if missing
        if not enhanced.get('collaboration_bonus'):
            enhanced['collaboration_bonus'] = '2x XP Bonus'
        
        # Ensure proper XP amounts and format
        if enhanced.get('log_bonus') and isinstance(enhanced['log_bonus'], dict):
            enhanced['log_bonus']['xp_amount'] = 25
            if not enhanced['log_bonus'].get('prompt'):
                enhanced['log_bonus']['prompt'] = "✨ Process Bonus (+25 XP): Add 3 log entries to document your journey!"
        
        # Convert old real_world_bonus format to new array format
        if enhanced.get('real_world_bonus'):
            if isinstance(enhanced['real_world_bonus'], dict):
                # Convert single bonus to array
                enhanced['real_world_bonus'] = [enhanced['real_world_bonus']]
            # Ensure each bonus has proper xp_amount
            for bonus in enhanced['real_world_bonus']:
                if isinstance(bonus, dict) and not bonus.get('xp_amount'):
                    bonus['xp_amount'] = 50
        
        # Add visual emoji cues to collaboration_spark if missing
        if enhanced.get('collaboration_spark') and not enhanced['collaboration_spark'].startswith('👥'):
            enhanced['collaboration_spark'] = '👥 ' + enhanced['collaboration_spark']
        
        return enhanced
    
    @staticmethod
    def calculate_quality_score(quest_data: Dict) -> float:
        """
        Calculate a quality score for the quest based on Visual Quest Framework compliance
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
        
        # Visual framework compliance bonus (5 points)
        if quest_data.get('primary_pillar_icon'):
            score += 2
        if quest_data.get('total_xp'):
            score += 1
        if quest_data.get('estimated_time'):
            score += 1
        if quest_data.get('core_competencies'):
            score += 1
        
        return min(score, max_score)