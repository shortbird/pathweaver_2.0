"""
Task Collaboration API Routes
==============================

Handles task-level collaboration where students can team up on individual tasks
and earn double XP when completing them together.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth, require_paid_tier
from utils.user_sync import ensure_user_exists, get_user_name
from datetime import datetime

bp = Blueprint('task_collaboration', __name__, url_prefix='/api/tasks')

@bp.route('/<task_id>/invite-collaborator', methods=['POST'])
@require_auth
@require_paid_tier
def invite_collaborator(user_id: str, task_id: str):
    """
    Invite a friend to collaborate on a specific task.

    Request body:
    {
        "friend_id": "uuid",
        "message": "optional message"
    }
    """
    try:
        supabase = get_supabase_admin_client()
        data = request.get_json()

        friend_id = data.get('friend_id')

        if not friend_id:
            return jsonify({
                'success': False,
                'error': 'friend_id is required'
            }), 400

        if user_id == friend_id:
            return jsonify({
                'success': False,
                'error': 'Cannot collaborate with yourself'
            }), 400

        # Get task details
        task = supabase.table('user_quest_tasks')\
            .select('*, quests(title)')\
            .eq('id', task_id)\
            .eq('user_id', user_id)\
            .single()\
            .execute()

        if not task.data:
            return jsonify({
                'success': False,
                'error': 'Task not found or not owned by you'
            }), 404

        # Check if friend has an equivalent task (same quest, similar task)
        # For now, we'll create collaboration and let them add matching task later
        # This allows cross-quest collaboration on similar activities

        # Check for existing collaboration
        existing = supabase.table('task_collaborations')\
            .select('*')\
            .eq('task_id', task_id)\
            .or_(f'student_1_id.eq.{friend_id},student_2_id.eq.{friend_id}')\
            .execute()

        if existing.data:
            return jsonify({
                'success': False,
                'error': 'A collaboration already exists for this task'
            }), 400

        # Create collaboration invitation
        collaboration = supabase.table('task_collaborations')\
            .insert({
                'task_id': task_id,
                'student_1_id': user_id,
                'student_2_id': friend_id,
                'status': 'pending',
                'created_at': datetime.utcnow().isoformat()
            })\
            .execute()

        # Get friend's name
        ensure_user_exists(friend_id)
        friend_first, friend_last = get_user_name(friend_id)
        friend_name = f"{friend_first} {friend_last}"

        return jsonify({
            'success': True,
            'collaboration': collaboration.data[0],
            'message': f'Collaboration invitation sent to {friend_name}'
        })

    except Exception as e:
        print(f"Error inviting collaborator: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to send invitation'
        }), 500

@bp.route('/<task_id>/collaboration/accept', methods=['PUT'])
@require_auth
@require_paid_tier
def accept_collaboration(user_id: str, task_id: str):
    """
    Accept a collaboration invitation for a task.
    """
    try:
        supabase = get_supabase_admin_client()

        # Find pending invitation
        invitation = supabase.table('task_collaborations')\
            .select('*')\
            .eq('task_id', task_id)\
            .eq('student_2_id', user_id)\
            .eq('status', 'pending')\
            .execute()

        if not invitation.data:
            return jsonify({
                'success': False,
                'error': 'No pending invitation found'
            }), 404

        collab_id = invitation.data[0]['id']

        # Update status to active
        updated = supabase.table('task_collaborations')\
            .update({'status': 'active'})\
            .eq('id', collab_id)\
            .execute()

        return jsonify({
            'success': True,
            'collaboration': updated.data[0],
            'message': 'Collaboration accepted! You will both earn 2x XP when this task is completed together.'
        })

    except Exception as e:
        print(f"Error accepting collaboration: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to accept collaboration'
        }), 500

@bp.route('/<task_id>/collaboration/decline', methods=['PUT'])
@require_auth
@require_paid_tier
def decline_collaboration(user_id: str, task_id: str):
    """
    Decline a collaboration invitation.
    """
    try:
        supabase = get_supabase_admin_client()

        # Find and delete pending invitation
        deleted = supabase.table('task_collaborations')\
            .delete()\
            .eq('task_id', task_id)\
            .eq('student_2_id', user_id)\
            .eq('status', 'pending')\
            .execute()

        if not deleted.data:
            return jsonify({
                'success': False,
                'error': 'No pending invitation found'
            }), 404

        return jsonify({
            'success': True,
            'message': 'Collaboration invitation declined'
        })

    except Exception as e:
        print(f"Error declining collaboration: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to decline collaboration'
        }), 500

@bp.route('/<task_id>/collaboration/complete', methods=['POST'])
@require_auth
def mark_collaboration_complete(user_id: str, task_id: str):
    """
    Mark collaborative task as complete. Awards double XP to both students.
    This is called automatically when a task with active collaboration is completed.
    """
    try:
        supabase = get_supabase_admin_client()

        # Find active collaboration
        collaboration = supabase.table('task_collaborations')\
            .select('*')\
            .eq('task_id', task_id)\
            .eq('status', 'active')\
            .execute()

        if not collaboration.data:
            return jsonify({
                'success': False,
                'has_collaboration': False
            })

        collab = collaboration.data[0]

        # Check if already awarded
        if collab.get('double_xp_awarded'):
            return jsonify({
                'success': True,
                'has_collaboration': True,
                'already_awarded': True
            })

        # Get task details
        task = supabase.table('user_quest_tasks')\
            .select('*')\
            .eq('id', task_id)\
            .single()\
            .execute()

        if not task.data:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404

        base_xp = task.data['xp_value']
        double_xp = base_xp * 2

        # Award double XP to both students
        from services.xp_service import XPService
        xp_service = XPService()

        pillar = task.data['pillar']

        # Award to student 1
        xp_service.award_xp(
            collab['student_1_id'],
            pillar,
            base_xp,  # Award the additional XP (since base was already awarded)
            f'task_collaboration_bonus:{task_id}'
        )

        # Award to student 2
        xp_service.award_xp(
            collab['student_2_id'],
            pillar,
            base_xp,  # Award the additional XP
            f'task_collaboration_bonus:{task_id}'
        )

        # Mark as awarded
        supabase.table('task_collaborations')\
            .update({
                'status': 'completed',
                'double_xp_awarded': True
            })\
            .eq('id', collab['id'])\
            .execute()

        return jsonify({
            'success': True,
            'has_collaboration': True,
            'double_xp_awarded': True,
            'xp_awarded': double_xp,
            'message': f'Collaboration complete! Both students earned {double_xp} XP'
        })

    except Exception as e:
        print(f"Error completing collaboration: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to complete collaboration'
        }), 500

@bp.route('/<task_id>/collaborations', methods=['GET'])
@require_auth
def get_task_collaborations(user_id: str, task_id: str):
    """
    Get collaboration status for a task.
    """
    try:
        supabase = get_supabase_admin_client()

        collaborations = supabase.table('task_collaborations')\
            .select('*')\
            .eq('task_id', task_id)\
            .or_(f'student_1_id.eq.{user_id},student_2_id.eq.{user_id}')\
            .execute()

        return jsonify({
            'success': True,
            'collaborations': collaborations.data or []
        })

    except Exception as e:
        print(f"Error getting collaborations: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get collaborations'
        }), 500
