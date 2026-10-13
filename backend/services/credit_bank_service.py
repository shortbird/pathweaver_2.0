"""The credit bank: credits a student has paid for, and how many are left.

Optio Academy sells credits ahead of the work (Tanner, 2026-10-13). Three
things bank credits, and one thing uses them:

  banks   OpenEd's year, on enrollment: openEd.creditsIncludedPerYear, once per
          school year (bank_opened_year; the family group dashboard calls it).
  banks   Each self-pay month Stripe confirms: academy.tuitionMonthlyCents /
          academy.creditCents (0.5 today) for each student the payment covers
          (sweep, daily). Two billing paths reach Stripe and both are read:
            - the registration subscription (registrations.stripe_subscription_id),
              whose later months Optio never records, so the sweep lists the
              subscription's paid invoices on the school's Stripe account;
            - the office-set monthly tuition (sis_recurring_tuition), whose
              autopay charges are recorded as sis_payment_records.
          A schedule row at the standard tuition or the Full-Time amount banks
          the same 0.5: the Full-Time teacher is support on top of the same
          pace (Tanner, 2026-10-13). Any other amount banks nothing until
          someone decides what it buys.
  banks   Accelerated and prior learning purchases, entered by hand in 0.5
          steps (add_entry) by OpenEd's manager on the group dashboard or by
          staff; staff can also enter a correction.
  uses    From the student's start date on (the Academy enrollment date, or
          the first banked row for a student with no enrollment row):
            - a credit approved in credit review (diploma_status 'finalized');
            - prior learning credit awarded through prior learning review
              (transfer_credits with prior_learning_record_ids, not
              accredited; accredited transfer credit is free and never drew).
          One balance for all of it (Tanner, 2026-10-13). Anything before the
          start date (a Hearthwood student's history) never draws on the bank.

The balance may go negative. That shows as owed and blocks nothing (Tanner,
2026-10-13).

Every automatic row carries a `reference`, unique per student, so a sweep that
runs twice banks once. The ledger is append-only: a correction is a new row.
"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional

from generated.credits import XP_PER_CREDIT
from generated.pricing import PRICING
from repositories.credit_bank_repository import CreditBankRepository
from utils.logger import get_logger

logger = get_logger(__name__)

# admin client justified: credit_bank_entries is service-role only, and the
#   sweep runs with no user; each route that calls in is the authorization.
from utils.admin_client import admin_client as _admin

OPTIO_ACADEMY_ORG_ID = '8ee22671-6e38-473c-a326-90ff86460310'
AUTOPAY_NOTE = 'Monthly tuition (auto-charge)'

KINDS = ('included', 'monthly', 'accelerated', 'prior_learning', 'adjustment')
# The kinds a person may enter by hand. Included and monthly rows are the
# sweep's and the enrollment's, keyed by reference.
MANUAL_KINDS = ('accelerated', 'prior_learning', 'adjustment')
PURCHASE_KINDS = ('accelerated', 'prior_learning')
MAX_MANUAL_CREDITS = Decimal('24')


class CreditBankError(ValueError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _repo() -> CreditBankRepository:
    return CreditBankRepository(client=_admin())


def monthly_credits() -> Decimal:
    """What one paid month banks: tuition over the price of a credit."""
    academy = PRICING['academy']
    return Decimal(academy['tuitionMonthlyCents']) / Decimal(academy['creditCents'])


def opened_year_credits() -> Decimal:
    return Decimal(PRICING['openEd']['creditsIncludedPerYear'])


def school_year(now: Optional[datetime] = None) -> str:
    """'2026-27' for any date from July 2026 through June 2027."""
    now = now or datetime.now(timezone.utc)
    start = now.year if now.month >= 7 else now.year - 1
    return f'{start}-{str(start + 1)[-2:]}'


def _half_steps(value: Any) -> Decimal:
    try:
        credits = Decimal(str(value))
    except Exception:  # noqa: BLE001
        raise CreditBankError('Enter a number of credits') from None
    if credits == 0 or (credits * 2) != (credits * 2).to_integral_value():
        raise CreditBankError('Credits go in steps of 0.5')
    return credits


def _bank(student_id: str, credits: Decimal, kind: str, source: str,
          reference: Optional[str], note: Optional[str], actor_id: Optional[str]) -> bool:
    """Write one row. False when an automatic row with this reference is
    already there (a second sweep, a second import)."""
    repo = _repo()
    if reference and repo.has_reference(student_id, reference):
        return False
    try:
        repo.insert({'student_user_id': student_id, 'credits': str(credits), 'kind': kind,
                     'source': source, 'reference': reference, 'note': note,
                     'entered_by': actor_id})
    except Exception as e:  # noqa: BLE001
        # Two sweeps racing on one reference: the unique index answers.
        if reference and '23505' in str(e):
            return False
        raise
    return True


# ── banking ─────────────────────────────────────────────────────────────────

def bank_opened_year(student_id: str, actor_id: Optional[str] = None) -> bool:
    """OpenEd's year: its credits, once per school year."""
    year = school_year()
    return _bank(student_id, opened_year_credits(), 'included', 'opened',
                 f'opened-year:{year}', f'OpenEd {year}', actor_id)


