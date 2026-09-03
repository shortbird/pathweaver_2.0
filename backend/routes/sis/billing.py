"""
SIS billing routes — record-only tuition/invoicing (Optio never processes payments).

NEW, additive (/api/sis), staff-gated, org-scoped. Discount rules, quoting a
registration, generating invoices, payment plans, recording payments (collected in
SBS), late-fee sweep, and a household billing summary for the parent portal.
"""

from flask import Blueprint, request, jsonify, Response

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_billing_service as billing
# Finance tier: this module IS the money (tuition, invoices, Stripe), so it
# is the one place campus coordinators are kept out of entirely.
from utils.sis_roles import FINANCE_ROLES as STAFF_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_billing', __name__, url_prefix='/api/sis')


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


@bp.route('/invoices/<invoice_id>/document', methods=['GET'])
@require_role(*STAFF_ROLES)
def invoice_document(user_id, invoice_id):
    """Branded, itemized invoice payload for print/PDF (org identity, number,
    family, line items, discount, processing fee, funding source, amount due)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = billing.invoice_document(org_id, invoice_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result})


@bp.route('/invoices/<invoice_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_invoice(user_id, invoice_id):
    """Correct an invoice that was already sent, keeping its number.

    Body: {line_items?: [{description, amount_cents, class_id?, kind?}],
    discount_cents?, due_date?}. Omitted fields are left alone; `line_items`
    replaces the whole list. Sending a second invoice was the only previous way
    to fix a wrong amount, which left the family with two.

    The card processing fee is one of the line items (kind 'fee', description
    'Card processing fee'), so it is edited and waived like any other line.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    line_items = data.get('line_items')
    if line_items is not None and (not isinstance(line_items, list) or not line_items):
        return jsonify({'success': False, 'error': 'line_items must be a non-empty list'}), 400
    discount = data.get('discount_cents')
    if discount is not None and (not isinstance(discount, int) or discount < 0):
        return jsonify({'success': False, 'error': 'discount_cents must be a non-negative integer'}), 400
    result = billing.update_invoice(
        org_id, invoice_id, actor_user_id=user_id,
        line_items=line_items, discount_cents=discount,
        due_date=data['due_date'] if 'due_date' in data else billing._UNSET)
    if result.get('error'):
        code = 404 if result['error'] == 'Invoice not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/invoices/<invoice_id>/void', methods=['POST'])
@require_role(*STAFF_ROLES)
def void_invoice(user_id, invoice_id):
    """Cancel an invoice. It stays on the record and drops off the family portal,
    the outstanding report and the reminder sweep. Refused once a payment has
    been recorded — that is an edit or a refund, not a void."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = billing.void_invoice(org_id, invoice_id, actor_user_id=user_id,
                                 reason=(request.json or {}).get('reason'))
    if result.get('error'):
        code = 404 if result['error'] == 'Invoice not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/billing/detail', methods=['GET'])
@require_role(*STAFF_ROLES)
def billing_detail(user_id):
    """Itemized charges + payments for reconciling money that arrives from
    outside Optio (UFA remits an amount, not a statement of what it covers).

    ?household_id= narrows to one family, ?kind=supply to one category of
    charge, ?format=csv downloads the same rows. ?q= is the page's search box,
    honoured on the CSV only: the download has to be of what the office is
    looking at, not of rows the screen filtered out.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    report = billing.billing_detail(
        org_id,
        household_id=request.args.get('household_id'),
        kind=request.args.get('kind'))
    if request.args.get('format') == 'csv':
        import csv
        import io
        rows = report['rows']
        terms = (request.args.get('q') or '').lower().split()
        if terms:
            def _haystack(r):
                return ' '.join(str(v) for v in (
                    r['family_name'] or '', r['student_name'] or '',
                    r['invoice_number'] or '', r['description'] or '', r['kind'],
                    f"${abs(r['amount_cents'] or 0) / 100:.2f}",
                    f"${abs(r['invoice_balance_cents'] or 0) / 100:.2f}",
                )).lower()
            rows = [r for r in rows if all(t in _haystack(r) for t in terms)]
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(['Family', 'Student', 'Invoice', 'Status', 'Issued', 'Due',
                    'Charge', 'Type', 'Amount', 'Invoice total', 'Paid', 'Balance'])
        for r in rows:
            w.writerow([
                r['family_name'] or '', r['student_name'] or '',
                r['invoice_number'] or '', r['status'] or '',
                str(r['issued_at'] or '')[:10], str(r['due_date'] or '')[:10],
                r['description'] or '', r['kind'],
                f"{(r['amount_cents'] or 0) / 100:.2f}",
                f"{(r['invoice_total_cents'] or 0) / 100:.2f}",
                f"{(r['invoice_paid_cents'] or 0) / 100:.2f}",
                f"{(r['invoice_balance_cents'] or 0) / 100:.2f}",
            ])
        return Response(buf.getvalue(), mimetype='text/csv', headers={
            'Content-Disposition': 'attachment; filename=billing-detail.csv'})
    return jsonify({'success': True, 'report': report})


