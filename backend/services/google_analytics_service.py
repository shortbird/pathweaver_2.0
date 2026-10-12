"""
Google Analytics 4 reads for the superadmin home "Website traffic" cards.

The web platform and the marketing site both tag into one GA4 property
(services/googleAnalytics.js, marketing/src/data/site.ts), so a single
property answers "who is visiting, from where, and what do they open".
This module asks the GA4 Data API that question with a service account,
the same auth shape as crm_calendar_service: base64 of the SA's JSON key in
Config, an access token minted per call, plain requests against the REST
endpoint. No SDK, nothing new in requirements.

Unconfigured (no GOOGLE_ANALYTICS_SA_KEY_B64 / GA_PROPERTY_ID) the read
reports itself as such and the route tells the page to hide the section,
so the code ships ahead of the GA setup.

One batchRunReports call returns all five reports. The reply is cached for
CACHE_TTL seconds per window: the Data API is quota-metered per property
(tokens per hour and per day) and the home page is opened far more often
than traffic changes.
"""
import base64
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import requests

from app_config import Config
from utils import cache
from utils.logger import get_logger

logger = get_logger(__name__)

DATA_API = 'https://analyticsdata.googleapis.com/v1beta'
SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
REQUEST_TIMEOUT = 20
CACHE_TTL = 10 * 60
MAX_DAYS = 90

# Row caps for the ranked breakdowns: never more bars than a card can hold.
CHANNEL_LIMIT = 8
PAGE_LIMIT = 10


class GoogleAnalyticsError(RuntimeError):
    """The Data API refused or the reply was not the shape we asked for."""


def is_configured() -> bool:
    return bool(Config.GOOGLE_ANALYTICS_SA_KEY_B64 and Config.GA_PROPERTY_ID)


def _access_token() -> Optional[str]:
    """OAuth2 access token for the service account (analytics.readonly)."""
    key_b64 = Config.GOOGLE_ANALYTICS_SA_KEY_B64
    if not key_b64:
        return None
    try:
        info = json.loads(base64.b64decode(key_b64))
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request as GoogleRequest
        credentials = service_account.Credentials.from_service_account_info(
            info, scopes=[SCOPE])
        credentials.refresh(GoogleRequest())
        return credentials.token
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Google Analytics: service-account auth failed: {e}')
        return None


def _report(dimension: str, metrics: List[str], days: int,
            order_by: Optional[str] = None, limit: Optional[int] = None) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        'dateRanges': [{'startDate': f'{days - 1}daysAgo', 'endDate': 'today'}],
        'dimensions': [{'name': dimension}],
        'metrics': [{'name': m} for m in metrics],
    }
    if order_by:
        body['orderBys'] = [{'metric': {'metricName': order_by}, 'desc': True}]
    else:
        body['orderBys'] = [{'dimension': {'dimensionName': dimension}}]
    if limit:
        body['limit'] = limit
    return body


# The sign-up doors: self-registration, a school's enroll and join links, and
# a new school's setup link. A visitor who opens any of them meant to sign up.
SIGNUP_PATH_REGEX = r'^/(register|enroll|join|start-school)(/.*)?$'

# The web platform's host; every other host in the property is the marketing
# site (www, plus the apex that redirects to it).
APP_HOST_PREFIX = 'app.'


def _total(metric: str, days: int, dimension_filter: Dict[str, Any]) -> Dict[str, Any]:
    """One number for the window: no dimensions, so GA de-duplicates users
    across every page or host the filter matches (summing a per-page report
    would count a visitor who opened two sign-up pages twice)."""
    return {
        'dateRanges': [{'startDate': f'{days - 1}daysAgo', 'endDate': 'today'}],
        'metrics': [{'name': metric}],
        'dimensionFilter': dimension_filter,
    }


