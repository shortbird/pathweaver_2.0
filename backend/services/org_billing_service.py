"""
Optio's own invoices, sent from /admin/billing on Optio's Stripe account.

Everything else that moves money in this codebase is a school billing its
families on the SCHOOL's Stripe key (sis_billing_service). This is Optio
billing whoever owes Optio -- a partner school, a parent, a consultant client
-- so nobody has to log into Stripe to do it. An invoice may be linked to an
organization, and does not have to be.

Stripe is the record. There is no table: each invoice carries
metadata.source=optio_admin (and metadata.organization_id when linked), each
recipient is a Stripe customer found by email, and the admin page reads the
list back from Stripe. Stripe numbers the invoice, renders the PDF and hosted
page, and sends the email.

Bank transfer (ACH) is the only way to pay, and it costs the payer nothing;
Optio absorbs Stripe's ACH fee. There is deliberately no card option: Stripe's
invoice page cannot add a fee to cards only, and Optio will not absorb the card
rate. Someone who must pay by card emails Optio, and a payment taken some other
way is recorded with mark_paid_outside.

The daily sweep sends the reminders (Stripe's own reminder schedule is a
dashboard setting, and the point here is never opening the dashboard). Every
invoice and reminder also goes to Config.OPTIO_BILLING_COPY_EMAIL as a copy
Optio sends itself, because Stripe's API has no CC. And Optio hears when a bank
payment starts, clears or fails (watch), because Stripe tells nobody.
"""

from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

SOURCE = 'optio_admin'

DEFAULT_DAYS_UNTIL_DUE = 30
MAX_LINES = 50

# Reminder days relative to the due date: three days before, on the day, and
# then weekly while it stays unpaid.
REMIND_BEFORE_DAYS = 3
REMIND_OVERDUE_EVERY_DAYS = 7


class OrgBillingError(ValueError):
    """A refusal the admin should read (bad input, wrong state)."""


class OrgBillingUnavailable(RuntimeError):
    """Optio's Stripe key is not configured on this server."""


def _key() -> str:
    """Optio's Stripe key: the one Config.OPTIO_BILLING_STRIPE_ORG_ID's school
    settings hold (see app_config for why that org, not STRIPE_SECRET_KEY)."""
    from utils.org_secrets import STRIPE_SECRET_KEY, get_org_secret
    org_id = Config.OPTIO_BILLING_STRIPE_ORG_ID
    key = get_org_secret(org_id, STRIPE_SECRET_KEY) if org_id else None
    if not key:
        raise OrgBillingUnavailable('No Stripe key on the Optio billing org')
    return key


def _stripe():
    import stripe
    return stripe


def is_available() -> bool:
    try:
        return bool(_key())
    except OrgBillingUnavailable:
        return False


# ── Customer: one per recipient email ───────────────────────────────────────

def _clean_email(email: str) -> str:
    email = (email or '').strip().lower()
    if '@' not in email or len(email) > 254 or "'" in email or ' ' in email:
        raise OrgBillingError('A valid recipient email is required')
    return email


def _customer_for(email: str, name: str):
    """The Stripe customer this module uses for `email`, created on first use.
    `name` is what the invoice is addressed to and is updated when it changes."""
    s, key = _stripe(), _key()
    found = s.Customer.search(query=f"email:'{email}' AND metadata['source']:'{SOURCE}'",
                              limit=1, api_key=key)
    cust = found.data[0] if found.data else None
    if cust:
        if name and cust.get('name') != name:
            cust = s.Customer.modify(cust.id, name=name, api_key=key)
        return cust
    # Customer.search is eventually consistent, so two sends a few seconds
    # apart could both miss; the idempotency key makes the second a replay.
    return s.Customer.create(email=email, name=name or None, metadata={'source': SOURCE},
                             api_key=key, idempotency_key=f'optio-billing-customer-{email}')


# ── Invoices ─────────────────────────────────────────────────────────────────

def _ts_to_date(ts) -> Optional[str]:
    return datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat() if ts else None


def _paid_via(inv) -> Optional[str]:
    if inv.get('status') != 'paid':
        return None
    md = inv.get('metadata') or {}
    if md.get('paid_outside_stripe'):
        return 'outside'
    return 'bank'


