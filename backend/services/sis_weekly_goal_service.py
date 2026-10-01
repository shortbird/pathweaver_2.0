"""Weekly goals: a coach sets each student's goals on Monday and checks in on
Thursday; the check-in decides whether the student earned "freedom".

Apogee Cache Valley ran this on a Google Sheet (the "Master Planner"): per
student per week, one goal for each learning area, what was completed,
complaints, valid complaints and notes. The learning areas are the org's
sis_settings.goal_subjects, the same list its annual goals (sis_student_goals)
use, so a week's goal sits next to the year goal it serves.

Freedom is computed, never stored (owner's call, 2026-10-01: "automatic
freedom"). A week earns it when the check-in is done, every goal that was set
is completed, and there is no valid complaint. A stored flag could disagree with
the goals it is made of; a computed one cannot.
"""

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from repositories.sis_weekly_goal_repository import SisWeeklyGoalRepository
from services import sis_service
from utils import person_name
from utils.timestamps import now_iso
from utils.validation import sanitize_input

DEFAULT_SUBJECTS = ['Reading', 'Writing', 'Math', 'Language Arts', 'Fitness', 'Other',
                    'Passion Project']

FREEDOM_EARNED = 'earned'
FREEDOM_NOT_EARNED = 'not_earned'

# Weeks of history a family sees and the board looks back over for "last week".
HISTORY_WEEKS = 52
MAX_GOAL_LENGTH = 500
MAX_NOTES_LENGTH = 4000


class WeeklyGoalError(ValueError):
    """A request the caller can fix; the route turns it into a 400."""


def week_start_of(value: Optional[Any] = None) -> date:
    """The Monday of the week holding `value` (a date, an ISO string, or today)."""
    if value is None:
        d = date.today()
    elif isinstance(value, datetime):
        d = value.date()
    elif isinstance(value, date):
        d = value
    else:
        try:
            d = date.fromisoformat(str(value)[:10])
        except ValueError as e:
            raise WeeklyGoalError('week_start must be a date (YYYY-MM-DD)') from e
    return d - timedelta(days=d.weekday())


def goal_subjects(org_row: Optional[Dict[str, Any]]) -> List[str]:
    settings = ((org_row or {}).get('feature_flags') or {}).get('sis_settings') or {}
    subjects = settings.get('goal_subjects')
    return list(subjects) if isinstance(subjects, list) and subjects else list(DEFAULT_SUBJECTS)


def freedom_for(row: Optional[Dict[str, Any]]) -> Optional[str]:
    """'earned' / 'not_earned' for a checked-in week; None before the check-in,
    or when no goal was set (there is nothing to have earned it with)."""
    if not row or not row.get('checked_in_at'):
        return None
    set_goals = [g for g in (row.get('goals') or []) if (g.get('goal') or '').strip()]
    if not set_goals:
        return None
    if (row.get('valid_complaints') or 0) > 0:
        return FREEDOM_NOT_EARNED
    if all(g.get('completed') is True for g in set_goals):
        return FREEDOM_EARNED
    return FREEDOM_NOT_EARNED


def _clean_goals(raw: Any, subjects: List[str], check_in: bool) -> List[Dict[str, Any]]:
    """[{subject, goal, completed}] in the org's subject order. Unknown subjects
    are dropped; a missing subject gets an empty goal. At the check-in an
    unanswered goal counts as not completed, so the week can be decided."""
    by_subject = {}
    if isinstance(raw, list):
        for entry in raw:
            if isinstance(entry, dict) and entry.get('subject') in subjects:
                by_subject[entry['subject']] = entry
    out = []
    for subject in subjects:
        entry = by_subject.get(subject) or {}
        goal = sanitize_input(str(entry.get('goal') or ''))[:MAX_GOAL_LENGTH]
        completed = entry.get('completed')
        completed = completed if isinstance(completed, bool) else None
        if not goal:
            completed = None
        elif check_in and completed is None:
            completed = False
        out.append({'subject': subject, 'goal': goal, 'completed': completed})
    return out


def _count(value: Any, field: str) -> int:
    try:
        n = int(value or 0)
    except (TypeError, ValueError) as e:
        raise WeeklyGoalError(f'{field} must be a whole number') from e
    if n < 0:
        raise WeeklyGoalError(f'{field} cannot be negative')
    return n


