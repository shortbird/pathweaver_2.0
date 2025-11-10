"""
Advisor Service - Manages advisor-specific functionality
Handles custom badge creation, student monitoring, and advisor-student relationships
"""

import sys
from datetime import datetime
from typing import Dict, List, Optional, Any
from services.base_service import BaseService
from services.badge_service import BadgeService

from utils.logger import get_logger

logger = get_logger(__name__)

class AdvisorService(BaseService):
    """Service for advisor-specific operations"""

    def __init__(self, user_id: Optional[str] = None):
        super().__init__(user_id)
        self.badge_service = BadgeService(user_id)

    # ==================== Advisor-Student Relationships ====================

    def get_advisor_students(self, advisor_id: str) -> List[Dict[str, Any]]:
        """
        Get all students assigned to this advisor
        If advisor is admin, returns ALL students in the system

        Args:
            advisor_id: UUID of the advisor

        Returns:
            List of student records with progress data
        """
        try:
            # Check if user is admin
            advisor_check = self.supabase.table('users')\
                .select('role')\
                .eq('id', advisor_id)\
                .single()\
                .execute()

            is_admin = advisor_check.data and advisor_check.data['role'] == 'admin'

            students = []

            if is_admin:
                # Admin sees ALL students (without badge data to avoid timeout)
                response = self.supabase.table('users')\
                    .select('id, display_name, first_name, last_name, email, level, total_xp, avatar_url, last_active')\
                    .eq('role', 'student')\
                    .execute()

                if response.data:
                    for student in response.data:
                        # Set badge counts to 0 for now - can be loaded on-demand
                        student['badge_count'] = 0
                        student['active_badges'] = []
                        students.append(student)
            else:
                # Regular advisor sees only assigned students
                response = self.supabase.table('advisor_student_assignments')\
                    .select('student_id, users!advisor_student_assignments_student_id_fkey(id, display_name, first_name, last_name, email, level, total_xp, avatar_url, last_active)')\
                    .eq('advisor_id', advisor_id)\
                    .eq('is_active', True)\
                    .execute()

                # Flatten the nested user data
                if response.data:
                    for assignment in response.data:
                        if assignment.get('users'):
                            student = assignment['users']
                            student['badge_count'] = self._get_student_badge_count(student['id'])
                            student['active_badges'] = self._get_student_active_badges(student['id'])
                            students.append(student)

            # Sort by display name
            students.sort(key=lambda x: x.get('display_name', ''))

            return students

        except Exception as e:
            import traceback
            print(f"Error fetching advisor students: {str(e)}", file=sys.stderr, flush=True)
            print(f"Traceback: {traceback.format_exc()}", file=sys.stderr, flush=True)
            raise

    def assign_student_to_advisor(self, student_id: str, advisor_id: str) -> bool:
        """
        Assign a student to an advisor

        Args:
            student_id: UUID of the student
            advisor_id: UUID of the advisor

        Returns:
            Success boolean
        """
        try:
            # Verify advisor has advisor role
            advisor_check = self.supabase.table('users')\
                .select('role')\
                .eq('id', advisor_id)\
                .single()\
                .execute()

            if not advisor_check.data or advisor_check.data['role'] not in ['advisor', 'admin']:
                raise ValueError("User is not an advisor")

            # Check if assignment already exists
            existing = self.supabase.table('advisor_student_assignments')\
                .select('id, is_active')\
                .eq('advisor_id', advisor_id)\
                .eq('student_id', student_id)\
                .execute()

            if existing.data:
                # Reactivate if inactive
                if not existing.data[0]['is_active']:
                    self.supabase.table('advisor_student_assignments')\
                        .update({'is_active': True, 'assigned_at': datetime.utcnow().isoformat()})\
                        .eq('id', existing.data[0]['id'])\
                        .execute()
            else:
                # Create new assignment
                self.supabase.table('advisor_student_assignments')\
                    .insert({
                        'advisor_id': advisor_id,
                        'student_id': student_id,
                        'assigned_by': advisor_id,
                        'assigned_at': datetime.utcnow().isoformat(),
                        'is_active': True
                    })\
                    .execute()

            return True

        except Exception as e:
            print(f"Error assigning student to advisor: {str(e)}", file=sys.stderr, flush=True)
            raise

    def _get_student_badge_count(self, student_id: str) -> int:
        """Get count of earned badges for student"""
        try:
            response = self.supabase.table('user_badges')\
                .select('id', count='exact')\
                .eq('user_id', student_id)\
                .eq('earned', True)\
                .execute()
            return response.count if response.count else 0
        except Exception as e:
            print(f"Error getting badge count for student {student_id}: {str(e)}", file=sys.stderr, flush=True)
            return 0

    def _get_student_active_badges(self, student_id: str) -> List[Dict[str, Any]]:
        """Get active (in-progress) badges for student"""
        try:
            response = self.supabase.table('user_badges')\
                .select('badge_id, progress, badges(name, pillar_primary)')\
                .eq('user_id', student_id)\
                .eq('earned', False)\
                .gt('progress', 0)\
                .limit(3)\
                .execute()
            return response.data if response.data else []
        except Exception as e:
            print(f"Error getting active badges for student {student_id}: {str(e)}", file=sys.stderr, flush=True)
            return []

    # ==================== Custom Badge Creation ====================

    def create_custom_badge(
        self,
        advisor_id: str,
        name: str,
        description: str,
        identity_statement: str,
        primary_pillar: str,
        min_quests: int,
        xp_requirement: int,
        icon: str = "🎯",
        color: str = "#6d469b",
        is_public: bool = False
    ) -> Dict[str, Any]:
        """
        Create a custom badge by an advisor

        NOTE: Custom badges are currently not supported in the database schema.
        This method creates regular badges. Track custom badges via a separate
        advisor_badges table or metadata field in the future.

        Args:
            advisor_id: UUID of the advisor creating the badge
            name: Badge name
            description: Badge description
            identity_statement: What this badge represents
            primary_pillar: Main skill pillar
            min_quests: Minimum quests to complete
            xp_requirement: Total XP needed
            icon: Badge icon (emoji or path)
            color: Badge color (hex)
            is_public: Whether visible to all students

        Returns:
            Created badge record
        """
        try:
            # Verify advisor role
            advisor_check = self.supabase.table('users')\
                .select('role')\
                .eq('id', advisor_id)\
                .single()\
                .execute()

            if not advisor_check.data or advisor_check.data['role'] not in ['advisor', 'admin']:
                raise ValueError("User is not an advisor")

            # Create badge (without created_by/is_custom fields that don't exist)
            badge_data = {
                'name': name,
                'description': description,
                'identity_statement': identity_statement,
                'pillar_primary': primary_pillar,  # Use pillar_primary not primary_pillar
                'min_quests': min_quests,
                'min_xp': xp_requirement,  # Use min_xp not xp_requirement
                'status': 'active',  # Use status field
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }

            response = self.supabase.table('badges')\
                .insert(badge_data)\
                .execute()

            if not response.data:
                raise Exception("Failed to create badge")

            return response.data[0]

        except Exception as e:
            print(f"Error creating custom badge: {str(e)}", file=sys.stderr, flush=True)
            raise

    def get_advisor_custom_badges(self, advisor_id: str) -> List[Dict[str, Any]]:
        """
        Get all custom badges created by an advisor

        NOTE: Since created_by column doesn't exist, return empty list for now.
        In the future, implement an advisor_badges tracking table.

        Args:
            advisor_id: UUID of the advisor

        Returns:
            List of custom badge records (currently always empty)
        """
        try:
            # Return empty list since we can't track which badges were created by advisors
            # TODO: Add advisor_badges table or created_by column to badges table
            return []

        except Exception as e:
            print(f"Error fetching advisor badges: {str(e)}", file=sys.stderr, flush=True)
            raise

    def update_custom_badge(
        self,
        badge_id: str,
        advisor_id: str,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update a custom badge (only by creator)

        NOTE: Disabled until created_by tracking is implemented

        Args:
            badge_id: UUID of the badge
            advisor_id: UUID of the advisor
            updates: Dictionary of fields to update

        Returns:
            Updated badge record
        """
        try:
            raise ValueError("Badge editing is currently disabled. Custom badge tracking not yet implemented.")

        except Exception as e:
            print(f"Error updating custom badge: {str(e)}", file=sys.stderr, flush=True)
            raise

    def delete_custom_badge(self, badge_id: str, advisor_id: str) -> bool:
        """
        Delete a custom badge (only by creator, only if no students have earned it)

        NOTE: Disabled until created_by tracking is implemented

        Args:
            badge_id: UUID of the badge
            advisor_id: UUID of the advisor

        Returns:
            Success boolean
        """
        try:
            raise ValueError("Badge deletion is currently disabled. Custom badge tracking not yet implemented.")

        except Exception as e:
            print(f"Error deleting custom badge: {str(e)}", file=sys.stderr, flush=True)
            raise

    # ==================== Badge Assignment & Recommendations ====================

    def assign_badge_to_student(
        self,
        badge_id: str,
        student_id: str,
        advisor_id: str
    ) -> Dict[str, Any]:
        """
        Recommend a badge to a specific student

        Args:
            badge_id: UUID of the badge
            student_id: UUID of the student
            advisor_id: UUID of the advisor making recommendation

        Returns:
            Created user_badge record
        """
        try:
            # Verify advisor-student relationship or advisor role
            advisor = self.supabase.table('users')\
                .select('role')\
                .eq('id', advisor_id)\
                .single()\
                .execute()

            if not advisor.data or advisor.data['role'] not in ['advisor', 'admin']:
                raise ValueError("Not authorized")

            # Check if student already has this badge
            existing = self.supabase.table('user_badges')\
                .select('id')\
                .eq('user_id', student_id)\
                .eq('badge_id', badge_id)\
                .execute()

            if existing.data:
                raise ValueError("Student already has this badge assigned")

            # Create user_badge record
            user_badge_data = {
                'user_id': student_id,
                'badge_id': badge_id,
                'progress': 0,
                'earned': False,
                'assigned_by': advisor_id,  # Track who assigned it
                'started_at': datetime.utcnow().isoformat()
            }

            response = self.supabase.table('user_badges')\
                .insert(user_badge_data)\
                .execute()

            if not response.data:
                raise Exception("Failed to assign badge")

            return response.data[0]

        except Exception as e:
            print(f"Error assigning badge to student: {str(e)}", file=sys.stderr, flush=True)
            raise

    def get_student_progress_report(self, student_id: str, advisor_id: str) -> Dict[str, Any]:
        """
        Get comprehensive progress report for a student

        Args:
            student_id: UUID of the student
            advisor_id: UUID of the advisor

        Returns:
            Progress report dictionary
        """
        try:
            # Verify advisor relationship using advisor_student_assignments table
            student = self.supabase.table('users')\
                .select('id, display_name, total_xp, level, last_active')\
                .eq('id', student_id)\
                .single()\
                .execute()

            if not student.data:
                raise ValueError("Student not found")

            # Check if advisor has permission
            advisor_check = self.supabase.table('users')\
                .select('role')\
                .eq('id', advisor_id)\
                .single()\
                .execute()

            is_admin = advisor_check.data and advisor_check.data['role'] == 'admin'

            # Check advisor-student assignment
            assignment_check = self.supabase.table('advisor_student_assignments')\
                .select('id')\
                .eq('advisor_id', advisor_id)\
                .eq('student_id', student_id)\
                .eq('is_active', True)\
                .execute()

            is_assigned_advisor = bool(assignment_check.data)

            if not (is_admin or is_assigned_advisor):
                raise ValueError("Not authorized to view this student's progress")

            # Get badge progress
            badges = self.supabase.table('user_badges')\
                .select('badge_id, progress, earned, earned_at, badges(name, pillar_primary, min_quests)')\
                .eq('user_id', student_id)\
                .execute()

            # Get skill XP breakdown
            skill_xp = self.supabase.table('user_skill_xp')\
                .select('pillar, xp_amount')\
                .eq('user_id', student_id)\
                .execute()

            # Get recent quest completions
            recent_quests = self.supabase.table('user_quests')\
                .select('quest_id, completed_at, quests(title, pillar)')\
                .eq('user_id', student_id)\
                .not_.is_('completed_at', 'null')\
                .order('completed_at', desc=True)\
                .limit(10)\
                .execute()

            return {
                'student': student.data,
                'badges': {
                    'total': len(badges.data) if badges.data else 0,
                    'earned': len([b for b in badges.data if b['earned']]) if badges.data else 0,
                    'in_progress': len([b for b in badges.data if not b['earned']]) if badges.data else 0,
                    'details': badges.data if badges.data else []
                },
                'skill_xp': skill_xp.data if skill_xp.data else [],
                'recent_activity': recent_quests.data if recent_quests.data else []
            }

        except Exception as e:
            print(f"Error generating progress report: {str(e)}", file=sys.stderr, flush=True)
            raise