def add_entry(student_id: str, credits: Any, kind: str, note: Any, actor_id: str,
              source: str = 'manual', order_reference: Any = None,
              allowed_kinds: Iterable[str] = MANUAL_KINDS) -> Dict[str, Any]:
    """A row entered by a person: a purchase, or (staff only) a correction."""
    if kind not in MANUAL_KINDS or kind not in tuple(allowed_kinds):
        raise CreditBankError('Choose a credit type')
    amount = _half_steps(credits)
    if abs(amount) > MAX_MANUAL_CREDITS:
        raise CreditBankError(f'Enter at most {MAX_MANUAL_CREDITS} credits at once')
    if kind in PURCHASE_KINDS and amount < 0:
        raise CreditBankError('To take credits back, add a correction')
    note_text = ' '.join(str(note or '').split())[:300] or None
    if kind == 'adjustment' and not note_text:
        raise CreditBankError('Say why in the note')
    order = ' '.join(str(order_reference or '').split())[:80]
    if order:
        note_text = f'Order {order}' + (f': {note_text}' if note_text else '')
    _bank(student_id, amount, kind, source, None, note_text, actor_id)
    return balances([student_id])[student_id]


# ── balances ────────────────────────────────────────────────────────────────

def _approved_credits_since(student_ids: List[str],
                            start: Dict[str, Optional[str]]) -> Dict[str, Decimal]:
    repo = _repo()
    rows = [r for r in repo.finalized_completions(student_ids)
            if start.get(r['user_id']) and r['finalized_at'] >= start[r['user_id']]]
    approved = repo.approved_subjects([r['id'] for r in rows])
    fallback = repo.task_xp([r['user_quest_task_id'] for r in rows
                             if r['id'] not in approved and r.get('user_quest_task_id')])
    used: Dict[str, Decimal] = {}
    for r in rows:
        split = approved.get(r['id'])
        xp = (sum(int(v or 0) for v in split.values()) if split
              else fallback.get(r.get('user_quest_task_id') or '', 0))
        used[r['user_id']] = used.get(r['user_id'], Decimal(0)) + Decimal(xp)
    for t in repo.prior_learning_transfers(student_ids):
        sid = t['user_id']
        if (t.get('accredited') or not t.get('prior_learning_record_ids')
                or not start.get(sid) or (t.get('created_at') or '') < (start[sid] or '')):
            continue
        used[sid] = used.get(sid, Decimal(0)) + Decimal(int(t.get('total_xp') or 0))
    return {sid: (xp / Decimal(XP_PER_CREDIT)).quantize(Decimal('0.01')) for sid, xp in used.items()}


