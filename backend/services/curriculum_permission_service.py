"""
Curriculum Permission Service

Centralized permission checking for curriculum and course operations.
Replaces scattered permission functions in curriculum.py and courses.py.

Usage:
    from services.curriculum_permission_service import CurriculumPermissionService
    from repositories.user_repository import UserRepository
    from repositories.quest_repository import QuestRepository

    permission_service = CurriculumPermissionService(
        user_repo=UserRepository(),
        quest_repo=QuestRepository()
    )

    # Check read permission
    if permission_service.can_read_curriculum(user_id, quest_id):
        # User can read

    # Check edit permission (returns quest data if permitted)
    result = permission_service.can_edit_curriculum(user_id, quest_id)
    if result.permitted:
        quest = result.data
"""

from typing import Optional, Dict, Any, NamedTuple
from dataclasses import dataclass
from services.base_service import BaseService, ValidationError, NotFoundError, PermissionError
from utils.logger import get_logger
from utils.roles import get_effective_role

logger = get_logger(__name__)


@dataclass
class PermissionResult:
    """Result of a permission check."""
    permitted: bool
    data: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    error_code: int = 403


class CurriculumPermissionService(BaseService):
    """
    Service for checking curriculum-related permissions.

    Centralizes all permission logic previously scattered across:
    - curriculum.py: verify_curriculum_read_permission, verify_curriculum_permission, verify_lesson_edit_permission
    - courses.py: inline permission checks for course management
    """

    # Roles that can always edit curriculum
    CURRICULUM_EDIT_ROLES = {'superadmin', 'org_admin', 'advisor'}

    # Roles that can always read curriculum
    CURRICULUM_READ_ROLES = {'superadmin', 'org_admin', 'advisor'}

    # Roles that can manage courses
    COURSE_MANAGE_ROLES = {'superadmin', 'org_admin', 'advisor'}

    def __init__(self, supabase_client):
        """
        Initialize with Supabase client.

        Args:
            supabase_client: Supabase admin client for permission checks
        """
        super().__init__()
        self.client = supabase_client

    def _get_user(self, user_id: str) -> Dict[str, Any]:
        """Get user data for permission checks."""
        result = self.client.table('users').select('id, role, org_role, organization_id').eq('id', user_id).execute()
        if not result.data:
            raise NotFoundError(f"User not found: {user_id}")
        return result.data[0]

    def _get_quest(self, quest_id: str) -> Dict[str, Any]:
        """Get quest data for permission checks."""
        result = self.client.table('quests').select('id, title, organization_id').eq('id', quest_id).execute()
        if not result.data:
            raise NotFoundError(f"Quest not found: {quest_id}")
        return result.data[0]

    def _get_course(self, course_id: str) -> Dict[str, Any]:
        """Get course data for permission checks."""
        result = self.client.table('courses').select('id, title, organization_id, created_by').eq('id', course_id).execute()
        if not result.data:
            raise NotFoundError(f"Course not found: {course_id}")
        return result.data[0]

    def _get_lesson(self, lesson_id: str, quest_id: str) -> Dict[str, Any]:
        """Get lesson data for permission checks."""
        result = self.client.table('curriculum_lessons')\
            .select('id, quest_id, organization_id, created_by')\
            .eq('id', lesson_id)\
            .eq('quest_id', quest_id)\
            .execute()
        if not result.data:
            raise NotFoundError(f"Lesson not found: {lesson_id}")
        return result.data[0]

    def can_read_curriculum(self, user_id: str, quest_id: str) -> bool:
        """
        Check if user can read curriculum for a quest.

        Allows:
        - Admins, advisors (org-scoped or superadmin)
        - Students enrolled in the quest
        - Students enrolled in a course containing the quest

        Args:
            user_id: User ID to check
            quest_id: Quest ID

        Returns:
            True if permitted

        Raises:
            NotFoundError: If user or quest not found
            PermissionError: If permission denied
        """
        try:
            if not user_id or not quest_id:
                raise ValidationError("Missing user_id or quest_id")

            user = self._get_user(user_id)
            user_role = get_effective_role(user)
            user_org = user.get('organization_id')

            # Admins and advisors can always read
            if user_role in self.CURRICULUM_READ_ROLES:
                return True

            quest = self._get_quest(quest_id)
            quest_org = quest.get('organization_id')

            # For organization quests, user must be in same org
            if quest_org is not None and quest_org != user_org:
                raise PermissionError("You cannot access this quest")

            # Check direct quest enrollment
            enrollment = self.client.table('user_quests')\
                .select('id')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .eq('is_active', True)\
                .execute()

            if enrollment.data:
                return True

            # Check course enrollment (user might be in a course containing this quest)
            try:
                course_enrollment = self.client.table('course_enrollments')\
                    .select('id, course_id')\
                    .eq('user_id', user_id)\
                    .eq('status', 'active')\
                    .execute()

                if course_enrollment.data:
                    course_ids = [e['course_id'] for e in course_enrollment.data]
                    if course_ids:
                        quest_in_course = self.client.table('course_quests')\
                            .select('id')\
                            .eq('quest_id', quest_id)\
                            .in_('course_id', course_ids)\
                            .execute()
                        if quest_in_course.data:
                            return True
            except Exception as course_err:
                logger.warning(f"Error checking course enrollment: {course_err}")

            raise PermissionError("You must be enrolled in this quest to access curriculum")

        except (ValidationError, NotFoundError, PermissionError):
            raise
        except Exception as e:
            logger.error(f"Error checking curriculum read permission: {str(e)}", exc_info=True)
            raise PermissionError(f"Permission check failed: {str(e)}")

    def can_edit_curriculum(self, user_id: str, quest_id: str) -> PermissionResult:
        """
        Check if user can edit curriculum for a quest.

        Allows:
        - Superadmins (any quest)
        - Org admins and advisors (their org's quests only)

        Args:
            user_id: User ID to check
            quest_id: Quest ID

        Returns:
            PermissionResult with quest data if permitted
        """
        try:
            user = self._get_user(user_id)
            user_role = get_effective_role(user)
            user_org = user.get('organization_id')

            # Check role
            if user_role not in self.CURRICULUM_EDIT_ROLES:
                return PermissionResult(
                    permitted=False,
                    error_message="Only administrators and advisors can edit curriculum",
                    error_code=403
                )

            quest = self._get_quest(quest_id)
            quest_org = quest.get('organization_id')

            # For org-specific quests, user must be in same org (unless superadmin)
            if user_role != 'superadmin' and quest_org is not None and quest_org != user_org:
                return PermissionResult(
                    permitted=False,
                    error_message="You can only edit curriculum for quests in your organization",
                    error_code=403
                )

            # Add user info to quest for downstream use
            quest['_user_role'] = user_role
            quest['_user_org'] = user_org

            return PermissionResult(permitted=True, data=quest)

        except NotFoundError as e:
            return PermissionResult(
                permitted=False,
                error_message=str(e),
                error_code=404
            )
        except Exception as e:
            logger.error(f"Error checking curriculum edit permission: {str(e)}", exc_info=True)
            return PermissionResult(
                permitted=False,
                error_message=f"Permission check failed: {str(e)}",
                error_code=500
            )

    def can_edit_lesson(self, user_id: str, lesson_id: str, quest_id: str) -> PermissionResult:
        """
        Check if user can edit a specific lesson.

        Users can only edit lessons created by their organization.
        Superadmins can edit any lesson.

        Args:
            user_id: User ID to check
            lesson_id: Lesson ID to edit
            quest_id: Quest ID (for validation)

        Returns:
            PermissionResult with lesson data if permitted
        """
        try:
            user = self._get_user(user_id)
            user_role = get_effective_role(user)
            user_org = user.get('organization_id')

            lesson = self._get_lesson(lesson_id, quest_id)
            lesson_org = lesson.get('organization_id')

            # Superadmins can edit anything
            if user_role == 'superadmin':
                return PermissionResult(permitted=True, data=lesson)

            # Non-superadmins can only edit lessons from their organization
            if lesson_org != user_org:
                return PermissionResult(
                    permitted=False,
                    error_message="You can only edit curriculum created by your organization",
                    error_code=403
                )

            return PermissionResult(permitted=True, data=lesson)

        except NotFoundError as e:
            return PermissionResult(
                permitted=False,
                error_message=str(e),
                error_code=404
            )
        except Exception as e:
            logger.error(f"Error checking lesson edit permission: {str(e)}", exc_info=True)
            return PermissionResult(
                permitted=False,
                error_message=f"Permission check failed: {str(e)}",
                error_code=500
            )

    def can_manage_course(self, user_id: str, course_id: str) -> PermissionResult:
        """
        Check if user can manage a course (edit, delete, add/remove quests).

        Allows:
        - Course creator
        - Superadmins
        - Org admins/advisors in the same organization

        Args:
            user_id: User ID to check
            course_id: Course ID

        Returns:
            PermissionResult with course data if permitted
        """
        try:
            user = self._get_user(user_id)
            user_role = get_effective_role(user)
            user_org = user.get('organization_id')

            course = self._get_course(course_id)
            course_org = course.get('organization_id')
            course_creator = course.get('created_by')

            # Course creator always has permission
            if course_creator == user_id:
                return PermissionResult(permitted=True, data=course)

            # Superadmins can manage any course
            if user_role == 'superadmin':
                return PermissionResult(permitted=True, data=course)

            # Org admins/advisors can manage courses in their org
            if user_role in self.COURSE_MANAGE_ROLES:
                if course_org == user_org:
                    return PermissionResult(permitted=True, data=course)

            return PermissionResult(
                permitted=False,
                error_message="You don't have permission to manage this course",
                error_code=403
            )

        except NotFoundError as e:
            return PermissionResult(
                permitted=False,
                error_message=str(e),
                error_code=404
            )
        except Exception as e:
            logger.error(f"Error checking course management permission: {str(e)}", exc_info=True)
            return PermissionResult(
                permitted=False,
                error_message=f"Permission check failed: {str(e)}",
                error_code=500
            )

    def require_curriculum_read(self, user_id: str, quest_id: str) -> bool:
        """
        Require curriculum read permission, raising on failure.

        Convenience method that raises AuthorizationError if permission denied.
        Use in routes where you want automatic error responses.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            True if permitted

        Raises:
            PermissionError: If permission denied
        """
        return self.can_read_curriculum(user_id, quest_id)

    def require_curriculum_edit(self, user_id: str, quest_id: str) -> Dict[str, Any]:
        """
        Require curriculum edit permission, raising on failure.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            Quest data if permitted

        Raises:
            ValidationError: If permission denied (with appropriate error code)
        """
        result = self.can_edit_curriculum(user_id, quest_id)
        if not result.permitted:
            raise ValidationError(result.error_message, result.error_code)
        return result.data

    def require_lesson_edit(self, user_id: str, lesson_id: str, quest_id: str) -> Dict[str, Any]:
        """
        Require lesson edit permission, raising on failure.

        Args:
            user_id: User ID
            lesson_id: Lesson ID
            quest_id: Quest ID

        Returns:
            Lesson data if permitted

        Raises:
            ValidationError: If permission denied
        """
        result = self.can_edit_lesson(user_id, lesson_id, quest_id)
        if not result.permitted:
            raise ValidationError(result.error_message, result.error_code)
        return result.data

    def require_course_manage(self, user_id: str, course_id: str) -> Dict[str, Any]:
        """
        Require course management permission, raising on failure.

        Args:
            user_id: User ID
            course_id: Course ID

        Returns:
            Course data if permitted

        Raises:
            ValidationError: If permission denied
        """
        result = self.can_manage_course(user_id, course_id)
        if not result.permitted:
            raise ValidationError(result.error_message, result.error_code)
        return result.data
