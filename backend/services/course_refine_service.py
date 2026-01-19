"""
Course Refinement Service
=========================

AI-powered service for making course-wide refinements through a conversational interface.

Flow:
1. start_session() - User describes change, AI asks clarifying questions
2. process_answers() - User answers questions, AI generates change preview
3. apply_changes() - Apply selected changes to database
4. generate_prompt_update() - Optionally generate prompt modifier for future courses

Usage:
    service = CourseRefineService(user_id)

    # Start a refinement session
    result = service.start_session(course_id, "Make all task descriptions more action-oriented")
    session_id = result['session_id']
    questions = result['questions']

    # User answers clarifying questions
    result = service.process_answers(session_id, answers)
    preview = result['preview']

    # Apply selected changes
    result = service.apply_changes(session_id, selected_change_ids)

    # Optionally generate prompt update
    modifier = service.generate_prompt_update(session_id)
"""

import json
from typing import Dict, List, Optional, Any
from datetime import datetime
from services.base_ai_service import BaseAIService, AIGenerationError
from database import get_supabase_admin_client

from utils.logger import get_logger

logger = get_logger(__name__)


class CourseRefineService(BaseAIService):
    """
    Service for AI-powered course-wide refinements.

    Provides a conversational interface for making bulk changes to course content
    with preview and selective application.
    """

    def __init__(self, user_id: str):
        """
        Initialize with user context.

        Args:
            user_id: The superadmin user making refinements
        """
        super().__init__()
        self.user_id = user_id
        self.admin_client = get_supabase_admin_client()

    # =========================================================================
    # SESSION MANAGEMENT
    # =========================================================================

    def start_session(self, course_id: str, request: str) -> Dict[str, Any]:
        """
        Start a refinement session for a course.

        Analyzes the user's request and generates clarifying questions with
        suggested answers.

        Args:
            course_id: The course to refine
            request: User's description of desired changes

        Returns:
            Dict with:
            - session_id: UUID for this refinement session
            - analysis: AI's understanding of the request
            - questions: List of clarifying questions with suggestions

        Raises:
            AIGenerationError: If analysis fails
            ValueError: If course not found
        """
        from prompts.course_refine import get_analysis_prompt

        # Fetch course content
        course_content = self._fetch_course_content(course_id)
        if not course_content:
            raise ValueError(f"Course not found: {course_id}")

        # Generate analysis prompt
        prompt = get_analysis_prompt(request, course_content)

        logger.info(f"Starting refinement session for course {course_id}")

        # Call AI for analysis
        result = self.generate_json(prompt, max_retries=3)

        if not result or 'questions' not in result:
            raise AIGenerationError("Failed to analyze refinement request")

        # Create session in database
        session_data = {
            'course_id': course_id,
            'user_id': self.user_id,
            'status': 'active',
            'initial_request': request,
            'conversation_history': json.dumps([{
                'role': 'user',
                'content': request,
                'timestamp': datetime.utcnow().isoformat()
            }, {
                'role': 'assistant',
                'content': 'analysis',
                'data': result,
                'timestamp': datetime.utcnow().isoformat()
            }]),
            'proposed_changes': json.dumps([]),
            'applied_changes': json.dumps([])
        }

        insert_result = self.admin_client.table('course_refine_sessions').insert(session_data).execute()

        if not insert_result.data:
            raise Exception("Failed to create refinement session")

        session_id = insert_result.data[0]['id']

        logger.info(f"Created refinement session {session_id} with {len(result.get('questions', []))} questions")

        return {
            'session_id': session_id,
            'analysis': result.get('analysis', {}),
            'questions': result.get('questions', [])
        }

    def process_answers(self, session_id: str, answers: List[Dict]) -> Dict[str, Any]:
        """
        Process user answers to clarifying questions.

        Either generates more questions or produces a change preview.

        Args:
            session_id: The refinement session ID
            answers: List of {question_id, question, answer} dicts

        Returns:
            Dict with either:
            - more_questions: Additional clarifying questions (if needed)
            OR
            - preview: Change preview with before/after diffs

        Raises:
            AIGenerationError: If generation fails
            ValueError: If session not found
        """
        from prompts.course_refine import get_changes_prompt

        # Fetch session
        session = self._get_session(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        # Update conversation history
        history = json.loads(session.get('conversation_history', '[]'))
        history.append({
            'role': 'user',
            'content': 'answers',
            'data': answers,
            'timestamp': datetime.utcnow().isoformat()
        })

        # Fetch course content
        course_content = self._fetch_course_content(session['course_id'])

        # Generate changes
        prompt = get_changes_prompt(
            request=session['initial_request'],
            answers=answers,
            course_content=course_content
        )

        logger.info(f"Generating changes for session {session_id}")

        result = self.generate_json(prompt, max_retries=3)

        if not result or 'changes' not in result:
            raise AIGenerationError("Failed to generate change preview")

        # Add to conversation history
        history.append({
            'role': 'assistant',
            'content': 'changes',
            'data': result,
            'timestamp': datetime.utcnow().isoformat()
        })

        # Update session with changes
        self.admin_client.table('course_refine_sessions').update({
            'conversation_history': json.dumps(history),
            'proposed_changes': json.dumps(result.get('changes', []))
        }).eq('id', session_id).execute()

        logger.info(f"Generated {len(result.get('changes', []))} proposed changes")

        return {
            'preview': {
                'summary': result.get('summary', {}),
                'changes': result.get('changes', [])
            }
        }

    def apply_changes(self, session_id: str, change_ids: List[str]) -> Dict[str, Any]:
        """
        Apply selected changes to the course.

        Args:
            session_id: The refinement session ID
            change_ids: List of change IDs to apply

        Returns:
            Dict with:
            - applied_count: Number of changes applied
            - failed_count: Number of changes that failed
            - errors: List of error messages for failed changes

        Raises:
            ValueError: If session not found
        """
        # Fetch session
        session = self._get_session(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        proposed_changes = json.loads(session.get('proposed_changes', '[]'))
        applied_changes = json.loads(session.get('applied_changes', '[]'))

        # Filter to selected changes
        changes_to_apply = [c for c in proposed_changes if c.get('id') in change_ids]

        logger.info(f"Applying {len(changes_to_apply)} changes for session {session_id}")

        applied_count = 0
        failed_count = 0
        errors = []

        for change in changes_to_apply:
            try:
                self._apply_single_change(change)
                applied_changes.append({
                    'id': change['id'],
                    'applied_at': datetime.utcnow().isoformat()
                })
                applied_count += 1
            except Exception as e:
                failed_count += 1
                errors.append({
                    'change_id': change['id'],
                    'error': str(e)
                })
                logger.error(f"Failed to apply change {change['id']}: {e}")

        # Update session
        self.admin_client.table('course_refine_sessions').update({
            'applied_changes': json.dumps(applied_changes),
            'status': 'completed' if failed_count == 0 else 'active'
        }).eq('id', session_id).execute()

        logger.info(f"Applied {applied_count} changes, {failed_count} failed")

        return {
            'applied_count': applied_count,
            'failed_count': failed_count,
            'errors': errors
        }

    def generate_prompt_update(self, session_id: str) -> Dict[str, Any]:
        """
        Generate a prompt modifier based on the refinement session.

        This creates reusable instructions that can be added to course
        generation prompts to apply similar preferences in the future.

        Args:
            session_id: The refinement session ID

        Returns:
            Dict with:
            - modifier: The prompt modifier text and metadata
            - file_suggestions: Where to add it in the codebase

        Raises:
            AIGenerationError: If generation fails
            ValueError: If session not found
        """
        from prompts.course_refine import get_preference_prompt

        # Fetch session
        session = self._get_session(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        history = json.loads(session.get('conversation_history', '[]'))
        proposed_changes = json.loads(session.get('proposed_changes', '[]'))

        # Extract Q&A from history
        qa_summary = []
        for item in history:
            if item.get('content') == 'answers':
                qa_summary.extend(item.get('data', []))

        # Build changes summary
        changes_summary = {
            'total_changes': len(proposed_changes),
            'projects_affected': len(set(c.get('location', {}).get('project_id') for c in proposed_changes if c.get('location', {}).get('project_id'))),
            'lessons_affected': len(set(c.get('location', {}).get('lesson_id') for c in proposed_changes if c.get('location', {}).get('lesson_id'))),
            'tasks_affected': len([c for c in proposed_changes if 'task' in c.get('type', '')]),
            'description': session['initial_request']
        }

        prompt = get_preference_prompt(
            request=session['initial_request'],
            qa_summary=qa_summary,
            changes_summary=changes_summary
        )

        logger.info(f"Generating prompt update for session {session_id}")

        result = self.generate_json(prompt, max_retries=3)

        if not result or 'modifier' not in result:
            raise AIGenerationError("Failed to generate prompt update")

        # Store the modifier in session
        self.admin_client.table('course_refine_sessions').update({
            'prompt_update_applied': json.dumps(result.get('modifier', {}))
        }).eq('id', session_id).execute()

        logger.info(f"Generated prompt modifier: {result.get('modifier', {}).get('title', 'Unknown')}")

        return result

    def cancel_session(self, session_id: str) -> bool:
        """
        Cancel an active refinement session.

        Args:
            session_id: The session to cancel

        Returns:
            True if cancelled successfully
        """
        result = self.admin_client.table('course_refine_sessions').update({
            'status': 'cancelled'
        }).eq('id', session_id).eq('user_id', self.user_id).execute()

        return len(result.data) > 0 if result.data else False

    def get_session(self, session_id: str) -> Optional[Dict]:
        """
        Get session details for display.

        Args:
            session_id: The session ID

        Returns:
            Session data dict or None
        """
        return self._get_session(session_id)

    # =========================================================================
    # PRIVATE HELPERS
    # =========================================================================

    def _get_session(self, session_id: str) -> Optional[Dict]:
        """Fetch a session from the database."""
        result = self.admin_client.table('course_refine_sessions').select('*').eq('id', session_id).execute()
        return result.data[0] if result.data else None

    def _fetch_course_content(self, course_id: str) -> Optional[Dict]:
        """
        Fetch all course content for AI analysis.

        Returns a structured dict with course, projects, lessons, and tasks.
        """
        # Fetch course
        course_result = self.admin_client.table('courses').select('*').eq('id', course_id).execute()
        if not course_result.data:
            return None

        course = course_result.data[0]

        # Fetch course quests (projects)
        quests_result = self.admin_client.table('course_quests').select(
            'sequence_order, quests(*)'
        ).eq('course_id', course_id).order('sequence_order').execute()

        projects = []
        for cq in quests_result.data or []:
            quest = cq.get('quests', {})
            if not quest:
                continue

            # Fetch lessons for this project
            lessons_result = self.admin_client.table('curriculum_lessons').select('*').eq(
                'quest_id', quest['id']
            ).order('sequence_order').execute()

            lessons = []
            for lesson in lessons_result.data or []:
                # Fetch tasks linked to this lesson
                task_links_result = self.admin_client.table('curriculum_lesson_tasks').select(
                    'user_quest_tasks(*)'
                ).eq('lesson_id', lesson['id']).execute()

                tasks = [tl.get('user_quest_tasks', {}) for tl in task_links_result.data or [] if tl.get('user_quest_tasks')]

                lessons.append({
                    'id': lesson['id'],
                    'title': lesson.get('title', ''),
                    'description': lesson.get('description', ''),
                    'sequence_order': lesson.get('sequence_order', 0),
                    'content': lesson.get('content', {}),
                    'tasks': tasks
                })

            projects.append({
                'id': quest['id'],
                'title': quest.get('title', ''),
                'description': quest.get('description', ''),
                'big_idea': quest.get('big_idea', ''),
                'sequence_order': cq.get('sequence_order', 0),
                'lessons': lessons
            })

        return {
            'course': {
                'id': course['id'],
                'title': course.get('title', ''),
                'description': course.get('description', '')
            },
            'projects': projects
        }

    def _apply_single_change(self, change: Dict) -> None:
        """
        Apply a single change to the database.

        Args:
            change: The change dict with type, location, field, before, after

        Raises:
            Exception: If the change cannot be applied
        """
        change_type = change.get('type', '')
        location = change.get('location', {})
        field = change.get('field', '')
        new_value = change.get('after', '')

        # Determine table and record ID based on change type
        if change_type.startswith('project_'):
            table = 'quests'
            record_id = location.get('project_id')
            db_field = field
            if change_type == 'project_big_idea':
                db_field = 'big_idea'
        elif change_type.startswith('lesson_'):
            table = 'curriculum_lessons'
            record_id = location.get('lesson_id')
            if change_type == 'lesson_step':
                # For step changes, we need to update the content JSONB
                self._apply_lesson_step_change(location, change)
                return
            db_field = field
        elif change_type.startswith('task_'):
            table = 'user_quest_tasks'
            record_id = location.get('task_id')
            db_field = field
        elif change_type.startswith('scaffolding_'):
            # Scaffolding is stored in lesson content
            self._apply_scaffolding_change(location, change)
            return
        else:
            raise Exception(f"Unknown change type: {change_type}")

        if not record_id:
            raise Exception(f"Missing record ID for change type: {change_type}")

        # Apply the update
        result = self.admin_client.table(table).update({
            db_field: new_value
        }).eq('id', record_id).execute()

        if not result.data:
            raise Exception(f"Failed to update {table}.{db_field} for {record_id}")

        logger.debug(f"Applied {change_type} change to {table}.{record_id}")

    def _apply_lesson_step_change(self, location: Dict, change: Dict) -> None:
        """Apply a change to a specific step within a lesson's content JSONB."""
        lesson_id = location.get('lesson_id')
        step_id = location.get('step_id')
        field = change.get('field', 'content')
        new_value = change.get('after', '')

        # Fetch current lesson content
        result = self.admin_client.table('curriculum_lessons').select('content').eq('id', lesson_id).execute()
        if not result.data:
            raise Exception(f"Lesson not found: {lesson_id}")

        content = result.data[0].get('content', {})
        steps = content.get('steps', [])

        # Find and update the step
        updated = False
        for step in steps:
            if step.get('id') == step_id:
                step[field] = new_value
                updated = True
                break

        if not updated:
            raise Exception(f"Step not found: {step_id} in lesson {lesson_id}")

        # Save updated content
        content['steps'] = steps
        self.admin_client.table('curriculum_lessons').update({
            'content': content
        }).eq('id', lesson_id).execute()

        logger.debug(f"Applied step change to {lesson_id}.{step_id}")

    def _apply_scaffolding_change(self, location: Dict, change: Dict) -> None:
        """Apply a change to scaffolding suggestions in lesson content."""
        lesson_id = location.get('lesson_id')
        change_type = change.get('type', '')
        new_value = change.get('after', '')

        # Determine which scaffolding field
        scaffold_key = 'younger' if 'younger' in change_type else 'older'

        # Fetch current lesson content
        result = self.admin_client.table('curriculum_lessons').select('content').eq('id', lesson_id).execute()
        if not result.data:
            raise Exception(f"Lesson not found: {lesson_id}")

        content = result.data[0].get('content', {})
        scaffolding = content.get('scaffolding', {})
        scaffolding[scaffold_key] = new_value
        content['scaffolding'] = scaffolding

        # Save updated content
        self.admin_client.table('curriculum_lessons').update({
            'content': content
        }).eq('id', lesson_id).execute()

        logger.debug(f"Applied scaffolding change to {lesson_id}")