def _batch_run_reports(token: str, property_id: str, reports: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    try:
        resp = requests.post(
            f'{DATA_API}/properties/{property_id}:batchRunReports',
            headers={'Authorization': f'Bearer {token}'},
            json={'requests': reports},
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as e:
        raise GoogleAnalyticsError(f'GA4 Data API unreachable: {e}') from e
    if resp.status_code != 200:
        # The body names the real cause (API not enabled, no Viewer grant,
        # wrong property id); it goes to the log, never to the client.
        logger.error(f'Google Analytics: batchRunReports {resp.status_code}: {resp.text[:500]}')
        raise GoogleAnalyticsError(f'GA4 Data API returned {resp.status_code}')
    payload = resp.json()
    out = payload.get('reports')
    if not isinstance(out, list) or len(out) != len(reports):
        raise GoogleAnalyticsError('GA4 Data API reply did not match the request')
    return out


def _rows(report: Dict[str, Any]) -> List[Dict[str, Any]]:
    """[{dim: str, metrics: [int, ...]}] — GA sends every value as a string."""
    parsed = []
    for row in report.get('rows') or []:
        dims = row.get('dimensionValues') or [{}]
        mets = row.get('metricValues') or []
        parsed.append({
            'dim': str(dims[0].get('value', '')),
            'metrics': [_as_int(m.get('value')) for m in mets],
        })
    return parsed


def _as_int(value: Any) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def zero_fill_days(rows: List[Dict[str, Any]], days: int, today: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """One point per calendar day across the window, ascending.

    GA omits days with no traffic; a time axis fed those gaps would draw a
    line between distant dates and misstate when visits happened. The date
    dimension arrives as YYYYMMDD and leaves as ISO so the page shares the
    sibling charts' `day` axis.
    """
    by_day = {}
    for r in rows:
        raw = r['dim']
        if len(raw) == 8 and raw.isdigit():
            iso = f'{raw[:4]}-{raw[4:6]}-{raw[6:]}'
        else:
            iso = raw[:10]
        users, sessions = (r['metrics'] + [0, 0])[:2]
        by_day[iso] = {'users': users, 'sessions': sessions}

    end = (today or datetime.now(timezone.utc)).date()
    out = []
    for i in range(days - 1, -1, -1):
        day = (end - timedelta(days=i)).isoformat()
        point = by_day.get(day, {'users': 0, 'sessions': 0})
        out.append({'day': day, **point})
    return out


def _ranked(rows: List[Dict[str, Any]], name_key: str, value_key: str) -> List[Dict[str, Any]]:
    return [{name_key: r['dim'], value_key: (r['metrics'] + [0])[0]} for r in rows]


def _single(report: Dict[str, Any]) -> int:
    rows = _rows(report)
    return (rows[0]['metrics'] + [0])[0] if rows else 0


def parse_overview(reports: List[Dict[str, Any]], days: int, today: Optional[datetime] = None) -> Dict[str, Any]:
    """The batched reports, in request order, as the page's payload.

    The first three are the time series and the ranked breakdowns; the last two
    are the sign-up funnel's GA stages (marketing-site visitors, then visitors
    who opened a sign-up page). The funnel's last stage, accounts created, is
    ours, not GA's -- the route adds it from the users table.

    Five is GA's ceiling for one batchRunReports call. Sessions by host was the
    fifth until 2026-10-12: the property has two hosts, so it was a two-bar
    chart that said nothing the funnel's first stage does not.
    """
    daily, channels, pages = (_rows(r) for r in reports[:3])
    return {
        'days': zero_fill_days(daily, days, today),
        'channels': _ranked(channels, 'name', 'sessions'),
        'pages': _ranked(pages, 'path', 'views'),
        'funnel': {
            'site_visitors': _single(reports[3]) if len(reports) > 3 else 0,
            'signup_page_visitors': _single(reports[4]) if len(reports) > 4 else 0,
        },
    }


def _overview_reports(days: int) -> List[Dict[str, Any]]:
    return [
        _report('date', ['activeUsers', 'sessions'], days),
        _report('sessionDefaultChannelGroup', ['sessions'], days, order_by='sessions', limit=CHANNEL_LIMIT),
        _report('pagePath', ['screenPageViews'], days, order_by='screenPageViews', limit=PAGE_LIMIT),
        _total('activeUsers', days, {'notExpression': {'filter': {
            'fieldName': 'hostName',
            'stringFilter': {'matchType': 'BEGINS_WITH', 'value': APP_HOST_PREFIX}}}}),
        _total('activeUsers', days, {'filter': {
            'fieldName': 'pagePath',
            'stringFilter': {'matchType': 'FULL_REGEXP', 'value': SIGNUP_PATH_REGEX}}}),
    ]


def fetch_overview(days: int) -> Dict[str, Any]:
    """Daily visitors plus the channel, page and site breakdowns for the window.

    Raises GoogleAnalyticsError when unconfigured, when auth fails, or when
    the API refuses; the route turns that into a generic 502 and the page
    hides the section.
    """
    days = min(max(int(days), 1), MAX_DAYS)
    if not is_configured():
        raise GoogleAnalyticsError('Google Analytics is not configured')

    key = f'ga:overview:v2:{Config.GA_PROPERTY_ID}:{days}'  # v2: funnel replaced sites
    cached = cache.get(key)
    if cached is not None:
        return cached

    token = _access_token()
    if not token:
        raise GoogleAnalyticsError('Google Analytics service-account auth failed')

    reports = _batch_run_reports(token, str(Config.GA_PROPERTY_ID), _overview_reports(days))
    result = parse_overview(reports, days)
    result['period_days'] = days
    cache.set(key, result, CACHE_TTL)
    return result
