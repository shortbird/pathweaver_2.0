"""
Who took the roll — the class session record behind "did the assigned teacher
teach this class, or did somebody cover it?" (P7, iCreate 2026-09-23).

iCreate's campus coordinators check who is in each room. The roll is the one
signal the platform already has for that, but sis_attendance overwrites its
recorded_by on every save, so it could not say who took a roll, only who last
touched it. A session (`sis_class_sessions`, one per class per day) keeps:

  - taken_by / taken_at: the FIRST person to save the roll. Later saves move
    last_saved_by / last_saved_at and never replace it.
  - substitute_id / sub_status: the "covered by" flag. A roll taken by someone
    who is not an assigned teacher of the class is 'flagged' until a
    coordinator says what happened (confirmed_sub, teacher_present, other).
  - planned_by: a substitute the office marked ahead of time. That person
    gets the class's roster and attendance for that date only
    (sis_service.class_scope with on_date) and the "take attendance" reminder.

This is also the record a later pay-from-attendance project will read; pay
itself is out of scope here (docs/icreate/PRESENCE_AND_PAY_DISCUSSION_2026-08-18.md).

Every write from the attendance save is best-effort: the roll itself must
never fail because its bookkeeping did. That also covers the window between
deploy and the migration, when the table does not exist yet.
"""

from datetime import date as _date, datetime
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple, cast

from repositories.sis_class_repository import SisClassRepository
from repositories.sis_class_session_repository import SisClassSessionRepository
from repositories.user_repository import UserRepository
from utils import class_membership, person_name
from utils.logger import get_logger
from utils.timestamps import now_iso as _now

logger = get_logger(__name__)


# admin client justified: the SIS console acts for the whole school — sessions
#   are backend-only under RLS, and the route's role+org gate (plus class_scope
#   for teachers) is the authorization
from utils.admin_client import admin_client as _admin


SUB_STATUSES = ('none', 'flagged', 'confirmed_sub', 'teacher_present', 'other')
# What a coordinator can decide about a flagged session.
RESOLUTIONS = ('confirmed_sub', 'teacher_present', 'other')

# "Classes whose meeting started more than N minutes ago with no roll taken."
# N lives in feature_flags.sis_settings.roll_check_minutes; 15 is the owner's
# default (2026-09-23). Clamped so a typo cannot hide every class all day.
ROLL_CHECK_SETTING = 'roll_check_minutes'
DEFAULT_ROLL_CHECK_MINUTES = 15
MAX_ROLL_CHECK_MINUTES = 240


def _repo() -> SisClassSessionRepository:
    return SisClassSessionRepository(client=_admin())


# ── Pure rules (unit-tested) ─────────────────────────────────────────────────

def derive_status(taken_by: Optional[str], teacher_ids: Iterable[str],
                  planned_sub: Optional[str]) -> Tuple[str, Optional[str]]:
    """(sub_status, substitute_id) for a session from who took the roll, who
    teaches the class, and who (if anyone) the office planned to cover it.

    - Nobody has taken the roll yet: nothing to check; a planned sub stays.
    - The planned substitute took it: that is the plan working, confirmed.
    - An assigned teacher took it while a substitute was planned: flagged, so
      the coordinator decides whether the sub was ever needed. The planned
      substitute stays named on the flag.
    - An assigned teacher took it and no sub was planned: the normal day.
    - Anybody else took it: flagged, and they are the presumed substitute.
    """
    teachers = set(teacher_ids or [])
    if not taken_by:
        return 'none', planned_sub
    if planned_sub and taken_by == planned_sub:
        return 'confirmed_sub', planned_sub
    if taken_by in teachers:
        return ('flagged', planned_sub) if planned_sub else ('none', None)
    return 'flagged', taken_by


def meeting_for_date(meetings: List[Dict[str, Any]], on_date: str) -> Optional[Dict[str, Any]]:
    """The class meeting a roll on `on_date` belongs to: a one-off meeting on
    that date wins over the weekly one, then the earliest start. None when the
    class does not meet that day (a roll can still be saved; the session then
    has no meeting)."""
    try:
        dow = (_date.fromisoformat(str(on_date)[:10]).weekday() + 1) % 7  # 0=Sun
    except (TypeError, ValueError):
        return None
    todays = [m for m in meetings or []
              if str(m.get('specific_date') or '')[:10] == str(on_date)[:10]
              or (m.get('specific_date') is None and m.get('day_of_week') == dow)]
    todays.sort(key=lambda m: (m.get('specific_date') is None, str(m.get('start_time') or '99:99')))
    return todays[0] if todays else None


