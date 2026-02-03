"""
Collaboration Routes - API endpoints for collaborative quest functionality
Handles collaboration group creation, member management, and evidence sharing/approval
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_role, require_auth
from middleware.error_handler import ValidationError, NotFoundError
from database import get_supabase_admin_client, get_user_client

from utils.logger import get_logger

logger = get_logger(__name__)

collaborations_bp = Blueprint('collaborations', __name__)

# ==================== Collaboration Management ====================

@collaborations_bp.route('/', methods=['POST'])
@collaborations_bp.route('', methods=['POST'])
@require_role('advisor', 'superadmin', 'org_admin')
def create_collaboration(user_id):
    """Create a new collaboration group (advisor/admin only)"""
    try:
        data = request.get_json()
        quest_id = data.get('quest_id')
        member_ids = data.get('member_ids', [])

        if not quest_id:
            raise ValidationError('quest_id is required')

        if not member_ids or len(member_ids) < 2:
            raise ValidationError('At least 2 members are required for collaboration')

        supabase = get_supabase_admin_client()

        # Get user's organization
        user = supabase.table('users').select('organization_id').eq('id', user_id).single().execute()
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
            'created_by': user_id,
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

        logger.info(f"Collaboration {collaboration_id} created by {user_id} with {len(member_ids)} members")

        return jsonify({
            'success': True,
            'collaboration_id': collaboration_id,
            'message': 'Collaboration group created successfully'
        }), 201

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error creating collaboration: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to create collaboration'
        }), 500


@collaborations_bp.route('/', methods=['GET'])
@collaborations_bp.route('', methods=['GET'])
@require_role('advisor', 'superadmin', 'org_admin')
def list_collaborations(user_id):
    """List all collaborations for the user's organization"""
    try:
        supabase = get_supabase_admin_client()

        # Get user's organization
        user = supabase.table('users').select('organization_id').eq('id', user_id).single().execute()
        if not user.data or not user.data.get('organization_id'):
            return jsonify({
                'success': True,
                'collaborations': [],
                'count': 0,
                'message': 'No organization assigned'
            }), 200

        organization_id = user.data['organization_id']

        # Try to get collaborations - table may not exist yet
        try:
            collaborations = supabase.table('quest_collaborations')\
                .select('*, quests(id, title)')\
                .eq('organization_id', organization_id)\
                .order('created_at', desc=True)\
                .execute()
        except Exception as table_error:
            # Table doesn't exist yet - return empty list
            logger.warning(f"quest_collaborations table not found: {str(table_error)}")
            return jsonify({
                'success': True,
                'collaborations': [],
                'count': 0,
                'message': 'Collaboration feature not yet configured'
            }), 200

        # Get all members in a single query (avoids N+1)
        collab_ids = [c['id'] for c in collaborations.data or []]
        members_by_collab = {}

        if collab_ids:
            try:
                all_members = supabase.table('quest_collaboration_members')\
                    .select('collaboration_id, users(id, display_name, email)')\
                    .in_('collaboration_id', collab_ids)\
                    .execute()

                for member in all_members.data or []:
                    cid = member.get('collaboration_id')
                    if cid not in members_by_collab:
                        members_by_collab[cid] = []
                    if member.get('users'):
                        members_by_collab[cid].append(member.get('users'))
            except Exception:
                pass  # members_by_collab remains empty

        result = []
        for collab in collaborations.data or []:
            result.append({
                **collab,
                'quest': collab.get('quests'),
                'members': members_by_collab.get(collab['id'], [])
            })

        return jsonify({
            'success': True,
            'collaborations': result,
            'count': len(result)
        }), 200

    except Exception as e:
        logger.error(f"Error listing collaborations: {str(e)}")
        return jsonify({
            'success': True,
            'collaborations': [],
            'count': 0,
            'message': 'Collaboration feature not yet configured'
        }), 200


