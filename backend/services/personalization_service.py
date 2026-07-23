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
from utils.pillar_utils import normalize_pillar_name
from utils.personalization_helpers import sanitize_success_criteria

from utils.logger import get_logger

logger = get_logger(__name__)

# Import task library service for saving tasks
from services.task_library_service import TaskLibraryService

# Challenge levels (UI: Easier / Standard / Challenge). Each level defines the
# XP anchor that _enforce_xp_distribution holds 50% of tasks to, the min/max
# clamp applied to AI-returned XP, and the range quoted in the prompt.
CHALLENGE_LEVELS = {
    'easier': {'anchor': 75, 'min_xp': 25, 'max_xp': 100, 'range_text': '50-100'},
    'standard': {'anchor': 100, 'min_xp': 25, 'max_xp': 150, 'range_text': '50-150'},
    'challenge': {'anchor': 150, 'min_xp': 50, 'max_xp': 200, 'range_text': '100-200'},
}
DEFAULT_CHALLENGE_LEVEL = 'standard'


def _challenge_config(challenge_level: str) -> Dict:
    """Resolve a challenge level to its config, falling back to standard."""
    return CHALLENGE_LEVELS.get(challenge_level or DEFAULT_CHALLENGE_LEVEL,
                                CHALLENGE_LEVELS[DEFAULT_CHALLENGE_LEVEL])

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
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            self._supabase = get_supabase_admin_client()
        return self._supabase

    def build_cache_key(
        self,
        interests: List[str],
        cross_curricular: List[str],
        exclude_tasks: List[str] = None,
        challenge_level: str = None,
        student_context: str = None
    ) -> str:
        """Build a cache key from interests, cross-curricular subjects, the
        set of tasks the student already has, the challenge level, and the
        student's personal learning context.

        exclude_tasks is part of the key so a quest that already contains tasks
        never collides with (and is never served) the pristine first-generation
        cache entry. Without this, repeat generations for the same interests
        returned the identical cached batch, which is what made tasks feel
        "repetitive over time."

        challenge_level is part of the key so a Challenge request is never
        served a cached Standard batch (entries live up to 7 days). Standard /
        None is keyed WITHOUT a level segment so pre-existing cache entries
        stay valid.

        student_context (the per-student goals/interests block) is part of the
        key so one student's goal-tailored batch is never served to a
        different student who happens to pick the same interests. Students
        with no context (None) are keyed WITHOUT a context segment, keeping
        pre-existing cache entries valid for them.
        """
        combined = sorted(interests) + sorted(cross_curricular)
        if exclude_tasks:
            combined += ['exclude:' + t.strip().lower() for t in sorted(exclude_tasks)]
        if challenge_level and challenge_level != DEFAULT_CHALLENGE_LEVEL:
            combined += [f'level:{challenge_level}']
        if student_context:
            combined += ['context:' + hashlib.md5(student_context.encode()).hexdigest()]
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
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
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
        additional_feedback: str = '',
        vision_statement: str = '',
        age_band: str = None,
        challenge_level: str = None
    ) -> Dict[str, Any]:
        """Generate AI task suggestions with caching.

        age_band (optional, e.g. '5-7' / '8-13') tailors task difficulty + reading
        level for young learners; omitted preserves the default behavior.

        challenge_level (optional, 'easier'|'standard'|'challenge') scales the
        scope/rigor of the whole batch and its XP band. It composes with
        age_band: difficulty is expressed relative to the learner's age, and
        the age band's reading-level rules always win.
        """
        challenge_level = challenge_level or DEFAULT_CHALLENGE_LEVEL
        try:
            # Always fold the student's CURRENT tasks for this quest into the
            # exclusion list so the AI never re-suggests what they already have.
            # We trust the server -- not the client -- to know this, so dedup
            # works for every caller (generate-tasks, refine-tasks, web, mobile).
            # Any client-supplied exclude_tasks are merged in (case-insensitive).
            exclude_tasks = list(exclude_tasks or [])
            session_user_id = None
            try:
                session_row = self.supabase.table('quest_personalization_sessions')\
                    .select('user_id')\
                    .eq('id', session_id)\
                    .single()\
                    .execute()
                session_user_id = session_row.data.get('user_id') if session_row.data else None
                if session_user_id:
                    existing = self.supabase.table('user_quest_tasks')\
                        .select('title')\
                        .eq('user_id', session_user_id)\
                        .eq('quest_id', quest_id)\
                        .execute()
                    seen = {t.strip().lower() for t in exclude_tasks}
                    for row in (existing.data or []):
                        title = (row.get('title') or '').strip()
                        if title and title.lower() not in seen:
                            exclude_tasks.append(title)
                            seen.add(title.lower())
            except Exception as e:
                logger.warning(f"Could not load existing tasks for dedup (quest {quest_id}): {e}")

            # Per-student learning context (long-term direction, year goals,
            # hobbies/interests) so shared class quests still yield individual
            # task suggestions. Best-effort: None means "no context" and the
            # prompt/cache behavior stays byte-identical to before.
            student_context = None
            if session_user_id:
                try:
                    from utils.student_context import get_student_learning_context
                    student_context = get_student_learning_context(session_user_id)
                except Exception as e:
                    logger.warning(f"Could not load student learning context: {e}")

            # Build cache key always (needed for storage later). exclude_tasks is
            # part of the key so a quest that already has tasks can't be served
            # the pristine first-generation cache entry; challenge_level so a
            # Challenge request can't be served a cached Standard batch;
            # student_context so one student's goal-tailored batch is never
            # served to a different student.
            cache_key = self.cache.build_cache_key(
                interests, cross_curricular_subjects, exclude_tasks,
                challenge_level=challenge_level,
                student_context=student_context
            )

            # Skip cache if we have exclude_tasks (i.e. the quest already has
            # tasks, or the client asked to avoid some) or additional_feedback.
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

            # Load the parent course so tasks are grounded in the full course context
            course_context = self._get_course_context(quest_id)

            # Build personalization prompt
            prompt = self._build_personalization_prompt(
                quest.data,
                approach,
                interests,
                cross_curricular_subjects,
                exclude_tasks=exclude_tasks or [],
                additional_feedback=additional_feedback,
                vision_statement=vision_statement,
                age_band=age_band,
                course_context=course_context,
                challenge_level=challenge_level,
                student_context=student_context
            )

            # Generate tasks using AI service (falls back to alternate models on
            # transient "high demand" 503s so the user doesn't see the error)
            result = self.ai_service.generate_with_fallback(prompt)

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

            tasks_data = self._validate_tasks(tasks_data, interests, cross_curricular_subjects,
                                              challenge_level=challenge_level)

            # Debug: Log pillar values AFTER validation
            logger.info(f"[PERSONALIZATION] After validation:")
            for i, task in enumerate(tasks_data):
                logger.info(f"  Task {i}: '{task.get('title')}' - Validated pillar: '{task.get('pillar')}'")

            # Ensure 50%+ tasks sit at the level's anchor XP
            tasks_data = self._enforce_xp_distribution(tasks_data, challenge_level=challenge_level)

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

            original_criteria = sanitize_success_criteria(original_task.get('success_criteria'))
            criteria_text = ''
            if original_criteria:
                criteria_text = "Success Criteria:\n" + '\n'.join(f"- {c}" for c in original_criteria) + "\n"

            # Build refinement prompt
            prompt = f"""
            Refine this educational task based on student's input:

            Original Task:
            Title: {original_task['title']}
            Description: {original_task['description']}
            {criteria_text}
            Student's Edit:
            {student_edits}

            Create an improved version that:
            1. Incorporates the student's ideas
            2. Maintains educational quality
            3. Keeps similar XP value ({original_task['xp_value']})
            4. Stays in the same pillar ({original_task['pillar']})
            5. Updates success_criteria to match the new task: 2-4 short checkable statements addressed to the student ("You..."), keeping the same level of demand as the originals

            Return as JSON with fields: title, description, success_criteria, pillar, xp_value, evidence_prompt
            """

            result = self.ai_service.generate_with_fallback(prompt)
            refined_task = self.ai_service._parse_quest_response(result.text)

            # Validate refined task
            refined_task = {
                'title': refined_task.get('title', original_task['title']),
                'description': refined_task.get('description', original_task['description']),
                'success_criteria': (sanitize_success_criteria(refined_task.get('success_criteria'))
                                     or original_criteria),
                'pillar': self.ai_service._validate_pillar(refined_task.get('pillar', original_task['pillar'])),
                # max_xp=200: a challenge-level task can legitimately sit at
                # 150-200 XP; the default 150 cap would silently shrink it.
                'xp_value': self.ai_service._validate_xp(refined_task.get('xp_value', original_task['xp_value']), max_xp=200),
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

    def adjust_task_complexity(
        self,
        task: Dict,
        direction: str,
        age_band: str = None
    ) -> Dict[str, Any]:
        """Rewrite a suggested task one step easier or harder (the per-task
        "complexity dial" in the personalization wizard).

        Stateless by design: the client sends the task object and swaps in the
        result locally. The task only becomes real via accept-task /
        finalize-tasks, which clamp XP server-side, so this adds no new
        XP-injection surface.
        """
        try:
            original_title = (task.get('title') or '').strip()
            original_description = task.get('description', '')
            original_pillar = task.get('pillar', 'stem')
            original_criteria = sanitize_success_criteria(task.get('success_criteria'))
            try:
                original_xp = int(task.get('xp_value', 100))
            except (TypeError, ValueError):
                original_xp = 100

            if direction == 'harder':
                direction_text = (
                    "Make this task meaningfully HARDER by raising the bar, not the breadth. "
                    "A hard task is a CONCRETE task with a demanding, checkable \"done\" bar - "
                    "never a vaguer or broader one. Keep the description simple; put the "
                    "difficulty into the success_criteria, which must include ALL THREE of: "
                    "(a) a measurable target or real-world constraint (a number, rating, size, "
                    "time limit, real audience, or \"it must actually work/fit/hold\"), "
                    "(b) a quality bar the finished product must meet, and "
                    "(c) process documentation (show attempts that did not work and what you changed). "
                    "Use the topic's real ladder when it has one (chess ratings, print tolerances, "
                    "word counts, timed runs)."
                )
                xp_instruction = (
                    f"Increase xp_value by 25-50 above {original_xp} to reflect the higher bar "
                    f"(multiple of 25, never above 200)."
                )
            else:
                direction_text = (
                    "Make this task meaningfully EASIER. Reduce it to ONE clear outcome "
                    "finishable in a single short session, with small concrete steps and more "
                    "built-in guidance. The success_criteria become 2-3 simple completion "
                    "checks (\"You played 3 full games\") - drop measurable targets, quality "
                    "bars, and process-documentation requirements."
                )
                xp_instruction = (
                    f"Decrease xp_value by 25-50 below {original_xp} to reflect the smaller scope "
                    f"(multiple of 25, never below 25)."
                )

            age_text = ''
            if age_band:
                age_text = (
                    f"\nThe learner is in the {age_band} age band. Keep the task developmentally "
                    f"appropriate for that age - adjust difficulty within what that age can do.\n"
                )

            criteria_text = ''
            if original_criteria:
                criteria_text = "Success Criteria:\n" + '\n'.join(f"- {c}" for c in original_criteria) + "\n"

            prompt = f"""
Adjust the difficulty of this educational task:

Original Task:
Title: {original_title}
Description: {original_description}
{criteria_text}Pillar: {original_pillar}
XP Value: {original_xp}

{direction_text}
{age_text}
Rules:
1. {xp_instruction}
2. Keep the same pillar ({original_pillar}).
3. Keep the same topic and the student's interests - change the difficulty, not the subject.
4. Write for a 5th-6th grade reading level. The BAR changes difficulty; the WORDS stay simple.
5. Title: simple action verb, 5-8 words.
6. Description: 1-2 short sentences.
7. success_criteria: short checkable statements addressed to the student ("You..."), each answerable yes/no from their evidence.

Return as JSON with fields: title, description, success_criteria, pillar, xp_value
"""

            result = self.ai_service.generate_with_fallback(prompt)

            if not result or not result.text:
                return {
                    'success': False,
                    'error': 'AI generation failed'
                }

            adjusted = self.ai_service._parse_quest_response(result.text)

            # Validate: clamp XP to the dial's full range (25-200) and snap to a
            # multiple of 25; force the direction to actually move the XP.
            try:
                new_xp = int(adjusted.get('xp_value', original_xp))
            except (TypeError, ValueError):
                new_xp = original_xp
            new_xp = max(25, min(200, (new_xp // 25) * 25 or 25))
            if direction == 'harder' and new_xp <= original_xp:
                new_xp = min(200, original_xp + 25)
            elif direction == 'easier' and new_xp >= original_xp:
                new_xp = max(25, original_xp - 25)

            adjusted_task = {
                'title': adjusted.get('title') or original_title,
                'description': adjusted.get('description') or original_description,
                'success_criteria': (sanitize_success_criteria(adjusted.get('success_criteria'))
                                     or original_criteria),
                'pillar': self.ai_service._validate_pillar(adjusted.get('pillar', original_pillar)),
                'xp_value': new_xp,
                # Re-spread the original subject split across the new XP total.
                'diploma_subjects': self._rescale_diploma_subjects(
                    task.get('diploma_subjects'), new_xp
                ),
            }

            return {
                'success': True,
                'task': adjusted_task
            }

        except Exception as e:
            logger.error(f"Error adjusting task complexity: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def _rescale_diploma_subjects(diploma_subjects, new_xp: int) -> Dict[str, int]:
        """Re-spread an existing subject split across a new XP total, keeping
        proportions and multiples of 25 (remainder to the largest subject)."""
        from utils.personalization_helpers import normalize_diploma_subjects
        normalized = normalize_diploma_subjects(diploma_subjects or {}, new_xp)
        old_total = sum(normalized.values())
        if old_total <= 0:
            return {'Electives': new_xp}
        subjects = sorted(normalized.items(), key=lambda kv: -kv[1])
        rescaled = {}
        for name, xp in subjects:
            share = ((xp * new_xp // old_total) // 25) * 25
            rescaled[name] = share
        rescaled = {k: v for k, v in rescaled.items() if v > 0} or {subjects[0][0]: 0}
        remainder = new_xp - sum(rescaled.values())
        if remainder:
            first = next(iter(rescaled))
            rescaled[first] += remainder
        return rescaled

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
                    'success_criteria': sanitize_success_criteria(task.get('success_criteria')) or None,
                    'pillar': db_pillar,
                    'diploma_subjects': diploma_subjects,
                    'subject_xp_distribution': subject_xp_distribution if subject_xp_distribution else None,
                    'xp_value': task.get('xp_value', 100),
                    'order_index': index,
                    'is_required': False,
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
                    'success_criteria': sanitize_success_criteria(task.get('success_criteria')) or None,
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

    def _get_course_context(self, quest_id: str) -> Optional[Dict]:
        """
        Load the course this project belongs to, plus this project's lessons, so
        generated tasks can be grounded in the full course. Returns None if the
        quest is not part of any course.
        """
        try:
            cq = self.supabase.table('course_quests')\
                .select('course_id')\
                .eq('quest_id', quest_id)\
                .limit(1)\
                .execute()
            if not cq.data:
                return None

            course_id = cq.data[0]['course_id']
            course = self.supabase.table('courses')\
                .select('title, description, learning_outcomes, final_deliverable')\
                .eq('id', course_id)\
                .single()\
                .execute()
            if not course.data:
                return None

            lessons = self.supabase.table('curriculum_lessons')\
                .select('title, sequence_order')\
                .eq('quest_id', quest_id)\
                .order('sequence_order')\
                .execute()

            return {
                'course_title': course.data.get('title'),
                'course_description': course.data.get('description'),
                'learning_outcomes': course.data.get('learning_outcomes'),
                'final_deliverable': course.data.get('final_deliverable'),
                'lesson_titles': [l['title'] for l in (lessons.data or []) if l.get('title')],
            }
        except Exception as e:
            logger.warning(f"Could not load course context for quest {quest_id}: {e}")
            return None

    @staticmethod
    def _format_outcomes(outcomes) -> str:
        """Format course learning_outcomes (jsonb list/dict/str) as bullet lines."""
        if not outcomes:
            return ''
        items = []
        if isinstance(outcomes, list):
            items = [str(o).strip() for o in outcomes if str(o).strip()]
        elif isinstance(outcomes, dict):
            items = [str(v).strip() for v in outcomes.values() if str(v).strip()]
        elif isinstance(outcomes, str):
            items = [outcomes.strip()] if outcomes.strip() else []
        return '\n'.join(f"- {item}" for item in items[:10])

    def _build_personalization_prompt(
        self,
        quest: Dict,
        approach: str,
        interests: List[str],
        cross_curricular_subjects: List[str],
        exclude_tasks: List[str] = None,
        additional_feedback: str = '',
        vision_statement: str = '',
        age_band: str = None,
        course_context: Dict = None,
        challenge_level: str = None,
        student_context: str = None
    ) -> str:
        """Build AI prompt for personalized task generation.

        age_band (optional) tailors developmental difficulty + reading level for
        young learners (e.g. The Treehouse). When omitted the default high-school
        guidance is used, so existing behavior is unchanged.

        course_context (optional) grounds the tasks in the parent course (its
        title, overview, deliverable, learning outcomes, and this project's
        lessons) so generated tasks fit the course rather than the project alone.

        challenge_level (optional) scales scope/rigor and the XP band of the
        whole batch. Composes with age_band: challenge is expressed relative to
        the learner's age, and the age band's reading-level rules always win.

        student_context (optional) is the compact per-student block from
        utils.student_context (long-term direction, per-subject year goals,
        hobbies/interests). None leaves the prompt unchanged.
        """
        challenge_level = challenge_level or DEFAULT_CHALLENGE_LEVEL
        level_cfg = _challenge_config(challenge_level)

        quest_title = quest['title']
        quest_description = quest.get('big_idea') or quest.get('description', '')

        # Course context — anchors the tasks in the course this project belongs to
        course_context_text = ''
        if course_context:
            parts = []
            if course_context.get('course_title'):
                parts.append(f"This project is part of the course \"{course_context['course_title']}\".")
            if course_context.get('course_description'):
                parts.append(f"Course overview: {course_context['course_description']}")
            if course_context.get('final_deliverable'):
                parts.append(f"What the student ultimately builds in this course: {course_context['final_deliverable']}")
            outcomes = course_context.get('learning_outcomes')
            outcomes_text = self._format_outcomes(outcomes)
            if outcomes_text:
                parts.append(f"Course learning outcomes:\n{outcomes_text}")
            lessons = course_context.get('lesson_titles') or []
            if lessons:
                parts.append("Lessons in this project: " + ', '.join(lessons))
            if parts:
                course_context_text = (
                    "\n\nCOURSE CONTEXT (ground every task in this course):\n"
                    + '\n'.join(parts)
                    + "\nThe tasks you generate must directly help the student progress in this course "
                    "and apply what these lessons teach. Stay on-topic for the course; do not drift into "
                    "unrelated subjects except where the student's chosen interests connect naturally."
                )

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

        # Build vision statement context if provided (light touch - background context only)
        vision_text = ''
        if vision_statement:
            vision_text = f"\n\nBACKGROUND CONTEXT (for reference only):\nThe student has shared this about their learning goals: \"{vision_statement[:500]}\"\nNote: This is optional context. Generate diverse tasks based primarily on the quest topic and selected interests. Only 1-2 tasks may optionally connect to this background if it fits naturally."

        # Per-student goals/interests block (from utils.student_context). When
        # absent (None/empty) the prompt is byte-identical to before.
        student_context_text = ''
        if student_context:
            student_context_text = (
                "\n\nSTUDENT PROFILE (this student's own goals and interests):\n"
                f"{student_context}\n"
                "When suggesting tasks, connect them to this student's goals, direction, "
                "and interests when it fits naturally; do not force it. Never mention "
                "this profile text itself in the tasks."
            )

        # Build priority subjects text
        priority_subjects_instruction = ''
        if cross_curricular_subjects and cross_curricular_subjects != ['this subject only']:
            priority_subjects_instruction = f"""
PRIORITY REQUIREMENT: The student specifically wants to earn diploma credits in these subjects: {subjects_text}
- At least 70% of generated tasks MUST allocate the majority of their XP to the student's selected subjects
- Each task aligned with selected subjects should have 60-100% of its XP going to those subjects
- Only 2-3 tasks should focus on other subjects for variety
"""

        # Age-band guidance for young learners (The Treehouse). Overrides the
        # default "high school unit project" difficulty when provided.
        age_guidance = ''
        difficulty_line = '1. Are equivalent to high school unit projects (not final projects, not quick worksheets)'
        if age_band:
            age_profiles = {
                '5-7': ("ages 5-7 (early elementary, emerging or early readers)",
                        "very short, hands-on, playful steps a 5-7 year old can do mostly independently or with a quick adult hand-off",
                        "almost no reading; rely on doing, making, drawing, and showing. One simple instruction per task."),
                '8-13': ("ages 8-13 (upper elementary / middle), independent readers",
                         "concrete, hands-on activities with a clear single outcome, finishable in one or two short sessions",
                         "short, plain sentences; a 3rd-5th grade reading level"),
            }
            who, shape, reading = age_profiles.get(age_band, age_profiles['8-13'])
            age_guidance = (
                f"\nAGE-APPROPRIATE REQUIREMENT (IMPORTANT): This learner is {who}.\n"
                f"- Tasks must be {shape}.\n"
                f"- {reading}.\n"
                f"- Favor quick wins and small successes; keep each task to a few simple steps.\n"
                f"- Do NOT use advanced/abstract academic framing. (e.g. for a 6-year-old learning about light, "
                f"'Shine a flashlight through water and see the rainbow' — NOT 'Experiment with light refraction'.)\n"
            )
            difficulty_line = '1. Are small, age-appropriate activities sized for this learner (NOT high-school-level projects)'

        # Challenge-level guidance. The level changes the KIND of task, not the
        # wording: difficulty lives in the success criteria (how demanding and
        # checkable the "done" bar is), never in vaguer/broader descriptions -
        # a vague big task is easy because the student defines "done" themselves.
        # When an age band is present, challenge is expressed relative to that
        # band (a "challenge" task for an 8-year-old is not a high-school task),
        # and the age band's reading-level rules stay in force.
        if challenge_level == 'easier':
            challenge_guidance = (
                "\nCHALLENGE LEVEL: EASIER (IMPORTANT). This student wants more approachable tasks.\n"
                "- Every task is ONE clear outcome, finishable in a single short session.\n"
                "- Favor doing verbs: try, practice, play, show, find.\n"
                "- success_criteria are COMPLETION-based: simple did-it checks. 2-3 per task.\n"
                "- Favor quick wins that build confidence; avoid multi-part deliverables.\n"
                "- Evidence should be light: a photo or a quick note is enough.\n"
                "Example (chess): title \"Play Your First Chess Games\"; success_criteria: "
                "[\"You played 3 full games of chess\", \"You can name how each piece moves\"].\n"
            )
        elif challenge_level == 'challenge':
            age_line = (f"- Keep tasks developmentally appropriate for the {age_band} age band - "
                        f"more ambitious, not older.\n" if age_band else '')
            challenge_guidance = (
                "\nCHALLENGE LEVEL: CHALLENGE (IMPORTANT). This student finds typical tasks too easy.\n"
                "A hard task is NOT a vague or broad task - it is a CONCRETE task with a demanding, "
                "checkable bar. The structure IS the difficulty. Do NOT just add words or steps.\n"
                "- Favor rigor verbs: design, analyze, improve, teach, defend.\n"
                "- EVERY task's success_criteria (3-4 items) must include ALL THREE of:\n"
                "  (a) a measurable target or real-world constraint: a number, rating, size, time limit, "
                "a real audience, or \"it must actually work/fit/hold\";\n"
                "  (b) a quality bar the finished product must meet;\n"
                "  (c) process documentation: show attempts that did not work and what you changed.\n"
                "- Use the topic's real ladder when it has one (chess ratings, print tolerances, "
                "word counts, timed runs, a real audience or judge).\n"
                "- Expect the student to make real decisions and defend them, not follow a recipe.\n"
                "- Multi-session projects with a substantial final product are ideal.\n"
                f"{age_line}"
                "- The words describing the task must STAY simple (reading level rules below still "
                "apply); only the bar gets higher.\n"
                "Example (chess): title \"Fix Your Most Common Chess Mistake\"; success_criteria: "
                "[\"You reviewed 3 of your own games move by move\", "
                "\"You named the mistake you make most often\", "
                "\"You played 5 more games trying to fix that mistake\", "
                "\"You wrote down whether your results improved and what you changed\"].\n"
            )
        else:
            challenge_guidance = (
                "\nCHALLENGE LEVEL: STANDARD.\n"
                "- Favor making verbs: make, build, write, explain, apply.\n"
                "- success_criteria are PRODUCT-based: they check that the student MADE something "
                "concrete. 2-3 per task.\n"
                "Example (chess): title \"Find Your Chess Mistakes\"; success_criteria: "
                "[\"You played 5 games of chess\", "
                "\"You wrote down one mistake from each game and what you would do differently\"].\n"
            )

        return f"""
You are helping a student personalize their learning quest: "{quest_title}".

Quest Description: {quest_description}
{course_context_text}

Student's Selected Approach: {approach_desc}

Student's Interests: {interests_text}

Student's Selected Diploma Subjects: {subjects_text}
{student_context_text}{age_guidance}{challenge_guidance}{priority_subjects_instruction}{vision_text}{exclude_text}{feedback_text}

Generate 6-10 tasks that:
{difficulty_line}
2. At least 50% of tasks should be worth exactly {level_cfg['anchor']} XP
3. Other tasks can range from {level_cfg['range_text']} XP based on complexity
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

SUCCESS CRITERIA (REQUIRED for every task):
Every task must include "success_criteria": 2-4 short statements that define exactly when the task is done. A student (or a reviewer looking at their evidence) must be able to answer yes/no to each one.
- Each criterion is specific and checkable: "You played 5 games", "The printed part fits with no gaps" - never vague: "Understand chess better", "Do your best".
- Keep the description 1-2 sentences; the criteria carry the rigor. Do not repeat the description as a criterion.
- Write criteria at the same simple reading level, addressed to the student ("You...").

CRITICAL TASK WRITING GUIDELINES:
- READING LEVEL: Write for a 5th-6th grade reading level. Use common, everyday words that any student can understand.
  BAD: "Analyze the socioeconomic factors influencing historical migration patterns"
  GOOD: "Make a map showing why people moved to new places in history"
- Title: Use simple action verbs (Make, Build, Create, Write, Draw, Learn, Try, Show, Find, etc.)
  Examples: "Make a Timeline of Events", "Learn Basic Math Facts", "Create a Science Poster"
- Title should be ONE simple idea (5-8 words max) using words a 10-year-old would know
- Description: 1-2 short sentences explaining what to do. Use simple words.
  BAD: "Synthesize research from multiple sources to formulate a comprehensive analysis"
  GOOD: "Look up information from 2-3 websites. Write a short summary of what you learned."
- The TASK can be challenging, but the WORDS describing it should be simple
- Avoid jargon, academic language, and long words when shorter ones work

IMPORTANT: Students should CHOOSE these tasks, not just agree to AI suggestions. Make tasks feel like genuine options, not prescriptive requirements.

Return as valid JSON array:
[
  {{
    "title": "Clear, concise task name (5-8 words)",
    "description": "1-2 brief sentences describing the task",
    "success_criteria": ["Short checkable statement", "Another checkable statement"],
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
        cross_curricular: List[str],
        challenge_level: str = None
    ) -> List[Dict]:
        """Validate and enhance generated tasks.

        challenge_level bounds the XP clamp per level (easier caps at 100,
        standard at 150, challenge at 200) so a level's XP band survives
        validation instead of being flattened to the legacy 25-150 range.
        """
        level_cfg = _challenge_config(challenge_level)

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
                'success_criteria': sanitize_success_criteria(task.get('success_criteria')),
                'pillar': validated_pillar,
                'diploma_subjects': diploma_subjects,
                'xp_value': max(level_cfg['min_xp'],
                                self.ai_service._validate_xp(task.get('xp_value', 100),
                                                             max_xp=level_cfg['max_xp']))
            }
            validated.append(validated_task)

        return validated

    def _enforce_xp_distribution(self, tasks: List[Dict], challenge_level: str = None) -> List[Dict]:
        """Ensure at least 50% of tasks sit at the challenge level's anchor XP
        (Easier: 75, Standard: 100, Challenge: 150)."""

        anchor = _challenge_config(challenge_level)['anchor']

        total_tasks = len(tasks)
        tasks_at_anchor = sum(1 for task in tasks if task['xp_value'] == anchor)

        required_at_anchor = total_tasks // 2

        if tasks_at_anchor < required_at_anchor:
            # Adjust some tasks to the anchor XP
            tasks_to_adjust = required_at_anchor - tasks_at_anchor
            adjusted = 0

            for task in tasks:
                if adjusted >= tasks_to_adjust:
                    break

                if task['xp_value'] != anchor:
                    task['xp_value'] = anchor
                    adjusted += 1

        return tasks

# Global service instance
personalization_service = PersonalizationService()
