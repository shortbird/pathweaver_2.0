"""
Course Plan Mode Service
========================

Iterative course outline refinement through AI conversation.
Teachers can "mold" course outlines through natural language prompts.

Flow:
1. start_session() - User describes course idea, AI generates initial outline
2. refine_outline() - User requests changes, AI updates outline
3. (repeat step 2 as needed)
4. approve_and_generate() - Lock outline, trigger full course generation
5. get_generation_progress() - Poll generation status

Usage:
    service = CoursePlanModeService(user_id, organization_id)

    # Start with initial prompt
    session = service.start_session("Create a math course for a student who loves piano")

    # Refine through conversation
    result = service.refine_outline(session_id, "Make project 2 about geometry in sound waves")

    # When satisfied, generate the full course
    job = service.approve_and_generate(session_id)
"""

import uuid
import json
from datetime import datetime
from typing import Dict, List, Optional, Any
from services.base_ai_service import BaseAIService, AIGenerationError, AIParsingError
from database import get_supabase_admin_client

from utils.logger import get_logger

logger = get_logger(__name__)


class CoursePlanModeService(BaseAIService):
    """
    Service for iterative AI-assisted course design.

    Manages plan sessions with conversation history and outline versioning.
    """

    def __init__(self, user_id: str, organization_id: str = None):
        """
        Initialize with user context.

        Args:
            user_id: The user creating the course
            organization_id: The organization for the course (None for platform-level)
        """
        super().__init__()
        self.user_id = user_id
        self.organization_id = organization_id
        self.admin_client = get_supabase_admin_client()

    # =========================================================================
    # SESSION MANAGEMENT
    # =========================================================================

    def start_session(self, initial_prompt: str) -> Dict[str, Any]:
        """
        Create new plan session and generate initial outline.

        Args:
            initial_prompt: User's course description/idea

        Returns:
            Dict with session info, initial outline, and welcome message

        Raises:
            AIGenerationError: If outline generation fails
        """
        from prompts.plan_mode import (
            get_initial_outline_prompt,
            WELCOME_MESSAGE,
            INITIAL_SUGGESTIONS
        )

        logger.info(f"Starting plan session for user {self.user_id}")

        # Generate initial outline
        prompt = get_initial_outline_prompt(initial_prompt)
        outline = self.generate_json(prompt, max_retries=3)

        if not outline or 'title' not in outline:
            raise AIGenerationError("Failed to generate valid course outline")

        # Ensure outline has required structure
        outline = self._normalize_outline(outline)

        # Add version tracking
        outline['version'] = 1
        outline['changes'] = [{
            'version': 1,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'description': 'Initial outline created',
            'affected_ids': [p.get('id') for p in outline.get('projects', [])]
        }]

        # Create conversation with user's initial message and AI response
        conversation = [
            {
                'id': f'msg_{uuid.uuid4().hex[:8]}',
                'role': 'user',
                'content': initial_prompt,
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            },
            {
                'id': f'msg_{uuid.uuid4().hex[:8]}',
                'role': 'assistant',
                'content': WELCOME_MESSAGE,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'changes_applied': [p.get('id') for p in outline.get('projects', [])],
                'suggestions': INITIAL_SUGGESTIONS
            }
        ]

        # Create session in database
        session_data = {
            'user_id': self.user_id,
            'organization_id': self.organization_id,
            'title': outline.get('title', 'Untitled Course'),
            'status': 'drafting',
            'current_outline': outline,
            'outline_history': [outline],  # First version
            'conversation': conversation
        }

        result = self.admin_client.table('course_plan_sessions').insert(session_data).execute()

        if not result.data:
            raise Exception("Failed to create plan session")

        session = result.data[0]

        logger.info(f"Created plan session {session['id']} with title: {outline.get('title')}")

        return {
            'session': {
                'id': session['id'],
                'status': session['status'],
                'title': session['title'],
                'created_at': session['created_at']
            },
            'outline': outline,
            'message': WELCOME_MESSAGE,
            'suggestions': INITIAL_SUGGESTIONS
        }

    def refine_outline(self, session_id: str, user_message: str) -> Dict[str, Any]:
        """
        Process refinement request and update outline.

        Args:
            session_id: The plan session ID
            user_message: User's refinement request

        Returns:
            Dict with updated outline, changes, message, and suggestions

        Raises:
            ValueError: If session not found or not in drafting status
            AIGenerationError: If refinement fails
        """
        from prompts.plan_mode import get_refinement_prompt

        # Load session
        session = self._get_session(session_id)

        if session['status'] != 'drafting':
            raise ValueError(f"Session is not in drafting status: {session['status']}")

        current_outline = session['current_outline']
        conversation = session.get('conversation', [])

        # Build refinement prompt
        prompt = get_refinement_prompt(current_outline, conversation, user_message)

        logger.info(f"Refining outline for session {session_id}")

        # Generate refined outline
        result = self.generate_json(prompt, max_retries=3)

        if not result or 'updated_outline' not in result:
            raise AIGenerationError("Failed to generate refined outline")

        updated_outline = self._normalize_outline(result['updated_outline'])

        # Increment version
        new_version = current_outline.get('version', 1) + 1
        updated_outline['version'] = new_version

        # Add change record
        changes = result.get('changes', [])
        updated_outline['changes'] = current_outline.get('changes', []) + [{
            'version': new_version,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'description': result.get('message', 'Outline updated'),
            'affected_ids': [c.get('affected_ids', []) for c in changes]
        }]

        # Update conversation
        new_user_msg = {
            'id': f'msg_{uuid.uuid4().hex[:8]}',
            'role': 'user',
            'content': user_message,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }

        new_assistant_msg = {
            'id': f'msg_{uuid.uuid4().hex[:8]}',
            'role': 'assistant',
            'content': result.get('message', 'I\'ve updated the outline.'),
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'changes_applied': [c.get('id') for c in changes],
            'suggestions': result.get('suggestions', [])
        }

        conversation.append(new_user_msg)
        conversation.append(new_assistant_msg)

        # Update session in database
        outline_history = session.get('outline_history', [])
        outline_history.append(updated_outline)

        update_data = {
            'current_outline': updated_outline,
            'outline_history': outline_history,
            'conversation': conversation,
            'title': updated_outline.get('title', session['title'])
        }

        self.admin_client.table('course_plan_sessions').update(update_data).eq('id', session_id).execute()

        logger.info(f"Refined outline for session {session_id} to version {new_version}")

        return {
            'outline': updated_outline,
            'changes': changes,
            'message': result.get('message', 'I\'ve updated the outline.'),
            'suggestions': result.get('suggestions', [])
        }

    def get_session(self, session_id: str) -> Dict[str, Any]:
        """
        Retrieve session state for UI.

        Args:
            session_id: The plan session ID

        Returns:
            Dict with session info, outline, and conversation

        Raises:
            ValueError: If session not found
        """
        session = self._get_session(session_id)

        return {
            'session': {
                'id': session['id'],
                'status': session['status'],
                'title': session['title'],
                'created_at': session['created_at'],
                'updated_at': session['updated_at'],
                'generation_job_id': session.get('generation_job_id'),
                'created_course_id': session.get('created_course_id')
            },
            'outline': session['current_outline'],
            'conversation': session.get('conversation', [])
        }

    def list_sessions(self, status: str = None) -> List[Dict[str, Any]]:
        """
        List user's plan sessions.

        Args:
            status: Optional filter by status

        Returns:
            List of session summaries
        """
        query = self.admin_client.table('course_plan_sessions').select(
            'id, title, status, created_at, updated_at'
        ).eq('user_id', self.user_id)

        if self.organization_id:
            query = query.eq('organization_id', self.organization_id)

        if status:
            query = query.eq('status', status)

        result = query.order('updated_at', desc=True).limit(50).execute()

        return result.data or []

    def update_session_status(self, session_id: str, status: str) -> Dict[str, Any]:
        """
        Update session status (e.g., abandon a draft).

        Args:
            session_id: The plan session ID
            status: New status (drafting, abandoned)

        Returns:
            Updated session summary
        """
        valid_statuses = ['drafting', 'abandoned']
        if status not in valid_statuses:
            raise ValueError(f"Invalid status. Must be one of: {valid_statuses}")

        result = self.admin_client.table('course_plan_sessions').update({
            'status': status
        }).eq('id', session_id).eq('user_id', self.user_id).execute()

        if not result.data:
            raise ValueError("Session not found or access denied")

        return result.data[0]

    # =========================================================================
    # COURSE GENERATION
    # =========================================================================

    def approve_and_generate(self, session_id: str) -> Dict[str, Any]:
        """
        Lock outline and trigger full course generation.

        Creates:
        - Course record
        - Quest records for each project
        - Lesson records for each lesson in the outline

        Args:
            session_id: The plan session ID

        Returns:
            Dict with course_id and status

        Raises:
            ValueError: If session not found or not in drafting status
        """
        from services.course_generation_service import CourseGenerationService

        session = self._get_session(session_id)

        if session['status'] != 'drafting':
            raise ValueError(f"Session is not in drafting status: {session['status']}")

        outline = session['current_outline']

        # Mark session as approved
        self.admin_client.table('course_plan_sessions').update({
            'status': 'approved'
        }).eq('id', session_id).execute()

        logger.info(f"Approved outline for session {session_id}, starting generation")

        # Create the course using CourseGenerationService
        generation_service = CourseGenerationService(self.user_id, self.organization_id)

        # Save draft course from outline (returns course_id as string)
        course_id = generation_service.save_draft_course(outline)

        # Get the quests that were created for this course (in order)
        course_quests = self.admin_client.table('course_quests').select(
            'quest_id, sequence_order'
        ).eq('course_id', course_id).order('sequence_order').execute()

        # Create lessons for each quest based on the outline
        projects = outline.get('projects', [])
        lessons_created = 0

        for i, cq in enumerate(course_quests.data or []):
            quest_id = cq['quest_id']

            # Get the corresponding project from outline
            if i < len(projects):
                project = projects[i]
                project_lessons = project.get('lessons', [])

                for j, lesson in enumerate(project_lessons):
                    lesson_data = {
                        'quest_id': quest_id,
                        'title': lesson.get('title', f'Lesson {j+1}'),
                        'description': lesson.get('description', ''),
                        'content': {'steps': []},  # Empty steps to be filled in Course Builder
                        'sequence_order': j,
                        'is_published': False,
                        'is_required': True,
                        'xp_threshold': 100,
                        'created_by': self.user_id,
                        'organization_id': self.organization_id
                    }

                    self.admin_client.table('curriculum_lessons').insert(lesson_data).execute()
                    lessons_created += 1

        logger.info(f"Created {lessons_created} lessons for course {course_id}")

        # Update session with course reference and mark as completed
        self.admin_client.table('course_plan_sessions').update({
            'status': 'completed',
            'created_course_id': course_id
        }).eq('id', session_id).execute()

        logger.info(f"Created course {course_id} from session {session_id}")

        return {
            'course_id': course_id,
            'status': 'completed',
            'message': f'Course created with {lessons_created} lessons. Opening Course Builder...'
        }

    def get_generation_progress(self, session_id: str) -> Dict[str, Any]:
        """
        Check generation job progress.

        Args:
            session_id: The plan session ID

        Returns:
            Dict with status, progress percentage, and current step
        """
        session = self._get_session(session_id)

        status = session['status']
        course_id = session.get('created_course_id')

        if status == 'drafting':
            return {
                'status': 'drafting',
                'progress': 0,
                'current_step': 'Waiting for approval'
            }

        if status == 'approved':
            return {
                'status': 'approved',
                'progress': 5,
                'current_step': 'Preparing to generate course...'
            }

        if status == 'generating':
            # For now, just return that the course was created
            # The actual lesson/task generation happens in Course Builder
            return {
                'status': 'generating',
                'progress': 100,
                'current_step': 'Draft course created',
                'course_id': course_id
            }

        if status == 'completed':
            return {
                'status': 'completed',
                'progress': 100,
                'current_step': 'Course generation complete',
                'course_id': course_id
            }

        return {
            'status': status,
            'progress': 0,
            'current_step': 'Unknown status'
        }

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _get_session(self, session_id: str) -> Dict[str, Any]:
        """
        Load session from database with access control.

        Args:
            session_id: The plan session ID

        Returns:
            Session data

        Raises:
            ValueError: If session not found or access denied
        """
        result = self.admin_client.table('course_plan_sessions').select('*').eq('id', session_id).execute()

        if not result.data:
            raise ValueError("Session not found")

        session = result.data[0]

        # Check access (owner or same org for org admins)
        if session['user_id'] != self.user_id:
            # Check if user is superadmin or org admin in same org
            user_result = self.admin_client.table('users').select(
                'role, org_role, organization_id'
            ).eq('id', self.user_id).execute()

            if not user_result.data:
                raise ValueError("Access denied")

            user = user_result.data[0]
            is_superadmin = user.get('role') == 'superadmin'
            is_org_admin = (
                user.get('role') == 'org_managed' and
                user.get('org_role') == 'org_admin' and
                user.get('organization_id') == session.get('organization_id')
            )

            if not is_superadmin and not is_org_admin:
                raise ValueError("Access denied")

        return session

    def _normalize_outline(self, outline: Dict) -> Dict:
        """
        Ensure outline has all required fields with proper structure.

        Args:
            outline: Raw outline from AI

        Returns:
            Normalized outline with guaranteed structure
        """
        # Ensure projects have IDs
        projects = outline.get('projects', [])
        for i, project in enumerate(projects):
            if 'id' not in project:
                project['id'] = f'proj_{uuid.uuid4().hex[:8]}'

            # Ensure lessons have IDs
            lessons = project.get('lessons', [])
            for j, lesson in enumerate(lessons):
                if 'id' not in lesson:
                    lesson['id'] = f'les_{project["id"]}_{j+1}'

        # Ensure target_audience exists
        if 'target_audience' not in outline:
            outline['target_audience'] = {
                'age_range': '10-18',
                'interests': [],
                'learning_style': 'hands-on',
                'context': ''
            }

        return outline
