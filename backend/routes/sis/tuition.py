"""
SIS tuition-approver routes — CLP finished -> verify tuition -> send invoice.

NEW, additive (/api/sis), org-scoped, FINANCE-gated (this is money, so campus
coordinators are kept out, same as billing). Lists CLP-finished students awaiting
an invoice, previews one student's tuition for verification, and sends one invoice
per student to the family.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_tuition_service as tuition
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
        discount_cents=discount, note=data.get('note'), due_date=data.get('due_date'))
    if result.get('error'):
        code = 404 if result['error'] == 'Student not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result}), 201
