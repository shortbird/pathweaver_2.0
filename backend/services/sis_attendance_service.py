"""
SIS Attendance service — class-level attendance recording + summaries.

Teachers record per-class, per-date status for each enrolled student; parents/admins
read it. The summary math (counts + attendance rate) is a pure function, unit-tested.
Admin-client DB ops elsewhere (SIS tables RLS-locked to backend-only).
"""

from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

ATTENDANCE_STATUSES = ('present', 'absent', 'late', 'excused')


def _admin():
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _student_name(u: Dict[str, Any]) -> str:
    return (u.get('display_name')
            or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
            or u.get('username') or u.get('email') or 'Unnamed')


# ── Pure summary (unit-tested) ───────────────────────────────────────────────
def summarize(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Count records by status and compute an attendance rate.

    Rate = (present + late) / total recorded sessions. Excused is not counted
    against the rate's denominator (it neither helps nor hurts).
    """
    counts = {s: 0 for s in ATTENDANCE_STATUSES}
    for r in records or []:
        st = r.get('status')
        if st in counts:
            counts[st] += 1
    denom = counts['present'] + counts['late'] + counts['absent']
    rate = round((counts['present'] + counts['late']) / denom, 4) if denom else None
    return {'counts': counts, 'total': sum(counts.values()), 'attendance_rate': rate}


# ── DB-backed ────────────────────────────────────────────────────────────────
def _enrolled_students(class_id: str) -> List[Dict[str, Any]]:
    enr = (
        _admin().table('class_enrollments').select('student_id')
        .eq('class_id', class_id).eq('status', 'active').execute()
    ).data or []
    ids = [e['student_id'] for e in enr]
    if not ids:
        return []
    users = (
        _admin().table('users')
        .select('id, display_name, first_name, last_name, username, email')
        .in_('id', ids).execute()
    ).data or []
    out = [{'student_user_id': u['id'], 'name': _student_name(u)} for u in users]
    out.sort(key=lambda s: s['name'].lower())
    return out


def get_for_date(org_id: str, class_id: str, on_date: str) -> List[Dict[str, Any]]:
    """Roster for a class with each student's recorded status for the date (if any)."""
    students = _enrolled_students(class_id)
    existing = (
        _admin().table('sis_attendance').select('*')
        .eq('class_id', class_id).eq('date', on_date).execute()
    ).data or []
    by_student = {r['student_user_id']: r for r in existing}
    for s in students:
        rec = by_student.get(s['student_user_id'])
        s['status'] = rec.get('status') if rec else None
        s['note'] = rec.get('note') if rec else None
    return students


def record(org_id: str, class_id: str, on_date: str,
           entries: List[Dict[str, Any]], recorded_by: str) -> Dict[str, Any]:
    """Upsert attendance for a set of students on a date."""
    saved = []
    for e in entries or []:
        status = e.get('status')
        if status not in ATTENDANCE_STATUSES:
            continue
        payload = {
            'organization_id': org_id,
            'class_id': class_id,
            'student_user_id': e.get('student_user_id'),
            'date': on_date,
            'status': status,
            'note': e.get('note'),
            'recorded_by': recorded_by,
            'updated_at': _now(),
        }
        resp = (
            _admin().table('sis_attendance')
            .upsert(payload, on_conflict='class_id,student_user_id,date').execute()
        )
        if resp.data:
            saved.append(resp.data[0])
    return {'saved': saved, 'count': len(saved)}


def student_history(org_id: str, student_user_id: str) -> Dict[str, Any]:
    records = (
        _admin().table('sis_attendance').select('*')
        .eq('organization_id', org_id).eq('student_user_id', student_user_id)
        .order('date', desc=True).execute()
    ).data or []
    return {'records': records, 'summary': summarize(records)}