@collaborations_bp.route('/<collaboration_id>', methods=['DELETE'])
@require_role('advisor', 'superadmin', 'org_admin')
def delete_collaboration(user_id, collaboration_id):
    """Delete a collaboration group"""
    try:
        supabase = get_supabase_admin_client()

        # Delete members first (cascade should handle this but being explicit)
        supabase.table('quest_collaboration_members')\
            .delete()\
            .eq('collaboration_id', collaboration_id)\
            .execute()

        # Delete the collaboration
        supabase.table('quest_collaborations')\
            .delete()\
            .eq('id', collaboration_id)\
            .execute()

        logger.info(f"Collaboration {collaboration_id} deleted by {user_id}")

        return jsonify({
            'success': True,
            'message': 'Collaboration deleted successfully'
        }), 200

    except Exception as e:
        logger.error(f"Error deleting collaboration: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete collaboration'
        }), 500


@collaborations_bp.route('/<collaboration_id>', methods=['GET'])
@require_auth
def get_collaboration(user_id, collaboration_id):
    """Get collaboration details"""
    try:
        supabase = get_user_client(user_id)

        # Get collaboration with members
        collaboration = supabase.table('quest_collaborations')\
            .select('*, quests(id, title), users!created_by(id, display_name)')\
            .eq('id', collaboration_id)\
            .single()\
            .execute()

        if not collaboration.data:
            raise NotFoundError('Collaboration not found')

        # Get members
        members = supabase.table('quest_collaboration_members')\
            .select('*, users(id, display_name, email)')\
            .eq('collaboration_id', collaboration_id)\
            .execute()

        return jsonify({
            'success': True,
            'collaboration': {
                **collaboration.data,
                'members': members.data
            }
        }), 200

    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error fetching collaboration: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch collaboration'
        }), 500


@collaborations_bp.route('/quest/<quest_id>/members', methods=['GET'])
@require_auth
def get_quest_collaborators(user_id, quest_id):
    """Get all collaboration members for a quest that includes the current user"""
    try:
        supabase = get_supabase_admin_client()

        # Find collaborations for this quest that include the user
        user_collaborations = supabase.table('quest_collaboration_members')\
            .select('collaboration_id, quest_collaborations!inner(id, quest_id)')\
            .eq('user_id', user_id)\
            .execute()

        if not user_collaborations.data:
            return jsonify({
                'success': True,
                'members': [],
                'count': 0
            }), 200

        # Filter to collaborations for this specific quest
        relevant_collab_ids = [
            c['collaboration_id']
            for c in user_collaborations.data
            if c.get('quest_collaborations', {}).get('quest_id') == quest_id
        ]

        if not relevant_collab_ids:
            return jsonify({
                'success': True,
                'members': [],
                'count': 0
            }), 200

        # Get all members of these collaborations in a single query (avoids N+1)
        all_members = []
        seen_user_ids = set()

        members_result = supabase.table('quest_collaboration_members')\
            .select('user_id, users(id, display_name, email, avatar_url)')\
            .in_('collaboration_id', relevant_collab_ids)\
            .execute()

        for member in members_result.data or []:
            member_user = member.get('users', {})
            if member_user and member_user.get('id') not in seen_user_ids:
                seen_user_ids.add(member_user.get('id'))
                all_members.append(member_user)

        return jsonify({
            'success': True,
            'members': all_members,
            'count': len(all_members)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching quest collaborators: {str(e)}")
        # Return empty list on error to not break the UI
        return jsonify({
            'success': True,
            'members': [],
            'count': 0
        }), 200


@collaborations_bp.route('/<collaboration_id>/members', methods=['POST'])
@require_role('advisor', 'superadmin', 'org_admin')
def add_member(user_id, collaboration_id):
    """Add a member to collaboration group"""
    try:
        data = request.get_json()
        new_member_id = data.get('user_id')

        if not new_member_id:
            raise ValidationError('user_id is required')

        supabase = get_supabase_admin_client()

        # Verify collaboration exists and user has permission
        collaboration = supabase.table('quest_collaborations')\
            .select('id, created_by')\
            .eq('id', collaboration_id)\
            .single()\
            .execute()

        if not collaboration.data:
            raise NotFoundError('Collaboration not found')

        # Add member
        supabase.table('quest_collaboration_members').insert({
            'collaboration_id': collaboration_id,
            'user_id': new_member_id
        }).execute()

        logger.info(f"User {new_member_id} added to collaboration {collaboration_id} by {user_id}")

        return jsonify({
            'success': True,
            'message': 'Member added successfully'
        }), 201

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error adding member: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to add member'
        }), 500


