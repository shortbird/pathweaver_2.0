"""
Optio's own invoices, from /admin/billing.

Superadmin only: Optio billing whoever owes it, optionally linked to an
organization. No role inside an org may see or change any of it. The work lives
in services/org_billing_service.py; Stripe is the record, so there is no table
behind these routes.
"""

from flask import Blueprint, jsonify, request

from repositories.organization_repository import OrganizationRepository
from services import org_billing_service as org_billing
from utils.auth.decorators import require_superadmin
from utils.logger import get_logger
from utils.validation import validate_uuid

logger = get_logger(__name__)

bp = Blueprint('optio_billing', __name__, url_prefix='/api/admin/billing')


def _refusal(exc):
    status = 503 if isinstance(exc, org_billing.OrgBillingUnavailable) else 400
    message = 'Stripe is not configured on this server' if status == 503 else str(exc)
    return jsonify({'error': message}), status


def _org_or_none(org_id):
    """A linked org must be a real one; an empty value means no link."""
    if not org_id:
        return None
    ok, _ = validate_uuid(org_id)
    if not ok or not OrganizationRepository().find_by_id(org_id):
        raise org_billing.OrgBillingError('Organization not found')
    return org_id


@bp.route('/invoices', methods=['GET'])
@require_superadmin
def list_invoices(superadmin_user_id):
    """Every invoice sent from here, newest first. ?organization_id= narrows it."""
    try:
        invoices = org_billing.list_invoices(_org_or_none(request.args.get('organization_id')))
    except (org_billing.OrgBillingError, org_billing.OrgBillingUnavailable) as exc:
        return _refusal(exc)
    return jsonify({'invoices': invoices,
                    'default_days_until_due': org_billing.DEFAULT_DAYS_UNTIL_DUE})


@bp.route('/invoices', methods=['POST'])
@require_superadmin
def create_invoice(superadmin_user_id):
    """Create, finalize and email an invoice."""
    body = request.get_json(silent=True) or {}
    try:
        invoice = org_billing.create_invoice(
            recipient_email=body.get('recipient_email'),
            recipient_name=body.get('recipient_name') or '',
            lines=body.get('lines'),
            memo=body.get('memo') or '',
            days_until_due=body.get('days_until_due'),
            organization_id=_org_or_none(body.get('organization_id')),
        )
    except (org_billing.OrgBillingError, org_billing.OrgBillingUnavailable) as exc:
        return _refusal(exc)
    logger.info('[optio billing] %s sent invoice %s', superadmin_user_id[:8], invoice['id'])
    return jsonify({'invoice': invoice}), 201


_ACTIONS = {
    'remind': lambda inv_id, body: org_billing.resend_invoice(inv_id),
    'void': lambda inv_id, body: org_billing.void_invoice(inv_id),
    'mark-paid': lambda inv_id, body: org_billing.mark_paid_outside(inv_id, body.get('note') or ''),
}


@bp.route('/invoices/<invoice_id>/<action>', methods=['POST'])
@require_superadmin
def invoice_action(superadmin_user_id, invoice_id, action):
    """remind (email it again), void, or mark-paid (a check or wire)."""
    run = _ACTIONS.get(action)
    if not run:
        return jsonify({'error': 'Unknown action'}), 404
    try:
        invoice = run(invoice_id, request.get_json(silent=True) or {})
    except (org_billing.OrgBillingError, org_billing.OrgBillingUnavailable) as exc:
        return _refusal(exc)
    logger.info('[optio billing] %s: %s on %s', superadmin_user_id[:8], action, invoice_id)
    return jsonify({'invoice': invoice})
