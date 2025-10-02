"""
Advisor Service - Manages advisor-specific functionality
Handles custom badge creation, student monitoring, and advisor-student relationships
"""

import sys
from datetime import datetime
from typing import Dict, List, Optional, Any
from database import get_authenticated_supabase_client
from services.badge_service import BadgeService

class AdvisorService:
    """Service for advisor-specific operations"""

    def __init__(self):
        self.supabase = get_authenticated_supabase_client()
        self.badge_service = BadgeService()

    # ==================== Advisor-Student Relationships ====================

    def get_advisor_students(self, advisor_id: str) -> List[Dict[str, Any]]:
        """
        Get all students assigned to this advisor

        Args:
            advisor_id: UUID of the advisor

        Returns:
            List of student records with progress data
        """
        try:
            # Query users table for students with this advisor_id
            # Note: advisor_id field needs to be added to users table
            response = self.supabase.table('users')\
                .select('id, display_name, first_name, last_name, email, level, total_xp, avatar_url, last_active')\
                .eq('advisor_id', advisor_id)\
                .eq('role', 'student')\
                .order('display_name')\
                .execute()

            students = response.data if response.data else []

            # Enrich with badge progress for each student
            for student in students:
                student['badge_count'] = self._get_student_badge_count(student['id'])
                student['active_badges'] = self._get_student_active_badges(student['id'])

            return students

        except Exception as e:
            print(f"Error fetching advisor students: {str(e)}", file=sys.stderr, flush=True)
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

            # Update student's advisor_id
            self.supabase.table('users')\
                .update({'advisor_id': advisor_id})\
                .eq('id', student_id)\
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
        except:
            return 0

    def _get_student_active_badges(self, student_id: str) -> List[Dict[str, Any]]:
        """Get active (in-progress) badges for student"""
        try:
            response = self.supabase.table('user_badges')\
                .select('badge_id, progress, badges(name, primary_pillar)')\
                .eq('user_id', student_id)\
                .eq('earned', False)\
                .gt('progress', 0)\
                .limit(3)\
                .execute()
            return response.data if response.data else []
        except:
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

            # Create badge with advisor attribution
            badge_data = {
                'name': name,
                'description': description,
                'identity_statement': identity_statement,
                'primary_pillar': primary_pillar,
                'min_quests': min_quests,
                'xp_requirement': xp_requirement,
                'icon': icon,
                'color': color,
                'is_public': is_public,
                'created_by': advisor_id,  # Track advisor who created it
                'is_custom': True,  # Mark as custom badge
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

        Args:
            advisor_id: UUID of the advisor

        Returns:
            List of custom badge records
        """
        try:
            response = self.supabase.table('badges')\
                .select('*')\
                .eq('created_by', advisor_id)\
                .eq('is_custom', True)\
                .order('created_at', desc=True)\
                .execute()

            return response.data if response.data else []

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

        Args:
            badge_id: UUID of the badge
            advisor_id: UUID of the advisor
            updates: Dictionary of fields to update

        Returns:
            Updated badge record
        """
        try:
            # Verify ownership
            badge = self.supabase.table('badges')\
                .select('created_by, is_custom')\
                .eq('id', badge_id)\
                .single()\
                .execute()

            if not badge.data:
                raise ValueError("Badge not found")

            if badge.data['created_by'] != advisor_id:
                raise ValueError("Not authorized to edit this badge")

            if not badge.data.get('is_custom', False):
                raise ValueError("Cannot edit system badges")

            # Add updated_at timestamp
            updates['updated_at'] = datetime.utcnow().isoformat()

            # Update badge
            response = self.supabase.table('badges')\
                .update(updates)\
                .eq('id', badge_id)\
                .execute()

            if not response.data:
                raise Exception("Failed to update badge")

            return response.data[0]

        except Exception as e:
            print(f"Error updating custom badge: {str(e)}", file=sys.stderr, flush=True)
            raise

    def delete_custom_badge(self, badge_id: str, advisor_id: str) -> bool:
        """
        Delete a custom badge (only by creator, only if no students have earned it)

        Args:
            badge_id: UUID of the badge
            advisor_id: UUID of the advisor

        Returns:
            Success boolean
        """
        try:
            # Verify ownership
            badge = self.supabase.table('badges')\
                .select('created_by, is_custom')\
                .eq('id', badge_id)\
                .single()\
                .execute()

            if not badge.data:
                raise ValueError("Badge not found")

            if badge.data['created_by'] != advisor_id:
                raise ValueError("Not authorized to delete this badge")

            if not badge.data.get('is_custom', False):
                raise ValueError("Cannot delete system badges")

            # Check if any students have earned this badge
            earned_count = self.supabase.table('user_badges')\
                .select('id', count='exact')\
                .eq('badge_id', badge_id)\
                .eq('earned', True)\
                .execute()

            if earned_count.count and earned_count.count > 0:
                raise ValueError("Cannot delete badge that students have earned")

            # Delete badge
            self.supabase.table('badges')\
                .delete()\
                .eq('id', badge_id)\
                .execute()

            return True

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
            # Verify advisor relationship
            student = self.supabase.table('users')\
                .select('id, display_name, advisor_id, total_xp, level, last_active')\
                .eq('id', student_id)\
                .single()\
                .execute()

            if not student.data:
                raise ValueError("Student not found")

            # Allow if advisor is assigned or has admin role
            advisor_check = self.supabase.table('users')\
                .select('role')\
                .eq('id', advisor_id)\
                .single()\
                .execute()

            is_admin = advisor_check.data and advisor_check.data['role'] == 'admin'
            is_assigned_advisor = student.data.get('advisor_id') == advisor_id

            if not (is_admin or is_assigned_advisor):
                raise ValueError("Not authorized to view this student's progress")

            # Get badge progress
            badges = self.supabase.table('user_badges')\
                .select('badge_id, progress, earned, earned_at, badges(name, primary_pillar, min_quests)')\
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