def _display_status(inv) -> str:
    status = inv.get('status')
    if status != 'open':
        return status
    pi = inv.get('payment_intent')
    if isinstance(pi, dict) and pi.get('status') == 'processing':
        return 'processing'
    due = inv.get('due_date')
    if due and due < datetime.now(tz=timezone.utc).timestamp():
        return 'overdue'
    return 'open'


def _invoice_dict(inv) -> Dict[str, Any]:
    md = inv.get('metadata') or {}
    return {
        'id': inv.id,
        'organization_id': md.get('organization_id') or None,
        'recipient_email': inv.get('customer_email'),
        'recipient_name': inv.get('customer_name'),
        'number': inv.get('number'),
        'status': _display_status(inv),
        'paid_via': _paid_via(inv),
        'total_cents': inv.get('total') or 0,
        'amount_remaining_cents': inv.get('amount_remaining') or 0,
        'created': _ts_to_date(inv.get('created')),
        'due_date': _ts_to_date(inv.get('due_date')),
        'memo': md.get('memo') or '',
        'hosted_invoice_url': inv.get('hosted_invoice_url'),
        'invoice_pdf': inv.get('invoice_pdf'),
        'last_reminder_on': md.get('last_reminder_on'),
        'lines': [{'description': li.get('description'), 'amount_cents': li.get('amount') or 0}
                  for li in ((inv.get('lines') or {}).get('data') or [])],
    }


# Invoice.search would filter on Stripe's side but lags about a minute, so an
# invoice just sent would be missing from the list the admin is looking at.
# The account's own invoice list is read instead, newest first, up to a cap.
LIST_CAP = 500


def list_invoices(organization_id: Optional[str] = None) -> List[Dict[str, Any]]:
    out = []
    for inv in _stripe().Invoice.list(limit=100, expand=['data.payment_intent'],
                                      api_key=_key()).auto_paging_iter():
        md = inv.get('metadata') or {}
        if md.get('source') != SOURCE:
            continue
        if organization_id and md.get('organization_id') != organization_id:
            continue
        out.append(_invoice_dict(inv))
        if len(out) >= LIST_CAP:
            break
    return out


