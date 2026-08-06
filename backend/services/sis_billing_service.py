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

# Household funding sources that pay THROUGH UFA rather than by card in Optio.
UFA_FUNDING_SOURCES = ('ufa', 'ufa_private')


def _admin():
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc).isoformat()


# ── Processing fees ──────────────────────────────────────────────────────────
# Default is Stripe's standard US card rate. Orgs can override in
# branding_config.processing_fee = {"percent": 2.9, "flat_cents": 30}. Applied to
# any payment method that costs the school a fee (card / e-check / ACH-with-fee).
_DEFAULT_PROCESSING_FEE = {'percent': 2.9, 'flat_cents': 30}


def _processing_fee_config(org_id: str) -> Dict[str, Any]:
    try:
        row = (_admin().table('organizations').select('branding_config')
               .eq('id', org_id).limit(1).execute()).data
        cfg = ((row[0].get('branding_config') if row else None) or {}).get('processing_fee')
        if isinstance(cfg, dict):
            return {'percent': float(cfg.get('percent', _DEFAULT_PROCESSING_FEE['percent'])),
                    'flat_cents': int(cfg.get('flat_cents', _DEFAULT_PROCESSING_FEE['flat_cents']))}
    except Exception:  # noqa: BLE001
        pass
    return dict(_DEFAULT_PROCESSING_FEE)


def compute_processing_fee(org_id: str, base_cents: int) -> int:
    """The processing fee on a base amount, per the org's configured rate.
    Rounded to whole cents; never negative."""
    if not base_cents or base_cents <= 0:
        return 0
    cfg = _processing_fee_config(org_id)
    fee = round(base_cents * (cfg['percent'] / 100.0)) + cfg['flat_cents']
    return max(0, int(fee))


# ── Invoice numbers ──────────────────────────────────────────────────────────
def _make_invoice_number(invoice_id: str, created_at: Optional[str] = None) -> str:
    """Human-friendly, collision-free number derived from the invoice id, e.g.
    INV-2026-A1B2C3."""
    year = str(created_at or _now())[:4]
    return f"INV-{year}-{invoice_id.replace('-', '')[:6].upper()}"


def _assign_invoice_number(invoice: Dict[str, Any]) -> Dict[str, Any]:
    """Stamp an invoice_number on a freshly-created invoice (derived from its id)."""
    number = _make_invoice_number(invoice['id'], invoice.get('created_at'))
    updated = (_admin().table('sis_invoices')
               .update({'invoice_number': number}).eq('id', invoice['id']).execute()).data
    return updated[0] if updated else {**invoice, 'invoice_number': number}


# ── Audit log ────────────────────────────────────────────────────────────────
def _audit(org_id: str, invoice_id: Optional[str], actor_user_id: Optional[str],
           action: str, detail: Optional[Dict[str, Any]] = None) -> None:
    """Record a billing action (mark-paid, fee override, edit). Best-effort — an
    audit failure must never break the underlying billing operation."""
    try:
        _admin().table('sis_billing_audit').insert({
            'organization_id': org_id,
            'invoice_id': invoice_id,
            'actor_user_id': actor_user_id,
            'action': action,
            'detail': detail or {},
        }).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'[SIS billing] audit log skipped ({action}): {e}')


def invoice_audit(org_id: str, invoice_id: str) -> List[Dict[str, Any]]:
    """The audit trail for one invoice, newest first (staff view)."""
    rows = (_admin().table('sis_billing_audit').select('*')
            .eq('organization_id', org_id).eq('invoice_id', invoice_id)
            .order('created_at', desc=True).execute()).data or []
    actors = _users_map([r.get('actor_user_id') for r in rows])
    for r in rows:
        a = actors.get(r.get('actor_user_id'))
        r['actor_name'] = _display_name(a) if a else None
    return rows


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
    invoice = _assign_invoice_number(invoice)

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
    invoice = _assign_invoice_number(invoice)
    _admin().table('sis_invoice_line_items').insert({
        'invoice_id': invoice['id'],
        'description': description,
        'amount_cents': amount_cents,
        'quantity': 1,
    }).execute()
    return {'invoice': invoice}


