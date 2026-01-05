"""
Quest Invitation Service

Business logic for quest invitations - advisor/admin inviting students to join specific quests.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
from services.base_service import BaseService
from services.notification_service import NotificationService
from repositories.quest_invitation_repository import QuestInvitationRepository
from repositories.user_repository import UserRepository
from repositories.quest_repository import QuestRepository
from database import get_supabase_admin_client, get_user_client
from middleware.error_handler import ValidationError, NotFoundError, AuthorizationError

from utils.logger import get_logger

logger = get_logger(__name__)


class QuestInvitationService(BaseService):
    """Service for managing quest invitations."""

    def __init__(self):
        super().__init__()
        self.admin_client = get_supabase_admin_client()
        # Repositories use admin client when user_id is None
        self.invitation_repo = QuestInvitationRepository()
        self.user_repo = UserRepository()
        self.quest_repo = QuestRepository()
        self.notification_service = NotificationService()

    def invite_students_to_quest(
        self,
        advisor_id: str,
        quest_id: str,
        user_ids: List[str],
        expires_at: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Advisor/admin invites students to a quest.

        Args:
            advisor_id: Advisor/admin user ID
            quest_id: Quest ID
            user_ids: List of student user IDs
            expires_at: Optional expiration datetime (ISO format)

        Returns:
            Dict with invitations_created count and invitation list

        Raises:
            AuthorizationError: If advisor lacks permission
            NotFoundError: If quest not found
            ValidationError: If students not in same org
        """
        try:
            # Verify advisor role and get org
            advisor = self.user_repo.find_by_id(advisor_id)
            if not advisor:
                raise NotFoundError("Advisor not found")

            if advisor['role'] not in ['advisor', 'org_admin', 'superadmin']:
                raise AuthorizationError("Only advisors and admins can invite students to quests")

            organization_id = advisor.get('organization_id')
            if not organization_id:
                raise ValidationError("Advisor must belong to an organization")

            # Verify quest exists
            quest = self.quest_repo.find_by_id(quest_id)
            if not quest:
                raise NotFoundError(f"Quest {quest_id} not found")

            # Get advisor name for notifications
            advisor_name = advisor.get('display_name') or advisor.get('email', 'Your advisor')
            quest_title = quest.get('title', 'Quest')

            # Verify all students belong to same org
            invitations = []
            for user_id in user_ids:
                student = self.user_repo.find_by_id(user_id)

                if not student:
                    logger.warning(f"Student {user_id} not found, skipping")
                    continue

                if student.get('organization_id') != organization_id:
                    logger.warning(f"Student {user_id} not in same org as advisor, skipping")
                    continue

                # Create invitation
                invitation = self.invitation_repo.create_invitation(
                    organization_id=organization_id,
                    quest_id=quest_id,
                    user_id=user_id,
                    invited_by=advisor_id,
                    expires_at=expires_at
                )

                invitations.append(invitation)

                # Send notification to student
                try:
                    self.notification_service.notify_quest_invitation(
                        user_id=user_id,
                        quest_title=quest_title,
                        advisor_name=advisor_name,
                        quest_id=quest_id,
                        organization_id=organization_id
                    )
                    logger.info(f"Sent quest invitation notification to student {user_id[:8]}")
                except Exception as notif_error:
                    logger.error(f"Failed to send notification to {user_id}: {notif_error}")
                    # Don't fail the whole operation if notification fails

            logger.info(f"Advisor {advisor_id} created {len(invitations)} quest invitations")

            return {
                'invitations_created': len(invitations),
                'invitations': invitations
            }

        except Exception as e:
            logger.error(f"Error inviting students to quest: {e}")
            raise

    def get_student_invitations(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all pending invitations for a student.

        Args:
            user_id: Student user ID

        Returns:
            List of pending invitations with quest details
        """
        try:
            return self.invitation_repo.get_pending_for_user(user_id)

        except Exception as e:
            logger.error(f"Error fetching invitations for student {user_id}: {e}")
            raise

    def accept_invitation(self, invitation_id: str, user_id: str) -> Dict[str, Any]:
        """
        Student accepts a quest invitation and auto-enrolls in the quest.

        Args:
            invitation_id: Invitation ID
            user_id: Student user ID

        Returns:
            Dict with updated invitation and quest enrollment info

        Raises:
            NotFoundError: If invitation not found
            ValidationError: If invitation invalid
        """
        try:
            # Accept the invitation
            invitation = self.invitation_repo.accept_invitation(invitation_id, user_id)

            # Auto-enroll student in quest
            quest_id = invitation['quest_id']

            # Check if already enrolled
            existing_quest = self.admin_client.table('user_quests')\
                .select('id, status')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            if existing_quest.data and len(existing_quest.data) > 0:
                logger.info(f"Student {user_id} already enrolled in quest {quest_id}")
                return {
                    'invitation': invitation,
                    'quest_enrollment': existing_quest.data[0],
                    'already_enrolled': True
                }

            # Create user_quest enrollment
            enrollment_data = {
                'user_id': user_id,
                'quest_id': quest_id,
                'status': 'picked_up',
                'started_at': datetime.utcnow().isoformat(),
                'last_picked_up_at': datetime.utcnow().isoformat()
            }

            enrollment = self.admin_client.table('user_quests')\
                .insert(enrollment_data)\
                .execute()

            logger.info(f"Student {user_id} accepted invitation and enrolled in quest {quest_id}")

            return {
                'invitation': invitation,
                'quest_enrollment': enrollment.data[0] if enrollment.data else None,
                'already_enrolled': False
            }

        except Exception as e:
            logger.error(f"Error accepting invitation {invitation_id}: {e}")
            raise

    def decline_invitation(self, invitation_id: str, user_id: str) -> Dict[str, Any]:
        """
        Student declines a quest invitation.

        Args:
            invitation_id: Invitation ID
            user_id: Student user ID

        Returns:
            Updated invitation

        Raises:
            NotFoundError: If invitation not found
            ValidationError: If invitation invalid
        """
        try:
            invitation = self.invitation_repo.decline_invitation(invitation_id, user_id)

            logger.info(f"Student {user_id} declined invitation {invitation_id}")

            return invitation

        except Exception as e:
            logger.error(f"Error declining invitation {invitation_id}: {e}")
            raise

    def get_organization_invitations(
        self,
        advisor_id: str,
        status: Optional[str] = None,
        quest_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all invitations for advisor's organization.

        Args:
            advisor_id: Advisor user ID
            status: Optional status filter
            quest_id: Optional quest ID filter

        Returns:
            List of invitations

        Raises:
            AuthorizationError: If user not advisor/admin
        """
        try:
            # Verify advisor and get org
            advisor = self.user_repo.find_by_id(advisor_id)

            if not advisor:
                raise NotFoundError("Advisor not found")

            if advisor['role'] not in ['advisor', 'org_admin', 'superadmin']:
                raise AuthorizationError("Only advisors and admins can view invitations")

            organization_id = advisor.get('organization_id')
            if not organization_id:
                raise ValidationError("Advisor must belong to an organization")

            return self.invitation_repo.get_invitations_by_organization(
                organization_id=organization_id,
                status=status,
                quest_id=quest_id
            )

        except Exception as e:
            logger.error(f"Error fetching org invitations: {e}")
            raise