def roll_check_minutes(settings: Optional[Dict[str, Any]]) -> int:
    raw: Any = (settings or {}).get(ROLL_CHECK_SETTING)
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_ROLL_CHECK_MINUTES
    return max(0, min(n, MAX_ROLL_CHECK_MINUTES))


def _minutes(t: Any) -> Optional[int]:
    parts = str(t or '').split(':')
    if len(parts) < 2:
        return None
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        return None


def overdue_rolls(schedule: List[Dict[str, Any]], taken_class_ids: Set[str],
                  now_minutes: int, grace: int) -> List[Dict[str, Any]]:
    """Today's classes whose meeting started more than `grace` minutes ago and
    have no roll. A class with nobody enrolled has no roll to take and is left
    out; so is a class that has not started yet."""
    out = []
    for m in schedule or []:
        start = _minutes(m.get('start_time'))
        if start is None or m.get('class_id') in taken_class_ids:
            continue
        if not m.get('enrolled_count'):
            continue
        if now_minutes - start > grace:
            out.append({**m, 'minutes_late': now_minutes - start})
    out.sort(key=lambda m: (str(m.get('start_time') or ''), m.get('class_name') or ''))
    return out


# ── Names ────────────────────────────────────────────────────────────────────

_PERSON_COLS = 'id, display_name, first_name, last_name, preferred_name, username, email'


def _users(user_ids: Iterable[Optional[str]], cols: str) -> Dict[str, Dict[str, Any]]:
    ids = sorted({u for u in user_ids if u})
    repo = UserRepository(client=_admin())
    out: Dict[str, Dict[str, Any]] = {}
    for i in range(0, len(ids), 100):
        out.update(repo.find_by_ids(ids[i:i + 100], select_fields=cols))
    return out


def _names(user_ids: Iterable[Optional[str]]) -> Dict[str, str]:
    """Best-effort: a failed name lookup shows a roll without its name rather
    than taking a dashboard down."""
    try:
        users = _users(user_ids, _PERSON_COLS)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'[class sessions] name lookup failed: {e}')
        return {}
    return {uid: person_name.full_name(u, 'Unknown') for uid, u in users.items()}


def _person_fields(session: Dict[str, Any]) -> List[Optional[str]]:
    return [session.get(k) for k in
            ('taken_by', 'last_saved_by', 'substitute_id', 'planned_by', 'confirmed_by')]


def describe(session: Optional[Dict[str, Any]], names: Dict[str, str]) -> Optional[Dict[str, Any]]:
    """The session as the UI reads it: ids plus the names that go with them."""
    if not session:
        return None
    def n(uid: Optional[str]) -> Optional[str]:
        return names.get(uid) if uid else None

    return {
        'id': session.get('id'),
        'class_id': session.get('class_id'),
        'date': str(session.get('date') or '')[:10],
        'meeting_id': session.get('meeting_id'),
        'taken_by': session.get('taken_by'),
        'taken_by_name': n(session.get('taken_by')),
        'taken_at': session.get('taken_at'),
        'last_saved_by': session.get('last_saved_by'),
        'last_saved_by_name': n(session.get('last_saved_by')),
        'last_saved_at': session.get('last_saved_at'),
        'substitute_id': session.get('substitute_id'),
        'substitute_name': n(session.get('substitute_id')),
        'sub_status': session.get('sub_status') or 'none',
        'sub_note': session.get('sub_note'),
        'planned': bool(session.get('planned_by')),
        'planned_by_name': n(session.get('planned_by')),
        'confirmed_by_name': n(session.get('confirmed_by')),
        'confirmed_at': session.get('confirmed_at'),
    }


