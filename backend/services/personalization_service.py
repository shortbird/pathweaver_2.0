"""
Quest Personalization Service
==============================

Handles AI-powered task generation for personalized learning paths.
Students work with AI to create custom quests aligned with their interests.
"""

import hashlib
import json
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from services.base_service import BaseService
from database import get_supabase_admin_client
from utils.pillar_mapping import normalize_pillar_name

from utils.logger import get_logger

logger = get_logger(__name__)

# Import task library service for saving tasks
from services.task_library_service import TaskLibraryService

class TaskCacheService(BaseService):
    """Caching service for AI-generated tasks"""

    def __init__(self):
        super().__init__()
        # Lazy-initialize client to avoid Flask context issues at import time
        self._supabase = None

    @property
    def supabase(self):
        """Lazy-load Supabase admin client on first access."""
        if self._supabase is None:
            self._supabase = get_supabase_admin_client()
        return self._supabase

    def build_cache_key(self, interests: List[str], cross_curricular: List[str]) -> str:
        """Build a cache key from interests and cross-curricular subjects"""
        combined = sorted(interests) + sorted(cross_curricular)
        key_str = '|'.join(combined)
        return hashlib.md5(key_str.encode()).hexdigest()

    def get(self, quest_id: str, cache_key: str) -> Optional[Dict]:
        """Get cached tasks if available and not expired"""
        try:
            result = self.supabase.table('ai_task_cache')\
                .select('*')\
                .eq('quest_id', quest_id)\
                .eq('cache_key', cache_key)\
                .gt('expires_at', datetime.utcnow().isoformat())\
                .execute()

            if result.data:
                # Increment hit count
                cache_entry = result.data[0]
                self.supabase.table('ai_task_cache')\
                    .update({'hit_count': cache_entry['hit_count'] + 1})\
                    .eq('id', cache_entry['id'])\
                    .execute()

                logger.info(f"✓ Cache hit for quest {quest_id[:8]}... (key: {cache_key[:8]}...)")
                return cache_entry['generated_tasks']

            return None
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None

    def set(self, quest_id: str, cache_key: str, tasks: Dict) -> None:
        """Store generated tasks in cache"""
        try:
            cache_entry = {
                'quest_id': quest_id,
                'cache_key': cache_key,
                'interests_hash': cache_key[:16],
                'generated_tasks': tasks,
                'hit_count': 0,
                'created_at': datetime.utcnow().isoformat(),
                'expires_at': (datetime.utcnow() + timedelta(days=7)).isoformat()
            }

            # Upsert to handle conflicts
            self.supabase.table('ai_task_cache')\
                .upsert(cache_entry, on_conflict='quest_id,cache_key')\
                .execute()

            logger.info(f"✓ Cached tasks for quest {quest_id[:8]}... (key: {cache_key[:8]}...)")
        except Exception as e:
            logger.error(f"Cache set error: {e}")

