"""Messaging the families of a set of students from the SIS console.

Molly (iCreate, 2026-09-14 b4a4d250, 2026-09-17 b32b2fca): "I'm needing to
message all the elementary school parents, but I have no way to do that
(unless I post a school wide announcement, which isn't going to apply to a good
percentage of the parents!)". The staff composer could write to a group of
teachers at once; families could be reached one household at a time.

The audience is a set of STUDENTS -- everyone, one class, an age range -- and
the recipients are their guardians. That is the only way the office thinks
about it ("the parents of the eight-and-unders"), and it is the safe shape:
students are never messaged here, whatever their age. Guardians come through
the one shared answer, utils.class_membership.guardians_by_student, so a
parent who joined through the registration funnel is found the same way the
class parent chats find them.

Every guardian gets their own private thread, sent AS THE SCHOOL
(school_inbox_service.send_as_school) with the staff member recorded as the
author. Two reasons, both from the staff composer's docstring turned around:
replies from families belong in the School Inbox, the queue the office works,
not in one coordinator's personal messages; and no family may see another
family's reply, so there is no group mode at all. The optional email copy is
the announcement fan-out (one copy per mailbox, dependents routed to their
parent), because "their message box and/or email" was the ask.
"""

from typing import Any, Dict, List, Optional, Sequence, Set

from utils.logger import get_logger

logger = get_logger(__name__)

#: Same cap as the staff composer and the school inbox.
MAX_BODY = 2000


def _active_students(org_id: str) -> List[Dict[str, Any]]:
    """The school's current students, with the one age the SIS uses."""
    from services import sis_service
    try:
        roster = sis_service.get_roster(org_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"family messaging: roster failed for org {org_id}: {e}")
        return []
    return [s for s in roster if s.get('is_student')
            and s.get('enrollment_status') not in sis_service.INACTIVE_ENROLLMENT_STATUSES]


def _classes(org_id: str) -> List[Dict[str, Any]]:
    # admin client justified: the class picker for a caller already gated to
    # ADMIN_ROLES of this org; ids and names only.
    from utils.admin_client import admin_client
    from utils.db_fetch import fetch_all_rows
    try:
        rows = fetch_all_rows(lambda: (
            admin_client().table('org_classes').select('id, name, status')
            .eq('organization_id', org_id).neq('status', 'archived').order('name')
        ))
    except Exception as e:  # noqa: BLE001
        logger.warning(f"family messaging: class lookup failed for org {org_id}: {e}")
        return []
    return [{'id': r['id'], 'name': r.get('name') or 'Class'} for r in rows]


def _guardian_rows(guardian_ids: Sequence[str]) -> Dict[str, Dict[str, Any]]:
    # admin client justified: names for a picker of people the ADMIN_ROLES
    # caller may already see on the People page; guardians can be platform
    # parents (organization_id NULL), so this is by id, not by org.
    from utils.admin_client import admin_client
    from utils.person_name import USER_NAME_FIELDS
    ids = [g for g in set(guardian_ids) if g]
    if not ids:
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    try:
        for i in range(0, len(ids), 100):
            rows = (admin_client().table('users')
                    .select(f'id, avatar_url, {USER_NAME_FIELDS}')
                    .in_('id', ids[i:i + 100]).execute()).data or []
            for r in rows:
                out[r['id']] = r
    except Exception as e:  # noqa: BLE001
        logger.warning(f"family messaging: guardian lookup failed: {e}")
    return out