def _row_out(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    return {**row, 'freedom': freedom_for(row)}


class WeeklyGoalService:
    def __init__(self, repository: Optional[SisWeeklyGoalRepository] = None):
        self.repository = repository or SisWeeklyGoalRepository()

    def _year_goals(self, org_id: str, student_ids: List[str]) -> Dict[str, Dict[str, str]]:
        """student_id -> {subject: year_goal} from the newest annual goals row."""
        if not student_ids:
            return {}
        rows = self.repository.annual_goal_rows(org_id, student_ids)
        rows.sort(key=lambda r: r.get('school_year') or '')
        out: Dict[str, Dict[str, str]] = {}
        for r in rows:  # newest school year last, so it wins
            out[r['student_user_id']] = {
                str(s['subject']): s.get('year_goal') or ''
                for s in (r.get('subjects') or [])
                if isinstance(s, dict) and s.get('subject')
            }
        return out

    def board(self, org_id: str, week_start: Any = None) -> Dict[str, Any]:
        """Every current student with their row for the week, the week before
        (to copy goals forward and show the freedom they carry in) and their
        year goals."""
        week = week_start_of(week_start)
        prev = week - timedelta(days=7)
        org = self.repository.org_row(org_id)
        subjects = goal_subjects(org)

        students = [
            p for p in sis_service.get_roster(org_id)
            if p.get('is_student')
            and p.get('enrollment_status') not in sis_service.INACTIVE_ENROLLMENT_STATUSES
        ]
        ids = [s['student_id'] for s in students]
        rows = self.repository.for_students_weeks(org_id, ids, [week.isoformat(), prev.isoformat()])
        this_week = {r['student_user_id']: r for r in rows if r['week_start'] == week.isoformat()}
        last_week = {r['student_user_id']: r for r in rows if r['week_start'] == prev.isoformat()}
        year_goals = self._year_goals(org_id, ids)

        out = [{
            'student_id': s['student_id'],
            'name': s.get('name'),
            'age': s.get('age'),
            'week': _row_out(this_week.get(s['student_id'])),
            'last_week': _row_out(last_week.get(s['student_id'])),
            'year_goals': year_goals.get(s['student_id'], {}),
        } for s in students]
        out.sort(key=lambda s: (s.get('name') or '').lower())
        return {'week_start': week.isoformat(), 'subjects': subjects, 'students': out}

    def save(self, org_id: str, student_id: str, week_start: Any, data: Dict[str, Any],
             staff_id: str) -> Dict[str, Any]:
        """Write a student's week. `check_in: true` is the Thursday check-in:
        it stamps who checked in and decides every unanswered goal."""
        week = week_start_of(week_start)
        student = self.repository.user_row(student_id)
        if not student or student.get('organization_id') != org_id \
                or not sis_service.is_student(student):
            raise LookupError('Student not found')

        subjects = goal_subjects(self.repository.org_row(org_id))
        check_in = bool(data.get('check_in'))
        existing = self.repository.get(org_id, student_id, week.isoformat()) or {}
        goals = _clean_goals(data.get('goals'), subjects, check_in)
        complaints = _count(data.get('complaints'), 'Complaints')
        valid = _count(data.get('valid_complaints'), 'Valid complaints')
        if valid > complaints:
            raise WeeklyGoalError('Valid complaints cannot be more than complaints')

        now = now_iso()
        payload = {
            'organization_id': org_id,
            'student_user_id': student_id,
            'week_start': week.isoformat(),
            'goals': goals,
            'complaints': complaints,
            'valid_complaints': valid,
            'notes': sanitize_input(str(data.get('notes') or ''))[:MAX_NOTES_LENGTH] or None,
            'updated_at': now,
            'goals_set_by': existing.get('goals_set_by'),
            'goals_set_at': existing.get('goals_set_at'),
            'checked_in_by': existing.get('checked_in_by'),
            'checked_in_at': existing.get('checked_in_at'),
        }
        old_goals = [g.get('goal') for g in (existing.get('goals') or [])]
        if [g['goal'] for g in goals] != old_goals and any(g['goal'] for g in goals):
            payload['goals_set_by'] = staff_id
            payload['goals_set_at'] = now
        if check_in:
            payload['checked_in_by'] = staff_id
            payload['checked_in_at'] = now
        saved = self.repository.upsert(payload)
        return {**saved, 'freedom': freedom_for(saved)}

    def history(self, student_id: str) -> Dict[str, Any]:
        """A student's weeks, newest first, with the subjects of their school."""
        rows = self.repository.history(student_id, HISTORY_WEEKS)
        student = self.repository.user_row(student_id)
        org_id = student.get('organization_id') if student else None
        org = self.repository.org_row(org_id) if org_id else None
        rows = [r for r in rows if r.get('organization_id') == org_id]
        checked = [r for r in rows if freedom_for(r)]
        return {
            'student_id': student_id,
            'name': person_name.full_name(student) if student else None,
            'subjects': goal_subjects(org),
            'current_week_start': week_start_of().isoformat(),
            # Freedom carries from the latest checked-in week.
            'freedom': freedom_for(checked[0]) if checked else None,
            'weeks': [_row_out(r) for r in rows],
        }

    def mine(self, user_id: str) -> List[Dict[str, Any]]:
        """The caller's own weeks if they are a student, else every child's they
        parent -- only at schools that run weekly goals."""
        from modules.enabled import module_enabled
        from utils.class_membership import children_of_parent

        caller = self.repository.user_row(user_id)
        if caller and sis_service.is_student(caller):
            student_ids = [user_id]
        else:
            student_ids = sorted(children_of_parent(user_id))
        out = []
        for sid in student_ids:
            student = caller if sid == user_id else self.repository.user_row(sid)
            org_id = (student or {}).get('organization_id')
            if org_id and module_enabled(org_id, 'weekly_goals'):
                out.append(self.history(sid))
        return out
