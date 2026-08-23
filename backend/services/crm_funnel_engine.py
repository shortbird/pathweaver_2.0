"""
CRM funnel engine: the scheduled-send sweep (docs/CRM_REPLACEMENT_PLAN.md §B).

Dispatched by the Render cron every ~10 minutes via
POST /api/crm/internal/funnel-sweep. Design properties, in order of
importance:

  AT-MOST-ONCE. A crm_sends row with UNIQUE(membership_id, step_id) is
  INSERTed as a 'sending' claim BEFORE the SendGrid call; a unique violation
  means another run owns that send. A crash between claim and send leaves a
  'sending' row that a later sweep flips to 'failed' and NEVER retries —
  a dropped marketing email is a shrug, a double send is a spam report.

  SEND WINDOW. Outside crm_settings.send_window (default 09:00-19:00
  America/Denver) the sweep no-ops. Delay math never needs to know about
  windows; a due send just waits for the next in-window run.

  BACKLOG THROTTLE. A membership gets at most one send per 20 hours, so an
  outage backlog drains one email per day instead of bursting six.

  COMPLIANCE GATE. Marketing sends refuse to go out while
  crm_settings.postal_address is missing (CAN-SPAM), and every send carries
  the footer (unsubscribe link + postal address) plus RFC 8058 one-click
  unsubscribe headers via email_service.send_crm_email.

Delays count from funnel ENTRY (entered_at + step.delay_hours), matching the
documented cadences. `last_step_sent` is the highest step_order sent, so
deactivating or deleting a step naturally advances leads to the next
remaining one.
"""
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from markupsafe import escape
from postgrest.exceptions import APIError

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

STALE_CLAIM_HOURS = 1
PER_LEAD_THROTTLE_HOURS = 20
DEFAULT_BATCH_CAP = 50

# The template variables step content may use. Rendering is deliberate,
# dumb token replacement — NOT Jinja — because the migrated marketing HTML
# is arbitrary third-party markup (CSS braces, stray {{ tokens}}) that a real
# template engine would choke on or mangle. Unknown tokens pass through
# untouched, where the editor's preview makes them visible.
_TOKEN_RE = {
    'first_name': re.compile(r'\{\{\s*first_name\s*\}\}'),
    'last_name': re.compile(r'\{\{\s*last_name\s*\}\}'),
    'email': re.compile(r'\{\{\s*email\s*\}\}'),
    'unsubscribe_url': re.compile(r'\{\{\s*unsubscribe_url\s*\}\}'),
}


def _db():
    from database import get_supabase_admin_client
    # admin client justified: CRM tables are service-role only; the sweep runs
    # from cron with no user session.
    return get_supabase_admin_client()


def _settings(db) -> Dict[str, Any]:
    rows = (db.table('crm_settings').select('key, value').execute()).data or []
    return {r['key']: r['value'] for r in rows}


def _in_send_window(settings: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    window = settings.get('send_window') or {}
    tz_name = window.get('tz', 'America/Denver')
    start_hour = int(window.get('start_hour', 9))
    end_hour = int(window.get('end_hour', 19))
    try:
        local = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo(tz_name))
    except Exception:  # noqa: BLE001  # unknown tz in settings: fail open to UTC
        local = now or datetime.now(timezone.utc)
    return start_hour <= local.hour < end_hour


def render_step_content(text: str, lead: Dict[str, Any], unsubscribe_url: str) -> str:
    """Substitute the known template variables. Values are HTML-escaped (lead
    names are user input landing inside our HTML)."""
    result = text
    result = _TOKEN_RE['first_name'].sub(str(escape(lead.get('first_name') or 'there')), result)
    result = _TOKEN_RE['last_name'].sub(str(escape(lead.get('last_name') or '')), result)
    result = _TOKEN_RE['email'].sub(str(escape(lead.get('email') or '')), result)
    result = _TOKEN_RE['unsubscribe_url'].sub(unsubscribe_url, result)
    return result


def _marketing_footer(unsubscribe_url: str, postal_address: str) -> str:
    return (
        '<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;'
        'font-size:12px;color:#6b7280;text-align:center;">'
        f'<p style="margin:0 0 6px;">Optio &middot; {escape(postal_address)}</p>'
        f'<p style="margin:0;"><a href="{unsubscribe_url}" '
        'style="color:#6b7280;text-decoration:underline;">Unsubscribe</a> '
        'from these emails.</p></div>'
    )


