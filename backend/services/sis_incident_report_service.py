"""
Incident reports: any staff member files one, and it lands on an office
person's task list.

Katrine Myers (iCreate campus coordinator), 2026-09-24, ticket a26d9daf:
"Reporting an incident used to be in task manager. I don't see it there
anymore. Cameron Stobbe is the second child to get his finger smashed in the
big glass doors. I need to get that in an incident report."

The built-in "Incident report" form (sis_form_submissions, form_type
'incident') was retired with the other forms on 2026-09-23 (9296270f) and its
history became tasks (20260924105000_release_forms_into_tasks.sql). Tasks are
assigned by the office, though, and a step is a checkbox with no answer, so
nothing replaced FILING one -- and four of the five incident reports on record
were filed by teachers.

This brings the form back as a staff tool that writes a task, the way the old
form landed in the office's queue:

  - any staff member (STAFF_ROLES) files it; the reporter is the assigner;
  - the assignee is an office person (org_admin or campus coordinator of the
    same school), chosen on the form, defaulting to the school's setting
    sis_settings.incident_report_recipient_id;
  - the answers become labelled lines in the task's description, in the same
    "Label: value" style the release migration used ("Where:", "When:",
    "About:"), because the task has no columns for them;
  - it goes through sis_onboarding_service.assign_task, the one door every
    task goes through, so the assignee is notified (in-app and email) exactly
    as for any other task.

Every incident task's title starts with INCIDENT_TITLE, which is how the
office's Assigned view search and the reporter's "Incident reports you filed"
list find them.
"""

import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from services import sis_onboarding_service as onboarding
from services import sis_service
from utils import person_name
from utils.logger import get_logger

logger = get_logger(__name__)

# admin client justified: the reporter is a teacher who cannot read the
#   school's office staff or its students under RLS; the route's STAFF_ROLES +
#   org gate is the authorization, and every id is checked against the org here
from utils.admin_client import admin_client as _admin

INCIDENT_TITLE = 'Incident report'

# The per-school default office person, in organizations.feature_flags.sis_settings.
SETTING_KEY = 'incident_report_recipient_id'

# Who may receive an incident report: the front office of the school. Org
# roles, not the SIS route tiers -- superadmin is not a member of any school
# and cannot hold a task there (assert_recipients_in_org).
RECIPIENT_ORG_ROLES = frozenset({'org_admin', 'campus_coordinator'})

MAX_STUDENTS = 20

# Field limits. Generous: an incident narrative can run long, and a truncated
# record is worse than a long one.
_LIMITS = {
    'what_happened': 5000,
    'location': 300,
    'injury': 1000,
    'response': 2000,
    'parent_notified_detail': 1000,
    'witnesses': 1000,
}

_TAG_RE = re.compile(r'<[^>]*>')


def clean_text(value: Any, limit: int) -> str:
    """Plain text for a labelled line: no tags, no null bytes, each line's
    whitespace normalised, blank lines collapsed, capped at `limit`.

    Not HTML-escaped: the description is rendered by React as text, and
    escaping here would show "O&#x27;Brien" on screen (utils/validation/
    sanitization.sanitize_text says the same). Line breaks are kept, which is
    the one thing sanitize_text would take away from a narrative.
    """
    if value is None:
        return ''
    text = _TAG_RE.sub('', str(value)).replace('\x00', '')
    lines = [' '.join(line.split()) for line in text.splitlines()]
    out: List[str] = []
    for line in lines:
        if line or (out and out[-1]):
            out.append(line)
    return '\n'.join(out).strip()[:limit].strip()


def _name(u: Dict[str, Any]) -> str:
    return person_name.full_name(u, 'Unnamed')


def _users(ids: List[str]) -> Dict[str, Dict[str, Any]]:
    ids = [i for i in dict.fromkeys(ids) if i]
    if not ids:
        return {}
    from repositories.user_repository import UserRepository
    return UserRepository(client=_admin()).find_by_ids(
        ids, select_fields=('id, organization_id, role, org_role, org_roles, '
                            + person_name.USER_NAME_FIELDS))


