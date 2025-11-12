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

        Args:
            advisor_id: Optional UUID of advisor (filters to their check-ins only)

        Returns:
            Dictionary with analytics data
        """
        now = datetime.now(timezone.utc)
        month_ago = now - timedelta(days=30)
        week_ago = now - timedelta(days=7)

        # Total check-ins - Build fresh query for each metric
        total_query = self.supabase.table('advisor_checkins').select('id', count='exact')
        if advisor_id:
            total_query = total_query.eq('advisor_id', advisor_id)
        total_response = total_query.execute()
        total_checkins = total_response.count if hasattr(total_response, 'count') else 0

        # Check-ins this month - Build fresh query
        month_query = self.supabase.table('advisor_checkins')\
            .select('id', count='exact')\
            .gte('checkin_date', month_ago.isoformat())
        if advisor_id:
            month_query = month_query.eq('advisor_id', advisor_id)
        month_response = month_query.execute()
        month_checkins = month_response.count if hasattr(month_response, 'count') else 0

        # Recent check-ins (last 7 days) with student names - Build fresh query
        recent_query = self.supabase.table('advisor_checkins')\
            .select('student_id, users!student_id(display_name, first_name, last_name)')\
            .gte('checkin_date', week_ago.isoformat())
        if advisor_id:
            recent_query = recent_query.eq('advisor_id', advisor_id)
        recent_response = recent_query.execute()
        recent_students = []
        if recent_response.data:
            seen = set()
            for record in recent_response.data:
                if record['student_id'] not in seen:
                    seen.add(record['student_id'])
                    recent_students.append({
                        'student_id': record['student_id'],
                        'name': record.get('users', {}).get('display_name', 'Unknown')
                    })

        # Students needing check-in (no check-in in 30+ days)
        # Get all students assigned to advisor
        if advisor_id:
            assignments_response = self.supabase.table('advisor_student_assignments')\
                .select('student_id, users!student_id(display_name, first_name, last_name)')\
                .eq('advisor_id', advisor_id)\
                .eq('is_active', True)\
                .execute()

            all_students = assignments_response.data if assignments_response.data else []

            if all_students:
                # OPTIMIZATION: Bulk fetch last check-in dates for all students (eliminates N+1 query)
                student_ids = [a['student_id'] for a in all_students]

                last_checkins_query = self.supabase.table('advisor_checkins')\
                    .select('student_id, checkin_date')\
                    .in_('student_id', student_ids)\
                    .eq('advisor_id', advisor_id)\
                    .order('checkin_date', desc=True)\
                    .execute()

                # Build lookup: student_id -> last_checkin_date (only keep most recent per student)
                last_checkin_map = {}
                for checkin in (last_checkins_query.data or []):
                    sid = checkin['student_id']
                    if sid not in last_checkin_map:
                        date_str = checkin['checkin_date']
                        last_checkin_map[sid] = datetime.fromisoformat(date_str.replace('Z', '+00:00'))

                # Check each student using pre-fetched data (no additional queries)
                needs_checkin = []
                for assignment in all_students:
                    student_id = assignment['student_id']
                    last_checkin = last_checkin_map.get(student_id)

                    if last_checkin is None or (now - last_checkin).days >= 30:
                        # Get user data and construct name with fallback
                        user_data = assignment.get('users', {})
                        display_name = user_data.get('display_name')
                        if not display_name:
                            first_name = user_data.get('first_name', '')
                            last_name = user_data.get('last_name', '')
                            display_name = f"{first_name} {last_name}".strip() or 'Unknown'

                        needs_checkin.append({
                            'student_id': student_id,
                            'name': display_name,
                            'days_since_checkin': (now - last_checkin).days if last_checkin else 999
                        })
            else:
                needs_checkin = []
        else:
            needs_checkin = []

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