def _with_footer(html: str, footer: str) -> str:
    """Inject the compliance footer inside <body> when there is one, else
    append (same body-aware trick the [COPY] banner uses)."""
    close = re.search(r'</body>', html, re.IGNORECASE)
    if close:
        i = close.start()
        return html[:i] + footer + html[i:]
    return html + footer


def _unsubscribe_url(token: str) -> str:
    base = (Config.BACKEND_URL or 'https://api.optioeducation.com').rstrip('/')
    return f'{base}/api/crm/unsubscribe?token={token}'


def _fail_stale_claims(db):
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=STALE_CLAIM_HOURS)).isoformat()
    try:
        db.table('crm_sends').update({
            'status': 'failed',
            'error': 'stale sending claim (crashed mid-send); never retried',
        }).eq('status', 'sending').lt('created_at', cutoff).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM sweep: stale-claim cleanup failed: {e}')


def _parse_ts(value: str) -> datetime:
    ts = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


def run_sweep(now: Optional[datetime] = None) -> Dict[str, Any]:
    """One sweep pass. Returns a summary dict for the cron log."""
    db = _db()
    now = now or datetime.now(timezone.utc)
    settings = _settings(db)

    _fail_stale_claims(db)

    if not _in_send_window(settings, now):
        return {'skipped': 'outside_send_window', 'sent': 0}
    postal_address = (settings.get('postal_address') or '')
    if isinstance(postal_address, dict):
        postal_address = postal_address.get('text', '')
    if not str(postal_address).strip():
        logger.warning('CRM sweep: no postal_address configured; refusing to send '
                       'marketing email (CAN-SPAM). Set crm_settings.postal_address.')
        return {'skipped': 'postal_address_missing', 'sent': 0}
    batch_cap = int(settings.get('sweep_batch_cap') or DEFAULT_BATCH_CAP)

    funnels = (db.table('crm_funnels').select('*')
               .eq('status', 'active').execute()).data or []
    if not funnels:
        return {'skipped': 'no_active_funnels', 'sent': 0}
    funnel_by_id = {f['id']: f for f in funnels}

    steps = (db.table('crm_funnel_steps').select('*')
             .in_('funnel_id', list(funnel_by_id)).eq('is_active', True)
             .order('step_order').execute()).data or []
    steps_by_funnel: Dict[str, List[Dict[str, Any]]] = {}
    for s in steps:
        steps_by_funnel.setdefault(s['funnel_id'], []).append(s)

    from utils.db_fetch import fetch_all_rows
    memberships = fetch_all_rows(lambda: (
        db.table('crm_funnel_memberships')
        .select('*, crm_leads(*)')
        .in_('funnel_id', list(funnel_by_id)).eq('status', 'active')
    ))

    from services.crm_service import is_suppressed, mark_converted
    from services.email_service import email_service

    sent = failed = skipped = 0
    for membership in memberships:
        if sent >= batch_cap:
            break
        lead = membership.get('crm_leads') or {}
        funnel = funnel_by_id.get(membership['funnel_id'])
        if not lead or not funnel:
            continue

        remaining = [s for s in steps_by_funnel.get(funnel['id'], [])
                     if s['step_order'] > (membership.get('last_step_sent') or 0)]
        if not remaining:
            _complete_membership(db, membership)
            continue
        step = remaining[0]

        entered_at = _parse_ts(membership['entered_at'])
        if entered_at + timedelta(hours=step['delay_hours']) > now:
            continue
        last_sent_at = membership.get('last_sent_at')
        if last_sent_at and _parse_ts(last_sent_at) + timedelta(hours=PER_LEAD_THROTTLE_HOURS) > now:
            continue

        # Pre-send gates. The users-row check is the safety net that catches
        # any conversion a hook missed: an account holder is a customer, not
        # a lead, whatever the funnel thinks.
        if lead.get('status') != 'active':
            _exit_membership(db, membership, f"lead_{lead.get('status')}")
            continue
        if is_suppressed(lead['email']):
            _exit_membership(db, membership, 'suppressed')
            continue
        try:
            has_account = bool((db.table('users').select('id')
                                .ilike('email', lead['email']).limit(1).execute()).data)
        except Exception:  # noqa: BLE001
            has_account = False
        if has_account and funnel.get('funnel_type') == 'nurture':
            mark_converted(lead['email'], event='account_signup')
            skipped += 1
            continue

        # Claim before send: at-most-once.
        try:
            claim = (db.table('crm_sends').insert({
                'membership_id': membership['id'], 'lead_id': lead['id'],
                'funnel_id': funnel['id'], 'step_id': step['id'],
                'email': lead['email'], 'subject': step['subject'],
                'status': 'sending',
            }).execute()).data[0]
        except APIError:
            skipped += 1  # another run owns this send (or it already happened)
            continue

        unsubscribe_url = _unsubscribe_url(lead['unsubscribe_token'])
        footer = _marketing_footer(unsubscribe_url, str(postal_address))
        html = _with_footer(
            render_step_content(step['html_body'], lead, unsubscribe_url), footer)
        subject = render_step_content(step['subject'], lead, unsubscribe_url)
        text = (render_step_content(step['text_body'], lead, unsubscribe_url)
                if step.get('text_body') else None)

        message_id = email_service.send_crm_email(
            to_email=lead['email'], subject=subject, html_body=html,
            text_body=text, funnel_key=funnel['key'],
            unsubscribe_url=unsubscribe_url,
            send_id=claim['id'], lead_id=lead['id'],
        )

        if message_id is None:
            db.table('crm_sends').update({
                'status': 'failed', 'error': 'provider send failed',
            }).eq('id', claim['id']).execute()
            failed += 1
            continue

        now_iso = datetime.now(timezone.utc).isoformat()
        db.table('crm_sends').update({
            'status': 'sent', 'provider_message_id': message_id, 'sent_at': now_iso,
        }).eq('id', claim['id']).execute()
        is_last = step['step_order'] >= remaining[-1]['step_order']
        membership_update = {
            'last_step_sent': step['step_order'], 'last_sent_at': now_iso,
        }
        if is_last:
            membership_update.update({'status': 'completed', 'exited_at': now_iso})
        db.table('crm_funnel_memberships').update(membership_update) \
            .eq('id', membership['id']).execute()
        try:
            db.table('crm_events').insert({
                'lead_id': lead['id'], 'event_type': 'step_sent',
                'detail': {'funnel_key': funnel['key'], 'step_order': step['step_order'],
                           'step_name': step['name'], 'subject': subject},
            }).execute()
        except Exception as e:  # noqa: BLE001
            logger.warning(f'CRM sweep: event write failed: {e}')
        sent += 1

    result = {'sent': sent, 'failed': failed, 'skipped': skipped,
              'memberships_scanned': len(memberships)}
    logger.info(f'CRM sweep: {result}')
    return result


