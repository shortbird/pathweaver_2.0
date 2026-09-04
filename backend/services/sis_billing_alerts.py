"""
Telling the office when a family sets up a payment at Stripe.

Optio Academy, 2026-09-03: "email me when a parent payment is set up through
stripe". Both card-setup flows are no-login links a parent opens from an email,
so nothing about them happens in front of staff: the card is saved, a schedule
quietly starts billing, and the only trace is a row on a page nobody has a
reason to reload. This is the notification that closes that loop.

Two events, one shape of email:

  - A card goes on file for open-ended monthly tuition, which also starts every
    schedule the family has and takes the first month
    (services/sis_recurring_tuition_service.py).
  - A card goes on file for an invoice payment plan, which builds the
    installments and charges #1 (sis_billing_service._confirm_autopay).

WHO GETS IT: the school's org admins. Optio Academy has none — it is Optio's own
school, run by a superadmin, who by definition is not a member of any org — so an
org with no admin falls back to Config.ADMIN_EMAIL. For the Academy that fallback
IS the delivery path, not a safety net.

Every public function here is best-effort and returns a bool. The family's card
is already saved and their first payment already taken by the time any of this
runs, so nothing in here may raise into a money path.
"""

from typing import Any, Dict, List, Optional

from app_config import Config
from database import get_supabase_admin_client
from utils import person_name
from utils.logger import get_logger

logger = get_logger(__name__)

SIS_URL = 'https://sis.optioeducation.com'


def _admin():
    # admin client justified: composes an office notification from rows owned by
    #   a family (their household, saved payment method and recurring plan); runs
    #   from a Stripe webhook and a billing write path, neither of which has a
    #   caller whose RLS could see them
    return get_supabase_admin_client()


def _money(cents: Optional[int]) -> str:
    return f"${(cents or 0) / 100:,.2f}"


def _ordinal(day: Optional[int]) -> str:
    """PURE. 1 -> '1st'. The billing day reads as a date, not a number."""
    try:
        n = int(day)
    except (TypeError, ValueError):
        return ''
    suffix = 'th' if 11 <= n % 100 <= 13 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suffix}'


def _card_label(card: Optional[Dict[str, Any]]) -> str:
    """PURE. 'Visa ending 4242' — the only card detail worth putting in an email,
    and the only one the platform stores."""
    if not card:
        return 'Card on file'
    brand = (card.get('card_brand') or card.get('brand') or '').strip()
    last4 = (card.get('card_last4') or card.get('last4') or '').strip()
    if brand and last4:
        return f'{brand.title()} ending {last4}'
    return f'Card ending {last4}' if last4 else 'Card on file'


# ── Recipients ───────────────────────────────────────────────────────────────

def recipients(org_id: str) -> List[str]:
    """Who at the school hears about this.

    The org's admins, or Config.ADMIN_EMAIL when it has none. A school with no
    admin is not a school with nobody watching the money — Optio Academy is
    exactly that shape — so an empty list is never the answer.
    """
    try:
        from services import sis_service
        emails = sis_service.org_admin_emails(org_id)
    except Exception as e:  # noqa: BLE001 — a lookup failure must still notify somebody
        logger.warning(f'[SIS billing alert] admin lookup failed for org {str(org_id)[:8]}: {e}')
        emails = []
    return emails or ([Config.ADMIN_EMAIL] if Config.ADMIN_EMAIL else [])


# ── Reads ────────────────────────────────────────────────────────────────────

def _org_name(org_id: str) -> str:
    rows = (_admin().table('organizations').select('name')
            .eq('id', org_id).limit(1).execute()).data
    return (rows[0].get('name') if rows else None) or 'Your school'


def _household_name(household_id: Optional[str]) -> str:
    if not household_id:
        return 'A family'
    rows = (_admin().table('households').select('name')
            .eq('id', household_id).limit(1).execute()).data
    return (rows[0].get('name') if rows else None) or 'A family'


def _saved_card(org_id: str, household_id: str) -> Optional[Dict[str, Any]]:
    rows = (_admin().table('sis_saved_payment_methods').select('*')
            .eq('organization_id', org_id).eq('household_id', household_id)
            .order('updated_at', desc=True).limit(1).execute()).data
    return rows[0] if rows else None


def _person(user_id: Optional[str]) -> Dict[str, Any]:
    if not user_id:
        return {}
    rows = (_admin().table('users').select(f'id, {person_name.USER_NAME_FIELDS}')
            .eq('id', user_id).limit(1).execute()).data
    return rows[0] if rows else {}


def _who_set_it_up(card: Optional[Dict[str, Any]]) -> str:
    """The parent line: whoever the saved card is filed under."""
    guardian = _person((card or {}).get('guardian_user_id'))
    if not guardian:
        return 'A parent'
    name = person_name.full_name(guardian, 'A parent')
    email = guardian.get('email')
    return f'{name} ({email})' if email else name


def _active_schedules(org_id: str, household_id: str) -> List[Dict[str, Any]]:
    """The family's live monthly tuition rows, with the student each is for.

    Bounded by one household — a family's children — so this cannot truncate.
    """
    rows = (_admin().table('sis_recurring_tuition')
            .select('student_user_id, monthly_cents, day_of_month, description')
            .eq('organization_id', org_id).eq('household_id', household_id)
            .eq('status', 'active').execute()).data or []
    if not rows:
        return []
    ids = list({r['student_user_id'] for r in rows if r.get('student_user_id')})
    students = {}
    if ids:
        students = {u['id']: u for u in (
            _admin().table('users').select(f'id, {person_name.USER_NAME_FIELDS}')
            .in_('id', ids).execute()).data or []}
    for r in rows:
        r['student_name'] = person_name.full_name(students.get(r.get('student_user_id')), 'A student')
    return rows


