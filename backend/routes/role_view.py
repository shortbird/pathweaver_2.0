"""
View as role — a user holding several roles narrows their session to ONE of
them, and the backend authorizes exactly as if they held only that role.

Built for the school staff who wear several hats (Katie at Gryffin holds
parent + advisor + sometimes org_admin; iCreate's front office is the same):
the old answer was "take admin off your account", and the older teacher
preview (?teacher_id=) only papered over the frontend while every API call
still answered as the admin.

Mechanics: a signed httpOnly cookie (role_view_token) carries {user_id, role}.
utils.roles.apply_role_view narrows the caller's user dict wherever roles are
resolved — the auth decorators, get_effective_role(s), the SIS org context,
and /api/auth/me — and re-checks the role against the account's REAL roles on
every request, so the token can only ever narrow, never widen.
"""

from flask import Blueprint, jsonify, make_response

from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.roles import _real_effective_roles, VALID_ORG_ROLES
from utils.session_manager import session_manager
from utils.logger import get_logger

logger = get_logger(__name__)

role_view_bp = Blueprint('role_view', __name__, url_prefix='/api/role-view')

# Roles a session can be narrowed to. Deliberately excludes superadmin (you
# cannot "view as" your way UP) and org_managed (a container, not a role).
_VIEWABLE_ROLES = VALID_ORG_ROLES | {'student', 'parent', 'advisor', 'observer'}


@role_view_bp.route('/<role>', methods=['POST'])
@require_auth
def start_role_view(user_id, role):
    """Narrow this session to one of the caller's own roles."""
    if role not in _VIEWABLE_ROLES:
        return jsonify({'success': False, 'error': 'Unknown role'}), 400
    # admin client justified: reads the caller's own row to verify they hold the role
    row = (get_supabase_admin_client().table('users')
           .select('id, role, org_role, org_roles')
           .eq('id', user_id).limit(1).execute()).data
    if not row:
        return jsonify({'success': False, 'error': 'User not found'}), 404
    real = _real_effective_roles(row[0])
    if role not in real and 'superadmin' not in real:
        return jsonify({'success': False,
                        'error': 'You can only view as a role you hold'}), 403

    token = session_manager.generate_role_view_token(user_id, role)
    response = make_response(jsonify({
        'success': True,
        'active_role': role,
        # For header-transport clients (Safari cookie fallback): send this back
        # as X-Role-View on every request.
        'role_view_token': token,
    }))
    session_manager.set_role_view_cookie(response, token)
    logger.info(f'[RoleView] {user_id[:8]} now viewing as {role}')
    return response


@role_view_bp.route('/exit', methods=['POST'])
@require_auth
def exit_role_view(user_id):
    """Back to the full account."""
    response = make_response(jsonify({'success': True}))
    session_manager.clear_role_view_cookie(response)
    logger.info(f'[RoleView] {user_id[:8]} exited role view')
    return response
