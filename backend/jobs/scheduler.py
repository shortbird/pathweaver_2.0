"""
Job Scheduler
Orchestrates automated content generation and quality monitoring tasks.
"""

from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from database import get_supabase_admin_client
import json
import traceback

from utils.logger import get_logger

logger = get_logger(__name__)


class JobScheduler:
    """Manages scheduled jobs for AI content pipeline"""

    # Job types
    JOB_TYPE_CONTENT_GENERATION = 'content_generation'
    JOB_TYPE_QUALITY_MONITOR = 'quality_monitor'
    JOB_TYPE_METRICS_UPDATE = 'metrics_update'
    JOB_TYPE_MONTHLY_REPORT = 'monthly_report'
    JOB_TYPE_COURSE_GENERATION = 'course_generation'
    JOB_TYPE_DAILY_ADVISOR_SUMMARY = 'daily_advisor_summary'

    # Job status
    STATUS_PENDING = 'pending'
    STATUS_RUNNING = 'running'
    STATUS_COMPLETED = 'completed'
    STATUS_FAILED = 'failed'

    @staticmethod
    def schedule_job(
        job_type: str,
        job_data: Dict[str, Any],
        scheduled_for: Optional[datetime] = None,
        priority: int = 5
    ) -> str:
        """
        Schedule a new job for execution.

        Args:
            job_type: Type of job to run
            job_data: Job configuration and parameters
            scheduled_for: When to run the job (default: now)
            priority: Job priority 1-10 (10 = highest)

        Returns:
            Job ID
        """
        supabase = get_supabase_admin_client()

        if scheduled_for is None:
            scheduled_for = datetime.utcnow()

        job_insert = {
            'job_type': job_type,
            'job_data': job_data,
            'status': JobScheduler.STATUS_PENDING,
            'priority': priority,
            'scheduled_for': scheduled_for.isoformat(),
            'created_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('scheduled_jobs').insert(job_insert).execute()

        if not result.data:
            raise Exception("Failed to schedule job")

        return result.data[0]['id']

    @staticmethod
    def get_pending_jobs(limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get pending jobs ready to execute.

        Args:
            limit: Maximum number of jobs to return

        Returns:
            List of pending job records
        """
        supabase = get_supabase_admin_client()

        now = datetime.utcnow().isoformat()

        jobs = supabase.table('scheduled_jobs')\
            .select('*')\
            .eq('status', JobScheduler.STATUS_PENDING)\
            .lte('scheduled_for', now)\
            .order('priority', desc=True)\
            .order('scheduled_for')\
            .limit(limit)\
            .execute()

        return jobs.data if jobs.data else []

    @staticmethod
    def start_job(job_id: str) -> bool:
        """
        Mark a job as running.

        Args:
            job_id: Job UUID

        Returns:
            True if successful
        """
        supabase = get_supabase_admin_client()

        result = supabase.table('scheduled_jobs')\
            .update({
                'status': JobScheduler.STATUS_RUNNING,
                'started_at': datetime.utcnow().isoformat()
            })\
            .eq('id', job_id)\
            .execute()

        return bool(result.data)

    @staticmethod
    def complete_job(job_id: str, result_data: Optional[Dict[str, Any]] = None) -> bool:
        """
        Mark a job as completed.

        Args:
            job_id: Job UUID
            result_data: Optional result data from job execution

        Returns:
            True if successful
        """
        supabase = get_supabase_admin_client()

        update_data = {
            'status': JobScheduler.STATUS_COMPLETED,
            'completed_at': datetime.utcnow().isoformat()
        }

        if result_data:
            update_data['result_data'] = result_data

        result = supabase.table('scheduled_jobs')\
            .update(update_data)\
            .eq('id', job_id)\
            .execute()

        return bool(result.data)

    @staticmethod
    def fail_job(job_id: str, error_message: str) -> bool:
        """
        Mark a job as failed.

        Args:
            job_id: Job UUID
            error_message: Error details

        Returns:
            True if successful
        """
        supabase = get_supabase_admin_client()

        result = supabase.table('scheduled_jobs')\
            .update({
                'status': JobScheduler.STATUS_FAILED,
                'completed_at': datetime.utcnow().isoformat(),
                'error_message': error_message
            })\
            .eq('id', job_id)\
            .execute()

        return bool(result.data)

    @staticmethod
    def execute_job(job: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a single job.

        Args:
            job: Job record from database

        Returns:
            Dict containing execution results
        """
        job_id = job['id']
        job_type = job['job_type']
        job_data = job.get('job_data', {})

        try:
            # Mark job as running
            JobScheduler.start_job(job_id)

            # Execute based on job type
            if job_type == JobScheduler.JOB_TYPE_CONTENT_GENERATION:
                # DEPRECATED: ContentGenerationWorker removed - incompatible with personalized quest system
                raise ValueError(f"Job type {job_type} is deprecated and no longer supported")

            elif job_type == JobScheduler.JOB_TYPE_QUALITY_MONITOR:
                from jobs.quality_monitor import QualityMonitor
                result = QualityMonitor.execute(job_data)

            elif job_type == JobScheduler.JOB_TYPE_METRICS_UPDATE:
                from services.ai_quest_maintenance_service import AIQuestMaintenanceService
                count = AIQuestMaintenanceService.update_ai_content_metrics()
                result = {'metrics_updated': count}

            elif job_type == JobScheduler.JOB_TYPE_MONTHLY_REPORT:
                from services.ai_quest_maintenance_service import AIQuestMaintenanceService
                report = AIQuestMaintenanceService.generate_monthly_report()
                result = report

            elif job_type == JobScheduler.JOB_TYPE_COURSE_GENERATION:
                from services.course_generation_job_service import CourseGenerationJobService
                job_service = CourseGenerationJobService()
                gen_job_id = job_data.get('job_id')
                if not gen_job_id:
                    raise ValueError("course_generation job requires job_id in job_data")
                success = job_service.process_job(gen_job_id)
                result = {'job_id': gen_job_id, 'success': success}

            elif job_type == JobScheduler.JOB_TYPE_DAILY_ADVISOR_SUMMARY:
                from jobs.daily_advisor_summary import DailyAdvisorSummaryJob
                result = DailyAdvisorSummaryJob.execute(job_data)

            else:
                raise ValueError(f"Unknown job type: {job_type}")

            # Mark job as completed
            JobScheduler.complete_job(job_id, result)

            return {
                'job_id': job_id,
                'status': 'success',
                'result': result
            }

        except Exception as e:
            error_message = f"{str(e)}\n{traceback.format_exc()}"
            JobScheduler.fail_job(job_id, error_message)

            return {
                'job_id': job_id,
                'status': 'failed',
                'error': str(e)
            }

    @staticmethod
    def run_pending_jobs(max_jobs: int = 10) -> Dict[str, Any]:
        """
        Execute all pending jobs up to max_jobs limit.

        Args:
            max_jobs: Maximum number of jobs to execute

        Returns:
            Dict containing execution summary
        """
        pending_jobs = JobScheduler.get_pending_jobs(limit=max_jobs)

        results = []
        for job in pending_jobs:
            result = JobScheduler.execute_job(job)
            results.append(result)

        successful = len([r for r in results if r['status'] == 'success'])
        failed = len([r for r in results if r['status'] == 'failed'])

        return {
            'total_jobs': len(results),
            'successful': successful,
            'failed': failed,
            'results': results,
            'executed_at': datetime.utcnow().isoformat()
        }

    @staticmethod
    def schedule_recurring_jobs():
        """
        Schedule recurring jobs (call this daily via cron or scheduler).
        """
        supabase = get_supabase_admin_client()

        # Daily quality monitoring
        JobScheduler.schedule_job(
            job_type=JobScheduler.JOB_TYPE_QUALITY_MONITOR,
            job_data={
                'check_type': 'daily_audit',
                'include_all_quests': True
            },
            priority=8
        )

        # Daily metrics update
        JobScheduler.schedule_job(
            job_type=JobScheduler.JOB_TYPE_METRICS_UPDATE,
            job_data={},
            priority=7
        )

        # Monthly report (only on first day of month)
        today = datetime.utcnow()
        if today.day == 1:
            JobScheduler.schedule_job(
                job_type=JobScheduler.JOB_TYPE_MONTHLY_REPORT,
                job_data={},
                priority=9
            )

        # Weekly content generation for underserved pillars
        if today.weekday() == 0:  # Monday
            JobScheduler.schedule_job(
                job_type=JobScheduler.JOB_TYPE_CONTENT_GENERATION,
                job_data={
                    'generation_type': 'balance_pillars',
                    'target_count': 5
                },
                priority=6
            )

        # Daily advisor summary at 5 AM - recap of previous day's activity
        # Scheduled for next 5 AM UTC
        next_5am = datetime.utcnow().replace(hour=5, minute=0, second=0, microsecond=0)
        if datetime.utcnow().hour >= 5:
            next_5am += timedelta(days=1)

        JobScheduler.schedule_job(
            job_type=JobScheduler.JOB_TYPE_DAILY_ADVISOR_SUMMARY,
            job_data={},
            scheduled_for=next_5am,
            priority=7
        )

    @staticmethod
    def get_job_history(
        job_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get job execution history.

        Args:
            job_type: Filter by job type
            status: Filter by status
            limit: Maximum results

        Returns:
            List of job records
        """
        supabase = get_supabase_admin_client()

        query = supabase.table('scheduled_jobs').select('*')

        if job_type:
            query = query.eq('job_type', job_type)

        if status:
            query = query.eq('status', status)

        jobs = query.order('created_at', desc=True).limit(limit).execute()

        return jobs.data if jobs.data else []

    @staticmethod
    def cleanup_old_jobs(days_old: int = 30) -> int:
        """
        Delete completed/failed jobs older than specified days.

        Args:
            days_old: Delete jobs older than this many days

        Returns:
            Number of jobs deleted
        """
        supabase = get_supabase_admin_client()

        cutoff_date = (datetime.utcnow() - timedelta(days=days_old)).isoformat()

        # Delete old completed jobs
        result = supabase.table('scheduled_jobs')\
            .delete()\
            .in_('status', [JobScheduler.STATUS_COMPLETED, JobScheduler.STATUS_FAILED])\
            .lt('completed_at', cutoff_date)\
            .execute()

        return len(result.data) if result.data else 0
