"""
The School Dashboard — the org admin's landing view of the SIS console.

The dashboard this replaces was a census: total students, families, enrollment
status. All true, none of it actionable. An admin opening the console in the
morning wants to know what is waiting on them — who is unaccounted for, which
requests nobody has picked up, which paperwork is unsigned, who is on the
waitlist, which invoices are overdue — and every one of those queues already
existed behind its own page. This module asks them all at once.

Four rules shape it:

1. **Counts, not rows.** Nothing here is a list the admin reads; it is a set of
   numbers with a door next to each. `count='exact'` wherever the underlying
   service doesn't already return a bounded, hydrated list — a dashboard that
   tallies fetched rows starts lying at 1000 (CLAUDE.md row limits).

2. **Every source fails alone.** A dashboard is a fan-out over a dozen
   subsystems; one of them being broken must cost its own tile, not the page.
   Each source runs inside `_safe`, and one that raises falls back to its
   default — the frontend renders nothing for it and the rest still loads.

3. **The role gate is here, not in the browser.** `/api/sis/dashboard` is
   ADMIN_ROLES, so a campus coordinator can call it even though the console
   routes them to their own dashboard. Finance is therefore *omitted from the
   payload* for anyone outside FINANCE_ROLES rather than hidden by the frontend,
   and signature counts are computed with the caller's HR visibility. See
   utils/sis_roles.py for why coordinators are the exception that makes this
   matter.

4. **The sources run in sequence, deliberately.** They are independent and a
   thread pool halves the wall clock, which is tempting on the page an admin
   opens most. Measured on real data (iCreate, 2026-08-14) it also breaks: the
   admin client is created per request (`g._admin_client`, see database.py) and
   fans out onto a cold connection pool, so 3-8 concurrent queries lose one or
   more sources to `[Errno 35] Resource temporarily unavailable` in **2 runs out
   of 5**. Sequential was 0 out of 5. A lost source is a queue that reads as
   empty when it is not, which on this page means an admin who never learns that
   three students are unaccounted for. 2.5s of honest numbers beats 1s of
   occasionally-blank ones — and most of that 2.5s is round-trip latency that
   production, sitting next to the database, does not pay.

   If you come back to this: pre-warming the pool is not the fix (the stampede
   is the concurrent TLS handshakes, not the first one), and neither is a lower
   worker count (3 failed as often as 8). It needs a client per worker thread,
   which is a change to the database layer, not to this file.

Hidden modules (`feature_flags.sis_settings.hidden_modules`) skip their queries
outright: an org that turned attendance off should not pay for the alert count,
and a tile for a page they can't open is worse than no tile. The settings block
is echoed back so the frontend filters with the same `sisModules.js` it uses for
the nav — one source of truth for what a module key means.
"""

from datetime import timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

from database import get_supabase_admin_client
from services import sis_service
from services import sis_attendance_service as attendance
from services import sis_coordinator_service as coordinator
from services import sis_forms_service as forms
from services import sis_onboarding_service as onboarding
from services.sis_staff_service import _org_now
from utils.logger import get_logger

logger = get_logger(__name__)

# Requests (sis_form_submissions) nobody has closed out yet.
OPEN_REQUEST_STATUSES = ('submitted', 'under_review', 'in_progress', 'waiting')

# How far ahead the "upcoming" list looks, and how much of it we send.
EVENT_WINDOW_DAYS = 7
MAX_EVENTS = 5
MAX_SCHEDULE = 6

# The queues, in the order the frontend reads them. A key MISSING from the
# payload means the org doesn't have that module, or that source failed; a key
# with 0 means the queue is genuinely empty. A tile is drawn only for a number
# we actually got — a source that fell over shows nothing rather than a zero,
# because "no attendance alerts" and "we couldn't ask" must never look alike.
ATTENTION_KEYS = (
    'attendance_alerts', 'requests_unassigned', 'requests_overdue',
    'signatures_pending', 'onboarding_incomplete', 'age_exceptions',
    'waitlist_waiting', 'prior_learning_pending', 'goals_pending',
    'students_no_family',
)


