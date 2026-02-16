"""
Repository for advisor check-in data access.
Handles all database operations for advisor check-ins.
"""

from typing import Dict, List, Optional
from uuid import UUID
from datetime import datetime, timedelta, timezone
from database import get_supabase_admin_client


class CheckinRepository:
    """Repository for managing advisor check-in data"""

    def __init__(self):
        self.supabase = get_supabase_admin_client()

    def create_checkin(self, checkin_data: Dict) -> Dict:
        """
        Create a new advisor check-in record.

        Args:
            checkin_data: Dictionary containing check-in fields

        Returns:
            Created check-in record
        """
        response = self.supabase.table('advisor_checkins').insert(checkin_data).execute()
        return response.data[0] if response.data else None

    def get_checkin_by_id(self, checkin_id: str) -> Optional[Dict]:
        """
        Get a specific check-in by ID.

        Args:
            checkin_id: UUID of the check-in

        Returns:
            Check-in record or None
        """
        response = self.supabase.table('advisor_checkins')\
            .select('*')\
            .eq('id', checkin_id)\
            .single()\
            .execute()
        return response.data if response.data else None

    def get_student_checkins(
        self,
        student_id: str,
        advisor_id: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict]:
        """
        Get all check-ins for a specific student.

        Args:
            student_id: UUID of the student
            advisor_id: Optional UUID of advisor (for permission filtering)
            limit: Maximum number of records to return

        Returns:
            List of check-in records ordered by date (newest first)
        """
        query = self.supabase.table('advisor_checkins')\
            .select('*')\
            .eq('student_id', student_id)\
            .order('checkin_date', desc=True)\
            .limit(limit)

        if advisor_id:
            query = query.eq('advisor_id', advisor_id)

        response = query.execute()
        return response.data if response.data else []

    def get_advisor_checkins(
        self,
        advisor_id: str,
        limit: int = 100
    ) -> List[Dict]:
        """
        Get all check-ins created by a specific advisor.

        Args:
            advisor_id: UUID of the advisor
            limit: Maximum number of records to return

        Returns:
            List of check-in records ordered by date (newest first)
        """
        response = self.supabase.table('advisor_checkins')\
            .select('*, users!student_id(display_name, first_name, last_name)')\
            .eq('advisor_id', advisor_id)\
            .order('checkin_date', desc=True)\
            .limit(limit)\
            .execute()
        return response.data if response.data else []

    def get_all_checkins(
        self,
        page: int = 1,
        limit: int = 50
    ) -> Dict:
        """
        Get all check-ins with pagination (admin only).

        Args:
            page: Page number (1-indexed)
            limit: Records per page

        Returns:
            Dictionary with 'data' and 'total' keys
        """
        offset = (page - 1) * limit

        # Get total count
        count_response = self.supabase.table('advisor_checkins')\
            .select('id', count='exact')\
            .execute()
        total = count_response.count if hasattr(count_response, 'count') else 0

        # Get paginated data
        response = self.supabase.table('advisor_checkins')\
            .select('''
                *,
                advisor:users!advisor_id(display_name, first_name, last_name),
                student:users!student_id(display_name, first_name, last_name)
            ''')\
            .order('checkin_date', desc=True)\
            .range(offset, offset + limit - 1)\
            .execute()

        return {
            'data': response.data if response.data else [],
            'total': total,
            'page': page,
            'limit': limit,
            'pages': (total + limit - 1) // limit
        }

    def get_last_checkin_date(
        self,
        student_id: str,
        advisor_id: Optional[str] = None
    ) -> Optional[datetime]:
        """
        Get the date of the most recent check-in for a student.

        Args:
            student_id: UUID of the student
            advisor_id: Optional UUID of advisor (for permission filtering)

        Returns:
            datetime of last check-in or None
        """
        query = self.supabase.table('advisor_checkins')\
            .select('checkin_date')\
            .eq('student_id', student_id)\
            .order('checkin_date', desc=True)\
            .limit(1)

        if advisor_id:
            query = query.eq('advisor_id', advisor_id)

        response = query.execute()

        if response.data and len(response.data) > 0:
            date_str = response.data[0]['checkin_date']
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        return None

    def get_checkin_analytics(self, advisor_id: Optional[str] = None) -> Dict:
        """
        Get simple analytics for check-ins.
        Optimized: 3 DB queries (checkins, assignments, users) instead of 8.

        Args:
            advisor_id: Optional UUID of advisor (filters to their check-ins only)

        Returns:
            Dictionary with analytics data
        """
        now = datetime.now(timezone.utc)
        month_ago = now - timedelta(days=30)

        # Query 1: Fetch ALL checkins for this advisor (typically small dataset)
        # Single query replaces 3 separate count/filter queries
        checkins_query = self.supabase.table('advisor_checkins')\
            .select('student_id, checkin_date')
        if advisor_id:
            checkins_query = checkins_query.eq('advisor_id', advisor_id)
        checkins_response = checkins_query.execute()
        all_checkins = checkins_response.data or []

        # Derive counts in-memory
        total_checkins = len(all_checkins)
        month_checkins = sum(1 for c in all_checkins if c['checkin_date'] >= month_ago.isoformat())

        # Build per-student latest checkin map and recent student IDs
        week_ago = now - timedelta(days=7)
        week_ago_iso = week_ago.isoformat()
        last_checkin_map = {}  # student_id -> datetime
        recent_student_ids = set()

        for checkin in all_checkins:
            sid = checkin['student_id']
            date_str = checkin['checkin_date']

            # Track most recent checkin per student
            parsed = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            if sid not in last_checkin_map or parsed > last_checkin_map[sid]:
                last_checkin_map[sid] = parsed

            # Track students with recent checkins
            if date_str >= week_ago_iso:
                recent_student_ids.add(sid)

        # Query 2: Get assigned student IDs (only if advisor)
        assigned_student_ids = []
        advisor_org_id = None
        is_superadmin = False

        if advisor_id:
            assignments_response = self.supabase.table('advisor_student_assignments')\
                .select('student_id')\
                .eq('advisor_id', advisor_id)\
                .eq('is_active', True)\
                .execute()
            assigned_student_ids = [a['student_id'] for a in (assignments_response.data or [])]

        # Query 3: Single bulk user fetch for all student IDs we need
        # Combines: recent student names + assigned student details + advisor role/org
        all_needed_ids = list(set(list(recent_student_ids) + assigned_student_ids))
        if advisor_id:
            all_needed_ids.append(advisor_id)

        user_map = {}
        if all_needed_ids:
            users_response = self.supabase.table('users')\
                .select('id, display_name, first_name, last_name, organization_id, role')\
                .in_('id', all_needed_ids)\
                .execute()
            for u in (users_response.data or []):
                user_map[u['id']] = u

        # Extract advisor info from the shared user lookup
        if advisor_id and advisor_id in user_map:
            advisor_data = user_map[advisor_id]
            is_superadmin = advisor_data.get('role') == 'superadmin'
            advisor_org_id = advisor_data.get('organization_id')

        # Helper to get display name
        def get_name(uid):
            u = user_map.get(uid, {})
            return u.get('display_name') or \
                f"{u.get('first_name', '')} {u.get('last_name', '')}".strip() or 'Unknown'

        # Build recent students list
        recent_students = [{'student_id': sid, 'name': get_name(sid)} for sid in recent_student_ids]

        # Build needs-checkin list from assigned students
        needs_checkin = []
        if advisor_id:
            for sid in assigned_student_ids:
                student = user_map.get(sid)
                if not student:
                    continue
                # ORGANIZATION ISOLATION
                if not is_superadmin and advisor_org_id is not None and student.get('organization_id') != advisor_org_id:
                    continue

                last_checkin = last_checkin_map.get(sid)
                if last_checkin is None or (now - last_checkin).days >= 7:
                    needs_checkin.append({
                        'student_id': sid,
                        'name': get_name(sid),
                        'days_since_checkin': (now - last_checkin).days if last_checkin else 999
                    })

        return {
            'total_checkins': total_checkins,
            'checkins_this_month': month_checkins,
            'recent_checkins': recent_students,
            'students_needing_checkin': needs_checkin
        }

    def update_checkin(self, checkin_id: str, updates: Dict) -> Optional[Dict]:
        """
        Update an existing check-in record.

        Args:
            checkin_id: UUID of the check-in
            updates: Dictionary of fields to update

        Returns:
            Updated check-in record or None
        """
        response = self.supabase.table('advisor_checkins')\
            .update(updates)\
            .eq('id', checkin_id)\
            .execute()
        return response.data[0] if response.data else None

    def delete_checkin(self, checkin_id: str) -> bool:
        """
        Delete a check-in record (admin only).

        Args:
            checkin_id: UUID of the check-in

        Returns:
            True if deleted, False otherwise
        """
        response = self.supabase.table('advisor_checkins')\
            .delete()\
            .eq('id', checkin_id)\
            .execute()
        return len(response.data) > 0 if response.data else False

    def get_student_active_quests_data(self, student_id: str) -> List[Dict]:
        """
        Get active quest data for a student with task completion stats.
        Used for check-in form pre-population.

        Args:
            student_id: UUID of the student

        Returns:
            List of active quest data with completion percentages
        """
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

    def get_user_role(self, user_id: str) -> Optional[str]:
        """
        Get user's role for permission checks.

        Args:
            user_id: UUID of the user

        Returns:
            User role (admin, advisor, student, etc.) or None if not found
        """
        response = self.supabase.table('users')\
            .select('role')\
            .eq('id', user_id)\
            .single()\
            .execute()

        return response.data.get('role') if response.data else None

    def _verify_same_organization(self, user_id_1: str, user_id_2: str) -> bool:
        """
        Verify that two users belong to the same organization.
        This is critical for organization isolation.
        Superadmins bypass this check - they have cross-organization access.

        Args:
            user_id_1: First user's UUID (typically the advisor)
            user_id_2: Second user's UUID (typically the student)

        Returns:
            True if users are in the same organization or first user is superadmin, False otherwise
        """
        try:
            # Check if first user (advisor) is superadmin - they have cross-org access
            user_role = self.get_user_role(user_id_1)
            if user_role == 'superadmin':
                return True

            result = self.supabase.table('users')\
                .select('id, organization_id')\
                .in_('id', [user_id_1, user_id_2])\
                .execute()

            if not result.data or len(result.data) != 2:
                return False

            org_ids = [u.get('organization_id') for u in result.data]
            # Both must have an org and they must match
            if org_ids[0] is None or org_ids[1] is None:
                return False
            return org_ids[0] == org_ids[1]
        except Exception:
            return False

    def verify_advisor_student_relationship(self, advisor_id: str, student_id: str) -> bool:
        """
        Verify that an active advisor-student relationship exists.
        Organization isolation is enforced.
        Admins have access only to students in their organization.

        Args:
            advisor_id: UUID of the advisor
            student_id: UUID of the student

        Returns:
            True if relationship exists, is active, and in same org. False otherwise.
        """
        # ORGANIZATION ISOLATION: Verify they are in the same organization first
        if not self._verify_same_organization(advisor_id, student_id):
            return False

        # Check if user is admin (admins can check in with any student in their org)
        user_role = self.get_user_role(advisor_id)
        if user_role == 'superadmin':
            return True

        # Check for active advisor-student assignment
        response = self.supabase.table('advisor_student_assignments')\
            .select('id')\
            .eq('advisor_id', advisor_id)\
            .eq('student_id', student_id)\
            .eq('is_active', True)\
            .execute()

        return len(response.data) > 0 if response.data else False
