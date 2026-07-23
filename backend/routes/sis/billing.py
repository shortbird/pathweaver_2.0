"""
SIS billing routes — record-only tuition/invoicing (Optio never processes payments).

NEW, additive (/api/sis), staff-gated, org-scoped. Discount rules, quoting a
registration, generating invoices, payment plans, recording payments (collected in
SBS), late-fee sweep, and a household billing summary for the parent portal.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_billing_service as billing

logger = get_logger(__name__)

bp = Blueprint('sis_billing', __name__, url_prefix='/api/sis')

# Admin tier: this whole module is org management, not teacher-facing.
STAFF_ROLES = ('org_admin', 'superadmin')


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


# ── Discount rules ───────────────────────────────────────────────────────────
@bp.route('/discount-rules', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_rules(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'rules': billing.list_discount_rules(org_id)})


@bp.route('/discount-rules', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_rule(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    if not (data.get('name') or '').strip():
        return jsonify({'success': False, 'error': 'Rule name is required'}), 400
    if data.get('rule_type') not in billing.DISCOUNT_RULE_TYPES:
        return jsonify({'success': False, 'error': 'Invalid rule_type'}), 400
    return jsonify({'success': True, 'rule': billing.create_discount_rule(org_id, data)}), 201


@bp.route('/discount-rules/<rule_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_rule(user_id, rule_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    rule = billing.update_discount_rule(org_id, rule_id, request.json or {})
    if not rule:
        return jsonify({'success': False, 'error': 'Rule not found'}), 404
    return jsonify({'success': True, 'rule': rule})


@bp.route('/discount-rules/<rule_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def delete_rule(user_id, rule_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    billing.delete_discount_rule(org_id, rule_id)
    return jsonify({'success': True})


# ── Quote + invoices ─────────────────────────────────────────────────────────
@bp.route('/registrations/<reg_id>/quote', methods=['GET'])
@require_role(*STAFF_ROLES)
def quote(user_id, reg_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = billing.quote_for_registration(
        org_id, reg_id,
        promo_code=request.args.get('promo_code'),
    )
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, 'quote': result})


@bp.route('/registrations/<reg_id>/invoice', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_invoice(user_id, reg_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    result = billing.create_invoice_from_registration(
        org_id, reg_id,
        promo_code=data.get('promo_code'),
        manual_rule_ids=data.get('manual_rule_ids'),
    )
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201


@bp.route('/invoices', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_invoices(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'invoices': billing.list_invoices(
        org_id, household_id=request.args.get('household_id'),
        status=request.args.get('status'))})


@bp.route('/invoices/<invoice_id>', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_invoice(user_id, invoice_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    inv = billing.get_invoice(org_id, invoice_id)
    if not inv:
        return jsonify({'success': False, 'error': 'Invoice not found'}), 404
    return jsonify({'success': True, 'invoice': inv})


# ── Payment plans + payments ─────────────────────────────────────────────────
@bp.route('/invoices/<invoice_id>/payment-plan', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_plan(user_id, invoice_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    cadence = data.get('cadence')
    if cadence not in billing.CADENCES:
        return jsonify({'success': False, 'error': 'Invalid cadence'}), 400
    result = billing.create_payment_plan(
        org_id, invoice_id, cadence,
        installment_count=int(data.get('installment_count') or 1),
        start_date=data.get('start_date'),
    )
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result}), 201


@bp.route('/invoices/<invoice_id>/payments', methods=['POST'])
@require_role(*STAFF_ROLES)
def record_payment(user_id, invoice_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    amount = data.get('amount_cents')
    if not isinstance(amount, int) or amount <= 0:
        return jsonify({'success': False, 'error': 'amount_cents must be a positive integer'}), 400
    result = billing.record_payment(
        org_id, invoice_id, amount,
        method=data.get('method'), external_ref=data.get('external_ref'),
        installment_id=data.get('installment_id'), recorded_by=user_id,
        note=data.get('note'),
    )
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result}), 201


@bp.route('/billing/apply-late-fees', methods=['POST'])
@require_role(*STAFF_ROLES)
def apply_late_fees(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    fee = data.get('late_fee_cents')
    if not isinstance(fee, int) or fee < 0:
        return jsonify({'success': False, 'error': 'late_fee_cents must be a non-negative integer'}), 400
    return jsonify({'success': True, **billing.apply_late_fees(org_id, fee)})


@bp.route('/households/<household_id>/billing', methods=['GET'])
@require_role(*STAFF_ROLES)
def household_billing(user_id, household_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, **billing.household_billing(org_id, household_id)})


# ── Outstanding balances + payment reminders ─────────────────────────────────
@bp.route('/billing/outstanding', methods=['GET'])
@require_role(*STAFF_ROLES)
def outstanding_report(user_id):
    """Org-scoped outstanding/overdue invoice report: family name, amount due,
    days overdue, and unpaid installments."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'outstanding': billing.outstanding_invoices(org_id)})


@bp.route('/billing/reminders/run', methods=['POST'])
@require_role(*STAFF_ROLES)
def run_reminders(user_id):
    """Manual admin trigger: email guardians of past-due invoices in this org.
    Same logic as the cron sweep, scoped to the caller's organization."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, **billing.run_payment_reminders(org_id=org_id)})


@bp.route('/internal/billing-reminders', methods=['POST'])
def billing_reminders_cron():
    """Cron entrypoint: payment-reminder sweep across ALL orgs.
    Auth via X-Cron-Secret, or a signed-in superadmin for manual triggering
    (mirrors /api/sis/internal/attendance-sweep)."""
    from app_config import Config
    from database import get_supabase_admin_client
    secret = request.headers.get('X-Cron-Secret')
    is_cron = bool(secret and Config.CRON_SECRET and secret == Config.CRON_SECRET)
    if not is_cron:
        from utils.session_manager import session_manager
        uid = session_manager.get_effective_user_id()
        is_super = False
        if uid:
            row = (
                get_supabase_admin_client().table('users').select('role')
                .eq('id', uid).limit(1).execute()
            ).data
            is_super = bool(row and row[0].get('role') == 'superadmin')
        if not is_super:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    return jsonify({'success': True, **billing.run_payment_reminders()})