# ── Tuition invoice (multi-line, from the CLP tuition-approver) ──────────────
def create_tuition_invoice(org_id: str, student_user_id: Optional[str],
                           household_id: Optional[str], line_items: List[Dict[str, Any]],
                           discount_cents: int = 0, note: Optional[str] = None,
                           due_date: Optional[str] = None,
                           status: str = 'sent',
                           actor_user_id: Optional[str] = None) -> Dict[str, Any]:
    """Create a tuition invoice for one student from explicit, approver-verified
    line items (the tuition-approver flow, where the schedule was finalized in a
    CLP meeting rather than through the registration funnel).

    line_items: [{description, amount_cents, class_id?}]. subtotal = sum(amounts);
    total = subtotal - discount (clamped to >= 0). Status defaults to 'sent'
    ('draft' keeps it staff-only / off the family portal). Returns {'invoice': ...}
    or {'error': ...}."""
    clean: List[Dict[str, Any]] = []
    for li in line_items or []:
        desc = (li.get('description') or '').strip()
        amt = li.get('amount_cents')
        if not desc:
            return {'error': 'Each line item needs a description'}
        if not isinstance(amt, int) or amt < 0:
            return {'error': 'Each line item needs a whole, non-negative amount'}
        clean.append({'description': desc, 'amount_cents': amt, 'class_id': li.get('class_id')})
    if not clean:
        return {'error': 'Add at least one line item to invoice'}
    if status not in ('sent', 'draft'):
        return {'error': 'Invalid invoice status'}
    subtotal = sum(li['amount_cents'] for li in clean)
    discount = max(0, min(int(discount_cents or 0), subtotal))
    total = subtotal - discount
    invoice = (
        _admin().table('sis_invoices').insert({
            'organization_id': org_id,
            'household_id': household_id,
            'student_user_id': student_user_id,
            'status': status,
            'subtotal_cents': subtotal,
            'discount_cents': discount,
            'total_cents': total,
            'amount_paid_cents': 0,
            'issued_at': _now() if status != 'draft' else None,
            'due_date': due_date or None,
        }).execute()
    ).data[0]
    invoice = _assign_invoice_number(invoice)
    _admin().table('sis_invoice_line_items').insert([{
        'invoice_id': invoice['id'],
        'description': li['description'],
        'class_id': li.get('class_id'),
        'amount_cents': li['amount_cents'],
        'quantity': 1,
    } for li in clean]).execute()
    _audit(org_id, invoice['id'], actor_user_id, 'tuition_invoice_created',
           {'subtotal_cents': subtotal, 'discount_cents': discount,
            'total_cents': total, 'line_count': len(clean),
            'note': (note or '').strip() or None})
    enqueue_qbo(org_id, 'invoice', invoice['id'])
    return {'invoice': invoice}


def _household_primary_contact(household_id: Optional[str]) -> Optional[str]:
    if not household_id:
        return None
    row = (_admin().table('households').select('primary_contact_user_id')
           .eq('id', household_id).limit(1).execute()).data
    return (row[0].get('primary_contact_user_id') if row else None)


def email_invoice_to_family(org_id: str, invoice_id: str) -> Dict[str, Any]:
    """Email the household's guardians that a tuition invoice is ready, linking to
    the family billing portal. Best-effort; returns {'emailed': n}."""
    inv = get_invoice(org_id, invoice_id)
    if not inv:
        return {'error': 'Invoice not found'}
    hh_id = inv.get('household_id')
    guardians = (_guardian_emails_for_household(hh_id, _household_primary_contact(hh_id))
                 if hh_id else [])
    if not guardians:
        return {'emailed': 0}
    org = _org_branding([org_id]).get(org_id) or {}
    org_name = org.get('name') or 'Your school'
    student = _users_map([inv.get('student_user_id')]).get(inv.get('student_user_id'))
    student_name = _display_name(student) if student else 'your student'
    total = inv.get('total_cents') or 0
    number = inv.get('invoice_number') or ''
    link = f"{Config.FRONTEND_URL.rstrip('/')}/family/billing"
    subject = f"{org_name}: tuition invoice for {student_name}"
    text = (
        f"Hello,\n\n"
        f"{org_name} has issued a tuition invoice ({number}) for {student_name} "
        f"totaling {_money(total)}.\n\n"
        f"View the invoice and pay online — in full or on a payment plan — here: {link}\n\n"
        f"Thank you,\n{org_name}"
    )
    html = (
        f"<p>Hello,</p>"
        f"<p>{org_name} has issued a tuition invoice (<strong>{number}</strong>) for "
        f"<strong>{student_name}</strong> totaling <strong>{_money(total)}</strong>.</p>"
        f"<p><a href=\"{link}\">View the invoice and pay online</a> — in full or on a "
        f"payment plan.</p>"
        f"<p>Thank you,<br/>{org_name}</p>"
    )
    from services.email_service import EmailService
    svc = EmailService()
    emailed = 0
    for g in guardians:
        try:
            if svc.send_email(to_email=g['email'], subject=subject,
                              html_body=html, text_body=text):
                emailed += 1
        except Exception as e:  # noqa: BLE001 — one bad address must not break the send
            logger.warning(f"[SIS billing] invoice email failed for {g['email']}: {e}")
    return {'emailed': emailed}


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
    amount_due = (inv['total_cents'] or 0) + (inv.get('processing_fee_cents') or 0)
    if paid >= amount_due and amount_due > 0:
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
    _audit(org_id, invoice_id, recorded_by, 'payment_recorded', {
        'amount_cents': amount_cents, 'method': method,
        'external_ref': external_ref, 'note': note})
    auto = _maybe_autocomplete_registration(org_id, invoice, recorded_by)
    return {'payment': record, 'invoice': invoice, 'auto_enrolled': auto}


