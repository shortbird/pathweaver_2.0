"""
Open-ended monthly tuition — a set amount per student, charged every month
until somebody turns it off.

Optio Academy (2026-08-31) does not bill a term and split it into installments.
Tuition is a monthly rate that runs until the family leaves, so there is no
total to divide and no installment count to divide it by — which is what
sis_payment_plans is built on. The schedule therefore lives in its own row
(sis_recurring_tuition) and the invoices stay exactly what they were: the record
of one month's charge, created when that month comes round.

Shape of it:

  - ONE ROW PER STUDENT, so a family with three children has three amounts that
    can be changed, paused or ended one at a time.
  - ONE INVOICE PER HOUSEHOLD PER MONTH, with a line per student, and ONE card
    charge for the total. The office asked to see each child's tuition itemised
    while the parent pays once.
  - ONE CARD PER HOUSEHOLD, saved through a no-login link in an email, reusing
    the same sis_saved_payment_methods row the invoice autopay flow uses.

A declined charge is NOT retried the next day. The invoice stands, unpaid, on
the outstanding report and in the family portal; next_charge_on still advances a
month so the sweep does not hammer a dead card daily. That matches how declines
are handled for installment plans: staff follow up, software does not nag.
"""

from datetime import date
from typing import Any, Dict, List, Optional

from services import sis_service
from services import sis_billing_service as billing
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger
from utils import person_name

logger = get_logger(__name__)

STATUSES = ('active', 'paused', 'canceled')
# Capped at 28 so the charge date exists in February; mirrors the CHECK on the
# column so the office is told at the form rather than by a failed write.
MIN_DAY_OF_MONTH = 1
MAX_DAY_OF_MONTH = 28


# admin client justified: the SIS console acts for the whole school — this
#   reads/writes rows belonging to every family in the org, which no single
#   caller can see under RLS; the route's role+org gate is the authorization
from utils.admin_client import admin_client as _admin


from utils.timestamps import now_iso as _now_iso  # noqa: E402
from utils.money import format_cents


# ── Validation (pure) ────────────────────────────────────────────────────────

def validate_terms(monthly_cents: Any, day_of_month: Any = 1) -> Optional[str]:
    """PURE. The error message for bad terms, or None when they're fine."""
    if not isinstance(monthly_cents, int) or isinstance(monthly_cents, bool) or monthly_cents <= 0:
        return 'Enter a monthly amount greater than zero'
    if day_of_month is None:
        return None
    if not isinstance(day_of_month, int) or isinstance(day_of_month, bool):
        return 'Choose a day of the month to charge'
    if day_of_month < MIN_DAY_OF_MONTH or day_of_month > MAX_DAY_OF_MONTH:
        return f'Charge between day {MIN_DAY_OF_MONTH} and {MAX_DAY_OF_MONTH} of the month'
    return None


def line_description(student_name: str, description: Optional[str]) -> str:
    """PURE. One student's line on the family's monthly invoice.

    The student's name leads, because the whole point of billing per student on
    a shared invoice is that the parent can see which child each amount is for.
    """
    label = (description or '').strip() or 'Monthly tuition'
    return f'{student_name} — {label}'


def next_month_from(d: date, day_of_month: int) -> date:
    """PURE. The same day next month, clamped to a day every month has."""
    day = max(MIN_DAY_OF_MONTH, min(int(day_of_month), MAX_DAY_OF_MONTH))
    year, month = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    return date(year, month, day)


def cycle_day(today: date, billed_rows: List[Dict[str, Any]]) -> int:
    """PURE. The billing day for a schedule that starts today.

    Monthly tuition bills on the date the family set it up, not on the 1st
    (owner, 2026-10-05): a family that saves its payment method on the 6th is
    billed on the 6th of every month. Days 29-31 bill on the 28th, a day every
    month has. A family that already has a billed schedule keeps that one's day,
    so a second child joins the same monthly invoice instead of starting a
    second one. Schedules started on the 1st before the change keep the 1st.
    """
    for r in billed_rows:
        if r.get('day_of_month'):
            return int(r['day_of_month'])
    return max(MIN_DAY_OF_MONTH, min(today.day, MAX_DAY_OF_MONTH))


