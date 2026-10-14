"""School settings: one PATCH, one key at a time.

    PATCH /api/sis/settings?organization_id=...
    {"sis_settings": {"rooms": [...]}}
    {"sis_settings": {"time_blocks": [{"start": "09:30", "end": "10:30", "label": ""}]}}
    {"registration": {"registration_fee_cents": 5000}}
    {"hide_pillars": true}

The body names the keys to change and nothing else; the server merges them
onto the stored feature_flags blob (services/org_settings_service.merge_patch
says how) and answers with the whole blob as stored. Thirteen settings cards
used to read the blob, spread it and PUT it back whole through the admin
console's organization route, so two cards open in two tabs erased each
other's saves (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, H2).

Same tier as the Settings page (ADMIN_ROLES); the finance paths inside the
blob are still held for a coordinator by the guard the service runs. The
time blocks are the one key that is not in the blob: they are rows
(sis_time_blocks, M8b) and the patch writes them through
sis_catalog_service.save_time_blocks, answering with the rows too
(`blocks`).
"""

from flask import Blueprint, jsonify, request

from services import (sis_attendance_service, sis_catalog_service,
                      sis_family_contacts_service, sis_incident_report_service,
                      sis_service)
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
    # The school-day blocks are rows (sis_time_blocks, M8b), not a key in the
    # blob: a patch naming them writes the rows, and the null left in its
    # place removes the legacy JSON list from the blob on the way through.
    # The incident-report default names a person who will be handed every
    # report a teacher files (ticket a26d9daf). Only the front office of this
    # school may hold it; a null clears it.
    incident_key = sis_incident_report_service.SETTING_KEY
    sis_patch = patch.get('sis_settings')
    if isinstance(sis_patch, dict) and sis_patch.get(incident_key) is not None:
        if not sis_incident_report_service.valid_recipient(org_id, sis_patch.get(incident_key)):
            return jsonify({'success': False, 'fields': [incident_key],
                            'error': 'Incident reports can only go to an org admin or '
                                     'campus coordinator of this school'}), 400
    # Who to contact (ticket c58b7c0b): the list families see on their home.
    # Checked and normalised here, and refused whole -- nothing is written --
    # when an entry is bad or names someone who is not staff of this school.
    contacts_key = sis_family_contacts_service.SETTING_KEY
    if isinstance(sis_patch, dict) and contacts_key in sis_patch:
        cleaned, problem = sis_family_contacts_service.clean_contacts(org_id, sis_patch.get(contacts_key))
        if problem:
            return jsonify({'success': False, 'fields': [contacts_key], 'error': problem}), 400
        sis_patch[contacts_key] = cleaned or None
    # The attendance settings (ticket 0680d03c): daily roll, pickup check-out,
    # which statuses, which weekdays. Checked here and refused whole when a
    # value is bad; stored as one object (merge_patch replaces it whole), so
    # the card always sends all four keys. A null resets to the defaults.
    attendance_key = sis_attendance_service.SETTINGS_KEY
    if isinstance(sis_patch, dict) and sis_patch.get(attendance_key) is not None:
        cleaned, problem = sis_attendance_service.clean_attendance_settings(sis_patch.get(attendance_key))
        if problem:
            return jsonify({'success': False, 'fields': [attendance_key], 'error': problem}), 400
        # Per-student days (54b29e8a) are edited on the daily roll, not on
        # the Settings card; a save that does not name them keeps the stored ones.
        cleaned = sis_attendance_service.with_stored_student_days(
            org_id, cleaned, sis_patch.get(attendance_key))
        sis_patch[attendance_key] = cleaned or None
    blocks = None
    wanted =sis_catalog_service.take_time_blocks(patch)
    if wanted != ():
        saved = sis_catalog_service.save_time_blocks(org_id, wanted)
        if saved.get('error'):
            return jsonify({'success': False, 'error': saved['error']}), 400
        blocks = saved['blocks']
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
    body = {'success': True, 'feature_flags': flags}
    if blocks is not None:
        body['blocks'] = blocks
    return jsonify(body)
