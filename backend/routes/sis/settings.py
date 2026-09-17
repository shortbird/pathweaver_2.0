"""School settings: one PATCH, one key at a time.

    PATCH /api/sis/settings?organization_id=...
    {"sis_settings": {"rooms": [...]}}
    {"registration": {"registration_fee_cents": 5000}}
    {"hide_pillars": true}

The body names the keys to change and nothing else; the server merges them
onto the stored feature_flags blob (services/org_settings_service.merge_patch
says how) and answers with the whole blob as stored. Thirteen settings cards
used to read the blob, spread it and PUT it back whole through the admin
console's organization route, so two cards open in two tabs erased each
other's saves (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, H2).

Same tier as the Settings page (ADMIN_ROLES); the finance paths inside the
blob are still held for a coordinator by the guard the service runs.
"""

from flask import Blueprint, jsonify, request

from services import sis_service
from services.org_settings_service import FlagsRejected, patch_feature_flags
from utils.auth.decorators import require_role
from utils.sis_roles import ADMIN_ROLES

bp = Blueprint('sis_settings', __name__, url_prefix='/api/sis')


@bp.route('/settings', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def patch_settings(user_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    patch = request.get_json(silent=True)
    if not isinstance(patch, dict) or not patch:
        return jsonify({'success': False, 'error': 'Send the settings keys to change'}), 400
    ctx = sis_service.get_user_org_context(user_id)
    try:
        flags = patch_feature_flags(
            org_id, patch,
            caller_id=user_id,
            sees_finance=sis_service.caller_sees_pay(user_id),
            is_superadmin=ctx.get('role') == 'superadmin',
        )
    except FlagsRejected as rejected:
        return jsonify({'success': False, **rejected.body}), rejected.status
    return jsonify({'success': True, 'feature_flags': flags})