def first_charge_date(today: date, day_of_month: int) -> date:
    """PURE. When the NEXT monthly charge falls, given the card was just saved.

    The first charge is taken immediately at setup (the family agreed to it by
    saving the card), so this is the one after that: this month's billing day if
    it is still ahead, otherwise next month's.
    """
    day = max(MIN_DAY_OF_MONTH, min(int(day_of_month), MAX_DAY_OF_MONTH))
    if today.day < day:
        return date(today.year, today.month, day)
    return next_month_from(today, day)


def paid_this_cycle(row: Dict[str, Any], today: date) -> bool:
    """PURE. True when the schedule was charged and its next charge is still ahead.

    Dates arrive from the database as ISO strings.
    """
    last, nxt = row.get('last_charged_on'), row.get('next_charge_on')
    if not last or not nxt:
        return False
    return date.fromisoformat(str(nxt)[:10]) > today


# ── Reads ────────────────────────────────────────────────────────────────────

def billing_contact(household_id: str) -> Optional[Dict[str, Any]]:
    """The ONE parent who sets up and holds the family's monthly payment.

    A household saves a single card, and Stripe records it against a single
    customer — whichever guardian `_pay_link_guardian` picks (the primary
    contact, else another non-dependent guardian). Emailing the setup link to
    every guardian therefore sent two parents two links to the same one-time
    action, and only one of them was ever going to be the payer on record.
    So the link goes to the payer, and the screen names them before you send.
    """
    return billing._pay_link_guardian({'household_id': household_id})  # noqa: SLF001 — same package


