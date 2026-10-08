"""
A teacher working with one student, outside any class.

  GET    /api/sis/student-work/students                     the school's students,
                                                            with their individual quests
  GET    /api/sis/student-work/students/<sid>               one student's quests, task by task
  GET    /api/sis/student-work/students/<sid>/assignable-quests?search=
                                                            quests a teacher can give them
  POST   /api/sis/student-work/students/<sid>/quests        give one ({quest_id, due_date?})
  POST   /api/sis/student-work/students/<sid>/quests/<qid>/publish
                                                            publish a quest the editor
                                                            started for them, and give it
  PATCH  /api/sis/student-work/students/<sid>/quests/<qid>  change its due date
  DELETE /api/sis/student-work/students/<sid>/quests/<qid>  take it back
  POST   /api/sis/student-work/students/<sid>/quests/<qid>/tasks
                                                            write a task for this student
  DELETE /api/sis/student-work/students/<sid>/tasks/<tid>   take back an added task

Microschools teach one child at a time as often as a class, and the console
only knew the class (2026-10-07). The rules live in
services/student_quest_assignments.py; this file is the gate.

STAFF_ROLES plus the org_staff relationship on every student id: any staff
member of the student's school, which is the decision for microschools ("Any
student in their school"). A superadmin passes the relationship check for
everyone, so the student is also checked against the org the request resolved
to -- an id from another school is a 404, never a cross-school write.
"""

from flask import Blueprint, jsonify, request

from services import sis_service
from services import student_quest_assignments as assignments
from services.student_quest_assignments import AssignmentError
from utils.auth.decorators import require_role
from utils.auth.relationships import require_relationship_to
from utils.logger import get_logger
from utils.sis_roles import STAFF_ROLES
from utils.validation import validate_uuid

logger = get_logger(__name__)

bp = Blueprint('sis_student_work', __name__, url_prefix='/api/sis/student-work')

# admin client justified: a teacher reads and writes another user's enrollment,
#   tasks and the deny-all student_quest_assignments table; the route's
#   STAFF_ROLES + org_staff relationship + same-org student check is the
#   authorization
from utils.admin_client import admin_client as _admin  # noqa: E402

MAX_TASK_XP = 200
SEARCH_LIMIT = 40


def _bad_uuid(value):
    ok, _ = validate_uuid(value or '')
    return not ok


def _err(e: AssignmentError):
    return jsonify({'success': False, 'error': e.message}), e.status


def _student_or_error(user_id, student_id):
    """(org_id, student_row, error). The student must be at the caller's school."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return None, None, err
    if _bad_uuid(student_id):
        return None, None, (jsonify({'success': False, 'error': 'Student not found'}), 404)
    from utils import person_name
    rows = (_admin().table('users')
            .select('id, organization_id, role, org_role, org_roles, avatar_url, '
                    + person_name.USER_NAME_FIELDS)
            .eq('id', student_id).limit(1).execute()).data or []
    if not rows or rows[0].get('organization_id') != org_id or not sis_service.is_student(rows[0]):
        return None, None, (jsonify({'success': False, 'error': 'Student not found'}), 404)
    return org_id, rows[0], None


@bp.route('/students', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_students(user_id):
    """The school's current students, each with how many quests they have from
    a teacher by name and how many of those are still open."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'students': sis_service.students_for_individual_work(org_id)})


@bp.route('/students/<student_id>', methods=['GET'])
@require_role(*STAFF_ROLES)
@require_relationship_to('student_id', allow=('org_staff',), discloses='progress')
def student_detail(user_id, student_id):
    org_id, student, err = _student_or_error(user_id, student_id)
    if err:
        return err
    from services.notification_service import NotificationService
    from utils import person_name
    from utils.storage_urls import sign_in_place
    guardians = [
        {'id': p['id'], 'name': person_name.full_name(p, 'Parent')}
        for p in (NotificationService().get_parents_for_student(student_id) or [])
        if p.get('id')
    ]
    out = {'id': student['id'], 'name': person_name.full_name(student, 'Student'),
           'avatar_url': student.get('avatar_url')}
    sign_in_place([out], ['avatar_url'])
    return jsonify({
        'success': True,
        'student': out,
        'guardians': guardians,
        'quests': assignments.student_work(_admin(), student_id),
    })


