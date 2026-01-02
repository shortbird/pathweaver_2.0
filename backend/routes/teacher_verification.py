"""
Teacher Verification Routes - API endpoints for diploma subject verification
Handles teacher/advisor verification of student task completions for accreditation.
Part of Phase 2: Teacher verification workflow for diploma subject alignment.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_advisor
from middleware.error_handler import ValidationError, NotFoundError
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('teacher_verification', __name__, url_prefix='/api/teacher')


@bp.route('/pending-verifications', methods=['GET'])
@require_advisor
def get_pending_verifications(user_id):
    """
    Get all task completions awaiting teacher verification.
    Returns tasks completed by students in the advisor's organization.
    """
    try:
        admin = get_supabase_admin_client()

        # Get advisor's organization
        advisor_response = admin.table('users')\
            .select('organization_id')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not advisor_response.data or not advisor_response.data.get('organization_id'):
            return jsonify({
                'success': True,
                'pending_verifications': [],
                'count': 0,
                'message': 'No organization assigned'
            }), 200

        org_id = advisor_response.data['organization_id']

        # Get all students in the organization
        students_response = admin.table('users')\
            .select('id, display_name, email')\
            .eq('organization_id', org_id)\
            .eq('role', 'student')\
            .execute()

        if not students_response.data:
            return jsonify({
                'success': True,
                'pending_verifications': [],
                'count': 0
            }), 200

        student_ids = [s['id'] for s in students_response.data]
        students_map = {s['id']: s for s in students_response.data}

        # Get task completions that haven't been verified yet
        # Using credit_status = 'pending' or NULL for unverified tasks
        completions_response = admin.table('quest_task_completions')\
            .select('id, user_id, task_id, quest_id, user_quest_task_id, completed_at, evidence_url, evidence_text')\
            .in_('user_id', student_ids)\
            .order('completed_at', desc=True)\
            .limit(100)\
            .execute()

        # Get task details for the completions
        pending_tasks = []
        for completion in completions_response.data or []:
            # Get task info - use user_quest_task_id which links to user_quest_tasks
            task_id = completion.get('user_quest_task_id') or completion.get('task_id')
            task_data = {}
            if task_id:
                try:
                    task_response = admin.table('user_quest_tasks')\
                        .select('title, pillar, xp_value, subject_xp_distribution')\
                        .eq('id', task_id)\
                        .maybe_single()\
                        .execute()
                    task_data = task_response.data if task_response.data else {}
                except Exception:
                    pass  # Task may not exist
            student = students_map.get(completion.get('user_id'), {})

            pending_tasks.append({
                'completion_id': completion['id'],
                'student_id': completion.get('user_id'),
                'student_name': student.get('display_name') or student.get('email', 'Unknown'),
                'task_id': task_id,
                'task_title': task_data.get('title', 'Unknown Task'),
                'pillar': task_data.get('pillar'),
                'quest_id': completion.get('quest_id'),
                'completed_at': completion.get('completed_at'),
                'xp_awarded': task_data.get('xp_value', 0),
                'subject_distribution': task_data.get('subject_xp_distribution'),
                'evidence_url': completion.get('evidence_url'),
                'evidence_text': completion.get('evidence_text')
            })

        return jsonify({
            'success': True,
            'pending_verifications': pending_tasks,
            'count': len(pending_tasks)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching pending verifications: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f'Failed to fetch pending verifications: {str(e)}'
        }), 500


@bp.route('/verification-history', methods=['GET'])
@require_advisor
def get_verification_history(user_id):
    """
    Get history of all verifications completed by this teacher.
    Includes both approved and rejected verifications.
    """
    try:
        admin = get_supabase_admin_client()

        # Get verification history (completions verified by this advisor)
        history_response = admin.table('quest_task_completions')\
            .select('*, user_quest_tasks!inner(title, pillar, quest_id, user_id)')\
            .eq('verified_by_advisor_id', user_id)\
            .not_.is_('subject_verified_at', 'null')\
            .order('subject_verified_at', desc=True)\
            .limit(100)\
            .execute()

        history = []
        for completion in history_response.data:
            task_data = completion.get('user_quest_tasks', {})
            history.append({
                'completion_id': completion['id'],
                'student_id': task_data.get('user_id'),
                'task_title': task_data.get('title'),
                'pillar': task_data.get('pillar'),
                'quest_id': task_data.get('quest_id'),
                'completed_at': completion.get('completed_at'),
                'verified_at': completion.get('subject_verified_at'),
                'subject_distribution': completion.get('subject_distribution'),
                'verification_notes': completion.get('verification_notes'),
                'xp_awarded': completion.get('xp_awarded', 0)
            })

        return jsonify({
            'success': True,
            'verification_history': history,
            'count': len(history)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching verification history: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch verification history'
        }), 500


@bp.route('/verify/<task_completion_id>', methods=['POST'])
@require_advisor
def verify_task_completion(user_id, task_completion_id):
    """
    Verify a task completion and assign subject distribution for diploma credits.

    Request body:
        action: 'approve' or 'reject'
        subject_distribution: dict with subject keys and percentage values (only for approve)
        notes: optional verification notes
    """
    try:
        data = request.get_json()

        if not data:
            raise ValidationError('Request body is required')

        action = data.get('action')
        if action not in ['approve', 'reject']:
            raise ValidationError('Action must be "approve" or "reject"')

        subject_distribution = data.get('subject_distribution')
        notes = data.get('notes', '')

        if action == 'approve' and not subject_distribution:
            raise ValidationError('Subject distribution is required for approval')

        admin = get_supabase_admin_client()

        # Get the task completion
        completion_response = admin.table('quest_task_completions')\
            .select('*, user_quest_tasks!inner(user_id)')\
            .eq('id', task_completion_id)\
            .single()\
            .execute()

        if not completion_response.data:
            raise NotFoundError('Task completion not found')

        completion = completion_response.data
        task_data = completion.get('user_quest_tasks', {})
        student_id = task_data.get('user_id')

        # Verify the student is assigned to this advisor
        student_response = admin.table('users')\
            .select('advisor_id')\
            .eq('id', student_id)\
            .single()\
            .execute()

        if not student_response.data or student_response.data.get('advisor_id') != user_id:
            return jsonify({
                'success': False,
                'error': 'You are not authorized to verify this student\'s work'
            }), 403

        # Update the completion with verification data
        update_data = {
            'subject_verified_at': datetime.utcnow().isoformat(),
            'verified_by_advisor_id': user_id,
            'verification_notes': notes
        }

        if action == 'approve':
            update_data['subject_distribution'] = subject_distribution

        admin.table('quest_task_completions')\
            .update(update_data)\
            .eq('id', task_completion_id)\
            .execute()

        return jsonify({
            'success': True,
            'message': f'Task completion {action}d successfully'
        }), 200

    except ValidationError as e:
        logger.warning(f"Validation error in verification: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except NotFoundError as e:
        logger.warning(f"Not found error in verification: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Error verifying task completion: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to verify task completion'
        }), 500
