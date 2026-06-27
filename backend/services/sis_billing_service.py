"""
SIS Billing service — record-only tuition/invoicing (Optio never processes payments).

Composes the pure pricing engine (services/sis_pricing.py) with admin-client DB ops:
discount rules, quoting a registration, generating an invoice + line items, payment
plans + installments, recording payments (money collected in SBS), late fees, and a
QuickBooks sync-log stub. See SIS_ARCHITECTURE_DISCOVERY.md §1.5.
"""

from datetime import datetime, timezone, date
from typing import Dict, List, Any, Optional

from database import get_supabase_admin_client
from services import sis_pricing as pricing
from utils.logger import get_logger

logger = get_logger(__name__)

DISCOUNT_RULE_TYPES = ('sibling', 'multi_class', 'promo', 'manual')
CADENCES = ('monthly', 'semester', 'full')


def _admin():
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc).isoformat()


# ── Discount rules ───────────────────────────────────────────────────────────
def list_discount_rules(org_id: str) -> List[Dict[str, Any]]:
    return (
        _admin().table('sis_discount_rules').select('*')
        .eq('organization_id', org_id).order('created_at').execute()
    ).data or []


def create_discount_rule(org_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
    payload = {
        'organization_id': org_id,
        'name': fields.get('name'),
        'rule_type': fields.get('rule_type'),
        'criteria': fields.get('criteria') or {},
        'active': fields.get('active', True),
    }
    resp = _admin().table('sis_discount_rules').insert(payload).execute()
    return resp.data[0] if resp.data else None


def update_discount_rule(org_id: str, rule_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    payload = {k: fields[k] for k in ('name', 'criteria', 'active') if k in fields}
    payload['updated_at'] = _now()
    resp = (
        _admin().table('sis_discount_rules').update(payload)
        .eq('id', rule_id).eq('organization_id', org_id).execute()
    )
    return resp.data[0] if resp.data else None


def delete_discount_rule(org_id: str, rule_id: str) -> None:
    _admin().table('sis_discount_rules').delete().eq('id', rule_id).eq('organization_id', org_id).execute()


# ── Helpers ──────────────────────────────────────────────────────────────────
def _household_student_count(household_id: Optional[str]) -> int:
    if not household_id:
        return 1
    rows = (
        _admin().table('household_members').select('id')
        .eq('household_id', household_id).eq('relationship', 'student').execute()
    ).data or []
    return max(1, len(rows))


def _registration(org_id: str, reg_id: str) -> Optional[Dict[str, Any]]:
    rows = (
        _admin().table('sis_registrations').select('*')
        .eq('id', reg_id).eq('organization_id', org_id).limit(1).execute()
    ).data
    return rows[0] if rows else None


def _registration_items(reg_id: str) -> List[Dict[str, Any]]:
    return (
        _admin().table('sis_registration_items').select('*')
        .eq('registration_id', reg_id).execute()
    ).data or []


# ── Quote / invoice ──────────────────────────────────────────────────────────
def quote_for_registration(org_id: str, reg_id: str,
                           promo_code: Optional[str] = None,
                           manual_rule_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    reg = _registration(org_id, reg_id)
    if not reg:
        return {'error': 'Registration not found'}
    items = _registration_items(reg_id)
    prices = [it.get('price_snapshot_cents') or 0 for it in items]
    rules = list_discount_rules(org_id)
    context = {
        'sibling_count': _household_student_count(reg.get('household_id')),
        'class_count': len(items),
        'promo_code': promo_code,
        'manual_rule_ids': manual_rule_ids or [],
    }
    quote = pricing.build_quote(prices, rules, context)
    quote['items'] = items
    return quote


def create_invoice_from_registration(org_id: str, reg_id: str,
                                     promo_code: Optional[str] = None,
                                     manual_rule_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    reg = _registration(org_id, reg_id)
    if not reg:
        return {'error': 'Registration not found'}
    items = _registration_items(reg_id)
    if not items:
        return {'error': 'Registration has no classes to invoice'}
    quote = quote_for_registration(org_id, reg_id, promo_code, manual_rule_ids)

    invoice = (
        _admin().table('sis_invoices').insert({
            'organization_id': org_id,
            'household_id': reg.get('household_id'),
            'student_user_id': reg.get('student_user_id'),
            'registration_id': reg_id,
            'status': 'sent',
            'subtotal_cents': quote['subtotal_cents'],
            'discount_cents': quote['discount_cents'],
            'total_cents': quote['total_cents'],
            'issued_at': _now(),
        }).execute()
    ).data[0]

    # class names for line descriptions
    class_ids = [it['class_id'] for it in items]
    names = {}
    if class_ids:
        names = {c['id']: c['name'] for c in (
            _admin().table('org_classes').select('id, name').in_('id', class_ids).execute()
        ).data or []}
    line_rows = [{
        'invoice_id': invoice['id'],
        'description': names.get(it['class_id'], 'Class'),
        'class_id': it['class_id'],
        'amount_cents': it.get('price_snapshot_cents') or 0,
        'quantity': 1,
    } for it in items]
    if line_rows:
        _admin().table('sis_invoice_line_items').insert(line_rows).execute()

    enqueue_qbo(org_id, 'invoice', invoice['id'])
    return {'invoice': invoice, 'discount_lines': quote.get('discount_lines', [])}


def list_invoices(org_id: str, household_id: Optional[str] = None,
                  status: Optional[str] = None) -> List[Dict[str, Any]]:
    query = _admin().table('sis_invoices').select('*').eq('organization_id', org_id)
    if household_id:
        query = query.eq('household_id', household_id)
    if status:
        query = query.eq('status', status)
    return query.order('created_at', desc=True).execute().data or []


def get_invoice(org_id: str, invoice_id: str) -> Optional[Dict[str, Any]]:
    rows = (
        _admin().table('sis_invoices').select('*')
        .eq('id', invoice_id).eq('organization_id', org_id).limit(1).execute()
    ).data
    if not rows:
        return None
    inv = rows[0]
    inv['line_items'] = (
        _admin().table('sis_invoice_line_items').select('*')
        .eq('invoice_id', invoice_id).execute()
    ).data or []
    plans = (
        _admin().table('sis_payment_plans').select('*')
        .eq('invoice_id', invoice_id).execute()
    ).data or []
    for plan in plans:
        plan['installments'] = (
            _admin().table('sis_installments').select('*')
            .eq('payment_plan_id', plan['id']).order('due_date').execute()
        ).data or []
    inv['payment_plans'] = plans
    inv['payments'] = (
        _admin().table('sis_payment_records').select('*')
        .eq('invoice_id', invoice_id).order('recorded_at', desc=True).execute()
    ).data or []
    return inv


# ── Payment plans ────────────────────────────────────────────────────────────
def create_payment_plan(org_id: str, invoice_id: str, cadence: str,
                        installment_count: int, start_date: Any) -> Dict[str, Any]:
    inv = (
        _admin().table('sis_invoices').select('*')
        .eq('id', invoice_id).eq('organization_id', org_id).limit(1).execute()
    ).data
    if not inv:
        return {'error': 'Invoice not found'}
    inv = inv[0]
    schedule = pricing.build_schedule(inv['total_cents'], cadence, installment_count, start_date)
    plan = (
        _admin().table('sis_payment_plans').insert({
            'invoice_id': invoice_id,
            'cadence': cadence,
            'installment_count': len(schedule),
        }).execute()
    ).data[0]
    rows = [{
        'payment_plan_id': plan['id'],
        'due_date': s['due_date'],
        'amount_cents': s['amount_cents'],
        'status': 'scheduled',
    } for s in schedule]
    if rows:
        _admin().table('sis_installments').insert(rows).execute()
    plan['installments'] = rows
    return {'plan': plan}


# ── Payments ─────────────────────────────────────────────────────────────────
def _recompute_invoice_status(invoice_id: str) -> Dict[str, Any]:
    inv = (
        _admin().table('sis_invoices').select('*').eq('id', invoice_id).limit(1).execute()
    ).data[0]
    payments = (
        _admin().table('sis_payment_records').select('amount_cents')
        .eq('invoice_id', invoice_id).execute()
    ).data or []
    paid = sum(p['amount_cents'] for p in payments)
    if paid >= inv['total_cents'] and inv['total_cents'] > 0:
        status = 'paid'
    elif paid > 0:
        status = 'partial'
    else:
        status = inv['status'] if inv['status'] in ('draft', 'void') else 'sent'
    resp = (
        _admin().table('sis_invoices')
        .update({'amount_paid_cents': paid, 'status': status, 'updated_at': _now()})
        .eq('id', invoice_id).execute()
    )
    return resp.data[0]


def record_payment(org_id: str, invoice_id: str, amount_cents: int,
                   method: Optional[str], external_ref: Optional[str],
                   installment_id: Optional[str], recorded_by: str,
                   note: Optional[str] = None) -> Dict[str, Any]:
    inv = (
        _admin().table('sis_invoices').select('id')
        .eq('id', invoice_id).eq('organization_id', org_id).limit(1).execute()
    ).data
    if not inv:
        return {'error': 'Invoice not found'}
    record = (
        _admin().table('sis_payment_records').insert({
            'organization_id': org_id,
            'invoice_id': invoice_id,
            'installment_id': installment_id,
            'amount_cents': amount_cents,
            'method': method,
            'external_ref': external_ref,
            'recorded_by': recorded_by,
            'note': note,
        }).execute()
    ).data[0]
    if installment_id:
        _admin().table('sis_installments').update(
            {'status': 'paid', 'paid_at': _now(), 'updated_at': _now()}
        ).eq('id', installment_id).execute()
    invoice = _recompute_invoice_status(invoice_id)
    enqueue_qbo(org_id, 'payment', record['id'])
    auto = _maybe_autocomplete_registration(org_id, invoice, recorded_by)
    return {'payment': record, 'invoice': invoice, 'auto_enrolled': auto}


def _maybe_autocomplete_registration(org_id: str, invoice: Dict[str, Any],
                                     actor_id: str) -> Optional[Dict[str, Any]]:
    """When an invoice is fully paid, auto-complete its registration so the student
    is enrolled. This makes enrollment confirmation follow payment (the closest the
    record-only billing model gets to "enroll on payment"). No-op unless the invoice
    is paid, is tied to a registration, and that registration isn't already complete.
    """
    if invoice.get('status') != 'paid':
        return None
    reg_id = invoice.get('registration_id')
    if not reg_id:
        return None
    from services import sis_registration_service as regs
    reg = regs.get_registration(org_id, reg_id)
    if not reg or reg.get('status') in ('completed', 'cancelled'):
        return None
    try:
        return regs.complete(org_id, reg_id, completed_by=actor_id)
    except Exception as e:  # never let enrollment failure roll back a recorded payment
        logger.error(f"[SIS billing] auto-complete failed for reg {reg_id}: {e}")
        return None


def apply_late_fees(org_id: str, late_fee_cents: int) -> Dict[str, Any]:
    """Mark overdue scheduled installments 'late' and add a one-time late fee."""
    # join installments -> plans -> invoices for this org
    invoices = (
        _admin().table('sis_invoices').select('id').eq('organization_id', org_id).execute()
    ).data or []
    invoice_ids = [i['id'] for i in invoices]
    if not invoice_ids:
        return {'updated': 0}
    plans = (
        _admin().table('sis_payment_plans').select('id').in_('invoice_id', invoice_ids).execute()
    ).data or []
    plan_ids = [p['id'] for p in plans]
    if not plan_ids:
        return {'updated': 0}
    installments = (
        _admin().table('sis_installments').select('*')
        .in_('payment_plan_id', plan_ids).eq('status', 'scheduled').execute()
    ).data or []
    updated = 0
    for inst in installments:
        if pricing.is_overdue(inst['due_date'], inst['status']):
            _admin().table('sis_installments').update({
                'status': 'late',
                'late_fee_cents': (inst.get('late_fee_cents') or 0) + late_fee_cents,
                'updated_at': _now(),
            }).eq('id', inst['id']).execute()
            updated += 1
    return {'updated': updated}


# ── QuickBooks sync log (no live API yet) ────────────────────────────────────
def enqueue_qbo(org_id: str, entity_type: str, entity_id: str) -> Dict[str, Any]:
    resp = _admin().table('sis_quickbooks_sync_log').insert({
        'organization_id': org_id,
        'entity_type': entity_type,
        'entity_id': entity_id,
        'status': 'pending',
    }).execute()
    return resp.data[0] if resp.data else None


# ── Parent-facing billing summary ────────────────────────────────────────────
def household_billing(org_id: str, household_id: str) -> Dict[str, Any]:
    invoices = list_invoices(org_id, household_id=household_id)
    invoice_ids = [i['id'] for i in invoices]
    upcoming: List[Dict[str, Any]] = []
    if invoice_ids:
        plans = (
            _admin().table('sis_payment_plans').select('id, invoice_id')
            .in_('invoice_id', invoice_ids).execute()
        ).data or []
        plan_ids = [p['id'] for p in plans]
        if plan_ids:
            upcoming = (
                _admin().table('sis_installments').select('*')
                .in_('payment_plan_id', plan_ids).neq('status', 'paid')
                .order('due_date').execute()
            ).data or []
    # SBS pay link (per-org, hidden until set) — Optio never collects money itself
    org = (
        _admin().table('organizations').select('feature_flags').eq('id', org_id).limit(1).execute()
    ).data
    pay_url = ((org[0].get('feature_flags') or {}).get('sbs_pay_url')) if org else None
    return {'invoices': invoices, 'upcoming_installments': upcoming, 'sbs_pay_url': pay_url}
