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

from flask import Blueprint, jsonify, make_response, request

from database import get_supabase_admin_client
from utils.auth.decorators import require_auth, require_real_identity
from utils.db_fetch import fetch_all_rows
from utils.roles import _real_effective_roles, may_view_as, VIEWABLE_ROLES
from utils.session_manager import session_manager
from utils.logger import get_logger

logger = get_logger(__name__)

role_view_bp = Blueprint('role_view', __name__, url_prefix='/api/role-view')


@role_view_bp.route('/people', methods=['GET'])
@require_real_identity
def people_in_role(user_id):
    """The members of a school who hold a role — the "specific person" list
    behind the switcher, so an admin can open a teacher's or a family's actual
    setup rather than a generic empty view. Resolved on the REAL caller (it is
    reachable from inside a narrowed view or a masquerade): superadmin for any
    org, org admin for their own. Admin-tier accounts are never listed — the
    masquerade rule refuses them as targets.

    Query: role, organization_id (superadmin only; ignored for others).
    """
    role = (request.args.get('role') or '').strip()
    if role not in VIEWABLE_ROLES:
        return jsonify({'success': False, 'error': 'Unknown role'}), 400
    # admin client justified: reads the caller's own row, then org members' names/roles for a picker; org pinned below
    admin = get_supabase_admin_client()
    me = (admin.table('users').select('id, role, org_role, org_roles, organization_id')
          .eq('id', user_id).limit(1).execute()).data
    if not me:
        return jsonify({'success': False, 'error': 'User not found'}), 404
    real = _real_effective_roles(me[0])
    if 'superadmin' in real:
        org_id = (request.args.get('organization_id') or '').strip() or None
    elif 'org_admin' in real:
        org_id = me[0].get('organization_id')
    else:
        return jsonify({'success': False, 'error': 'Admin access required'}), 403
    if not org_id:
        return jsonify({'success': False, 'error': 'Pick a school first'}), 400

    rows = fetch_all_rows(lambda: (
        admin.table('users')
        .select('id, first_name, last_name, display_name, role, org_role, org_roles, email')
        .eq('organization_id', org_id)
    ))
    people = []
    for u in rows:
        roles = set(_real_effective_roles(u))
        if role not in roles or roles & {'org_admin', 'superadmin'}:
            continue
        name = (f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
                or u.get('display_name') or u.get('email') or 'Unnamed')
        people.append({'id': u['id'], 'name': name})
    people.sort(key=lambda p: p['name'].lower())
    return jsonify({'success': True, 'people': people})


@role_view_bp.route('/<role>', methods=['POST'])
@require_auth
def start_role_view(user_id, role):
    """Narrow this session to one role: a role the caller holds, or any role
    at all for the admin tiers (superadmin, org_admin).

    Body: {organization_id} — required for a superadmin, who has no org of
    their own and is pinned to the org they were viewing; ignored for
    everyone else (their own org applies).
    """
    if role not in VIEWABLE_ROLES:
        return jsonify({'success': False, 'error': 'Unknown role'}), 400
    # admin client justified: reads the caller's own row to verify they may take the role
    admin = get_supabase_admin_client()
    row = (admin.table('users').select('id, role, org_role, org_roles, organization_id')
           .eq('id', user_id).limit(1).execute()).data
    if not row:
        return jsonify({'success': False, 'error': 'User not found'}), 404
    real = _real_effective_roles(row[0])
    if not may_view_as(real, role):
        return jsonify({'success': False,
                        'error': 'You can only view as a role you hold'}), 403

    organization_id = None
    if 'superadmin' in real:
        body = request.get_json(silent=True) or {}
        organization_id = (body.get('organization_id') or '').strip() or None
        if not organization_id:
            return jsonify({'success': False,
                            'error': 'Pick a school first — a superadmin views as a role within one organization'}), 400
        org = (admin.table('organizations').select('id')
               .eq('id', organization_id).limit(1).execute()).data
        if not org:
            return jsonify({'success': False, 'error': 'Organization not found'}), 404

    token = session_manager.generate_role_view_token(user_id, role, organization_id)
    response = make_response(jsonify({
        'success': True,
        'active_role': role,
        'organization_id': organization_id or row[0].get('organization_id'),
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
