"""One Compose for the SIS Messaging page.

Tickets bf8b754d, 8ee000b6 and 9b46c748 (iCreate, meeting of 2026-09-23):
"Messaging becomes more like a Gmail inbox - Compose, select who gets the
message, the method (push notification, email, optio message)", "New message -
option to add the class teacher, class aide, and students", and read receipts.

Until this, the School tab had three ways to start a message and each one could
reach only part of the school: "New message" picked one person, "Message a
group" opened a composer with a Staff | Families switch (sis_messaging_service
for staff, sis_family_messaging_service for families), and students could not
be reached at all. A message to "the Robotics families and their teacher" was
two sends and a copy.

Now there is one picker and one send:

  Who      Any mix of staff, families (guardians) and students, filtered by
           role, class and age. A class splits into its teacher, its aide(s),
           its students and its families, each picked on its own
           (utils.class_membership.split_class_staff).
  Shape    'group': one thread everyone replies in. 'separate': a private
           thread each (the only shape that keeps one family's reply from
           every other family).
  From     The School tab sends as the school, so replies land in the School
           Inbox. My messages sends as the staff member -- except to families
           and students, who are always written to by the school: a parent's
           answer belongs in the queue the office works, not in one
           colleague's personal messages (the rule the families composer,
           sis_family_messaging_service until 2026-09-23, was built on).
  How      The Optio message is always stored. Push and email are per-send
           toggles: push=False keeps the bell and skips the phone; email reuses
           the announcement fan-out (one copy per mailbox, dependents routed to
           their parent).

Every send is recorded (message_sends + message_send_recipients) so the Sent
view can say "Read by 12 of 40" and list who.

The recipient universe is checked on the server. Anybody who is not current
staff, a current student, or the guardian of one is refused rather than
dropped: a picker that quietly discards a recipient tells the sender their
message went somewhere it did not.
"""

from typing import Any, Dict, Iterable, List, Optional, Set

from utils.logger import get_logger

logger = get_logger(__name__)

#: Message bodies are capped like every other console send.
MAX_BODY = 2000
#: group_conversations.name is varchar(100).
MAX_NAME = 100
MODES = ('group', 'separate')

#: Staff kinds the role filter offers, from the SIS role each person holds.
OFFICE_ROLES = frozenset({'org_admin', 'campus_coordinator'})


# admin client justified: the audience is the whole school -- every family,
#   student and staff member of the org -- which no single caller can read
#   under RLS; the ADMIN_ROLES route gate and org resolution are the check.
from utils.admin_client import admin_client as _admin  # noqa: E402


def _repo():
    from repositories.message_send_repository import MessageSendRepository
    return MessageSendRepository(client=_admin())


# ── The audience ──────────────────────────────────────────────────────────────

def _staff(org_id: str) -> List[Dict[str, Any]]:
    from services import sis_messaging_service
    return sis_messaging_service.staff_recipients(org_id)


def _students(org_id: str) -> List[Dict[str, Any]]:
    """The school's current students, with the one age the SIS uses (as of
    the first day of school). Withdrawn and graduated students are not an
    audience."""
    from services import sis_service
    try:
        roster = sis_service.get_roster(org_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"compose: roster failed for org {org_id}: {e}")
        return []
    return [s for s in roster if s.get('is_student')
            and s.get('enrollment_status') not in sis_service.INACTIVE_ENROLLMENT_STATUSES]


def _guardian_rows(guardian_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
    """Names for the guardians. By id, not by org: a guardian can be a
    platform parent with no organization_id of their own."""
    from repositories.school_thread_repository import SchoolThreadRepository
    try:
        return SchoolThreadRepository(client=_admin()).user_names(guardian_ids)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"compose: guardian lookup failed: {e}")
        return {}


def _family_ids(students: List[Dict[str, Any]]) -> Set[str]:
    """Every guardian of a current student, through the one shared answer
    (utils.class_membership), so a parent who joined through the registration
    funnel is found the way the class parent chats find them."""
    from utils.class_membership import parents_of_students
    return parents_of_students([s['student_id'] for s in students])


