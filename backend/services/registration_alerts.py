"""
Staff-facing email at the two moments a family becomes real to the school:
when they submit the family step, and when they finish the funnel.

The family already gets a completion email (finish_fee_step: goals link or
scheduling link). Nobody at the school did -- a completed registration was a
new row on the People page and nothing else, and with support copies off
since August 2026 there was no side channel either. Tanner asked for one on
2026-09-14, when Optio Academy's funnel started setting up money.

THE COMPLETION ALERT IS NOT ENOUGH, because most of the funnel's exits are not
completions. On 2026-09-22 three of Optio Academy's seven most recent
registrations had stalled unfinished -- two of them at the payment step with
every form field already filled in, one of them that same morning -- and the
school had been told about none of them. A family that types their children's
names, birthdays and address into a school's form has registered in every sense
the office cares about; only Stripe disagrees. So notify_registration_started
fires on the family step, which is the earliest moment the submission contains
a person the school could call back.

DE-DUPLICATION IS THE CALLER'S, and it is structural rather than a stored flag:
the family step accepts a back-edit at any later status, so the caller sends
only when the row was still at `status == 'family'` on entry. That holds
because nothing in the funnel moves a registration backwards into `family` --
the three writers of that status (registration_entry.verify,
my_registration's logged-in resume, registration_identity_service's attach)
all advance a row out of `verify` or insert it new. Add a fourth that rewinds
and this quietly starts sending twice.

Who receives it is sis_billing_alerts.recipients: the org's admins, or
Config.ADMIN_EMAIL for a school with none (Optio Academy is run by a
superadmin and has no org admins). One message, first address To and the rest
CC, same as every other staff alert.

Best-effort by construction: the caller has already completed the
registration, and an email failure must never look like a failed registration
to the parent. Every exception is logged and swallowed here.
"""

from typing import Any, Dict, List, Optional

from app_config import Config
from services.registration_pricing import monthly_line_items, monthly_plan
from utils.logger import get_logger
from utils.money import format_cents

logger = get_logger(__name__)

SIS_URL = 'https://sis.optioeducation.com'


