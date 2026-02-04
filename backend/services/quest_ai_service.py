"""
AI-powered quest generation service using Google Gemini API.
Provides intelligent assistance for creating quests, tasks, and educational content.

Refactored (Jan 2026): Now extends BaseAIService for unified Gemini access
and uses shared prompt components from prompts.components.
"""

import json
import re
import time
from typing import Dict, List, Optional, Any

from services.base_ai_service import BaseAIService
from database import get_supabase_admin_client
from utils.logger import get_logger

# Import shared prompt components
from prompts.components import (
    CORE_PHILOSOPHY,
    TONE_LEVELS,
    PILLAR_DEFINITIONS,
    VALID_PILLARS,
    JSON_OUTPUT_INSTRUCTIONS,
    SCHOOL_SUBJECTS,
    SCHOOL_SUBJECT_DISPLAY_NAMES,
)

logger = get_logger(__name__)

class QuestAIService(BaseAIService):
    """Service for AI-powered quest generation using Gemini API.

    Refactored to extend BaseAIService for unified Gemini management.
    """

    def __init__(self, prompt_version: Optional[str] = None):
        """Initialize the AI service.

        Gemini model initialization is handled by BaseAIService (singleton).
        """
        super().__init__()
        # Lazy-initialize client to avoid Flask context issues at import time
        self._supabase = None

        # Prompt version for A/B testing
        self.prompt_version = prompt_version or self._get_active_prompt_version()

        # Use shared components for pillars and subjects
        self.valid_pillars = VALID_PILLARS
        self.school_subjects = SCHOOL_SUBJECTS
        self.school_subject_display_names = SCHOOL_SUBJECT_DISPLAY_NAMES

    @property
    def supabase(self):
        """Lazy-load Supabase admin client on first access."""
        if self._supabase is None:
            self._supabase = get_supabase_admin_client()
        return self._supabase
    
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

    def cleanup_quest_format(self, title: str, big_idea: str) -> Dict[str, Any]:
        """
        Clean and standardize quest text to match Optio formatting standards.
        Fixes grammar, spelling, punctuation, and ensures consistent tone.

        Args:
            title: Current quest title
            big_idea: Current quest description/big idea

        Returns:
            Dict with cleaned title, big_idea, and list of changes made
        """
        try:
            prompt = f"""You are an expert at maintaining educational content quality for the Optio learning platform.

Your task: Clean and standardize these quest details to match Optio's formatting standards.

CURRENT QUEST:
Title: {title}
Big Idea: {big_idea}

FORMATTING STANDARDS:

1. Title (3-6 words, action-oriented):
   - Use simple, clear language
   - Include action verb (Start, Learn, Build, Create, Master, Design, Write, Paint, etc.)
   - Title case capitalization
   - No emojis, no exclamation points
   - Examples: "Start a Small Business", "Learn to Surf", "Build a Treehouse", "Create a Podcast Series"

2. Big Idea (exactly 2-3 sentences, process-focused):
   - First sentence: Explain what students will DO in simple terms
   - Keep it open to personal interpretation
   - Focus on the EXPERIENCE itself, not future benefits
   - Use simple, professional, respectful language
   - NO "will help you" or outcome-oriented language
   - NO flowery excitement, NO emojis, NO motivational hype
   - Celebrate the present process ("The Process Is The Goal" philosophy)

   Good examples:
   "Create and run a small business venture. Choose your product, find customers, and learn through real entrepreneurship."
   "Master the basics of surfing. Find a beach, get lessons or teach yourself, document your progression from beginner to confident."
   "Design and construct a real treehouse. Plan the structure, gather materials, and bring your vision to life through hands-on building."

YOUR JOB:
- Fix grammar, spelling, and punctuation errors
- Remove outcome-focused language ("this will help your career", "prepare for the future", etc.)
- Remove motivational hype and flowery enthusiasm
- Simplify overly complex sentences
- Ensure exactly 2-3 sentences in big idea
- Make title action-oriented if it isn't already
- Add specificity where too vague
- Maintain the core intent while improving clarity

Return ONLY valid JSON (no markdown code blocks):
{{
  "cleaned_title": "...",
  "cleaned_big_idea": "...",
  "changes_made": ["specific change 1", "specific change 2", ...],
  "quality_score": 0-100
}}"""

            response = self.model.generate_content(prompt)
            if not response or not response.text:
                raise Exception("Empty response from Gemini API")

            # Parse JSON response
            result = self._parse_cleanup_response(response.text)

            return {
                'success': True,
                'cleaned_title': result.get('cleaned_title', title),
                'cleaned_big_idea': result.get('cleaned_big_idea', big_idea),
                'changes_made': result.get('changes_made', []),
                'quality_score': result.get('quality_score', 50)
            }

        except Exception as e:
            logger.error(f"Failed to cleanup quest format: {str(e)}")
            return {
                'success': False,
                'error': f"Failed to cleanup quest format: {str(e)}",
                'cleaned_title': title,
                'cleaned_big_idea': big_idea,
                'changes_made': [],
                'quality_score': 0
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
            - description: Short and focused (2-3 sentences) offering different IDEAS and APPROACHES for how the student might complete this task. Frame as suggestions, not directions. Example: "You could research online sources, interview someone with experience, or explore hands-on experiments. Consider what format best fits your learning style."
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

    def generate_tasks_from_lesson(self, lesson_content: str, lesson_title: str = "",
                                   target_task_count: int = 3, max_retries: int = 3) -> Dict[str, Any]:
        """
        Generate tasks aligned with lesson content using AI with retry logic.

        Args:
            lesson_content: The lesson text/content to base tasks on
            lesson_title: Optional lesson title for context
            target_task_count: Number of tasks to generate (1-5, default 3)
            max_retries: Maximum retry attempts with exponential backoff (default 3)

        Returns:
            Dict containing success status, tasks list, and any errors
        """
        import time

        # Validate inputs
        if not lesson_content or not lesson_content.strip():
            return {
                'success': False,
                'error': 'Lesson content is required',
                'tasks': self._get_fallback_tasks()
            }

        target_task_count = max(1, min(5, target_task_count))

        # Retry logic with exponential backoff
        last_error = None
        for attempt in range(max_retries):
            try:
                # Build prompt with lesson context
                prompt = self._build_lesson_tasks_prompt(lesson_content, lesson_title, target_task_count)

                # Generate content with timeout
                response = self.model.generate_content(prompt)

                if not response or not response.text:
                    raise Exception("Empty response from Gemini API")

                # Parse and validate AI response
                tasks_data = self._parse_tasks_response(response.text)

                if not tasks_data or not isinstance(tasks_data, list):
                    raise ValueError("AI returned invalid task structure")

                # Validate each task has required fields
                tasks_data = self._validate_tasks_data(tasks_data)

                # Success - log and return
                logger.info(f"Generated {len(tasks_data)} tasks from lesson (attempt {attempt + 1})")
                return {
                    'success': True,
                    'tasks': tasks_data,
                    'attempt': attempt + 1
                }

            except Exception as e:
                last_error = str(e)
                logger.warning(f"AI task generation attempt {attempt + 1}/{max_retries} failed: {last_error}")

                # Exponential backoff: 1s, 2s, 4s
                if attempt < max_retries - 1:
                    backoff_time = 2 ** attempt
                    time.sleep(backoff_time)

        # All retries failed - log error and return fallback
        logger.error(f"AI task generation failed after {max_retries} attempts: {last_error}")
        return {
            'success': False,
            'error': f"AI generation failed after {max_retries} attempts: {last_error}",
            'tasks': self._get_fallback_tasks(),
            'used_fallback': True
        }

    def _build_lesson_tasks_prompt(self, lesson_content: str, lesson_title: str,
                                   target_task_count: int) -> str:
        """Build AI prompt for generating tasks from lesson content"""

        title_context = f"\nLesson Title: {lesson_title}" if lesson_title else ""

        # Truncate lesson content if too long (keep first 1500 chars for context)
        if len(lesson_content) > 1500:
            lesson_snippet = lesson_content[:1500] + "..."
        else:
            lesson_snippet = lesson_content

        return f"""
        Generate {target_task_count} educational tasks based on this lesson content:{title_context}

{TONE_LEVELS['content_generation']}

        Lesson Content:
        {lesson_snippet}

        For each task, provide:
        - title: Action-oriented task name using verbs like Learn, Practice, Research, Create, Apply, Explore (5-8 words max)
        - description: Short and focused (2-3 sentences) offering different IDEAS and APPROACHES for how the student might complete this task. Frame as suggestions, not directions. Example: "You could create a visual diagram, write a short explanation, or build a simple model. Consider connecting this to real-world examples you find interesting."
        - pillar: One of [{', '.join(self.valid_pillars)}] that best matches the lesson content
        - school_subjects: Array of relevant school subjects from [{', '.join([self.school_subject_display_names[s] for s in self.school_subjects])}]
        - xp_value: XP points (50-300 based on complexity and time required)
        - evidence_prompt: How students demonstrate completion - offer multiple formats (written work, video, presentation, project, etc.)

        Tasks should:
        - Directly relate to concepts in the lesson content
        - Progress from foundational to advanced understanding
        - Be achievable by students working independently
        - Use simple, direct, actionable language
        - Avoid motivational hype or flowery language

        Evidence prompts should be flexible:
        "Demonstrate your understanding through a written summary, video explanation, visual diagram, practical example, or other format of your choice"

        Return ONLY a valid JSON array with these exact field names. No markdown, no code blocks.
        """

    def _get_fallback_tasks(self) -> List[Dict[str, Any]]:
        """
        Provide fallback tasks when AI generation fails.
        These are generic but valid tasks that can be used as a safety net.
        """
        return [
            {
                'title': 'Review Lesson Content',
                'description': 'Read through the lesson materials carefully and take notes on key concepts.',
                'pillar': 'stem',
                'school_subjects': ['electives'],
                'xp_value': 50,
                'evidence_prompt': 'Share your notes or a summary of what you learned',
                'order_index': 1
            },
            {
                'title': 'Apply What You Learned',
                'description': 'Choose one concept from the lesson and create something that demonstrates your understanding.',
                'pillar': 'stem',
                'school_subjects': ['electives'],
                'xp_value': 100,
                'evidence_prompt': 'Show your work through writing, video, diagram, or practical example',
                'order_index': 2
            }
        ]

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

{TONE_LEVELS['content_generation']}

{CORE_PHILOSOPHY}

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

{TONE_LEVELS['content_generation']}

{CORE_PHILOSOPHY}

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
        """Parse and extract quest concept from AI response.

        Uses unified extract_json from BaseAIService.
        """
        concept = self.extract_json(response_text)

        if not concept:
            # Fallback structure
            return {
                'title': 'AI Generated Quest',
                'big_idea': 'A learning experience generated by AI.',
                'source': 'ai_generated'
            }

        # Validate required fields
        if 'title' not in concept:
            concept['title'] = 'AI Generated Quest'
        if 'big_idea' not in concept:
            concept['big_idea'] = 'A learning experience generated by AI.'

        # Add metadata
        concept['source'] = 'ai_generated'

        return concept

    def _parse_quest_response(self, response_text: str) -> Dict[str, Any]:
        """Parse and extract quest data from AI response.

        Uses unified extract_json from BaseAIService.
        """
        result = self.extract_json(response_text)

        if not result:
            # Fallback structure
            return {
                'title': 'Generated Quest',
                'big_idea': 'This quest was generated by AI but parsing failed.',
                'tasks': []
            }

        return result
    
    def _parse_tasks_response(self, response_text: str) -> List[Dict[str, Any]]:
        """Parse tasks from AI response.

        Uses unified extract_json from BaseAIService.
        """
        result = self.extract_json(response_text)

        if not result:
            return []

        # Handle both list and dict responses
        if isinstance(result, list):
            return result
        elif isinstance(result, dict) and 'tasks' in result:
            return result['tasks']
        else:
            return []
    
    def _parse_validation_response(self, response_text: str) -> Dict[str, Any]:
        """Parse validation feedback from AI response.

        Uses unified extract_json from BaseAIService.
        """
        result = self.extract_json(response_text)

        if not result:
            return {
                'quality_score': 5,
                'strengths': ['AI analysis unavailable'],
                'improvements': ['Could not parse AI feedback'],
                'missing_elements': []
            }

        return result

    def _parse_cleanup_response(self, response_text: str) -> Dict[str, Any]:
        """Parse cleanup response from AI.

        Uses unified extract_json from BaseAIService.
        """
        result = self.extract_json(response_text)

        if not result:
            return {
                'cleaned_title': '',
                'cleaned_big_idea': '',
                'changes_made': ['Failed to parse AI response'],
                'quality_score': 0
            }

        return result
    
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
        from utils.pillar_utils import normalize_pillar_name

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

{TONE_LEVELS['content_generation']}

{CORE_PHILOSOPHY}

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

    # ===== Approach Examples Generation =====

    def generate_approach_examples(self, quest_id: str, quest_title: str, quest_description: str) -> Dict[str, Any]:
        """
        Generate diverse approach examples showing different ways to tackle a quest.

        These are generated once per quest (not per user) and cached in the database.

        Args:
            quest_id: Quest UUID
            quest_title: Quest title for context
            quest_description: Quest description/big_idea for context

        Returns:
            Dict containing success status and approach examples
        """
        try:
            # First check if we already have cached examples
            cached = self._get_cached_approach_examples(quest_id)
            if cached:
                logger.info(f"Using cached approach examples for quest {quest_id[:8]}")
                return {
                    'success': True,
                    'approaches': cached,
                    'from_cache': True
                }

            # Generate new examples
            prompt = self._build_approach_examples_prompt(quest_title, quest_description)

            response = self.model.generate_content(prompt)
            if not response or not response.text:
                raise Exception("Empty response from Gemini API")

            # Parse the response
            result = self.extract_json(response.text)

            if not result or 'approaches' not in result:
                raise ValueError("Invalid response format - missing 'approaches' key")

            approaches = result['approaches']

            # Validate we have approaches
            if not isinstance(approaches, list) or len(approaches) < 2:
                raise ValueError(f"Expected 4 approaches, got {len(approaches) if isinstance(approaches, list) else 0}")

            # Validate and clean each approach
            for i, approach in enumerate(approaches):
                if 'label' not in approach:
                    raise ValueError(f"Approach {i} missing label")

                # Ensure tasks exist and are valid
                tasks = approach.get('tasks', [])
                if not tasks or len(tasks) < 2:
                    raise ValueError(f"Approach {i} needs at least 2 tasks")

                # Validate and normalize each task
                validated_tasks = []
                for j, task in enumerate(tasks):
                    validated_task = {
                        'title': task.get('title', f'Task {j+1}'),
                        'description': task.get('description', 'Complete this task.'),
                        'pillar': self._validate_pillar(task.get('pillar', 'stem')),
                        'xp_value': self._validate_xp(task.get('xp_value', 100))
                    }
                    validated_tasks.append(validated_task)

                approach['tasks'] = validated_tasks

            # Cache the result in the database
            self._cache_approach_examples(quest_id, approaches)

            logger.info(f"Generated and cached {len(approaches)} approach examples for quest {quest_id[:8]}")

            return {
                'success': True,
                'approaches': approaches,
                'from_cache': False
            }

        except Exception as e:
            logger.error(f"Failed to generate approach examples for quest {quest_id[:8]}: {str(e)}")
            return {
                'success': False,
                'error': f"Failed to generate approach examples: {str(e)}",
                'approaches': []
            }

    def _build_approach_examples_prompt(self, quest_title: str, quest_description: str) -> str:
        """Build AI prompt for generating starter path approaches with actual tasks"""

        pillar_list = ', '.join(self.valid_pillars)

        return f"""
Quest: {quest_title}
About: {quest_description}

Create 4 different "starter paths" for this quest. Each path is a different way a student might approach it based on their interests.

RULES:
- Use simple, everyday words (8th grade reading level)
- Each path needs a short name (1-3 words) and 3-4 starter tasks
- Tasks should be specific and doable
- Each task needs: title (action verb + what), short description (1 sentence), pillar, and XP (50-150)
- Paths should feel genuinely different - not just renamed versions of each other
- Focus on the doing, not the outcome
- IMPORTANT: Mix different pillars within each path (don't use the same pillar for all tasks in a path)

PILLARS: {pillar_list}
- stem: math, science, technology, logic, data
- wellness: health, fitness, mindfulness, personal growth
- communication: writing, reading, speaking, listening
- civics: history, community, culture, social issues
- art: visual art, music, creative expression, design

GOOD PATH NAMES: "The Artist", "The Scientist", "The Builder", "The Writer", "The Helper", "The Explorer", "The Performer", "The Researcher"

Return ONLY valid JSON:
{{
  "approaches": [
    {{
      "label": "Path Name",
      "description": "One sentence about this approach style.",
      "tasks": [
        {{
          "title": "Action verb + specific thing",
          "description": "One sentence explaining what to do.",
          "pillar": "pillar_key",
          "xp_value": 100
        }}
      ]
    }}
  ]
}}

Generate 4 approaches, each with 3-4 tasks.
"""

    def _get_cached_approach_examples(self, quest_id: str) -> Optional[List[Dict]]:
        """Check if approach examples are already cached in the database"""
        try:
            result = self.supabase.table('quests').select('approach_examples').eq('id', quest_id).single().execute()

            if result.data and result.data.get('approach_examples'):
                cached = result.data['approach_examples']
                # Handle both formats: direct list or wrapped in 'approaches' key
                if isinstance(cached, list):
                    return cached
                elif isinstance(cached, dict) and 'approaches' in cached:
                    return cached['approaches']
            return None
        except Exception as e:
            logger.warning(f"Error checking cached approach examples: {str(e)}")
            return None

    def _cache_approach_examples(self, quest_id: str, approaches: List[Dict]) -> bool:
        """Cache generated approach examples in the database"""
        try:
            self.supabase.table('quests').update({
                'approach_examples': approaches
            }).eq('id', quest_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error caching approach examples: {str(e)}")
            return False

    def _validate_pillar(self, pillar: str) -> str:
        """Validate and normalize a pillar value"""
        if not pillar:
            return 'stem'
        pillar_lower = pillar.lower().strip()
        if pillar_lower in self.valid_pillars:
            return pillar_lower
        # Try to map common variations
        pillar_map = {
            'science': 'stem', 'math': 'stem', 'technology': 'stem', 'engineering': 'stem',
            'health': 'wellness', 'fitness': 'wellness', 'mindfulness': 'wellness',
            'writing': 'communication', 'reading': 'communication', 'language': 'communication',
            'history': 'civics', 'social': 'civics', 'community': 'civics', 'culture': 'civics',
            'creative': 'art', 'music': 'art', 'visual': 'art', 'design': 'art'
        }
        return pillar_map.get(pillar_lower, 'stem')

    def _validate_xp(self, xp_value) -> int:
        """Validate and normalize XP value"""
        try:
            xp = int(xp_value)
            # Clamp to reasonable range
            return max(25, min(200, xp))
        except (ValueError, TypeError):
            return 100

    def clone_quest_to_optio(self, source_quest: Dict) -> Dict[str, Any]:
        """
        Clone a user/org quest into an Optio universal quest with AI enhancement.
        Rewrites title, description, and big_idea to match Optio's educational
        philosophy and quality standards.

        Args:
            source_quest: Dict containing title, description, big_idea, topics, etc.

        Returns:
            Dict with enhanced quest data ready for insertion
        """
        try:
            original_title = source_quest.get('title', '')
            original_description = source_quest.get('description', '') or source_quest.get('big_idea', '')
            original_big_idea = source_quest.get('big_idea', '') or original_description

            prompt = f"""You are enhancing a quest to match Optio's educational standards.

{CORE_PHILOSOPHY}

{TONE_LEVELS['content_generation']}

ORIGINAL QUEST:
Title: {original_title}
Description: {original_description}
Big Idea: {original_big_idea}

YOUR TASK:
Rewrite this quest to match Optio's "Process Is The Goal" philosophy and quality standards.

FORMATTING STANDARDS:

1. Title (3-6 words, action-oriented):
   - Use simple, clear language
   - Include action verb (Start, Learn, Build, Create, Master, Design, Write, Paint, etc.)
   - Title case capitalization
   - No emojis, no exclamation points
   - Examples: "Start a Small Business", "Learn to Surf", "Build a Treehouse"

2. Big Idea (exactly 2-3 sentences, process-focused):
   - First sentence: Explain what students will DO in simple terms
   - Keep it open to personal interpretation
   - Focus on the EXPERIENCE itself, not future benefits
   - Use simple, professional, respectful language
   - NO "will help you" or outcome-oriented language
   - NO flowery excitement, NO emojis, NO motivational hype
   - Celebrate the present process

3. Topics (3-5 relevant topic tags):
   - Single words or short phrases
   - Lowercase
   - Describe what the quest is about

Return ONLY valid JSON (no markdown code blocks):
{{
  "title": "Enhanced Title Here",
  "description": "Enhanced 2-3 sentence description here.",
  "big_idea": "Same as description (keep them in sync).",
  "topics": ["topic1", "topic2", "topic3"]
}}"""

            response = self.model.generate_content(prompt)
            if not response or not response.text:
                raise Exception("Empty response from Gemini API")

            # Parse the response
            result = self.extract_json(response.text)

            if not result:
                raise ValueError("Failed to parse AI response as JSON")

            # Validate required fields
            if not result.get('title'):
                result['title'] = original_title
            if not result.get('description'):
                result['description'] = original_description
            if not result.get('big_idea'):
                result['big_idea'] = result.get('description', original_big_idea)
            if not result.get('topics'):
                result['topics'] = []

            # Keep description and big_idea in sync
            result['big_idea'] = result['description']

            # Add source metadata
            result['original_quest_id'] = source_quest.get('id')
            result['original_organization_id'] = source_quest.get('organization_id')

            return {
                'success': True,
                'quest': result
            }

        except Exception as e:
            logger.error(f"Failed to clone quest to Optio: {str(e)}")
            return {
                'success': False,
                'error': f"Failed to clone quest: {str(e)}",
                'quest': None
            }