def _staff_kinds(roles: Iterable[str]) -> List[str]:
    roles = set(roles or [])
    kinds = []
    if roles & OFFICE_ROLES:
        kinds.append('office')
    if 'advisor' in roles:
        kinds.append('teacher')
    return kinds or ['staff']


def class_parts(classes: List[Dict[str, Any]], advisors: Dict[str, List[str]],
                enrollments: Dict[str, List[str]]) -> List[Dict[str, Any]]:
    """Each class with its teachers, aides and students as id lists (families
    follow from the students on the client, which has every family's
    children). Pure, so the split is tested without a database."""
    from utils.class_membership import split_class_staff
    out = []
    for c in classes:
        split = split_class_staff(c, advisors.get(c['id'], ()))
        out.append({
            'id': c['id'],
            'name': c.get('name') or 'Class',
            'teacher_ids': sorted(split['teachers']),
            'aide_ids': sorted(split['aides']),
            'student_ids': sorted(set(enrollments.get(c['id'], ()))),
        })
    return out


def staff_presets(staff: List[Dict[str, Any]], classes: List[Dict[str, Any]],
                  meeting_days: Dict[str, List[int]],
                  front_office: Iterable[str]) -> List[Dict[str, Any]]:
    """The named sets of staff worth one click -- all teachers, the front
    office, everyone teaching Tuesday -- with their member ids, so a preset
    fills the list and one person can still be taken out before sending ("all
    teachers except Sam"). The same presets the staff composer had
    (sis_messaging_service.preset_groups), built from the class split already
    in hand instead of a read per class."""
    from services.sis_messaging_service import _WEEKDAYS
    ids = {p['id'] for p in staff}
    presets: List[Dict[str, Any]] = []

    def _add(key, label, members, description=None):
        members = sorted(m for m in set(members) if m in ids)
        if members:
            presets.append({'key': key, 'label': label, 'member_ids': members,
                            'description': description})

    _add('all_teachers', 'All teachers', [p['id'] for p in staff if 'advisor' in (p.get('roles') or [])])
    _add('all_staff', 'All staff', ids)
    _add('front_office', 'Front office', front_office, 'Admins and campus coordinators')
    for dow, label in _WEEKDAYS:
        members: Set[str] = set()
        for c in classes:
            if dow in (meeting_days.get(c['id']) or ()):
                members.update(c['teacher_ids'])
                members.update(c['aide_ids'])
        _add(f'weekday:{dow}', f'Teaching {label}', members,
             f'Anyone with a class that meets on {label}')
    return presets


