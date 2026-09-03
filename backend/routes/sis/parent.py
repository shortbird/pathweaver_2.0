"""
SIS Parent self-service routes — guardians register their own children.

NEW, additive (/api/sis/parent). Unlike the rest of /api/sis (staff-gated), these
use @require_auth and authorize by family relationship inside sis_parent_service
(the user must be a guardian of the student, in a SIS-enabled org). Self-service
ends at the CLP meeting; staff invoice and full payment auto-enrolls.

Blocks P3: routes are tagged per module with @require_module. Deliberately
UNGATED (allowlisted in test_module_coverage): /context and /required-documents
(both asked before the app knows what it may render — the gate must stay
askable), /photo and /students/<id>/photo (profile basics, part of the sis
core), and /quests (school-wide family engagement, no single module owns it).
"""

import uuid

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth
from modules.gate import require_module
from utils.logger import get_logger
from services import sis_parent_service as parent
from services import sis_access_gate
from services import sis_onboarding_service as onboarding
from services import sis_secure_docs_service
from services import sis_tasks_service

logger = get_logger(__name__)

bp = Blueprint('sis_parent', __name__, url_prefix='/api/sis/parent')

# Private bucket for family checklist document uploads (same idiom as the staff
# onboarding docs: never public, read via short-lived signed URLs).
_FAMILY_DOCS_BUCKET = 'family-documents'
_DOC_EXTENSIONS = {'pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'}
_MAX_DOC_BYTES = 10 * 1024 * 1024


def _org(req):
    body = req.get_json(silent=True) or {}
    return req.args.get('organization_id') or body.get('organization_id')


@bp.route('/context', methods=['GET'])
@require_auth
def get_context(user_id):
    """Orgs + children this guardian can register. Empty if they're not a SIS guardian."""
    return jsonify({'success': True, **parent.context(user_id)})


