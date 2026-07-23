"""
SIS Billing service — record-only tuition/invoicing (Optio never processes payments).

Composes the pure pricing engine (services/sis_pricing.py) with admin-client DB ops:
discount rules, quoting a registration, generating an invoice + line items, payment
plans + installments, recording payments (money collected in SBS), late fees, and a
QuickBooks sync-log stub. See SIS_ARCHITECTURE_DISCOVERY.md §1.5.
"""

from datetime import datetime, timezone, timedelta, date
from typing import Dict, List, Any, Optional

from app_config import Config
from database import get_supabase_admin_client
from services import sis_pricing as pricing
from utils.logger import get_logger

logger = get_logger(__name__)

DISCOUNT_RULE_TYPES = ('sibling', 'multi_class', 'promo', 'manual')
CADENCES = ('monthly', 'semester', 'full')

# Payment reminders: don't nag the same invoice's family more than once per window.
REMINDER_COOLDOWN_DAYS = 25
UNPAID_INSTALLMENT_STATUSES = ('scheduled', 'due', 'late')
OPEN_INVOICE_STATUSES = ('sent', 'partial', 'overdue')


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


# ── Manual charge (record-only, no pricing engine) ───────────────────────────
def create_charge(org_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
    """Create a standalone charge as a 'sent' invoice + one line item. No
    registration, no discount rules — the school just records what a family owes
    (they pay out-of-band by Zelle/scholarship and staff record the payment)."""
    household_id = fields.get('household_id')
    student_user_id = fields.get('student_user_id')
    description = (fields.get('description') or '').strip()
    amount_cents = fields.get('amount_cents')
    due_date = fields.get('due_date') or None
    if not household_id and not student_user_id:
        return {'error': 'A family or student is required'}
    if not description:
        return {'error': 'A description is required'}
    if not isinstance(amount_cents, int) or amount_cents <= 0:
        return {'error': 'amount_cents must be a positive integer'}
    invoice = (
        _admin().table('sis_invoices').insert({
            'organization_id': org_id,
            'household_id': household_id,
            'student_user_id': student_user_id,
            'status': 'sent',
            'subtotal_cents': amount_cents,
            'discount_cents': 0,
            'total_cents': amount_cents,
            'amount_paid_cents': 0,
            'issued_at': _now(),
            'due_date': due_date,
        }).execute()
    ).data[0]
    _admin().table('sis_invoice_line_items').insert({
        'invoice_id': invoice['id'],
        'description': description,
        'amount_cents': amount_cents,
        'quantity': 1,
    }).execute()
    return {'invoice': invoice}


# ── Charges ledger (staff table: who owes / who paid) ────────────────────────
def billing_ledger(org_id: str, month: Optional[str] = None) -> List[Dict[str, Any]]:
    """One row per non-void, non-draft invoice, enriched for a staff table:
    family + student names, the charge description, totals, balance, status,
    and the latest payment's method + date. `month` (YYYY-MM) filters by
    due_date. Outstanding balances sort first, then by due date."""
    invoices = [i for i in list_invoices(org_id)
                if i.get('status') not in ('draft', 'void')]
    if month:
        invoices = [i for i in invoices if str(i.get('due_date') or '')[:7] == month]
    if not invoices:
        return []
    ids = [i['id'] for i in invoices]

    lines_by_inv: Dict[str, List[Dict[str, Any]]] = {}
    for li in (_admin().table('sis_invoice_line_items').select('*')
               .in_('invoice_id', ids).execute()).data or []:
        lines_by_inv.setdefault(li['invoice_id'], []).append(li)

    # Payments ordered newest-first, so the first entry per invoice is the latest.
    pays_by_inv: Dict[str, List[Dict[str, Any]]] = {}
    for p in (_admin().table('sis_payment_records').select('*')
              .in_('invoice_id', ids).order('recorded_at', desc=True).execute()).data or []:
        pays_by_inv.setdefault(p['invoice_id'], []).append(p)

    hh_ids = [i.get('household_id') for i in invoices if i.get('household_id')]
    hh_names = {}
    if hh_ids:
        hh_names = {h['id']: h['name'] for h in (
            _admin().table('households').select('id, name').in_('id', list(set(hh_ids))).execute()
        ).data or []}
    students = _users_map([i.get('student_user_id') for i in invoices])

    out = []
    for inv in invoices:
        lines = lines_by_inv.get(inv['id'], [])
        desc = '; '.join(l['description'] for l in lines if l.get('description')) or None
        latest_pay = (pays_by_inv.get(inv['id']) or [None])[0]
        s = students.get(inv.get('student_user_id'))
        total = inv.get('total_cents') or 0
        paid = inv.get('amount_paid_cents') or 0
        out.append({
            'invoice_id': inv['id'],
            'household_id': inv.get('household_id'),
            'family_name': hh_names.get(inv.get('household_id')),
            'student_name': _display_name(s) if s else None,
            'description': desc,
            'total_cents': total,
            'amount_paid_cents': paid,
            'balance_cents': total - paid,
            'status': inv.get('status'),
            'due_date': inv.get('due_date'),
            'method': (latest_pay or {}).get('method'),
            'paid_at': (latest_pay or {}).get('recorded_at'),
        })
    # Outstanding (balance > 0) first, then by soonest due date.
    out.sort(key=lambda r: (r['balance_cents'] <= 0, str(r.get('due_date') or '9999-12-31')))
    return out


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


# ── Guardian-facing billing (household balance + receipts) ───────────────────
def _guardian_household_rows(user_id: str) -> List[Dict[str, Any]]:
    """Households the user guards: a guardian/other household_member OR the
    household's primary contact. Returns full household rows (deduped)."""
    memberships = (
        _admin().table('household_members').select('household_id, relationship')
        .eq('user_id', user_id).execute()
    ).data or []
    hh_ids = {m['household_id'] for m in memberships
              if m.get('relationship') in ('guardian', 'other') and m.get('household_id')}
    rows: Dict[str, Dict[str, Any]] = {}
    if hh_ids:
        for h in (_admin().table('households')
                  .select('id, name, organization_id, primary_contact_user_id')
                  .in_('id', list(hh_ids)).execute()).data or []:
            rows[h['id']] = h
    for h in (_admin().table('households')
              .select('id, name, organization_id, primary_contact_user_id')
              .eq('primary_contact_user_id', user_id).execute()).data or []:
        rows[h['id']] = h
    return list(rows.values())


def _display_name(u: Dict[str, Any]) -> str:
    name = (u.get('display_name') or
            f"{u.get('first_name') or ''} {u.get('last_name') or ''}").strip()
    return name or (u.get('username') or u.get('email') or 'Unnamed')


def _users_map(user_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    ids = [i for i in set(user_ids) if i]
    if not ids:
        return {}
    return {u['id']: u for u in (
        _admin().table('users')
        .select('id, display_name, first_name, last_name, username, email')
        .in_('id', ids).execute()
    ).data or []}


def _org_branding(org_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    ids = [i for i in set(org_ids) if i]
    if not ids:
        return {}
    out = {}
    for o in (_admin().table('organizations').select('id, name, branding_config')
              .in_('id', ids).execute()).data or []:
        out[o['id']] = {'id': o['id'], 'name': o['name'],
                        'logo_url': (o.get('branding_config') or {}).get('logo_url')}
    return out


def _hydrate_invoices(invoices: List[Dict[str, Any]]) -> None:
    """Attach line_items, installments (flattened across plans), and payments
    to each invoice, in batch."""
    ids = [i['id'] for i in invoices]
    if not ids:
        return
    lines_by_inv: Dict[str, List] = {}
    for li in (_admin().table('sis_invoice_line_items').select('*')
               .in_('invoice_id', ids).execute()).data or []:
        lines_by_inv.setdefault(li['invoice_id'], []).append(li)
    plans = (_admin().table('sis_payment_plans').select('id, invoice_id, cadence, installment_count')
             .in_('invoice_id', ids).execute()).data or []
    plan_invoice = {p['id']: p['invoice_id'] for p in plans}
    inst_by_inv: Dict[str, List] = {}
    if plans:
        for inst in (_admin().table('sis_installments').select('*')
                     .in_('payment_plan_id', list(plan_invoice.keys()))
                     .order('due_date').execute()).data or []:
            inv_id = plan_invoice.get(inst['payment_plan_id'])
            if inv_id:
                inst_by_inv.setdefault(inv_id, []).append(inst)
    pays_by_inv: Dict[str, List] = {}
    for p in (_admin().table('sis_payment_records').select('*')
              .in_('invoice_id', ids).order('recorded_at', desc=True).execute()).data or []:
        pays_by_inv.setdefault(p['invoice_id'], []).append(p)
    for inv in invoices:
        inv['line_items'] = lines_by_inv.get(inv['id'], [])
        inv['installments'] = inst_by_inv.get(inv['id'], [])
        inv['payments'] = pays_by_inv.get(inv['id'], [])


def parent_billing_overview(user_id: str) -> Dict[str, Any]:
    """Everything a guardian needs on /family/billing: per guarded household,
    the org, its invoices (line items + installments), payments, and totals.
    Draft invoices are staff-side only and never shown to families."""
    households = _guardian_household_rows(user_id)
    if not households:
        return {'households': []}
    orgs = _org_branding([h.get('organization_id') for h in households])
    out = []
    for hh in households:
        invoices = [i for i in list_invoices(hh.get('organization_id') or '', household_id=hh['id'])
                    if i.get('status') != 'draft'] if hh.get('organization_id') else []
        _hydrate_invoices(invoices)
        students = _users_map([i.get('student_user_id') for i in invoices])
        for i in invoices:
            s = students.get(i.get('student_user_id'))
            i['student_name'] = _display_name(s) if s else None
        billable = [i for i in invoices if i.get('status') != 'void']
        invoiced = sum(i.get('total_cents') or 0 for i in billable)
        paid = sum(i.get('amount_paid_cents') or 0 for i in billable)
        payments = [p for i in invoices for p in i.get('payments', [])]
        payments.sort(key=lambda p: p.get('recorded_at') or '', reverse=True)
        out.append({
            'household_id': hh['id'],
            'household_name': hh.get('name'),
            'organization': orgs.get(hh.get('organization_id')) or {'id': hh.get('organization_id')},
            'invoices': invoices,
            'payments': payments,
            'totals': {'invoiced_cents': invoiced, 'paid_cents': paid,
                       'balance_cents': invoiced - paid},
        })
    return {'households': out}


def payment_receipt(user_id: str, payment_id: str) -> Dict[str, Any]:
    """Printable receipt payload for one recorded payment. Guardian-only: the
    caller must guard the household the payment's invoice belongs to."""
    pays = (_admin().table('sis_payment_records').select('*')
            .eq('id', payment_id).limit(1).execute()).data
    if not pays:
        return {'error': 'Receipt not found'}
    pay = pays[0]
    invs = (_admin().table('sis_invoices').select('*')
            .eq('id', pay['invoice_id']).limit(1).execute()).data
    if not invs:
        return {'error': 'Receipt not found'}
    inv = invs[0]
    household = next((h for h in _guardian_household_rows(user_id)
                      if inv.get('household_id') and h['id'] == inv['household_id']), None)
    if not household:
        return {'error': 'Not authorized for this receipt'}
    org = _org_branding([inv['organization_id']]).get(inv['organization_id']) or {}
    _hydrate_invoices([inv])
    # Students covered: the invoice's student, else the household's students.
    student_ids = [inv.get('student_user_id')] if inv.get('student_user_id') else [
        m['user_id'] for m in (
            _admin().table('household_members').select('user_id, relationship')
            .eq('household_id', household['id']).eq('relationship', 'student').execute()
        ).data or []]
    students = [_display_name(u) for u in _users_map(student_ids).values()]
    guardian = _users_map([user_id]).get(user_id) or {}
    installment = None
    if pay.get('installment_id'):
        rows = (_admin().table('sis_installments').select('*')
                .eq('id', pay['installment_id']).limit(1).execute()).data
        installment = rows[0] if rows else None
    return {'receipt': {
        'organization': org,
        'payment': {
            'id': pay['id'],
            'amount_cents': pay['amount_cents'],
            'method': pay.get('method'),
            'external_ref': pay.get('external_ref'),
            'recorded_at': pay.get('recorded_at'),
            'note': pay.get('note'),
        },
        'installment': installment,
        'payer': {'household_name': household.get('name'),
                  'guardian_name': _display_name(guardian)},
        'students': students,
        'invoice': {
            'id': inv['id'],
            'status': inv.get('status'),
            'issued_at': inv.get('issued_at'),
            'due_date': inv.get('due_date'),
            'subtotal_cents': inv.get('subtotal_cents'),
            'discount_cents': inv.get('discount_cents'),
            'total_cents': inv.get('total_cents'),
            'amount_paid_cents': inv.get('amount_paid_cents'),
            'line_items': inv.get('line_items', []),
        },
    }}


# ── Outstanding-balance report (staff) ───────────────────────────────────────
def _days_overdue(inv: Dict[str, Any], unpaid_installments: List[Dict[str, Any]],
                  today: date) -> int:
    """Days past the earliest missed due date (invoice due date or an unpaid
    installment), 0 when nothing is past due."""
    past: List[date] = []
    for d in [inv.get('due_date')] + [i.get('due_date') for i in unpaid_installments]:
        if not d:
            continue
        try:
            dd = date.fromisoformat(str(d)[:10])
        except ValueError:
            continue
        if dd < today:
            past.append(dd)
    return (today - min(past)).days if past else 0


def outstanding_invoices(org_id: str) -> List[Dict[str, Any]]:
    """Open invoices with a balance due, hydrated for the staff report:
    family + student names, amount due, days overdue, unpaid installments."""
    invoices = [i for i in (
        _admin().table('sis_invoices').select('*')
        .eq('organization_id', org_id).in_('status', list(OPEN_INVOICE_STATUSES))
        .execute()
    ).data or [] if (i.get('total_cents') or 0) > (i.get('amount_paid_cents') or 0)]
    if not invoices:
        return []
    _hydrate_invoices(invoices)
    hh_ids = [i.get('household_id') for i in invoices if i.get('household_id')]
    hh_names = {}
    if hh_ids:
        hh_names = {h['id']: h['name'] for h in (
            _admin().table('households').select('id, name').in_('id', list(set(hh_ids))).execute()
        ).data or []}
    students = _users_map([i.get('student_user_id') for i in invoices])
    today = date.today()
    out = []
    for inv in invoices:
        unpaid = [i for i in inv.get('installments', [])
                  if i.get('status') in UNPAID_INSTALLMENT_STATUSES]
        s = students.get(inv.get('student_user_id'))
        out.append({
            'invoice_id': inv['id'],
            'household_id': inv.get('household_id'),
            'family_name': hh_names.get(inv.get('household_id')),
            'student_name': _display_name(s) if s else None,
            'status': inv.get('status'),
            'due_date': inv.get('due_date'),
            'total_cents': inv.get('total_cents') or 0,
            'amount_paid_cents': inv.get('amount_paid_cents') or 0,
            'amount_due_cents': (inv.get('total_cents') or 0) - (inv.get('amount_paid_cents') or 0),
            'days_overdue': _days_overdue(inv, unpaid, today),
            'unpaid_installments': unpaid,
        })
    out.sort(key=lambda r: (-r['days_overdue'], r.get('due_date') or '9999-12-31'))
    return out


# ── Automated payment reminders ──────────────────────────────────────────────
def _guardian_emails_for_household(household_id: str,
                                   primary_contact_user_id: Optional[str]) -> List[Dict[str, Any]]:
    """[{user_id, email, name}] for the household's guardians (members with a
    guardian/other relationship plus the primary contact), deduped by email."""
    ids = {m['user_id'] for m in (
        _admin().table('household_members').select('user_id, relationship')
        .eq('household_id', household_id).execute()
    ).data or [] if m.get('relationship') in ('guardian', 'other')}
    if primary_contact_user_id:
        ids.add(primary_contact_user_id)
    users = _users_map(list(ids))
    seen, out = set(), []
    for u in users.values():
        email = (u.get('email') or '').strip().lower()
        if not email or email in seen:
            continue
        seen.add(email)
        out.append({'user_id': u['id'], 'email': u['email'], 'name': _display_name(u)})
    return out


def _money(cents: int) -> str:
    return f"${cents / 100:,.2f}"


def _reminder_bodies(org_name: str, amount_due_cents: int,
                     due_date: Optional[str]) -> Dict[str, str]:
    link = f"{Config.FRONTEND_URL.rstrip('/')}/family/billing"
    due_line = f" It was due on {due_date}." if due_date else ''
    text = (
        f"Hello,\n\n"
        f"This is a friendly reminder from {org_name} that your family has a tuition "
        f"balance of {_money(amount_due_cents)}.{due_line}\n\n"
        f"You can pay by Zelle or through your scholarship program; the school "
        f"records the payment in Optio.\n\n"
        f"View your balance, invoices, and printable receipts here: {link}\n\n"
        f"Thank you,\n{org_name}"
    )
    html = (
        f"<p>Hello,</p>"
        f"<p>This is a friendly reminder from {org_name} that your family has a tuition "
        f"balance of <strong>{_money(amount_due_cents)}</strong>.{due_line}</p>"
        f"<p>You can pay by Zelle or through your scholarship program; the school "
        f"records the payment in Optio.</p>"
        f"<p><a href=\"{link}\">View your balance, invoices, and printable receipts</a></p>"
        f"<p>Thank you,<br/>{org_name}</p>"
    )
    return {'text': text, 'html': html}


def run_payment_reminders(org_id: Optional[str] = None) -> Dict[str, Any]:
    """Email guardians about invoices with a balance due that are past due
    (invoice due date passed, or an installment's due date passed). Deduped per
    invoice via sis_payment_reminders (one reminder per REMINDER_COOLDOWN_DAYS).
    Returns {checked, reminded, skipped}: invoices with a balance examined,
    reminder emails sent, and invoices skipped for a recent reminder."""
    query = (_admin().table('sis_invoices').select('*')
             .in_('status', list(OPEN_INVOICE_STATUSES)))
    if org_id:
        query = query.eq('organization_id', org_id)
    invoices = [i for i in (query.execute().data or [])
                if (i.get('total_cents') or 0) > (i.get('amount_paid_cents') or 0)]
    checked = len(invoices)
    reminded = skipped = 0
    if not invoices:
        return {'checked': 0, 'reminded': 0, 'skipped': 0}
    _hydrate_invoices(invoices)
    orgs = _org_branding([i['organization_id'] for i in invoices])
    hh_ids = list({i['household_id'] for i in invoices if i.get('household_id')})
    households = {h['id']: h for h in (
        _admin().table('households').select('id, name, primary_contact_user_id')
        .in_('id', hh_ids).execute()
    ).data or []} if hh_ids else {}
    today = date.today()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=REMINDER_COOLDOWN_DAYS)).isoformat()

    from services.email_service import EmailService
    svc = EmailService()

    for inv in invoices:
        unpaid = [i for i in inv.get('installments', [])
                  if i.get('status') in UNPAID_INSTALLMENT_STATUSES]
        overdue_installment = None
        for i in unpaid:  # already ordered by due_date
            try:
                if date.fromisoformat(str(i.get('due_date'))[:10]) < today:
                    overdue_installment = i
                    break
            except (ValueError, TypeError):
                continue
        invoice_past_due = False
        try:
            invoice_past_due = bool(inv.get('due_date')) and \
                date.fromisoformat(str(inv['due_date'])[:10]) < today
        except ValueError:
            pass
        if not (overdue_installment or invoice_past_due):
            continue
        household = households.get(inv.get('household_id'))
        if not household:
            continue
        recent = (_admin().table('sis_payment_reminders').select('id')
                  .eq('invoice_id', inv['id']).gte('sent_at', cutoff)
                  .limit(1).execute()).data
        if recent:
            skipped += 1
            continue
        guardians = _guardian_emails_for_household(
            household['id'], household.get('primary_contact_user_id'))
        if not guardians:
            continue
        org = orgs.get(inv['organization_id']) or {}
        org_name = org.get('name') or 'Your school'
        amount_due = (inv.get('total_cents') or 0) - (inv.get('amount_paid_cents') or 0)
        due_date = (overdue_installment or {}).get('due_date') or inv.get('due_date')
        bodies = _reminder_bodies(org_name, amount_due, due_date)
        for g in guardians:
            try:
                sent = svc.send_email(
                    to_email=g['email'],
                    subject=f"{org_name}: tuition payment reminder",
                    html_body=bodies['html'],
                    text_body=bodies['text'],
                )
            except Exception as e:  # noqa: BLE001 — one bad address must not stop the sweep
                logger.warning(f"[SIS billing] reminder send failed for {g['email']}: {e}")
                sent = False
            if not sent:
                continue
            try:
                _admin().table('sis_payment_reminders').insert({
                    'organization_id': inv['organization_id'],
                    'invoice_id': inv['id'],
                    'installment_id': (overdue_installment or {}).get('id'),
                    'sent_to': g['email'],
                }).execute()
            except Exception as e:  # noqa: BLE001
                logger.error(f"[SIS billing] reminder log failed for invoice {inv['id']}: {e}")
            reminded += 1
    return {'checked': checked, 'reminded': reminded, 'skipped': skipped}
