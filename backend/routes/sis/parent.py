"""
SIS Parent self-service routes — guardians register their own children.

NEW, additive (/api/sis/parent). Unlike the rest of /api/sis (staff-gated), these
use @require_auth and authorize by family relationship inside sis_parent_service
(the user must be a guardian of the student, in a SIS-enabled org). Self-service
ends at the CLP meeting; staff invoice and full payment auto-enrolls.
"""

import uuid

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth
from utils.logger import get_logger
from services import sis_parent_service as parent
from services import sis_onboarding_service as onboarding

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
def list_registrations(user_id):
    return jsonify({'success': True, 'registrations': parent.list_my_registrations(user_id)})


@bp.route('/registrations', methods=['POST'])
@require_auth
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
def family_billing(user_id):
    """Balance + invoices (line items, installments) + payments for every
    household the caller guards (guardian household_member or the household's
    primary contact). Empty households list if they guard none."""
    from services import sis_billing_service as billing
    return jsonify({'success': True, **billing.parent_billing_overview(user_id)})


@bp.route('/billing/receipts/<payment_id>', methods=['GET'])
@require_auth
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
    from services.user_photo_service import upload_user_photo
    try:
        avatar_url = upload_user_photo(get_supabase_admin_client(), user_id, file, ext)
    except Exception as e:  # noqa: BLE001
        logger.error(f'parent photo: upload failed for {user_id[:8]}: {e}')
        return jsonify({'success': False, 'error': 'Could not upload the photo'}), 500
    return jsonify({'success': True, 'avatar_url': avatar_url})


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
    from services.user_photo_service import upload_user_photo
    try:
        avatar_url = upload_user_photo(get_supabase_admin_client(), student_id, file, ext)
    except Exception as e:  # noqa: BLE001
        logger.error(f'parent photo: upload failed for student {student_id[:8]}: {e}')
        return jsonify({'success': False, 'error': 'Could not upload the photo'}), 500
    return jsonify({'success': True, 'avatar_url': avatar_url})


# ── Planned absences (guardian reports a child will be out) ───────────────────
@bp.route('/absences', methods=['GET'])
@require_auth
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
def create_absence(user_id):
    data = request.json or {}
    org_id = _org(request)
    student_user_id = data.get('student_user_id')
    absence_date = data.get('absence_date')
    if not org_id or not student_user_id or not absence_date:
        return jsonify({'success': False,
                        'error': 'organization_id, student_user_id and absence_date are required'}), 400
    result = parent.create_absence(
        user_id, org_id, student_user_id, absence_date,
        class_id=data.get('class_id'), reason=data.get('reason'),
    )
    if result.get('error'):
        code = 403 if result['error'] == 'Not authorized for this student' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, 'absence': result['absence']}), 201


@bp.route('/absences/<absence_id>', methods=['DELETE'])
@require_auth
def cancel_absence(user_id, absence_id):
    result = parent.cancel_absence(user_id, absence_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Absence not found' else 403
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True})


# ── Schedule builder: add/drop/waitlist until the first day of school ─────────
@bp.route('/students/<student_id>/schedule', methods=['GET'])
@require_auth
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


# ── Family portal: checklists a school assigns to the guardian ────────────────
# These reuse the onboarding template/assignment machinery (family-audience
# templates). A guardian only ever sees checklists assigned to their own user id.
@bp.route('/onboarding', methods=['GET'])
@require_auth
def my_family_checklists(user_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    # audience='family': a guardian who is also on staff must not see their
    # teacher onboarding here (reported 2026-08-05).
    return jsonify({'success': True,
                    'assignments': onboarding.list_assignments(
                        org_id, user_id=user_id, audience='family')})


@bp.route('/onboarding/<assignment_id>/items/<item_key>', methods=['PATCH'])
@require_auth
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


# ── Family directory (opt-in) ─────────────────────────────────────────────────
@bp.route('/directory', methods=['GET'])
@require_auth
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