def _admin():
    return get_supabase_admin_client()


def _safe(source: str, build: Callable[[], Any], default: Any = None) -> Any:
    """Run one source; on failure log it and return `default`.

    The same shape sis_tasks_service uses for its three task sources, and for
    the same reason: the caller is assembling a page out of independent
    subsystems, and one bad subsystem should cost one tile.
    """
    try:
        return build()
    except Exception as e:  # noqa: BLE001
        logger.error(f'dashboard source {source} failed: {e}')
        return default


def _gather(jobs: Dict[str, Tuple[Callable[[], Any], Any]]) -> Dict[str, Any]:
    """Run every job; return {name: result or its default}. Sequential on
    purpose — see rule 4 in the module docstring before parallelizing this."""
    return {name: _safe(name, build, default) for name, (build, default) in jobs.items()}


def _count(table: str, org_id: str, **filters) -> int:
    """Exact row count from Postgres. Never len() of a fetched list."""
    q = _admin().table(table).select('id', count='exact').eq('organization_id', org_id)
    for col, value in filters.items():
        q = q.in_(col, value) if isinstance(value, (list, tuple)) else q.eq(col, value)
    return q.limit(1).execute().count or 0


def _org_settings(org_id: str) -> Dict[str, Any]:
    row = (_admin().table('organizations').select('id, name, slug, feature_flags')
           .eq('id', org_id).limit(1).execute()).data or []
    org = row[0] if row else {'id': org_id}
    settings = (org.get('feature_flags') or {}).get('sis_settings') or {}
    return {
        'organization': {'id': org.get('id', org_id), 'name': org.get('name'),
                         'slug': org.get('slug')},
        'settings': settings,
    }


def _hidden_modules(settings: Dict[str, Any]) -> set:
    value = settings.get('hidden_modules')
    return set(value) if isinstance(value, list) else set()


# ── The individual sources ───────────────────────────────────────────────────

def _requests(org_id: str, today: Optional[str]) -> Dict[str, int]:
    """Staff requests split by what makes them somebody's problem: nobody has
    picked them up, or the date they were promised for has passed."""
    rows = [r for r in forms.list_all(org_id) if r.get('status') in OPEN_REQUEST_STATUSES]
    return {
        'requests_unassigned': len([r for r in rows if not r.get('assigned_to')]),
        'requests_overdue': len([r for r in rows if today and r.get('due_date')
                                 and str(r['due_date']) < today]),
    }


def _signatures_pending(org_id: str, include_hr: bool) -> int:
    """Unsigned recipients across every batch the caller is allowed to see.

    include_hr follows the caller: counting contracts a coordinator cannot open
    gives them a number they can never work down, and leaks how much employment
    paperwork is in flight.
    """
    return sum((b.get('total_count') or 0) - (b.get('signed_count') or 0)
               for b in onboarding.list_signature_batches(org_id, include_hr=include_hr))


def _onboarding_incomplete(org_id: str) -> int:
    return len([a for a in onboarding.list_assignments(org_id, kind='checklist')
                if (a.get('done_count') or 0) < (a.get('total_count') or 0)])


def _prior_learning_pending(org_id: str) -> Optional[int]:
    """The unreviewed half of the prior-learning queue, or None when the org
    hasn't opted in (mirroring the route's own server-side gate)."""
    from services import sis_prior_learning_service as prior
    if not prior.enabled_for_org(org_id):
        return None
    counts = prior.queue_counts(org_id)
    return sum(v for k, v in counts.items() if k in ('submitted', 'under_review'))