def audience(org_id: str) -> Dict[str, Any]:
    """Everybody Compose can write to, with what each filter needs.

    {people: [{id, name, first_name, last_name, avatar_url, kinds: ['staff' |
    'family' | 'student', ...], staff_kinds, role_labels, age, class_ids,
    child_ids, children}], classes: [{id, name, teacher_ids, aide_ids,
    student_ids}], presets: [...], without_birthdate: n}

    One person, one entry: a teacher who is also a parent at the school is one
    row with both kinds, so they cannot be picked twice. Filtering happens on
    the client over this one answer -- role, class and age change as fast as
    the office clicks, and the whole school is a few hundred rows.
    """
    from services import school_inbox_service
    from utils.class_membership import guardians_by_student
    from utils.person_name import full_name

    repo = _repo()
    staff = _staff(org_id)
    students = _students(org_id)
    class_rows = repo.active_classes(org_id)
    class_ids = [c['id'] for c in class_rows]
    classes = class_parts(class_rows, repo.active_advisors_by_class(class_ids),
                          repo.active_enrollments(class_ids))

    people: Dict[str, Dict[str, Any]] = {}

    def _entry(pid: str, base: Dict[str, Any]) -> Dict[str, Any]:
        row = people.get(pid)
        if row is None:
            row = {'id': pid, 'name': base.get('name') or '', 'first_name': base.get('first_name'),
                   'last_name': base.get('last_name'), 'avatar_url': base.get('avatar_url'),
                   'kinds': [], 'staff_kinds': [], 'role_labels': [], 'age': None,
                   'class_ids': [], 'child_ids': [], 'children': []}
            people[pid] = row
        return row

    classes_of_student: Dict[str, List[str]] = {}
    for c in classes:
        for sid in c['student_ids']:
            classes_of_student.setdefault(sid, []).append(c['id'])

    for s in staff:
        row = _entry(s['id'], s)
        row['kinds'].append('staff')
        row['staff_kinds'] = _staff_kinds(s.get('roles') or [])
        row['role_labels'] = s.get('role_labels') or []

    without_birthdate = 0
    for s in students:
        sid = s['student_id']
        row = _entry(sid, s)
        row['kinds'].append('student')
        row['age'] = s.get('age')
        row['class_ids'] = classes_of_student.get(sid, [])
        if s.get('age') is None:
            without_birthdate += 1

    by_student = guardians_by_student([s['student_id'] for s in students])
    student_names = {s['student_id']: s.get('name') or 'Student' for s in students}
    children_of: Dict[str, List[str]] = {}
    for sid, guardians in by_student.items():
        for gid in guardians:
            children_of.setdefault(gid, []).append(sid)
    guardian_rows = _guardian_rows(list(children_of))
    for gid, kids in children_of.items():
        g = guardian_rows.get(gid) or {'id': gid}
        row = _entry(gid, {**g, 'name': full_name(g, fallback='Parent')})
        row['kinds'].append('family')
        row['child_ids'] = sorted(kids)
        row['children'] = sorted(student_names.get(k, 'Student') for k in kids)

    classes_by_id = {c['id']: c for c in classes}
    presets = staff_presets(staff, list(classes_by_id.values()),
                            repo.class_meeting_days(org_id, class_ids),
                            school_inbox_service.admin_recipient_ids(org_id))
    ordered = sorted(people.values(), key=lambda p: (p['name'] or '').lower())
    return {'people': ordered, 'classes': classes, 'presets': presets,
            'without_birthdate': without_birthdate}


def _universe(org_id: str) -> Dict[str, str]:
    """{user_id: kind} for everybody a send may name. A person with two kinds
    keeps the one that decides how they are written to: family or student (the
    school writes) over staff."""
    kinds: Dict[str, str] = {p['id']: 'staff' for p in _staff(org_id)}
    students = _students(org_id)
    for s in students:
        kinds[s['student_id']] = 'student'
    for gid in _family_ids(students):
        kinds[gid] = 'family'
    return kinds


# ── The send ──────────────────────────────────────────────────────────────────

def _group_audience(kinds: Iterable[str]) -> str:
    """group_conversations.audience for a mixed room. A room with a student in
    it is a student room (every adult's words in it are screened, like a class
    chat); a room with a parent and no student is a family room."""
    kinds = set(kinds)
    if 'student' in kinds:
        return 'student'
    if 'family' in kinds:
        return 'family'
    return 'staff'


