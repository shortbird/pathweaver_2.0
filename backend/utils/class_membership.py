"""
Who belongs to a class — the shared answer, used everywhere messaging asks.

A class's teachers live in three places and any of them counts:

    org_classes.primary_instructor_id     (how the SIS assigns a teacher)
    org_classes.assistant_instructor_ids  (co-teachers / aides)
    class_advisors                        (active rows; the older link table)

Its students are the ACTIVE class_enrollments rows.

This module exists because those three teacher sources kept getting read one
at a time: the class-chat sync only looked at class_advisors, which meant the
162 classes whose teacher is a primary_instructor built class chats with no
teacher in them. Anything that needs "the people in this class" should call
here rather than re-deriving it.

It lives in utils/ because repositories need it too (the advisor-classes read),
and the layered-import contract — routes -> services -> repositories -> utils,
enforced by tests/unit/test_import_layers.py — forbids a repository from
reaching up into services. It was `services.class_membership_service` until
2026-08-13; utils/ is the one layer every caller above may depend on.

Every helper is best-effort — a lookup failure returns an empty set (or False)
and logs, so a messaging query can never break the caller.
"""

from typing import Any, Dict, Iterable, List, Optional, Set

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

# PostgREST `in_` filters are URL params — chunk long id lists so a big org
# can't blow the query string.
_CHUNK = 100


def _admin():
    return get_supabase_admin_client()


def _chunks(items: List[str], size: int = _CHUNK) -> Iterable[List[str]]:
    for i in range(0, len(items), size):
        yield items[i:i + size]


def class_teacher_ids(class_id: str, class_row: Optional[Dict[str, Any]] = None) -> Set[str]:
    """Every staff member who teaches this class. Pass `class_row` (with
    primary_instructor_id + assistant_instructor_ids) to skip a re-fetch."""
    ids: Set[str] = set()
    try:
        admin = _admin()
        row = class_row
        if row is None:
            found = (admin.table('org_classes')
                     .select('id, primary_instructor_id, assistant_instructor_ids')
                     .eq('id', class_id).limit(1).execute()).data
            row = found[0] if found else {}
        if row.get('primary_instructor_id'):
            ids.add(row['primary_instructor_id'])
        for aid in (row.get('assistant_instructor_ids') or []):
            if aid:
                ids.add(aid)
        advisors = (admin.table('class_advisors').select('advisor_id')
                    .eq('class_id', class_id).eq('is_active', True).execute()).data or []
        ids.update(r['advisor_id'] for r in advisors if r.get('advisor_id'))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'class_teacher_ids failed for class {class_id}: {e}')
    return ids


def class_student_ids(class_id: str) -> Set[str]:
    """Actively enrolled students in this class."""
    try:
        rows = (_admin().table('class_enrollments').select('student_id')
                .eq('class_id', class_id).eq('status', 'active').execute()).data or []
        return {r['student_id'] for r in rows if r.get('student_id')}
    except Exception as e:  # noqa: BLE001
        logger.warning(f'class_student_ids failed for class {class_id}: {e}')
        return set()


def teacher_class_ids(user_id: str) -> Set[str]:
    """Classes this user teaches, across every org they belong to."""
    ids: Set[str] = set()
    try:
        admin = _admin()
        primary = (admin.table('org_classes').select('id')
                   .eq('primary_instructor_id', user_id).execute()).data or []
        ids.update(r['id'] for r in primary if r.get('id'))
        assisting = (admin.table('org_classes').select('id')
                     .contains('assistant_instructor_ids', [user_id]).execute()).data or []
        ids.update(r['id'] for r in assisting if r.get('id'))
        advising = (admin.table('class_advisors').select('class_id')
                    .eq('advisor_id', user_id).eq('is_active', True).execute()).data or []
        ids.update(r['class_id'] for r in advising if r.get('class_id'))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'teacher_class_ids failed for user {user_id}: {e}')
    return ids


def student_class_ids(user_id: str) -> Set[str]:
    """Classes this user is actively enrolled in."""
    try:
        rows = (_admin().table('class_enrollments').select('class_id')
                .eq('student_id', user_id).eq('status', 'active').execute()).data or []
        return {r['class_id'] for r in rows if r.get('class_id')}
    except Exception as e:  # noqa: BLE001
        logger.warning(f'student_class_ids failed for user {user_id}: {e}')
        return set()


def students_taught_by(teacher_id: str) -> Set[str]:
    """Every student on the roster of a class this user teaches."""
    class_ids = list(teacher_class_ids(teacher_id))
    if not class_ids:
        return set()
    out: Set[str] = set()
    try:
        admin = _admin()
        for chunk in _chunks(class_ids):
            rows = (admin.table('class_enrollments').select('student_id')
                    .in_('class_id', chunk).eq('status', 'active').execute()).data or []
            out.update(r['student_id'] for r in rows if r.get('student_id'))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'students_taught_by failed for user {teacher_id}: {e}')
    out.discard(teacher_id)
    return out


def teachers_of_student(student_id: str) -> Set[str]:
    """Every teacher of a class this student is actively enrolled in."""
    class_ids = list(student_class_ids(student_id))
    if not class_ids:
        return set()
    out: Set[str] = set()
    try:
        admin = _admin()
        for chunk in _chunks(class_ids):
            classes = (admin.table('org_classes')
                       .select('id, primary_instructor_id, assistant_instructor_ids')
                       .in_('id', chunk).execute()).data or []
            for row in classes:
                if row.get('primary_instructor_id'):
                    out.add(row['primary_instructor_id'])
                for aid in (row.get('assistant_instructor_ids') or []):
                    if aid:
                        out.add(aid)
            advisors = (admin.table('class_advisors').select('advisor_id')
                        .in_('class_id', chunk).eq('is_active', True).execute()).data or []
            out.update(r['advisor_id'] for r in advisors if r.get('advisor_id'))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'teachers_of_student failed for user {student_id}: {e}')
    out.discard(student_id)
    return out


def shares_class(teacher_id: str, student_id: str) -> bool:
    """True when `student_id` is actively enrolled in a class `teacher_id`
    teaches. The relationship that lets a teacher and a student DM each other."""
    class_ids = list(teacher_class_ids(teacher_id))
    if not class_ids:
        return False
    try:
        admin = _admin()
        for chunk in _chunks(class_ids):
            found = (admin.table('class_enrollments').select('id')
                     .eq('student_id', student_id).eq('status', 'active')
                     .in_('class_id', chunk).limit(1).execute()).data
            if found:
                return True
    except Exception as e:  # noqa: BLE001
        logger.warning(f'shares_class failed ({teacher_id} / {student_id}): {e}')
    return False