def _esc(v: Any) -> str:
    return (str(v) if v is not None else '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _student_lines(reg: Dict[str, Any], cfg: Dict[str, Any]) -> List[str]:
    """'Casey Sample (DOB 2018-03-14) -- Optio teacher support', one per kid."""
    plan = monthly_plan(cfg)
    labels = {a['key']: a['label'] for a in (plan or {}).get('add_ons', [])}
    lines = []
    for kid in reg.get('kids') or []:
        name = kid.get('name') or f"{kid.get('first_name', '')} {kid.get('last_name', '')}".strip() or 'Student'
        bits = [name]
        if kid.get('dob'):
            bits.append(f"(DOB {kid['dob']})")
        chosen = [labels.get(k, k) for k in (kid.get('add_ons') or [])]
        if chosen:
            bits.append('-- ' + ', '.join(chosen))
        if kid.get('waitlisted'):
            bits.append('-- waitlisted')
        lines.append(' '.join(bits))
    return lines


def _payment_lines(reg: Dict[str, Any], cfg: Dict[str, Any], extra: Dict[str, Any]) -> List[str]:
    lines = []
    fee = int(reg.get('fee_cents') or 0)
    if fee > 0:
        how = 'paid by card' if extra.get('fee_paid_at') or reg.get('fee_paid_at') else 'recorded, collected by the school'
        lines.append(f'Registration fee {format_cents(fee)} ({how})')
    elif reg.get('fee_deferred'):
        lines.append('Registration fee deferred (waitlist)')
    monthly = int(reg.get('monthly_cents') or 0)
    if monthly > 0:
        items = monthly_line_items(monthly_plan(cfg), reg.get('kids') or [])
        detail = '; '.join(
            f"{i['label']}{' (' + ', '.join(i['students']) + ')' if i['students'] else ''} {format_cents(i['amount_cents'])}"
            for i in items)
        sub = extra.get('stripe_subscription_id') or reg.get('stripe_subscription_id')
        lines.append(f'Monthly {format_cents(monthly)}/month: {detail}')
        lines.append(f'Stripe subscription {sub}' if sub
                     else 'No subscription on file: the school collects the monthly payment itself')
    return lines


def _answer_lines(reg: Dict[str, Any], cfg: Dict[str, Any]) -> List[str]:
    """Each intake answer, per-student ones spelled out by kid name."""
    answers = reg.get('answers') or {}
    if not isinstance(answers, dict) or not answers:
        return []
    kid_names = {k.get('user_id'): (k.get('first_name') or k.get('name') or 'Student')
                 for k in (reg.get('kids') or [])}
    labels = {q.get('key'): q.get('label') for q in (cfg.get('questions') or []) if q.get('key')}
    lines = []
    for key, val in answers.items():
        label = labels.get(key) or str(key).replace('_', ' ')
        if isinstance(val, dict):
            parts = [f"{kid_names.get(kid, kid)}: {', '.join(v) if isinstance(v, list) else v}"
                     for kid, v in val.items() if v]
            if parts:
                lines.append(f"{label}: {'; '.join(parts)}")
        elif isinstance(val, list):
            if val:
                lines.append(f"{label}: {', '.join(str(v) for v in val)}")
        elif val not in (None, ''):
            lines.append(f'{label}: {val}')
    return lines


def _email_html(kicker: str, heading: str, sections: List[tuple], cta_url: str, cta_label: str) -> str:
    """The shell both alerts render into. Table markup and inline styles because
    this is email: no <style> block survives Gmail."""
    rows_html = ''.join(
        f'<tr><td style="padding:6px 16px 6px 0;color:#6b7280;font-size:14px;vertical-align:top;white-space:nowrap;">{_esc(h)}</td>'
        f'<td style="padding:6px 0;font-size:14px;color:#111827;">{"<br>".join(_esc(l) for l in lines)}</td></tr>'
        for h, lines in sections)
    return f"""
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
      <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">{_esc(kicker)}</p>
      <h2 style="margin:0 0 16px;font-size:18px;">{_esc(heading)}</h2>
      <table style="border-collapse:collapse;">{rows_html}</table>
      <p style="margin-top:20px;"><a href="{cta_url}"
         style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">{_esc(cta_label)}</a></p>
    </div>
    """.strip()


def _email_text(heading: str, sections: List[tuple], cta_url: str) -> str:
    return f'{heading}\n\n' + '\n\n'.join(
        f'{h}\n' + '\n'.join(lines) for h, lines in sections) + f'\n\n{cta_url}'


def _send(reg: Dict[str, Any], subject: str, kicker: str, heading: str,
          sections: List[tuple], cta_url: str, cta_label: str, what: str) -> bool:
    """Resolve the school's recipients and send. One message, first address To
    and the rest CC, same as every other staff alert."""
    from services.sis_billing_alerts import recipients
    from services.email_service import email_service

    org_id = reg.get('organization_id')
    to = recipients(org_id) if org_id else ([Config.ADMIN_EMAIL] if Config.ADMIN_EMAIL else [])
    if not to:
        logger.warning(f"[registration alert] nobody to notify for registration {reg.get('id')}")
        return False
    sections = [(h, lines) for h, lines in sections if lines]
    # A staff notice, not a message to a family: no support copy either way.
    ok = email_service.send_email(
        to_email=to[0], cc=to[1:], subject=subject,
        html_body=_email_html(kicker, heading, sections, cta_url, cta_label),
        text_body=_email_text(heading, sections, cta_url), support_copy=False)
    logger.info(f"[registration alert] {what} {reg.get('id')} -> {len(to)} recipient(s), sent={ok}")
    return bool(ok)


def _address_lines(contact: Dict[str, Any]) -> List[str]:
    """'12 Oak St, Apt 4' / 'Provo, UT 84604' -- the street block as a person
    would write it, skipping whatever the family left blank."""
    a = contact.get('address') or {}

    def part(key: str) -> str:
        return (a.get(key) or '').strip()

    street = ', '.join(v for v in (part('address_line1'), part('address_line2')) if v)
    city_state = ', '.join(v for v in (part('city'), part('state')) if v)
    city_line = ' '.join(v for v in (city_state, part('postal_code')) if v)
    return [line for line in (street, city_line) if line]


def _expected_payment_lines(reg: Dict[str, Any]) -> List[str]:
    """What the family is about to be asked for. The amounts exist by the end of
    the family step -- submit_family computes and stores both -- but nothing has
    been charged and the add-ons that re-price the monthly are still unchosen,
    so every line here says 'expected'."""
    lines = []
    fee = int(reg.get('fee_cents') or 0)
    lines.append(f'Registration fee {format_cents(fee)} expected' if fee > 0
                 else 'No registration fee owed')
    monthly = int(reg.get('monthly_cents') or 0)
    if monthly > 0:
        lines.append(f'Monthly {format_cents(monthly)}/month expected, before add-ons')
    return lines


def _school_name(org: Optional[Dict[str, Any]], org_id: Optional[str]) -> str:
    """The org's name for a subject line, looked up only when the caller has no
    org row to hand. Goes through the repository rather than a fifth private
    _org_name + .table('organizations') copy -- services/ already has four, and
    routes/ is ratcheted against gaining one."""
    name = (org or {}).get('name')
    if name:
        return name
    if not org_id:
        return 'Your school'
    try:
        from repositories.organization_repository import OrganizationRepository
        return OrganizationRepository().names_for([org_id]).get(org_id) or 'Your school'
    except Exception as e:  # noqa: BLE001 -- an unnamed school still beats no email
        logger.warning(f'[registration alert] org name lookup failed for {str(org_id)[:8]}: {e}')
        return 'Your school'


def notify_registration_started(reg: Dict[str, Any], cfg: Dict[str, Any],
                                org: Optional[Dict[str, Any]],
                                parent: Dict[str, Any], contact: Optional[Dict[str, Any]] = None) -> bool:
    """Email the school that a family just submitted the family step: their
    children, their address and their phone number are on file, and the rest of
    the funnel may or may not ever happen. Never raises.

    Send this ONCE per registration -- see the module docstring on why the
    caller, not this function, decides that.
    """
    try:
        contact = contact or {}
        org_name = _school_name(org, reg.get('organization_id'))
        parent_name = f"{parent.get('first_name', '')} {parent.get('last_name', '')}".strip() or 'A parent'
        phone = contact.get('phone') or parent.get('phone_number')
        reach = ', '.join(v for v in (parent.get('email'), phone) if v)
        kids = reg.get('kids') or []
        n = len(kids)
        subject = f"{org_name}: {parent_name} started registering {n} student{'' if n == 1 else 's'}"

        sections = [
            ('Parent', [f'{parent_name}' + (f' ({reach})' if reach else '')]),
            ('Address', _address_lines(contact)),
            ('Students', _student_lines(reg, cfg) or ['None recorded']),
            ('Expected', _expected_payment_lines(reg)),
            # Said plainly because the whole point of this email is the families
            # who stop here: the office should read it as a lead, not a new
            # enrolment, and should not wait for a completion alert that may
            # never come.
            ('Status', ['Not finished yet -- they still have the rest of the funnel to complete.',
                        'A second email follows if and when they do.']),
        ]
        return _send(reg, subject, 'Registration started',
                     f'{parent_name} started registering with {org_name}',
                     sections, f'{SIS_URL}/people', 'Open in SIS', 'started registration')
    except Exception as e:  # noqa: BLE001 -- the family step already succeeded; never fail it for mail
        logger.warning(f"[registration alert] start alert failed for registration {reg.get('id')}: {e}")
        return False


def notify_registration_completed(reg: Dict[str, Any], cfg: Dict[str, Any], org: Dict[str, Any],
                                  parent: Dict[str, Any], extra: Optional[Dict[str, Any]] = None) -> bool:
    """Email the school that a family just finished registering. Never raises."""
    try:
        extra = extra or {}
        org_name = (org or {}).get('name') or 'Your school'
        parent_name = f"{parent.get('first_name', '')} {parent.get('last_name', '')}".strip() or 'A parent'
        contact = ', '.join(v for v in (parent.get('email'), parent.get('phone_number')) if v)
        kids = reg.get('kids') or []
        subject = f"{org_name}: {parent_name} registered {len(kids)} student{'' if len(kids) == 1 else 's'}"

        sections = [
            ('Parent', [f'{parent_name}' + (f' ({contact})' if contact else '')]),
            ('Students', _student_lines(reg, cfg) or ['None recorded']),
            ('Payment', _payment_lines(reg, cfg, extra) or ['Nothing owed']),
            ('Answers', _answer_lines(reg, cfg)),
        ]
        return _send(reg, subject, 'Registration',
                     f'{parent_name} finished registering with {org_name}',
                     sections, f'{SIS_URL}/people', 'Open in SIS', 'registration')
    except Exception as e:  # noqa: BLE001 -- the registration is already complete; never fail it for mail
        logger.warning(f"[registration alert] failed for registration {reg.get('id')}: {e}")
        return False