def _clean_lines(lines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not isinstance(lines, list) or not lines:
        raise OrgBillingError('Add at least one line')
    if len(lines) > MAX_LINES:
        raise OrgBillingError(f'At most {MAX_LINES} lines')
    out = []
    for li in lines:
        desc = str((li or {}).get('description') or '').strip()
        try:
            amount = int(li.get('amount_cents'))  # type: ignore[arg-type]  # None -> TypeError -> refusal
            qty = int(li.get('quantity') or 1)
        except (TypeError, ValueError):
            raise OrgBillingError('Each line needs a whole-cent amount') from None
        if not desc:
            raise OrgBillingError('Each line needs a description')
        if amount <= 0 or qty <= 0:
            raise OrgBillingError('Amounts and quantities must be above zero')
        out.append({'description': desc[:500], 'unit_amount': amount, 'quantity': qty})
    return out


def create_invoice(*, recipient_email: str, recipient_name: str = '',
                   lines: List[Dict[str, Any]], memo: str = '',
                   days_until_due: Optional[int] = None,
                   organization_id: Optional[str] = None) -> Dict[str, Any]:
    """Create, finalize and email one invoice to `recipient_email`, linked to
    `organization_id` when one is given."""
    email = _clean_email(recipient_email)
    name = (recipient_name or '').strip()[:200]
    clean = _clean_lines(lines)
    memo = (memo or '').strip()[:500]
    try:
        days = DEFAULT_DAYS_UNTIL_DUE if days_until_due in (None, '') else int(days_until_due)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        raise OrgBillingError('Days until due must be a whole number') from None
    if not 0 <= days <= 365:
        raise OrgBillingError('Days until due must be between 0 and 365')

    cust = _customer_for(email, name)
    s, key = _stripe(), _key()
    metadata = {'source': SOURCE, 'memo': memo}
    if organization_id:
        metadata['organization_id'] = organization_id
    inv = s.Invoice.create(
        customer=cust.id,
        collection_method='send_invoice',
        days_until_due=days,
        auto_advance=False,
        pending_invoice_items_behavior='exclude',
        payment_settings={'payment_method_types': ['us_bank_account']},
        description=memo or None,
        metadata=metadata,
        api_key=key,
    )
    try:
        for li in clean:
            s.InvoiceItem.create(customer=cust.id, invoice=inv.id, currency='usd',
                                 description=li['description'], unit_amount=li['unit_amount'],
                                 quantity=li['quantity'], api_key=key)
        inv = s.Invoice.finalize_invoice(inv.id, auto_advance=False, api_key=key)
    except Exception:
        # A half-built draft would sit in Stripe forever; drop it and let the
        # admin retry.
        try:
            s.Invoice.delete(inv.id, api_key=key)
        except Exception as exc:  # noqa: BLE001
            logger.warning('[optio billing] could not delete draft %s: %s', inv.id, exc)
        raise
    inv = s.Invoice.send_invoice(inv.id, api_key=key)
    _copy_to_accounting(inv, 'sent')
    logger.info('[optio billing] sent %s for %s (org %s)', inv.get('number'), inv.get('total'),
                (organization_id or '-')[:8])
    return _invoice_dict(inv)


def _own_invoice(invoice_id: str):
    """An invoice this module created. Anything else on the account is refused."""
    if not str(invoice_id or '').startswith('in_'):
        raise OrgBillingError('Invoice not found')
    s = _stripe()
    try:
        inv = s.Invoice.retrieve(invoice_id, expand=['payment_intent'], api_key=_key())
    except s.error.InvalidRequestError:
        raise OrgBillingError('Invoice not found') from None
    md = inv.get('metadata') or {}
    if md.get('source') != SOURCE:
        raise OrgBillingError('Invoice not found')
    return inv


def _require_open(inv) -> None:
    if inv.get('status') != 'open':
        raise OrgBillingError(f"This invoice is {inv.get('status')}")


def resend_invoice(invoice_id: str) -> Dict[str, Any]:
    inv = _own_invoice(invoice_id)
    _require_open(inv)
    return _send_reminder(inv)


def void_invoice(invoice_id: str) -> Dict[str, Any]:
    inv = _own_invoice(invoice_id)
    _require_open(inv)
    if _display_status(inv) == 'processing':
        raise OrgBillingError('A bank transfer is in progress on this invoice')
    return _invoice_dict(_stripe().Invoice.void_invoice(inv.id, api_key=_key()))


def mark_paid_outside(invoice_id: str, note: str = '') -> Dict[str, Any]:
    """Record a payment that did not go through Stripe (a check, a wire)."""
    inv = _own_invoice(invoice_id)
    _require_open(inv)
    s, key = _stripe(), _key()
    inv = s.Invoice.pay(inv.id, paid_out_of_band=True, api_key=key)
    inv = s.Invoice.modify(inv.id, metadata={'paid_outside_stripe': (note or 'yes')[:200]}, api_key=key)
    return _invoice_dict(inv)


# ── Emails to Optio ──────────────────────────────────────────────────────────

def _recipient(inv) -> str:
    return inv.get('customer_name') or inv.get('customer_email') or 'the recipient'


def _recipient_row(inv, label: str):
    email = inv.get('customer_email') or ''
    return (label, f'{_recipient(inv)} <{email}>' if email else _recipient(inv))


def _send_to_optio(to: List[str], subject: str, lead: str, inv, rows,
                   category: str) -> None:
    """Email Optio's own inboxes about one invoice. Best effort: whatever the
    email is about has already happened in Stripe, so a failed send is logged,
    never raised."""
    if not to:
        return
    try:
        from html import escape
        from services.email_service import EmailService
        rows = list(rows)
        memo = (inv.get('metadata') or {}).get('memo')
        if memo:
            rows.append(('Memo', memo))
        links = []
        if inv.get('hosted_invoice_url'):
            links.append(f'<a href="{escape(inv["hosted_invoice_url"])}">View invoice</a>')
        if inv.get('invoice_pdf'):
            links.append(f'<a href="{escape(inv["invoice_pdf"])}">PDF</a>')
        html = (
            f'<p>{escape(lead)}</p>'
            '<table cellpadding="4">'
            + ''.join(f'<tr><td><b>{escape(k)}</b></td><td>{escape(str(v))}</td></tr>' for k, v in rows)
            + '</table>'
            + (f'<p>{" &middot; ".join(links)}</p>' if links else '')
        )
        text = '\n'.join([lead, ''] + [f'{k}: {v}' for k, v in rows]
                         + ([f'Invoice: {inv["hosted_invoice_url"]}'] if inv.get('hosted_invoice_url') else []))
        service = EmailService()
        for addr in to:
            service.send_email(addr, subject, html, text_body=text, support_copy=False,
                               categories=[category])
    except Exception as exc:  # noqa: BLE001
        logger.error('[optio billing] email to Optio failed for %s: %s', inv.get('id'), exc, exc_info=True)


def _copy_to_accounting(inv, kind: str) -> None:
    """Email Optio's accounting inbox what Stripe just sent."""
    to = Config.OPTIO_BILLING_COPY_EMAIL
    if not to:
        return
    from utils.money import format_cents
    number = inv.get('number') or inv.id
    what = 'Reminder sent' if kind == 'reminder' else 'Invoice sent'
    amount = format_cents(inv.get('amount_remaining') if kind == 'reminder' else inv.get('total')) or ''
    rows = [_recipient_row(inv, 'To'), ('Amount due' if kind == 'reminder' else 'Amount', amount),
            ('Due', _ts_to_date(inv.get('due_date')) or 'no due date')]
    _send_to_optio([to], f'[Copy] {what}: Optio invoice {number} to {_recipient(inv)}, {amount}',
                   f'{what} from Optio billing. This is a copy for your records.', inv, rows,
                   'optio_billing_copy')


# ── Reminders ────────────────────────────────────────────────────────────────

def _send_reminder(inv) -> Dict[str, Any]:
    s, key = _stripe(), _key()
    # send_invoice on an open invoice emails it again.
    s.Invoice.send_invoice(inv.id, api_key=key)
    _copy_to_accounting(inv, 'reminder')
    inv = s.Invoice.modify(inv.id, metadata={'last_reminder_on': date.today().isoformat()},
                           expand=['payment_intent'], api_key=key)
    return _invoice_dict(inv)


def reminder_due(inv, today: date) -> bool:
    """Three days before the due date, on it, and weekly after it. Never twice
    in a day, and never while a bank transfer is already on its way."""
    if inv.get('status') != 'open' or _display_status(inv) == 'processing':
        return False
    if (inv.get('metadata') or {}).get('last_reminder_on') == today.isoformat():
        return False
    due = inv.get('due_date')
    if not due:
        return False
    days_left = (datetime.fromtimestamp(due, tz=timezone.utc).date() - today).days
    if days_left in (REMIND_BEFORE_DAYS, 0):
        return True
    return days_left < 0 and (-days_left) % REMIND_OVERDUE_EVERY_DAYS == 0


# ── Daily sweep ──────────────────────────────────────────────────────────────

def sweep(today: Optional[date] = None) -> Dict[str, Any]:
    """Send the reminders that fall due today. Runs daily with the SIS billing
    reminders."""
    if not is_available():
        return {'skipped': 'no Stripe key on the Optio billing org'}
    today = today or date.today()
    reminded = failed = 0
    s = _stripe()
    for inv in s.Invoice.list(status='open', limit=100, expand=['data.payment_intent'],
                              api_key=_key()).auto_paging_iter():
        if (inv.get('metadata') or {}).get('source') != SOURCE:
            continue
        try:
            if reminder_due(inv, today):
                _send_reminder(inv)
                reminded += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            logger.error('[optio billing] sweep failed on %s: %s', inv.id, exc, exc_info=True)
    return {'reminders_sent': reminded, 'failed': failed}


# ── Payment watch ────────────────────────────────────────────────────────────
#
# Stripe tells nobody at Optio when a bank payment starts, clears or bounces:
# the dashboard shows it, and the point of this module is never opening the
# dashboard. There is no Stripe webhook in this codebase, so a sweep every
# cron tick reads the invoices and emails Config.OPTIO_BILLING_NOTIFY_EMAILS at
# each step. What was already sent is recorded on the invoice's own metadata,
# so there is still no table.
#
# The three steps of an ACH payment:
#   started  -- the payer authorized the debit; the PaymentIntent is processing
#               and the invoice is still open. Takes about 4 business days.
#   cleared  -- the debit succeeded and Stripe marked the invoice paid. The
#               money is in Optio's Stripe balance from here.
#   failed   -- the debit was returned (closed account, insufficient funds).
#               The invoice is open again and reminders resume.

# Paid invoices are read back this far by creation date. An invoice is due in
# at most 365 days and the debit takes days more.
WATCH_PAID_CREATED_WITHIN_DAYS = 400


def _notify_to() -> List[str]:
    return [a.strip() for a in (Config.OPTIO_BILLING_NOTIFY_EMAILS or '').split(',') if a.strip()]


def _notify(inv, step: str, pi=None) -> None:
    from utils.money import format_cents
    number = inv.get('number') or inv.id
    who = _recipient(inv)
    if step == 'started':
        amount = format_cents((pi or {}).get('amount') or inv.get('amount_remaining')) or ''
        subject = f'Payment started: {who} paid Optio invoice {number}, {amount}'
        lead = (f'{who} paid invoice {number} by bank transfer. The transfer usually clears in '
                'about 4 business days. You get another email when it clears.')
    elif step == 'cleared':
        amount = format_cents(inv.get('amount_paid') or inv.get('total')) or ''
        subject = f'Payment received: Optio invoice {number} from {who}, {amount}'
        lead = (f'The bank transfer for invoice {number} cleared, and Stripe marked the invoice '
                'paid. The money is in the Stripe balance and goes to the bank on the next payout.')
    else:
        amount = format_cents(inv.get('amount_remaining')) or ''
        err = (pi or {}).get('last_payment_error') or {}
        reason = err.get('message') or err.get('code') or 'the bank returned the transfer'
        subject = f'Payment failed: Optio invoice {number} from {who}, {amount}'
        lead = (f'The bank transfer for invoice {number} failed: {reason}. The invoice is open '
                'again, and reminders resume on their schedule.')
    rows = [_recipient_row(inv, 'From'), ('Amount', amount)]
    _send_to_optio(_notify_to(), subject, lead, inv, rows, 'optio_billing_payment')


def _watch_step(inv) -> Optional[str]:
    """The email this invoice owes Optio now, or None."""
    md = inv.get('metadata') or {}
    status = inv.get('status')
    if status == 'paid':
        if md.get('paid_outside_stripe') or md.get('notified_cleared'):
            return None
        return 'cleared'
    if status != 'open':
        return None
    pi = inv.get('payment_intent')
    if not isinstance(pi, dict):
        return None
    if pi.get('status') == 'processing':
        return None if md.get('notified_started') else 'started'
    charge = pi.get('latest_charge')
    if pi.get('last_payment_error') and charge and md.get('notified_failed') != charge:
        return 'failed'
    return None


def watch(now: Optional[datetime] = None) -> Dict[str, Any]:
    """Email Optio when a bank payment on one of its invoices starts, clears or
    fails. Runs every cron tick; each step emails once per invoice."""
    if not is_available():
        return {'skipped': 'no Stripe key on the Optio billing org'}
    now = now or datetime.now(tz=timezone.utc)
    s, key = _stripe(), _key()
    since = int(now.timestamp()) - WATCH_PAID_CREATED_WITHIN_DAYS * 86400
    sent: Dict[str, int] = {'started': 0, 'cleared': 0, 'failed': 0}
    errors = 0
    reads = (
        s.Invoice.list(status='open', limit=100, expand=['data.payment_intent'], api_key=key),
        s.Invoice.list(status='paid', created={'gte': since}, limit=100, api_key=key),
    )
    for page in reads:
        for inv in page.auto_paging_iter():
            if (inv.get('metadata') or {}).get('source') != SOURCE:
                continue
            try:
                step = _watch_step(inv)
                if not step:
                    continue
                pi = inv.get('payment_intent') if isinstance(inv.get('payment_intent'), dict) else None
                # Record first: a lost email costs less than one sent every ten
                # minutes because the metadata write keeps failing.
                if step == 'failed':
                    # A retry after a failure is a new start, so it emails again.
                    md = {'notified_failed': (pi or {}).get('latest_charge'), 'notified_started': ''}
                else:
                    md = {f'notified_{step}': now.date().isoformat()}
                s.Invoice.modify(inv.id, metadata=md, api_key=key)
                _notify(inv, step, pi)
                sent[step] += 1
            except Exception as exc:  # noqa: BLE001
                errors += 1
                logger.error('[optio billing] watch failed on %s: %s', inv.id, exc, exc_info=True)
    return {**sent, 'errors': errors}