def family_audience(org_id: str, *, class_id: Optional[str] = None,
                    age_min: Optional[int] = None,
                    age_max: Optional[int] = None) -> Dict[str, Any]:
    """The guardians of the students this filter names, with why each is here.

    Returns {people: [{id, name, first_name, last_name, avatar_url,
    students: [name, ...]}], students: n, without_birthdate: n, classes: [...]}.
    `students` is how many students the filter matched; `without_birthdate`
    is how many the age filter had to leave out because their birth date is
    not on file, so the office can see the gap rather than assume the count
    is everyone.

    Ids come back with the list, like the staff presets, so the composer can
    show a count and drop one family before sending.
    """
    from utils.class_membership import class_student_ids, guardians_by_student
    students = _active_students(org_id)
    classes = _classes(org_id)

    if class_id:
        if class_id not in {c['id'] for c in classes}:
            raise ValueError('That class is not at this school')
        in_class = class_student_ids(class_id)
        students = [s for s in students if s['student_id'] in in_class]

    without_birthdate = 0
    if age_min is not None or age_max is not None:
        kept = []
        for s in students:
            age = s.get('age')
            if age is None:
                without_birthdate += 1
                continue
            if age_min is not None and age < age_min:
                continue
            if age_max is not None and age > age_max:
                continue
            kept.append(s)
        students = kept

    student_ids = [s['student_id'] for s in students]
    by_student = guardians_by_student(student_ids)
    students_by_guardian: Dict[str, List[str]] = {}
    for s in students:
        for gid in sorted(by_student.get(s['student_id'], ())):
            students_by_guardian.setdefault(gid, []).append(s.get('name') or 'Student')

    rows = _guardian_rows(list(students_by_guardian))
    from utils.person_name import full_name
    people = []
    for gid, kids in students_by_guardian.items():
        row = rows.get(gid) or {'id': gid}
        people.append({
            'id': gid,
            'name': full_name(row, fallback='Parent'),
            'first_name': row.get('first_name'),
            'last_name': row.get('last_name'),
            'avatar_url': row.get('avatar_url'),
            'students': kids,
        })
    people.sort(key=lambda p: (p['name'] or '').lower())
    return {
        'people': people,
        'students': len(students),
        'without_birthdate': without_birthdate,
        'classes': classes,
    }


def family_recipient_ids(org_id: str) -> Set[str]:
    """Every guardian of a current student: the universe a compose may name."""
    from utils.class_membership import parents_of_students
    return parents_of_students([s['student_id'] for s in _active_students(org_id)])


def compose(org_id: str, actor_id: str, *, body: str,
            recipient_ids: Sequence[str],
            subject: Optional[str] = None,
            attachments: Optional[List[Dict[str, Any]]] = None,
            email: bool = False) -> Dict[str, Any]:
    """One private message from the school to each guardian named.

    Raises ValueError on anything the sender can fix (nobody chosen, a person
    who is not a current student's guardian, an empty body); the route turns
    those into a 400. Sends are best-effort per guardian: one unreachable
    account does not stop the other forty.
    """
    body = (body or '').strip()
    if not body and not attachments:
        raise ValueError('Write something to send')
    if len(body) > MAX_BODY:
        raise ValueError(f'Messages are limited to {MAX_BODY} characters')

    wanted = [r for r in dict.fromkeys(recipient_ids or []) if r and r != actor_id]
    if not wanted:
        raise ValueError('Choose at least one family to message')
    allowed = family_recipient_ids(org_id)
    strangers = [r for r in wanted if r not in allowed]
    if strangers:
        # Refused rather than dropped: a composer that quietly discards a
        # recipient tells the sender their message went somewhere it did not.
        raise ValueError("Everyone you message has to be the parent of a current student")

    content = f'{subject}\n\n{body}' if (subject or '').strip() else body

    from services import school_inbox_service
    conversations, skipped = [], []
    for gid in wanted:
        try:
            msg = school_inbox_service.send_as_school(
                org_id, gid, content, sent_by=actor_id,
                attachments=attachments or [], fallback_sender=actor_id)
            conversations.append({'recipient_id': gid,
                                  'conversation_id': msg.get('conversation_id')})
        except Exception as e:  # noqa: BLE001
            logger.info(f'family message to {str(gid)[:8]} skipped: {e}')
            skipped.append(gid)

    emailed = 0
    if email and conversations:
        emailed = _email_copies(org_id, subject, body, [c['recipient_id'] for c in conversations])

    return {'mode': 'families', 'conversations': conversations,
            'sent': len(conversations), 'skipped': skipped, 'emailed': emailed}


def _email_copies(org_id: str, subject: Optional[str], body: str,
                  recipient_ids: List[str]) -> int:
    """The announcement fan-out, reused: one copy per mailbox, never to a
    placeholder address, failures logged and never raised."""
    from services import announcement_email_service
    from services import school_inbox_service
    try:
        title = (subject or '').strip()
        if not title:
            org = school_inbox_service.get_org(org_id) or {}
            title = f"A message from {org.get('name') or 'your school'}"
        sent, _failed = announcement_email_service.send_announcement_emails(
            org_id, title, body, recipient_ids, link_path='/messages')
        return sent
    except Exception as e:  # noqa: BLE001
        logger.warning(f'family message email copies failed for org {org_id}: {e}')
        return 0