@bp.route('/invoices/<invoice_id>/audit', methods=['GET'])
@require_role(*STAFF_ROLES)
def invoice_audit(user_id, invoice_id):
    """The audit trail for one invoice (who marked paid / overrode a fee / edited)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'audit': billing.invoice_audit(org_id, invoice_id)})


@bp.route('/invoices/<invoice_id>/processing-fee', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def set_processing_fee(user_id, invoice_id):
    """Admin override of an invoice's processing fee (waive it or set the card rate).

    Writes the fee LINE on the invoice, so the family's copy shows what changed.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    fee = data.get('processing_fee_cents')
    if not isinstance(fee, int) or fee < 0:
        return jsonify({'success': False, 'error': 'processing_fee_cents must be a non-negative integer'}), 400
    result = billing.set_processing_fee(org_id, invoice_id, fee, actor_user_id=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result})


# ── Record-only charges + ledger (Gryffin microschool model) ─────────────────
@bp.route('/billing/charges', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_charge(user_id):
    """Create a standalone charge (invoice + one line item), no pricing engine.
    Body: {household_id?, student_user_id?, description, amount_cents, due_date?,
    kind?}. At least one of household_id/student_user_id is required; `kind`
    classifies the charge for the reconciliation report."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    amount = data.get('amount_cents')
    if not isinstance(amount, int) or amount <= 0:
        return jsonify({'success': False, 'error': 'amount_cents must be a positive integer'}), 400
    result = billing.create_charge(org_id, {
        'household_id': data.get('household_id'),
        'student_user_id': data.get('student_user_id'),
        'description': data.get('description'),
        'amount_cents': amount,
        'due_date': data.get('due_date'),
        'kind': data.get('kind'),
    })
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201


@bp.route('/billing/ledger', methods=['GET'])
@require_role(*STAFF_ROLES)
def billing_ledger(user_id):
    """Charges ledger for the staff table. Optional ?month=YYYY-MM filters by
    due_date; omitted returns all non-void, non-draft invoices."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True,
                    'ledger': billing.billing_ledger(org_id, month=request.args.get('month'))})


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


