"""
Google Calendar booking poll: the "scheduled a video chat" conversion trigger
(docs/CRM_REPLACEMENT_PLAN.md §D).

The booking links in email copy are Google appointment-schedule URLs that land
events on the owner's personal calendar — nothing ever told the platform. This
poll makes that observable without touching the links: a service account the
calendar is shared with ("See all event details") lists recent events, and any
attendee email that matches an active lead converts it.

Unconfigured (no GOOGLE_CALENDAR_SA_KEY_B64 / GOOGLE_CALENDAR_ID) the poll is
a logged no-op, so the code can ship ahead of the GCP setup.

Idempotency is the (gcal_event_id, attendee_email) unique key on
crm_calendar_bookings. A booked-then-cancelled chat keeps its conversion —
booking proved the intent (decisive call in the plan; revisit if wrong).

Incremental sync via Google's syncToken (persisted in crm_settings); on a
410 GONE (or a 400, which means the token or its parameter pairing is
unusable) we drop the token and resync the last 7 days. Note that a
syncToken request takes a DIFFERENT parameter set from a full one — see
_list_events.
"""
import base64
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import requests
from postgrest.exceptions import APIError

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
REQUEST_TIMEOUT = 15
RESYNC_WINDOW_DAYS = 7
SYNC_TOKEN_KEY = 'calendar_sync_token'


def _db():
    from database import get_supabase_admin_client
    # admin client justified: CRM tables are service-role only; the poll runs
    # from cron with no user session.
    return get_supabase_admin_client()


def _access_token() -> Optional[str]:
    """OAuth2 access token for the service account (calendar.readonly)."""
    key_b64 = Config.GOOGLE_CALENDAR_SA_KEY_B64
    if not key_b64:
        return None
    try:
        info = json.loads(base64.b64decode(key_b64))
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request as GoogleRequest
        credentials = service_account.Credentials.from_service_account_info(
            info, scopes=['https://www.googleapis.com/auth/calendar.readonly'])
        credentials.refresh(GoogleRequest())
        return credentials.token
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM calendar poll: service-account auth failed: {e}')
        return None


def _list_events(token: str, calendar_id: str, sync_token: Optional[str]):
    """Yields (events, next_sync_token). Raises _StaleSyncToken on 410/400.

    An incremental (syncToken) request and a full request take DIFFERENT
    parameters: Google rejects `showDeleted=false` alongside a syncToken
    outright ("it is not allowed to set showDeleted to False"), and rejects
    timeMin the same way. Sending the full-sync parameter set with a
    syncToken is a 400 on every call — which is how this poll sat wedged
    from 2026-08-23 to 2026-09-03, succeeding once (no token) and 400ing
    forever after. Cancelled events are filtered by the caller instead.
    """
    params: Dict[str, Any] = {'maxResults': 250, 'singleEvents': True}
    if sync_token:
        params['syncToken'] = sync_token
    else:
        params['showDeleted'] = False
        params['timeMin'] = (datetime.now(timezone.utc)
                             - timedelta(days=RESYNC_WINDOW_DAYS)).isoformat()
    events = []
    page_token = None
    while True:
        if page_token:
            params['pageToken'] = page_token
        resp = requests.get(
            f'{CALENDAR_API}/calendars/{calendar_id}/events',
            headers={'Authorization': f'Bearer {token}'},
            params=params, timeout=REQUEST_TIMEOUT,
        )
        # 410 is the documented "your token is stale" signal. A 400 on a
        # token request means the token (or the params we paired with it)
        # is unusable — also recoverable by resyncing, and treating it as
        # fatal is what turned one bad request into eleven silent days.
        if resp.status_code == 410 or (resp.status_code == 400 and sync_token):
            raise _StaleSyncToken()
        resp.raise_for_status()
        body = resp.json()
        events.extend(body.get('items') or [])
        page_token = body.get('nextPageToken')
        if not page_token:
            return events, body.get('nextSyncToken')


class _StaleSyncToken(Exception):
    pass


def run_poll() -> Dict[str, Any]:
    """One poll pass. Returns a summary dict for the cron log."""
    calendar_id = Config.GOOGLE_CALENDAR_ID
    if not calendar_id or not Config.GOOGLE_CALENDAR_SA_KEY_B64:
        return {'skipped': 'calendar_not_configured', 'converted': 0}
    token = _access_token()
    if not token:
        return {'skipped': 'auth_failed', 'converted': 0}

    db = _db()
    stored = (db.table('crm_settings').select('value')
              .eq('key', SYNC_TOKEN_KEY).limit(1).execute()).data
    sync_token = stored[0]['value'] if stored else None
    if isinstance(sync_token, dict):
        sync_token = sync_token.get('token')

    try:
        try:
            events, next_sync_token = _list_events(token, calendar_id, sync_token)
        except _StaleSyncToken:
            logger.info('CRM calendar poll: sync token rejected; full resync')
            events, next_sync_token = _list_events(token, calendar_id, None)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM calendar poll: events.list failed: {e}')
        return {'skipped': 'list_failed', 'converted': 0}

    from services.crm_service import mark_converted
    owner = (calendar_id or '').lower()
    matched = converted = 0
    for event in events:
        # Incremental syncs always carry deletions; a cancelled event is not
        # a new booking (an already-recorded one keeps its conversion — the
        # intent was proven when they booked).
        if event.get('status') == 'cancelled':
            continue
        event_id = event.get('id')
        start = (event.get('start') or {}).get('dateTime') or (event.get('start') or {}).get('date')
        for attendee in (event.get('attendees') or []):
            email = (attendee.get('email') or '').lower().strip()
            if not email or email == owner or attendee.get('resource'):
                continue
            lead_rows = (db.table('crm_leads').select('id, email')
                         .eq('email', email).limit(1).execute()).data
            if not lead_rows:
                continue
            matched += 1
            try:
                db.table('crm_calendar_bookings').insert({
                    'gcal_event_id': event_id, 'attendee_email': email,
                    'event_start': start, 'matched_lead_id': lead_rows[0]['id'],
                }).execute()
            except APIError as _exc:
                logger.debug("CRM booking insert failed: %s", _exc, exc_info=True)
                continue
            mark_converted(email, event='video_chat_scheduled')
            try:
                db.table('crm_events').insert({
                    'lead_id': lead_rows[0]['id'], 'event_type': 'booking_matched',
                    'detail': {'gcal_event_id': event_id, 'event_start': start},
                }).execute()
            except Exception as e:  # noqa: BLE001
                logger.warning(f'CRM calendar poll: event write failed: {e}')
            converted += 1

    if next_sync_token:
        db.table('crm_settings').upsert({
            'key': SYNC_TOKEN_KEY, 'value': {'token': next_sync_token},
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }).execute()

    result = {'events_seen': len(events), 'attendees_matched': matched,
              'converted': converted}
    logger.info(f'CRM calendar poll: {result}')
    return result
