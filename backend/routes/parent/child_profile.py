"""
Parent Dashboard - correcting a child's name.

A roster import can put a family's names in the wrong columns, and until now a
guardian had no way to fix it: `PUT /api/dependents/<id>` takes display_name and
only works for an under-13 dependent, and a linked student's own account is the
only place their first/last name could be edited. A Hearthwood parent wrote in
on 2026-08-25 because both she and her son were in the system surname-first with
nowhere in the portal to correct either.

This route covers BOTH relationships a guardian can have with a child —
`users.managed_by_parent_id` (dependents) and an approved `parent_student_links`
row (students with their own login) — and is deliberately narrow: first and last
name only, with display_name recomputed from them, the same derivation
`PUT /api/users/profile` uses. Nothing else about the account is reachable here,
so a guardian correcting a spelling cannot touch a role, an email, or a password.

`verify_parent_access(..., allow_observer=False)`: observers are view-only, and
this writes to a minor's record.
"""

from flask import Blueprint, jsonify, request

from database import get_supabase_admin_client
from utils.auth.decorators import require_auth, validate_uuid_param
from utils.auth.relationships import require_relationship_to
from middleware.error_handler import AuthorizationError, ValidationError
from utils.logger import get_logger
from utils.storage_urls import sign_stored_url

from .dashboard_overview import verify_parent_access

logger = get_logger(__name__)

bp = Blueprint('parent_child_profile', __name__, url_prefix='/api/parent')

MAX_NAME_LENGTH = 100


@bp.route('/children/<student_id>/name', methods=['PUT'])
@require_auth
@validate_uuid_param('student_id')
@require_relationship_to('student_id', allow=('parent',))
def update_child_name(user_id: str, student_id: str):
    """Correct a child's first and last name.

    Body: first_name, last_name (both required; display_name is derived).
    """
    try:
        data = request.get_json() or {}

        first_name = (data.get('first_name') or '').strip()
        last_name = (data.get('last_name') or '').strip()

        if not first_name or not last_name:
            raise ValidationError('First and last name are both required')
        # Checked here rather than through validate_string_length, which raises
        # ValueError — an exception this handler would have turned into a 500.
        if len(first_name) > MAX_NAME_LENGTH or len(last_name) > MAX_NAME_LENGTH:
            raise ValidationError(
                f'Names must be {MAX_NAME_LENGTH} characters or fewer'
            )

        # admin client justified: verify_parent_access below is the gate; the
        # write targets another user's row, which RLS deliberately forbids.
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id, allow_observer=False)

        updated = supabase.table('users').update({
            'first_name': first_name,
            'last_name': last_name,
            'display_name': f'{first_name} {last_name}',
        }).eq('id', student_id).execute()

        if not updated.data:
            return jsonify({'success': False, 'error': 'Student not found'}), 404

        student = updated.data[0]
        if student.get('avatar_url'):
            student['avatar_url'] = sign_stored_url(student['avatar_url'], 'user-uploads')

        logger.info(
            "Guardian %s corrected the name on child account %s",
            str(user_id)[:8], str(student_id)[:8]
        )

        return jsonify({
            'success': True,
            'student': {
                'id': student['id'],
                'first_name': student.get('first_name'),
                'last_name': student.get('last_name'),
                'display_name': student.get('display_name'),
                'avatar_url': student.get('avatar_url'),
            },
            'message': 'Name updated',
        }), 200

    except AuthorizationError as e:
        logger.warning(f"Authorization error updating child name for {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error updating child name {student_id}: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to update the name'}), 500