def balances(student_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
    """{student_id: {banked, used, balance, entries}}, credits as floats."""
    ids = [s for s in dict.fromkeys(student_ids) if s]
    if not ids:
        return {}
    repo = _repo()
    entries = repo.entries(ids)
    banked: Dict[str, Decimal] = {}
    first_entry: Dict[str, str] = {}
    by_student: Dict[str, List[Dict[str, Any]]] = {}
    for e in entries:
        sid = e['student_user_id']
        banked[sid] = banked.get(sid, Decimal(0)) + Decimal(str(e['credits']))
        if sid not in first_entry or e['created_at'] < first_entry[sid]:
            first_entry[sid] = e['created_at']
        by_student.setdefault(sid, []).append(e)

    start: Dict[str, Optional[str]] = {}
    for a in repo.academy_enrollments(ids):
        if a.get('enrolled_at') and (a['user_id'] not in start or a['enrolled_at'] < (start[a['user_id']] or '')):
            start[a['user_id']] = a['enrolled_at']
    for sid in ids:
        start.setdefault(sid, first_entry.get(sid))

    used = _approved_credits_since(ids, start)
    out: Dict[str, Dict[str, Any]] = {}
    for sid in ids:
        b = banked.get(sid, Decimal(0))
        u = used.get(sid, Decimal(0))
        rows = [{**{k: e[k] for k in ('id', 'kind', 'source', 'note', 'created_at')},
                 'credits': float(e['credits'])} for e in by_student.get(sid, [])]
        rows.sort(key=lambda e: e['created_at'], reverse=True)
        out[sid] = {'banked': float(b), 'used': float(u), 'balance': float(b - u),
                    'since': start.get(sid), 'entries': rows}
    return out


# ── the daily sweep ─────────────────────────────────────────────────────────

def _stripe_key(org_id: str) -> Optional[str]:
    from services.registration_funnel_support import _org_stripe_key
    return _org_stripe_key(org_id)


def _sweep_subscriptions(org_id: str) -> Dict[str, int]:
    """Registration subscriptions: one bank row per covered student per paid
    Stripe invoice."""
    key = _stripe_key(org_id)
    if not key:
        return {'invoices': 0, 'banked': 0}
    import stripe
    repo = _repo()
    per_month = monthly_credits()
    invoices = banked = 0
    for reg in repo.subscribed_registrations(org_id):
        students: List[str] = [str(k['user_id']) for k in (reg.get('kids') or [])
                               if isinstance(k, dict) and k.get('user_id') and not k.get('waitlisted')]
        if not students:
            continue
        try:
            listing = stripe.Invoice.list(subscription=reg['stripe_subscription_id'],
                                          status='paid', limit=100, api_key=key)
            paid = list(listing.auto_paging_iter())
        except Exception as e:  # noqa: BLE001 -- one family's Stripe error skips that family
            logger.warning(f"credit bank: Stripe read failed for registration {reg['id'][:8]}: {e}")
            continue
        for inv in paid:
            if not inv.get('amount_paid'):
                continue
            invoices += 1
            month = datetime.fromtimestamp(
                (inv.get('status_transitions') or {}).get('paid_at') or inv['created'],
                tz=timezone.utc).strftime('%Y-%m')
            for sid in students:
                if _bank(sid, per_month, 'monthly', 'stripe', f"stripe-invoice:{inv['id']}",
                         f'Tuition paid {month}', None):
                    banked += 1
    return {'invoices': invoices, 'banked': banked}


def _sweep_autopay(org_id: str) -> Dict[str, int]:
    """Office-set monthly tuition: one bank row per standard or Full-Time
    student per recorded autopay payment."""
    repo = _repo()
    payments = repo.autopay_payments(org_id, AUTOPAY_NOTE)
    households = repo.invoice_households([p['invoice_id'] for p in payments if p.get('invoice_id')])
    schedules: Dict[str, List[str]] = {}
    banking_amounts = {PRICING['academy']['tuitionMonthlyCents'],
                       PRICING['academy']['fullTimeMonthlyCents']}
    for row in repo.tuition_schedules(list(set(households.values()))):
        if row.get('monthly_cents') in banking_amounts and row.get('status') != 'canceled':
            schedules.setdefault(row['household_id'], []).append(row['student_user_id'])
    per_month = monthly_credits()
    banked = 0
    for p in payments:
        month = (p.get('recorded_at') or '')[:7]
        for sid in schedules.get(households.get(p.get('invoice_id') or '', ''), []):
            if _bank(sid, per_month, 'monthly', 'sis_autopay', f"sis-payment:{p['id']}",
                     f'Tuition paid {month}', None):
                banked += 1
    return {'payments': len(payments), 'banked': banked}


def sweep(org_id: str = OPTIO_ACADEMY_ORG_ID) -> Dict[str, Any]:
    """Bank every paid month not banked yet. Safe to run any number of times."""
    out: Dict[str, Any] = {}
    for name, run in (('subscriptions', _sweep_subscriptions), ('autopay', _sweep_autopay)):
        try:
            out[name] = run(org_id)
        except Exception as e:  # noqa: BLE001 -- one path failing must not stop the other
            logger.error(f'credit bank sweep {name} failed: {e}')
            out[name] = {'error': str(e)[:200]}
    return out
