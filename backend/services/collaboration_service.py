"""
Collaboration Service - Business logic for collaborative quest functionality
Handles collaboration group creation, member management, and evidence sharing/approval
Part of Phase 3: Collaborative quest workflow
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from database import get_supabase_admin_client, get_user_client
from middleware.error_handler import ValidationError, NotFoundError

from utils.logger import get_logger

logger = get_logger(__name__)


class CollaborationService:
    """Service for handling collaborative quest operations."""

    def create_collaboration(
        self,
        creator_id: str,
        quest_id: str,
        member_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Create a new collaboration group.

        Args:
            creator_id: User ID of the creator (advisor/admin)
            quest_id: Quest ID for the collaboration
            member_ids: List of user IDs to add as members

        Returns:
            Dictionary with collaboration_id and success status

        Raises:
            ValidationError: If quest_id is missing or member_ids < 2
            NotFoundError: If user or quest not found
        """
        if not quest_id:
            raise ValidationError('quest_id is required')

        if not member_ids or len(member_ids) < 2:
            raise ValidationError('At least 2 members are required for collaboration')

        try:
            supabase = get_supabase_admin_client()

            # Get user's organization
            user = supabase.table('users')\
                .select('organization_id')\
                .eq('id', creator_id)\
                .single()\
                .execute()

            if not user.data:
                raise NotFoundError('User not found')

            organization_id = user.data['organization_id']

            # Verify quest exists and belongs to organization
            quest = supabase.table('quests')\
                .select('id, organization_id')\
                .eq('id', quest_id)\
                .single()\
                .execute()

            if not quest.data:
                raise NotFoundError('Quest not found')

            # Create collaboration
            collaboration_result = supabase.table('quest_collaborations').insert({
                'quest_id': quest_id,
                'created_by': creator_id,
                'organization_id': organization_id
            }).execute()

            collaboration_id = collaboration_result.data[0]['id']

            # Add members
            members_data = [
                {
                    'collaboration_id': collaboration_id,
                    'user_id': member_id
                }
                for member_id in member_ids
            ]

            supabase.table('quest_collaboration_members').insert(members_data).execute()

            logger.info(f"Collaboration {collaboration_id} created by {creator_id} with {len(member_ids)} members")

            return {
                'collaboration_id': collaboration_id,
                'member_count': len(member_ids)
            }

        except (ValidationError, NotFoundError):
            raise
        except Exception as e:
            logger.error(f"Error creating collaboration: {str(e)}")
            raise Exception('Failed to create collaboration')

    def add_members(
        self,
        collaboration_id: str,
        user_ids: List[str]
    ) -> int:
        """
        Add members to an existing collaboration group.

        Args:
            collaboration_id: Collaboration ID
            user_ids: List of user IDs to add

        Returns:
            Number of members added

        Raises:
            NotFoundError: If collaboration not found
        """
        try:
            supabase = get_supabase_admin_client()

            # Verify collaboration exists
            collaboration = supabase.table('quest_collaborations')\
                .select('id')\
                .eq('id', collaboration_id)\
                .single()\
                .execute()

            if not collaboration.data:
                raise NotFoundError('Collaboration not found')

            # Add members
            members_data = [
                {
                    'collaboration_id': collaboration_id,
                    'user_id': user_id
                }
                for user_id in user_ids
            ]

            supabase.table('quest_collaboration_members').insert(members_data).execute()

            logger.info(f"Added {len(user_ids)} members to collaboration {collaboration_id}")

            return len(user_ids)

        except NotFoundError:
            raise
        except Exception as e:
            logger.error(f"Error adding members to collaboration: {str(e)}")
            raise Exception('Failed to add members')

    def share_evidence(
        self,
        user_id: str,
        task_completion_id: str,
        collaboration_id: str,
        evidence_url: Optional[str] = None,
        description: str = ''
    ) -> Dict[str, Any]:
        """
        Share task completion evidence with collaboration group.

        Args:
            user_id: User sharing the evidence
            task_completion_id: Task completion ID
            collaboration_id: Collaboration ID
            evidence_url: Optional evidence URL
            description: Optional description

        Returns:
            Dictionary with evidence_id and pending_approval_count

        Raises:
            ValidationError: If collaboration_id is missing
            NotFoundError: If task completion not found
        """
        if not collaboration_id:
            raise ValidationError('collaboration_id is required')

        try:
            supabase = get_supabase_admin_client()

            # Verify user is member of collaboration
            member = supabase.table('quest_collaboration_members')\
                .select('id')\
                .eq('collaboration_id', collaboration_id)\
                .eq('user_id', user_id)\
                .execute()

            if not member.data:
                raise ValidationError('User is not a member of this collaboration')

            # Verify task completion exists and belongs to user
            task_completion = supabase.table('quest_task_completions')\
                .select('id, user_id')\
                .eq('id', task_completion_id)\
                .single()\
                .execute()

            if not task_completion.data or task_completion.data['user_id'] != user_id:
                raise NotFoundError('Task completion not found or access denied')

            # Create shared evidence
            shared_evidence = supabase.table('shared_evidence').insert({
                'task_completion_id': task_completion_id,
                'submitted_by': user_id,
                'collaboration_id': collaboration_id,
                'evidence_url': evidence_url,
                'description': description
            }).execute()

            evidence_id = shared_evidence.data[0]['id']

            # Create pending approval entries for other members
            members = supabase.table('quest_collaboration_members')\
                .select('user_id')\
                .eq('collaboration_id', collaboration_id)\
                .neq('user_id', user_id)\
                .execute()

            approval_entries = [
                {
                    'shared_evidence_id': evidence_id,
                    'user_id': member['user_id'],
                    'status': 'pending'
                }
                for member in members.data
            ]

            if approval_entries:
                supabase.table('shared_evidence_approvals').insert(approval_entries).execute()

            logger.info(f"Evidence shared for task completion {task_completion_id} in collaboration {collaboration_id}")

            return {
                'evidence_id': evidence_id,
                'pending_approval_count': len(approval_entries)
            }

        except (ValidationError, NotFoundError):
            raise
        except Exception as e:
            logger.error(f"Error sharing evidence: {str(e)}")
            raise Exception('Failed to share evidence')

    def approve_evidence(
        self,
        user_id: str,
        evidence_id: str,
        comments: str = ''
    ) -> bool:
        """
        Approve shared evidence.

        Args:
            user_id: User approving the evidence
            evidence_id: Shared evidence ID
            comments: Optional approval comments

        Returns:
            True if successful
        """
        try:
            supabase = get_supabase_admin_client()

            # Update approval status
            supabase.table('shared_evidence_approvals')\
                .update({
                    'status': 'approved',
                    'comments': comments,
                    'responded_at': datetime.utcnow().isoformat()
                })\
                .eq('shared_evidence_id', evidence_id)\
                .eq('user_id', user_id)\
                .execute()

            logger.info(f"Evidence {evidence_id} approved by {user_id}")

            return True

        except Exception as e:
            logger.error(f"Error approving evidence: {str(e)}")
            raise Exception('Failed to approve evidence')

    def get_pending_approvals(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get evidence submissions pending this user's approval.

        Args:
            user_id: User ID

        Returns:
            List of pending approval dictionaries
        """
        try:
            supabase = get_user_client(user_id)

            # Get pending approvals for this user
            approvals = supabase.table('shared_evidence_approvals')\
                .select('*, shared_evidence(*, quest_task_completions(*, user_quest_tasks(title)), users!submitted_by(display_name))')\
                .eq('user_id', user_id)\
                .eq('status', 'pending')\
                .execute()

            return approvals.data or []

        except Exception as e:
            logger.error(f"Error fetching pending approvals: {str(e)}")
            raise Exception('Failed to fetch pending approvals')

    def get_collaborators_for_quest(
        self,
        quest_id: str,
        user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all collaborators for a specific quest.
        Optionally filter to collaborations the user is part of.

        Args:
            quest_id: Quest ID
            user_id: Optional user ID to filter by membership

        Returns:
            List of collaboration dictionaries with members
        """
        try:
            supabase = get_supabase_admin_client()

            # Get collaborations for this quest
            query = supabase.table('quest_collaborations')\
                .select('*, users!created_by(id, display_name)')\
                .eq('quest_id', quest_id)

            collaborations = query.execute()

            result = []
            for collab in collaborations.data or []:
                # Get members for this collaboration
                members = supabase.table('quest_collaboration_members')\
                    .select('*, users(id, display_name, email)')\
                    .eq('collaboration_id', collab['id'])\
                    .execute()

                # If user_id specified, only include if user is a member
                if user_id:
                    member_ids = [m['user_id'] for m in members.data]
                    if user_id not in member_ids:
                        continue

                result.append({
                    **collab,
                    'members': members.data
                })

            return result

        except Exception as e:
            logger.error(f"Error fetching collaborators for quest: {str(e)}")
            raise Exception('Failed to fetch collaborators')
