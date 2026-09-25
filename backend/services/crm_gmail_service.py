"""
The CRM's connected Gmail mailbox (docs/CRM_AI_ASSISTANT_PLAN.md).

Three jobs:

* **Connect.** tanner@optioeducation.com approves an Internal OAuth app once;
  the refresh token is stored in crm_mail_accounts (deny-all table), Fernet-
  encrypted when ORG_SECRETS_ENCRYPTION_KEY is set.
* **Sync.** Cron reads new mail through Gmail's history API and keeps only
  messages with a known contact on them. Everything else is never written.
* **Send.** `send_approved_draft` is the only function that sends, and only the
  superadmin send route calls it. Nothing scheduled may: the AI drafts, a
  person sends (test_crm_assistant.py (TestTheAiNeverSends) holds that line).

Gmail is spoken over plain REST with `requests`, like the calendar poll.
"""
import base64
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import getaddresses, parsedate_to_datetime
from html import unescape
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlencode

import requests

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
TOKEN_URL = 'https://oauth2.googleapis.com/token'
REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
SCOPES = ('https://www.googleapis.com/auth/gmail.readonly '
          'https://www.googleapis.com/auth/gmail.send')
REQUEST_TIMEOUT = 20

STATE_KEY = 'gmail_oauth_state'
STATE_TTL = timedelta(minutes=10)
# First connect reads this far back; a stale history id re-reads RESYNC_DAYS.
BACKFILL_QUERY = 'newer_than:90d -in:chats'
BACKFILL_CAP = 300
RESYNC_DAYS = 7
BODY_CAP = 20000
# Seconds one pass may spend reading messages. The cron dispatcher gives each
# job 120s; what is left over waits in PENDING_KEY for the next pass.
TIME_BUDGET = 60
PENDING_KEY = 'gmail_sync_pending'
# Mail between colleagues is not CRM activity.
INTERNAL_DOMAIN = 'optioeducation.com'
# Accounts whose mail is never stored: students and observers are not
# contacts, and minors must never land in a CRM.
NON_CONTACT_ROLES = ('student', 'observer')


# admin client justified: crm_* tables are service-role only; callers are the
# superadmin console routes and the cron-secret sync.
from utils.admin_client import admin_client as _db


def _repo():
    from repositories.crm_mail_repository import CrmMailRepository
    return CrmMailRepository(client=_db())


class GmailNotConfigured(Exception):
    pass


class GmailNotConnected(Exception):
    pass


class GmailSendError(Exception):
    pass


# ------------------------------------------------------------ token storage

def _seal(token: str) -> str:
    from utils.org_secrets import _encrypt
    return _encrypt(token)


def _unseal(stored: str) -> Optional[str]:
    from utils.org_secrets import _decrypt
    return _decrypt(stored, 'crm', 'gmail_refresh_token')


def is_configured() -> bool:
    return bool(Config.GMAIL_OAUTH_CLIENT_ID and Config.GMAIL_OAUTH_CLIENT_SECRET
                and Config.GMAIL_OAUTH_REDIRECT_URI.startswith('http'))


def _account() -> Optional[Dict[str, Any]]:
    return _repo().account()


def status() -> Dict[str, Any]:
    """What the console shows. Never includes the token."""
    account = _account()
    return {
        'configured': is_configured(),
        'connected': bool(account),
        'email': (account or {}).get('email'),
        'connected_at': (account or {}).get('connected_at'),
        'last_sync_at': (account or {}).get('last_sync_at'),
        'last_error': (account or {}).get('last_error'),
        'redirect_uri': Config.GMAIL_OAUTH_REDIRECT_URI,
    }


# ------------------------------------------------------------------ connect