def _is_recipient(u: Optional[Dict[str, Any]], org_id: str) -> bool:
    """An org_admin or campus coordinator of THIS school with a real login."""
    if not u or u.get('organization_id') != org_id:
        return False
    if sis_service.is_placeholder_staff_email(u.get('email')):
        return False
    return bool(RECIPIENT_ORG_ROLES & set(sis_service._user_org_roles(u)))


def valid_recipient(org_id: str, user_id: Optional[str]) -> bool:
    """Whether this person may receive an incident report for this school.
    Also the check the settings PATCH runs before storing the default."""
    if not user_id or not isinstance(user_id, str):
        return False
    return _is_recipient(_users([user_id]).get(user_id), org_id)


# ── What the form needs ──────────────────────────────────────────────────────

def recipients(org_id: str) -> List[Dict[str, Any]]:
    """The office people a report can go to: the school's org admins and
    campus coordinators, archived and placeholder staff left out."""
    out = []
    for s in sis_service.list_org_staff(org_id):
        roles = set(s.get('roles') or [])
        if not (roles & RECIPIENT_ORG_ROLES) or s.get('is_placeholder'):
            continue
        out.append({'id': s['id'], 'name': s.get('name'),
                    'role_labels': [sis_service._STAFF_ROLE_LABEL.get(r, r)
                                    for r in (s.get('roles') or [])
                                    if r in RECIPIENT_ORG_ROLES]})
    out.sort(key=lambda p: (p.get('name') or '').lower())
    return out


def stored_default(org_id: str) -> Optional[str]:
    """The id in the school's setting, as stored (may be stale)."""
    from repositories.organization_repository import OrganizationRepository
    org = OrganizationRepository(client=_admin()).find_by_id(org_id) or {}
    settings = ((org.get('feature_flags') or {}).get('sis_settings') or {})
    value = settings.get(SETTING_KEY)
    return value if isinstance(value, str) and value else None


def default_recipient_id(org_id: str) -> Optional[str]:
    """The school's default office person, if it is still one. A coordinator
    who has since left or lost the role is no default at all: the reporter
    must pick, rather than the report landing on somebody who cannot act."""
    value = stored_default(org_id)
    return value if valid_recipient(org_id, value) else None


def form_options(org_id: str, include_students: bool = True) -> Dict[str, Any]:
    """Everything the form offers: the office people, the default one, and
    the school's students (id and name only -- the picker needs nothing else,
    and a teacher is not otherwise shown the whole roster)."""
    people = recipients(org_id)
    default = stored_default(org_id)
    if default not in {p['id'] for p in people}:
        default = None
    out: Dict[str, Any] = {'recipients': people, 'default_recipient_id': default}
    if include_students:
        out['students'] = onboarding.list_recipients(org_id, 'student')
    return out


# ── Filing ───────────────────────────────────────────────────────────────────

def _when(value: Any) -> Optional[str]:
    """'Thu Sep 24, 2026, 10:30 AM' from the form's local date-time.

    The form sends the wall-clock time the reporter picked (an
    <input type=datetime-local>, no zone); it is written as they read it, not
    converted, so the record says what the teacher saw on the clock.
    """
    raw = str(value or '').strip()
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
    except ValueError:
        return None
    hour = dt.hour % 12 or 12
    return (f"{dt.strftime('%a %b')} {dt.day}, {dt.year}, "
            f"{hour}:{dt.minute:02d} {'AM' if dt.hour < 12 else 'PM'}")


def build_title(student_names: List[str]) -> str:
    if not student_names:
        return INCIDENT_TITLE
    shown = student_names[:3]
    rest = len(student_names) - len(shown)
    return f"{INCIDENT_TITLE}: {', '.join(shown)}" + (f' and {rest} more' if rest else '')