def compose(org_id: str, actor_id: str, *, body: str, recipient_ids: Iterable[str],
            mode: str = 'separate', subject: Optional[str] = None,
            name: Optional[str] = None, push: bool = True, email: bool = False,
            as_school: bool = False,
            attachments: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """Send one message to everyone in `recipient_ids`. See the module
    docstring. Raises ValueError on anything the sender can fix; the route
    answers 400."""
    if mode not in MODES:
        raise ValueError('mode has to be "group" or "separate"')
    body = (body or '').strip()
    if not body and not attachments:
        raise ValueError('Write something to send')
    if len(body) > MAX_BODY:
        raise ValueError(f'Messages are limited to {MAX_BODY} characters')

    wanted = [r for r in dict.fromkeys(recipient_ids or []) if r and r != actor_id]
    if not wanted:
        raise ValueError('Choose at least one person to message')
    universe = _universe(org_id)
    if any(r not in universe for r in wanted):
        raise ValueError('Everyone you message has to be staff, a student or a parent at this school')
    kinds = {r: universe[r] for r in wanted}

    title = (subject or '').strip()
    content = f'{title}\n\n{body}' if title else body
    # Families and students are always written to by the school (see the
    # module docstring); staff follow the tab the send came from.
    school = as_school or any(k != 'staff' for k in kinds.values())

    if mode == 'group' and len(wanted) > 1:
        result = _send_group(org_id, actor_id, wanted, kinds, content, name,
                             attachments, push=push, school=school)
    else:
        mode = 'separate'
        result = _send_separately(org_id, actor_id, wanted, kinds, content,
                                  attachments, push=push, school=school)

    emailed = 0
    reached = [r['user_id'] for r in result['recipients'] if r['status'] == 'sent']
    if email and reached:
        emailed = _email(org_id, subject, body, reached)

    send_id = _record(org_id, actor_id, mode=mode, as_school=school, subject=subject,
                      body=body, push=push, email=email, result=result)
    skipped = [r['user_id'] for r in result['recipients'] if r['status'] == 'skipped']
    return {'send_id': send_id, 'mode': mode, 'as_school': school,
            'group': result.get('group'), 'sent': len(reached),
            'skipped': skipped, 'emailed': emailed}


def _send_group(org_id, actor_id, recipients, kinds, content, name, attachments,
                *, push, school):
    from services.group_message_service import GroupMessageService
    svc = GroupMessageService()
    label = (name or '').strip()[:MAX_NAME] or _default_name(recipients)
    audience_kind = _group_audience(kinds.values())
    if school:
        from services import school_inbox_service
        _org, inbox_user_id = school_inbox_service.school_account(org_id)
        if not inbox_user_id:
            # No fallback to a personal group: that was ac84b6cd, a thread
            # filed where the office cannot see it. A retry beats a lost thread.
            raise RuntimeError('School inbox is unavailable')
        group = svc.create_school_group(org_id, inbox_user_id, actor_id, label,
                                        member_ids=recipients, audience=audience_kind)
        message = svc.send_message(actor_id, group['id'], content, attachments=attachments,
                                   on_behalf_of=inbox_user_id,
                                   **({} if push else {'push': False}))
    else:
        group = svc.create_group(actor_id, label, member_ids=recipients,
                                 organization_id=org_id, audience=audience_kind)
        message = svc.send_message(actor_id, group['id'], content, attachments=attachments,
                                   **({} if push else {'push': False}))
    return {'group': group, 'group_message_id': (message or {}).get('id'),
            'recipients': [{'user_id': r, 'kind': kinds[r], 'status': 'sent'}
                           for r in recipients]}


def _send_separately(org_id, actor_id, recipients, kinds, content, attachments,
                     *, push, school):
    from services import school_inbox_service
    from services.direct_message_service import DirectMessageService
    svc = DirectMessageService()
    extra = {} if push else {'push': False}
    out = []
    for rid in recipients:
        try:
            if school:
                message = school_inbox_service.send_as_school(
                    org_id, rid, content, sent_by=actor_id,
                    attachments=attachments or [], fallback_sender=actor_id, **extra)
            else:
                message = svc.send_message(actor_id, rid, content,
                                           attachments=attachments or [], **extra)
            out.append({'user_id': rid, 'kind': kinds[rid], 'status': 'sent',
                        'conversation_id': message.get('conversation_id'),
                        'message_id': message.get('id')})
        except Exception as e:  # noqa: BLE001
            # Best-effort per person: one unreachable account must not swallow
            # the other thirty-nine. The skip is recorded, so the Sent view
            # shows the gap.
            logger.info(f'compose to {str(rid)[:8]} skipped: {e}')
            out.append({'user_id': rid, 'kind': kinds[rid], 'status': 'skipped'})
    return {'group': None, 'recipients': out}


def _email(org_id: str, subject: Optional[str], body: str, recipient_ids: List[str]) -> int:
    """The announcement fan-out: one copy per mailbox, never to a placeholder
    address, failures logged and never raised."""
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
        logger.warning(f'compose email copies failed for org {org_id}: {e}')
        return 0


def _record(org_id, actor_id, *, mode, as_school, subject, body, push, email, result):
    """Write the send and its recipients. Best-effort: the messages are out, and
    a failed record costs the read counts, not the send."""
    try:
        repo = _repo()
        group = result.get('group') or {}
        row = repo.create_send({
            'organization_id': org_id, 'sent_by': actor_id, 'as_school': as_school,
            'mode': mode, 'subject': (subject or '').strip() or None, 'body': body,
            'push': bool(push), 'email': bool(email),
            'group_id': group.get('id'), 'group_message_id': result.get('group_message_id'),
        })
        if not row:
            return None
        repo.add_recipients([{
            'send_id': row['id'], 'user_id': r['user_id'], 'kind': r['kind'],
            'status': r['status'], 'conversation_id': r.get('conversation_id'),
            'message_id': r.get('message_id'),
        } for r in result['recipients']])
        return row['id']
    except Exception as e:  # noqa: BLE001
        logger.error(f'compose record failed for org {str(org_id)[:8]}: {e}', exc_info=True)
        return None


def _default_name(recipients: List[str]) -> str:
    """A name the office will recognise in a list a week later: "Ada, Sam and
    4 others" says who is in the room, which is what a group list is scanned
    for (the staff composer's rule, sis_messaging_service._default_name)."""
    try:
        from repositories.school_thread_repository import SchoolThreadRepository
        rows = SchoolThreadRepository(client=_admin()).user_names(recipients)
    except Exception:  # noqa: BLE001
        rows = {}
    first = [((rows.get(r) or {}).get('preferred_name') or (rows.get(r) or {}).get('first_name')
              or (rows.get(r) or {}).get('display_name') or '') for r in recipients]
    first = [n for n in first if n]
    if not first:
        return 'Group message'
    shown, rest = first[:2], len(first) - 2
    label = ', '.join(shown)
    if rest == 1:
        label = f'{label} and 1 other'
    elif rest > 1:
        label = f'{label} and {rest} others'
    return label[:MAX_NAME]


# ── Reading sends back ────────────────────────────────────────────────────────

def list_sends(org_id: str, *, limit: int = 30, offset: int = 0) -> List[Dict[str, Any]]:
    """The org's recent Compose sends, newest first, each with "read by N of M"
    and who sent it."""
    from repositories.school_thread_repository import SchoolThreadRepository
    from utils.person_name import full_name
    repo = _repo()
    sends = repo.list_sends(org_id, limit=limit, offset=offset)
    stats = repo.read_stats(s['id'] for s in sends)
    names = SchoolThreadRepository(client=_admin()).user_names(
        s.get('sent_by') for s in sends)
    for s in sends:
        st = stats.get(s['id']) or {}
        s['recipient_count'] = st.get('recipient_count') or 0
        s['read_count'] = st.get('read_count') or 0
        s['skipped_count'] = st.get('skipped_count') or 0
        s['sent_by_name'] = full_name(names.get(s.get('sent_by')), 'Staff') if s.get('sent_by') else None
    return sends


def send_detail(org_id: str, send_id: str) -> Optional[Dict[str, Any]]:
    """One send with every recipient: name, kind, and when they read it."""
    from repositories.school_thread_repository import SchoolThreadRepository
    from utils.person_name import full_name
    repo = _repo()
    send = repo.get_send(org_id, send_id)
    if not send:
        return None
    rows = repo.recipient_status(send_id)
    names = SchoolThreadRepository(client=_admin()).user_names(r['user_id'] for r in rows)
    recipients = [{**r, 'name': full_name(names.get(r['user_id']), 'Someone')} for r in rows]
    # Unread first: they are who the office is looking for.
    recipients.sort(key=lambda r: (r['status'] != 'sent', r.get('read_at') is not None,
                                   (r['name'] or '').lower()))
    sent = [r for r in recipients if r['status'] == 'sent']
    return {**send, 'recipients': recipients, 'recipient_count': len(sent),
            'read_count': sum(1 for r in sent if r.get('read_at'))}