# ── Sending ──────────────────────────────────────────────────────────────────

def _send(org_id: str, subject: str, heading: str, facts: List[tuple],
          cta_label: str, cta_url: str) -> bool:
    """One message to the whole admin team (first To, rest CC).

    A per-admin loop is deliberately avoided: it delivered N copies of the same
    alert, the mistake the waitlist seat alert already had to unlearn.
    """
    to = recipients(org_id)
    if not to:
        logger.warning(f'[SIS billing alert] nobody to notify for org {str(org_id)[:8]}')
        return False
    rows_html = ''.join(
        f'<tr><td style="padding:4px 16px 4px 0;color:#6b7280;font-size:14px;white-space:nowrap;">{label}</td>'
        f'<td style="padding:4px 0;font-size:14px;color:#111827;">{value}</td></tr>'
        for label, value in facts)
    html = f"""
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
      <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Tuition</p>
      <h2 style="margin:0 0 16px;font-size:18px;">{heading}</h2>
      <table style="border-collapse:collapse;">{rows_html}</table>
      <p style="margin-top:20px;"><a href="{cta_url}"
         style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">{cta_label}</a></p>
    </div>
    """.strip()
    text = heading + '\n\n' + '\n'.join(f'{label}: {value}' for label, value in facts) + f'\n\n{cta_url}'
    from services.email_service import email_service
    ok = email_service.send_email(to_email=to[0], cc=to[1:], subject=subject,
                                  html_body=html, text_body=text)
    logger.info(f'[SIS billing alert] "{subject}" -> {len(to)} recipient(s), sent={ok}')
    return bool(ok)


def notify_recurring_card_saved(org_id: str, household_id: str,
                                activation: Optional[Dict[str, Any]] = None) -> bool:
    """A family put a card on file for open-ended monthly tuition.

    `activation` is what sis_recurring_tuition_service.activate_household
    returned. It is included rather than looked up because the interesting part
    is the outcome of the first charge, which only the caller saw — and the case
    staff most need to see is "card saved, nothing scheduled to bill", which is
    an error from that call, not a state on any row.
    """
    try:
        activation = activation or {}
        org_name = _org_name(org_id)
        family = _household_name(household_id)
        card = _saved_card(org_id, household_id)
        schedules = _active_schedules(org_id, household_id)
        monthly = sum(int(s.get('monthly_cents') or 0) for s in schedules)
        day = _ordinal((schedules[0].get('day_of_month') if schedules else None))

        facts = [('Family', family), ('Parent', _who_set_it_up(card)), ('Card', _card_label(card))]
        if schedules:
            students = ', '.join(s['student_name'] for s in schedules)
            facts.append(('Monthly tuition',
                          f'{_money(monthly)} for {students}'
                          + (f', charged on the {day}' if day else '')))
        if activation.get('error'):
            # The card IS saved; there was just nothing set up to charge. Staff
            # have to add the schedule or this family never gets billed.
            facts.append(('First charge',
                          'Not billed — no monthly tuition is set up for this family yet'))
        elif activation.get('charged'):
            facts.append(('First charge', f"{_money(activation.get('amount_cents'))} paid"))
        elif activation.get('reason') == 'declined':
            facts.append(('First charge', 'Declined — the invoice is unpaid and needs following up'))
        else:
            facts.append(('First charge', 'Not taken yet'))

        return _send(
            org_id,
            subject=f'{org_name}: {family} set up monthly tuition payments',
            heading=f'{family} saved a card for monthly tuition',
            facts=facts,
            cta_label='Open tuition',
            cta_url=f'{SIS_URL}/tuition',
        )
    except Exception as e:  # noqa: BLE001 — never break the flow that took the money
        logger.warning(f'[SIS billing alert] card-on-file notice skipped for household '
                       f'{str(household_id)[:8]}: {e}')
        return False


def notify_autopay_plan_created(org_id: str, invoice: Dict[str, Any],
                                saved_card: Optional[Dict[str, Any]],
                                result: Optional[Dict[str, Any]] = None) -> bool:
    """A family set up automatic payments against one invoice.

    `result` is what _create_autopay_plan returned: the plan (with its
    installments) and the outcome of charging #1.
    """
    try:
        result = result or {}
        plan = result.get('plan') or {}
        installments = plan.get('installments') or []
        first_charge = result.get('first_charge') or {}
        org_name = _org_name(org_id)
        family = _household_name(invoice.get('household_id'))

        first = installments[0] if installments else {}

        facts = [('Family', family), ('Parent', _who_set_it_up(saved_card)),
                 ('Card', _card_label(saved_card))]
        number = invoice.get('invoice_number')
        if number:
            facts.append(('Invoice', number))
        if installments:
            facts.append(('Plan', f"{len(installments)} monthly payments of "
                                  f"{_money(first.get('amount_cents'))}"))
        if first_charge.get('status') == 'charged':
            facts.append(('First payment', f"{_money(first.get('amount_cents'))} paid"))
        elif first_charge.get('status') == 'failed':
            facts.append(('First payment', 'Declined — it is marked late and needs following up'))

        return _send(
            org_id,
            subject=f'{org_name}: {family} set up automatic payments',
            heading=f'{family} saved a card and started a payment plan',
            facts=facts,
            cta_label='Open billing',
            cta_url=f'{SIS_URL}/billing',
        )
    except Exception as e:  # noqa: BLE001 — never break the flow that took the money
        logger.warning(f'[SIS billing alert] autopay notice skipped for invoice '
                       f'{str(invoice.get("id"))[:8]}: {e}')
        return False