def build_description(answers: Dict[str, str], student_names: List[str],
                      when: str, reporter_name: str) -> str:
    """The answers as labelled lines, the release migration's style."""
    notified = answers.get('parent_notified')
    notified_line = None
    if notified in ('yes', 'no'):
        notified_line = 'Yes' if notified == 'yes' else 'No'
        if answers.get('parent_notified_detail'):
            notified_line += f" -- {answers['parent_notified_detail']}"
    elif answers.get('parent_notified_detail'):
        notified_line = answers['parent_notified_detail']
    lines = [
        ('What happened', answers.get('what_happened')),
        ('About', ', '.join(student_names) if student_names else None),
        ('When', when),
        ('Where', answers.get('location')),
        ('Injury', answers.get('injury')),
        ('First aid / response', answers.get('response')),
        ('Parent/guardian notified', notified_line),
        ('Witnesses', answers.get('witnesses')),
        ('Reported by', reporter_name),
    ]
    return '\n\n'.join(f'{label}: {value}' for label, value in lines if value)


def file_report(org_id: str, reporter_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate the form and write ONE task for the office person.

    Returns {'task': {...}} or {'error', 'status'}. Nothing is written on any
    error: every check runs before assign_task.
    """
    data = data if isinstance(data, dict) else {}
    answers = {k: clean_text(data.get(k), limit) for k, limit in _LIMITS.items()}
    if not answers['what_happened']:
        return {'error': 'Say what happened', 'status': 400}
    notified = str(data.get('parent_notified') or '').strip().lower()
    answers['parent_notified'] = notified if notified in ('yes', 'no') else ''

    when = _when(data.get('occurred_at'))
    if not when:
        return {'error': 'Give the date and time it happened', 'status': 400}

    raw_students = data.get('student_ids') or []
    if not isinstance(raw_students, list):
        return {'error': 'student_ids must be a list', 'status': 400}
    student_ids = [str(s) for s in dict.fromkeys(raw_students) if s]
    if len(student_ids) > MAX_STUDENTS:
        return {'error': f'At most {MAX_STUDENTS} students on one report', 'status': 400}

    recipient_id = str(data.get('recipient_id') or '').strip() or default_recipient_id(org_id)
    if not recipient_id:
        return {'error': 'Choose who in the office gets this report', 'status': 400}

    people = _users([recipient_id, reporter_id, *student_ids])
    if not _is_recipient(people.get(recipient_id), org_id):
        return {'error': 'That person cannot receive incident reports for this school',
                'status': 400}
    students = []
    for sid in student_ids:
        u = people.get(sid)
        if not u or u.get('organization_id') != org_id or not sis_service.is_student(u):
            return {'error': 'One of those students is not at this school', 'status': 400}
        students.append(u)

    student_names = [_name(u) for u in students]
    reporter_name = _name(people.get(reporter_id) or {})
    title = build_title(student_names)
    description = build_description(answers, student_names, when, reporter_name)

    result = onboarding.assign_task(
        org_id, reporter_id, [{'id': recipient_id, 'audience': 'staff'}],
        title=title, description=description,
        # A step of its own so the report lives in the task's description --
        # the shape the migrated incident reports have -- and the office
        # person ticks it when they have followed up.
        items=[{'title': 'Review and follow up on this incident'}],
        audience='staff')
    if result.get('error'):
        return {'error': result['error'], 'status': 400}
    rows = result.get('tasks') or []
    if not rows or result.get('errors'):
        return {'error': 'Could not file the report', 'status': 500}

    from services import sis_tasks_service as tasks
    recipient_name = _name(people.get(recipient_id) or {})
    task = tasks.shape_task(rows[0], {recipient_id: recipient_name,
                                      reporter_id: reporter_name})
    logger.info(f'[Incident] filed by {str(reporter_id)[:8]} for org {org_id} '
                f'to {str(recipient_id)[:8]} ({len(students)} student(s))')
    return {'task': task, 'recipient_name': recipient_name}


def filed_by(org_id: str, reporter_id: str) -> List[Dict[str, Any]]:
    """The incident reports this person filed, newest first, in the task
    shape. The reporter is the task's assigner, and may_see_task already lets
    an assigner open it."""
    from repositories.sis_task_repository import SisTaskRepository
    from services import sis_tasks_service as tasks
    rows = SisTaskRepository(client=_admin()).filed_by(org_id, reporter_id, INCIDENT_TITLE)
    names = {uid: _name(u) for uid, u in
             _users([str(r['user_id']) for r in rows if r.get('user_id')] + [reporter_id]).items()}
    return [tasks.shape_task(r, names) for r in rows]
