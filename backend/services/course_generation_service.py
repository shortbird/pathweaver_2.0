"""
Course Generation Service
=========================

Multi-stage AI course generation service for creating hands-on, action-oriented courses.

Stages:
1. generate_outline() - Topic -> 3 course outline alternatives
2. generate_lessons() - For each project, generate lessons
3. generate_tasks() - For each lesson, generate task suggestions
4. finalize_course() - Publish the draft course

Usage:
    service = CourseGenerationService(user_id, organization_id)

    # Stage 1: Get outline alternatives
    outlines = service.generate_outline("Board Games")

    # User selects one, save draft
    course_id = service.save_draft_course(selected_outline)

    # Stage 2: Generate lessons for all projects
    lessons = service.generate_lessons(course_id)

    # Stage 3: Generate tasks
    tasks = service.generate_tasks(course_id)

    # Stage 4: Publish
    service.finalize_course(course_id)
"""

import uuid
import random
import string
from typing import Dict, List, Optional, Any
from services.base_ai_service import BaseAIService, AIGenerationError
from database import get_supabase_admin_client

from utils.logger import get_logger

logger = get_logger(__name__)


class CourseGenerationService(BaseAIService):
    """
    Service for multi-stage AI course generation.

    Designed for creating hands-on tutorial courses with:
    - Action-oriented titles and outcomes
    - Just-in-time teaching lessons
    - Hands-on task suggestions
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
        self.organization_id = organization_id  # None = platform-level content
        self.admin_client = get_supabase_admin_client()

    # =========================================================================
    # STAGE 1: OUTLINE GENERATION
    # =========================================================================

    def generate_outline(self, topic: str) -> Dict[str, Any]:
        """
        Generate 3 course outline alternatives for a topic.

        Args:
            topic: The course topic/subject (e.g., "Board Games", "Cooking")

        Returns:
            Dict with 'alternatives' list, each containing:
            - title: Action-oriented course title
            - description: 2-3 sentence description
            - projects: List of 4-6 project outlines
            - categories: List of category tags

        Raises:
            AIGenerationError: If generation fails
        """
        from prompts.course_generation import get_outline_prompt

        prompt = get_outline_prompt(topic)

        logger.info(f"Generating course outline for topic: {topic}")

        result = self.generate_json(prompt, max_retries=3)

        if not result or 'alternatives' not in result:
            raise AIGenerationError("Failed to generate valid course outlines")

        alternatives = result['alternatives']

        # Validate we got 3 alternatives
        if len(alternatives) < 2:
            raise AIGenerationError(f"Expected 3 alternatives, got {len(alternatives)}")

        logger.info(f"Generated {len(alternatives)} course alternatives for '{topic}'")

        return result

    def regenerate_outline(self, topic: str, previous_outlines: List[Dict] = None) -> Dict[str, Any]:
        """
        Regenerate course outline alternatives, avoiding previous options.

        Args:
            topic: The course topic
            previous_outlines: List of previously generated outlines to avoid

        Returns:
            Same format as generate_outline()
        """
        from prompts.course_generation import OUTLINE_GENERATION_PROMPT

        prompt = OUTLINE_GENERATION_PROMPT.format(topic=topic)

        if previous_outlines:
            previous_titles = [o.get('title', '') for o in previous_outlines]
            prompt += f"\n\nIMPORTANT: Generate DIFFERENT alternatives than these previous options:\n"
            for title in previous_titles:
                prompt += f"- {title}\n"
            prompt += "\nProvide fresh, creative alternatives."

        result = self.generate_json(prompt, max_retries=3)

        if not result or 'alternatives' not in result:
            raise AIGenerationError("Failed to regenerate course outlines")

        return result

    # =========================================================================
    # DRAFT COURSE CREATION
    # =========================================================================

    def save_draft_course(self, outline: Dict[str, Any]) -> str:
        """
        Save a selected outline as a draft course.

        Creates:
        - Course record (status='draft')
        - Quest records for each project
        - course_quests junction records

        Args:
            outline: The selected outline from generate_outline()

        Returns:
            course_id: The ID of the created draft course
        """
        # Create course
        course_data = {
            'title': outline.get('title', 'Untitled Course'),
            'description': outline.get('description', ''),
            'status': 'draft',
            'visibility': 'organization',
            'navigation_mode': 'sequential',
            'created_by': self.user_id,
            'organization_id': self.organization_id
        }

        course_result = self.admin_client.table('courses').insert(course_data).execute()

        if not course_result.data:
            raise Exception("Failed to create draft course")

        course_id = course_result.data[0]['id']
        logger.info(f"Created draft course: {course_id}")

        # Create projects (quests)
        # Projects must work as standalone quests AND as course components
        projects = outline.get('projects', [])
        course_categories = outline.get('categories', [])

        for i, project in enumerate(projects):
            # Use project-specific fields, fallback to course-level if not provided
            project_topic_primary = project.get('topic_primary')
            if not project_topic_primary:
                project_topic_primary = self._get_primary_topic(course_categories)

            project_topics = project.get('topics')
            if not project_topics:
                project_topics = course_categories

            # big_idea should be project-specific, fallback to description
            big_idea = project.get('big_idea', project.get('description', ''))

            quest_data = {
                'title': project.get('title', f'Project {i+1}'),
                'description': project.get('description', ''),
                'big_idea': big_idea,
                'quest_type': 'optio',
                'is_active': False,
                'is_public': False,
                'created_by': self.user_id,
                'organization_id': self.organization_id,
                'topic_primary': project_topic_primary,
                'topics': project_topics
            }

            quest_result = self.admin_client.table('quests').insert(quest_data).execute()

            if not quest_result.data:
                logger.error(f"Failed to create quest for project {i+1}")
                continue

            quest_id = quest_result.data[0]['id']

            # Link to course
            self.admin_client.table('course_quests').insert({
                'course_id': course_id,
                'quest_id': quest_id,
                'sequence_order': project.get('order', i),  # 0-based indexing
                'is_required': True,
                'is_published': False,
                'xp_threshold': 500
            }).execute()

        logger.info(f"Created {len(projects)} projects for course {course_id}")

        return course_id

    def _get_primary_topic(self, categories: List[str]) -> str:
        """Map categories to topic_primary values."""
        category_map = {
            'digital creation': 'Creative',
            'art and design': 'Creative',
            'music and sound': 'Creative',
            'storytelling and media': 'Creative',
            'science and discovery': 'Science',
            'outdoor/nature': 'Nature',
            'building and construction': 'Building',
            'repair and making': 'Building',
            'money and business': 'Business',
            'food and kitchen': 'Food',
            'games and play': 'Games',
            'community and people': 'Personal'
        }

        for cat in categories:
            if cat.lower() in category_map:
                return category_map[cat.lower()]

        return 'Academic'  # Default

    # =========================================================================
    # STAGE 2: LESSON GENERATION
    # =========================================================================

    def generate_lessons(self, course_id: str) -> Dict[str, Any]:
        """
        Generate lessons for all projects in a course.

        Args:
            course_id: The draft course ID

        Returns:
            Dict with project_id keys and lesson lists as values
        """
        from prompts.course_generation import get_lessons_prompt

        # Get course and projects
        course = self.admin_client.table('courses').select('title').eq('id', course_id).execute()
        if not course.data:
            raise Exception(f"Course {course_id} not found")

        course_title = course.data[0]['title']

        # Get projects
        projects_result = self.admin_client.table('course_quests').select(
            'quest_id, sequence_order, quests(id, title, description)'
        ).eq('course_id', course_id).order('sequence_order').execute()

        if not projects_result.data:
            raise Exception(f"No projects found for course {course_id}")

        all_lessons = {}

        for project_data in projects_result.data:
            quest = project_data.get('quests', {})
            quest_id = quest.get('id')
            project_title = quest.get('title', 'Untitled Project')
            project_description = quest.get('description', '')

            # Check if lessons already exist for this quest (avoid duplicate inserts on retry)
            existing_lessons = self.admin_client.table('curriculum_lessons')\
                .select('id')\
                .eq('quest_id', quest_id)\
                .execute()

            if existing_lessons.data:
                logger.info(f"Lessons already exist for {project_title}, skipping generation")
                # Load existing lessons to return them
                all_lessons[quest_id] = existing_lessons.data
                continue

            logger.info(f"Generating lessons for project: {project_title}")

            prompt = get_lessons_prompt(course_title, project_title, project_description)

            result = self.generate_json(prompt, max_retries=3)

            if not result or 'lessons' not in result:
                logger.error(f"Failed to generate lessons for {project_title}")
                continue

            lessons = result['lessons']

            # Save lessons to database
            for j, lesson in enumerate(lessons):
                # Store scaffolding in the content JSONB for modal display
                scaffolding = lesson.get('scaffolding', {})
                lesson_content = {
                    'version': 2,
                    'steps': lesson.get('steps', []),
                    'scaffolding': scaffolding if scaffolding else None
                }

                self.admin_client.table('curriculum_lessons').insert({
                    'quest_id': quest_id,
                    'title': lesson.get('title', f'Lesson {j+1}'),
                    'description': lesson.get('description', ''),
                    'content': lesson_content,
                    'sequence_order': lesson.get('order', j),  # 0-based indexing
                    'is_published': False,
                    'is_required': True,
                    'organization_id': self.organization_id,
                    'created_by': self.user_id
                }).execute()

            all_lessons[quest_id] = lessons
            logger.info(f"Created {len(lessons)} lessons for {project_title}")

        return all_lessons

    def generate_lessons_for_project(self, course_id: str, quest_id: str) -> List[Dict]:
        """
        Generate lessons for a single project.

        Args:
            course_id: The course ID
            quest_id: The specific project/quest ID

        Returns:
            List of generated lessons
        """
        from prompts.course_generation import get_lessons_prompt

        # Get course title
        course = self.admin_client.table('courses').select('title').eq('id', course_id).execute()
        course_title = course.data[0]['title'] if course.data else 'Untitled Course'

        # Get project details
        quest = self.admin_client.table('quests').select('title, description').eq('id', quest_id).execute()
        if not quest.data:
            raise Exception(f"Quest {quest_id} not found")

        project_title = quest.data[0]['title']
        project_description = quest.data[0]['description']

        prompt = get_lessons_prompt(course_title, project_title, project_description)

        result = self.generate_json(prompt, max_retries=3)

        if not result or 'lessons' not in result:
            raise AIGenerationError(f"Failed to generate lessons for {project_title}")

        return result['lessons']

    def regenerate_lesson(
        self,
        course_id: str,
        quest_id: str,
        lesson_id: str,
        previous_content: Dict = None
    ) -> Dict[str, Any]:
        """
        Regenerate alternatives for a single lesson.

        Args:
            course_id: The course ID
            quest_id: The project/quest ID
            lesson_id: The lesson to regenerate
            previous_content: The current lesson content to avoid

        Returns:
            Dict with 'alternatives' list of lesson options
        """
        from prompts.course_generation import get_regenerate_lessons_prompt

        # Get context
        course = self.admin_client.table('courses').select('title').eq('id', course_id).execute()
        course_title = course.data[0]['title'] if course.data else 'Untitled Course'

        quest = self.admin_client.table('quests').select('title, description').eq('id', quest_id).execute()
        project_title = quest.data[0]['title'] if quest.data else 'Project'
        project_description = quest.data[0]['description'] if quest.data else ''

        previous_lessons = [previous_content] if previous_content else []

        prompt = get_regenerate_lessons_prompt(
            course_title, project_title, project_description, previous_lessons
        )

        result = self.generate_json(prompt, max_retries=3)

        if not result or 'alternatives' not in result:
            raise AIGenerationError("Failed to generate lesson alternatives")

        return result

    def save_lesson(self, quest_id: str, lesson: Dict, order: int = None) -> str:
        """
        Save a lesson to the database.

        Args:
            quest_id: The project/quest ID
            lesson: Lesson data from AI generation
            order: Optional sequence order (auto-calculated if not provided)

        Returns:
            lesson_id: The created lesson ID
        """
        # Auto-calculate order if not provided
        if order is None:
            existing = self.admin_client.table('curriculum_lessons').select(
                'sequence_order'
            ).eq('quest_id', quest_id).order('sequence_order', desc=True).limit(1).execute()

            order = (existing.data[0]['sequence_order'] + 1) if existing.data else 1

        # Store scaffolding in the content JSONB for modal display
        scaffolding = lesson.get('scaffolding', {})
        lesson_content = {
            'version': 2,
            'steps': lesson.get('steps', []),
            'scaffolding': scaffolding if scaffolding else None
        }

        result = self.admin_client.table('curriculum_lessons').insert({
            'quest_id': quest_id,
            'title': lesson.get('title', 'Untitled Lesson'),
            'description': lesson.get('description', ''),
            'content': lesson_content,
            'sequence_order': order,
            'is_published': False,
            'is_required': True,
            'organization_id': self.organization_id,
            'created_by': self.user_id
        }).execute()

        if not result.data:
            raise Exception("Failed to save lesson")

        return result.data[0]['id']

    # =========================================================================
    # STAGE 3: TASK GENERATION
    # =========================================================================

    def generate_tasks(self, course_id: str) -> Dict[str, Any]:
        """
        Generate task suggestions for all lessons in a course.

        Args:
            course_id: The course ID

        Returns:
            Dict with lesson_id keys and task lists as values
        """
        from prompts.course_generation import get_tasks_prompt

        # Get course title
        course = self.admin_client.table('courses').select('title').eq('id', course_id).execute()
        course_title = course.data[0]['title'] if course.data else 'Untitled Course'

        # Get all projects
        projects_result = self.admin_client.table('course_quests').select(
            'quest_id, quests(id, title)'
        ).eq('course_id', course_id).execute()

        if not projects_result.data:
            raise Exception(f"No projects found for course {course_id}")

        all_tasks = {}

        for project_data in projects_result.data:
            quest = project_data.get('quests', {})
            quest_id = quest.get('id')
            project_title = quest.get('title', 'Project')

            # Get lessons for this project
            lessons_result = self.admin_client.table('curriculum_lessons').select(
                'id, title, content'
            ).eq('quest_id', quest_id).order('sequence_order').execute()

            if not lessons_result.data:
                continue

            for lesson in lessons_result.data:
                lesson_id = lesson['id']
                lesson_title = lesson['title']

                # Check if tasks already exist for this lesson (avoid duplicate inserts on retry)
                existing_tasks = self.admin_client.table('curriculum_lesson_tasks')\
                    .select('task_id')\
                    .eq('lesson_id', lesson_id)\
                    .execute()

                if existing_tasks.data:
                    logger.info(f"Tasks already exist for {lesson_title}, skipping generation")
                    all_tasks[lesson_id] = existing_tasks.data
                    continue

                # Summarize lesson content for the prompt
                lesson_summary = self._summarize_lesson_content(lesson.get('content', {}))

                logger.info(f"Generating tasks for lesson: {lesson_title}")

                prompt = get_tasks_prompt(course_title, project_title, lesson_title, lesson_summary)

                result = self.generate_json(prompt, max_retries=3)

                if not result or 'tasks' not in result:
                    logger.error(f"Failed to generate tasks for {lesson_title}")
                    continue

                tasks = result['tasks']

                # Save tasks to database
                for task in tasks:
                    task_id = self._save_task(quest_id, lesson_id, task)

                all_tasks[lesson_id] = tasks
                logger.info(f"Created {len(tasks)} tasks for {lesson_title}")

        return all_tasks

    def generate_tasks_for_lesson(
        self,
        course_id: str,
        quest_id: str,
        lesson_id: str
    ) -> List[Dict]:
        """
        Generate task suggestions for a single lesson.

        Args:
            course_id: The course ID
            quest_id: The project/quest ID
            lesson_id: The lesson ID

        Returns:
            List of generated tasks
        """
        from prompts.course_generation import get_tasks_prompt

        # Get context
        course = self.admin_client.table('courses').select('title').eq('id', course_id).execute()
        course_title = course.data[0]['title'] if course.data else 'Untitled Course'

        quest = self.admin_client.table('quests').select('title').eq('id', quest_id).execute()
        project_title = quest.data[0]['title'] if quest.data else 'Project'

        lesson = self.admin_client.table('curriculum_lessons').select(
            'title, content'
        ).eq('id', lesson_id).execute()

        if not lesson.data:
            raise Exception(f"Lesson {lesson_id} not found")

        lesson_title = lesson.data[0]['title']
        lesson_summary = self._summarize_lesson_content(lesson.data[0].get('content', {}))

        prompt = get_tasks_prompt(course_title, project_title, lesson_title, lesson_summary)

        result = self.generate_json(prompt, max_retries=3)

        if not result or 'tasks' not in result:
            raise AIGenerationError(f"Failed to generate tasks for {lesson_title}")

        return result['tasks']

    def regenerate_tasks(
        self,
        course_id: str,
        quest_id: str,
        lesson_id: str,
        previous_tasks: List[Dict] = None
    ) -> Dict[str, Any]:
        """
        Regenerate task alternatives for a lesson.

        Args:
            course_id: The course ID
            quest_id: The project/quest ID
            lesson_id: The lesson ID
            previous_tasks: Current tasks to avoid duplicating

        Returns:
            Dict with 'alternatives' list of task sets
        """
        from prompts.course_generation import get_regenerate_tasks_prompt

        # Get context
        course = self.admin_client.table('courses').select('title').eq('id', course_id).execute()
        course_title = course.data[0]['title'] if course.data else 'Untitled Course'

        quest = self.admin_client.table('quests').select('title').eq('id', quest_id).execute()
        project_title = quest.data[0]['title'] if quest.data else 'Project'

        lesson = self.admin_client.table('curriculum_lessons').select(
            'title, content'
        ).eq('id', lesson_id).execute()

        lesson_title = lesson.data[0]['title'] if lesson.data else 'Lesson'
        lesson_summary = self._summarize_lesson_content(lesson.data[0].get('content', {})) if lesson.data else ''

        prompt = get_regenerate_tasks_prompt(
            course_title, project_title, lesson_title, lesson_summary, previous_tasks or []
        )

        result = self.generate_json(prompt, max_retries=3)

        if not result or 'alternatives' not in result:
            raise AIGenerationError("Failed to generate task alternatives")

        return result

    def _summarize_lesson_content(self, content: Dict) -> str:
        """Extract a text summary from lesson content for AI context."""
        if not content:
            return ""

        steps = content.get('steps', [])
        if not steps:
            return ""

        # Extract text from first few steps
        summaries = []
        for step in steps[:5]:  # Limit to first 5 steps
            title = step.get('title', '')
            text = step.get('content', '')
            # Strip HTML tags
            import re
            text = re.sub(r'<[^>]+>', ' ', text)
            text = ' '.join(text.split())[:200]  # Limit length
            if title:
                summaries.append(f"{title}: {text}")

        return "\n".join(summaries)

    def _get_or_create_user_quest(self, quest_id: str) -> str:
        """
        Get or create a user_quest enrollment for task creation.

        Args:
            quest_id: The quest ID

        Returns:
            user_quest_id: The enrollment ID
        """
        # Check if user already has an enrollment
        enrollment = self.admin_client.table('user_quests')\
            .select('id')\
            .eq('user_id', self.user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if enrollment.data:
            logger.debug(f"Found existing enrollment for user {self.user_id} in quest {quest_id}")
            return enrollment.data[0]['id']

        # Create new enrollment for course creator
        # Valid status values: 'available', 'picked_up', 'set_down'
        logger.debug(f"Creating enrollment for user {self.user_id} in quest {quest_id}")
        new_enrollment = self.admin_client.table('user_quests').insert({
            'user_id': self.user_id,
            'quest_id': quest_id,
            'status': 'picked_up'  # Course creator is actively working on it
        }).execute()

        if not new_enrollment.data:
            raise Exception(f"Failed to create user_quest enrollment for quest {quest_id}")

        return new_enrollment.data[0]['id']

    def _save_task(self, quest_id: str, lesson_id: str, task: Dict) -> str:
        """
        Save a task to the database and link to lesson.

        Args:
            quest_id: The project/quest ID
            lesson_id: The lesson ID to link to
            task: Task data from AI generation

        Returns:
            task_id: The created task ID
        """
        # Get or create user_quest enrollment (required for user_quest_tasks)
        user_quest_id = self._get_or_create_user_quest(quest_id)

        # Get current max order_index for this quest
        existing_tasks = self.admin_client.table('user_quest_tasks')\
            .select('order_index')\
            .eq('quest_id', quest_id)\
            .order('order_index', desc=True)\
            .limit(1)\
            .execute()
        max_order = existing_tasks.data[0]['order_index'] if existing_tasks.data else 0

        # Map AI pillar values to database valid values
        # DB valid: stem, wellness, communication, civics, art
        pillar_mapping = {
            'creativity': 'art',
            'knowledge': 'stem',
            'social': 'communication',
            'physical': 'wellness'
        }
        pillar = task.get('pillar', 'art')
        if pillar in pillar_mapping:
            pillar = pillar_mapping[pillar]
        valid_pillars = ['stem', 'wellness', 'communication', 'civics', 'art']
        if pillar not in valid_pillars:
            pillar = 'art'

        # Create the task in user_quest_tasks
        task_data = {
            'user_id': self.user_id,
            'quest_id': quest_id,
            'user_quest_id': user_quest_id,  # Required field
            'title': task.get('title', 'Untitled Task'),
            'description': task.get('description', ''),
            'pillar': pillar,
            'xp_value': task.get('xp_value', 100),
            'order_index': max_order + 1,
            'is_required': False,
            'is_manual': False,  # Generated by AI
            'approval_status': 'approved'  # Auto-approved as per requirements
        }

        logger.debug(f"Creating task: {task_data['title']} for quest {quest_id}")
        task_result = self.admin_client.table('user_quest_tasks').insert(task_data).execute()

        if not task_result.data:
            raise Exception("Failed to create task")

        task_id = task_result.data[0]['id']

        # Link task to lesson via curriculum_lesson_tasks
        self.admin_client.table('curriculum_lesson_tasks').insert({
            'lesson_id': lesson_id,
            'task_id': task_id,
            'quest_id': quest_id,
            'organization_id': self.organization_id
        }).execute()

        logger.debug(f"Created and linked task {task_id} to lesson {lesson_id}")
        return task_id

    def save_task(self, quest_id: str, lesson_id: str, task: Dict) -> str:
        """Public wrapper for _save_task."""
        return self._save_task(quest_id, lesson_id, task)

    # =========================================================================
    # STAGE 4: FINALIZATION
    # =========================================================================

    def finalize_course(self, course_id: str) -> Dict[str, Any]:
        """
        Finalize a draft course by publishing it.

        Args:
            course_id: The course ID

        Returns:
            Dict with success status and course details
        """
        # Update course status
        self.admin_client.table('courses').update({
            'status': 'published'
        }).eq('id', course_id).execute()

        # Activate all quests
        projects_result = self.admin_client.table('course_quests').select(
            'quest_id'
        ).eq('course_id', course_id).execute()

        quest_ids = [p['quest_id'] for p in projects_result.data]

        for quest_id in quest_ids:
            self.admin_client.table('quests').update({
                'is_active': True
            }).eq('id', quest_id).execute()

            # Publish course_quest junction
            self.admin_client.table('course_quests').update({
                'is_published': True
            }).eq('course_id', course_id).eq('quest_id', quest_id).execute()

            # Publish lessons
            self.admin_client.table('curriculum_lessons').update({
                'is_published': True
            }).eq('quest_id', quest_id).execute()

        # Get course details for response
        course = self.admin_client.table('courses').select('*').eq('id', course_id).execute()

        logger.info(f"Published course {course_id} with {len(quest_ids)} projects")

        return {
            'success': True,
            'course_id': course_id,
            'projects_count': len(quest_ids),
            'course': course.data[0] if course.data else None
        }

    # =========================================================================
    # STATE MANAGEMENT
    # =========================================================================

    def get_course_generation_state(self, course_id: str) -> Dict[str, Any]:
        """
        Get the current state of a course in generation.

        Returns all course data including projects, lessons, and tasks.
        """
        # Get course
        course = self.admin_client.table('courses').select('*').eq('id', course_id).execute()

        if not course.data:
            raise Exception(f"Course {course_id} not found")

        # Get projects with lessons (include all quest fields for standalone context)
        projects_result = self.admin_client.table('course_quests').select(
            'quest_id, sequence_order, quests(id, title, description, big_idea, topic_primary, topics)'
        ).eq('course_id', course_id).order('sequence_order').execute()

        projects = []
        for p in projects_result.data:
            quest = p.get('quests', {})
            quest_id = quest.get('id')

            # Get lessons for this project
            lessons_result = self.admin_client.table('curriculum_lessons').select(
                'id, title, description, content, sequence_order'
            ).eq('quest_id', quest_id).order('sequence_order').execute()

            lessons = []
            for lesson in lessons_result.data:
                lesson_id = lesson['id']

                # Get tasks for this lesson
                tasks_result = self.admin_client.table('curriculum_lesson_tasks').select(
                    'task_id, user_quest_tasks(id, title, description, pillar, xp_value)'
                ).eq('lesson_id', lesson_id).execute()

                tasks = [t.get('user_quest_tasks', {}) for t in tasks_result.data if t.get('user_quest_tasks')]

                lessons.append({
                    **lesson,
                    'tasks': tasks
                })

            projects.append({
                'id': quest_id,
                'title': quest.get('title'),
                'description': quest.get('description'),
                'big_idea': quest.get('big_idea'),
                'topic_primary': quest.get('topic_primary'),
                'topics': quest.get('topics'),
                'sequence_order': p.get('sequence_order'),
                'lessons': lessons
            })

        # Determine current stage based on what's been generated
        stage = 1  # Default: outline
        if projects:
            has_lessons = any(len(p.get('lessons', [])) > 0 for p in projects)
            has_tasks = any(
                any(len(l.get('tasks', [])) > 0 for l in p.get('lessons', []))
                for p in projects
            )

            if has_tasks:
                stage = 4  # Review
            elif has_lessons:
                stage = 3  # Tasks
            else:
                stage = 2  # Lessons

        return {
            'course': course.data[0],
            'projects': projects,
            'current_stage': stage
        }

    # =========================================================================
    # UTILITY METHODS
    # =========================================================================

    def delete_draft_course(self, course_id: str) -> bool:
        """
        Delete a draft course and all associated data.

        Args:
            course_id: The course ID

        Returns:
            True if successful
        """
        # Verify course is still draft
        course = self.admin_client.table('courses').select('status').eq('id', course_id).execute()

        if not course.data:
            raise Exception(f"Course {course_id} not found")

        if course.data[0]['status'] != 'draft':
            raise Exception("Cannot delete a published course")

        # Get quest IDs
        projects = self.admin_client.table('course_quests').select('quest_id').eq('course_id', course_id).execute()
        quest_ids = [p['quest_id'] for p in projects.data]

        # Delete in order: tasks, lesson_tasks, lessons, course_quests, quests, course
        for quest_id in quest_ids:
            # Delete tasks linked to lessons
            lessons = self.admin_client.table('curriculum_lessons').select('id').eq('quest_id', quest_id).execute()
            lesson_ids = [l['id'] for l in lessons.data]

            for lesson_id in lesson_ids:
                # Get task IDs from junction
                task_links = self.admin_client.table('curriculum_lesson_tasks').select('task_id').eq('lesson_id', lesson_id).execute()
                task_ids = [t['task_id'] for t in task_links.data]

                # Delete junction records
                self.admin_client.table('curriculum_lesson_tasks').delete().eq('lesson_id', lesson_id).execute()

                # Delete tasks
                for task_id in task_ids:
                    self.admin_client.table('user_quest_tasks').delete().eq('id', task_id).execute()

            # Delete lessons
            self.admin_client.table('curriculum_lessons').delete().eq('quest_id', quest_id).execute()

        # Delete course_quests
        self.admin_client.table('course_quests').delete().eq('course_id', course_id).execute()

        # Delete quests
        for quest_id in quest_ids:
            self.admin_client.table('quests').delete().eq('id', quest_id).execute()

        # Delete course
        self.admin_client.table('courses').delete().eq('id', course_id).execute()

        logger.info(f"Deleted draft course {course_id}")

        return True