def authorization_url(user_id: str) -> str:
    """Google's consent URL, with a single-use state tied to this admin."""
    if not is_configured():
        raise GmailNotConfigured()
    state = secrets.token_urlsafe(32)
    _repo().set_setting(STATE_KEY, {
        'state': state, 'user_id': user_id,
        'expires_at': (datetime.now(timezone.utc) + STATE_TTL).isoformat()})
    return AUTH_URL + '?' + urlencode({
        'client_id': Config.GMAIL_OAUTH_CLIENT_ID,
        'redirect_uri': Config.GMAIL_OAUTH_REDIRECT_URI,
        'response_type': 'code',
        'scope': SCOPES,
        'access_type': 'offline',
        # Without consent Google omits the refresh token on a reconnect.
        'prompt': 'consent',
        'include_granted_scopes': 'true',
        'state': state,
    })


def _consume_state(state: str) -> Optional[str]:
    """The admin who started the connect, or None. Single use either way."""
    repo = _repo()
    stored = repo.setting(STATE_KEY)
    repo.delete_setting(STATE_KEY)
    if not isinstance(stored, dict) or not state:
        return None
    if not secrets.compare_digest(str(stored.get('state') or ''), state):
        return None
    try:
        expires = datetime.fromisoformat(stored['expires_at'])
    except (KeyError, ValueError):
        return None
    if datetime.now(timezone.utc) > expires:
        return None
    return stored.get('user_id')


def complete_connect(code: str, state: str) -> str:
    """Exchange the code, store the mailbox, return its address.

    Raises ValueError with a person-readable reason on any failure.
    """
    user_id = _consume_state(state)
    if not user_id:
        raise ValueError('The connect link expired. Start again from the CRM.')
    resp = requests.post(TOKEN_URL, data={
        'code': code,
        'client_id': Config.GMAIL_OAUTH_CLIENT_ID,
        'client_secret': Config.GMAIL_OAUTH_CLIENT_SECRET,
        'redirect_uri': Config.GMAIL_OAUTH_REDIRECT_URI,
        'grant_type': 'authorization_code',
    }, timeout=REQUEST_TIMEOUT)
    if resp.status_code != 200:
        logger.warning(f'Gmail connect: token exchange failed {resp.status_code}: {resp.text[:300]}')
        raise ValueError('Google did not accept the sign-in. Try connecting again.')
    body = resp.json()
    refresh_token = body.get('refresh_token')
    if not refresh_token:
        raise ValueError('Google returned no offline access. Try connecting again.')
    granted = body.get('scope') or ''
    if 'gmail.send' not in granted or 'gmail.readonly' not in granted:
        raise ValueError('Both Gmail permissions are needed. Connect again and tick both boxes.')

    profile = _get(body['access_token'], '/profile')
    email = (profile.get('emailAddress') or '').lower()
    # One mailbox: a reconnect under another address replaces the old one,
    # and the old one's unread queue goes with it.
    _repo().replace_account(email, {
        'refresh_token': _seal(refresh_token),
        'scopes': granted,
        'history_id': None,
        'connected_by': user_id,
        'connected_at': datetime.now(timezone.utc).isoformat(),
        'last_error': None,
    })
    _set_pending([])
    return email


def disconnect() -> None:
    account = _account()
    if not account:
        return
    token = _unseal(account['refresh_token'])
    if token:
        try:
            requests.post(REVOKE_URL, params={'token': token}, timeout=REQUEST_TIMEOUT)
        except requests.RequestException as e:
            logger.warning(f'Gmail disconnect: revoke failed (row removed anyway): {e}')
    _repo().delete_account(account['id'])
    _set_pending([])


# --------------------------------------------------------------- transport

def _access_token(account: Dict[str, Any]) -> str:
    token = _unseal(account['refresh_token'])
    if not token:
        raise GmailNotConnected('refresh token unreadable')
    resp = requests.post(TOKEN_URL, data={
        'client_id': Config.GMAIL_OAUTH_CLIENT_ID,
        'client_secret': Config.GMAIL_OAUTH_CLIENT_SECRET,
        'refresh_token': token,
        'grant_type': 'refresh_token',
    }, timeout=REQUEST_TIMEOUT)
    if resp.status_code != 200:
        # invalid_grant = revoked or expired; the console says reconnect.
        _record_error(account, f'Google refused the stored sign-in ({resp.status_code}). Reconnect Gmail.')
        raise GmailNotConnected(resp.text[:200])
    return resp.json()['access_token']


