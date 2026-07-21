"""
SIS eligibility & schedule-conflict logic — PURE functions, no DB.

Kept dependency-free so the bug-prone rules (age math, meeting-time overlap,
prerequisite checks, capacity) are exhaustively unit-testable without a database.
The registration service composes DB reads and calls these.

Policy (locked 2026-06-26): eligibility is SOFT — these functions return warnings,
never hard blocks. An admin may complete a registration despite warnings (override).
"""

from datetime import date, datetime
from typing import Dict, List, Any, Optional


# ── Age ──────────────────────────────────────────────────────────────────────
def _coerce_date(value: Any) -> Optional[date]:
    if value is None or value == '':
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    # ISO string 'YYYY-MM-DD' (optionally with time)
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00')).date()
    except ValueError:
        try:
            return datetime.strptime(str(value)[:10], '%Y-%m-%d').date()
        except ValueError:
            return None


def age_on(dob: Any, on_date: Optional[date] = None) -> Optional[int]:
    """Whole years old on `on_date` (default today). None if dob unparseable."""
    d = _coerce_date(dob)
    if d is None:
        return None
    ref = on_date or date.today()
    years = ref.year - d.year - ((ref.month, ref.day) < (d.month, d.day))
    return max(0, years)


def age_band_warning(age: Optional[int], min_age: Optional[int],
                     max_age: Optional[int]) -> Optional[str]:
    """Warn if a known age is outside [min_age, max_age]. Unknown age = no warning."""
    if age is None:
        return None
    if min_age is not None and age < min_age:
        return f'Student is {age}; class minimum age is {min_age}.'
    if max_age is not None and age > max_age:
        return f'Student is {age}; class maximum age is {max_age}.'
    return None


# ── Capacity ─────────────────────────────────────────────────────────────────
def capacity_warning(capacity: Optional[int], enrolled: int) -> Optional[str]:
    """Warn when a finite-capacity class is full. Unlimited (None) never warns."""
    if capacity is None:
        return None
    if enrolled >= capacity:
        return f'Class is full ({enrolled}/{capacity}).'
    return None


def is_full(capacity: Optional[int], enrolled: int) -> bool:
    return capacity is not None and enrolled >= capacity


# ── Prerequisites ────────────────────────────────────────────────────────────
def prerequisite_warnings(prerequisites: List[Dict[str, Any]],
                          satisfied_class_ids: set) -> List[str]:
    """
    prerequisites: rows {prerequisite_class_id, note}.
    satisfied_class_ids: class_ids the student has enrolled/completed.
    Returns a warning per unmet prerequisite (class-based or free-text note).
    """
    warnings = []
    for p in prerequisites or []:
        pre_id = p.get('prerequisite_class_id')
        note = (p.get('note') or '').strip()
        if pre_id:
            if pre_id not in satisfied_class_ids:
                warnings.append(f'Prerequisite class not completed ({pre_id}).')
        elif note:
            warnings.append(f'Prerequisite to verify: {note}')
    return warnings


# ── Schedule conflicts ───────────────────────────────────────────────────────
def _to_minutes(t: Any) -> Optional[int]:
    """'HH:MM[:SS]' -> minutes since midnight. None if unparseable."""
    if t is None:
        return None
    s = str(t)
    parts = s.split(':')
    try:
        h = int(parts[0]); m = int(parts[1]) if len(parts) > 1 else 0
    except (ValueError, IndexError):
        return None
    return h * 60 + m


def meetings_overlap(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    """
    True if two meetings collide in time. They must share a slot:
    either the same day_of_week (recurring) OR the same specific_date (one-off),
    and their [start,end) time ranges must overlap. A recurring weekly meeting and
    a one-off are only compared when the one-off falls on that weekday.
    """
    a_start, a_end = _to_minutes(a.get('start_time')), _to_minutes(a.get('end_time'))
    b_start, b_end = _to_minutes(b.get('start_time')), _to_minutes(b.get('end_time'))
    if None in (a_start, a_end, b_start, b_end):
        return False

    def weekday(m):
        if m.get('day_of_week') is not None:
            return m['day_of_week']
        d = _coerce_date(m.get('specific_date'))
        # python weekday(): Mon=0..Sun=6 → convert to our Sun=0..Sat=6
        return (d.weekday() + 1) % 7 if d else None

    # Two one-off meetings only clash if it's the exact same date.
    a_date, b_date = _coerce_date(a.get('specific_date')), _coerce_date(b.get('specific_date'))
    if a.get('day_of_week') is None and b.get('day_of_week') is None:
        if a_date != b_date or a_date is None:
            return False
    else:
        if weekday(a) is None or weekday(b) is None or weekday(a) != weekday(b):
            return False

    # half-open interval overlap
    return a_start < b_end and b_start < a_end


def schedule_conflicts(prospective: List[Dict[str, Any]],
                       existing: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return existing meetings that collide with any prospective meeting."""
    conflicts = []
    for pm in prospective or []:
        for em in existing or []:
            if meetings_overlap(pm, em):
                conflicts.append(em)
    return conflicts


def find_roster_conflicts(enrollments_by_student: Dict[str, List[str]],
                          meetings_by_class: Dict[str, List[Dict[str, Any]]]
                          ) -> List[Dict[str, Any]]:
    """Across a whole org, find every student double-booked into two classes
    whose meetings overlap. Used to re-validate rosters whenever a class's
    schedule changes (a late meeting edit can strand students who were
    conflict-free when they enrolled).

    enrollments_by_student: {student_id: [class_id, ...]} — active only.
    meetings_by_class:      {class_id: [meeting, ...]}.
    Returns one row per overlapping pair: {student_id, class_a, class_b} with
    class_a < class_b (deduped, order-stable), NOT one per meeting.
    """
    out: List[Dict[str, Any]] = []
    for student_id, class_ids in enrollments_by_student.items():
        uniq = sorted(set(class_ids))
        for i, a in enumerate(uniq):
            a_meetings = meetings_by_class.get(a) or []
            if not a_meetings:
                continue
            for b in uniq[i + 1:]:
                b_meetings = meetings_by_class.get(b) or []
                if any(meetings_overlap(am, bm) for am in a_meetings for bm in b_meetings):
                    out.append({'student_id': student_id, 'class_a': a, 'class_b': b})
    return out


# ── Aggregate ────────────────────────────────────────────────────────────────
def evaluate(*, student_dob: Any, klass: Dict[str, Any], enrolled: int,
             prerequisites: List[Dict[str, Any]], satisfied_class_ids: set,
             prospective_meetings: List[Dict[str, Any]],
             existing_meetings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compose all checks into a soft-eligibility result:
      { eligible: bool, is_full: bool, warnings: [str], conflicts: [meeting] }
    eligible stays True (soft policy) — warnings inform; admin overrides on complete.
    """
    warnings: List[str] = []
    age = age_on(student_dob)
    w = age_band_warning(age, klass.get('min_age'), klass.get('max_age'))
    if w:
        warnings.append(w)
    cap = capacity_warning(klass.get('capacity'), enrolled)
    if cap:
        warnings.append(cap)
    warnings.extend(prerequisite_warnings(prerequisites, satisfied_class_ids))
    conflicts = schedule_conflicts(prospective_meetings, existing_meetings)
    if conflicts:
        warnings.append(f'Schedule conflict with {len(conflicts)} existing meeting(s).')
    return {
        'eligible': True,  # soft policy: never hard-block
        'is_full': is_full(klass.get('capacity'), enrolled),
        'warnings': warnings,
        'conflicts': conflicts,
    }
