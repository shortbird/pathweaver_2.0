"""
Service for advisor check-in business logic.
Handles validation, data aggregation, and check-in operations.
"""

from typing import Dict, List, Optional
from datetime import datetime
from services.base_service import BaseService
from repositories.checkin_repository import CheckinRepository
from database import get_supabase_admin_client


class CheckinService(BaseService):
    """Service for managing advisor check-ins"""

    def __init__(self):
        super().__init__()
        self.repository = CheckinRepository()

    def create_checkin(
        self,
        advisor_id: str,
        student_id: str,
        checkin_date: datetime,
        growth_moments: str,
        student_voice: str,
        obstacles: str,
        solutions: str,
        advisor_notes: str,
        active_quests_snapshot: List[Dict]
    ) -> Dict:
        """
        Create a new advisor check-in.

        Args:
            advisor_id: UUID of the advisor
            student_id: UUID of the student
            checkin_date: Date of the check-in
            growth_moments: What student discovered/learned
            student_voice: Direct quotes from student
            obstacles: Challenges identified
            solutions: Strategies discussed
            advisor_notes: Private advisor notes
            active_quests_snapshot: Quest data at time of check-in

        Returns:
            Created check-in record

        Raises:
            ValueError: If advisor-student relationship doesn't exist
        """
        try:
            # Verify advisor-student relationship exists
            if not self._verify_advisor_student_relationship(advisor_id, student_id):
                raise ValueError("Advisor-student relationship not found or inactive")

            checkin_data = {
                'advisor_id': advisor_id,
                'student_id': student_id,
                'checkin_date': checkin_date.isoformat(),
                'growth_moments': growth_moments,
                'student_voice': student_voice,
                'obstacles': obstacles,
                'solutions': solutions,
                'advisor_notes': advisor_notes,
                'active_quests_snapshot': active_quests_snapshot
            }

            checkin = self.repository.create_checkin(checkin_data)
            self.logger.info(f"Check-in created: {checkin['id']} by advisor {advisor_id} for student {student_id}")
            return checkin

        except Exception as e:
            self.logger.error(f"Error creating check-in: {str(e)}")
            raise

    def get_student_active_quests_data(self, student_id: str) -> List[Dict]:
        """
        Get pre-populated quest data for check-in form.

        Args:
            student_id: UUID of the student

        Returns:
            List of active quest data with completion percentages
        """
        try:
            # Get active quests for student
            quests_response = self.supabase.table('user_quests')\
                .select('quest_id, started_at, quests(id, title, description, image_url)')\
                .eq('user_id', student_id)\
                .eq('is_active', True)\
                .is_('completed_at', 'null')\
                .execute()

            if not quests_response.data:
                return []

            # Extract quest IDs for bulk queries
            quest_ids = [record['quest_id'] for record in quests_response.data]

            # OPTIMIZATION: Bulk fetch all tasks for all quests at once (eliminates N+1 query)
            all_tasks = self.supabase.table('user_quest_tasks')\
                .select('quest_id')\
                .eq('user_id', student_id)\
                .in_('quest_id', quest_ids)\
                .execute()

            # OPTIMIZATION: Bulk fetch all completions for all quests at once (eliminates N+1 query)
            all_completions = self.supabase.table('quest_task_completions')\
                .select('quest_id')\
                .eq('user_id', student_id)\
                .in_('quest_id', quest_ids)\
                .execute()

            # Build lookup dictionaries for O(1) access
            tasks_by_quest = {}
            for task in (all_tasks.data or []):
                qid = task['quest_id']
                tasks_by_quest[qid] = tasks_by_quest.get(qid, 0) + 1

            completions_by_quest = {}
            for completion in (all_completions.data or []):
                qid = completion['quest_id']
                completions_by_quest[qid] = completions_by_quest.get(qid, 0) + 1

            # Build quest data using pre-fetched counts (no additional queries)
            quests_data = []
            for record in quests_response.data:
                quest = record.get('quests', {})
                quest_id = quest.get('id')

                if not quest_id:
                    continue

                # Use pre-fetched counts
                total_tasks = tasks_by_quest.get(quest_id, 0)
                completed_tasks = completions_by_quest.get(quest_id, 0)

                # Calculate completion percentage
                completion_percent = round((completed_tasks / total_tasks * 100)) if total_tasks > 0 else 0

                quests_data.append({
                    'quest_id': quest_id,
                    'title': quest.get('title', 'Untitled Quest'),
                    'description': quest.get('description', ''),
                    'image_url': quest.get('image_url'),
                    'total_tasks': total_tasks,
                    'completed_tasks': completed_tasks,
                    'completion_percent': completion_percent,
                    'started_at': record.get('started_at')
                })

            return quests_data

        except Exception as e:
            self.logger.error(f"Error fetching quest data for student {student_id}: {str(e)}")
            return []

    def get_checkin_history(
        self,
        student_id: str,
        advisor_id: Optional[str] = None
    ) -> List[Dict]:
        """
        Get formatted check-in history for a student.

        Args:
            student_id: UUID of the student
            advisor_id: Optional UUID of advisor (for permission filtering)

        Returns:
            List of check-in records with formatted dates
        """
        try:
            checkins = self.repository.get_student_checkins(student_id, advisor_id)

            # Format dates for frontend
            for checkin in checkins:
                if 'checkin_date' in checkin:
                    date_obj = datetime.fromisoformat(checkin['checkin_date'].replace('Z', '+00:00'))
                    checkin['checkin_date_formatted'] = date_obj.strftime('%B %d, %Y')

            return checkins

        except Exception as e:
            self.logger.error(f"Error fetching check-in history: {str(e)}")
            raise

    def get_checkin_analytics(self, advisor_id: str) -> Dict:
        """
        Get analytics for advisor's check-ins.

        Args:
            advisor_id: UUID of the advisor

        Returns:
            Dictionary with analytics data
        """
        try:
            analytics = self.repository.get_checkin_analytics(advisor_id)
            return analytics

        except Exception as e:
            self.logger.error(f"Error fetching check-in analytics: {str(e)}")
            raise

    def get_last_checkin_info(
        self,
        student_id: str,
        advisor_id: Optional[str] = None
    ) -> Optional[Dict]:
        """
        Get information about the most recent check-in for a student.

        Args:
            student_id: UUID of the student
            advisor_id: Optional UUID of advisor (for permission filtering)

        Returns:
            Dictionary with last check-in date and days since, or None
        """
        try:
            last_date = self.repository.get_last_checkin_date(student_id, advisor_id)

            if not last_date:
                return None

            now = datetime.utcnow().replace(tzinfo=last_date.tzinfo)
            days_since = (now - last_date).days

            return {
                'last_checkin_date': last_date.isoformat(),
                'last_checkin_date_formatted': last_date.strftime('%B %d, %Y'),
                'days_since_checkin': days_since
            }

        except Exception as e:
            self.logger.error(f"Error fetching last check-in info: {str(e)}")
            return None

    def get_checkin_by_id(self, checkin_id: str, advisor_id: str) -> Optional[Dict]:
        """
        Get a specific check-in by ID with permission check.

        Args:
            checkin_id: UUID of the check-in
            advisor_id: UUID of the requesting advisor

        Returns:
            Check-in record or None

        Raises:
            PermissionError: If advisor doesn't have access to this check-in
        """
        try:
            checkin = self.repository.get_checkin_by_id(checkin_id)

            if not checkin:
                return None

            # Verify advisor has permission to view this check-in
            if checkin['advisor_id'] != advisor_id:
                # Check if requesting user is admin
                user_response = self.supabase.table('users')\
                    .select('role')\
                    .eq('id', advisor_id)\
                    .single()\
                    .execute()

                if user_response.data and user_response.data.get('role') != 'admin':
                    raise PermissionError("You don't have permission to view this check-in")

            return checkin

        except PermissionError:
            raise
        except Exception as e:
            self.logger.error(f"Error fetching check-in by ID: {str(e)}")
            raise

    def _verify_advisor_student_relationship(
        self,
        advisor_id: str,
        student_id: str
    ) -> bool:
        """
        Verify that an active advisor-student relationship exists.

        Args:
            advisor_id: UUID of the advisor
            student_id: UUID of the student

        Returns:
            True if relationship exists and is active, False otherwise
        """
        try:
            # Check if user is admin (admins can check in with any student)
            user_response = self.supabase.table('users')\
                .select('role')\
                .eq('id', advisor_id)\
                .single()\
                .execute()

            if user_response.data and user_response.data.get('role') == 'admin':
                return True

            # Check for active advisor-student assignment
            response = self.supabase.table('advisor_student_assignments')\
                .select('id')\
                .eq('advisor_id', advisor_id)\
                .eq('student_id', student_id)\
                .eq('is_active', True)\
                .execute()

            return len(response.data) > 0 if response.data else False

        except Exception as e:
            self.logger.error(f"Error verifying advisor-student relationship: {str(e)}")
            return False