@collaborations_bp.route('/<collaboration_id>/members/<member_id>', methods=['DELETE'])
@require_role('advisor', 'superadmin', 'org_admin')
def remove_member(user_id, collaboration_id, member_id):
    """Remove a member from collaboration group"""
    try:
        supabase = get_supabase_admin_client()

        # Delete member
        supabase.table('quest_collaboration_members')\
            .delete()\
            .eq('collaboration_id', collaboration_id)\
            .eq('user_id', member_id)\
            .execute()

        logger.info(f"User {member_id} removed from collaboration {collaboration_id} by {user_id}")

        return jsonify({
            'success': True,
            'message': 'Member removed successfully'
        }), 200

    except Exception as e:
        logger.error(f"Error removing member: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to remove member'
        }), 500


# ==================== Evidence Sharing ====================

@collaborations_bp.route('/evidence/<task_completion_id>/share', methods=['POST'])
@require_auth
def share_evidence(user_id, task_completion_id):
    """Share task completion evidence with collaboration group"""
    try:
        data = request.get_json()
        collaboration_id = data.get('collaboration_id')
        evidence_url = data.get('evidence_url')
        description = data.get('description', '')

        if not collaboration_id:
            raise ValidationError('collaboration_id is required')

        supabase = get_supabase_admin_client()

        # Verify user is member of collaboration
        member = supabase.table('quest_collaboration_members')\
            .select('id')\
            .eq('collaboration_id', collaboration_id)\
            .eq('user_id', user_id)\
            .execute()

        if not member.data:
            return jsonify({
                'success': False,
                'error': 'You are not a member of this collaboration'
            }), 403

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

        return jsonify({
            'success': True,
            'evidence_id': evidence_id,
            'message': 'Evidence shared successfully'
        }), 201

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error sharing evidence: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to share evidence'
        }), 500


@collaborations_bp.route('/evidence/pending', methods=['GET'])
@require_auth
def get_pending_approvals(user_id):
    """Get evidence submissions pending this user's approval"""
    try:
        supabase = get_user_client(user_id)

        # Get pending approvals for this user
        approvals = supabase.table('shared_evidence_approvals')\
            .select('*, shared_evidence(*, quest_task_completions(*, quest_tasks(title)), users!submitted_by(display_name))')\
            .eq('user_id', user_id)\
            .eq('status', 'pending')\
            .execute()

        return jsonify({
            'success': True,
            'pending_approvals': approvals.data,
            'count': len(approvals.data)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching pending approvals: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch pending approvals'
        }), 500


@collaborations_bp.route('/evidence/<evidence_id>/approve', methods=['POST'])
@require_auth
def approve_evidence(user_id, evidence_id):
    """Approve shared evidence"""
    try:
        data = request.get_json() or {}
        comments = data.get('comments', '')

        supabase = get_supabase_admin_client()

        # Update approval status
        supabase.table('shared_evidence_approvals')\
            .update({
                'status': 'approved',
                'comments': comments,
                'responded_at': 'now()'
            })\
            .eq('shared_evidence_id', evidence_id)\
            .eq('user_id', user_id)\
            .execute()

        logger.info(f"Evidence {evidence_id} approved by {user_id}")

        return jsonify({
            'success': True,
            'message': 'Evidence approved successfully'
        }), 200

    except Exception as e:
        logger.error(f"Error approving evidence: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to approve evidence'
        }), 500


@collaborations_bp.route('/evidence/<evidence_id>/reject', methods=['POST'])
@require_auth
def reject_evidence(user_id, evidence_id):
    """Reject shared evidence"""
    try:
        data = request.get_json() or {}
        comments = data.get('comments', '')

        if not comments:
            raise ValidationError('Comments are required when rejecting evidence')

        supabase = get_supabase_admin_client()

        # Update approval status
        supabase.table('shared_evidence_approvals')\
            .update({
                'status': 'rejected',
                'comments': comments,
                'responded_at': 'now()'
            })\
            .eq('shared_evidence_id', evidence_id)\
            .eq('user_id', user_id)\
            .execute()

        logger.info(f"Evidence {evidence_id} rejected by {user_id}")

        return jsonify({
            'success': True,
            'message': 'Evidence rejected'
        }), 200

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error rejecting evidence: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to reject evidence'
        }), 500
