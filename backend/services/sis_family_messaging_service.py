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

Staff can be copied (Molly, iCreate, 2026-09-22 77efe09b: "it would be nice if
i could add extra people who are NOT in the class. Like I just sent a message
to the CLD parents. But I couldn't add the teacher on to that message too").
Adding the teacher to the families' threads was never an option -- there is
one thread per guardian, and a teacher in all of them would be a group chat by
the back door. So each staff member named gets their OWN copy, and it comes
from the staff member who wrote it, personally, not from the school account.
That is the staff composer's rule (sis_messaging_service's docstring): the
School Inbox is the family queue, and a teacher's "thanks, got it" landing
there would bury the parent replies the office is working through. The copy
opens with a line saying it is a copy, how many parents it went to and which
audience, and that the families' replies go to the School Inbox -- so the
teacher knows they are not looking at the thread the parents answer in.
Families never learn who was copied, and nothing about the one-thread-per-
guardian rule changes. Staff are checked server-side against the same list
the staff composer uses (active, non-placeholder staff of THIS org); anyone
else is refused before a single message goes out.
"""

from typing import Any, Dict, List, Optional, Sequence, Set

from utils.logger import get_logger

logger = get_logger(__name__)

#: Same cap as the staff composer and the school inbox.
MAX_BODY = 2000
#: The composer's description of who the families are ("Art, ages 5 to 8").
#: Free text from the sender, shown only to staff, so it is only trimmed.
MAX_AUDIENCE_LABEL = 120


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
    people: List[Dict[str, Any]] = []
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
            email: bool = False,
            staff_ids: Optional[Sequence[str]] = None,
            audience_label: Optional[str] = None) -> Dict[str, Any]:
    """One private message from the school to each guardian named, and a
    labelled copy from the sender to each staff member in `staff_ids`.

    Raises ValueError on anything the sender can fix (nobody chosen, a person
    who is not a current student's guardian, a copy to someone who is not
    staff here, an empty body); the route turns those into a 400. Sends are
    best-effort per person: one unreachable account does not stop the other
    forty.
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
    copies = _staff_to_copy(org_id, actor_id, staff_ids, families=wanted)

    content = f'{subject}\n\n{body}' if (subject or '').strip() else body

    from services import school_inbox_service
    conversations: List[Dict[str, Any]] = []
    skipped: List[str] = []
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

    # A copy of a message nobody received would tell the teacher something
    # that did not happen, so copies wait on at least one family send.
    staff_copies: List[Dict[str, Any]] = []
    staff_skipped: List[str] = []
    if copies and conversations:
        staff_copies, staff_skipped = _send_staff_copies(
            actor_id, copies, content, attachments,
            parents=len(conversations), audience_label=audience_label)

    return {'mode': 'families', 'conversations': conversations,
            'sent': len(conversations), 'skipped': skipped, 'emailed': emailed,
            'staff_copies': staff_copies, 'staff_sent': len(staff_copies),
            'staff_skipped': staff_skipped}


def _staff_to_copy(org_id: str, actor_id: str, staff_ids: Optional[Sequence[str]],
                   *, families: Sequence[str]) -> List[str]:
    """The staff a family message is copied to, checked before anything sends.

    Only active, reachable staff of this org (the staff composer's own list);
    anyone else is refused, not dropped, for the same reason a stranger in the
    family list is. The sender is left out (they wrote it), and so is anyone
    already getting the family copy -- a teacher who is also a parent here
    gets the one their household gets, not two.
    """
    wanted = [s for s in dict.fromkeys(staff_ids or []) if s]
    if not wanted:
        return []
    from services import sis_messaging_service
    staff = {p['id'] for p in sis_messaging_service.staff_recipients(org_id)}
    if any(s not in staff for s in wanted):
        raise ValueError('Everyone you copy has to be staff at this school')
    already = set(families)
    return [s for s in wanted if s != actor_id and s not in already]


def copy_note(parents: int, audience_label: Optional[str] = None) -> str:
    """The line a staff copy opens with: that it is a copy, of what, and where
    the families' replies went."""
    label = (audience_label if isinstance(audience_label, str) else '').strip()[:MAX_AUDIENCE_LABEL]
    who = f"{parents} {'parent' if parents == 1 else 'parents'}"
    if label:
        who = f'{who} ({label})'
    return (f'[Copy] This message went to {who}, each family in their own private '
            'thread from the school. Their replies go to the School Inbox, not here.')


def _send_staff_copies(actor_id: str, staff: List[str], content: str,
                       attachments: Optional[List[Dict[str, Any]]], *,
                       parents: int, audience_label: Optional[str]):
    from services.direct_message_service import DirectMessageService
    svc = DirectMessageService()
    text = f'{copy_note(parents, audience_label)}\n\n{content}'
    sent: List[Dict[str, Any]] = []
    skipped: List[str] = []
    for sid in staff:
        try:
            msg = svc.send_message(actor_id, sid, text, attachments=attachments or [])
            sent.append({'recipient_id': sid, 'conversation_id': msg.get('conversation_id')})
        except Exception as e:  # noqa: BLE001
            logger.info(f'family message staff copy to {str(sid)[:8]} skipped: {e}')
            skipped.append(sid)
    return sent, skipped


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