def _get(token: str, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    resp = requests.get(f'{GMAIL_API}{path}', headers={'Authorization': f'Bearer {token}'},
                        params=params, timeout=REQUEST_TIMEOUT)
    if resp.status_code == 404:
        raise _NotFound(path)
    resp.raise_for_status()
    return resp.json()


class _NotFound(Exception):
    pass


def _record_error(account: Dict[str, Any], message: Optional[str]) -> None:
    try:
        _repo().update_account(account['id'], {'last_error': message})
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Gmail: could not record error: {e}')


# ------------------------------------------------------------------ parsing

def _headers(payload: Dict[str, Any]) -> Dict[str, str]:
    return {h['name'].lower(): h['value'] for h in (payload.get('headers') or [])}


def _addresses(value: Optional[str]) -> List[str]:
    return [addr.lower().strip() for _, addr in getaddresses([value or '']) if '@' in addr]


def _decode(data: str) -> str:
    return base64.urlsafe_b64decode(data + '=' * (-len(data) % 4)).decode('utf-8', 'replace')


def _html_to_text(html: str) -> str:
    html = re.sub(r'(?is)<(script|style).*?</\1>', ' ', html)
    html = re.sub(r'(?i)<br\s*/?>|</p>|</div>|</li>', '\n', html)
    text = unescape(re.sub(r'<[^>]+>', ' ', html))
    return re.sub(r'[ \t]+', ' ', re.sub(r'\n\s*\n+', '\n\n', text)).strip()


def _body_text(payload: Dict[str, Any]) -> str:
    """The plain-text body, else the HTML body flattened."""
    plain: List[str] = []
    html: List[str] = []

    def walk(part):
        mime = part.get('mimeType') or ''
        data = (part.get('body') or {}).get('data')
        if data and mime == 'text/plain':
            plain.append(_decode(data))
        elif data and mime == 'text/html':
            html.append(_decode(data))
        for child in part.get('parts') or []:
            walk(child)

    walk(payload)
    text = '\n'.join(plain) if plain else _html_to_text('\n'.join(html))
    return text[:BODY_CAP]


def _sent_at(message: Dict[str, Any], headers: Dict[str, str]) -> str:
    if message.get('internalDate'):
        return datetime.fromtimestamp(int(message['internalDate']) / 1000, timezone.utc).isoformat()
    try:
        return parsedate_to_datetime(headers.get('date', '')).astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        return datetime.now(timezone.utc).isoformat()


# ----------------------------------------------------------------- contacts

def known_contacts(addresses: Iterable[str], mailbox: str) -> List[str]:
    """The addresses that belong to a CRM contact.

    A contact is a lead, or a user who is not a student or observer.
    Colleagues and the mailbox itself never count.
    """
    candidates = sorted({a for a in addresses
                         if a and a != mailbox and not a.endswith('@' + INTERNAL_DOMAIN)})
    if not candidates:
        return []
    repo = _repo()
    found = set(repo.lead_emails(candidates))
    for row in repo.users_by_email(candidates):
        role = row.get('org_role') if row.get('role') == 'org_managed' else row.get('role')
        if role in NON_CONTACT_ROLES:
            # A lead row for the same address does not make a student a contact.
            found.discard((row.get('email') or '').lower())
            continue
        found.add((row.get('email') or '').lower())
    return sorted(found)


def _store(token: str, message_id: str, mailbox: str) -> bool:
    """Fetch one message and store it if a known contact is on it."""
    meta = _get(token, f'/messages/{message_id}', {
        'format': 'metadata', 'metadataHeaders': ['From', 'To', 'Cc']})
    labels = set(meta.get('labelIds') or [])
    if labels & {'SPAM', 'TRASH', 'DRAFT', 'CHAT'}:
        return False
    headers = _headers(meta.get('payload') or {})
    sender = (_addresses(headers.get('from')) or [''])[0]
    to_list = _addresses(headers.get('to'))
    cc_list = _addresses(headers.get('cc'))
    contacts = known_contacts([sender, *to_list, *cc_list], mailbox)
    if not contacts:
        return False

    full = _get(token, f'/messages/{message_id}', {'format': 'full'})
    payload = full.get('payload') or {}
    headers = _headers(payload)
    outbound = sender == mailbox or 'SENT' in labels
    row = {
        'gmail_message_id': full['id'],
        'thread_id': full.get('threadId') or full['id'],
        'rfc_message_id': headers.get('message-id'),
        'direction': 'outbound' if outbound else 'inbound',
        'from_email': sender,
        'to_emails': to_list,
        'cc_emails': cc_list,
        'contact_emails': contacts,
        'subject': (headers.get('subject') or '')[:500],
        'snippet': unescape(full.get('snippet') or '')[:500],
        'body_text': _body_text(payload),
        'sent_at': _sent_at(full, headers),
    }
    _repo().upsert_message(row)
    if not outbound:
        _on_inbound(row)
    return True


def _on_inbound(row: Dict[str, Any]) -> None:
    """A reply pauses the contact's funnel; see crm_assistant_service."""
    try:
        from services.crm_assistant_service import on_inbound_message
        on_inbound_message(row)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Gmail sync: inbound hook failed: {e}')


# --------------------------------------------------------------------- sync

def _list_ids(token: str, query: str, cap: int) -> List[str]:
    ids: List[str] = []
    page_token = None
    while len(ids) < cap:
        params = {'q': query, 'maxResults': min(100, cap - len(ids))}
        if page_token:
            params['pageToken'] = page_token
        body = _get(token, '/messages', params)
        ids.extend(m['id'] for m in body.get('messages') or [])
        page_token = body.get('nextPageToken')
        if not page_token:
            break
    return ids


def _history_ids(token: str, start: str) -> Tuple[List[str], Optional[str]]:
    ids: List[str] = []
    latest = None
    page_token = None
    while True:
        params = {'startHistoryId': start, 'historyTypes': 'messageAdded', 'maxResults': 500}
        if page_token:
            params['pageToken'] = page_token
        body = _get(token, '/history', params)
        for h in body.get('history') or []:
            for added in h.get('messagesAdded') or []:
                ids.append(added['message']['id'])
        latest = body.get('historyId') or latest
        page_token = body.get('nextPageToken')
        if not page_token:
            return ids, latest


def _pending() -> List[str]:
    value = _repo().setting(PENDING_KEY)
    return [str(v) for v in value] if isinstance(value, list) else []


def _set_pending(ids: List[str]) -> None:
    _repo().set_setting(PENDING_KEY, ids)


def run_sync() -> Dict[str, Any]:
    """One sync pass. Summary dict for the cron log."""
    if not is_configured():
        return {'skipped': 'not_configured'}
    account = _account()
    if not account:
        return {'skipped': 'not_connected'}
    try:
        token = _access_token(account)
    except GmailNotConnected:
        return {'skipped': 'auth_failed'}

    mailbox = account['email']
    mode = 'incremental'
    try:
        profile = _get(token, '/profile')
        if account.get('history_id'):
            try:
                ids, latest = _history_ids(token, account['history_id'])
            except _NotFound:
                mode = 'resync'
                ids = _list_ids(token, f'newer_than:{RESYNC_DAYS}d -in:chats', BACKFILL_CAP)
                latest = profile.get('historyId')
        else:
            mode = 'backfill'
            ids = _list_ids(token, BACKFILL_QUERY, BACKFILL_CAP)
            latest = profile.get('historyId')

        queue = list(dict.fromkeys(_pending() + ids))
        # Move the history pointer first: whatever arrives while this pass
        # works is picked up by the next one, and what this pass cannot
        # finish is saved as pending rather than lost.
        _repo().update_account(account['id'], {
            'history_id': latest or account.get('history_id')})
        _set_pending(queue)
        stored = 0
        started = time.monotonic()
        done = 0
        for message_id in queue:
            if time.monotonic() - started > TIME_BUDGET:
                break
            try:
                stored += _store(token, message_id, mailbox)
            except _NotFound:
                pass  # deleted between listing and reading
            except requests.HTTPError as e:
                # One unreadable message must not wedge the queue behind it.
                logger.warning(f'Gmail sync: skipped message {message_id}: {e}')
            done += 1
        _set_pending(queue[done:])
        _repo().update_account(account['id'], {
            'last_sync_at': datetime.now(timezone.utc).isoformat(), 'last_error': None})
    except requests.RequestException as e:
        _record_error(account, f'Sync failed: {e}'[:300])
        logger.warning(f'Gmail sync failed: {e}')
        return {'skipped': 'request_failed'}

    result = {'mode': mode, 'seen': len(ids), 'read': done, 'stored': stored,
              'pending': len(queue) - done}
    logger.info(f'Gmail sync: {result}')
    return result


# --------------------------------------------------------------------- send

def send_approved_draft(draft: Dict[str, Any], approved_by: str) -> Dict[str, Any]:
    """Send one draft a person just approved by clicking Send.

    ONLY the superadmin send route may call this. Returns the updated draft.
    """
    if draft.get('status') != 'draft':
        raise GmailSendError('This draft was already sent or discarded.')
    to_email = (draft.get('to_email') or '').strip()
    if '@' not in to_email:
        raise GmailSendError('The draft has no recipient.')
    if not (draft.get('body_text') or '').strip():
        raise GmailSendError('The draft is empty.')
    account = _account()
    if not account:
        raise GmailNotConnected()
    token = _access_token(account)

    # Claim before sending, so a double click or a second tab cannot send
    # the same draft twice: only one caller moves it out of 'draft'.
    repo = _repo()
    if not repo.claim_draft_for_send(draft['id']):
        raise GmailSendError('This draft is already being sent.')

    msg = EmailMessage()
    name = repo.display_name(approved_by)
    msg['From'] = f'{name} <{account["email"]}>' if name else account['email']
    msg['To'] = to_email
    msg['Subject'] = draft.get('subject') or ''
    if draft.get('in_reply_to'):
        msg['In-Reply-To'] = draft['in_reply_to']
        msg['References'] = draft['in_reply_to']
    msg.set_content(draft['body_text'])
    body: Dict[str, Any] = {'raw': base64.urlsafe_b64encode(msg.as_bytes()).decode()}
    if draft.get('thread_id'):
        body['threadId'] = draft['thread_id']

    try:
        resp = requests.post(f'{GMAIL_API}/messages/send',
                             headers={'Authorization': f'Bearer {token}'},
                             json=body, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        resp = None
        logger.warning(f'Gmail send request failed: {e}')
    if resp is None or resp.status_code != 200:
        if resp is not None:
            logger.warning(f'Gmail send failed {resp.status_code}: {resp.text[:300]}')
        repo.release_draft(draft['id'])
        raise GmailSendError('Gmail did not accept the message. Nothing was sent.')
    sent = resp.json()

    updated = repo.mark_draft_sent(draft['id'], sent.get('id'), approved_by)
    try:
        _store(token, sent['id'], account['email'])
    except Exception as e:  # noqa: BLE001
        # The next sync picks it up; the send itself succeeded.
        logger.warning(f'Gmail send: could not store the sent copy yet: {e}')
    return updated or draft