def _attendance_board(org_id: str, today: str) -> Dict[str, Any]:
    """Today's roll: recorded statuses, guardian-reported absences, open alerts.

    The coordinator dashboard's board, unchanged — an org admin is a superset of
    a coordinator, and there is no version of "how did the roll go today" that
    differs between them.
    """
    records = (_admin().table('sis_attendance')
               .select('student_user_id, status')
               .eq('organization_id', org_id).eq('date', today).execute()).data or []
    planned = (_admin().table('student_planned_absences')
               .select('id', count='exact')
               .eq('organization_id', org_id).eq('absence_date', today)
               .eq('status', 'active').limit(1).execute())
    return coordinator.board_from(records, planned.count or 0,
                                  attendance.open_alerts(org_id))


def _upcoming_events(org_id: str, now, sees_all_audiences: bool) -> List[Dict[str, Any]]:
    """The next week of school events.

    Audience gate mirrors GET /api/sis/events: admin-only events stay invisible
    to anyone who is not org_admin or superadmin.
    """
    rows = (_admin().table('sis_events')
            .select('id, title, start_at, end_at, all_day, location, audience, category')
            .eq('organization_id', org_id)
            .gte('start_at', now.isoformat())
            .lt('start_at', (now + timedelta(days=EVENT_WINDOW_DAYS)).isoformat())
            .order('start_at').limit(50).execute()).data or []
    if not sees_all_audiences:
        rows = [e for e in rows if (e.get('audience') or 'school') in ('school', 'teachers')]
    return rows[:MAX_EVENTS]


def _invoice_totals(org_id: str) -> Dict[str, Any]:
    from services import sis_billing_service as billing
    rows = billing.outstanding_invoices(org_id)
    overdue = [r for r in rows if (r.get('days_overdue') or 0) > 0]
    return {
        'open_count': len(rows),
        'overdue_count': len(overdue),
        'overdue_cents': sum(r.get('amount_due_cents') or 0 for r in overdue),
        'outstanding_cents': sum(r.get('amount_due_cents') or 0 for r in rows),
        # The oldest debt is the one worth chasing first.
        'max_days_overdue': max((r.get('days_overdue') or 0 for r in rows), default=0),
    }


# ── The fan-out ──────────────────────────────────────────────────────────────

def _build_jobs(org_id: str, *, hidden: set, settings: Dict[str, Any], now,
                sees_hr: bool, sees_all_audiences: bool,
                sees_finance: bool) -> Dict[str, Tuple[Callable[[], Any], Any]]:
    """Every source this caller's dashboard needs, as {name: (build, default)}.

    A source that isn't in here never runs and never appears in the payload —
    which is how a hidden module costs nothing rather than rendering a zero.

    Every count defaults to None, never 0: the default is what a FAILED source
    returns, and a queue that reports zero because the query fell over is a
    dashboard telling an admin there is no work when there is.
    """
    today = now.date().isoformat() if now else None
    dow = (now.weekday() + 1) % 7 if now else None  # 0=Sun..6=Sat (class_meetings)

    jobs: Dict[str, Tuple[Callable[[], Any], Any]] = {
        # The census the old dashboard was, kept whole and demoted to one row.
        'snapshot': (lambda: sis_service.get_dashboard(org_id), None),
        # Students in no family: a data-quality queue whose usual cause is a
        # duplicate registration. sis_service annotates each with its likely match.
        'students_no_family': (lambda: len(sis_service.unassigned_students(org_id)), None),
        # The Registration page's enrollment queues (no module key — never hidden).
        # In-flight sis_registrations are deliberately NOT counted: no console page
        # lists them, so the tile would be a number with nowhere to go.
        'age_exceptions': (lambda: _count('sis_age_exception_requests', org_id,
                                          status='pending'), None),
        'waitlist_waiting': (lambda: _count('sis_enrollment_waitlist', org_id,
                                            status='waiting'), None),
        'prior_learning_pending': (lambda: _prior_learning_pending(org_id), None),
    }

    if 'attendance' not in hidden:
        if today:
            # The board already counts the open alerts on its way past them, so
            # the tile reads that rather than asking a second time.
            jobs['board'] = (lambda: _attendance_board(org_id, today), None)
        else:
            jobs['attendance_alerts'] = (lambda: len(attendance.open_alerts(org_id)), None)

    # The Task Center is where an admin works requests, checklists and sent
    # paperwork, so all three follow the 'tasks' module.
    if 'tasks' not in hidden:
        jobs['requests'] = (lambda: _requests(org_id, today), None)
        jobs['signatures_pending'] = (lambda: _signatures_pending(org_id, sees_hr), None)
        jobs['onboarding_incomplete'] = (lambda: _onboarding_incomplete(org_id), None)

    # Goals replace schedule-building for goals-mode orgs only — the same
    # condition the sidebar uses to show the Goals tab at all.
    if settings.get('post_registration_flow') == 'goals':
        jobs['goals_pending'] = (lambda: _count('sis_student_goals', org_id,
                                                status='submitted'), None)

    if 'classes' not in hidden and dow is not None:
        jobs['schedule'] = (lambda: coordinator._today_org_schedule(
            org_id, dow, today)[:MAX_SCHEDULE], [])

    if 'calendar' not in hidden and now:
        jobs['events'] = (lambda: _upcoming_events(org_id, now, sees_all_audiences), [])

    if sees_finance and 'billing' not in hidden:
        from services import sis_tuition_service as tuition
        jobs['invoices'] = (lambda: _invoice_totals(org_id), None)
        jobs['tuition_queue'] = (lambda: tuition.pending_count(org_id), None)

    return jobs


