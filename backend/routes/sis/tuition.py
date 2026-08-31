"""
SIS tuition-approver routes — CLP finished -> verify tuition -> send invoice.

NEW, additive (/api/sis), org-scoped, FINANCE-gated (this is money, so campus
coordinators are kept out, same as billing). Lists CLP-finished students awaiting
an invoice, previews one student's tuition for verification, and sends one invoice
per student to the family.
"""

from flask import Blueprint, request, jsonify, Response

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_tuition_service as tuition
from services import sis_recurring_tuition_service as recurring
# Finance tier: sending tuition invoices IS the money, so campus coordinators are
# excluded exactly as they are from billing.
from utils.sis_roles import FINANCE_ROLES as STAFF_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_tuition', __name__, url_prefix='/api/sis')


def _org_or_error(user_id):
    body = request.get_json(silent=True) or {}
    requested = request.args.get('organization_id') or body.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


@bp.route('/tuition/queue', methods=['GET'])
@require_role(*STAFF_ROLES)
def tuition_queue(user_id):
    """CLP-finished students who still need a tuition invoice."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, **tuition.tuition_queue(org_id)})


@bp.route('/tuition/students/<student_id>/preview', methods=['GET'])
@require_role(*STAFF_ROLES)
def tuition_preview(user_id, student_id):
    """One student's tuition previewed for verification (schedule + line items +
    funding). The invoice this would send, before any manual adjustment."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = tuition.tuition_preview(org_id, student_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result})


@bp.route('/tuition/students/<student_id>/invoice', methods=['POST'])
@require_role(*STAFF_ROLES)
def send_tuition_invoice(user_id, student_id):
    """Send one tuition invoice for the student from the approver-verified line
    items. Body: {line_items:[{description, amount_cents, class_id?}],
    discount_cents?, note?, due_date?}. Emails the family a link to pay online."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    line_items = data.get('line_items')
    if not isinstance(line_items, list) or not line_items:
        return jsonify({'success': False, 'error': 'line_items must be a non-empty list'}), 400
    discount = data.get('discount_cents', 0)
    if not isinstance(discount, int) or discount < 0:
        return jsonify({'success': False, 'error': 'discount_cents must be a non-negative integer'}), 400
    result = tuition.send_tuition_invoice(
        org_id, student_id, actor_id=user_id, line_items=line_items,
        discount_cents=discount, note=data.get('note'), due_date=data.get('due_date'),
        invoice_id=data.get('invoice_id'))
    if result.get('error'):
        code = 404 if result['error'] == 'Student not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result}), 201


@bp.route('/tuition/students/<student_id>/invoice-preview.pdf', methods=['POST'])
@require_role(*STAFF_ROLES)
def preview_tuition_invoice(user_id, student_id):
    """The exact PDF the family will receive, built from what the approver is
    looking at right now.

    A POST because the line items being previewed are unsaved edits — there is
    no invoice to GET yet. It renders through the same renderer the email
    attachment uses, from the same document shape, so "preview" means the file
    and not an impression of it.

    Pass the `invoice_id` reserved by the preview call and the PDF carries the
    real invoice number and pay link — the id is what both derive from, so
    reserving it is what makes this the document rather than a likeness of it.
    The only remaining difference is the issue date, which is stamped on send.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    line_items = data.get('line_items')
    if not isinstance(line_items, list) or not line_items:
        return jsonify({'success': False, 'error': 'line_items must be a non-empty list'}), 400
    discount = data.get('discount_cents', 0)
    if not isinstance(discount, int) or discount < 0:
        return jsonify({'success': False, 'error': 'discount_cents must be a non-negative integer'}), 400

    invoice_id = data.get('invoice_id')
    result = tuition.preview_invoice_document(
        org_id, student_id, line_items=line_items,
        discount_cents=discount, due_date=data.get('due_date'),
        invoice_id=invoice_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404

    # The pay link the family will get. It resolves once the invoice exists —
    # clicking it from a preview lands on "this invoice isn't payable", which is
    # the right answer for an invoice nobody has sent yet.
    pay_link = None
    if invoice_id:
        try:
            from services.sis_pay_links import pay_url
            pay_link = pay_url(invoice_id)
        except Exception as e:  # noqa: BLE001
            logger.warning(f'[SIS tuition] preview pay link unavailable: {e}')

    from services.sis_invoice_pdf import render_invoice_pdf
    try:
        pdf = render_invoice_pdf(result['document'], pay_url=pay_link)
    except Exception as e:  # noqa: BLE001
        logger.error(f'[SIS tuition] invoice preview render failed: {e}')
        return jsonify({'success': False, 'error': 'Could not render the preview'}), 500
    return Response(pdf, mimetype='application/pdf', headers={
        # inline: the approver is checking it, not filing it.
        'Content-Disposition': 'inline; filename="invoice-preview.pdf"',
        'Cache-Control': 'no-store',
    })


# ── Open-ended monthly tuition ───────────────────────────────────────────────
#
# A set amount per student charged every month until it is turned off. Distinct
# from the queue-driven invoice above (which bills a finalized schedule once) and
# from the payment plans in billing.py (which split ONE invoice into a known
# number of installments). See services/sis_recurring_tuition_service.py.


@bp.route('/tuition/recurring', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_recurring_tuition(user_id):
    """Every live monthly schedule in the org, with names and card status."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, **recurring.list_for_org(org_id)})


@bp.route('/tuition/recurring', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_recurring_tuition(user_id):
    """Start a monthly schedule. Body: {student_id, monthly_cents, description?,
    day_of_month?}. Billing begins once the family has saved a card."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    student_id = data.get('student_id')
    if not student_id:
        return jsonify({'success': False, 'error': 'Choose a student'}), 400
    message = recurring.validate_terms(data.get('monthly_cents'),
                                       data.get('day_of_month', 1))
    if message:
        return jsonify({'success': False, 'error': message}), 400
    result = recurring.create(
        org_id, student_id, monthly_cents=data.get('monthly_cents'), actor_id=user_id,
        description=data.get('description'), day_of_month=data.get('day_of_month', 1))
    if result.get('error'):
        code = 404 if result['error'] == 'Student not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result}), 201


@bp.route('/tuition/recurring/<schedule_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_recurring_tuition(user_id, schedule_id):
    """Change the amount, label, or billing day. Takes effect next charge."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    result = recurring.update(
        org_id, schedule_id, actor_id=user_id,
        monthly_cents=data.get('monthly_cents'), description=data.get('description'),
        day_of_month=data.get('day_of_month'))
    if result.get('error'):
        code = 404 if result['error'] == 'Schedule not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/tuition/recurring/<schedule_id>/status', methods=['POST'])
@require_role(*STAFF_ROLES)
def set_recurring_tuition_status(user_id, schedule_id):
    """Pause, resume, or end a schedule. Body: {status}."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    status = (request.get_json() or {}).get('status')
    result = recurring.set_status(org_id, schedule_id, status, actor_id=user_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Schedule not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/tuition/recurring/households/<household_id>/setup-link', methods=['POST'])
@require_role(*STAFF_ROLES)
def send_recurring_setup_link(user_id, household_id):
    """Email the family the no-login link that saves a card and starts billing."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = recurring.send_setup_link(org_id, household_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})
