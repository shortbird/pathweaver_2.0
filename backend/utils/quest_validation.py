"""
Quest Validation Service
Validates quest content for appropriateness, quality, and educational value
"""

import re
from typing import Dict, List, Optional, Tuple
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

class QuestValidator:
    """Validates quests for quality, appropriateness, and educational value"""
    
    def __init__(self):
        """Initialize validator with rules and criteria"""
        
        # Inappropriate content patterns
        self.inappropriate_patterns = [
            r'\b(violence|violent|weapon|gun|kill|murder|death|die)\b',
            r'\b(drug|alcohol|smoke|cigarette|vape|marijuana)\b',
            r'\b(gambl|bet|wager|casino)\b',
            r'\b(hate|racist|sexist|discriminat)\b'
        ]
        
        # Educational value keywords
        self.educational_keywords = {
            'learn', 'understand', 'explore', 'discover', 'analyze',
            'create', 'develop', 'research', 'investigate', 'practice',
            'demonstrate', 'apply', 'evaluate', 'synthesize', 'design',
            'solve', 'experiment', 'observe', 'document', 'reflect'
        }
        
        # Difficulty requirements
        self.difficulty_requirements = {
            'beginner': {
                'min_tasks': 2,
                'max_tasks': 4,
                'min_xp_per_task': 50,
                'max_xp_per_task': 100,
                'max_description_length': 500
            },
            'intermediate': {
                'min_tasks': 3,
                'max_tasks': 5,
                'min_xp_per_task': 100,
                'max_xp_per_task': 150,
                'max_description_length': 750
            },
            'advanced': {
                'min_tasks': 3,
                'max_tasks': 6,
                'min_xp_per_task': 150,
                'max_xp_per_task': 200,
                'max_description_length': 1000
            }
        }
        
        # Valid pillars
        self.valid_pillars = [
            "STEM & Logic",
            "Life & Wellness",
            "Language & Communication",
            "Society & Culture",
            "Arts & Creativity"
        ]
    
    def validate_quest(self, quest: Dict) -> Dict:
        """
        Comprehensive quest validation
        
        Args:
            quest: Quest data to validate
        
        Returns:
            Validation result with status and details
        """
        
        validation_result = {
            'is_valid': True,
            'errors': [],
            'warnings': [],
            'suggestions': [],
            'scores': {},
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Basic structure validation
        structure_valid = self._validate_structure(quest, validation_result)
        if not structure_valid:
            validation_result['is_valid'] = False
        
        # Content appropriateness
        content_appropriate = self._validate_content_appropriateness(quest, validation_result)
        if not content_appropriate:
            validation_result['is_valid'] = False
        
        # Educational value
        educational_score = self._assess_educational_value(quest, validation_result)
        validation_result['scores']['educational_value'] = educational_score
        
        # XP balance
        xp_balanced = self._validate_xp_balance(quest, validation_result)
        if not xp_balanced:
            validation_result['warnings'].append("XP values may need adjustment")
        
        # Difficulty consistency
        difficulty_consistent = self._validate_difficulty_consistency(quest, validation_result)
        if not difficulty_consistent:
            validation_result['warnings'].append("Quest difficulty inconsistencies detected")
        
        # Task quality
        task_quality = self._validate_task_quality(quest, validation_result)
        validation_result['scores']['task_quality'] = task_quality
        
        # Overall quality score
        validation_result['scores']['overall'] = self._calculate_overall_score(validation_result['scores'])
        
        # Generate recommendations
        self._generate_recommendations(quest, validation_result)
        
        return validation_result
    
    def _validate_structure(self, quest: Dict, result: Dict) -> bool:
        """Validate quest structure and required fields"""
        
        is_valid = True
        
        # Check required fields
        required_fields = ['title', 'description']
        for field in required_fields:
            if field not in quest or not quest[field]:
                result['errors'].append(f"Missing required field: {field}")
                is_valid = False
        
        # Validate title
        if 'title' in quest:
            if len(quest['title']) < 5:
                result['errors'].append("Title too short (minimum 5 characters)")
                is_valid = False
            elif len(quest['title']) > 100:
                result['warnings'].append("Title may be too long (recommended max 100 characters)")
        
        # Validate description
        if 'description' in quest:
            if len(quest['description']) < 20:
                result['errors'].append("Description too short (minimum 20 characters)")
                is_valid = False
            elif len(quest['description']) > 1000:
                result['warnings'].append("Description may be too long")
        
        # Validate tasks
        tasks = quest.get('tasks', quest.get('suggested_tasks', []))
        if not tasks:
            result['errors'].append("Quest must have at least one task")
            is_valid = False
        elif len(tasks) < 2:
            result['warnings'].append("Quest should have at least 2 tasks for better learning")
        elif len(tasks) > 7:
            result['warnings'].append("Quest has many tasks, consider splitting into multiple quests")
        
        return is_valid
    
    def _validate_content_appropriateness(self, quest: Dict, result: Dict) -> bool:
        """Check content for inappropriate material"""
        
        is_appropriate = True
        
        # Combine all text content
        text_content = f"{quest.get('title', '')} {quest.get('description', '')} {quest.get('big_idea', '')}"
        
        # Add task content
        tasks = quest.get('tasks', quest.get('suggested_tasks', []))
        for task in tasks:
            if isinstance(task, dict):
                text_content += f" {task.get('title', '')} {task.get('description', '')}"
        
        text_content = text_content.lower()
        
        # Check for inappropriate content
        for pattern in self.inappropriate_patterns:
            if re.search(pattern, text_content, re.IGNORECASE):
                result['errors'].append(f"Content contains potentially inappropriate material")
                is_appropriate = False
                break
        
        # Check for minimum age appropriateness
        if self._estimate_reading_level(text_content) > 12:
            result['warnings'].append("Content may be too complex for younger students")
        
        return is_appropriate
    
    def _assess_educational_value(self, quest: Dict, result: Dict) -> float:
        """Assess educational value of the quest"""
        
        score = 0.0
        max_score = 100.0
        
        # Check for educational keywords
        text_content = f"{quest.get('title', '')} {quest.get('description', '')} {quest.get('big_idea', '')}"
        tasks = quest.get('tasks', quest.get('suggested_tasks', []))
        
        for task in tasks:
            if isinstance(task, dict):
                text_content += f" {task.get('title', '')} {task.get('description', '')}"
        
        text_lower = text_content.lower()
        educational_keywords_found = sum(
            1 for keyword in self.educational_keywords
            if keyword in text_lower
        )
        
        # Score based on keyword density
        keyword_score = min(30, educational_keywords_found * 5)
        score += keyword_score
        
        # Check for clear learning objectives
        if quest.get('big_idea'):
            score += 15
        
        # Check for diverse task types
        task_types = set()
        for task in tasks:
            if isinstance(task, dict):
                evidence_type = task.get('evidence_type', 'text')
                task_types.add(evidence_type)
        
        diversity_score = min(20, len(task_types) * 10)
        score += diversity_score
        
        # Check for skill coverage (pillars)
        pillars_covered = set()
        for task in tasks:
            if isinstance(task, dict) and task.get('pillar'):
                pillars_covered.add(task['pillar'])
        
        pillar_score = min(20, len(pillars_covered) * 10)
        score += pillar_score
        
        # Check for progressive difficulty
        if len(tasks) >= 3:
            xp_values = []
            for task in tasks:
                if isinstance(task, dict) and task.get('xp_value'):
                    xp_values.append(task['xp_value'])
            
            if xp_values and xp_values == sorted(xp_values):
                score += 15  # Progressive difficulty bonus
        
        # Add feedback
        if score < 50:
            result['warnings'].append("Quest may lack educational value")
            result['suggestions'].append("Add more learning-focused objectives and activities")
        elif score < 70:
            result['suggestions'].append("Consider adding more diverse learning activities")
        
        return min(100, score)
    
    def _validate_xp_balance(self, quest: Dict, result: Dict) -> bool:
        """Validate XP distribution across tasks"""
        
        is_balanced = True
        tasks = quest.get('tasks', quest.get('suggested_tasks', []))
        difficulty = quest.get('difficulty', 'intermediate')
        
        if difficulty not in self.difficulty_requirements:
            difficulty = 'intermediate'
        
        req = self.difficulty_requirements[difficulty]
        
        # Check each task's XP
        xp_values = []
        for i, task in enumerate(tasks):
            if isinstance(task, dict) and task.get('xp_value'):
                xp = task['xp_value']
                xp_values.append(xp)
                
                if xp < req['min_xp_per_task']:
                    result['warnings'].append(
                        f"Task {i+1} XP too low for {difficulty} difficulty (minimum {req['min_xp_per_task']})"
                    )
                    is_balanced = False
                elif xp > req['max_xp_per_task']:
                    result['warnings'].append(
                        f"Task {i+1} XP too high for {difficulty} difficulty (maximum {req['max_xp_per_task']})"
                    )
                    is_balanced = False
        
        # Check total XP
        if xp_values:
            total_xp = sum(xp_values)
            expected_min = req['min_xp_per_task'] * len(tasks)
            expected_max = req['max_xp_per_task'] * len(tasks)
            
            if total_xp < expected_min * 0.8:
                result['warnings'].append("Total quest XP seems low for difficulty level")
            elif total_xp > expected_max * 1.2:
                result['warnings'].append("Total quest XP seems high for difficulty level")
            
            # Check XP distribution variance
            if len(xp_values) > 1:
                avg_xp = sum(xp_values) / len(xp_values)
                variance = sum((xp - avg_xp) ** 2 for xp in xp_values) / len(xp_values)
                
                if variance > (avg_xp * 0.5) ** 2:
                    result['suggestions'].append("Consider more balanced XP distribution across tasks")
        
        return is_balanced
    
    def _validate_difficulty_consistency(self, quest: Dict, result: Dict) -> bool:
        """Check if quest difficulty is consistent with content"""
        
        is_consistent = True
        difficulty = quest.get('difficulty', 'intermediate')
        
        if difficulty not in self.difficulty_requirements:
            result['errors'].append(f"Invalid difficulty level: {difficulty}")
            return False
        
        req = self.difficulty_requirements[difficulty]
        tasks = quest.get('tasks', quest.get('suggested_tasks', []))
        
        # Check task count
        if len(tasks) < req['min_tasks']:
            result['warnings'].append(
                f"{difficulty.capitalize()} quests should have at least {req['min_tasks']} tasks"
            )
            is_consistent = False
        elif len(tasks) > req['max_tasks']:
            result['warnings'].append(
                f"{difficulty.capitalize()} quests should have at most {req['max_tasks']} tasks"
            )
        
        # Check description complexity
        description = quest.get('description', '')
        if len(description) > req['max_description_length']:
            result['suggestions'].append(
                f"Description may be too complex for {difficulty} level"
            )
        
        # Check reading level
        all_text = f"{quest.get('title', '')} {description}"
        estimated_level = self._estimate_reading_level(all_text)
        
        expected_levels = {
            'beginner': (5, 8),
            'intermediate': (7, 10),
            'advanced': (9, 12)
        }
        
        min_level, max_level = expected_levels.get(difficulty, (7, 10))
        if estimated_level < min_level:
            result['suggestions'].append(
                f"Content may be too simple for {difficulty} level"
            )
        elif estimated_level > max_level:
            result['suggestions'].append(
                f"Content may be too complex for {difficulty} level"
            )
        
        return is_consistent
    
    def _validate_task_quality(self, quest: Dict, result: Dict) -> float:
        """Assess quality of individual tasks"""
        
        tasks = quest.get('tasks', quest.get('suggested_tasks', []))
        if not tasks:
            return 0.0
        
        total_score = 0.0
        
        for i, task in enumerate(tasks):
            if not isinstance(task, dict):
                continue
            
            task_score = 0.0
            
            # Has title
            if task.get('title'):
                task_score += 15
                # Title is action-oriented
                if any(task['title'].lower().startswith(verb) for verb in 
                       ['create', 'build', 'explore', 'design', 'analyze', 'write']):
                    task_score += 10
            else:
                result['errors'].append(f"Task {i+1} missing title")
            
            # Has description
            if task.get('description'):
                task_score += 15
                # Description is detailed enough
                if len(task['description']) >= 30:
                    task_score += 10
            else:
                result['errors'].append(f"Task {i+1} missing description")
            
            # Has valid pillar
            if task.get('pillar') in self.valid_pillars:
                task_score += 15
            else:
                result['warnings'].append(f"Task {i+1} has invalid or missing pillar")
            
            # Has XP value
            if task.get('xp_value') and isinstance(task['xp_value'], (int, float)):
                task_score += 15
            else:
                result['errors'].append(f"Task {i+1} missing XP value")
            
            # Has evidence type
            if task.get('evidence_type') in ['text', 'image', 'video', 'document']:
                task_score += 10
            
            # Has suggested evidence
            if task.get('suggested_evidence'):
                task_score += 10
            
            total_score += task_score
        
        # Average score across all tasks
        average_score = total_score / len(tasks) if tasks else 0
        
        if average_score < 50:
            result['warnings'].append("Task quality needs improvement")
            result['suggestions'].append("Add more detail to task descriptions and requirements")
        
        return average_score
    
    def _calculate_overall_score(self, scores: Dict) -> float:
        """Calculate overall quest quality score"""
        
        weights = {
            'educational_value': 0.4,
            'task_quality': 0.6
        }
        
        total_score = 0.0
        total_weight = 0.0
        
        for score_type, weight in weights.items():
            if score_type in scores:
                total_score += scores[score_type] * weight
                total_weight += weight
        
        if total_weight > 0:
            return total_score / total_weight
        
        return 0.0
    
    def _generate_recommendations(self, quest: Dict, result: Dict):
        """Generate improvement recommendations"""
        
        overall_score = result['scores'].get('overall', 0)
        
        if overall_score >= 80:
            result['suggestions'].insert(0, "Quest is high quality and ready for use")
        elif overall_score >= 60:
            result['suggestions'].insert(0, "Quest is good but could benefit from improvements")
        else:
            result['suggestions'].insert(0, "Quest needs significant improvements before use")
        
        # Specific recommendations based on issues
        if len(result['errors']) > 0:
            result['suggestions'].append("Address all errors before publishing")
        
        if len(result['warnings']) > 3:
            result['suggestions'].append("Review warnings to improve quest quality")
        
        # Task-specific recommendations
        tasks = quest.get('tasks', [])
        if tasks and len(tasks) < 3:
            result['suggestions'].append("Consider adding more tasks for deeper learning")
        
        # Pillar diversity recommendation
        pillars = set()
        for task in tasks:
            if isinstance(task, dict) and task.get('pillar'):
                pillars.add(task['pillar'])
        
        if len(pillars) == 1:
            result['suggestions'].append("Consider diversifying skills by using multiple pillars")
    
    def _estimate_reading_level(self, text: str) -> int:
        """Estimate reading grade level using simple metrics"""
        
        if not text:
            return 7  # Default
        
        # Simple Flesch-Kincaid approximation
        sentences = text.split('.')
        words = text.split()
        syllables = sum(self._count_syllables(word) for word in words)
        
        if len(sentences) == 0 or len(words) == 0:
            return 7
        
        avg_words_per_sentence = len(words) / len(sentences)
        avg_syllables_per_word = syllables / len(words)
        
        # Simplified Flesch-Kincaid Grade Level
        grade = 0.39 * avg_words_per_sentence + 11.8 * avg_syllables_per_word - 15.59
        
        # Bound between 1 and 12
        return max(1, min(12, int(grade)))
    
    def _count_syllables(self, word: str) -> int:
        """Estimate syllable count in a word"""
        
        word = word.lower()
        vowels = 'aeiou'
        syllables = 0
        previous_was_vowel = False
        
        for char in word:
            is_vowel = char in vowels
            if is_vowel and not previous_was_vowel:
                syllables += 1
            previous_was_vowel = is_vowel
        
        # Adjust for silent e
        if word.endswith('e'):
            syllables -= 1
        
        # Minimum of 1 syllable
        return max(1, syllables)
    
    def validate_batch(self, quests: List[Dict]) -> List[Dict]:
        """Validate multiple quests"""
        
        results = []
        for quest in quests:
            result = self.validate_quest(quest)
            result['quest_title'] = quest.get('title', 'Untitled')
            results.append(result)
        
        return results
    
    def get_validation_summary(self, results: List[Dict]) -> Dict:
        """Generate summary of batch validation"""
        
        summary = {
            'total_quests': len(results),
            'valid_quests': sum(1 for r in results if r['is_valid']),
            'average_score': 0,
            'common_issues': [],
            'recommendations': []
        }
        
        if results:
            scores = [r['scores'].get('overall', 0) for r in results]
            summary['average_score'] = sum(scores) / len(scores)
            
            # Collect common issues
            all_errors = []
            all_warnings = []
            for r in results:
                all_errors.extend(r.get('errors', []))
                all_warnings.extend(r.get('warnings', []))
            
            # Find most common issues
            from collections import Counter
            error_counts = Counter(all_errors)
            warning_counts = Counter(all_warnings)
            
            summary['common_issues'] = [
                {'type': 'error', 'message': error, 'count': count}
                for error, count in error_counts.most_common(5)
            ]
            summary['common_issues'].extend([
                {'type': 'warning', 'message': warning, 'count': count}
                for warning, count in warning_counts.most_common(5)
            ])
        
        return summary


def validate_course_quest_has_preset_tasks(quest_id: str) -> tuple[bool, str]:
    """
    Validate that a course quest has at least one preset task OR has curriculum lessons.

    Args:
        quest_id: The quest ID to validate

    Returns:
        tuple: (is_valid, error_message)
            - is_valid: True if quest has preset tasks, curriculum lessons, or is not a course quest
            - error_message: Error message if validation fails, empty string otherwise
    """
    try:
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()

        # Get quest type
        quest = supabase.table('quests')\
            .select('quest_type')\
            .eq('id', quest_id)\
            .single()\
            .execute()

        if not quest.data:
            return False, 'Quest not found'

        # Only validate course quests
        if quest.data.get('quest_type') != 'course':
            return True, ''

        # Check for preset tasks in course_quest_tasks table
        preset_tasks = supabase.table('course_quest_tasks')\
            .select('id')\
            .eq('quest_id', quest_id)\
            .limit(1)\
            .execute()

        if preset_tasks.data and len(preset_tasks.data) > 0:
            return True, ''

        # Also check for curriculum lessons (created via curriculum upload)
        # Quests with lessons are valid even without preset tasks
        curriculum_lessons = supabase.table('curriculum_lessons')\
            .select('id')\
            .eq('quest_id', quest_id)\
            .limit(1)\
            .execute()

        if curriculum_lessons.data and len(curriculum_lessons.data) > 0:
            return True, ''

        return False, 'Course quests must have at least one preset task or lesson before they can be activated or made public. Please add tasks or lessons first.'

    except Exception as e:
        logger.error(f"Error validating course quest {quest_id}: {str(e)}")
        return False, f'Validation error: {str(e)}'


def can_activate_quest(quest_id: str) -> tuple[bool, str]:
    """
    Check if a quest can be activated (made is_active=True).

    Args:
        quest_id: The quest ID to check

    Returns:
        tuple: (can_activate, error_message)
            - can_activate: True if quest can be activated
            - error_message: Error message if cannot activate, empty string otherwise
    """
    # Currently only validates course quests have preset tasks
    # Can be extended with additional validation rules in the future
    return validate_course_quest_has_preset_tasks(quest_id)


def can_make_public(quest_id: str) -> tuple[bool, str]:
    """
    Check if a quest can be made public (is_public=True).

    Args:
        quest_id: The quest ID to check

    Returns:
        tuple: (can_make_public, error_message)
            - can_make_public: True if quest can be made public
            - error_message: Error message if cannot make public, empty string otherwise
    """
    # Currently only validates course quests have preset tasks
    # Can be extended with additional validation rules in the future
    return validate_course_quest_has_preset_tasks(quest_id)