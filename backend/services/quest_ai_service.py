"""
AI-powered quest generation service using Google Gemini API.
Provides intelligent assistance for creating quests, tasks, and educational content.
"""

import json
import re
import os
from typing import Dict, List, Optional, Any, Tuple
import google.generativeai as genai

from utils.logger import get_logger

logger = get_logger(__name__)

class QuestAIService(BaseService):
    """Service for AI-powered quest generation using Gemini API"""
    
    def __init__(self, prompt_version: Optional[str] = None, user_id: Optional[str] = None):
        """Initialize the AI service with Gemini configuration"""
        super().__init__(user_id)
        self.api_key = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
        self.model_name = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash-lite')

        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not configured. Set GEMINI_API_KEY environment variable.")

        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self.model_name)

        # Prompt version for A/B testing
        self.prompt_version = prompt_version or self._get_active_prompt_version()

        # Valid pillars for validation
        self.valid_pillars = [
            'STEM & Logic',
            'Life & Wellness',
            'Language & Communication',
            'Society & Culture',
            'Arts & Creativity'
        ]

        # School subjects (separate from pillars)
        from utils.school_subjects import SCHOOL_SUBJECTS, SCHOOL_SUBJECT_DISPLAY_NAMES
        self.school_subjects = SCHOOL_SUBJECTS
        self.school_subject_display_names = SCHOOL_SUBJECT_DISPLAY_NAMES
    
    def generate_quest_concept(self, avoid_titles: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Generate a lightweight quest concept (title + description only).
        Tasks are personalized per-student at enrollment time.

        Args:
            avoid_titles: List of existing quest titles to avoid duplicating

        Returns:
            Dict containing quest concept with title and big_idea
        """
        try:
            prompt = self._build_quest_concept_prompt(avoid_titles or [])

            response = self.model.generate_content(prompt)
            if not response or not response.text:
                raise Exception("Empty response from Gemini API")

            # Parse the response
            quest_concept = self._parse_quest_concept_response(response.text)

            return {
                'success': True,
                'quest': quest_concept,
                'ai_generated': True
            }

        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to generate quest concept: {str(e)}",
                'quest': None
            }

    def generate_quest_from_topic(self, topic: str, learning_objectives: Optional[str] = None) -> Dict[str, Any]:
        """
        Generate a complete quest structure from a topic.

        Args:
            topic: The subject or topic for the quest
            learning_objectives: Optional specific learning goals

        Returns:
            Dict containing quest structure with title, description, and tasks
        """
        try:
            prompt = self._build_quest_generation_prompt(topic, learning_objectives)

            response = self.model.generate_content(prompt)
            if not response or not response.text:
                raise Exception("Empty response from Gemini API")

            # Parse the response and validate structure
            quest_data = self._parse_quest_response(response.text)
            quest_data = self._validate_and_fix_quest_data(quest_data)

            return {
                'success': True,
                'quest': quest_data,
                'ai_generated': True
            }

        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to generate quest: {str(e)}",
                'quest': None
            }
    
    def enhance_quest_description(self, title: str, current_description: str) -> Dict[str, str]:
        """
        Enhance an existing quest description to be more engaging and detailed.
        
        Args:
            title: Quest title
            current_description: Current description to enhance
            
        Returns:
            Dict with enhanced description
        """
        try:
            prompt = f"""
            Improve this educational quest description:

            Title: {title}
            Current Description: {current_description}

            Please provide an enhanced version that:
            - Is clear and direct
            - Explains what students will create or accomplish
            - Uses simple language
            - Is 2-3 sentences
            - Avoids flowery or overly enthusiastic language

            Return only the improved description, no additional text.
            """
            
            response = self.model.generate_content(prompt)
            enhanced_description = response.text.strip()
            
            return {
                'success': True,
                'enhanced_description': enhanced_description
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to enhance description: {str(e)}",
                'enhanced_description': current_description
            }
    
    def suggest_tasks_for_quest(self, title: str, description: str, 
                               target_task_count: int = 4) -> Dict[str, Any]:
        """
        Generate specific tasks for a quest based on title and description.
        
        Args:
            title: Quest title
            description: Quest description
            target_task_count: Number of tasks to generate (3-6)
            
        Returns:
            Dict containing list of suggested tasks
        """
        try:
            target_task_count = max(3, min(6, target_task_count))
            
            prompt = f"""
            Create {target_task_count} tasks for this educational quest:

            Quest Title: {title}
            Quest Description: {description}

            For each task, provide:
            - title: Action-oriented task name using verbs like Earn, Master, Complete, Build, Create, Write, Draw, Design, Research (5-8 words max, ONE simple idea)
            - description: Short and focused (1-2 sentences) on HOW this task could be completed in the context of the school subjects. Focus on completion methods, not motivational language.
            - pillar: One of [{', '.join(self.valid_pillars)}]
            - school_subjects: Array of relevant school subjects from [{', '.join([self.school_subject_display_names[s] for s in self.school_subjects])}]
            - xp_value: XP points (50-300 based on complexity)
            - evidence_prompt: Suggested evidence options - offer multiple ways students could demonstrate learning (written work, video, presentation, model, website, etc.)

            Tasks should:
            - Build naturally on each other
            - Cover different skill areas when possible
            - Use simple, direct, actionable language
            - Avoid flowery or overly enthusiastic phrases

            Evidence prompts should suggest multiple ways students could demonstrate learning:
            "Could be demonstrated through a written reflection, video presentation, creative project, model, website, or other format that shows your understanding"

            Return as valid JSON array with these exact field names.
            """
            
            response = self.model.generate_content(prompt)
            tasks_data = self._parse_tasks_response(response.text)
            tasks_data = self._validate_tasks_data(tasks_data)
            
            return {
                'success': True,
                'tasks': tasks_data
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to generate tasks: {str(e)}",
                'tasks': []
            }
    
    def validate_quest_quality(self, quest_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze quest data and provide quality feedback and suggestions.
        
        Args:
            quest_data: Complete quest data structure
            
        Returns:
            Dict with quality score and improvement suggestions
        """
        try:
            prompt = f"""
            Analyze this educational quest for quality and pedagogical soundness:

            Quest Data: {json.dumps(quest_data, indent=2)}

            Evaluate:
            1. Learning progression (do tasks build logically?)
            2. Skill coverage (are multiple pillars represented?)
            3. XP balance (are points distributed fairly?)
            4. Evidence requirements (are they specific and measurable?)
            5. Age appropriateness
            6. Engagement factor

            Provide:
            - quality_score: Number from 1-10
            - strengths: List of 2-3 positive aspects
            - improvements: List of 2-3 specific suggestions
            - missing_elements: Any critical missing components

            Return as valid JSON with these exact field names.
            """
            
            response = self.model.generate_content(prompt)
            feedback = self._parse_validation_response(response.text)
            
            return {
                'success': True,
                'feedback': feedback
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to validate quest: {str(e)}",
                'feedback': {
                    'quality_score': 5,
                    'strengths': [],
                    'improvements': ['AI validation unavailable'],
                    'missing_elements': []
                }
            }
    
    def _get_active_prompt_version(self) -> str:
        """Get the currently active prompt version for quest generation"""
        try:
            from services.base_service import BaseService
            from database import get_supabase_admin_client
            supabase = get_supabase_admin_client()

            # Get active quest_generation prompt
            response = supabase.table('ai_prompt_versions').select('version_name').eq(
                'prompt_type', 'quest_generation'
            ).eq('is_active', True).limit(1).execute()

            if response.data:
                return response.data[0]['version_name']
            else:
                # Default version if none is active
                return 'v1.0'
        except:
            return 'v1.0'

    def get_prompt_version(self) -> str:
        """Get the current prompt version being used"""
        return self.prompt_version

    def _build_quest_concept_prompt(self, avoid_titles: List[str]) -> str:
        """Build the lightweight quest concept generation prompt"""

        avoid_section = ""
        if avoid_titles:
            titles_list = "\n".join([f"- {title}" for title in avoid_titles[:20]])
            avoid_section = f"\n\nAVOID creating quests similar to these existing ones:\n{titles_list}"

        return f"""
        Create a quest concept for a learning experience students can pursue in the real world.

        Philosophy: These quests are "cognitive playgrounds" - structures for unstructured, personalized learning.
        The quest serves as a starting point. Students will receive personalized tasks when they enroll.

        Quest types to consider:
        - Physical challenges: climb mountain, run 5 miles, camp week, hike trail, learn to skateboard, master parkour
        - Creative projects: paint picture, learn instrument, write novel, make film, design clothing, compose music
        - Real-world skills: start business, earn certification, learn to cook, garden, fix cars, build furniture
        - Community experiences: volunteer, attend camp, visit museum/zoo/library, organize event, mentor others
        - Personal inventions: invent product, build app, create game, design solution, prototype device
        - Skill mastery: master chess, learn language, practice meditation, develop public speaking, perfect photography
        - Academic exploration: research topic, conduct experiments, study history, explore mathematics, investigate science{avoid_section}

        Return ONLY a JSON object with:
        - title: Simple, clear concept (3-6 words, action-oriented)
        - big_idea: 2-3 sentence description that:
          * Explains what they'll do in simple terms
          * Keeps it open to personal interpretation
          * Uses simple, respectful, professional language
          * NO cheesy excitement, NO emojis, NO "this will help you" language
          * Focuses on the experience itself, not future benefits

        Good examples:
        {{"title": "Start a Small Business", "big_idea": "Create and run a small business venture. Choose your product, find customers, and learn through real entrepreneurship."}}
        {{"title": "Learn to Surf", "big_idea": "Master the basics of surfing. Find a beach, get lessons or teach yourself, document your progression from beginner to confident."}}
        {{"title": "Build a Treehouse", "big_idea": "Design and construct a real treehouse. Plan the structure, gather materials, and bring your vision to life through hands-on building."}}
        {{"title": "Create a Podcast Series", "big_idea": "Launch your own podcast. Choose a topic you care about, record episodes, and share your voice with the world."}}

        Return valid JSON only, no markdown code blocks.
        """

    def _build_quest_generation_prompt(self, topic: str, learning_objectives: Optional[str]) -> str:
        """Build the main quest generation prompt"""
        objectives_text = f"\nLearning Objectives: {learning_objectives}" if learning_objectives else ""

        # You can customize prompts based on version here
        # For now, all versions use the same prompt structure
        # In future, you can load custom prompts from database based on self.prompt_version

        return f"""
        Create an educational quest on the topic: {topic}{objectives_text}

        Generate a quest with:
        1. title: Simple, clear quest name (e.g. "Build Your Own Solar System", "Create a Family Recipe Book", "Start a Small Business")
        2. big_idea: Brief 2-3 sentence description explaining what students will create and why it matters
        3. tasks: Array of 4-5 tasks, each with:
           - title: Clear task name
           - description: Simple framework (50-100 words) - provide direction without being prescriptive
           - pillar: One of [{', '.join(self.valid_pillars)}]
           - school_subjects: Array of relevant school subjects from [{', '.join([self.school_subject_display_names[s] for s in self.school_subjects])}]
           - xp_value: Points 50-300 based on complexity
           - evidence_prompt: Suggested evidence options - offer multiple ways students could demonstrate learning (written work, video, presentation, model, website, etc.)
           - order_index: Sequential number starting from 1

        Guidelines:
        - Use simple, direct language
        - Focus on what students will create or accomplish
        - Tasks should build naturally on each other
        - Avoid flowery or overly enthusiastic language
        - Total XP should be 400-1200 points
        - Evidence prompts should suggest multiple options: "Show you completed this task by writing, video, presentation, model, website, or another creative format"

        Return as valid JSON with exact field names shown above.
        """
    
    def _parse_quest_concept_response(self, response_text: str) -> Dict[str, Any]:
        """Parse and extract quest concept from AI response"""
        try:
            # Remove markdown code blocks if present
            response_text = re.sub(r'```json\s*|\s*```', '', response_text)

            # Try to find JSON object in the response
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group()
                concept = json.loads(json_str)
            else:
                # Fallback: try to parse the whole response as JSON
                concept = json.loads(response_text)

            # Validate required fields
            if 'title' not in concept:
                concept['title'] = 'AI Generated Quest'
            if 'big_idea' not in concept:
                concept['big_idea'] = 'A learning experience generated by AI.'

            # Add metadata
            concept['source'] = 'ai_generated'

            return concept

        except json.JSONDecodeError:
            # If JSON parsing fails, create a fallback structure
            return {
                'title': 'AI Generated Quest',
                'big_idea': 'A learning experience generated by AI.',
                'source': 'ai_generated'
            }

    def _parse_quest_response(self, response_text: str) -> Dict[str, Any]:
        """Parse and extract quest data from AI response"""
        try:
            # Try to find JSON in the response
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group()
                return json.loads(json_str)
            else:
                # Fallback: try to parse the whole response as JSON
                return json.loads(response_text)
        except json.JSONDecodeError:
            # If JSON parsing fails, create a fallback structure
            return {
                'title': 'Generated Quest',
                'big_idea': 'This quest was generated by AI but parsing failed.',
                'tasks': []
            }
    
    def _parse_tasks_response(self, response_text: str) -> List[Dict[str, Any]]:
        """Parse tasks from AI response"""
        try:
            # Try to find JSON array in the response
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group()
                return json.loads(json_str)
            else:
                return json.loads(response_text)
        except json.JSONDecodeError:
            return []
    
    def _parse_validation_response(self, response_text: str) -> Dict[str, Any]:
        """Parse validation feedback from AI response"""
        try:
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group()
                return json.loads(json_str)
            else:
                return json.loads(response_text)
        except json.JSONDecodeError:
            return {
                'quality_score': 5,
                'strengths': ['AI analysis unavailable'],
                'improvements': ['Could not parse AI feedback'],
                'missing_elements': []
            }
    
    def _validate_and_fix_quest_data(self, quest_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and fix quest data structure and values"""
        # Ensure required fields exist
        if 'title' not in quest_data:
            quest_data['title'] = 'AI Generated Quest'
        
        if 'big_idea' not in quest_data:
            quest_data['big_idea'] = 'An engaging educational quest created with AI assistance.'
        
        if 'tasks' not in quest_data:
            quest_data['tasks'] = []
        
        # Validate and fix tasks
        quest_data['tasks'] = self._validate_tasks_data(quest_data['tasks'])
        
        return quest_data
    
    def _validate_tasks_data(self, tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate and fix task data"""
        validated_tasks = []
        
        for i, task in enumerate(tasks):
            # Ensure required fields
            validated_task = {
                'title': task.get('title', f'Task {i+1}'),
                'description': task.get('description', 'Complete this task.'),
                'pillar': self._validate_pillar(task.get('pillar', 'STEM & Logic')),
                'school_subjects': self._validate_school_subjects(task.get('school_subjects', [])),
                'xp_value': self._validate_xp(task.get('xp_value', 100)),
                'evidence_prompt': task.get('evidence_prompt', 'Provide evidence of your completed work.'),
                'materials_needed': task.get('materials_needed', []),
                'order_index': task.get('order_index', i + 1)
            }
            
            validated_tasks.append(validated_task)
        
        return validated_tasks
    
    def _validate_pillar(self, pillar: str) -> str:
        """
        Validate pillar value and convert to database pillar key.
        AI returns display names like "STEM & Logic", we need to store keys like 'stem_logic'.
        """
        if not pillar:
            return 'stem'  # Default to new single-word key

        # Import pillar utilities for proper conversion
        from utils.pillar_mapping import normalize_pillar_name

        # Try to normalize the pillar (handles display names, old keys, new keys)
        try:
            normalized = normalize_pillar_name(pillar)
        except ValueError:
            return 'stem'  # Fallback if normalization fails

        # If normalize returned a valid key, use it
        if normalized:
            return normalized

        # Fallback: fuzzy matching for common variations, return KEYS not display names
        pillar_lower = pillar.lower()
        if 'stem' in pillar_lower or 'math' in pillar_lower or 'science' in pillar_lower:
            return 'stem_logic'
        elif 'art' in pillar_lower or 'creative' in pillar_lower:
            return 'arts_creativity'
        elif 'language' in pillar_lower or 'communication' in pillar_lower:
            return 'language_communication'
        elif 'society' in pillar_lower or 'culture' in pillar_lower or 'history' in pillar_lower:
            return 'society_culture'
        elif 'life' in pillar_lower or 'wellness' in pillar_lower or 'health' in pillar_lower:
            return 'life_wellness'

        return 'stem_logic'  # Default fallback as key
    
    def _validate_school_subjects(self, school_subjects) -> list:
        """Validate school subjects array"""
        if not school_subjects:
            return ['electives']  # Default fallback
        
        if not isinstance(school_subjects, list):
            return ['electives']
        
        # Validate each subject and convert display names to keys
        validated_subjects = []
        for subject in school_subjects:
            # Convert display name to key if needed
            subject_key = subject.lower().replace(' ', '_')
            if subject_key in self.school_subjects:
                validated_subjects.append(subject_key)
            else:
                # Check if it matches a display name
                for key, display_name in self.school_subject_display_names.items():
                    if subject.lower() == display_name.lower():
                        validated_subjects.append(key)
                        break
        
        # Return validated subjects or default if none were valid
        return validated_subjects if validated_subjects else ['electives']
    
    def _validate_xp(self, xp_value: Any) -> int:
        """Validate and normalize XP value"""
        try:
            xp = int(xp_value) if xp_value else 100
            return max(50, min(500, xp))  # Clamp between 50-500
        except (ValueError, TypeError):
            return 100
    # ===== Badge-Aware Quest Generation Methods =====

    def generate_quest_for_badge(self, badge_id: str, badge_context: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Generate a quest specifically designed for a badge.

        Args:
            badge_id: Badge UUID
            badge_context: Optional badge details (fetched if not provided)

        Returns:
            Dict containing quest data with badge alignment
        """
        try:
            # Get badge details if not provided
            if not badge_context:
                from services.base_service import BaseService
                from database import get_supabase_admin_client
                supabase = get_supabase_admin_client()
                badge = supabase.table('badges').select('*').eq('id', badge_id).single().execute()

                if not badge.data:
                    raise ValueError(f"Badge {badge_id} not found")

                badge_context = badge.data

            # Build badge-specific prompt
            prompt = self._build_badge_quest_generation_prompt(badge_context)

            response = self.model.generate_content(prompt)
            if not response or not response.text:
                raise Exception("Empty response from Gemini API")

            # Parse and validate
            quest_data = self._parse_quest_response(response.text)
            quest_data = self._validate_and_fix_quest_data(quest_data)

            # Add badge metadata
            quest_data['applicable_badges'] = [badge_id]
            quest_data['source'] = 'ai_generated'
            quest_data['badge_aligned'] = True

            # Calculate credit distribution based on tasks
            quest_data['credit_distribution'] = self._calculate_credit_distribution(quest_data['tasks'])

            return {
                'success': True,
                'quest': quest_data,
                'badge_id': badge_id,
                'badge_name': badge_context.get('name')
            }

        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to generate badge quest: {str(e)}",
                'quest': None
            }

    def suggest_applicable_badges(self, quest_data: Dict[str, Any]) -> List[str]:
        """
        Analyze a quest and suggest which badges it should apply to.

        Args:
            quest_data: Quest data with title, description, and tasks

        Returns:
            List of badge IDs that this quest aligns with
        """
        try:
            from services.base_service import BaseService
from database import get_supabase_admin_client
            supabase = get_supabase_admin_client()

            # Get all active badges
            badges = supabase.table('badges').select('*').eq('status', 'active').execute()

            if not badges.data:
                return []

            # Analyze quest pillar distribution
            task_pillars = [task.get('pillar') for task in quest_data.get('tasks', [])]
            pillar_counts = {}
            for pillar in task_pillars:
                pillar_counts[pillar] = pillar_counts.get(pillar, 0) + 1

            # Find badges that align with quest pillars
            applicable_badges = []

            for badge in badges.data:
                badge_primary = badge.get('pillar_primary')
                badge_weights = badge.get('pillar_weights', {})

                # Check if quest has significant overlap with badge
                if badge_primary and badge_primary in pillar_counts:
                    # Primary pillar match
                    if pillar_counts[badge_primary] >= 2:  # At least 2 tasks in primary pillar
                        applicable_badges.append(badge['id'])
                    # Secondary pillar match
                    elif badge_weights:
                        quest_total_tasks = len(task_pillars)
                        overlap_score = 0

                        for pillar, count in pillar_counts.items():
                            weight = badge_weights.get(pillar, 0)
                            overlap_score += (count / quest_total_tasks) * weight

                        if overlap_score >= 40:  # 40% weighted overlap
                            applicable_badges.append(badge['id'])

            return applicable_badges[:3]  # Return top 3 matches

        except Exception as e:
            logger.error(f"Error suggesting badges: {e}")
            return []

    def _build_badge_quest_generation_prompt(self, badge_context: Dict) -> str:
        """Build AI prompt for badge-specific quest generation"""

        badge_name = badge_context.get('name')
        identity_statement = badge_context.get('identity_statement')
        description = badge_context.get('description')
        pillar_primary = badge_context.get('pillar_primary')
        min_xp = badge_context.get('min_xp', 1500)

        # Calculate target XP (should contribute meaningfully to badge)
        target_xp = int(min_xp / 5)  # Each quest ~20% of badge requirement

        return f"""
        Create an educational quest aligned with this learning badge:

        Badge: {badge_name}
        Identity Statement: {identity_statement}
        Description: {description}
        Primary Pillar: {pillar_primary}

        The quest should:
        - Help students work toward the badge's identity statement
        - Focus primarily on {pillar_primary} skills
        - Total approximately {target_xp} XP across all tasks
        - Include 4-5 tasks that build on each other

        Generate a quest with:
        1. title: Simple, clear quest name related to {badge_name}
        2. big_idea: 2-3 sentences explaining what students will create/accomplish
        3. tasks: Array of 4-5 tasks, each with:
           - title: Clear task name
           - description: Simple framework (50-100 words)
           - pillar: Primary should be {pillar_primary}, but include variety
           - school_subjects: Relevant subjects from [{', '.join([self.school_subject_display_names[s] for s in self.school_subjects])}]
           - xp_value: Points 50-300 based on complexity
           - evidence_prompt: Multiple evidence options
           - order_index: Sequential number starting from 1

        Guidelines:
        - Align with badge identity: "{identity_statement}"
        - Use simple, direct language
        - Focus on process and growth (not outcomes)
        - Tasks should feel meaningful and creative
        - Total XP around {target_xp} points

        Return as valid JSON with exact field names shown above.
        """

    def _calculate_credit_distribution(self, tasks: List[Dict]) -> Dict[str, float]:
        """
        Calculate how quest tasks map to diploma credits.

        Args:
            tasks: List of task data with school_subjects and xp_value

        Returns:
            Dict mapping school subjects to credit amounts (1000 XP = 1 credit)
        """
        credit_distribution = {}

        for task in tasks:
            xp = task.get('xp_value', 0)
            subjects = task.get('school_subjects', [])

            if not subjects:
                subjects = ['electives']

            # Distribute XP evenly across subjects for this task
            xp_per_subject = xp / len(subjects)

            for subject in subjects:
                if subject not in credit_distribution:
                    credit_distribution[subject] = 0
                credit_distribution[subject] += xp_per_subject

        # Convert XP to credits (1000 XP = 1 credit)
        for subject in credit_distribution:
            credit_distribution[subject] = round(credit_distribution[subject] / 1000, 3)

        return credit_distribution