class PersonalizationService(BaseService):
    """Main service for quest personalization"""

    def __init__(self):
        super().__init__()
        # Lazy-initialize client to avoid Flask context issues at import time
        self._supabase = None
        self._ai_service = None
        self.cache = TaskCacheService()

    @property
    def supabase(self):
        """Lazy-load Supabase admin client on first access."""
        if self._supabase is None:
            self._supabase = get_supabase_admin_client()
        return self._supabase

    @property
    def ai_service(self):
        """Lazy-load AI service on first access to avoid Flask context issues."""
        if self._ai_service is None:
            # Import AI service lazily to avoid circular imports
            from services.quest_ai_service import QuestAIService
            self._ai_service = QuestAIService()
        return self._ai_service

    def start_personalization_session(
        self,
        user_id: str,
        quest_id: str
    ) -> Dict[str, Any]:
        """
        Initialize a new personalization session.

        Args:
            user_id: User ID
            quest_id: Quest ID
        """
        try:
            # Get quest details
            quest = self.supabase.table('quests')\
                .select('*')\
                .eq('id', quest_id)\
                .single()\
                .execute()

            if not quest.data:
                return {
                    'success': False,
                    'error': 'Quest not found'
                }

            # Check for existing session
            existing_session = self.supabase.table('quest_personalization_sessions')\
                .select('*')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .is_('completed_at', 'null')\
                .execute()

            if existing_session.data:
                # Resume existing session
                return {
                    'success': True,
                    'session': existing_session.data[0],
                    'resumed': True
                }

            # Create new session
            session = self.supabase.table('quest_personalization_sessions')\
                .insert({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'created_at': datetime.utcnow().isoformat()
                })\
                .execute()

            return {
                'success': True,
                'session': session.data[0],
                'resumed': False
            }

        except Exception as e:
            logger.error(f"Error starting personalization session: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    def generate_task_suggestions(
        self,
        session_id: str,
        quest_id: str,
        approach: str,
        interests: List[str],
        cross_curricular_subjects: List[str],
        exclude_tasks: List[str] = None,
        additional_feedback: str = ''
    ) -> Dict[str, Any]:
        """Generate AI task suggestions with caching"""
        try:
            # Build cache key always (needed for storage later)
            cache_key = self.cache.build_cache_key(interests, cross_curricular_subjects)

            # Skip cache if we have exclude_tasks or additional_feedback
            if exclude_tasks or additional_feedback:
                cached_tasks = None
            else:
                # Check cache first
                cached_tasks = self.cache.get(quest_id, cache_key)

            if cached_tasks:
                # Update session with cached results
                self.supabase.table('quest_personalization_sessions')\
                    .update({
                        'ai_generated_tasks': cached_tasks,
                        'selected_approach': approach,
                        'selected_interests': interests,
                        'cross_curricular_subjects': cross_curricular_subjects
                    })\
                    .eq('id', session_id)\
                    .execute()

                return {
                    'success': True,
                    'tasks': cached_tasks['tasks'],
                    'cached': True
                }

            # Generate new tasks with AI
            quest = self.supabase.table('quests')\
                .select('*')\
                .eq('id', quest_id)\
                .single()\
                .execute()

            if not quest.data:
                return {
                    'success': False,
                    'error': 'Quest not found'
                }

            # Build personalization prompt
            prompt = self._build_personalization_prompt(
                quest.data,
                approach,
                interests,
                cross_curricular_subjects,
                exclude_tasks=exclude_tasks or [],
                additional_feedback=additional_feedback
            )

            # Generate tasks using AI service
            result = self.ai_service.model.generate_content(prompt)

            if not result or not result.text:
                return {
                    'success': False,
                    'error': 'AI generation failed'
                }

            # Parse and validate response
            tasks_data = self.ai_service._parse_tasks_response(result.text)

            # Debug: Log AI-generated pillar values BEFORE validation
            logger.info(f"[PERSONALIZATION] AI generated {len(tasks_data)} tasks for quest {quest_id}")
            for i, task in enumerate(tasks_data):
                logger.info(f"  Task {i}: '{task.get('title')}' - AI returned pillar: '{task.get('pillar')}'")

            tasks_data = self._validate_tasks(tasks_data, interests, cross_curricular_subjects)

            # Debug: Log pillar values AFTER validation
            logger.info(f"[PERSONALIZATION] After validation:")
            for i, task in enumerate(tasks_data):
                logger.info(f"  Task {i}: '{task.get('title')}' - Validated pillar: '{task.get('pillar')}'")

            # Ensure 50%+ tasks are 100 XP
            tasks_data = self._enforce_xp_distribution(tasks_data)

            # Store in cache
            cached_data = {'tasks': tasks_data}
            self.cache.set(quest_id, cache_key, cached_data)

            # Update session
            self.supabase.table('quest_personalization_sessions')\
                .update({
                    'ai_generated_tasks': cached_data,
                    'selected_approach': approach,
                    'selected_interests': interests,
                    'cross_curricular_subjects': cross_curricular_subjects,
                    'updated_at': datetime.utcnow().isoformat()
                })\
                .eq('id', session_id)\
                .execute()

            return {
                'success': True,
                'tasks': tasks_data,
                'cached': False
            }

        except Exception as e:
            logger.error(f"Error generating task suggestions: {e}")
            import traceback
            return {
                'success': False,
                'error': str(e)
            }

    def refine_task(
        self,
        session_id: str,
        task_index: int,
        student_edits: str
    ) -> Dict[str, Any]:
        """Refine a task based on student edits (AI reformats)"""
        try:
            # Get session
            session = self.supabase.table('quest_personalization_sessions')\
                .select('*')\
                .eq('id', session_id)\
                .single()\
                .execute()

            if not session.data:
                return {
                    'success': False,
                    'error': 'Session not found'
                }

            ai_tasks = session.data.get('ai_generated_tasks', {}).get('tasks', [])

            if task_index < 0 or task_index >= len(ai_tasks):
                return {
                    'success': False,
                    'error': 'Invalid task index'
                }

            original_task = ai_tasks[task_index]

            # Build refinement prompt
            prompt = f"""
            Refine this educational task based on student's input:

            Original Task:
            Title: {original_task['title']}
            Description: {original_task['description']}

            Student's Edit:
            {student_edits}

            Create an improved version that:
            1. Incorporates the student's ideas
            2. Maintains educational quality
            3. Keeps similar XP value ({original_task['xp_value']})
            4. Stays in the same pillar ({original_task['pillar']})

            Return as JSON with fields: title, description, pillar, xp_value, evidence_prompt
            """

            result = self.ai_service.model.generate_content(prompt)
            refined_task = self.ai_service._parse_quest_response(result.text)

            # Validate refined task
            refined_task = {
                'title': refined_task.get('title', original_task['title']),
                'description': refined_task.get('description', original_task['description']),
                'pillar': self.ai_service._validate_pillar(refined_task.get('pillar', original_task['pillar'])),
                'xp_value': self.ai_service._validate_xp(refined_task.get('xp_value', original_task['xp_value'])),
                'evidence_prompt': refined_task.get('evidence_prompt', original_task.get('evidence_prompt', '')),
                'cross_curricular_connections': original_task.get('cross_curricular_connections', [])
            }

            # Update task in session
            ai_tasks[task_index] = refined_task

            self.supabase.table('quest_personalization_sessions')\
                .update({
                    'ai_generated_tasks': {'tasks': ai_tasks},
                    'updated_at': datetime.utcnow().isoformat()
                })\
                .eq('id', session_id)\
                .execute()

            return {
                'success': True,
                'task': refined_task
            }

        except Exception as e:
            logger.error(f"Error refining task: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    def finalize_personalization(
        self,
        session_id: str,
        user_id: str,
        quest_id: str,
        user_quest_id: str,
        selected_tasks: List[Dict] = None
    ) -> Dict[str, Any]:
        """Finalize personalization and create user-specific tasks"""
        try:
            # Import subject classification service
            from services.subject_classification_service import SubjectClassificationService
            subject_service = SubjectClassificationService()
            # Use selected tasks directly if provided, otherwise get from session
            if selected_tasks:
                ai_tasks = selected_tasks
            else:
                # Get session
                session = self.supabase.table('quest_personalization_sessions')\
                    .select('*')\
                    .eq('id', session_id)\
                    .single()\
                    .execute()

                if not session.data:
                    return {
                        'success': False,
                        'error': 'Session not found'
                    }

                ai_tasks = session.data.get('ai_generated_tasks', {}).get('tasks', [])

            if not ai_tasks:
                return {
                    'success': False,
                    'error': 'No tasks to finalize'
                }

            # Create user-specific tasks
            user_tasks = []
            for index, task in enumerate(ai_tasks):
                description = task.get('description', '')

                pillar_value = task.get('pillar', 'STEM & Logic')
                logger.info(f"[FINALIZE] Task {index}: '{task.get('title')}' - Pillar from task: {pillar_value}")

                # Convert pillar display name to new pillar key
                # AI returns display names like "STEM", we normalize to lowercase keys like 'stem'
                try:
                    pillar_key = normalize_pillar_name(pillar_value)
                except ValueError:
                    pillar_key = 'stem'  # Default fallback

                # Use the new pillar key directly - database now uses single-word lowercase keys
                db_pillar = pillar_key
                logger.info(f"[FINALIZE] Pillar conversion: '{pillar_value}' -> normalized key: '{pillar_key}' -> storing as: '{db_pillar}'")
                logger.info(f"[FINALIZE] Pillar conversion: '{pillar_value}' -> normalized key: '{pillar_key}' -> storing as: '{db_pillar}'")

                # Handle diploma_subjects - ensure proper format
                diploma_subjects = task.get('diploma_subjects', {})
                if isinstance(diploma_subjects, list):
                    # Convert old array format to dict
                    total_xp = task.get('xp_value', 100)
                    xp_per = (total_xp // len(diploma_subjects) // 25) * 25
                    remainder = total_xp - (xp_per * len(diploma_subjects))
                    diploma_subjects = {s: xp_per + (remainder if i == 0 else 0) for i, s in enumerate(diploma_subjects)}
                elif not isinstance(diploma_subjects, dict):
                    diploma_subjects = {'Electives': task.get('xp_value', 100)}

                # Generate subject XP distribution using AI
                subject_xp_distribution = {}
                try:
                    subject_xp_distribution = subject_service.classify_task_subjects(
                        title=task['title'],
                        description=description,
                        pillar=db_pillar,
                        xp_value=task.get('xp_value', 100)
                    )
                    logger.info(f"Generated subject distribution for task '{task['title']}': {subject_xp_distribution}")
                except Exception as e:
                    logger.error(f"Failed to generate subject distribution for task '{task['title']}': {e}")
                    # Continue without subject distribution - it will be null

                user_task = {
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'user_quest_id': user_quest_id,
                    'title': task['title'],
                    'description': description,
                    'pillar': db_pillar,
                    'diploma_subjects': diploma_subjects,
                    'subject_xp_distribution': subject_xp_distribution if subject_xp_distribution else None,
                    'xp_value': task.get('xp_value', 100),
                    'order_index': index,
                    'is_required': True,
                    'is_manual': False,
                    'approval_status': 'approved',
                    'created_at': datetime.utcnow().isoformat()
                }
                logger.info(f"[FINALIZE] Final pillar value being saved: {user_task['pillar']}")
                user_tasks.append(user_task)

            # Debug: Log what we're about to insert
            logger.info(f"[FINALIZE] Inserting {len(user_tasks)} tasks to database:")
            for i, ut in enumerate(user_tasks):
                logger.info(f"  Task {i}: '{ut['title']}' - pillar='{ut['pillar']}'")

            # Insert user tasks
            result = self.supabase.table('user_quest_tasks')\
                .insert(user_tasks)\
                .execute()

            # Debug: Log what was actually inserted
            logger.info(f"[FINALIZE] Database INSERT result - {len(result.data)} tasks created:")
            for i, task_result in enumerate(result.data):
                logger.info(f"  Task {i}: ID={task_result['id']}, title='{task_result['title']}', pillar='{task_result['pillar']}'")

            # Prepare new tasks for library sanitization
            library_service = TaskLibraryService()
            logger.info(f"[FINALIZE] Preparing {len(ai_tasks)} tasks for library sanitization")

            new_library_tasks = []
            for task in ai_tasks:
                # Normalize pillar name before saving
                try:
                    pillar_key = normalize_pillar_name(task.get('pillar', 'stem'))
                except ValueError:
                    pillar_key = 'stem'

                # Handle diploma_subjects format
                diploma_subjects = task.get('diploma_subjects', {})
                if isinstance(diploma_subjects, list):
                    total_xp = task.get('xp_value', 100)
                    xp_per = (total_xp // len(diploma_subjects) // 25) * 25
                    remainder = total_xp - (xp_per * len(diploma_subjects))
                    diploma_subjects = {s: xp_per + (remainder if i == 0 else 0) for i, s in enumerate(diploma_subjects)}
                elif not isinstance(diploma_subjects, dict):
                    diploma_subjects = {'Electives': task.get('xp_value', 100)}

                library_task_data = {
                    'title': task['title'],
                    'description': task.get('description', ''),
                    'pillar': pillar_key,
                    'xp_value': task.get('xp_value', 100),
                    'diploma_subjects': diploma_subjects,
                    'ai_generated': True
                }
                new_library_tasks.append(library_task_data)

            # Sanitize the task library with AI in background (deduplicate, generalize, remove low-quality)
            # Using async mode so user doesn't wait for AI processing
            logger.info(f"[FINALIZE] Starting background AI sanitization for quest {quest_id}")
            sanitization_result = library_service.sanitize_library(quest_id, new_library_tasks, async_mode=True)

            if sanitization_result.get('success'):
                if sanitization_result.get('async'):
                    logger.info(f"[FINALIZE] Background sanitization started for quest {quest_id}")
                else:
                    logger.info(f"[FINALIZE] Sanitization complete: "
                              f"{sanitization_result.get('removed_count', 0)} removed, "
                              f"{sanitization_result.get('deduplicated_count', 0)} deduplicated, "
                              f"{sanitization_result.get('generalized_count', 0)} generalized")
            else:
                logger.warning(f"[FINALIZE] Sanitization failed to start: {sanitization_result.get('error', 'Unknown error')}")

            # Mark session as completed
            self.supabase.table('quest_personalization_sessions')\
                .update({
                    'finalized_tasks': {'tasks': ai_tasks},
                    'completed_at': datetime.utcnow().isoformat()
                })\
                .eq('id', session_id)\
                .execute()

            logger.info(f"[FINALIZE] Tasks finalized for user_quest {user_quest_id}, session {session_id}")

            return {
                'success': True,
                'tasks': result.data,
                'message': f'Created {len(result.data)} personalized tasks'
            }

        except Exception as e:
            logger.error(f"Error finalizing personalization: {e}")
            import traceback
            return {
                'success': False,
                'error': str(e)
            }

    def _build_personalization_prompt(
        self,
        quest: Dict,
        approach: str,
        interests: List[str],
        cross_curricular_subjects: List[str],
        exclude_tasks: List[str] = None,
        additional_feedback: str = ''
    ) -> str:
        """Build AI prompt for personalized task generation"""

        quest_title = quest['title']
        quest_description = quest.get('big_idea') or quest.get('description', '')

        # Format interests
        interests_text = ', '.join(interests) if interests else 'general learning'

        # Format cross-curricular subjects
        subjects_text = ', '.join(cross_curricular_subjects) if cross_curricular_subjects else 'this subject only'

        # Approach descriptions
        approach_descriptions = {
            'real_world_project': 'Create a personalized, real-life project aligned with the student\'s interests, finding ways to incorporate the study topic into real-world activities.',
            'traditional_class': 'Take a traditional structured approach, such as through an online course or curriculum.',
            'hybrid': 'Combine a traditional structured approach with a personalized project component.'
        }

        approach_desc = approach_descriptions.get(approach, approach_descriptions['real_world_project'])

        # Build exclusion text if provided
        exclude_text = ''
        if exclude_tasks:
            exclude_text = f"\nIMPORTANT: Do NOT generate tasks similar to these already-selected tasks:\n{chr(10).join(['- ' + task for task in exclude_tasks])}\nGenerate completely NEW and UNIQUE task approaches."

        # Build additional feedback text if provided
        feedback_text = ''
        if additional_feedback:
            feedback_text = f"\n\nSTUDENT'S ADDITIONAL REQUIREMENTS:\n{additional_feedback}\n\nMake sure to incorporate these specific requirements into the generated tasks."

        # Build priority subjects text
        priority_subjects_instruction = ''
        if cross_curricular_subjects and cross_curricular_subjects != ['this subject only']:
            priority_subjects_instruction = f"""
PRIORITY REQUIREMENT: The student specifically wants to earn diploma credits in these subjects: {subjects_text}
- At least 70% of generated tasks MUST allocate the majority of their XP to the student's selected subjects
- Each task aligned with selected subjects should have 60-100% of its XP going to those subjects
- Only 2-3 tasks should focus on other subjects for variety
"""

        return f"""
You are helping a student personalize their learning quest: "{quest_title}".

Quest Description: {quest_description}

Student's Selected Approach: {approach_desc}

Student's Interests: {interests_text}

Student's Selected Diploma Subjects: {subjects_text}
{priority_subjects_instruction}{exclude_text}{feedback_text}

Generate 6-10 tasks that:
1. Are equivalent to high school unit projects (not final projects, not quick worksheets)
2. At least 50% of tasks should be worth exactly 100 XP
3. Other tasks can range from 50-150 XP based on complexity
4. Each task must be assigned to ONE of these pillars (use exact lowercase names):
   - stem
   - wellness
   - communication
   - civics
   - art
5. Each task must be mapped to one or more diploma subjects (XP split if multiple):
   - Language Arts, Math, Science, Social Studies, Financial Literacy
   - Health, PE, Fine Arts, CTE, Digital Literacy, Electives
6. Incorporate the student's interests ({interests_text}) authentically
7. PRIORITIZE the student's selected subjects ({subjects_text}) - most tasks should earn credits in these areas
8. Follow the selected approach: {approach_desc}

CRITICAL TASK WRITING GUIDELINES:
- Title: Use action-oriented verbs (Earn, Master, Complete, Build, Create, Write, Draw, Design, Research, etc.)
  Examples: "Build a Historical Timeline", "Master Algebraic Equations", "Create a Science Poster"
- Title should be ONE simple idea (5-8 words max)
- Description: Short and focused (1-2 sentences) on HOW this task could be completed in the context of the school subjects
  Focus on completion methods, not motivational language
  Example: "Create a visual timeline showing major events. Include dates, descriptions, and illustrations for each event."
- Keep language simple, direct, and actionable - no flowery or overly enthusiastic phrases

IMPORTANT: Students should CHOOSE these tasks, not just agree to AI suggestions. Make tasks feel like genuine options, not prescriptive requirements.

Return as valid JSON array:
[
  {{
    "title": "Clear, concise task name (5-8 words)",
    "description": "1-2 brief sentences describing the task",
    "pillar": "stem|wellness|communication|civics|art (use exact lowercase name)",
    "diploma_subjects": {{"Subject Name": 50, "Another Subject": 50}},
    "xp_value": 100
  }}
]

IMPORTANT: diploma_subjects must be a JSON object with subject names as keys and XP amounts as values.
Use these exact subject names: Language Arts, Math, Science, Social Studies, Financial Literacy, Health, PE, Fine Arts, CTE, Digital Literacy, Electives
XP amounts must be in multiples of 25 and sum to the task's total xp_value.
Example: If xp_value is 100 and task covers 2 subjects equally: {{"Science": 50, "Math": 50}}
Example: If xp_value is 100 with primary and secondary subjects: {{"Science": 75, "Math": 25}}
"""

    def _validate_tasks(
        self,
        tasks: List[Dict],
        interests: List[str],
        cross_curricular: List[str]
    ) -> List[Dict]:
        """Validate and enhance generated tasks"""

        validated = []
        for task in tasks:
            # Validate diploma_subjects format
            diploma_subjects = task.get('diploma_subjects', {})

            # Handle both old array format and new dict format
            if isinstance(diploma_subjects, list):
                # Old format - convert to dict with equal XP split
                total_xp = task.get('xp_value', 100)
                xp_per_subject = (total_xp // len(diploma_subjects) // 25) * 25  # Round to nearest 25
                remainder = total_xp - (xp_per_subject * len(diploma_subjects))

                diploma_subjects_dict = {}
                for i, subject in enumerate(diploma_subjects):
                    # Give remainder to first subject
                    xp = xp_per_subject + (remainder if i == 0 else 0)
                    diploma_subjects_dict[subject] = xp
                diploma_subjects = diploma_subjects_dict
            elif not isinstance(diploma_subjects, dict):
                diploma_subjects = {'Electives': task.get('xp_value', 100)}

            # Validate pillar - track if it changes
            original_pillar = task.get('pillar', 'stem')  # Updated default to new format
            validated_pillar = self.ai_service._validate_pillar(original_pillar)

            # Enhanced logging to track pillar validation
            if original_pillar != validated_pillar:
                logger.warning(f"[PILLAR VALIDATION] Task '{task.get('title', 'Unknown')}': '{original_pillar}' -> '{validated_pillar}'")
            else:
                logger.debug(f"[PILLAR VALIDATION] Task '{task.get('title', 'Unknown')}': pillar='{validated_pillar}' (no change)")

            validated_task = {
                'title': task.get('title', 'Learning Task'),
                'description': task.get('description', ''),
                'bullet_points': task.get('bullet_points', []),
                'pillar': validated_pillar,
                'diploma_subjects': diploma_subjects,
                'xp_value': self.ai_service._validate_xp(task.get('xp_value', 100))
            }
            validated.append(validated_task)

        return validated

    def _enforce_xp_distribution(self, tasks: List[Dict]) -> List[Dict]:
        """Ensure at least 50% of tasks are 100 XP"""

        total_tasks = len(tasks)
        tasks_at_100xp = sum(1 for task in tasks if task['xp_value'] == 100)

        required_100xp = total_tasks // 2

        if tasks_at_100xp < required_100xp:
            # Adjust some tasks to 100 XP
            tasks_to_adjust = required_100xp - tasks_at_100xp
            adjusted = 0

            for task in tasks:
                if adjusted >= tasks_to_adjust:
                    break

                if task['xp_value'] != 100:
                    task['xp_value'] = 100
                    adjusted += 1

        return tasks

# Global service instance
personalization_service = PersonalizationService()