def _hydrate(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Attach student and family names, the household's card, and who the setup
    link can reach — everything the office needs to see why a schedule is or
    isn't billing yet, on the row itself."""
    if not rows:
        return []
    student_ids = list({r['student_user_id'] for r in rows})
    hh_ids = list({r['household_id'] for r in rows})
    users = {u['id']: u for u in (
        _admin().table('users').select('id, first_name, last_name, display_name, email')
        .in_('id', student_ids).execute()).data or []}
    households = {h['id']: h for h in (
        _admin().table('households').select('id, name')
        .in_('id', hh_ids).execute()).data or []}
    cards: Dict[str, Any] = {}
    contacts: Dict[str, Any] = {}
    for r in rows:
        oid, hh = r['organization_id'], r['household_id']
        if hh not in cards:
            saved = billing.household_saved_card(oid, hh)
            cards[hh] = ({'type': saved.get('method_type') or 'card',
                          'brand': saved.get('card_brand'), 'last4': saved.get('card_last4'),
                          'card_fee': billing.charges_card_fee(oid, saved)}
                         if saved else None)
        if hh not in contacts:
            g = billing_contact(hh)
            contacts[hh] = {'name': g['name'], 'email': g['email']} if g else None
    for r in rows:
        u = users.get(r['student_user_id']) or {}
        r['student_name'] = person_name.full_name(u, 'Unknown')
        r['household_name'] = (households.get(r['household_id']) or {}).get('name')
        r['card'] = cards.get(r['household_id'])
        r['billing_contact'] = contacts.get(r['household_id'])
    return rows


def list_for_org(org_id: str) -> Dict[str, Any]:
    """Every non-cancelled schedule in the org, newest first, with names."""
    rows = fetch_all_rows(lambda: (
        _admin().table('sis_recurring_tuition').select('*')
        .eq('organization_id', org_id).neq('status', 'canceled')
        .order('created_at', desc=True)
    ))
    rows = _hydrate(rows)
    monthly_total = sum(r['monthly_cents'] for r in rows if r['status'] == 'active')
    return {'schedules': rows, 'active_monthly_cents': monthly_total}


# ── Monthly payment plans (the other "pays monthly") ────────────────────────
#
# Ticket bc9010f4 (iCreate, Marika, 2026-10-02): "It is saying there is no
# student on a monthly rate, yet I know there are at least a couple who are. Do
# we have to add them manually to the monthly tuition tab?" No — and adding them
# would charge them twice. iCreate's monthly families pay by an autopay
# PAYMENT PLAN: one term invoice (sis_invoices) split into monthly installments
# (sis_payment_plans + sis_installments), charged by the installment sweep in
# sis_billing_service. That is a different mechanism from the schedules above,
# and the Monthly tab only ever listed the schedules, so a school billing
# monthly through plans read "nobody is on a monthly rate".
#
# These plans are listed read-only beside the schedules, and create() refuses a
# schedule for a student a plan already bills.

PENDING_INSTALLMENT_STATUSES = ('scheduled', 'due', 'late')


def _plans():
    from repositories.sis_billing_repository import SisPaymentPlanRepository
    return SisPaymentPlanRepository(client=_admin())


def list_monthly_payment_plans(org_id: str) -> List[Dict[str, Any]]:
    """One row per active monthly payment plan in the org, for the
    Monthly tab's read-only "On a monthly payment plan" section (ticket
    bc9010f4, Marika at iCreate).

    Each row: plan_id, invoice_id, household_id/household_name,
    student_user_id/student_name, monthly_cents (the next unpaid installment,
    else the last one), next_due_date, remaining_count, installment_count,
    auto_charge and has_card. No card details: whether a card is on the plan is
    all this screen needs, and the family's Billing tab carries the rest.
    """
    plans = _plans().active_monthly_for_org(org_id)
    if not plans:
        return []
    plan_ids = [p['id'] for p in plans]
    installments_by_plan: Dict[str, List[Dict[str, Any]]] = {}
    from repositories.sis_billing_repository import SisInstallmentRepository
    for inst in SisInstallmentRepository(client=_admin()).for_plan_ids(plan_ids):
        installments_by_plan.setdefault(inst['payment_plan_id'], []).append(inst)

    invoices = [p.get('sis_invoices') or {} for p in plans]
    student_ids = list({i['student_user_id'] for i in invoices if i.get('student_user_id')})
    hh_ids = list({i['household_id'] for i in invoices if i.get('household_id')})
    from repositories.user_repository import UserRepository
    from repositories.household_repository import HouseholdRepository
    users = UserRepository(client=_admin()).find_by_ids(
        student_ids, 'id, first_name, last_name, display_name, preferred_name') if student_ids else {}
    households = HouseholdRepository(client=_admin()).names_by_id(hh_ids)

    out: List[Dict[str, Any]] = []
    for p in plans:
        inv = p.get('sis_invoices') or {}
        insts = sorted(installments_by_plan.get(p['id'], []),
                       key=lambda i: str(i.get('due_date') or ''))
        pending = [i for i in insts if i.get('status') in PENDING_INSTALLMENT_STATUSES]
        basis = pending[0] if pending else (insts[-1] if insts else None)
        sid, hh = inv.get('student_user_id'), inv.get('household_id')
        out.append({
            'plan_id': p['id'],
            'invoice_id': p.get('invoice_id'),
            'household_id': hh,
            'household_name': (households.get(hh) or {}).get('name') if hh else None,
            'student_user_id': sid,
            'student_name': person_name.full_name(users[sid], 'Unknown') if sid in users else None,
            'monthly_cents': int((basis or {}).get('amount_cents') or 0),
            'next_due_date': pending[0].get('due_date') if pending else None,
            'remaining_count': len(pending),
            'installment_count': p.get('installment_count'),
            'auto_charge': bool(p.get('auto_charge')),
            'has_card': bool(p.get('saved_payment_method_id')),
        })
    out.sort(key=lambda r: ((r['household_name'] or '').lower(),
                            (r['student_name'] or '').lower()))
    return out


def student_monthly_plan(org_id: str, student_id: str,
                         household_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """The active monthly payment plan that already bills this student, or None.

    A plan attaches to a student through its invoice: sis_invoices
    .student_user_id when the invoice is the student's own (every iCreate plan
    on 2026-10-02), or only sis_invoices.household_id when the invoice is the
    whole family's. A family-wide plan bills every child in it, so it blocks a
    schedule for any of them. Both reads are bounded by one student or one
    household, so a plain read is safe here.
    """
    by_student = _plans().active_monthly_for_student(org_id, student_id)
    if by_student:
        return by_student[0]
    if not household_id:
        return None
    by_household = _plans().active_monthly_for_household(org_id, household_id)
    for p in by_household:
        if not (p.get('sis_invoices') or {}).get('student_user_id'):
            return p
    return None


def _student_name(student_id: str) -> str:
    from repositories.user_repository import UserRepository
    row = UserRepository(client=_admin()).find_by_ids(
        [student_id], 'id, first_name, last_name, display_name, preferred_name').get(student_id)
    return person_name.full_name(row, 'This student') if row else 'This student'


def _active_household_rows(org_id: str, household_id: str) -> List[Dict[str, Any]]:
    """A family's active schedules. One per child, so a plain read is safe."""
    return (_admin().table('sis_recurring_tuition').select('*')
            .eq('household_id', household_id).eq('organization_id', org_id)
            .eq('status', 'active').execute()).data or []


def get(org_id: str, schedule_id: str) -> Optional[Dict[str, Any]]:
    rows = (_admin().table('sis_recurring_tuition').select('*')
            .eq('id', schedule_id).eq('organization_id', org_id).limit(1).execute()).data
    return rows[0] if rows else None


# ── Writes ───────────────────────────────────────────────────────────────────

def create(org_id: str, student_id: str, monthly_cents: int, actor_id: str,
           description: Optional[str] = None, day_of_month: int = 1) -> Dict[str, Any]:
    """Start a monthly schedule for one student.

    Created ACTIVE but with next_charge_on NULL: active means "the school
    intends to bill this", and the sweep only picks up rows that also have a
    date, which is set when the family saves a card. Without that split, a
    schedule created before the card existed would either be skipped forever or
    swept with nothing to charge.
    """
    err = validate_terms(monthly_cents, day_of_month)
    if err:
        return {'error': err}
    if not sis_service.student_in_org(student_id, org_id):
        return {'error': 'Student not found'}
    household_id = _student_household_id(org_id, student_id)
    if not household_id:
        return {'error': 'This student is not in a family yet, so there is nobody to bill'}
    # Ticket bc9010f4 (Marika, iCreate): a student whose monthly payment plan
    # already charges them would be charged twice. Refused before any write.
    if student_monthly_plan(org_id, student_id, household_id):
        return {'error': f'{_student_name(student_id)} already pays by a monthly payment '
                         'plan. Adding monthly tuition would charge them twice.',
                'conflict': True}
    existing = (_admin().table('sis_recurring_tuition').select('id, status')
                .eq('student_user_id', student_id).neq('status', 'canceled')
                .limit(1).execute()).data
    if existing:
        return {'error': 'This student already has a monthly tuition schedule'}
    # The billing day is set when billing starts (cycle_day): at card setup,
    # or now when the family already has a card. `day_of_month` from the
    # caller is only a placeholder until then.
    has_card = bool(billing.household_saved_card(org_id, household_id))
    if has_card:
        siblings = [r for r in _active_household_rows(org_id, household_id)
                    if r.get('next_charge_on')]
        day_of_month = cycle_day(date.today(), siblings)
    row = (_admin().table('sis_recurring_tuition').insert({
        'organization_id': org_id, 'household_id': household_id,
        'student_user_id': student_id, 'monthly_cents': int(monthly_cents),
        'description': (description or '').strip() or None,
        'day_of_month': int(day_of_month), 'status': 'active',
        'created_by': actor_id,
    }).execute()).data[0]
    # A household that already has a card on file needs no second setup link, so
    # the schedule can start billing at the next billing day.
    if has_card:
        nxt = first_charge_date(date.today(), int(day_of_month))
        _admin().table('sis_recurring_tuition').update(
            {'next_charge_on': nxt.isoformat(), 'updated_at': _now_iso()}
        ).eq('id', row['id']).execute()
        row['next_charge_on'] = nxt.isoformat()
    return {'schedule': _hydrate([row])[0]}


def update(org_id: str, schedule_id: str, actor_id: str,
           monthly_cents: Any = None, description: Any = None,
           day_of_month: Any = None) -> Dict[str, Any]:
    """Change the amount, label, or billing day. Takes effect next charge."""
    row = get(org_id, schedule_id)
    if not row:
        return {'error': 'Schedule not found'}
    patch: Dict[str, Any] = {}
    if monthly_cents is not None:
        err = validate_terms(monthly_cents, None)
        if err:
            return {'error': err}
        patch['monthly_cents'] = int(monthly_cents)
    if day_of_month is not None:
        err = validate_terms(row['monthly_cents'], day_of_month)
        if err:
            return {'error': err}
        patch['day_of_month'] = int(day_of_month)
    if description is not None:
        patch['description'] = (description or '').strip() or None
    if not patch:
        return {'schedule': _hydrate([row])[0]}
    patch['updated_at'] = _now_iso()
    updated = (_admin().table('sis_recurring_tuition').update(patch)
               .eq('id', schedule_id).execute()).data[0]
    return {'schedule': _hydrate([updated])[0]}


def set_status(org_id: str, schedule_id: str, status: str, actor_id: str) -> Dict[str, Any]:
    """Pause, resume, or end a schedule.

    Pausing keeps the row and its amount so resuming is one click; cancelling
    keeps it too, for the history of what a family was charged, and only drops
    out of the one-live-per-student index.
    """
    if status not in STATUSES:
        return {'error': 'Unknown status'}
    row = get(org_id, schedule_id)
    if not row:
        return {'error': 'Schedule not found'}
    patch: Dict[str, Any] = {'status': status, 'updated_at': _now_iso()}
    if status == 'canceled':
        patch.update({'canceled_at': _now_iso(), 'canceled_by': actor_id,
                      'next_charge_on': None})
    elif status == 'paused':
        # Clear the date rather than leaving it in the past: resuming should
        # bill from the next billing day, not immediately catch up on the
        # months the family was paused for.
        patch['next_charge_on'] = None
    elif status == 'active':
        if billing.household_saved_card(org_id, row['household_id']):
            patch['next_charge_on'] = first_charge_date(
                date.today(), row['day_of_month']).isoformat()
    updated = (_admin().table('sis_recurring_tuition').update(patch)
               .eq('id', schedule_id).execute()).data[0]
    return {'schedule': _hydrate([updated])[0]}


def _student_household_id(org_id: str, student_id: str) -> Optional[str]:
    rows = (_admin().table('household_members').select('household_id')
            .eq('user_id', student_id).execute()).data or []
    for r in rows:
        hh = (_admin().table('households').select('id')
              .eq('id', r['household_id']).eq('organization_id', org_id)
              .limit(1).execute()).data
        if hh:
            return hh[0]['id']
    return None


# ── Card setup (the emailed, no-login link) ─────────────────────────────────

def activate_household(org_id: str, household_id: str) -> Dict[str, Any]:
    """After a card is saved: schedule every active row and bill the first month.

    The first charge happens now because saving the card IS the family agreeing
    to it — the same decision the invoice autopay flow makes, and the same one
    every subscription checkout makes.

    Only rows that have not been paid for this cycle are billed. On 2026-09-06
    the Waite family finished card setup twice, two minutes apart (once with
    Link, once with their Amex), and each return billed the full first month:
    INV-2026-1F3348 and INV-2026-2FEB6C, $500 apiece for one $500 month. A
    second setup is a family swapping the card, and the card is saved either
    way; the month is already billed. That holds after a declined first charge
    too: its invoice stands unpaid and was emailed with a pay link, and a second
    invoice for the same month would bill the family twice.
    """
    rows = _active_household_rows(org_id, household_id)
    if not rows:
        return {'error': 'No monthly tuition is set up for this family'}
    today = date.today()
    billed = [r for r in rows if paid_this_cycle(r, today)]
    rows = [r for r in rows if not paid_this_cycle(r, today)]
    if not rows:
        return {'activated': 0, 'charged': False, 'reason': 'already_paid'}
    day = cycle_day(today, billed)
    charge = bill_household(org_id, household_id, rows, today)
    for r in rows:
        _admin().table('sis_recurring_tuition').update({
            'day_of_month': day,
            'next_charge_on': first_charge_date(today, day).isoformat(),
            'last_charged_on': today.isoformat() if charge.get('invoice') else None,
            'updated_at': _now_iso(),
        }).eq('id', r['id']).execute()
    return {'activated': len(rows), **charge}


# ── The monthly sweep ────────────────────────────────────────────────────────

def bill_household(org_id: str, household_id: str, rows: List[Dict[str, Any]],
                   today: date) -> Dict[str, Any]:
    """One invoice for the family (a line per student) and one charge for it."""
    if not rows:
        return {'error': 'Nothing to bill'}
    hydrated = _hydrate([dict(r) for r in rows])
    line_items = [{
        'description': line_description(r['student_name'], r.get('description')),
        'amount_cents': int(r['monthly_cents']),
    } for r in hydrated]
    result = billing.create_tuition_invoice(
        org_id,
        # No single student owns a family invoice; the students are the lines.
        student_user_id=None,
        household_id=household_id,
        line_items=line_items,
        status='sent',
        due_date=today.isoformat(),
        note=f'Monthly tuition — {today.strftime("%B %Y")}',
    )
    if result.get('error'):
        logger.error(f'[recurring tuition] invoice failed for household '
                     f'{household_id[:8]}: {result["error"]}')
        return {'error': result['error']}
    invoice = result['invoice']
    saved = billing.household_saved_card(org_id, household_id)
    if not saved:
        # Invoice stands; the family gets it by email and can pay it by link.
        _email_invoice(org_id, invoice['id'])
        return {'invoice': invoice, 'charged': False, 'reason': 'no_card'}
    charge = billing.charge_invoice_off_session(org_id, invoice, saved)
    if charge.get('status') == 'processing':
        # A bank payment: started, clears in about four business days. It
        # counts as this month's charge (settle_bank_payments records it when
        # it clears, or emails the invoice if the bank returns it).
        return {'invoice': invoice, 'charged': True, 'pending': True,
                'method': 'bank', 'amount_cents': charge.get('amount_cents')}
    if charge.get('status') != 'charged':
        logger.warning(f'[recurring tuition] charge declined for household '
                       f'{household_id[:8]}: {charge.get("error")}')
        _email_invoice(org_id, invoice['id'])
        return {'invoice': invoice, 'charged': False, 'reason': 'declined',
                'error': charge.get('error')}
    return {'invoice': invoice, 'charged': True, 'amount_cents': charge.get('amount_cents')}


def _email_invoice(org_id: str, invoice_id: str) -> None:
    """Best-effort: a failed email must never undo a created invoice."""
    try:
        billing.email_invoice_to_family(org_id, invoice_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'[recurring tuition] invoice email failed for {invoice_id[:8]}: {e}')


def charge_due(org_id: Optional[str] = None,
               today: Optional[str] = None) -> Dict[str, Any]:
    """Cron sweep: bill every household whose monthly tuition falls due today.

    Groups by household so a family with three children gets ONE invoice and ONE
    charge. next_charge_on advances whether the charge succeeded or not — a
    declined card is handed to staff with an unpaid invoice, never retried
    tomorrow.

    Bank payments started on earlier runs are settled first (settle_banks).
    """
    on = date.fromisoformat(today) if today else date.today()
    settled = settle_banks(org_id)
    q = (_admin().table('sis_recurring_tuition').select('*')
         .eq('status', 'active').lte('next_charge_on', on.isoformat()))
    if org_id:
        q = q.eq('organization_id', org_id)
    rows = fetch_all_rows(lambda: q)

    by_household: Dict[tuple, List[Dict[str, Any]]] = {}
    for r in rows:
        by_household.setdefault((r['organization_id'], r['household_id']), []).append(r)

    charged = failed = 0
    for (oid, hh), group in by_household.items():
        try:
            result = bill_household(oid, hh, group, on)
        except Exception as e:  # noqa: BLE001 — one bad family must not stop the sweep
            logger.error(f'[recurring tuition] household {hh[:8]} failed: {e}')
            result = {'error': str(e)}
        ok = bool(result.get('charged'))
        charged += 1 if ok else 0
        failed += 0 if ok else 1
        for r in group:
            patch = {
                'next_charge_on': next_month_from(on, r['day_of_month']).isoformat(),
                'updated_at': _now_iso(),
            }
            if ok:
                patch['last_charged_on'] = on.isoformat()
            _admin().table('sis_recurring_tuition').update(patch).eq('id', r['id']).execute()
    return {'households': len(by_household), 'charged': charged, 'failed': failed,
            'bank_cleared': settled['cleared'], 'bank_failed': settled['failed']}


def settle_banks(org_id: Optional[str] = None) -> Dict[str, int]:
    """Settle bank (ACH) tuition payments for every school that has a bank
    account on file. One school's Stripe error must not stop the monthly
    charges."""
    from repositories.sis_billing_repository import SisSavedPaymentMethodRepository
    out = {'cleared': 0, 'failed': 0}
    for oid in SisSavedPaymentMethodRepository(client=_admin()).org_ids_with_method(
            billing.BANK_METHOD, org_id):
        try:
            got = billing.settle_bank_payments(oid)
            out['cleared'] += got['cleared']
            out['failed'] += got['failed']
        except Exception as e:  # noqa: BLE001
            logger.error(f'[recurring tuition] bank settle failed for org {oid[:8]}: {e}')
    return out


def household_org_id(household_id: str) -> Optional[str]:
    """The org a household belongs to. Used by the unauthenticated card-setup
    route, which knows the family from a signed token and nothing else."""
    rows = (_admin().table('households').select('organization_id')
            .eq('id', household_id).limit(1).execute()).data
    return rows[0]['organization_id'] if rows else None


def setup_email_bodies(org_name: str, students: List[Dict[str, Any]],
                       link: str, card_fee_terms: Optional[str] = None) -> Dict[str, str]:
    """PURE. The card-setup email a family receives: {subject, text, html}.

    Separate from the send so the exact message can be rendered without one —
    for a preview, a test, or answering "what does the parent actually get?"
    without mailing a real parent to find out.

    `students` are hydrated schedule rows: student_name and monthly_cents.
    `card_fee_terms` ("2.9% + $0.30") is set when the school offers a bank
    account free and charges cards the fee (billing.autopay_bank_free); the
    family reads the choice here, before Stripe's page asks them to make it.
    """
    choice = (f"You can pay from a bank account with no fee, or by card with a "
              f"{card_fee_terms} processing fee added to each payment."
              if card_fee_terms else '')
    total = sum(r['monthly_cents'] for r in students)
    breakdown = '\n'.join(
        f"  {r['student_name']}: {format_cents(r['monthly_cents'])}" for r in students)
    breakdown_html = ''.join(
        f"<li>{r['student_name']}: <strong>{format_cents(r['monthly_cents'])}</strong></li>"
        for r in students)
    return {
        'subject': f'{org_name}: set up your monthly tuition payment',
        'text': (
            f"Hello,\n\n{org_name} has set up monthly tuition for your family:\n\n"
            f"{breakdown}\n\n"
            f"Total: {format_cents(total)} per month.\n\n"
            f"Save a {'payment method' if card_fee_terms else 'card'} here and the first payment is "
            f"taken right away; after that it is charged automatically each month until the "
            f"school stops it:\n{link}\n\n"
            + (f"{choice}\n\n" if choice else '') +
            f"Thank you,\n{org_name}"),
        'html': (
            f"<p>Hello,</p><p>{org_name} has set up monthly tuition for your family:</p>"
            f"<ul>{breakdown_html}</ul>"
            f"<p>Total: <strong>{format_cents(total)} per month</strong>.</p>"
            f'<p><a href="{link}"><strong>Set up your monthly payment</strong></a> — the first '
            f"payment is taken right away, then it is charged automatically each month until "
            f"the school stops it.</p>"
            + (f"<p>{choice}</p>" if choice else '') +
            f"<p>Thank you,<br/>{org_name}</p>"),
    }


def send_setup_link(org_id: str, household_id: str) -> Dict[str, Any]:
    """Email the family a link to put a card on file and start monthly billing."""
    from services.sis_pay_links import setup_url
    from services.email_service import EmailService

    guardian = billing_contact(household_id)
    if not guardian:
        return {'error': 'Nobody on this family can be emailed. Add a parent to '
                         'the family in People, then send the link.'}
    rows = _active_household_rows(org_id, household_id)
    if not rows:
        return {'error': 'No monthly tuition is set up for this family'}
    hydrated = _hydrate([dict(r) for r in rows])
    total = sum(r['monthly_cents'] for r in hydrated)
    org = (_admin().table('organizations').select('name')
           .eq('id', org_id).limit(1).execute()).data
    org_name = (org[0]['name'] if org else None) or 'Your school'
    bodies = setup_email_bodies(
        org_name, hydrated, setup_url(household_id),
        card_fee_terms=billing.card_fee_terms(org_id) if billing.autopay_bank_free(org_id) else None)
    subject, text, html = bodies['subject'], bodies['text'], bodies['html']

    # ONE email, to the parent who will hold the card. Two parents receiving two
    # links to the same one-time setup reads as two things to do, and only one of
    # them can be the payer on record.
    svc = EmailService()
    try:
        emailed = bool(svc.send_email(to_email=guardian['email'], subject=subject,
                                      html_body=html, text_body=text))
    except Exception as e:  # noqa: BLE001 — the office gets told, not a stack trace
        logger.warning(f"[recurring tuition] setup email to {guardian['email']} failed: {e}")
        emailed = False
    if not emailed:
        # Saying so beats a green toast and a silent stamp that tells the office
        # next week that the family was asked.
        return {'error': 'The setup email could not be sent. Check the email '
                         'settings for this school and try again.'}
    # Stamped on the whole family's active rows: the link is per household, and
    # the office reads it off whichever child's row they happen to be looking at.
    sent_at = _now_iso()
    _admin().table('sis_recurring_tuition').update(
        {'setup_link_sent_at': sent_at, 'updated_at': sent_at}
    ).eq('household_id', household_id).eq('organization_id', org_id) \
     .eq('status', 'active').execute()
    return {'emailed': 1, 'monthly_cents': total,
            'sent_to': [guardian['name']], 'sent_at': sent_at}
