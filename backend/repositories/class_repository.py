"""
Class Repository - Data access for organization classes

Provides database operations for:
- Organization classes (org_classes)
- Class advisors (class_advisors)
- Class enrollments (class_enrollments)
- Class quests (class_quests)
"""

from typing import Dict, Any, List, Optional
from repositories.base_repository import BaseRepository
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


class ClassRepository(BaseRepository):
    """Repository for organization class data access"""

    table_name = 'org_classes'

    def __init__(self, user_id: Optional[str] = None):
        super().__init__(user_id)
        self._admin_client = None

    @property
    def admin_client(self):
        """Get admin client for operations that bypass RLS"""
        if self._admin_client is None:
            self._admin_client = get_supabase_admin_client()
        return self._admin_client

    # ===== Class CRUD =====

    def get_class_with_details(self, class_id: str) -> Optional[Dict[str, Any]]:
        """Get class with organization details"""
        response = self.admin_client.table(self.table_name)\
            .select('*, organizations(id, name, slug)')\
            .eq('id', class_id)\
            .maybe_single()\
            .execute()
        return response.data if response and response.data else None

    def list_org_classes(
        self,
        org_id: str,
        status: str = 'active',
        include_counts: bool = True
    ) -> List[Dict[str, Any]]:
        """List all classes for an organization with optional counts"""
        query = self.admin_client.table(self.table_name)\
            .select('*')\
            .eq('organization_id', org_id)

        if status:
            query = query.eq('status', status)

        query = query.order('created_at', desc=True)
        response = query.execute()
        classes = response.data if response.data else []

        if include_counts and classes:
            # Get counts for each class
            class_ids = [c['id'] for c in classes]
            for cls in classes:
                cls['student_count'] = self._get_enrollment_count(cls['id'])
                cls['quest_count'] = self._get_quest_count(cls['id'])
                cls['advisor_count'] = self._get_advisor_count(cls['id'])

        return classes

    def create_class(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new class"""
        response = self.admin_client.table(self.table_name)\
            .insert(data)\
            .execute()
        if not response.data:
            raise Exception("Failed to create class")
        logger.info(f"Created class: {response.data[0]['id']}")
        return response.data[0]

    def update_class(self, class_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update class details"""
        response = self.admin_client.table(self.table_name)\
            .update(data)\
            .eq('id', class_id)\
            .execute()
        if not response.data:
            raise Exception(f"Failed to update class {class_id}")
        return response.data[0]

    def archive_class(self, class_id: str) -> Dict[str, Any]:
        """Archive a class (soft delete)"""
        return self.update_class(class_id, {'status': 'archived'})

    # ===== Advisor Management =====

    def get_class_advisors(self, class_id: str) -> List[Dict[str, Any]]:
        """Get all advisors for a class"""
        response = self.admin_client.table('class_advisors')\
            .select('*, users!advisor_id(id, email, display_name, first_name, last_name)')\
            .eq('class_id', class_id)\
            .eq('is_active', True)\
            .order('assigned_at', desc=True)\
            .execute()
        return response.data if response.data else []

    def add_advisor(
        self,
        class_id: str,
        advisor_id: str,
        assigned_by: str
    ) -> Dict[str, Any]:
        """Add an advisor to a class"""
        data = {
            'class_id': class_id,
            'advisor_id': advisor_id,
            'assigned_by': assigned_by,
            'is_active': True
        }
        response = self.admin_client.table('class_advisors')\
            .upsert(data, on_conflict='class_id,advisor_id')\
            .execute()
        if not response.data:
            raise Exception("Failed to add advisor")
        return response.data[0]

    def remove_advisor(self, class_id: str, advisor_id: str) -> bool:
        """Remove an advisor from a class (soft delete)"""
        response = self.admin_client.table('class_advisors')\
            .update({'is_active': False})\
            .eq('class_id', class_id)\
            .eq('advisor_id', advisor_id)\
            .execute()
        return bool(response.data)

    def get_advisor_classes(self, advisor_id: str, status: str = 'active') -> List[Dict[str, Any]]:
        """Get all classes an advisor is assigned to"""
        response = self.admin_client.table('class_advisors')\
            .select('*, org_classes(*, organizations(id, name, slug))')\
            .eq('advisor_id', advisor_id)\
            .eq('is_active', True)\
            .execute()

        classes = []
        if response.data:
            for assignment in response.data:
                if assignment.get('org_classes'):
                    cls = assignment['org_classes']
                    if status is None or cls.get('status') == status:
                        cls['assignment'] = {
                            'assigned_at': assignment['assigned_at'],
                            'assigned_by': assignment['assigned_by']
                        }
                        classes.append(cls)

        return classes

    def is_class_advisor(self, class_id: str, user_id: str) -> bool:
        """Check if a user is an advisor for a class"""
        response = self.admin_client.table('class_advisors')\
            .select('id')\
            .eq('class_id', class_id)\
            .eq('advisor_id', user_id)\
            .eq('is_active', True)\
            .maybe_single()\
            .execute()
        return response.data is not None

    # ===== Student Enrollment =====

    def get_class_students(self, class_id: str, status: str = 'active') -> List[Dict[str, Any]]:
        """Get all students enrolled in a class"""
        query = self.admin_client.table('class_enrollments')\
            .select('*, users!student_id(id, email, display_name, first_name, last_name, total_xp)')\
            .eq('class_id', class_id)

        if status:
            query = query.eq('status', status)

        query = query.order('enrolled_at', desc=True)
        response = query.execute()
        return response.data if response.data else []

    def enroll_student(
        self,
        class_id: str,
        student_id: str,
        enrolled_by: str
    ) -> Dict[str, Any]:
        """Enroll a student in a class"""
        data = {
            'class_id': class_id,
            'student_id': student_id,
            'enrolled_by': enrolled_by,
            'status': 'active'
        }
        response = self.admin_client.table('class_enrollments')\
            .upsert(data, on_conflict='class_id,student_id')\
            .execute()
        if not response.data:
            raise Exception("Failed to enroll student")
        return response.data[0]

    def enroll_students_bulk(
        self,
        class_id: str,
        student_ids: List[str],
        enrolled_by: str
    ) -> List[Dict[str, Any]]:
        """Enroll multiple students in a class"""
        data = [
            {
                'class_id': class_id,
                'student_id': sid,
                'enrolled_by': enrolled_by,
                'status': 'active'
            }
            for sid in student_ids
        ]
        response = self.admin_client.table('class_enrollments')\
            .upsert(data, on_conflict='class_id,student_id')\
            .execute()
        return response.data if response.data else []

    def withdraw_student(self, class_id: str, student_id: str) -> bool:
        """Withdraw a student from a class"""
        response = self.admin_client.table('class_enrollments')\
            .update({'status': 'withdrawn'})\
            .eq('class_id', class_id)\
            .eq('student_id', student_id)\
            .execute()
        return bool(response.data)

    def update_enrollment_status(
        self,
        class_id: str,
        student_id: str,
        status: str,
        completed_at: Optional[str] = None
    ) -> Dict[str, Any]:
        """Update a student's enrollment status"""
        data = {'status': status}
        if completed_at:
            data['completed_at'] = completed_at
        response = self.admin_client.table('class_enrollments')\
            .update(data)\
            .eq('class_id', class_id)\
            .eq('student_id', student_id)\
            .execute()
        if not response.data:
            raise Exception("Failed to update enrollment status")
        return response.data[0]

    def get_student_enrollments(self, student_id: str, status: str = 'active') -> List[Dict[str, Any]]:
        """Get all classes a student is enrolled in"""
        query = self.admin_client.table('class_enrollments')\
            .select('*, org_classes(*)')\
            .eq('student_id', student_id)

        if status:
            query = query.eq('status', status)

        response = query.execute()
        return response.data if response.data else []

    # ===== Quest Management =====

    def get_class_quests(self, class_id: str) -> List[Dict[str, Any]]:
        """Get all quests assigned to a class"""
        response = self.admin_client.table('class_quests')\
            .select('*, quests(id, title, description, quest_type, is_active)')\
            .eq('class_id', class_id)\
            .order('sequence_order')\
            .execute()
        return response.data if response.data else []

    def add_quest(
        self,
        class_id: str,
        quest_id: str,
        added_by: str,
        sequence_order: int = 0
    ) -> Dict[str, Any]:
        """Add a quest to a class"""
        data = {
            'class_id': class_id,
            'quest_id': quest_id,
            'added_by': added_by,
            'sequence_order': sequence_order
        }
        response = self.admin_client.table('class_quests')\
            .upsert(data, on_conflict='class_id,quest_id')\
            .execute()
        if not response.data:
            raise Exception("Failed to add quest")
        return response.data[0]

    def remove_quest(self, class_id: str, quest_id: str) -> bool:
        """Remove a quest from a class"""
        response = self.admin_client.table('class_quests')\
            .delete()\
            .eq('class_id', class_id)\
            .eq('quest_id', quest_id)\
            .execute()
        return bool(response.data)

    def reorder_quests(self, class_id: str, quest_ids: List[str]) -> List[Dict[str, Any]]:
        """Reorder quests in a class"""
        results = []
        for order, quest_id in enumerate(quest_ids):
            response = self.admin_client.table('class_quests')\
                .update({'sequence_order': order})\
                .eq('class_id', class_id)\
                .eq('quest_id', quest_id)\
                .execute()
            if response.data:
                results.extend(response.data)
        return results

    def get_class_quest_ids(self, class_id: str) -> List[str]:
        """Get just the quest IDs for a class"""
        response = self.admin_client.table('class_quests')\
            .select('quest_id')\
            .eq('class_id', class_id)\
            .execute()
        return [q['quest_id'] for q in response.data] if response.data else []

    # ===== Progress Calculation =====

    def get_student_class_xp(self, class_id: str, student_id: str) -> int:
        """Calculate total XP earned by a student for quests in a class"""
        # Get quest IDs in this class
        quest_ids = self.get_class_quest_ids(class_id)
        if not quest_ids:
            return 0

        # Sum XP from completions for these quests
        response = self.admin_client.table('quest_task_completions')\
            .select('xp_awarded')\
            .eq('user_id', student_id)\
            .in_('quest_id', quest_ids)\
            .execute()

        if not response.data:
            return 0

        return sum(c.get('xp_awarded', 0) or 0 for c in response.data)

    def get_class_progress_bulk(self, class_id: str) -> List[Dict[str, Any]]:
        """Get progress for all students in a class"""
        # Get class details
        cls = self.find_by_id(class_id)
        if not cls:
            return []

        xp_threshold = cls.get('xp_threshold', 100)

        # Get all students
        students = self.get_class_students(class_id)
        if not students:
            return []

        # Get quest IDs for this class
        quest_ids = self.get_class_quest_ids(class_id)

        # Calculate progress for each student
        results = []
        for enrollment in students:
            student = enrollment.get('users', {})
            student_id = student.get('id') or enrollment.get('student_id')

            earned_xp = 0
            if quest_ids:
                response = self.admin_client.table('quest_task_completions')\
                    .select('xp_awarded')\
                    .eq('user_id', student_id)\
                    .in_('quest_id', quest_ids)\
                    .execute()
                if response.data:
                    earned_xp = sum(c.get('xp_awarded', 0) or 0 for c in response.data)

            percentage = min(100, int((earned_xp / xp_threshold) * 100)) if xp_threshold > 0 else 0
            is_complete = earned_xp >= xp_threshold

            results.append({
                'student_id': student_id,
                'student': student,
                'enrollment': {
                    'status': enrollment.get('status'),
                    'enrolled_at': enrollment.get('enrolled_at'),
                    'completed_at': enrollment.get('completed_at')
                },
                'progress': {
                    'earned_xp': earned_xp,
                    'xp_threshold': xp_threshold,
                    'percentage': percentage,
                    'is_complete': is_complete
                }
            })

        return results

    # ===== Helper Methods =====

    def _get_enrollment_count(self, class_id: str) -> int:
        """Get count of active enrollments"""
        response = self.admin_client.table('class_enrollments')\
            .select('id', count='exact')\
            .eq('class_id', class_id)\
            .eq('status', 'active')\
            .execute()
        return response.count if response.count else 0

    def _get_quest_count(self, class_id: str) -> int:
        """Get count of quests in class"""
        response = self.admin_client.table('class_quests')\
            .select('id', count='exact')\
            .eq('class_id', class_id)\
            .execute()
        return response.count if response.count else 0

    def _get_advisor_count(self, class_id: str) -> int:
        """Get count of active advisors"""
        response = self.admin_client.table('class_advisors')\
            .select('id', count='exact')\
            .eq('class_id', class_id)\
            .eq('is_active', True)\
            .execute()
        return response.count if response.count else 0

    # ===== Authorization Helpers =====

    def can_user_access_class(self, class_id: str, user_id: str, user_role: str, user_org_id: Optional[str]) -> bool:
        """Check if a user can access a class"""
        # Superadmin can access everything
        if user_role == 'superadmin':
            return True

        # Get class
        cls = self.find_by_id(class_id)
        if not cls:
            return False

        # Org admin can access classes in their org
        if user_role == 'org_admin' and user_org_id == cls.get('organization_id'):
            return True

        # Advisors can access classes they're assigned to
        if self.is_class_advisor(class_id, user_id):
            return True

        return False

    def can_user_manage_class(self, class_id: str, user_id: str, user_role: str, user_org_id: Optional[str]) -> bool:
        """Check if a user can manage (modify) a class"""
        # Same as access for now - advisors have full management of their classes
        return self.can_user_access_class(class_id, user_id, user_role, user_org_id)