def _describe_all(sessions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    names = _names(u for s in sessions for u in _person_fields(s))
    # describe() is None only for an empty session; these are stored rows.
    return [cast(Dict[str, Any], describe(s, names)) for s in sessions]


# ── Writes ───────────────────────────────────────────────────────────────────

def _class_meetings(class_id: str) -> List[Dict[str, Any]]:
    # Bounded by one class's meetings.
    return SisClassRepository(client=_admin()).list_meetings(class_id)


def _new_row(org_id: str, class_id: str, on_date: str) -> Dict[str, Any]:
    meeting = meeting_for_date(_class_meetings(class_id), on_date)
    return {'organization_id': org_id, 'class_id': class_id, 'date': on_date,
            'meeting_id': (meeting or {}).get('id')}


def _get_or_create(org_id: str, class_id: str, on_date: str,
                   first: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """(session, created). `first` is what a brand-new row carries. Two
    callers racing both see no row; one insert wins, the other re-reads."""
    repo = _repo()
    existing = repo.for_class_date(class_id, on_date)
    if existing:
        return existing, False
    row = repo.insert_if_absent({**_new_row(org_id, class_id, on_date), **first})
    if row:
        return row, True
    return repo.for_class_date(class_id, on_date) or {}, False


def record_roll(org_id: str, class_id: str, on_date: str, saver_id: str) -> Optional[Dict[str, Any]]:
    """Upsert the class's session for a roll save. Called by
    sis_attendance_service.record after the attendance rows are written.

    Best-effort by design: a failure here is logged and swallowed, because a
    teacher's roll must save even when the bookkeeping about the roll cannot
    (including before the sis_class_sessions migration has run).
    """
    try:
        now = _now()
        teachers = class_membership.class_teacher_ids(class_id)
        status, sub = derive_status(saver_id, teachers, None)
        session, created = _get_or_create(org_id, class_id, on_date, {
            'taken_by': saver_id, 'taken_at': now,
            'last_saved_by': saver_id, 'last_saved_at': now,
            'substitute_id': sub, 'sub_status': status,
        })
        if created or not session.get('id'):
            return session or None
        repo = _repo()
        if not session.get('taken_by'):
            # A planned-substitute row waiting for its first roll: this saver
            # is the first taker. Judged against the plan unless a coordinator
            # already decided (confirmed_by set), which wins over any rule.
            fields: Dict[str, Any] = {'taken_by': saver_id, 'taken_at': now,
                                      'last_saved_by': saver_id, 'last_saved_at': now,
                                      'updated_at': now}
            if not session.get('confirmed_by'):
                status, sub = derive_status(saver_id, teachers, session.get('substitute_id'))
                fields.update({'sub_status': status, 'substitute_id': sub})
            claimed = repo.claim_first_taker(session['id'], fields)
            if claimed:
                return claimed
        # Every later save: the first taker is kept, only the last save moves.
        return repo.patch(session['id'], {'last_saved_by': saver_id, 'last_saved_at': now,
                                          'updated_at': now}) or session
    except Exception as e:  # noqa: BLE001 — the roll save must not fail here
        logger.error(f'[class sessions] record_roll failed for class {class_id} on {on_date}: {e}')
        return None


def _staff_in_org(org_id: str, user_id: str) -> bool:
    from services.sis_service import STAFF_ORG_ROLES
    u = _users([user_id], 'id, organization_id, org_role, org_roles').get(user_id)
    if not u or u.get('organization_id') != org_id:
        return False
    roles = {u.get('org_role')} | set(u.get('org_roles') or [])
    return bool(roles & set(STAFF_ORG_ROLES))


def plan_substitute(org_id: str, class_id: str, on_date: str,
                    substitute_id: Optional[str], actor_id: str) -> Dict[str, Any]:
    """Mark (or clear, with substitute_id None) who covers a class on a date.

    Marking creates the session if the roll has not been taken yet, and grants
    the substitute that class's roster and attendance for this date only. If
    the roll was already taken, the status is re-judged against the plan --
    unless a coordinator has already decided, which a later plan does not undo.
    """
    try:
        _date.fromisoformat(str(on_date)[:10])
    except (TypeError, ValueError):
        return {'error': 'date must be YYYY-MM-DD'}
    if substitute_id and not _staff_in_org(org_id, substitute_id):
        return {'error': 'Pick a staff member of this school'}

    now = _now()
    plan: Dict[str, Any] = ({'substitute_id': substitute_id, 'planned_by': actor_id, 'planned_at': now}
                            if substitute_id else
                            {'substitute_id': None, 'planned_by': None, 'planned_at': None})
    session, created = _get_or_create(org_id, class_id, on_date,
                                      {**plan, 'sub_status': 'none'})
    if not session.get('id'):
        return {'error': 'Could not save the substitute'}
    if not created:
        fields: Dict[str, Any] = {**plan, 'updated_at': now}
        if not session.get('confirmed_by'):
            teachers = class_membership.class_teacher_ids(class_id)
            status, sub = derive_status(session.get('taken_by'), teachers, substitute_id)
            fields.update({'sub_status': status, 'substitute_id': sub})
        session = _repo().patch(session['id'], fields) or {**session, **fields}
    return {'session': _describe_all([session])[0]}


def resolve(org_id: str, session_id: str, outcome: str, note: Optional[str],
            actor_id: str) -> Dict[str, Any]:
    """A coordinator's answer to a flagged session. 'other' needs a note: it is
    the outcome with no meaning of its own."""
    if outcome not in RESOLUTIONS:
        return {'error': 'Unknown outcome'}
    note = (note or '').strip() or None
    if outcome == 'other' and not note:
        return {'error': 'Say what happened in the note'}
    repo = _repo()
    session = repo.get(session_id)
    if not session or session.get('organization_id') != org_id:
        return {'error': 'Session not found'}
    now = _now()
    fields = {'sub_status': outcome, 'sub_note': note,
              'confirmed_by': actor_id, 'confirmed_at': now, 'updated_at': now}
    if outcome == 'confirmed_sub' and not session.get('substitute_id'):
        fields['substitute_id'] = session.get('taken_by')
    updated = repo.patch(session_id, fields) or {**session, **fields}
    return {'session': _describe_all([updated])[0]}


# ── Reads ────────────────────────────────────────────────────────────────────

def session_for(org_id: str, class_id: str, on_date: str) -> Optional[Dict[str, Any]]:
    """One class's session for a date, described; None when there is none (or
    the table is not there yet)."""
    try:
        s = _repo().for_class_date(class_id, on_date)
    except Exception as e:  # noqa: BLE001 — a missing session must not break the roster
        logger.warning(f'[class sessions] read failed for class {class_id}: {e}')
        return None
    if not s or s.get('organization_id') != org_id:
        return None
    return _describe_all([s])[0]


def sessions_by_class(org_id: str, on_date: str) -> Dict[str, Dict[str, Any]]:
    """class_id -> described session for one org's day."""
    try:
        rows = _repo().for_org_date(org_id, on_date)
    except Exception as e:  # noqa: BLE001 — the dashboard renders without it
        logger.warning(f'[class sessions] day read failed for org {org_id}: {e}')
        return {}
    return {s['class_id']: s for s in _describe_all(rows)}


def covering_class_ids(user_id: str, org_id: str, on_date: str) -> List[str]:
    """Classes this person was planned to cover on `on_date`."""
    try:
        return _repo().covering_class_ids(user_id, org_id, str(on_date)[:10])
    except Exception as e:  # noqa: BLE001 — no grant is the safe failure
        logger.warning(f'[class sessions] covering lookup failed: {e}')
        return []


def planned_subs_for_date(org_id: str, on_date: str) -> Dict[str, Set[str]]:
    """class_id -> planned substitute ids, for the start-of-class reminder."""
    out: Dict[str, Set[str]] = {}
    try:
        for r in _repo().planned_for_date(org_id, on_date):
            out.setdefault(r['class_id'], set()).add(r['substitute_id'])
    except Exception as e:  # noqa: BLE001 — the teachers still get the reminder
        logger.warning(f'[class sessions] planned lookup failed for org {org_id}: {e}')
    return out


def _class_names(class_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
    return _repo().classes_by_ids(list(class_ids))


def flagged(org_id: str) -> List[Dict[str, Any]]:
    """Open flags, described, with the class and its assigned teacher."""
    try:
        rows = _repo().flagged(org_id)
    except Exception as e:  # noqa: BLE001 — the dashboard renders without it
        logger.warning(f'[class sessions] flagged read failed for org {org_id}: {e}')
        return []
    if not rows:
        return []
    classes = _class_names(r['class_id'] for r in rows)
    teacher_names = _names(c.get('primary_instructor_id') for c in classes.values())
    out = []
    for d in _describe_all(rows):
        cls = classes.get(d['class_id']) or {}
        out.append({**d, 'class_name': cls.get('name'),
                    'teacher_name': teacher_names.get(cls.get('primary_instructor_id') or '')})
    return out


def taken_class_ids(org_id: str, on_date: str,
                    sessions: Optional[Dict[str, Dict[str, Any]]] = None) -> Set[str]:
    """Classes with a roll on this date. Read from the attendance rows, which
    are the truth, as well as the sessions -- so "no roll yet" is right even
    before the backfill has run."""
    taken = {cid for cid, s in (sessions or {}).items() if s.get('taken_by')}
    try:
        taken.update(_repo().attendance_class_ids(org_id, on_date))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'[class sessions] attendance read failed for org {org_id}: {e}')
    return taken


def teachers_to_check(org_id: str, now: datetime, schedule: List[Dict[str, Any]],
                      settings: Optional[Dict[str, Any]],
                      sessions: Optional[Dict[str, Dict[str, Any]]] = None) -> Dict[str, Any]:
    """The coordinator's "Teachers to check" section: today's classes that
    started more than N minutes ago with no roll, and every flagged session."""
    today = now.date().isoformat()
    grace = roll_check_minutes(settings)
    # Before the first day of school every class is "late" -- the same summer
    # the attendance sweep learned to keep quiet through (2026-08-06).
    from services.sis_attendance_sweep_service import term_has_started
    no_roll = []
    if term_has_started(org_id, now.date()):
        taken = taken_class_ids(org_id, today, sessions)
        no_roll = overdue_rolls(schedule, taken, now.hour * 60 + now.minute, grace)
    for m in no_roll:
        s = (sessions or {}).get(m['class_id'])
        if s and s.get('planned'):
            m['substitute_name'] = s.get('substitute_name')
    return {
        'grace_minutes': grace,
        'no_roll': no_roll,
        'flagged': flagged(org_id),
        'resolutions': list(RESOLUTIONS),
    }


def annotate_schedule(schedule: List[Dict[str, Any]],
                      sessions: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Put each class's session on its Today's schedule row, so the row can say
    "Roll taken by X at 9:04" or "No roll yet"."""
    for m in schedule or []:
        m['roll'] = sessions.get(m.get('class_id') or '')
    return schedule


# ── History (reports) ────────────────────────────────────────────────────────

HISTORY_CSV_HEADER = ['Date', 'Class', 'Assigned teacher', 'Roll taken by', 'Taken at',
                      'Assigned teacher took roll?', 'Substitute', 'Status', 'Planned by',
                      'Decided by', 'Note']

STATUS_LABELS = {
    'none': '',
    'flagged': 'To check',
    'confirmed_sub': 'Substitute confirmed',
    'teacher_present': 'Teacher was present',
    'other': 'Other',
}


def _local_stamp(iso: Optional[str], tz) -> str:
    """'2026-09-22T15:04:10+00:00' -> '2026-09-22 9:04am' in the org's zone,
    the clock the office reads. Unparseable stamps pass through."""
    if not iso:
        return ''
    try:
        dt = datetime.fromisoformat(str(iso).replace('Z', '+00:00'))
    except ValueError:
        return str(iso)
    if tz is not None and dt.tzinfo is not None:
        dt = dt.astimezone(tz)
    h12 = dt.hour % 12 or 12
    return f"{dt.date().isoformat()} {h12}:{dt.minute:02d}{'pm' if dt.hour >= 12 else 'am'}"


def history(org_id: str, date_from: str, date_to: str, tz=None) -> Dict[str, Any]:
    """Every session between two dates, one row per class per day, for the
    office to review a pay period. `tz` is the org's zone for the taken-at
    column."""
    for day in (date_from, date_to):
        try:
            _date.fromisoformat(str(day)[:10])
        except (TypeError, ValueError):
            return {'error': 'from and to must be YYYY-MM-DD'}
    if str(date_from) > str(date_to):
        return {'error': 'from must be on or before to'}
    rows = _repo().in_range(org_id, date_from, date_to)
    classes = _class_names(r['class_id'] for r in rows)
    described = _describe_all(rows)
    teacher_names = _names(c.get('primary_instructor_id') for c in classes.values())
    # Whether the taker was an assigned teacher, answered today: one query per
    # class rather than per session.
    teachers: Dict[str, Set[str]] = {}
    for cid in classes:
        teachers[cid] = class_membership.class_teacher_ids(cid, classes[cid])
    out: List[Dict[str, Any]] = []
    for d in described:
        cls = classes.get(d['class_id']) or {}
        taker = d.get('taken_by')
        out.append({
            **d,
            'class_name': cls.get('name') or 'Unknown class',
            'teacher_name': teacher_names.get(cls.get('primary_instructor_id') or '') or '',
            'taker_is_teacher': (taker in teachers.get(d['class_id'], set())) if taker else None,
            'status_label': STATUS_LABELS.get(d['sub_status'], d['sub_status']),
            'taken_at_local': _local_stamp(d.get('taken_at'), tz),
        })
    out.sort(key=lambda r: (r['date'], (r['class_name'] or '').lower()))
    return {'rows': out, 'from': date_from, 'to': date_to}


def history_csv_rows(report: Dict[str, Any]) -> List[List[Any]]:
    def yes_no(v):
        return '' if v is None else ('Yes' if v else 'No')
    return [[r['date'], r['class_name'], r['teacher_name'], r.get('taken_by_name') or '',
             r.get('taken_at_local') or '', yes_no(r.get('taker_is_teacher')),
             r.get('substitute_name') or '', r['status_label'],
             r.get('planned_by_name') or '', r.get('confirmed_by_name') or '',
             r.get('sub_note') or ''] for r in report.get('rows') or []]