def set_processing_fee(org_id: str, invoice_id: str, processing_fee_cents: int,
                       actor_user_id: str) -> Dict[str, Any]:
    """Admin override of an invoice's processing fee (e.g. waive it, or set it to
    the card rate). Recomputes status and audits the change."""
    inv = (_admin().table('sis_invoices').select('id, processing_fee_cents')
           .eq('id', invoice_id).eq('organization_id', org_id).limit(1).execute()).data
    if not inv:
        return {'error': 'Invoice not found'}
    fee = max(0, int(processing_fee_cents or 0))
    _admin().table('sis_invoices').update(
        {'processing_fee_cents': fee, 'updated_at': _now()}).eq('id', invoice_id).execute()
    invoice = _recompute_invoice_status(invoice_id)
    _audit(org_id, invoice_id, actor_user_id, 'processing_fee_set',
           {'from_cents': inv[0].get('processing_fee_cents') or 0, 'to_cents': fee})
    return {'invoice': invoice}


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
    """Org identity for branded invoices/receipts: name, logo, and the optional
    billing block (address / accent color / contact) admins set in
    branding_config. Falls back gracefully when a field isn't configured."""
    ids = [i for i in set(org_ids) if i]
    if not ids:
        return {}
    out = {}
    for o in (_admin().table('organizations').select('id, name, branding_config')
              .in_('id', ids).execute()).data or []:
        cfg = o.get('branding_config') or {}
        out[o['id']] = {
            'id': o['id'], 'name': o['name'],
            'logo_url': cfg.get('logo_url'),
            'billing_address': cfg.get('billing_address'),
            'accent_color': cfg.get('accent_color') or '#0d9488',  # teal default
            'billing_email': cfg.get('billing_email'),
            'billing_phone': cfg.get('billing_phone'),
        }
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
    # Flag which orgs accept online card payment (their own Stripe account).
    for oid, o in orgs.items():
        o['online_pay_enabled'] = bool(_org_stripe_secret(oid))
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
        # Funding source gates the parent page: UFA / UFA-private families pay
        # through UFA, not by card, so the portal shows a "pay through UFA"
        # message instead of the card / payment-plan buttons.
        funding = _household_funding_source(hh['id'])
        out.append({
            'household_id': hh['id'],
            'household_name': hh.get('name'),
            'organization': orgs.get(hh.get('organization_id')) or {'id': hh.get('organization_id')},
            'funding_source': funding,
            'funding_label': _FUNDING_LABELS.get(funding) if funding else None,
            'pay_through_ufa': funding in UFA_FUNDING_SOURCES,
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
    # Confirmation number: the gateway reference for online payments, else a
    # short code from the payment id so every receipt has one.
    confirmation = pay.get('external_ref') or ('PMT-' + pay['id'].replace('-', '')[:8].upper())
    funding = _household_funding_source(household['id'])
    return {'receipt': {
        'organization': org,
        'confirmation_number': confirmation,
        'funding_source': funding,
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
            'invoice_number': inv.get('invoice_number'),
            'status': inv.get('status'),
            'issued_at': inv.get('issued_at'),
            'due_date': inv.get('due_date'),
            'subtotal_cents': inv.get('subtotal_cents'),
            'discount_cents': inv.get('discount_cents'),
            'processing_fee_cents': inv.get('processing_fee_cents') or 0,
            'total_cents': inv.get('total_cents'),
            'amount_paid_cents': inv.get('amount_paid_cents'),
            'line_items': inv.get('line_items', []),
        },
    }}


def _household_funding_source(household_id: Optional[str]) -> Optional[str]:
    if not household_id:
        return None
    try:
        row = (_admin().table('households').select('funding_source')
               .eq('id', household_id).limit(1).execute()).data
        return (row[0].get('funding_source') if row else None)
    except Exception:  # noqa: BLE001
        return None


# ── Branded invoice document (staff preview + guardian view) ─────────────────
_FUNDING_LABELS = {'ufa': 'UFA', 'ufa_private': 'UFA – Private School',
                   'private_pay': 'Private Pay', 'other': 'Other'}


def invoice_document(org_id: str, invoice_id: str) -> Dict[str, Any]:
    """A branded, itemized invoice payload for printing/PDF: org identity block,
    invoice number, family + students, line items, discount, processing fee,
    funding source, totals, and amount due. Rendered to PDF by the frontend
    (browser print), so no server-side PDF dependency is needed."""
    inv = get_invoice(org_id, invoice_id)
    if not inv:
        return {'error': 'Invoice not found'}
    org = _org_branding([org_id]).get(org_id) or {}
    household = None
    if inv.get('household_id'):
        rows = (_admin().table('households').select('id, name, funding_source, address_line1, address_line2, city, state, postal_code')
                .eq('id', inv['household_id']).limit(1).execute()).data
        household = rows[0] if rows else None
    student = None
    if inv.get('student_user_id'):
        student = _users_map([inv['student_user_id']]).get(inv['student_user_id'])
    funding = (household or {}).get('funding_source')
    total = inv.get('total_cents') or 0
    fee = inv.get('processing_fee_cents') or 0
    paid = inv.get('amount_paid_cents') or 0
    return {'document': {
        'organization': org,
        'invoice_number': inv.get('invoice_number'),
        'status': inv.get('status'),
        'issued_at': inv.get('issued_at'),
        'due_date': inv.get('due_date'),
        'family': {
            'name': (household or {}).get('name'),
            'address': household,
        },
        'student_name': _display_name(student) if student else None,
        'funding_source': funding,
        'funding_label': _FUNDING_LABELS.get(funding) if funding else None,
        'line_items': inv.get('line_items', []),
        'subtotal_cents': inv.get('subtotal_cents') or 0,
        'discount_cents': inv.get('discount_cents') or 0,
        'processing_fee_cents': fee,
        'total_cents': total,
        'amount_due_cents': total + fee - paid,
        'amount_paid_cents': paid,
        'payments': inv.get('payments', []),
    }}


# ── Online payment (Stripe Checkout on the school's own account) ─────────────
# Mirrors the registration-fee flow: a Checkout Session is created on the org's
# own Stripe account (organization_secrets.stripe_secret_key) and verified by
# POLLING (no webhook infra), so a paid session is never missed.
#
# The key moved out of organizations.feature_flags on 2026-08-01: that column is
# anon-readable by row policy and is echoed to clients, so it leaked the key to
# the public internet (AUDIT.md C1).
def _org_stripe_secret(org_id: str) -> Optional[str]:
    from utils.org_secrets import get_org_secret, STRIPE_SECRET_KEY
    return get_org_secret(org_id, STRIPE_SECRET_KEY)


def _guardian_invoice(user_id: str, invoice_id: str) -> Optional[Dict[str, Any]]:
    """Load an invoice only if `user_id` guards its household."""
    inv = (_admin().table('sis_invoices').select('*').eq('id', invoice_id).limit(1).execute()).data
    if not inv:
        return None
    inv = inv[0]
    hh_ids = {h['id'] for h in _guardian_household_rows(user_id)}
    if inv.get('household_id') not in hh_ids:
        return None
    return inv


def create_invoice_checkout(user_id: str, invoice_id: str, return_url: str) -> Dict[str, Any]:
    """Guardian pays an invoice online. Charges the remaining tuition balance plus
    a card processing fee on the school's Stripe account. Returns a hosted URL."""
    inv = _guardian_invoice(user_id, invoice_id)
    if not inv:
        return {'error': 'Invoice not found'}
    if inv.get('status') in ('paid', 'void', 'draft'):
        return {'error': 'This invoice is not payable'}
    org_id = inv['organization_id']
    secret = _org_stripe_secret(org_id)
    if not secret:
        return {'error': 'Online card payment is not set up for this school'}
    if not (return_url or '').startswith('http'):
        return {'error': 'Invalid return URL'}
    balance = (inv.get('total_cents') or 0) - (inv.get('amount_paid_cents') or 0)
    if balance <= 0:
        return {'error': 'This invoice has no balance due'}
    fee = compute_processing_fee(org_id, balance)
    org = _org_branding([org_id]).get(org_id) or {}
    org_name = org.get('name') or 'School'
    guardian = _users_map([user_id]).get(user_id) or {}
    try:
        import stripe
        sep = '&' if '?' in return_url else '?'
        line_items = [{
            'price_data': {'currency': 'usd',
                           'product_data': {'name': f"{org_name} tuition · {inv.get('invoice_number') or ''}".strip()},
                           'unit_amount': balance},
            'quantity': 1,
        }]
        if fee > 0:
            line_items.append({
                'price_data': {'currency': 'usd',
                               'product_data': {'name': 'Card processing fee'},
                               'unit_amount': fee},
                'quantity': 1,
            })
        session = stripe.checkout.Session.create(
            api_key=secret, mode='payment', line_items=line_items,
            customer_email=guardian.get('email') or None,
            metadata={'invoice_id': invoice_id, 'base_cents': balance, 'fee_cents': fee},
            success_url=f'{return_url}{sep}payment=return',
            cancel_url=f'{return_url}{sep}payment=canceled',
        )
    except Exception as e:  # noqa: BLE001
        logger.error(f'[SIS billing] invoice checkout failed for {invoice_id}: {e}')
        return {'error': 'Could not start the payment. Please try again or contact the school.'}
    history = list(inv.get('stripe_session_ids') or [])
    history.append(session.id)
    _admin().table('sis_invoices').update(
        {'stripe_session_ids': history[-10:], 'updated_at': _now()}).eq('id', invoice_id).execute()
    return {'checkout_url': session.url}


def confirm_invoice_payment(user_id: str, invoice_id: str) -> Dict[str, Any]:
    """After the family returns from Stripe, find a PAID session for this invoice
    and record the payment once (idempotent). Sets the processing fee so the
    branded receipt reflects it, and generates a receipt."""
    inv = _guardian_invoice(user_id, invoice_id)
    if not inv:
        return {'error': 'Invoice not found'}
    org_id = inv['organization_id']
    secret = _org_stripe_secret(org_id)
    if not secret:
        return {'error': 'Online card payment is not set up for this school'}
    session_ids = list(inv.get('stripe_session_ids') or [])
    if not session_ids:
        return {'paid': False}
    try:
        import stripe
    except Exception:  # noqa: BLE001
        return {'error': 'Payment library unavailable'}
    for sid in reversed(session_ids):  # newest first
        try:
            sess = stripe.checkout.Session.retrieve(sid, api_key=secret)
        except Exception:  # noqa: BLE001
            continue
        if (sess.get('payment_status') != 'paid'):
            continue
        pi = sess.get('payment_intent')
        # Idempotency: skip if we've already recorded a payment for this session.
        already = (_admin().table('sis_payment_records').select('id')
                   .eq('invoice_id', invoice_id).eq('external_ref', pi or sid).limit(1).execute()).data
        if already:
            return {'paid': True, 'already_recorded': True}
        base = int((sess.get('metadata') or {}).get('base_cents') or 0)
        fee = int((sess.get('metadata') or {}).get('fee_cents') or 0)
        amount_total = int(sess.get('amount_total') or (base + fee))
        if fee > 0:
            _admin().table('sis_invoices').update(
                {'processing_fee_cents': fee, 'updated_at': _now()}).eq('id', invoice_id).execute()
        result = record_payment(
            org_id, invoice_id, amount_cents=amount_total, method='card',
            external_ref=pi or sid, installment_id=None, recorded_by=user_id,
            note='Online card payment (Stripe)')
        _audit(org_id, invoice_id, user_id, 'online_payment', {'session_id': sid, 'amount_cents': amount_total})
        return {'paid': True, 'payment': result.get('payment'), 'invoice': result.get('invoice')}
    return {'paid': False}


# ── Pay the whole family at once (one Checkout across a household's invoices) ──
def _household_open_invoices(org_id: str, household_id: str) -> List[Dict[str, Any]]:
    """Open, non-void invoices for a household that still have a tuition balance."""
    return [i for i in list_invoices(org_id, household_id=household_id)
            if i.get('status') in OPEN_INVOICE_STATUSES
            and (i.get('total_cents') or 0) > (i.get('amount_paid_cents') or 0)]


def create_family_checkout(user_id: str, household_id: str, return_url: str) -> Dict[str, Any]:
    """One Stripe Checkout covering every open invoice in the family, on the
    school's own account (one line per kid + a single card processing fee).
    Returns a hosted URL. Verified on return by confirm_family_payment."""
    hh = next((h for h in _guardian_household_rows(user_id) if h['id'] == household_id), None)
    if not hh:
        return {'error': 'Family not found'}
    org_id = hh.get('organization_id')
    secret = _org_stripe_secret(org_id)
    if not secret:
        return {'error': 'Online card payment is not set up for this school'}
    if not (return_url or '').startswith('http'):
        return {'error': 'Invalid return URL'}
    invoices = _household_open_invoices(org_id, household_id)
    balances = {i['id']: (i.get('total_cents') or 0) - (i.get('amount_paid_cents') or 0) for i in invoices}
    base_total = sum(b for b in balances.values() if b > 0)
    if base_total <= 0:
        return {'error': 'This family has no balance due'}
    fee = compute_processing_fee(org_id, base_total)
    org = _org_branding([org_id]).get(org_id) or {}
    org_name = org.get('name') or 'School'
    guardian = _users_map([user_id]).get(user_id) or {}
    students = _users_map([i.get('student_user_id') for i in invoices])
    try:
        import stripe
        sep = '&' if '?' in return_url else '?'
        line_items = []
        for inv in invoices:
            bal = balances[inv['id']]
            if bal <= 0:
                continue
            s = students.get(inv.get('student_user_id'))
            who = _display_name(s) if s else (inv.get('invoice_number') or 'Tuition')
            line_items.append({
                'price_data': {'currency': 'usd',
                               'product_data': {'name': f"{org_name} tuition · {who}"},
                               'unit_amount': bal},
                'quantity': 1})
        if fee > 0:
            line_items.append({
                'price_data': {'currency': 'usd',
                               'product_data': {'name': 'Card processing fee'}, 'unit_amount': fee},
                'quantity': 1})
        session = stripe.checkout.Session.create(
            api_key=secret, mode='payment', line_items=line_items,
            customer_email=guardian.get('email') or None,
            metadata={'kind': 'family', 'household_id': household_id,
                      'fee_cents': fee, 'base_total_cents': base_total},
            success_url=f'{return_url}{sep}payment=return',
            cancel_url=f'{return_url}{sep}payment=canceled')
    except Exception as e:  # noqa: BLE001
        logger.error(f'[SIS billing] family checkout failed for household {household_id}: {e}')
        return {'error': 'Could not start the payment. Please try again or contact the school.'}
    # Poll target: record the session id against every invoice it covers.
    for inv in invoices:
        if balances[inv['id']] <= 0:
            continue
        history = list(inv.get('stripe_session_ids') or [])
        history.append(session.id)
        _admin().table('sis_invoices').update(
            {'stripe_session_ids': history[-10:], 'updated_at': _now()}).eq('id', inv['id']).execute()
    return {'checkout_url': session.url}


def confirm_family_payment(user_id: str, household_id: str) -> Dict[str, Any]:
    """After the family returns from a whole-family Checkout, find the paid
    session and record a payment against each covered invoice (idempotent),
    allocating the card fee proportionally so each invoice reads as paid."""
    hh = next((h for h in _guardian_household_rows(user_id) if h['id'] == household_id), None)
    if not hh:
        return {'error': 'Family not found'}
    org_id = hh.get('organization_id')
    secret = _org_stripe_secret(org_id)
    if not secret:
        return {'error': 'Online card payment is not set up for this school'}
    invoices = _household_open_invoices(org_id, household_id)
    if not invoices:
        return {'paid': False}
    session_ids: List[str] = []
    for inv in invoices:
        for sid in (inv.get('stripe_session_ids') or []):
            if sid not in session_ids:
                session_ids.append(sid)
    if not session_ids:
        return {'paid': False}
    try:
        import stripe
    except Exception:  # noqa: BLE001
        return {'error': 'Payment library unavailable'}
    for sid in reversed(session_ids):  # newest first
        try:
            sess = stripe.checkout.Session.retrieve(sid, api_key=secret)
        except Exception:  # noqa: BLE001
            continue
        md = sess.get('metadata') or {}
        if sess.get('payment_status') != 'paid' or md.get('kind') != 'family' \
                or md.get('household_id') != household_id:
            continue
        pi = sess.get('payment_intent')
        fee_total = int(md.get('fee_cents') or 0)
        base_total = int(md.get('base_total_cents') or 0)
        covered = [i for i in invoices if sid in (i.get('stripe_session_ids') or [])]
        recorded = 0
        for inv in covered:
            base = (inv.get('total_cents') or 0) - (inv.get('amount_paid_cents') or 0)
            if base <= 0:
                continue
            ext = f"{pi or sid}:{inv['id']}"
            already = (_admin().table('sis_payment_records').select('id')
                       .eq('invoice_id', inv['id']).eq('external_ref', ext).limit(1).execute()).data
            if already:
                continue
            fee_share = round(fee_total * base / base_total) if base_total else 0
            if fee_share > 0:
                _admin().table('sis_invoices').update(
                    {'processing_fee_cents': fee_share, 'updated_at': _now()}).eq('id', inv['id']).execute()
            record_payment(org_id, inv['id'], amount_cents=base + fee_share, method='card',
                           external_ref=ext, installment_id=None, recorded_by=user_id,
                           note='Online card payment — whole family (Stripe)')
            _audit(org_id, inv['id'], user_id, 'online_payment',
                   {'session_id': sid, 'amount_cents': base + fee_share, 'family': True})
            recorded += 1
        return {'paid': True, 'recorded': recorded, 'already_recorded': recorded == 0}
    return {'paid': False}


# ── Auto-charge payment plan (saved card + off-session installments) ──────────
def _saved_payment_method(plan: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    pm_id = plan.get('saved_payment_method_id')
    if not pm_id:
        return None
    rows = (_admin().table('sis_saved_payment_methods').select('*')
            .eq('id', pm_id).limit(1).execute()).data
    return rows[0] if rows else None


def _upsert_saved_pm(org_id: str, guardian_user_id: str, household_id: Optional[str],
                     customer_id: str, pm_id: str, brand: Optional[str], last4: Optional[str],
                     exp_month: Optional[int], exp_year: Optional[int]) -> Dict[str, Any]:
    """Store the Stripe Customer + PaymentMethod ids (and non-sensitive card
    display fields) for a guardian on this school's account. One card per
    guardian per org (re-saving replaces it)."""
    return (_admin().table('sis_saved_payment_methods').upsert({
        'organization_id': org_id, 'guardian_user_id': guardian_user_id,
        'household_id': household_id, 'stripe_customer_id': customer_id,
        'stripe_payment_method_id': pm_id, 'card_brand': brand, 'card_last4': last4,
        'card_exp_month': exp_month, 'card_exp_year': exp_year, 'updated_at': _now(),
    }, on_conflict='organization_id,guardian_user_id').execute()).data[0]


def create_autopay_setup_checkout(user_id: str, invoice_id: str, return_url: str,
                                  installment_count: int = 10) -> Dict[str, Any]:
    """Start a Stripe Checkout in SETUP mode to save the family's card on the
    school's account. On return, confirm_autopay_setup persists it and builds the
    payment plan. Returns a hosted URL."""
    inv = _guardian_invoice(user_id, invoice_id)
    if not inv:
        return {'error': 'Invoice not found'}
    if inv.get('status') in ('paid', 'void', 'draft'):
        return {'error': 'This invoice is not payable'}
    org_id = inv['organization_id']
    secret = _org_stripe_secret(org_id)
    if not secret:
        return {'error': 'Online card payment is not set up for this school'}
    if not (return_url or '').startswith('http'):
        return {'error': 'Invalid return URL'}
    count = max(2, min(int(installment_count or 10), 24))
    guardian = _users_map([user_id]).get(user_id) or {}
    try:
        import stripe
        sep = '&' if '?' in return_url else '?'
        customer = stripe.Customer.create(
            api_key=secret, email=guardian.get('email') or None,
            metadata={'guardian_user_id': user_id, 'organization_id': org_id})
        session = stripe.checkout.Session.create(
            api_key=secret, mode='setup', customer=customer.id,
            metadata={'kind': 'autopay_setup', 'invoice_id': invoice_id,
                      'guardian_user_id': user_id, 'installment_count': count},
            success_url=f'{return_url}{sep}autopay=return',
            cancel_url=f'{return_url}{sep}autopay=canceled')
    except Exception as e:  # noqa: BLE001
        logger.error(f'[SIS billing] autopay setup failed for invoice {invoice_id}: {e}')
        return {'error': 'Could not start card setup. Please try again or contact the school.'}
    history = list(inv.get('stripe_session_ids') or [])
    history.append(session.id)
    _admin().table('sis_invoices').update(
        {'stripe_session_ids': history[-10:], 'updated_at': _now()}).eq('id', invoice_id).execute()
    return {'checkout_url': session.url}


def confirm_autopay_setup(user_id: str, invoice_id: str, installment_count: int = 10,
                          start_date: Optional[str] = None) -> Dict[str, Any]:
    """After returning from the setup Checkout, save the card and build a
    monthly auto-charge plan for the invoice's balance, charging installment #1
    immediately. Idempotent: a second call returns the existing plan."""
    inv = _guardian_invoice(user_id, invoice_id)
    if not inv:
        return {'error': 'Invoice not found'}
    org_id = inv['organization_id']
    secret = _org_stripe_secret(org_id)
    if not secret:
        return {'error': 'Online card payment is not set up for this school'}
    try:
        import stripe
    except Exception:  # noqa: BLE001
        return {'error': 'Payment library unavailable'}
    setup_sess = None
    for sid in reversed(list(inv.get('stripe_session_ids') or [])):
        try:
            sess = stripe.checkout.Session.retrieve(sid, api_key=secret, expand=['setup_intent'])
        except Exception:  # noqa: BLE001
            continue
        if (sess.get('metadata') or {}).get('kind') == 'autopay_setup' and sess.get('status') == 'complete':
            setup_sess = sess
            break
    if not setup_sess:
        return {'ready': False}
    si = setup_sess.get('setup_intent')
    pm_id = (si.get('payment_method') if isinstance(si, dict) else None)
    customer_id = setup_sess.get('customer')
    if not pm_id or not customer_id:
        return {'ready': False}
    brand = last4 = None
    exp_month = exp_year = None
    try:
        pm = stripe.PaymentMethod.retrieve(pm_id, api_key=secret)
        card = (pm.get('card') or {}) if isinstance(pm, dict) else {}
        brand, last4 = card.get('brand'), card.get('last4')
        exp_month, exp_year = card.get('exp_month'), card.get('exp_year')
    except Exception as e:  # noqa: BLE001 — card display fields are best-effort
        logger.debug(f'[SIS billing] card detail lookup failed for {pm_id}: {e}')
    saved = _upsert_saved_pm(org_id, user_id, inv.get('household_id'), customer_id, pm_id,
                             brand, last4, exp_month, exp_year)
    # Idempotency: one auto-charge plan per invoice.
    existing = (_admin().table('sis_payment_plans').select('*')
                .eq('invoice_id', invoice_id).eq('auto_charge', True).limit(1).execute()).data
    if existing:
        return {'ready': True, 'already': True, 'plan': existing[0], 'saved_card': _card_public(saved)}
    count = int((setup_sess.get('metadata') or {}).get('installment_count') or installment_count or 10)
    result = _create_autopay_plan(org_id, inv, saved, count, start_date, secret)
    return {'ready': True, 'saved_card': _card_public(saved), **result}


def _card_public(saved: Dict[str, Any]) -> Dict[str, Any]:
    return {'brand': saved.get('card_brand'), 'last4': saved.get('card_last4'),
            'exp_month': saved.get('card_exp_month'), 'exp_year': saved.get('card_exp_year')}


def _create_autopay_plan(org_id: str, inv: Dict[str, Any], saved_pm: Dict[str, Any],
                         count: int, start_date: Optional[str], secret: str) -> Dict[str, Any]:
    balance = (inv.get('total_cents') or 0) - (inv.get('amount_paid_cents') or 0)
    if balance <= 0:
        return {'error': 'This invoice is already paid'}
    count = max(2, min(int(count or 10), 24))
    schedule = pricing.build_schedule(balance, 'monthly', count, start_date or date.today().isoformat())
    plan = (_admin().table('sis_payment_plans').insert({
        'invoice_id': inv['id'], 'cadence': 'monthly', 'installment_count': len(schedule),
        'auto_charge': True, 'saved_payment_method_id': saved_pm['id'],
    }).execute()).data[0]
    rows = [{'payment_plan_id': plan['id'], 'due_date': s['due_date'],
             'amount_cents': s['amount_cents'], 'status': 'scheduled'} for s in schedule]
    installments = (_admin().table('sis_installments').insert(rows).execute()).data or []
    plan['installments'] = installments
    _audit(org_id, inv['id'], saved_pm.get('guardian_user_id'), 'autopay_plan_created',
           {'installment_count': len(schedule), 'total_cents': balance})
    # Decision: charge installment #1 immediately at setup.
    first_charge = None
    if installments:
        first_charge = _charge_installment(org_id, plan, installments[0], saved_pm, secret,
                                           recorded_by=saved_pm.get('guardian_user_id'))
    return {'plan': plan, 'first_charge': first_charge}


def _charge_installment(org_id: str, plan: Dict[str, Any], installment: Dict[str, Any],
                        saved_pm: Dict[str, Any], secret: str,
                        recorded_by: Optional[str] = None) -> Dict[str, Any]:
    """Charge one installment off-session against the saved card. On success
    records the payment (marks the installment paid + recomputes the invoice); on
    failure marks it late, logs the error, and emails the family once (no
    auto-retry — staff follow up). Returns {'status': 'charged'|'failed', ...}."""
    invoice_id = plan.get('invoice_id')
    amount = installment.get('amount_cents') or 0
    now = _now()
    attempts = (installment.get('charge_attempts') or 0) + 1

    def _mark_failed(reason: str) -> Dict[str, Any]:
        _admin().table('sis_installments').update({
            'status': 'late', 'charge_attempts': attempts, 'last_attempt_at': now,
            'last_error': reason[:400], 'updated_at': now,
        }).eq('id', installment['id']).execute()
        _notify_autopay_failure(org_id, invoice_id, installment, saved_pm)
        return {'status': 'failed', 'error': reason[:400]}

    try:
        import stripe
        intent = stripe.PaymentIntent.create(
            api_key=secret, amount=amount, currency='usd',
            customer=saved_pm['stripe_customer_id'],
            payment_method=saved_pm['stripe_payment_method_id'],
            off_session=True, confirm=True,
            metadata={'kind': 'autopay', 'installment_id': installment['id'], 'invoice_id': invoice_id})
    except Exception as e:  # noqa: BLE001 — card declines raise here (CardError etc.)
        logger.warning(f'[SIS billing] autopay charge failed for installment {installment["id"]}: {e}')
        return _mark_failed(str(e))
    if intent.get('status') != 'succeeded':
        return _mark_failed(f"status={intent.get('status')}")
    record_payment(org_id, invoice_id, amount_cents=amount, method='card',
                   external_ref=intent.get('id'), installment_id=installment['id'],
                   recorded_by=recorded_by, note='Auto-charge (Stripe)')
    _admin().table('sis_installments').update({
        'charge_attempts': attempts, 'last_attempt_at': now, 'last_error': None, 'updated_at': now,
    }).eq('id', installment['id']).execute()
    return {'status': 'charged', 'payment_intent': intent.get('id')}


def _notify_autopay_failure(org_id: str, invoice_id: str, installment: Dict[str, Any],
                            saved_pm: Dict[str, Any]) -> None:
    """Email the family that an auto-charge was declined (best-effort, once)."""
    try:
        guardian = _users_map([saved_pm.get('guardian_user_id')]).get(saved_pm.get('guardian_user_id'))
        email = (guardian or {}).get('email')
        if not email:
            return
        org = _org_branding([org_id]).get(org_id) or {}
        org_name = org.get('name') or 'Your school'
        link = f"{Config.FRONTEND_URL.rstrip('/')}/family/billing"
        amount = _money(installment.get('amount_cents') or 0)
        subject = f"{org_name}: a tuition payment didn't go through"
        text = (f"Hello,\n\nWe tried to charge your saved card {amount} for your tuition payment "
                f"plan, but it didn't go through. Please update your payment or contact {org_name}.\n\n"
                f"View your balance: {link}\n\nThank you,\n{org_name}")
        html = (f"<p>Hello,</p><p>We tried to charge your saved card <strong>{amount}</strong> for "
                f"your tuition payment plan, but it didn't go through. Please contact {org_name} to "
                f"sort it out.</p><p><a href=\"{link}\">View your balance</a></p><p>Thank you,<br/>{org_name}</p>")
        from services.email_service import EmailService
        EmailService().send_email(to_email=email, subject=subject, html_body=html, text_body=text)
    except Exception as e:  # noqa: BLE001 — never let a notification break the sweep
        logger.warning(f'[SIS billing] autopay failure notice skipped for invoice {invoice_id}: {e}')


def charge_due_installments(org_id: Optional[str] = None,
                            today: Optional[str] = None) -> Dict[str, Any]:
    """Cron sweep: charge every due installment on active auto-charge plans.

    Picks scheduled/due installments with due_date <= today (skips 'late' — a
    declined installment is handed to staff, not retried). Returns counts."""
    today = today or date.today().isoformat()
    plans = (_admin().table('sis_payment_plans').select('*')
             .eq('auto_charge', True).eq('status', 'active').execute()).data or []
    charged = failed = 0
    for plan in plans:
        saved = _saved_payment_method(plan)
        if not saved:
            continue
        inv_rows = (_admin().table('sis_invoices').select('*')
                    .eq('id', plan['invoice_id']).limit(1).execute()).data
        if not inv_rows:
            continue
        inv = inv_rows[0]
        if org_id and inv.get('organization_id') != org_id:
            continue
        oid = inv['organization_id']
        secret = _org_stripe_secret(oid)
        if not secret:
            continue
        due = (_admin().table('sis_installments').select('*')
               .eq('payment_plan_id', plan['id']).in_('status', ['scheduled', 'due'])
               .lte('due_date', today).order('due_date').execute()).data or []
        for inst in due:
            result = _charge_installment(oid, plan, inst, saved, secret,
                                         recorded_by=saved.get('guardian_user_id'))
            if result.get('status') == 'charged':
                charged += 1
            else:
                failed += 1
        # Complete the plan once every installment is settled.
        remaining = (_admin().table('sis_installments').select('id')
                     .eq('payment_plan_id', plan['id']).neq('status', 'paid')
                     .limit(1).execute()).data
        if not remaining:
            _admin().table('sis_payment_plans').update(
                {'status': 'completed'}).eq('id', plan['id']).execute()
    return {'charged': charged, 'failed': failed, 'plans': len(plans)}


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
            # The number is the only identifier a family recognises — it is on
            # their invoice, their receipt and their portal. Chasing a payment
            # without it has the office and the parent naming the same invoice
            # two different ways.
            'invoice_number': inv.get('invoice_number'),
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
