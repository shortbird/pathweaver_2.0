"""
Staff-facing email when a family finishes the registration funnel.

The family already gets a completion email (finish_fee_step: goals link or
scheduling link). Nobody at the school did -- a completed registration was a
new row on the People page and nothing else, and with support copies off
since August 2026 there was no side channel either. Tanner asked for one on
2026-09-14, when Optio Academy's funnel started setting up money.

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

logger = get_logger(__name__)

SIS_URL = 'https://sis.optioeducation.com'


def _money(cents: Any) -> str:
    return f'${int(cents or 0) / 100:,.2f}'


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
        lines.append(f'Registration fee {_money(fee)} ({how})')
    elif reg.get('fee_deferred'):
        lines.append('Registration fee deferred (waitlist)')
    monthly = int(reg.get('monthly_cents') or 0)
    if monthly > 0:
        items = monthly_line_items(monthly_plan(cfg), reg.get('kids') or [])
        detail = '; '.join(
            f"{i['label']}{' (' + ', '.join(i['students']) + ')' if i['students'] else ''} {_money(i['amount_cents'])}"
            for i in items)
        sub = extra.get('stripe_subscription_id') or reg.get('stripe_subscription_id')
        lines.append(f'Monthly {_money(monthly)}/month: {detail}')
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


def notify_registration_completed(reg: Dict[str, Any], cfg: Dict[str, Any], org: Dict[str, Any],
                                  parent: Dict[str, Any], extra: Optional[Dict[str, Any]] = None) -> bool:
    """Email the school that a family just finished registering. Never raises."""
    try:
        from services.sis_billing_alerts import recipients
        from services.email_service import email_service

        org_id = reg.get('organization_id')
        to = recipients(org_id) if org_id else ([Config.ADMIN_EMAIL] if Config.ADMIN_EMAIL else [])
        if not to:
            logger.warning(f"[registration alert] nobody to notify for registration {reg.get('id')}")
            return False

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
        sections = [(h, lines) for h, lines in sections if lines]

        rows_html = ''.join(
            f'<tr><td style="padding:6px 16px 6px 0;color:#6b7280;font-size:14px;vertical-align:top;white-space:nowrap;">{_esc(h)}</td>'
            f'<td style="padding:6px 0;font-size:14px;color:#111827;">{"<br>".join(_esc(l) for l in lines)}</td></tr>'
            for h, lines in sections)
        cta_url = f'{SIS_URL}/people'
        html = f"""
        <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Registration</p>
          <h2 style="margin:0 0 16px;font-size:18px;">{_esc(parent_name)} finished registering with {_esc(org_name)}</h2>
          <table style="border-collapse:collapse;">{rows_html}</table>
          <p style="margin-top:20px;"><a href="{cta_url}"
             style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">Open in SIS</a></p>
        </div>
        """.strip()
        text = f'{parent_name} finished registering with {org_name}\n\n' + '\n\n'.join(
            f'{h}\n' + '\n'.join(lines) for h, lines in sections) + f'\n\n{cta_url}'
        # A staff notice, not a message to a family: no support copy either way.
        ok = email_service.send_email(to_email=to[0], cc=to[1:], subject=subject,
                                      html_body=html, text_body=text, support_copy=False)
        logger.info(f"[registration alert] registration {reg.get('id')} -> {len(to)} recipient(s), sent={ok}")
        return bool(ok)
    except Exception as e:  # noqa: BLE001 -- the registration is already complete; never fail it for mail
        logger.warning(f"[registration alert] failed for registration {reg.get('id')}: {e}")
        return False
