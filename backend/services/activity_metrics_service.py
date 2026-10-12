"""
Activity metrics: who is using Optio, school by school, and who cannot get in.

Read by two dashboards that ask the same questions at different heights:

- the superadmin home (routes/admin/platform_metrics.py): every organization
  side by side, the credit/CRM/ticket queues, and everyone stuck at sign-in;
- the SIS School Dashboard (services/sis_dashboard_service.py): one school's
  students and families this week against last, per class, the students
  gone quiet, and that school's people stuck at sign-in.

The counting lives in SQL functions (supabase/migrations/
20261012200000_activity_dashboards.sql) because user_activity_events grows
with the platform and PostgREST truncates at 1,000 rows without saying so.
This module calls them through ActivityMetricsRepository, caches the
expensive ones, and shapes the sign-in list, whose source table is small and
keyed by email.

The platform-wide reads are cached for CACHE_TTL: the 90-day org read scans
~150k events (2.9s on 2026-10-12), and the home page is opened far more often
than those numbers move.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app_config import Config
from repositories.activity_metrics_repository import ActivityMetricsRepository
from utils import cache
from utils.logger import get_logger

logger = get_logger(__name__)

CACHE_TTL = 5 * 60

# How recent a failed attempt must be to count as "cannot sign in now", and
# how many failures in a row. A successful sign-in zeroes attempt_count
# (routes/auth/login/security.reset_login_attempts), so a non-zero count means
# nobody has signed in to that email since. One failure is usually a typo the
# person fixed with Google or Apple sign-in, which does not reset the count.
SIGN_IN_WINDOW_DAYS = 7
SIGN_IN_MIN_FAILURES = 2

# The lockout threshold routes/auth/login/security.py reads, from the same
# Config value, so "was locked out" here and the lockout the person saw agree.
MAX_LOGIN_ATTEMPTS = Config.RATE_LIMIT_LOGIN_ATTEMPTS


def _repo() -> ActivityMetricsRepository:
    # admin client justified: superadmin-only and SIS-admin-only reads that
    #   aggregate across every user in the platform or school; the functions
    #   and login_attempts are service-role only. The routes' role and org
    #   gates are the authorization.
    from utils.admin_client import admin_client
    return ActivityMetricsRepository(client=admin_client())


def clamp_days(days: Any, default: int) -> int:
    try:
        n = int(days)
    except (TypeError, ValueError):
        n = default
    return min(max(n, 1), 90)


def org_activity(days: int = 30) -> List[Dict[str, Any]]:
    """One row per organization (plus "No organization") for the window."""
    days = clamp_days(days, 30)
    key = f'activity:orgs:{days}'
    cached = cache.get(key)
    if cached is not None:
        return cached
    rows = _repo().org_activity(days)
    cache.set(key, rows, CACHE_TTL)
    return rows


def platform_pipelines(days: int = 30) -> Dict[str, Any]:
    """Credit review, CRM and ticket queues as one object."""
    days = clamp_days(days, 30)
    key = f'activity:pipelines:{days}'
    cached = cache.get(key)
    if cached is not None:
        return cached
    data = _repo().platform_pipelines(days)
    cache.set(key, data, CACHE_TTL)
    return data


def school_activity(org_id: str, days: int = 7) -> Dict[str, Any]:
    """One school's activity: students and parents, per class, quiet students.

    Not cached: it is scoped to one org and cheap (one org's events), and an
    admin who just nudged a quiet student should see the list move.
    """
    days = clamp_days(days, 7)
    return _repo().school_activity(org_id, days)


def _parse(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(str(ts).replace('Z', '+00:00'))
    except ValueError:
        return None
    # login_attempts stores naive UTC (timestamp without time zone).
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _display_name(u: Dict[str, Any]) -> str:
    full = ' '.join(p for p in (u.get('first_name'), u.get('last_name')) if p).strip()
    return full or u.get('display_name') or u.get('email') or ''


def _effective_role(u: Dict[str, Any]) -> Optional[str]:
    return u.get('org_role') if u.get('role') == 'org_managed' else u.get('role')


def sign_in_trouble(org_id: Optional[str] = None,
                    now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """People whose recent sign-ins keep failing, newest first.

    org_id=None is the superadmin view: every email, including ones with no
    account (a typo a family keeps retyping is something to fix too). With an
    org_id, only that school's members, and never an unmatched email -- an
    address with no account belongs to no school.
    """
    repo = _repo()
    now = now or datetime.now(timezone.utc)
    since = (now - timedelta(days=SIGN_IN_WINDOW_DAYS)).replace(tzinfo=None).isoformat()
    attempts = repo.failing_logins(since, SIGN_IN_MIN_FAILURES)
    if not attempts:
        return []

    emails = sorted({(a.get('email') or '').lower() for a in attempts if a.get('email')})
    users = repo.users_by_email(emails)
    by_email = {(u.get('email') or '').lower(): u for u in users}

    # The school view never asks for other schools' names; the superadmin
    # view has no use for households.
    org_names: Dict[str, str] = {}
    households: Dict[str, str] = {}
    if org_id is None:
        org_names = repo.org_names(sorted({u['organization_id'] for u in users
                                           if u.get('organization_id')}))
    else:
        households = repo.households_for([u['id'] for u in users
                                          if u.get('organization_id') == org_id])

    out = []
    for a in attempts:
        email = (a.get('email') or '').lower()
        u = by_email.get(email)
        if org_id is not None and (not u or u.get('organization_id') != org_id):
            continue
        locked_until = _parse(a.get('locked_until'))
        last = _parse(a.get('updated_at'))
        out.append({
            'email': email,
            'user_id': u.get('id') if u else None,
            'name': _display_name(u) if u else None,
            'role': _effective_role(u) if u else None,
            'organization_id': u.get('organization_id') if u else None,
            'organization_name': org_names.get(u.get('organization_id')) if u else None,
            'household_id': households.get(u.get('id')) if u else None,
            'failures': a.get('attempt_count') or 0,
            # Locked right now, or failed often enough to have been locked in
            # the window even if that lockout has since run out.
            'locked': bool(locked_until and locked_until > now),
            'was_locked': (a.get('attempt_count') or 0) >= MAX_LOGIN_ATTEMPTS,
            'lockouts': a.get('lockout_count') or 0,
            # Sent with its zone: the column is naive UTC, and a browser
            # reading it bare would place it in its own timezone.
            'last_attempt': last.isoformat() if last else None,
            'has_account': bool(u),
        })
    return out


def accounts_created(days: int) -> Dict[str, int]:
    """The sign-up funnel's last stage, from our table rather than GA:
    accounts made in the window, split by who they belong to. Schools create
    most accounts (181 of 210 in the 30 days to 2026-10-12), and those never
    pass through the marketing site, so the funnel reads only the independent
    ones and names the school-made ones beside it.
    """
    days = clamp_days(days, 30)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    total, school = _repo().accounts_created(since)
    return {'accounts_independent': total - school, 'accounts_school': school}