def _complete_membership(db, membership):
    db.table('crm_funnel_memberships').update({
        'status': 'completed',
        'exited_at': datetime.now(timezone.utc).isoformat(),
    }).eq('id', membership['id']).execute()


def _exit_membership(db, membership, reason: str):
    db.table('crm_funnel_memberships').update({
        'status': 'exited', 'exit_reason': reason,
        'exited_at': datetime.now(timezone.utc).isoformat(),
    }).eq('id', membership['id']).execute()


def unsubscribe_by_token(token: str) -> bool:
    """Unsubscribe flow shared by the GET-confirm page and the RFC 8058
    one-click POST: suppress the address, mark the lead, exit any active
    membership. Returns False for an unknown token."""
    db = _db()
    rows = (db.table('crm_leads').select('*')
            .eq('unsubscribe_token', token).limit(1).execute()).data
    if not rows:
        return False
    lead = rows[0]
    try:
        db.table('crm_suppressions').insert({
            'email': lead['email'], 'reason': 'unsubscribe', 'source': 'unsubscribe_link',
        }).execute()
    except APIError:
        pass  # already suppressed
    if lead.get('status') != 'converted':
        db.table('crm_leads').update({
            'status': 'unsubscribed',
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }).eq('id', lead['id']).execute()
    memberships = (db.table('crm_funnel_memberships').select('id')
                   .eq('lead_id', lead['id']).eq('status', 'active').execute()).data or []
    for m in memberships:
        _exit_membership(db, m, 'unsubscribed')
    try:
        db.table('crm_events').insert({
            'lead_id': lead['id'], 'event_type': 'unsubscribed', 'detail': {},
        }).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM unsubscribe: event write failed: {e}')
    logger.info('CRM lead unsubscribed')
    return True
