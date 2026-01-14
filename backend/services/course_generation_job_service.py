"""
Course Generation Job Service
=============================

Handles background processing of AI course generation jobs.
Creates lessons and tasks for courses that have been queued after outline approval.

Usage:
    service = CourseGenerationJobService()

    # Create a job
    job_id = service.create_job(course_id, user_id, org_id, auto_publish=True)

    # Process a job (called by scheduler)
    success = service.process_job(job_id)

    # Get job status
    status = service.get_job_status(job_id)

    # Get user's jobs
    jobs = service.get_user_jobs(user_id)
"""

import traceback
from datetime import datetime
from typing import Dict, List, Any, Optional
from database import get_supabase_admin_client
from services.course_generation_service import CourseGenerationService
from services.base_ai_service import AIGenerationError

from utils.logger import get_logger

logger = get_logger(__name__)


class CourseGenerationJobService:
    """
    Service for managing background course generation jobs.

    Handles:
    - Job creation and status tracking
    - Lesson and task generation with progress updates
    - Detailed logging for user visibility
    - Error handling and retry logic
    """

    # Status constants
    STATUS_PENDING = 'pending'
    STATUS_GENERATING_LESSONS = 'generating_lessons'
    STATUS_GENERATING_TASKS = 'generating_tasks'
    STATUS_FINALIZING = 'finalizing'
    STATUS_COMPLETED = 'completed'
    STATUS_FAILED = 'failed'
    STATUS_CANCELLED = 'cancelled'

    def __init__(self):
        self.admin_client = get_supabase_admin_client()

    # =========================================================================
    # JOB CREATION
    # =========================================================================

    def create_job(
        self,
        course_id: str,
        user_id: str,
        organization_id: Optional[str] = None,
        auto_publish: bool = False
    ) -> str:
        """
        Create a new course generation job.

        Args:
            course_id: The draft course ID to generate content for
            user_id: The user creating the job
            organization_id: Optional organization ID
            auto_publish: Whether to auto-publish when complete

        Returns:
            job_id: The created job ID

        Raises:
            Exception: If course not found or already has a pending job
        """
        # Verify course exists and is draft
        course = self.admin_client.table('courses').select(
            'id, title, status'
        ).eq('id', course_id).execute()

        if not course.data:
            raise Exception(f"Course {course_id} not found")

        if course.data[0]['status'] != 'draft':
            raise Exception("Can only queue draft courses")

        # Check for existing pending/running job for this course
        existing = self.admin_client.table('course_generation_jobs').select('id, status').eq(
            'course_id', course_id
        ).in_('status', [
            self.STATUS_PENDING,
            self.STATUS_GENERATING_LESSONS,
            self.STATUS_GENERATING_TASKS,
            self.STATUS_FINALIZING
        ]).execute()

        if existing.data:
            raise Exception("Course already has a pending or running generation job")

        # Count projects for progress tracking
        projects = self.admin_client.table('course_quests').select(
            'quest_id'
        ).eq('course_id', course_id).execute()

        items_total = len(projects.data) if projects.data else 0

        # Create the job
        job_data = {
            'course_id': course_id,
            'user_id': user_id,
            'organization_id': organization_id,
            'status': self.STATUS_PENDING,
            'items_total': items_total,
            'auto_publish': auto_publish,
            'logs': [{
                'timestamp': datetime.utcnow().isoformat(),
                'level': 'info',
                'message': f'Job created for course: {course.data[0]["title"]}'
            }]
        }

        result = self.admin_client.table('course_generation_jobs').insert(job_data).execute()

        if not result.data:
            raise Exception("Failed to create generation job")

        job_id = result.data[0]['id']
        logger.info(f"Created course generation job {job_id} for course {course_id}")

        return job_id

    # =========================================================================
    # JOB PROCESSING
    # =========================================================================

    def process_job(self, job_id: str) -> bool:
        """
        Process a course generation job.

        Generates lessons for all projects, then tasks for all lessons.
        Updates progress and logs throughout.

        Args:
            job_id: The job ID to process

        Returns:
            True if successful, False if failed
        """
        # Get job details
        job = self.admin_client.table('course_generation_jobs').select('*').eq('id', job_id).execute()

        if not job.data:
            logger.error(f"Job {job_id} not found")
            return False

        job_data = job.data[0]
        course_id = job_data['course_id']
        user_id = job_data['user_id']
        organization_id = job_data.get('organization_id')
        auto_publish = job_data.get('auto_publish', False)

        # Mark as started
        self._update_job(job_id, {
            'status': self.STATUS_GENERATING_LESSONS,
            'started_at': datetime.utcnow().isoformat(),
            'current_step': 'lessons'
        })
        self._add_log(job_id, 'Starting course generation', 'info')

        try:
            # Initialize the course generation service
            service = CourseGenerationService(user_id, organization_id)

            # Get projects
            projects = self._get_projects(course_id)
            total_projects = len(projects)

            self._add_log(job_id, f'Found {total_projects} projects to process', 'info')
            self._update_job(job_id, {'items_total': total_projects})

            # =========================================================
            # STAGE 1: Generate lessons for each project
            # =========================================================

            for i, project in enumerate(projects):
                quest_id = project['quest_id']
                project_title = project.get('quests', {}).get('title', f'Project {i+1}')

                self._update_job(job_id, {
                    'current_item': project_title,
                    'items_completed': i
                })
                self._add_log(job_id, f'Generating lessons for project {i+1}/{total_projects}: {project_title}', 'info')

                try:
                    # Generate lessons for this project
                    lessons = service.generate_lessons_for_project(course_id, quest_id)

                    # Save lessons to database
                    for j, lesson in enumerate(lessons):
                        service.save_lesson(quest_id, lesson, j)

                    self._add_log(job_id, f'Generated {len(lessons)} lessons for: {project_title}', 'success')

                except Exception as e:
                    self._add_log(job_id, f'Failed to generate lessons for {project_title}: {str(e)}', 'warning')
                    # Continue with other projects even if one fails

            self._update_job(job_id, {'items_completed': total_projects})
            self._add_log(job_id, 'Lesson generation complete', 'success')

            # =========================================================
            # STAGE 2: Generate tasks for each lesson
            # =========================================================

            self._update_job(job_id, {
                'status': self.STATUS_GENERATING_TASKS,
                'current_step': 'tasks',
                'items_completed': 0
            })
            self._add_log(job_id, 'Starting task generation', 'info')

            # Get all lessons
            all_lessons = self._get_lessons(course_id)
            total_lessons = len(all_lessons)

            self._update_job(job_id, {'items_total': total_lessons})
            self._add_log(job_id, f'Found {total_lessons} lessons to process', 'info')

            for i, lesson in enumerate(all_lessons):
                lesson_id = lesson['id']
                lesson_title = lesson['title']
                quest_id = lesson['quest_id']

                self._update_job(job_id, {
                    'current_item': lesson_title,
                    'items_completed': i
                })
                self._add_log(job_id, f'Generating tasks for lesson {i+1}/{total_lessons}: {lesson_title}', 'info')

                try:
                    # Generate tasks for this lesson
                    tasks = service.generate_tasks_for_lesson(course_id, quest_id, lesson_id)

                    # Save tasks to database
                    for task in tasks:
                        service.save_task(quest_id, lesson_id, task)

                    self._add_log(job_id, f'Generated {len(tasks)} tasks for: {lesson_title}', 'success')

                except Exception as e:
                    self._add_log(job_id, f'Failed to generate tasks for {lesson_title}: {str(e)}', 'warning')
                    # Continue with other lessons even if one fails

            self._update_job(job_id, {'items_completed': total_lessons})
            self._add_log(job_id, 'Task generation complete', 'success')

            # =========================================================
            # STAGE 3: Finalize (if auto_publish)
            # =========================================================

            if auto_publish:
                self._update_job(job_id, {
                    'status': self.STATUS_FINALIZING,
                    'current_step': 'finalizing',
                    'current_item': 'Publishing course'
                })
                self._add_log(job_id, 'Auto-publishing course', 'info')

                service.finalize_course(course_id)
                self._add_log(job_id, 'Course published successfully', 'success')

            # =========================================================
            # COMPLETE
            # =========================================================

            # Get final stats
            stats = self._get_course_stats(course_id)

            self._update_job(job_id, {
                'status': self.STATUS_COMPLETED,
                'completed_at': datetime.utcnow().isoformat(),
                'current_step': None,
                'current_item': None
            })
            self._add_log(
                job_id,
                f'Course generation complete. {stats["projects"]} projects, {stats["lessons"]} lessons, {stats["tasks"]} tasks',
                'success'
            )

            logger.info(f"Job {job_id} completed successfully")
            return True

        except Exception as e:
            error_msg = str(e)
            logger.error(f"Job {job_id} failed: {error_msg}\n{traceback.format_exc()}")

            self._update_job(job_id, {
                'status': self.STATUS_FAILED,
                'completed_at': datetime.utcnow().isoformat(),
                'error_message': error_msg
            })
            self._add_log(job_id, f'Job failed: {error_msg}', 'error')

            return False

    # =========================================================================
    # STATUS AND RETRIEVAL
    # =========================================================================

    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the current status of a job.

        Args:
            job_id: The job ID

        Returns:
            Dict with job status, progress, and logs
        """
        result = self.admin_client.table('course_generation_jobs').select(
            '*, courses(id, title, status)'
        ).eq('id', job_id).execute()

        if not result.data:
            return None

        job = result.data[0]

        return {
            'id': job['id'],
            'course_id': job['course_id'],
            'course_title': job.get('courses', {}).get('title', 'Unknown'),
            'course_status': job.get('courses', {}).get('status', 'draft'),
            'status': job['status'],
            'current_step': job.get('current_step'),
            'current_item': job.get('current_item'),
            'items_completed': job.get('items_completed', 0),
            'items_total': job.get('items_total', 0),
            'auto_publish': job.get('auto_publish', False),
            'error_message': job.get('error_message'),
            'created_at': job['created_at'],
            'started_at': job.get('started_at'),
            'completed_at': job.get('completed_at'),
            'logs': job.get('logs', [])
        }

    def get_user_jobs(
        self,
        user_id: str,
        status: Optional[str] = None,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Get all jobs for a user.

        Args:
            user_id: The user ID
            status: Optional status filter ('active' for pending/running, or specific status)
            limit: Maximum number of jobs to return

        Returns:
            List of job summaries
        """
        query = self.admin_client.table('course_generation_jobs').select(
            '*, courses(id, title, status)'
        ).eq('user_id', user_id)

        if status == 'active':
            query = query.in_('status', [
                self.STATUS_PENDING,
                self.STATUS_GENERATING_LESSONS,
                self.STATUS_GENERATING_TASKS,
                self.STATUS_FINALIZING
            ])
        elif status:
            query = query.eq('status', status)

        result = query.order('created_at', desc=True).limit(limit).execute()

        jobs = []
        for job in result.data:
            jobs.append({
                'id': job['id'],
                'course_id': job['course_id'],
                'course_title': job.get('courses', {}).get('title', 'Unknown'),
                'course_status': job.get('courses', {}).get('status', 'draft'),
                'status': job['status'],
                'current_step': job.get('current_step'),
                'current_item': job.get('current_item'),
                'items_completed': job.get('items_completed', 0),
                'items_total': job.get('items_total', 0),
                'auto_publish': job.get('auto_publish', False),
                'error_message': job.get('error_message'),
                'created_at': job['created_at'],
                'started_at': job.get('started_at'),
                'completed_at': job.get('completed_at')
            })

        return jobs

    # =========================================================================
    # JOB CONTROL
    # =========================================================================

    def cancel_job(self, job_id: str, user_id: str) -> bool:
        """
        Cancel a pending or running job.

        Args:
            job_id: The job ID
            user_id: The user requesting cancellation (must own the job)

        Returns:
            True if cancelled successfully
        """
        # Verify ownership and status
        job = self.admin_client.table('course_generation_jobs').select(
            'id, user_id, status'
        ).eq('id', job_id).execute()

        if not job.data:
            raise Exception("Job not found")

        if job.data[0]['user_id'] != user_id:
            raise Exception("Not authorized to cancel this job")

        if job.data[0]['status'] in [self.STATUS_COMPLETED, self.STATUS_FAILED, self.STATUS_CANCELLED]:
            raise Exception("Job is not running")

        self._update_job(job_id, {
            'status': self.STATUS_CANCELLED,
            'completed_at': datetime.utcnow().isoformat()
        })
        self._add_log(job_id, 'Job cancelled by user', 'warning')

        logger.info(f"Job {job_id} cancelled by user {user_id}")
        return True

    def retry_job(self, job_id: str, user_id: str) -> str:
        """
        Retry a failed job by creating a new one.

        Args:
            job_id: The failed job ID
            user_id: The user requesting retry

        Returns:
            new_job_id: The new job ID
        """
        # Get the failed job
        job = self.admin_client.table('course_generation_jobs').select(
            'course_id, user_id, organization_id, auto_publish, status'
        ).eq('id', job_id).execute()

        if not job.data:
            raise Exception("Job not found")

        if job.data[0]['user_id'] != user_id:
            raise Exception("Not authorized to retry this job")

        if job.data[0]['status'] != self.STATUS_FAILED:
            raise Exception("Can only retry failed jobs")

        job_data = job.data[0]

        # Create a new job
        new_job_id = self.create_job(
            job_data['course_id'],
            user_id,
            job_data.get('organization_id'),
            job_data.get('auto_publish', False)
        )

        self._add_log(new_job_id, f'Retry of previous job {job_id}', 'info')

        logger.info(f"Created retry job {new_job_id} for failed job {job_id}")
        return new_job_id

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _update_job(self, job_id: str, updates: Dict[str, Any]) -> None:
        """Update job fields."""
        self.admin_client.table('course_generation_jobs').update(updates).eq('id', job_id).execute()

    def _add_log(self, job_id: str, message: str, level: str = 'info') -> None:
        """
        Add a log entry to the job.

        Args:
            job_id: The job ID
            message: Log message
            level: Log level (info, success, warning, error)
        """
        log_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': level,
            'message': message
        }

        # Get current logs and append
        job = self.admin_client.table('course_generation_jobs').select('logs').eq('id', job_id).execute()

        if job.data:
            current_logs = job.data[0].get('logs', [])
            current_logs.append(log_entry)

            self.admin_client.table('course_generation_jobs').update({
                'logs': current_logs
            }).eq('id', job_id).execute()

    def _get_projects(self, course_id: str) -> List[Dict[str, Any]]:
        """Get all projects for a course."""
        result = self.admin_client.table('course_quests').select(
            'quest_id, sequence_order, quests(id, title, description)'
        ).eq('course_id', course_id).order('sequence_order').execute()

        return result.data if result.data else []

    def _get_lessons(self, course_id: str) -> List[Dict[str, Any]]:
        """Get all lessons for a course."""
        # Get all quest IDs for the course
        projects = self.admin_client.table('course_quests').select('quest_id').eq('course_id', course_id).execute()
        quest_ids = [p['quest_id'] for p in projects.data]

        if not quest_ids:
            return []

        # Get lessons for all quests
        result = self.admin_client.table('curriculum_lessons').select(
            'id, quest_id, title, sequence_order'
        ).in_('quest_id', quest_ids).order('sequence_order').execute()

        return result.data if result.data else []

    def _get_course_stats(self, course_id: str) -> Dict[str, int]:
        """Get counts of projects, lessons, and tasks for a course."""
        # Get projects
        projects = self.admin_client.table('course_quests').select('quest_id').eq('course_id', course_id).execute()
        quest_ids = [p['quest_id'] for p in projects.data]
        project_count = len(quest_ids)

        if not quest_ids:
            return {'projects': 0, 'lessons': 0, 'tasks': 0}

        # Get lessons
        lessons = self.admin_client.table('curriculum_lessons').select('id').in_('quest_id', quest_ids).execute()
        lesson_ids = [l['id'] for l in lessons.data]
        lesson_count = len(lesson_ids)

        if not lesson_ids:
            return {'projects': project_count, 'lessons': 0, 'tasks': 0}

        # Get tasks
        tasks = self.admin_client.table('curriculum_lesson_tasks').select('task_id').in_('lesson_id', lesson_ids).execute()
        task_count = len(tasks.data) if tasks.data else 0

        return {
            'projects': project_count,
            'lessons': lesson_count,
            'tasks': task_count
        }

    # =========================================================================
    # SCHEDULER INTEGRATION
    # =========================================================================

    def get_pending_jobs(self, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Get pending jobs ready to process.

        Used by the scheduler to find jobs to execute.

        Args:
            limit: Maximum number of jobs to return

        Returns:
            List of pending job records
        """
        result = self.admin_client.table('course_generation_jobs').select('*').eq(
            'status', self.STATUS_PENDING
        ).order('created_at').limit(limit).execute()

        return result.data if result.data else []

    def run_next_job(self) -> Optional[Dict[str, Any]]:
        """
        Get and process the next pending job.

        Returns:
            Result dict with job_id and status, or None if no jobs pending
        """
        pending = self.get_pending_jobs(limit=1)

        if not pending:
            return None

        job = pending[0]
        job_id = job['id']

        success = self.process_job(job_id)

        return {
            'job_id': job_id,
            'status': 'success' if success else 'failed'
        }
