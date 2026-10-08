"""
A teacher working with one student: quests given to that student by name,
outside any class, and the student's whole quest list as a teacher sees it.

Microschools teach one child at a time as often as they teach a class (Tanner,
2026-10-07: "we need a more individual option where school teachers can assign
quests to individual students and work with them that way"). The console only
knew the class -- put students in a class, assign quests to the class -- and
the one door for a single student, the office's library Give, wrote only the
enrollment. Nothing remembered who gave the quest or when it was due, and the
submissions inbox, which keys off class_quests, never saw the work.

The assignment is a student_quest_assignments row (one per student and quest).
The enrollment it causes is the ordinary one, written by the same
enroll_students_in_quests the class assign and the library Give use, so the
quest reads like any other in the student's account and the guardians get the
same notice. Taking it back is remove_quest_for_student, the office's Remove:
untouched enrollments are deleted, ones with work are set down, finished ones
are left alone, and a quest the student also has through a class stays.

Who may: any staff member of the student's school (the org_staff relationship
on every route). At a microschool every teacher works with every child, and
that was the decision (2026-10-07: "Any student in their school").

Data access is repositories/student_quest_assignment_repository.py.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from repositories.class_quest_audience_repository import ClassQuestAudienceRepository
from repositories.student_quest_assignment_repository import StudentQuestAssignmentRepository
from services.class_quest_enrollment import (
    assigned_to,
    enroll_students_in_quests,
    reactivate_set_down,
    remove_quest_for_student,
)
from utils.logger import get_logger
from utils.timestamps import now_iso

logger = get_logger(__name__)


class AssignmentError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message, self.status = message, status


def quest_available_to(quest: Optional[Dict[str, Any]], org_id: str) -> bool:
    """The school's own live quest, or a live one from the shared Optio library.

    The same line the library Give and the class assign hold: never another
    school's quest.
    """
    if not quest:
        return False
    return bool(quest.get('is_active')) and (
        quest.get('organization_id') == org_id
        or (quest.get('organization_id') is None and bool(quest.get('is_public'))))


def parse_due_date(value) -> Optional[str]:
    """A due date from the client as an ISO timestamp, None for none.

    Accepts a date (YYYY-MM-DD, read as the end of that day UTC, so "due
    Friday" is not overdue on Friday morning) or a full timestamp. Anything
    else is a 400 rather than a silently dropped date.
    """
    if value in (None, ''):
        return None
    text = str(value).strip()
    try:
        if len(text) == 10:
            day = datetime.strptime(text, '%Y-%m-%d')
            return day.replace(hour=23, minute=59, second=59, tzinfo=timezone.utc).isoformat()
        parsed = datetime.fromisoformat(text.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.isoformat()
    except ValueError as e:
        raise AssignmentError('Due date must be a date like 2026-10-31.') from e


# ── giving and taking back ────────────────────────────────────────────────────

def assign(admin, org_id: str, student_id: str, quest_id: str, assigned_by: str,
           due_date: Optional[str] = None) -> Dict[str, Any]:
    """Give one student one quest. Idempotent.

    Returns {'assignment': row, 'enrolled': bool, 'reactivated': bool,
    'already_had_it': bool}. A student already on the quest keeps their
    enrollment and its work; one who set it down gets it back on their list,
    because a teacher assigning it means "this is on your plate again".
    """
    repo = StudentQuestAssignmentRepository(admin)
    quest = repo.quests([quest_id]).get(quest_id)
    if not quest_available_to(quest, org_id):
        raise AssignmentError('That quest is not available to assign.', 404)

    row = repo.upsert(org_id, student_id, quest_id, assigned_by, due_date)
    result = enroll_students_in_quests(admin, [student_id], [quest_id])
    reactivated = reactivate_set_down(admin, [student_id], quest_id)

    enrollments = ClassQuestAudienceRepository(admin).enrollments([student_id], quest_id)
    repo.stamp_enrolled_by([e['id'] for e in enrollments], assigned_by)

    logger.info(f'Teacher {assigned_by[:8]} assigned quest {quest_id[:8]} '
                f'to student {student_id[:8]}: {result}')
    return {
        'assignment': row,
        'enrolled': bool(result.get('enrolled')),
        'reactivated': bool(reactivated),
        'already_had_it': bool(result.get('skipped_existing')) and not reactivated,
    }


def set_due_date(admin, student_id: str, quest_id: str, due_date: Optional[str]) -> Dict[str, Any]:
    repo = StudentQuestAssignmentRepository(admin)
    row = repo.find(student_id, quest_id)
    if not row:
        raise AssignmentError('That quest was not assigned to this student individually.', 404)
    repo.set_due_date(row['id'], due_date, now_iso())
    return {**row, 'due_date': due_date}


def unassign(admin, student_id: str, quest_id: str) -> Dict[str, Any]:
    """Take an individually assigned quest back, as far as the student's work allows."""
    repo = StudentQuestAssignmentRepository(admin)
    row = repo.find(student_id, quest_id)
    if not row:
        raise AssignmentError('That quest was not assigned to this student individually.', 404)
    repo.delete(row['id'])
    taken = remove_quest_for_student(admin, student_id, quest_id)
    return taken or {'removed': 0, 'set_down': 0, 'kept': 0, 'still_on_classes': []}


# ── the student's quests, as a teacher sees them ──────────────────────────────

def _pick(rows):
    """The enrollment that speaks for a quest: the active one, then the newest."""
    return max(rows, key=lambda r: (bool(r.get('is_active')),
                                    r.get('last_picked_up_at') or r.get('started_at')
                                    or r.get('created_at') or ''))


def student_work(admin, student_id: str) -> List[Dict[str, Any]]:
    """Every quest in the student's account, with where it came from and each task.

    Where it came from: 'individual' when a teacher gave it to them by name
    (with its due date and who gave it), the class names when it reaches them
    through a class, both when both. A quest with neither is one they took on
    themselves or a parent added -- still their work, listed last.

    Set-down quests are included with set_aside True, so a teacher can see what
    a student moved on from; the page keeps them out of the main list.
    """
    repo = StudentQuestAssignmentRepository(admin)
    class_repo = ClassQuestAudienceRepository(admin)

    assignments = {a['quest_id']: a for a in repo.for_student(student_id)}
    by_quest: Dict[str, List[Dict[str, Any]]] = {}
    for e in repo.student_enrollments(student_id):
        by_quest.setdefault(e['quest_id'], []).append(e)
    enrollment = {qid: _pick(rows) for qid, rows in by_quest.items()}

    quest_ids = sorted(set(enrollment) | set(assignments))
    if not quest_ids:
        return []
    quests = repo.quests(quest_ids)

    class_ids = class_repo.student_active_class_ids(student_id)
    class_names = class_repo.class_names(class_ids)
    via_class: Dict[str, List[str]] = {}
    for link in class_repo.links_for_quests(class_ids, quest_ids):
        if assigned_to(link, student_id):
            via_class.setdefault(link['quest_id'], []).append(
                class_names.get(link['class_id']) or 'Class')

    tasks = repo.tasks([e['id'] for e in enrollment.values()])
    done = repo.completions([t['id'] for t in tasks])
    tasks_by_uq: Dict[str, List[Dict[str, Any]]] = {}
    for t in tasks:
        tasks_by_uq.setdefault(t['user_quest_id'], []).append(t)

    people = {u['id']: u for u in class_repo.named_users(sorted(
        {a['assigned_by'] for a in assignments.values() if a.get('assigned_by')}
        | {t['created_by_user_id'] for t in tasks if t.get('created_by_user_id')}))}

    from utils import person_name

    def name_of(uid):
        return person_name.full_name(people[uid], 'Staff') if uid in people else None

    out = []
    for qid in quest_ids:
        quest = quests.get(qid) or {}
        uq = enrollment.get(qid)
        own = tasks_by_uq.get(uq['id'], []) if uq else []
        a = assignments.get(qid)
        finished = [t for t in own if t['id'] in done]
        last_done = max((done[t['id']].get('completed_at') or '' for t in finished), default='')
        out.append({
            'quest_id': qid,
            'title': quest.get('title') or 'Untitled quest',
            'description': quest.get('description'),
            'image_url': quest.get('image_url'),
            'own_quest': quest.get('organization_id') is not None,
            'individual': ({
                'due_date': a.get('due_date'),
                'assigned_by': a.get('assigned_by'),
                'assigned_by_name': name_of(a.get('assigned_by')),
                'assigned_at': a.get('created_at'),
            } if a else None),
            'classes': sorted(via_class.get(qid, [])),
            'started': bool(uq),
            'completed_at': (uq or {}).get('completed_at'),
            'set_aside': bool(uq) and (uq or {}).get('is_active') is False
                         and not (uq or {}).get('completed_at'),
            'tasks_done': len(finished),
            'tasks_total': len(own),
            'xp_earned': sum(t.get('xp_value') or 0 for t in finished),
            'last_activity_at': last_done or None,
            'tasks': [{
                'id': t['id'],
                'title': t.get('title'),
                'description': t.get('description'),
                'xp_value': t.get('xp_value'),
                'done': t['id'] in done,
                'completion_id': (done.get(t['id']) or {}).get('id'),
                'added_by_name': (name_of(t['created_by_user_id'])
                                  if t.get('created_by_user_id') else None),
                # A teacher may take back a task a teacher or parent added, while
                # it is not done. Template copies are the quest itself.
                'removable': bool(t.get('created_by_user_id')) and t['id'] not in done,
            } for t in own],
        })

    def order(q):
        due = (q['individual'] or {}).get('due_date') or '9999'
        return (q['completed_at'] is not None, q['set_aside'], q['individual'] is None,
                due, q['title'].lower())
    out.sort(key=order)
    return out


def remove_teacher_task(admin, student_id: str, task_id: str) -> None:
    """Take back a task someone added to this student's quest, while it is undone."""
    repo = StudentQuestAssignmentRepository(admin)
    task = repo.task(task_id)
    if task is None or task.get('user_id') != student_id:
        raise AssignmentError('Task not found', 404)
    if not task.get('created_by_user_id'):
        raise AssignmentError("That task is part of the quest itself, so it can't be removed here.", 409)
    if repo.completions([task_id]):
        raise AssignmentError('That task is already done, so it stays.', 409)
    repo.delete_task(task_id)
