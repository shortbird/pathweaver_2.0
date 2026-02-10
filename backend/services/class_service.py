"""
Class Service - Business logic for organization classes

Provides class management including:
- Class CRUD operations
- Advisor assignment
- Student enrollment
- Quest management
- XP progress calculation
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from services.base_service import BaseService, ValidationError, NotFoundError
from repositories.class_repository import ClassRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class ClassService(BaseService):
    """Business logic for organization class management"""

    def __init__(self):
        super().__init__()
        self.class_repo = ClassRepository()

    # ===== Class CRUD =====

    def create_class(
        self,
        org_id: str,
        name: str,
        description: Optional[str],
        xp_threshold: int,
        created_by: str
    ) -> Dict[str, Any]:
        """Create a new class for an organization"""
        self.validate_required(
            org_id=org_id,
            name=name,
            created_by=created_by
        )

        if xp_threshold < 0:
            raise ValidationError("XP threshold must be non-negative")

        data = {
            'organization_id': org_id,
            'name': name.strip(),
            'description': description.strip() if description else None,
            'xp_threshold': xp_threshold,
            'created_by': created_by,
            'status': 'active'
        }

        cls = self.class_repo.create_class(data)
        logger.info(f"Class created: {cls['id']} in org {org_id} by {created_by}")

        return cls

    def get_class(self, class_id: str) -> Dict[str, Any]:
        """Get a class by ID with details"""
        self.validate_required(class_id=class_id)

        cls = self.class_repo.get_class_with_details(class_id)
        if not cls:
            raise NotFoundError(f"Class {class_id} not found")

        # Add counts
        cls['student_count'] = self.class_repo._get_enrollment_count(class_id)
        cls['quest_count'] = self.class_repo._get_quest_count(class_id)
        cls['advisor_count'] = self.class_repo._get_advisor_count(class_id)

        return cls

    def update_class(
        self,
        class_id: str,
        updates: Dict[str, Any],
        updated_by: str
    ) -> Dict[str, Any]:
        """Update class details"""
        self.validate_required(class_id=class_id, updated_by=updated_by)

        # Validate allowed fields
        allowed_fields = {'name', 'description', 'xp_threshold', 'status'}
        filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}

        if not filtered_updates:
            raise ValidationError("No valid fields to update")

        # Validate xp_threshold if provided
        if 'xp_threshold' in filtered_updates:
            if filtered_updates['xp_threshold'] < 0:
                raise ValidationError("XP threshold must be non-negative")

        # Validate status if provided
        if 'status' in filtered_updates:
            self.validate_one_of('status', filtered_updates['status'], ['active', 'archived'])

        # Strip string fields
        if 'name' in filtered_updates and filtered_updates['name']:
            filtered_updates['name'] = filtered_updates['name'].strip()
        if 'description' in filtered_updates and filtered_updates['description']:
            filtered_updates['description'] = filtered_updates['description'].strip()

        cls = self.class_repo.update_class(class_id, filtered_updates)

        # Check if XP threshold changed - need to update completion status
        if 'xp_threshold' in filtered_updates:
            self._check_and_update_completions(class_id)

        logger.info(f"Class {class_id} updated by {updated_by}")

        return cls

    def archive_class(self, class_id: str, archived_by: str) -> Dict[str, Any]:
        """Archive a class"""
        self.validate_required(class_id=class_id, archived_by=archived_by)

        cls = self.class_repo.archive_class(class_id)
        logger.info(f"Class {class_id} archived by {archived_by}")

        return cls

    def list_org_classes(
        self,
        org_id: str,
        status: Optional[str] = 'active'
    ) -> List[Dict[str, Any]]:
        """List all classes for an organization"""
        self.validate_required(org_id=org_id)

        if status:
            self.validate_one_of('status', status, ['active', 'archived'])

        return self.class_repo.list_org_classes(org_id, status=status)

    # ===== Advisor Management =====

    def add_advisor(
        self,
        class_id: str,
        advisor_id: str,
        assigned_by: str
    ) -> Dict[str, Any]:
        """Add an advisor to a class"""
        self.validate_required(
            class_id=class_id,
            advisor_id=advisor_id,
            assigned_by=assigned_by
        )

        result = self.class_repo.add_advisor(class_id, advisor_id, assigned_by)
        logger.info(f"Advisor {advisor_id} added to class {class_id} by {assigned_by}")

        return result

    def remove_advisor(
        self,
        class_id: str,
        advisor_id: str,
        removed_by: str
    ) -> bool:
        """Remove an advisor from a class"""
        self.validate_required(
            class_id=class_id,
            advisor_id=advisor_id,
            removed_by=removed_by
        )

        success = self.class_repo.remove_advisor(class_id, advisor_id)
        if success:
            logger.info(f"Advisor {advisor_id} removed from class {class_id} by {removed_by}")

        return success

    def get_class_advisors(self, class_id: str) -> List[Dict[str, Any]]:
        """Get all advisors for a class"""
        self.validate_required(class_id=class_id)
        return self.class_repo.get_class_advisors(class_id)

    def get_advisor_classes(
        self,
        advisor_id: str,
        status: Optional[str] = 'active'
    ) -> List[Dict[str, Any]]:
        """Get all classes an advisor is assigned to"""
        self.validate_required(advisor_id=advisor_id)

        classes = self.class_repo.get_advisor_classes(advisor_id, status=status)

        # Add counts for each class
        for cls in classes:
            cls['student_count'] = self.class_repo._get_enrollment_count(cls['id'])
            cls['quest_count'] = self.class_repo._get_quest_count(cls['id'])
            cls['advisor_count'] = self.class_repo._get_advisor_count(cls['id'])

        return classes

    def is_class_advisor(self, class_id: str, user_id: str) -> bool:
        """Check if a user is an advisor for a class"""
        return self.class_repo.is_class_advisor(class_id, user_id)

    # ===== Student Enrollment =====

    def enroll_student(
        self,
        class_id: str,
        student_id: str,
        enrolled_by: str
    ) -> Dict[str, Any]:
        """Enroll a student in a class"""
        self.validate_required(
            class_id=class_id,
            student_id=student_id,
            enrolled_by=enrolled_by
        )

        result = self.class_repo.enroll_student(class_id, student_id, enrolled_by)
        logger.info(f"Student {student_id} enrolled in class {class_id} by {enrolled_by}")

        # Check if student already has enough XP to complete
        self._check_student_completion(class_id, student_id)

        return result

    def enroll_students_bulk(
        self,
        class_id: str,
        student_ids: List[str],
        enrolled_by: str
    ) -> List[Dict[str, Any]]:
        """Enroll multiple students in a class"""
        self.validate_required(
            class_id=class_id,
            enrolled_by=enrolled_by
        )

        if not student_ids:
            raise ValidationError("No students provided for enrollment")

        results = self.class_repo.enroll_students_bulk(class_id, student_ids, enrolled_by)
        logger.info(f"{len(student_ids)} students enrolled in class {class_id} by {enrolled_by}")

        # Check completion status for all enrolled students
        for student_id in student_ids:
            self._check_student_completion(class_id, student_id)

        return results

    def withdraw_student(
        self,
        class_id: str,
        student_id: str,
        withdrawn_by: str
    ) -> bool:
        """Withdraw a student from a class"""
        self.validate_required(
            class_id=class_id,
            student_id=student_id,
            withdrawn_by=withdrawn_by
        )

        success = self.class_repo.withdraw_student(class_id, student_id)
        if success:
            logger.info(f"Student {student_id} withdrawn from class {class_id} by {withdrawn_by}")

        return success

    def get_class_students(
        self,
        class_id: str,
        status: Optional[str] = 'active'
    ) -> List[Dict[str, Any]]:
        """Get all students enrolled in a class"""
        self.validate_required(class_id=class_id)

        if status:
            self.validate_one_of('status', status, ['active', 'completed', 'withdrawn'])

        return self.class_repo.get_class_students(class_id, status=status)

    def get_class_students_with_progress(self, class_id: str) -> List[Dict[str, Any]]:
        """Get all students with their progress information"""
        self.validate_required(class_id=class_id)
        return self.class_repo.get_class_progress_bulk(class_id)

    # ===== Quest Management =====

    def add_quest(
        self,
        class_id: str,
        quest_id: str,
        added_by: str,
        sequence_order: Optional[int] = None
    ) -> Dict[str, Any]:
        """Add a quest to a class"""
        self.validate_required(
            class_id=class_id,
            quest_id=quest_id,
            added_by=added_by
        )

        # Get current max sequence order if not provided
        if sequence_order is None:
            quests = self.class_repo.get_class_quests(class_id)
            sequence_order = len(quests)

        result = self.class_repo.add_quest(class_id, quest_id, added_by, sequence_order)
        logger.info(f"Quest {quest_id} added to class {class_id} by {added_by}")

        return result

    def remove_quest(
        self,
        class_id: str,
        quest_id: str,
        removed_by: str
    ) -> bool:
        """Remove a quest from a class"""
        self.validate_required(
            class_id=class_id,
            quest_id=quest_id,
            removed_by=removed_by
        )

        success = self.class_repo.remove_quest(class_id, quest_id)
        if success:
            logger.info(f"Quest {quest_id} removed from class {class_id} by {removed_by}")

        return success

    def get_class_quests(self, class_id: str) -> List[Dict[str, Any]]:
        """Get all quests for a class"""
        self.validate_required(class_id=class_id)
        return self.class_repo.get_class_quests(class_id)

    def reorder_quests(
        self,
        class_id: str,
        quest_ids: List[str],
        reordered_by: str
    ) -> List[Dict[str, Any]]:
        """Reorder quests in a class"""
        self.validate_required(
            class_id=class_id,
            reordered_by=reordered_by
        )

        if not quest_ids:
            raise ValidationError("No quest IDs provided for reordering")

        results = self.class_repo.reorder_quests(class_id, quest_ids)
        logger.info(f"Quests reordered in class {class_id} by {reordered_by}")

        return results

    # ===== Progress Calculation =====

    def calculate_student_class_progress(
        self,
        class_id: str,
        student_id: str
    ) -> Dict[str, Any]:
        """Calculate a student's progress toward class completion"""
        self.validate_required(
            class_id=class_id,
            student_id=student_id
        )

        # Get class XP threshold
        cls = self.class_repo.find_by_id(class_id)
        if not cls:
            raise NotFoundError(f"Class {class_id} not found")

        xp_threshold = cls.get('xp_threshold', 100)

        # Get earned XP
        earned_xp = self.class_repo.get_student_class_xp(class_id, student_id)

        # Calculate progress
        percentage = min(100, int((earned_xp / xp_threshold) * 100)) if xp_threshold > 0 else 0
        is_complete = earned_xp >= xp_threshold

        return {
            'earned_xp': earned_xp,
            'xp_threshold': xp_threshold,
            'percentage': percentage,
            'is_complete': is_complete
        }

    # ===== Authorization =====

    def can_access_class(
        self,
        class_id: str,
        user_id: str,
        user_role: str,
        user_org_id: Optional[str] = None
    ) -> bool:
        """Check if a user can access a class"""
        return self.class_repo.can_user_access_class(
            class_id, user_id, user_role, user_org_id
        )

    def can_manage_class(
        self,
        class_id: str,
        user_id: str,
        user_role: str,
        user_org_id: Optional[str] = None
    ) -> bool:
        """Check if a user can manage (modify) a class"""
        return self.class_repo.can_user_manage_class(
            class_id, user_id, user_role, user_org_id
        )

    # ===== Private Helpers =====

    def _check_student_completion(self, class_id: str, student_id: str) -> None:
        """Check if a student has completed a class and update status"""
        progress = self.calculate_student_class_progress(class_id, student_id)

        if progress['is_complete']:
            self.class_repo.update_enrollment_status(
                class_id,
                student_id,
                'completed',
                completed_at=datetime.utcnow().isoformat()
            )
            logger.info(f"Student {student_id} completed class {class_id}")

    def _check_and_update_completions(self, class_id: str) -> None:
        """Check and update completion status for all students in a class"""
        students = self.class_repo.get_class_students(class_id, status=None)

        for enrollment in students:
            student_id = enrollment.get('student_id')
            current_status = enrollment.get('status')

            progress = self.calculate_student_class_progress(class_id, student_id)

            # Update to completed if now complete and was active
            if progress['is_complete'] and current_status == 'active':
                self.class_repo.update_enrollment_status(
                    class_id,
                    student_id,
                    'completed',
                    completed_at=datetime.utcnow().isoformat()
                )
            # Update back to active if no longer complete and was completed
            elif not progress['is_complete'] and current_status == 'completed':
                self.class_repo.update_enrollment_status(
                    class_id,
                    student_id,
                    'active'
                )