@bp.route('/invoices/<invoice_id>/refunds', methods=['POST'])
@require_role(*STAFF_ROLES)
def record_refund(user_id, invoice_id):
    """Record money returned to the family, as a reversing entry.

    The amount arrives positive and is stored negative, so the ledger, the
    receipt and the invoice balance all move together. It reopens that much of
    the balance — if the family no longer owes it, the invoice also needs an
    edit or a void.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    amount = data.get('amount_cents')
    if not isinstance(amount, int) or amount <= 0:
        return jsonify({'success': False, 'error': 'amount_cents must be a positive integer'}), 400
    result = billing.record_refund(
        org_id, invoice_id, amount,
        method=data.get('method'), external_ref=data.get('external_ref'),
        recorded_by=user_id, note=data.get('note'),
    )
    if result.get('error'):
        status = 404 if result['error'] == 'Invoice not found' else 400
        return jsonify({'success': False, 'error': result['error']}), status
    return jsonify({'success': True, **result}), 201


@bp.route('/payments/<payment_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def correct_payment(user_id, payment_id):
    """Correct how a recorded payment is described — method, reference, note.

    Not the amount: see PAYMENT_CORRECTABLE_FIELDS. Anything else in the body is
    ignored rather than rejected, so a client sending the whole row back cannot
    smuggle a new amount past this.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = billing.update_payment_record(
        org_id, payment_id, request.json or {}, actor_user_id=user_id)
    if result.get('error'):
        status = 404 if result['error'] == 'Payment not found' else 400
        return jsonify({'success': False, 'error': result['error']}), status
    return jsonify({'success': True, **result})


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
    from utils.cron_auth import is_valid_cron_secret
    is_cron = is_valid_cron_secret(secret)
    if not is_cron:
        from utils.session_manager import session_manager
        uid = session_manager.get_effective_user_id()
        is_super = False
        if uid:
            # admin client justified: resolves the CALLER's own role to make the access
            #   decision; under RLS the row the check depends on may be invisible, so the
            #   check could not run
            row = (
                get_supabase_admin_client().table('users').select('role')
                .eq('id', uid).limit(1).execute()
            ).data
            is_super = bool(row and row[0].get('role') == 'superadmin')
        if not is_super:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    # The online-payment sweep rides on this daily run rather than getting a
    # cron entry of its own: a new schedule means new Render config, and a
    # half-applied cron change already took every job down for two days
    # (CRON_SECRET, July 2026). It runs first so a payment made yesterday is
    # recorded before we consider nagging that family about it.
    swept = billing.sweep_online_payments()
    return jsonify({'success': True, 'payment_sweep': swept,
                    **billing.run_payment_reminders()})


@bp.route('/internal/tuition-autopay', methods=['POST'])
def tuition_autopay_cron():
    """Cron entrypoint: charge every due auto-charge installment across ALL orgs
    (saved-card payment plans). Auth via X-Cron-Secret, or a signed-in superadmin
    for manual triggering (mirrors /api/sis/internal/billing-reminders)."""
    from app_config import Config
    from database import get_supabase_admin_client
    secret = request.headers.get('X-Cron-Secret')
    from utils.cron_auth import is_valid_cron_secret
    is_cron = is_valid_cron_secret(secret)
    if not is_cron:
        from utils.session_manager import session_manager
        uid = session_manager.get_effective_user_id()
        is_super = False
        if uid:
            # admin client justified: resolves the CALLER's own role to make the access
            #   decision; under RLS the row the check depends on may be invisible, so the
            #   check could not run
            row = (
                get_supabase_admin_client().table('users').select('role')
                .eq('id', uid).limit(1).execute()
            ).data
            is_super = bool(row and row[0].get('role') == 'superadmin')
        if not is_super:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    return jsonify({'success': True, **billing.charge_due_installments()})


@bp.route('/internal/recurring-tuition', methods=['POST'])
def recurring_tuition_cron():
    """Cron entrypoint: bill every household whose open-ended monthly tuition
    falls due today, across ALL orgs. One invoice and one charge per household,
    with a line per student.

    Same auth as the autopay sweep: X-Cron-Secret, or a signed-in superadmin for
    manual triggering. Idempotent within a day — a billed row's next_charge_on
    has already moved to next month, so a re-run finds nothing due.
    """
    from database import get_supabase_admin_client
    from services import sis_recurring_tuition_service as recurring
    secret = request.headers.get('X-Cron-Secret')
    from utils.cron_auth import is_valid_cron_secret
    is_cron = is_valid_cron_secret(secret)
    if not is_cron:
        from utils.session_manager import session_manager
        uid = session_manager.get_effective_user_id()
        is_super = False
        if uid:
            # admin client justified: resolves the CALLER's own role to make the access
            #   decision; under RLS the row the check depends on may be invisible, so the
            #   check could not run
            row = (
                get_supabase_admin_client().table('users').select('role')
                .eq('id', uid).limit(1).execute()
            ).data
            is_super = bool(row and row[0].get('role') == 'superadmin')
        if not is_super:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    return jsonify({'success': True, **recurring.charge_due()})
