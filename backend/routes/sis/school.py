"""
SIS School routes — the school's own surface, for everyone who is in it.

Separate from /api/sis/parent on purpose. Those routes answer "what may this
GUARDIAN do for their family" and return nothing to a student or a teacher who
guards nobody; these answer "which school am I in", which every member has an
answer to. Keeping them apart means widening the hub can never quietly widen a
guardian action — /api/sis/parent still authorizes by family relationship.

@require_auth only; the org is resolved from the caller, with one exception:
a superadmin may name an org (?organization_id) to preview its school page —
they belong to no school themselves, so membership answers nothing for them.
Anyone else's organization_id param is ignored, never honored.
"""

from flask import Blueprint, jsonify, request

from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.logger import get_logger
from services import sis_parent_service as parent

logger = get_logger(__name__)

bp = Blueprint('sis_school', __name__, url_prefix='/api/sis/school')


def _caller_is_superadmin(user_id):
    """Platform role only — superadmin never appears in org_role."""
    try:
        # admin client justified: self-read of the caller's own users.role to detect superadmin (this lookup IS the auth check)
        row = (get_supabase_admin_client().table('users').select('role')
               .eq('id', user_id).limit(1).execute()).data
        return bool(row) and row[0].get('role') == 'superadmin'
    except Exception as e:  # noqa: BLE001
        logger.warning(f'school context: role lookup failed for {user_id[:8]}: {e}')
        return False


def _context_payload(user_id, requested_org, view_as):
    """Membership answers the question — except for a superadmin naming an org,
    which is the school-page preview. The role check runs only when a param
    was sent, so the common member path costs no extra lookup. The preview
    renders as the chosen role (?view_as): only the parent view claims
    guardianship (family cards); the student and admin views are members of
    the school without being guardians in it."""
    if requested_org and _caller_is_superadmin(user_id):
        return parent.school_context_for_org(requested_org,
                                             as_guardian=(view_as or 'parent') == 'parent')
    ctx = parent.school_context(user_id)
    if not ctx['orgs'] and _caller_is_superadmin(user_id):
        # A superadmin with no school of their own gets every org that opted
        # in — the listing the mobile app bootstraps its preview from. Only
        # reached when membership came back empty, so members still skip the
        # role lookup.
        return parent.school_preview_orgs()
    return ctx


@bp.route('/context', methods=['GET'])
@require_auth
def get_school_context(user_id):
    """The schools this user belongs to, and whether they guard a child in each.

    Drives the school hub: which cards to render, and which org the school-wide
    reads (calendar, resources, directory) are for. Empty orgs means no school,
    which the hub treats as "you have no school page" rather than an error.
    """
    return jsonify({'success': True,
                    **_context_payload(user_id, request.args.get('organization_id'),
                                       request.args.get('view_as'))})