@bp.route('/students/<student_id>/assignable-quests', methods=['GET'])
@require_role(*STAFF_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def assignable_quests(user_id, student_id):
    """Quests a teacher can give this student, nearest first.

    With no search: the teacher's own quests and the school's newest. A search
    also reaches the shared Optio library -- the same "type to look further
    afield" rule the class picker settled on (routes/sis/class_quests.py,
    assignable_quests), because a flat list of every library quest buries the
    school's own.
    """
    org_id, _student, err = _student_or_error(user_id, student_id)
    if err:
        return err
    search = (request.args.get('search') or '').strip()[:100]
    admin = _admin()
    cols = 'id, title, description, organization_id, created_by, image_url, created_at'

    def _q(base):
        if search:
            base = base.ilike('title', f'%{search}%')
        return base.order('created_at', desc=True).limit(SEARCH_LIMIT).execute().data or []

    rows = _q(admin.table('quests').select(cols)
              .eq('organization_id', org_id).eq('is_active', True))
    if search:
        rows += _q(admin.table('quests').select(cols)
                   .is_('organization_id', 'null').eq('is_active', True).eq('is_public', True))

    have = {r['quest_id']: r for r in (admin.table('user_quests')
            .select('quest_id, is_active, completed_at').eq('user_id', student_id)
            .execute()).data or []}

    out = []
    for q in rows:
        held = have.get(q['id'])
        out.append({
            'id': q['id'],
            'title': q.get('title') or 'Untitled quest',
            'description': q.get('description'),
            'image_url': q.get('image_url'),
            'scope': ('mine' if q.get('created_by') == user_id
                      else 'school' if q.get('organization_id') else 'library'),
            'has_it': bool(held) and held.get('is_active') is not False and not held.get('completed_at'),
            'finished_it': bool(held) and bool(held.get('completed_at')),
        })
    rank = {'mine': 0, 'school': 1, 'library': 2}
    out.sort(key=lambda q: rank[q['scope']])
    return jsonify({'success': True, 'quests': out})


@bp.route('/students/<student_id>/quests', methods=['POST'])
@require_role(*STAFF_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def give_quest(user_id, student_id):
    """Body: {quest_id, due_date?}. Idempotent per student and quest."""
    org_id, _student, err = _student_or_error(user_id, student_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    quest_id = (data.get('quest_id') or '').strip()
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Pick a quest.'}), 400
    try:
        due = assignments.parse_due_date(data.get('due_date'))
        result = assignments.assign(_admin(), org_id, student_id, quest_id, user_id, due)
    except AssignmentError as e:
        return _err(e)
    return jsonify({'success': True, **result}), 201


@bp.route('/students/<student_id>/quests/<quest_id>/publish', methods=['POST'])
@require_role(*STAFF_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def publish_for_student(user_id, student_id, quest_id):
    """Publish a draft the quest editor started for this student, and give it to them.

    Body: {due_date?}. Only the draft's author or the office may publish it
    (quest_edit_rules), the rule every other screen's publish follows. The
    quest becomes one of the school's quests like any other, so it can be
    given to another student or put on a class later.
    """
    org_id, _student, err = _student_or_error(user_id, student_id)
    if err:
        return err
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Quest not found'}), 404
    from repositories.quest_editor_repository import QuestEditorRepository
    from services import quest_edit_rules
    from services.sis_quest_authoring import QuestAuthoringError, publish_draft
    admin = _admin()
    quest = QuestEditorRepository(client=admin).get_quest(quest_id)
    if not quest or quest.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Quest not found'}), 404
    if not quest_edit_rules.can_edit_quest(user_id, quest):
        return jsonify({'success': False, 'error': quest_edit_rules.refusal(quest)}), 403
    data = request.get_json(silent=True) or {}
    try:
        due = assignments.parse_due_date(data.get('due_date'))
        publish_draft(admin, quest)
        result = assignments.assign(admin, org_id, student_id, quest_id, user_id, due)
    except QuestAuthoringError as e:
        return jsonify({'success': False, 'error': e.message}), e.status
    except AssignmentError as e:
        return _err(e)
    return jsonify({'success': True, 'quest_id': quest_id, **result})


@bp.route('/students/<student_id>/quests/<quest_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def change_due_date(user_id, student_id, quest_id):
    """Body: {due_date} -- a date, or null to clear it."""
    _org_id, _student, err = _student_or_error(user_id, student_id)
    if err:
        return err
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Quest not found'}), 404
    data = request.get_json(silent=True) or {}
    if 'due_date' not in data:
        return jsonify({'success': False, 'error': 'Nothing to change.'}), 400
    try:
        due = assignments.parse_due_date(data.get('due_date'))
        row = assignments.set_due_date(_admin(), student_id, quest_id, due)
    except AssignmentError as e:
        return _err(e)
    return jsonify({'success': True, 'assignment': row})


@bp.route('/students/<student_id>/quests/<quest_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def take_back_quest(user_id, student_id, quest_id):
    _org_id, _student, err = _student_or_error(user_id, student_id)
    if err:
        return err
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Quest not found'}), 404
    try:
        result = assignments.unassign(_admin(), student_id, quest_id)
    except AssignmentError as e:
        return _err(e)
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>/quests/<quest_id>/tasks', methods=['POST'])
@require_role(*STAFF_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def add_task(user_id, student_id, quest_id):
    """A task the teacher writes for this one student, on a quest they have.

    Body: {title, description?, xp_value?, success_criteria?, diploma_subjects?}.
    Stored by persist_accepted_task, the one writer the student's own accept
    and a parent's added task use, so it carries the same subject
    classification and XP policy. Not saved to the quest's task library: it is
    for this student, not a suggestion for everyone on the quest.
    """
    _org_id, _student, err = _student_or_error(user_id, student_id)
    if err:
        return err
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Quest not found'}), 404
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'success': False, 'error': 'Give the task a title.'}), 400
    try:
        xp_value = int(data.get('xp_value') or 50)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'XP must be a number.'}), 400
    if not 1 <= xp_value <= MAX_TASK_XP:
        return jsonify({'success': False, 'error': f'XP must be between 1 and {MAX_TASK_XP}.'}), 400

    admin = _admin()
    enrolled = (admin.table('user_quests').select('id, is_active, completed_at')
                .eq('user_id', student_id).eq('quest_id', quest_id).execute()).data or []
    if not any(e.get('is_active') is not False and not e.get('completed_at') for e in enrolled):
        return jsonify({'success': False,
                        'error': 'The student is not working on that quest right now.'}), 409

    from routes.quest_personalization import persist_accepted_task
    from services.subject_classification_service import SubjectClassificationService
    from utils.xp_permissions import get_effective_role_for

    task = {
        'title': title[:200],
        'description': (data.get('description') or '').strip(),
        'pillar': None,
        'xp_value': xp_value,
        'success_criteria': data.get('success_criteria'),
        'diploma_subjects': data.get('diploma_subjects') or {},
    }
    inserted = persist_accepted_task(
        admin, SubjectClassificationService(), student_id, quest_id, task,
        save_to_library=False,
        caller_role=get_effective_role_for(user_id),
        created_by_user_id=user_id,
    )
    if inserted is None:
        raise RuntimeError(f'Task insert returned nothing for student {student_id}')
    logger.info(f'Staff {user_id[:8]} added a task for {student_id[:8]} on quest {quest_id[:8]}')
    return jsonify({'success': True, 'task': inserted}), 201


@bp.route('/students/<student_id>/tasks/<task_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def remove_task(user_id, student_id, task_id):
    _org_id, _student, err = _student_or_error(user_id, student_id)
    if err:
        return err
    if _bad_uuid(task_id):
        return jsonify({'success': False, 'error': 'Task not found'}), 404
    try:
        assignments.remove_teacher_task(_admin(), student_id, task_id)
    except AssignmentError as e:
        return _err(e)
    return jsonify({'success': True})