@bp.route('/classes', methods=['GET'])
@require_auth
@require_module('classes')
def open_classes(user_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    classes = parent.open_classes(user_id, org_id)
    if classes is None:
        return jsonify({'success': False, 'error': 'Not authorized for this organization'}), 403
    return jsonify({'success': True, 'classes': classes})


@bp.route('/registrations', methods=['GET'])
@require_auth
@require_module('registration')
def list_registrations(user_id):
    return jsonify({'success': True, 'registrations': parent.list_my_registrations(user_id)})


@bp.route('/registrations', methods=['POST'])
@require_auth
@require_module('registration')
def create_registration(user_id):
    data = request.json or {}
    org_id = _org(request)
    student_user_id = data.get('student_user_id')
    if not org_id or not student_user_id:
        return jsonify({'success': False, 'error': 'organization_id and student_user_id are required'}), 400
    result = parent.create_registration(user_id, org_id, student_user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 403
    return jsonify({'success': True, 'registration': result['registration']}), 201


@bp.route('/registrations/<reg_id>', methods=['GET'])
@require_auth
@require_module('registration')
def get_registration(user_id, reg_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    reg = parent.get_registration(user_id, org_id, reg_id)
    if not reg:
        return jsonify({'success': False, 'error': 'Registration not found'}), 404
    return jsonify({'success': True, 'registration': reg})


@bp.route('/registrations/<reg_id>/items', methods=['POST'])
@require_auth
@require_module('registration')
def add_item(user_id, reg_id):
    data = request.json or {}
    org_id = _org(request)
    class_id = data.get('class_id')
    if not org_id or not class_id:
        return jsonify({'success': False, 'error': 'organization_id and class_id are required'}), 400
    result = parent.add_item(user_id, org_id, reg_id, class_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Registration not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result}), 201


@bp.route('/registrations/<reg_id>/items/<item_id>', methods=['DELETE'])
@require_auth
@require_module('registration')
def remove_item(user_id, reg_id, item_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.remove_item(user_id, org_id, reg_id, item_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True})


@bp.route('/registrations/<reg_id>/quote', methods=['GET'])
@require_auth
@require_module('registration')
def quote(user_id, reg_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.quote(user_id, org_id, reg_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, 'quote': result})


@bp.route('/registrations/<reg_id>/submit', methods=['POST'])
@require_auth
@require_module('registration')
def submit(user_id, reg_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.submit(user_id, org_id, reg_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Registration not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, 'registration': result['registration']})


# ── Family billing (balance, invoices, printable receipts) ───────────────────
@bp.route('/billing', methods=['GET'])
@require_auth
@require_module('billing')
def family_billing(user_id):
    """Balance + invoices (line items, installments) + payments for every
    household the caller guards (guardian household_member or the household's
    primary contact). Empty households list if they guard none."""
    from services import sis_billing_service as billing
    return jsonify({'success': True, **billing.parent_billing_overview(user_id)})


@bp.route('/billing/receipts/<payment_id>', methods=['GET'])
@require_auth
@require_module('billing')
def billing_receipt(user_id, payment_id):
    """Printable receipt payload for one recorded payment (guardian-only)."""
    from services import sis_billing_service as billing
    result = billing.payment_receipt(user_id, payment_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Receipt not found' else 403
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/billing/invoices/<invoice_id>/checkout', methods=['POST'])
@require_auth
@require_module('billing')
def billing_invoice_checkout(user_id, invoice_id):
    """Start an online card payment for an invoice on the school's own Stripe
    account. Body: {return_url}. Returns a hosted checkout URL."""
    from services import sis_billing_service as billing
    return_url = (request.get_json(silent=True) or {}).get('return_url', '')
    result = billing.create_invoice_checkout(user_id, invoice_id, return_url)
    if result.get('error'):
        code = 404 if result['error'] == 'Invoice not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/billing/invoices/<invoice_id>/confirm-payment', methods=['POST'])
@require_auth
@require_module('billing')
def billing_invoice_confirm(user_id, invoice_id):
    """After returning from Stripe, verify a paid session and record the payment
    (idempotent). Returns {paid, payment?, invoice?}."""
    from services import sis_billing_service as billing
    result = billing.confirm_invoice_payment(user_id, invoice_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Invoice not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


def _installment_count(data):
    try:
        return int(data.get('installment_count') or 10)
    except (TypeError, ValueError):
        return 10


@bp.route('/billing/family-checkout', methods=['POST'])
@require_auth
@require_module('billing')
def billing_family_checkout(user_id):
    """One online payment covering every open invoice in a family. Body:
    {household_id, return_url}. Returns a hosted checkout URL."""
    from services import sis_billing_service as billing
    data = request.get_json(silent=True) or {}
    household_id = data.get('household_id')
    if not household_id:
        return jsonify({'success': False, 'error': 'household_id is required'}), 400
    result = billing.create_family_checkout(user_id, household_id, data.get('return_url', ''))
    if result.get('error'):
        code = 404 if result['error'] == 'Family not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/billing/family-confirm', methods=['POST'])
@require_auth
@require_module('billing')
def billing_family_confirm(user_id):
    """After returning from a whole-family checkout, verify + record. Body:
    {household_id}. Returns {paid, recorded?}."""
    from services import sis_billing_service as billing
    household_id = (request.get_json(silent=True) or {}).get('household_id')
    if not household_id:
        return jsonify({'success': False, 'error': 'household_id is required'}), 400
    result = billing.confirm_family_payment(user_id, household_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Family not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/billing/invoices/<invoice_id>/autopay-setup', methods=['POST'])
@require_auth
@require_module('billing')
def billing_autopay_setup(user_id, invoice_id):
    """Start card setup for a 10-payment plan on an invoice. Body: {return_url,
    installment_count?}. Returns a hosted setup-checkout URL."""
    from services import sis_billing_service as billing
    data = request.get_json(silent=True) or {}
    result = billing.create_autopay_setup_checkout(
        user_id, invoice_id, data.get('return_url', ''),
        installment_count=_installment_count(data))
    if result.get('error'):
        code = 404 if result['error'] == 'Invoice not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/billing/invoices/<invoice_id>/autopay-confirm', methods=['POST'])
@require_auth
@require_module('billing')
def billing_autopay_confirm(user_id, invoice_id):
    """After returning from card setup, save the card + build the plan and charge
    the first installment. Body: {installment_count?, start_date?}. Returns
    {ready, plan?, saved_card?, first_charge?}."""
    from services import sis_billing_service as billing
    data = request.get_json(silent=True) or {}
    result = billing.confirm_autopay_setup(
        user_id, invoice_id, installment_count=_installment_count(data),
        start_date=data.get('start_date'))
    if result.get('error'):
        code = 404 if result['error'] == 'Invoice not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


# ── Family photos (self-service) ──────────────────────────────────────────────
def _photo_file_or_error():
    """Validate the multipart photo upload; returns (file, ext, None) or (None, None, response)."""
    if 'file' not in request.files:
        return None, None, (jsonify({'success': False, 'error': 'No file provided'}), 400)
    file = request.files['file']
    if not file.filename:
        return None, None, (jsonify({'success': False, 'error': 'No file selected'}), 400)
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'):
        return None, None, (jsonify({'success': False, 'error': 'Please upload a photo (JPG, PNG, WEBP, or HEIC)'}), 400)
    file.seek(0, 2)
    if file.tell() > 5 * 1024 * 1024:
        return None, None, (jsonify({'success': False, 'error': 'Photos must be under 5MB'}), 400)
    file.seek(0)
    return file, ext, None


@bp.route('/photo', methods=['POST'])
@require_auth
def upload_my_photo(user_id):
    """A guardian uploads (or replaces) their own photo."""
    file, ext, err = _photo_file_or_error()
    if err:
        return err
    from database import get_supabase_admin_client
    from services.user_photo_service import photo_display_url, upload_user_photo
    try:
        # admin client justified: storage upload + users.avatar_url write for the caller's own account (user_id from @require_auth)
        avatar_url = upload_user_photo(get_supabase_admin_client(), user_id, file, ext)
    except Exception as e:  # noqa: BLE001
        logger.error(f'parent photo: upload failed for {user_id[:8]}: {e}')
        return jsonify({'success': False, 'error': 'Could not upload the photo'}), 500
    # `user-photos` is private; the browser needs the signed twin, not the pointer.
    return jsonify({'success': True, 'avatar_url': photo_display_url(avatar_url)})


@bp.route('/students/<student_id>/photo', methods=['POST'])
@require_auth
def upload_student_photo(user_id, student_id):
    """A guardian uploads (or replaces) one of their students' photos."""
    org_id = request.form.get('organization_id') or request.args.get('organization_id')
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    if not any(s['student_id'] == student_id and s['org_id'] == org_id
               for s in parent.registerable_students(user_id)):
        return jsonify({'success': False, 'error': 'Not authorized for this student'}), 403
    file, ext, err = _photo_file_or_error()
    if err:
        return err
    from database import get_supabase_admin_client
    from services.user_photo_service import photo_display_url, upload_user_photo
    try:
        # admin client justified: writes the child's users.avatar_url; gated by the registerable_students guardian-of-this-student check above
        avatar_url = upload_user_photo(get_supabase_admin_client(), student_id, file, ext)
    except Exception as e:  # noqa: BLE001
        logger.error(f'parent photo: upload failed for student {student_id[:8]}: {e}')
        return jsonify({'success': False, 'error': 'Could not upload the photo'}), 500
    # A child's photo in a private bucket: hand back the signed, expiring twin.
    return jsonify({'success': True, 'avatar_url': photo_display_url(avatar_url)})


# ── Planned absences (guardian reports a child will be out) ───────────────────
@bp.route('/absences', methods=['GET'])
@require_auth
@require_module('attendance')
def list_absences(user_id):
    org_id = _org(request)
    student_user_id = request.args.get('student_user_id')
    if not org_id or not student_user_id:
        return jsonify({'success': False, 'error': 'organization_id and student_user_id are required'}), 400
    result = parent.list_absences(user_id, org_id, student_user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 403
    return jsonify({'success': True, **result})


@bp.route('/absences', methods=['POST'])
@require_auth
@require_module('attendance')
def create_absence(user_id):
    """Report an absence for one child (student_user_id) or several at once
    (student_user_ids). Each child is written independently; the response lists
    what was created plus per-student errors, so one duplicate doesn't block a
    sibling."""
    data = request.json or {}
    org_id = _org(request)
    raw_ids = data.get('student_user_ids')
    if raw_ids is None:
        raw_ids = [data.get('student_user_id')]
    if not isinstance(raw_ids, list):
        raw_ids = [raw_ids]
    student_ids = [s for s in dict.fromkeys(raw_ids) if isinstance(s, str) and s]
    absence_date = data.get('absence_date')
    if not org_id or not student_ids or not absence_date:
        return jsonify({'success': False,
                        'error': 'organization_id, student_user_id(s) and absence_date are required'}), 400
    result = parent.create_absences(
        user_id, org_id, student_ids, absence_date,
        class_id=data.get('class_id'), reason=data.get('reason'),
        end_date=data.get('end_date'),
    )
    if not result['absences']:
        error = next(iter(result['errors'].values()))
        code = 403 if error == 'Not authorized for this student' else 400
        return jsonify({'success': False, 'error': error, 'errors': result['errors']}), code
    return jsonify({'success': True,
                    'absence': result['absences'][0],
                    'absences': result['absences'],
                    'errors': result['errors']}), 201


@bp.route('/absences/<absence_id>', methods=['DELETE'])
@require_auth
@require_module('attendance')
def cancel_absence(user_id, absence_id):
    result = parent.cancel_absence(user_id, absence_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Absence not found' else 403
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True})


@bp.route('/absences/cancel', methods=['POST'])
@require_auth
@require_module('attendance')
def cancel_absences(user_id):
    """Cancel several absence reports in one call. The UI shows a reported
    date range as one row; cancelling it is one action and one office
    notification covering the span, not one per day. Body: {absence_ids: []}."""
    ids = (request.json or {}).get('absence_ids') or []
    if not isinstance(ids, list) or not ids:
        return jsonify({'success': False, 'error': 'absence_ids is required'}), 400
    result = parent.cancel_absences(user_id, ids)
    if result.get('error'):
        code = 404 if result['error'] == 'Absence not found' else 403
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


# ── Schedule builder: add/drop/waitlist until the first day of school ─────────
@bp.route('/students/<student_id>/schedule', methods=['GET'])
@require_auth
@require_module('classes')
def student_schedule(user_id, student_id):
    """The student's current schedule (active classes + waitlist) plus whether
    self-service changes are still open (locks on the first day of school)."""
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.student_schedule(user_id, org_id, student_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 403
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>/classes', methods=['POST'])
@require_auth
@require_module('classes')
def add_student_class(user_id, student_id):
    """Add a class to the student's schedule: enrolls if there's a seat, joins
    the waitlist when full (and allowed)."""
    data = request.json or {}
    org_id = _org(request)
    class_id = data.get('class_id')
    if not org_id or not class_id:
        return jsonify({'success': False, 'error': 'organization_id and class_id are required'}), 400
    result = parent.add_class(user_id, org_id, student_id, class_id)
    if result.get('error'):
        code = 403 if 'authorized' in result['error'] else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>/classes/<class_id>', methods=['DELETE'])
@require_auth
@require_module('classes')
def drop_student_class(user_id, student_id, class_id):
    """Drop a class from the student's schedule (and/or leave its waitlist)."""
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.drop_class(user_id, org_id, student_id, class_id)
    if result.get('error'):
        code = 403 if 'authorized' in result['error'] else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>/classes/<class_id>/claim', methods=['POST'])
@require_auth
@require_module('classes')
def claim_student_spot(user_id, student_id, class_id):
    """Claim a per-class waitlist spot the school offered: enrolls the student if
    the offer is still live and the seat is still open."""
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.claim_offered_spot(user_id, org_id, student_id, class_id)
    if result.get('error'):
        code = 403 if 'authorized' in result['error'] else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


# ── UFA learning day ──────────────────────────────────────────────────────────
@bp.route('/students/<student_id>/learning-day', methods=['PUT'])
@require_auth
@require_module('classes')
def set_learning_day(user_id, student_id):
    """Save (or clear with choice=null) the student's learning-day choice —
    the UFA private school third instructional day (not an enrollable class)."""
    data = request.json or {}
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.set_learning_day(user_id, org_id, student_id, data.get('choice'))
    if result.get('error'):
        code = 403 if 'authorized' in result['error'] else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/quests', methods=['GET'])
@require_auth
def my_school_quests(user_id):
    """Quests the school has set for its families, with this guardian's progress.

    Open to any member of the school, not only guardians — the same widening the
    calendar, resources and directory got on 2026-08-06. The service returns None
    for somebody who isn't in this school at all.
    """
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    quests = parent.school_quests(user_id, org_id)
    if quests is None:
        return jsonify({'success': False, 'error': 'Not available'}), 403
    return jsonify({'success': True, 'quests': quests})


@bp.route('/required-documents', methods=['GET'])
@require_auth
def my_required_documents(user_id):
    """Documents this guardian must sign before the platform opens for them.

    Deliberately takes NO organization_id. Every other family endpoint is
    org-scoped because a guardian picks which school they are looking at; this
    one is asked before the app has rendered anything at all, by a client that
    is only trying to find out whether it may render. Making it depend on a
    parameter the caller may not have yet would make the gate unaskable in
    exactly the state it exists for.

    `blocked: false` is the answer for everybody who is not held — no
    organization, no SIS, staff, or simply nothing outstanding — so the client
    has one condition to check rather than a taxonomy.
    """
    return jsonify({'success': True, **sis_access_gate.status(user_id)})


# ── Family portal: checklists a school assigns to the guardian ────────────────
# These reuse the onboarding template/assignment machinery (family-audience
# templates). A guardian only ever sees checklists assigned to their own user id.
@bp.route('/onboarding', methods=['GET'])
@require_auth
@require_module('onboarding')
def my_family_checklists(user_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    # audience='family': a guardian who is also on staff must not see their
    # teacher onboarding here (reported 2026-08-05).
    return jsonify({'success': True,
                    'assignments': onboarding.list_assignments(
                        org_id, user_id=user_id, audience='family')})


@bp.route('/my-tasks', methods=['GET'])
@require_auth
@require_module('tasks')
def my_family_tasks(user_id):
    """The guardian's side of the unified inbox: their checklists and any
    document the school has sent them to sign, in one list.

    Same aggregator as the staff inbox with audience='family', so a guardian who
    also works at the school gets their family items here and their staff items
    in the console — never both in either place (2026-08-05).
    """
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    include_done = str(request.args.get('include_done', '')).lower() in ('1', 'true', 'yes')
    result = sis_tasks_service.list_my_tasks(org_id, user_id, audience='family',
                                             include_done=include_done)
    return jsonify({'success': True, **result})


@bp.route('/my-documents/<doc_id>/url', methods=['GET'])
@require_auth
@require_module('tasks', 'secure_documents', any_of=True)
def family_office_document_url(user_id, doc_id):
    """Open a document the office put in this guardian's portal.

    The staff side of this has existed since secure documents shipped; the
    family side did not, so a document sent to a parent for signature showed
    them a "review before signing" link that went nowhere. A guardian may open a
    document only when it is filed against them, shared with them, and belongs
    to the org in context — the same three conditions the staff endpoint checks.
    """
    from database import get_supabase_admin_client
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    # admin client justified: sis_secure_documents is service-role-only; ownership + sharing + org are all verified below before any URL is signed
    rows = (get_supabase_admin_client().table('sis_secure_documents')
            .select('id, organization_id, owner_user_id, shared_with_owner, storage_path')
            .eq('id', doc_id).limit(1).execute()).data or []
    doc = rows[0] if rows else None
    if (not doc or doc.get('organization_id') != org_id
            or doc.get('owner_user_id') != user_id
            or not doc.get('shared_with_owner')):
        return jsonify({'success': False, 'error': 'Document not found'}), 404
    url = sis_secure_docs_service.signed_url(doc['storage_path'])
    if not url:
        return jsonify({'success': False, 'error': 'Could not open the document'}), 500
    return jsonify({'success': True, 'url': url})


@bp.route('/onboarding/<assignment_id>/items/<item_key>', methods=['PATCH'])
@require_auth
@require_module('onboarding')
def update_family_checklist_item(user_id, assignment_id, item_key):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    # is_admin=False: a guardian can mark their own items done / attach a doc, but
    # never approve. The service also verifies the assignment belongs to them.
    fields = {**(request.get_json() or {}), 'signature_ip': request.remote_addr}
    result = onboarding.update_item(org_id, assignment_id, item_key,
                                    fields, actor_id=user_id, is_admin=False)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/onboarding/upload', methods=['POST'])
@require_auth
@require_module('onboarding')
def upload_family_checklist_doc(user_id):
    """Upload a document for a family checklist item to the PRIVATE family-documents
    bucket. Returns the storage path (read back via /onboarding/doc-url)."""
    from database import get_supabase_admin_client
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    f = request.files.get('file')
    if not f or not f.filename:
        return jsonify({'success': False, 'error': 'A file is required'}), 400
    ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
    if ext not in _DOC_EXTENSIONS:
        return jsonify({'success': False, 'error': 'Unsupported file type'}), 400
    blob = f.read()
    if len(blob) > _MAX_DOC_BYTES:
        return jsonify({'success': False, 'error': 'File is too large (max 10MB)'}), 400
    # admin client justified: upload to the PRIVATE family-documents bucket (service-role-only storage); path pinned to org_id/user_id from @require_auth
    supabase = get_supabase_admin_client()
    try:
        if not supabase.storage.get_bucket(_FAMILY_DOCS_BUCKET):
            supabase.storage.create_bucket(_FAMILY_DOCS_BUCKET, options={'public': False})
    except Exception:  # noqa: BLE001 — bucket likely already exists
        try:
            supabase.storage.create_bucket(_FAMILY_DOCS_BUCKET, options={'public': False})
        except Exception:  # noqa: BLE001
            pass
    path = f'{org_id}/{user_id}/{uuid.uuid4().hex}.{ext}'
    try:
        supabase.storage.from_(_FAMILY_DOCS_BUCKET).upload(
            path=path, file=blob,
            file_options={'content-type': f.mimetype or 'application/octet-stream'})
    except Exception as e:  # noqa: BLE001
        logger.error(f'family checklist upload failed: {e}')
        return jsonify({'success': False, 'error': 'Upload failed'}), 500
    return jsonify({'success': True, 'path': path})


@bp.route('/onboarding/doc-url', methods=['GET'])
@require_auth
@require_module('onboarding')
def family_checklist_doc_url(user_id):
    """A short-lived signed URL for one of the guardian's own uploaded docs."""
    from database import get_supabase_admin_client
    org_id = _org(request)
    path = request.args.get('path') or ''
    if not org_id or not path:
        return jsonify({'success': False, 'error': 'organization_id and path are required'}), 400
    parts = path.split('/')
    # Path scheme is {org_id}/{user_id}/{file}; a guardian may only open their own.
    if len(parts) < 3 or parts[0] != org_id or parts[1] != user_id:
        return jsonify({'success': False, 'error': 'Not authorized for this file'}), 403
    try:
        # admin client justified: signed URL on the private family-documents bucket; path prefix verified above to be the caller's own org/user folder
        signed = (get_supabase_admin_client().storage.from_(_FAMILY_DOCS_BUCKET)
                  .create_signed_url(path, 3600))
        url = signed.get('signedURL') or signed.get('signedUrl')
    except Exception as e:  # noqa: BLE001
        logger.error(f'family checklist doc-url failed: {e}')
        url = None
    if not url:
        return jsonify({'success': False, 'error': 'Could not open the document'}), 404
    return jsonify({'success': True, 'url': url})


# ── Age-exception requests ─────────────────────────────────────────────────────
@bp.route('/age-exception-requests', methods=['POST'])
@require_auth
@require_module('registration')
def request_age_exception(user_id):
    """A guardian asks the school to allow a student into a class outside its
    posted age band. Timestamped; staff review on the SIS Registration page."""
    data = request.json or {}
    org_id = _org(request)
    student_user_id = data.get('student_user_id')
    class_id = data.get('class_id')
    if not org_id or not student_user_id or not class_id:
        return jsonify({'success': False,
                        'error': 'organization_id, student_user_id and class_id are required'}), 400
    result = parent.request_age_exception(user_id, org_id, student_user_id, class_id,
                                          message=data.get('message'))
    if result.get('error'):
        code = 403 if 'authorized' in result['error'] else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result}), 201


# ── At-home learning: Optio courses (untimed) in the Schedule Builder ─────────
@bp.route('/courses', methods=['GET'])
@require_auth
@require_module('courses')
def home_learning_courses(user_id):
    """Optio courses a family can add for at-home learning (empty when the org
    has the Optio-courses toggle off)."""
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    courses = parent.home_learning_courses(user_id, org_id)
    if courses is None:
        return jsonify({'success': False, 'error': 'Not authorized for this organization'}), 403
    return jsonify({'success': True, 'courses': courses})


@bp.route('/students/<student_id>/courses', methods=['POST'])
@require_auth
@require_module('courses')
def add_student_course(user_id, student_id):
    data = request.json or {}
    org_id = _org(request)
    course_id = data.get('course_id')
    if not org_id or not course_id:
        return jsonify({'success': False, 'error': 'organization_id and course_id are required'}), 400
    result = parent.add_course(user_id, org_id, student_id, course_id)
    if result.get('error'):
        code = 403 if 'authorized' in result['error'] else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>/courses/<course_id>', methods=['DELETE'])
@require_auth
@require_module('courses')
def drop_student_course(user_id, student_id, course_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.drop_course(user_id, org_id, student_id, course_id)
    if result.get('error'):
        code = 403 if 'authorized' in result['error'] else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


# ── Org resources (family document library) ───────────────────────────────────
@bp.route('/resources', methods=['GET'])
@require_auth
@require_module('resources')
def org_resources(user_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    resources = parent.org_resources(user_id, org_id)
    if resources is None:
        return jsonify({'success': False, 'error': 'Not authorized for this organization'}), 403
    return jsonify({'success': True, 'resources': resources})


# ── School calendar (family-visible events) ───────────────────────────────────
@bp.route('/events', methods=['GET'])
@require_auth
@require_module('calendar')
def org_events(user_id):
    """The school's event calendar for a guardian, windowed with ?from=&to=."""
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    events = parent.org_events(user_id, org_id,
                               from_iso=request.args.get('from'),
                               to_iso=request.args.get('to'))
    if events is None:
        return jsonify({'success': False, 'error': 'Not authorized for this organization'}), 403
    return jsonify({'success': True, 'events': events})


@bp.route('/events/feed', methods=['GET'])
@require_auth
@require_module('calendar')
def org_events_feed(user_id):
    """Subscribe URL for the school calendar — the .ics feed Google Calendar,
    Apple Calendar and Outlook can poll (family token: school events only)."""
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    url = parent.calendar_feed_url(user_id, org_id, request.host_url.rstrip('/'))
    if url is None:
        return jsonify({'success': False, 'error': 'Not authorized for this organization'}), 403
    return jsonify({'success': True, 'feed_url': url})


# ── Family directory (opt-in) ─────────────────────────────────────────────────
@bp.route('/directory', methods=['GET'])
@require_auth
@require_module('community')
def family_directory(user_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    families = parent.family_directory(user_id, org_id)
    if families is None:
        return jsonify({'success': False, 'error': 'Not authorized for this organization'}), 403
    return jsonify({'success': True, 'families': families})


@bp.route('/directory/opt-in', methods=['GET'])
@require_auth
@require_module('community')
def directory_opt_in_status(user_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.directory_opt_in_status(user_id, org_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result})


@bp.route('/directory/opt-in', methods=['PUT'])
@require_auth
@require_module('community')
def set_directory_opt_in(user_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    body = request.json or {}
    result = parent.set_directory_opt_in(user_id, org_id, bool(body.get('opted_in')),
                                         shares=body)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result})