def get_admin_dashboard(org_id: str, caller_id: str) -> Dict[str, Any]:
    """The School Dashboard payload for one admin looking at one org."""
    meta = _safe('org', lambda: _org_settings(org_id),
                 {'organization': {'id': org_id}, 'settings': {}}) or {}
    settings: Dict[str, Any] = meta.get('settings') or {}
    hidden = _hidden_modules(settings)

    roles = set(_safe('roles', lambda: sis_service.caller_org_roles(caller_id), []) or [])
    is_full_admin = bool(roles & {'org_admin', 'superadmin'})
    # HR visibility and finance visibility have the same membership today but
    # separate reasons (utils/sis_roles.py) — ask each question with its own name.
    sees_hr = is_full_admin
    sees_finance = _safe('finance_role',
                         lambda: sis_service.caller_sees_pay(caller_id), False)
    now = _safe('clock', lambda: _org_now(org_id))

    r = _gather(_build_jobs(org_id, hidden=hidden, settings=settings, now=now,
                            sees_hr=sees_hr, sees_all_audiences=is_full_admin,
                            sees_finance=sees_finance))

    # 'requests' is the one source answering two tiles; flatten it in with the
    # rest, and read the alert count off the board that already computed it. A
    # None — module hidden, org hasn't opted in, or the source failed — leaves
    # its key out entirely rather than claiming an empty queue.
    flat = {**r, **(r.get('requests') or {})}
    if r.get('board') and flat.get('attendance_alerts') is None:
        flat['attendance_alerts'] = r['board'].get('open_alert_count')
    attention = {k: flat[k] for k in ATTENTION_KEYS if flat.get(k) is not None}

    payload: Dict[str, Any] = {
        'organization': meta.get('organization') or {'id': org_id},
        'snapshot': r.get('snapshot'),
        'attention': attention,
        'today': {'date': now.date().isoformat() if now else None,
                  **({'schedule': r['schedule']} if 'schedule' in r else {}),
                  **({'attendance': r['board']} if 'board' in r else {})},
        'events': r.get('events') or [],
        # Echoed so the frontend filters tiles with the same sisModules.js that
        # filters the nav, instead of a second copy of the module map here.
        'settings': {
            'hidden_modules': sorted(hidden),
            'prior_learning_enabled': settings.get('prior_learning_enabled') is True,
            'post_registration_flow': settings.get('post_registration_flow'),
        },
    }
    if sees_finance:
        payload['finance'] = ({'invoices': r['invoices'], 'tuition_queue': r['tuition_queue']}
                              if 'invoices' in r else {})
    return payload
