"""
SIS quest library -- every quest the school owns, in one list, with where each
one is in use and a way to put it somewhere from there.

  GET  /api/sis/quests                          the org's quests, with their
                                                curricula, classes and task count
  POST /api/sis/quests                          author a new one (optionally
                                                straight onto a curriculum)
  POST /api/sis/quests/<quest_id>/curricula     put one on a curriculum
  POST /api/sis/quests/<quest_id>/students      give one to named students
  PATCH/GET/POST/PUT/DELETE
       /api/sis/quests/<quest_id>[/tasks...]    edit the quest and its tasks
  POST /api/sis/quests/<quest_id>/duplicate     copy it, tasks and all

Why a page of its own. Quests were reachable only through the curriculum that
carried them: open Curriculum, expand an entry, find the quest. A quest on no
curriculum yet (one a teacher built on a class, one a draft made) was not
reachable at all. Molly (iCreate, a8a7b051 / f9b5f2ea, 2026-09-14): "I'd like
it to be a separate tab under operations. And from there, all the quests would
be listed, and we can assign them as needed from there."

What "assign" means here is what it means everywhere else on the SIS, and the
two writes are the ones those screens already make: putting a quest on a
curriculum inserts the same sis_curriculum_quests row the curriculum page
inserts (services.sis_curriculum_sync.attach_quest_to_curriculum, shared with
routes/sis/curriculum.py) but, unlike the curriculum page, does not push it
to that curriculum's classes -- Molly, a933ee02: "Attach to a curriculum
should not assign it to all the classes"; putting a quest on a class is the class page's own
POST /api/sis/classes/<id>/quests, which the library page calls directly, so a
release date, a due date and an audience mean the same thing from either
door.

Editing used to stay where the quest lived -- follow the row's link to its
curriculum and edit it there -- which left the quests this page exists for
with nowhere to be edited at all, since a quest on no curriculum has no link
to follow. Molly (iCreate, 2026-09-22): "There's no way to edit a quest that I
can see. I'd also love to be able to duplicate quests." The editing routes
below are the curriculum tab's, scoped by ownership instead of a curriculum
link; everything after the gate is shared
(services/sis_quest_task_editing.py), so the two screens cannot drift.

The third door, students by name, is Dallin's (iCreate, 293c4d99, 2026-09-18:
"Can we assign quests to individuals too?"). A class quest can already be kept
to some of its roster (the audience, 2026-09-11), but that needs a class, and
the student who needs one quest is often the one in no class that carries it.
This enrolls the named students directly, through the same
enroll_students_in_quests the class assign and the publish sweep use, so the
quest lands in each account like any other and the guardians get the same
notice. No class_quests row: there is no class.

ADMIN_ROLES throughout, like the curriculum library it sits beside. A teacher
edits quests on the classes they teach; the school-wide list is the office's.
Data access is repositories/sis_quest_library_repository.py.
"""

from flask import Blueprint, request, jsonify

from repositories.sis_quest_library_repository import SisQuestLibraryRepository
from services import sis_service
from services.class_quest_enrollment import enroll_students_in_quests
from services.sis_curriculum_sync import attach_quest_to_curriculum
from services import sis_quest_task_editing as task_editing
from services.sis_quest_authoring import (
    QuestAuthoringError, create_org_quest, duplicate_org_quest,
)
from services.sis_quest_task_editing import QuestTaskEditError
from utils.auth.decorators import require_role
from utils.logger import get_logger
from utils.person_name import full_name
from utils.sis_roles import ADMIN_ROLES
from utils.validation import validate_uuid

logger = get_logger(__name__)

bp = Blueprint('sis_quest_library', __name__, url_prefix='/api/sis')

# admin client justified: the SIS console acts for the whole school -- this
#   reads rows belonging to every class and curriculum in the org, which no
#   single caller can see under RLS; the route's role+org gate is the authorization
from utils.admin_client import admin_client as _admin


def _repo() -> SisQuestLibraryRepository:
    return SisQuestLibraryRepository(client=_admin())


def _bad_uuid(value):
    ok, _ = validate_uuid(value or '')
    return not ok


def _made_by(creator):
    """{name, teacher} for a quest's author; the school itself when unknown.

    Teacher-made means an advisor wrote it. An org admin, a coordinator or a
    superadmin working in the console is the office, and so is a quest whose
    author is gone: the school owns it either way.
    """
    if not creator:
        return {'id': None, 'name': None, 'teacher': False}
    return {'id': creator['id'], 'name': full_name(creator, fallback='Staff'),
            'teacher': creator.get('org_role') == 'advisor'}


@bp.route('/quests', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_org_quests(user_id):
    """The school's own quests, newest first, each with where it is in use.

    `?search=` filters on the title. The Optio library (organization_id NULL,
    public) is deliberately not listed: it is a pool to pick from on the
    assign pickers, not something the school maintains.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    search = (request.args.get('search') or '').strip()[:100]
    repo = _repo()

    quests = repo.list_org_quests(org_id, search=search or None)
    ids = [q['id'] for q in quests]
    if not ids:
        return jsonify({'success': True, 'quests': [], 'curricula': [], 'classes': []})

    curricula = repo.org_curricula(org_id)
    classes = repo.org_classes(org_id)
    curriculum_by_id = {c['id']: c for c in curricula}
    class_by_id = {c['id']: c for c in classes}

    tasks_per_quest = {}
    for t in sorted(repo.task_rows(ids), key=lambda t: (t.get('order_index') or 0, t.get('title') or '')):
        tasks_per_quest.setdefault(t['quest_id'], []).append(
            {'id': t['id'], 'title': t.get('title') or 'Untitled task'})
    # Who wrote each quest, and whether that was a teacher. The office's
    # curated library and what teachers build for their own classes are two
    # lists to the school (Molly, iCreate, 2026-09-18, ticket 4579be68); they
    # are one table here, told apart by the author's org role.
    creator_by_id = {u['id']: u for u in repo.creators(
        sorted({q['created_by'] for q in quests if q.get('created_by')}))}
    curricula_per_quest = {}
    for link in repo.curriculum_links(ids):
        c = curriculum_by_id.get(link['curriculum_id'])
        if c:
            curricula_per_quest.setdefault(link['quest_id'], []).append({'id': c['id'], 'title': c['title']})
    classes_per_quest = {}
    for link in repo.class_links(ids):
        c = class_by_id.get(link['class_id'])
        if c and c.get('status') != 'archived':
            classes_per_quest.setdefault(link['quest_id'], []).append(
                {'id': c['id'], 'name': c['name'], 'publish_at': link.get('publish_at'),
                 'due_date': link.get('due_date')})

    out = []
    for q in quests:
        out.append({
            'id': q['id'],
            'title': q.get('title') or 'Untitled quest',
            'description': (q.get('description') or '')[:280],
            'quest_type': q.get('quest_type'),
            'is_public': bool(q.get('is_public')),
            'created_at': q.get('created_at'),
            'updated_at': q.get('updated_at'),
            # The finish line, if the school set one. POST /api/quests/:id/end
            # is what enforces it; the editor needs the current value to show.
            'xp_threshold': q.get('xp_threshold') or 0,
            # Whether a class's teacher may move that finish line. Null reads
            # as the column default, on (3d926fc3).
            'teachers_may_change_xp': q.get('teachers_may_change_xp') is not False,
            'task_count': len(tasks_per_quest.get(q['id'], [])),
            'tasks': tasks_per_quest.get(q['id'], []),
            'made_by': _made_by(creator_by_id.get(q.get('created_by'))),
            'curricula': sorted(curricula_per_quest.get(q['id'], []), key=lambda c: c['title'].lower()),
            'classes': sorted(classes_per_quest.get(q['id'], []), key=lambda c: c['name'].lower()),
        })
    return jsonify({
        'success': True,
        'quests': out,
        # The pickers on the assign dialog, so the page is one request.
        'curricula': [{'id': c['id'], 'title': c['title']} for c in curricula],
        'classes': [{'id': c['id'], 'name': c['name']} for c in classes if c.get('status') != 'archived'],
    })


@bp.route('/quests', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_library_quest(user_id):
    """Author a new school quest from the library page.

    Body: {title, description?, tasks?, curriculum_id?, xp_threshold?,
    teachers_may_change_xp?}. The same form and the
    same authoring service as "create a quest" on a curriculum or a class
    (services/sis_quest_authoring), the difference being that nothing has to
    exist to hang it on: a quest can be written first and placed later, which
    is what the library is for. With curriculum_id it is also put on that
    curriculum (and pushed to its classes) in the same request.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    curriculum_id = (data.get('curriculum_id') or '').strip() or None
    curriculum = None
    if curriculum_id:
        if _bad_uuid(curriculum_id):
            return jsonify({'success': False, 'error': 'Invalid curriculum id'}), 400
        curriculum = _repo().find_curriculum(curriculum_id)
        if not curriculum or curriculum.get('organization_id') != org_id:
            return jsonify({'success': False, 'error': 'Curriculum not found'}), 404
    # The finish line and who may move it, set on the create form too
    # (iCreate, b067c6c8, 2026-09-23: "Also add the required xp and mark if
    # the teacher can change that when first creating too"). Checked BEFORE
    # the quest exists, so a bad value refuses the request instead of leaving
    # a half-configured quest behind; written after, through the same
    # update_quest_info the edit dialog uses, so the rules are one rule.
    xp_fields = {k: data[k] for k in ('xp_threshold', 'teachers_may_change_xp') if k in data}
    if 'xp_threshold' in xp_fields:
        from services.sis_training_service import clean_xp_threshold
        _value, xp_err = clean_xp_threshold(xp_fields['xp_threshold'])
        if xp_err:
            return jsonify({'success': False, 'error': xp_err}), 400
    if 'teachers_may_change_xp' in xp_fields and not isinstance(xp_fields['teachers_may_change_xp'], bool):
        return jsonify({'success': False, 'error': 'teachers_may_change_xp must be true or false'}), 400
    try:
        created = create_org_quest(
            _admin(), org_id=org_id, user_id=user_id,
            title=data.get('title'), description=data.get('description'),
            raw_tasks=data.get('tasks'),
        )
    except QuestAuthoringError as e:
        return jsonify({'success': False, 'error': e.message}), e.status
    if xp_fields:
        try:
            task_editing.update_quest_info(_admin(), created['quest_id'], xp_fields)
        except QuestTaskEditError as e:
            return jsonify({'success': False, 'error': e.message}), e.status
    out = {'success': True, 'quest_id': created['quest_id'], 'task_count': created['task_count'],
           'tasks': created.get('tasks') or []}
    if curriculum:
        out['curriculum'] = {'id': curriculum['id'], 'title': curriculum['title']}
        out.update(attach_quest_to_curriculum(_admin(), org_id, curriculum_id, created['quest_id'], user_id,
                                               push=False))
    return jsonify(out), 201


@bp.route('/quests/<quest_id>/publish', methods=['POST'])
@require_role(*ADMIN_ROLES)
def publish_library_quest(user_id, quest_id):
    """Publish a draft started in the library (the quest editor, P6).

    Body: {curriculum_id?}. The library's attach step is the one the old create
    form had: optionally file the quest on a curriculum, without pushing it to
    that curriculum's classes (a933ee02). Otherwise the quest lands in this list
    and is assigned from its row, like any other.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Quest not found'}), 404
    from repositories.quest_editor_repository import QuestEditorRepository
    from services import quest_edit_rules
    from services.sis_quest_authoring import publish_draft
    quest = QuestEditorRepository(client=_admin()).get_quest(quest_id)
    if not quest or quest.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Quest not found'}), 404
    if not quest_edit_rules.can_edit_quest(user_id, quest):
        return jsonify({'success': False, 'error': quest_edit_rules.refusal(quest)}), 403
    data = request.get_json(silent=True) or {}
    curriculum_id = (data.get('curriculum_id') or '').strip() or None
    curriculum = None
    if curriculum_id:
        if _bad_uuid(curriculum_id):
            return jsonify({'success': False, 'error': 'Invalid curriculum id'}), 400
        curriculum = _repo().find_curriculum(curriculum_id)
        if not curriculum or curriculum.get('organization_id') != org_id:
            return jsonify({'success': False, 'error': 'Curriculum not found'}), 404
    try:
        publish_draft(_admin(), quest)
    except QuestAuthoringError as e:
        return jsonify({'success': False, 'error': e.message}), e.status
    out = {'success': True, 'quest_id': quest_id}
    if curriculum:
        out['curriculum'] = {'id': curriculum['id'], 'title': curriculum['title']}
        out.update(attach_quest_to_curriculum(_admin(), org_id, curriculum_id, quest_id, user_id,
                                               push=False))
    return jsonify(out)


@bp.route('/quests/<quest_id>/curricula', methods=['POST'])
@require_role(*ADMIN_ROLES)
def put_quest_on_curriculum(user_id, quest_id):
    """Put one of the school's quests (or an Optio library quest) on a curriculum.

    Body: {curriculum_id}. Additive and idempotent: a quest already there is
    left alone and reported as not added. The curriculum's classes do NOT get
    the quest: from the library, a curriculum is a place to file a quest, and
    giving it to a class is the separate class assign (a933ee02, 2026-09-22).
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    curriculum_id = (data.get('curriculum_id') or '').strip()
    if _bad_uuid(quest_id) or _bad_uuid(curriculum_id):
        return jsonify({'success': False, 'error': 'Invalid id'}), 400
    repo = _repo()

    curriculum = repo.find_curriculum(curriculum_id)
    if not curriculum or curriculum.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404

    quest = repo.find_quest_for_assign(quest_id)
    # The school's own, or the shared Optio library. Never another school's.
    if not quest or not quest.get('is_active') or not (
            quest.get('organization_id') == org_id
            or (quest.get('organization_id') is None and quest.get('is_public'))):
        return jsonify({'success': False, 'error': 'That quest is not available to assign.'}), 404

    result = attach_quest_to_curriculum(_admin(), org_id, curriculum_id, quest_id, user_id,
                                        push=False)
    return jsonify({'success': True, 'curriculum': {'id': curriculum['id'], 'title': curriculum['title']},
                    **result})


# Enough for a whole school's students in one request, small enough that a
# runaway client cannot enroll everyone in everything by accident.
MAX_STUDENTS_PER_ASSIGN = 200


@bp.route('/quests/<quest_id>/students', methods=['GET'])
@require_role(*ADMIN_ROLES)
def quest_students(user_id, quest_id):
    """This school's students who already have the quest.

    iCreate, ebfc9253, 2026-09-23: "When assigning to a student, I can't tell
    if they already have it or not until I enter it in again." The Give door
    only said so afterwards (already_had_it). The picker reads this first and
    marks them. Same gate as the Give write; only this school's accounts come
    back, whoever else in the platform is on a shared Optio-library quest.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Invalid id'}), 400
    repo = _repo()
    quest = repo.find_quest_for_assign(quest_id)
    if not quest or not (
            quest.get('organization_id') == org_id
            or (quest.get('organization_id') is None and quest.get('is_public'))):
        return jsonify({'success': False, 'error': 'Quest not found'}), 404
    return jsonify({'success': True, 'student_ids': repo.org_users_on_quest(org_id, quest_id)})


@bp.route('/quests/<quest_id>/students', methods=['POST'])
@require_role(*ADMIN_ROLES)
def give_quest_to_students(user_id, quest_id):
    """Give one of the school's quests (or an Optio library quest) to students by name.

    Body: {student_ids: [...]}. Every id must be a student of this school;
    one that is not fails the whole request, so a stale picker cannot enroll a
    child who has left. Idempotent: a student already on the quest is skipped
    and counted, never re-enrolled.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Invalid id'}), 400
    data = request.get_json(silent=True) or {}
    raw_ids = data.get('student_ids')
    if not isinstance(raw_ids, list) or not raw_ids:
        return jsonify({'success': False, 'error': 'Pick at least one student.'}), 400
    student_ids = list(dict.fromkeys(str(i).strip() for i in raw_ids if i))
    if any(_bad_uuid(i) for i in student_ids):
        return jsonify({'success': False, 'error': 'Invalid student id'}), 400
    if len(student_ids) > MAX_STUDENTS_PER_ASSIGN:
        return jsonify({'success': False,
                        'error': f'At most {MAX_STUDENTS_PER_ASSIGN} students at a time.'}), 400

    repo = _repo()
    quest = repo.find_quest_for_assign(quest_id)
    if not quest or not quest.get('is_active') or not (
            quest.get('organization_id') == org_id
            or (quest.get('organization_id') is None and quest.get('is_public'))):
        return jsonify({'success': False, 'error': 'That quest is not available to assign.'}), 404

    known = set(repo.students_of_org(org_id, student_ids))
    missing = [i for i in student_ids if i not in known]
    if missing:
        return jsonify({'success': False,
                        'error': 'One of those students is not at this school.'}), 404

    # Not enroll_safe: on the class door the assignment is already written
    # and the enrollment is a follow-on, so a failure there is swallowed. Here
    # the enrollment IS the thing asked for, and a zero would be a lie.
    try:
        result = enroll_students_in_quests(_admin(), student_ids, [quest_id])
    except Exception as e:  # noqa: BLE001
        logger.error(f'Giving quest {quest_id} to students failed: {e}', exc_info=True)
        return jsonify({'success': False, 'error': 'Could not assign the quest. Try again.'}), 500
    return jsonify({'success': True, 'enrolled': result['enrolled'],
                    'already_had_it': result.get('skipped_existing', 0),
                    'student_ids': student_ids})
# --- editing a quest the school owns ---------------------------------------
#
# The gate, and only the gate. A quest is editable here when this school owns
# it outright: an Optio-library quest is shared with other schools and editing
# its tasks would change them for every one of them, which is the same line
# routes/sis/curriculum.py and routes/sis/class_quests.py hold.


def _own_quest(user_id, quest_id, *, for_edit=True):
    """(org_id, quest, err). The school's own quest, ready to edit.

    `for_edit=False` drops the ownership requirement, for the two things that
    are legal on a shared quest: reading its tasks, and duplicating it.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return None, None, err
    if _bad_uuid(quest_id):
        return None, None, (jsonify({'success': False, 'error': 'Quest not found'}), 404)
    rows = (_admin().table('quests')
            .select('id, title, description, quest_type, organization_id, is_active, is_public')
            .eq('id', quest_id).limit(1).execute()).data
    if not rows:
        return None, None, (jsonify({'success': False, 'error': 'Quest not found'}), 404)
    quest = rows[0]
    if quest.get('organization_id') != org_id:
        # Readable when it is the shared catalogue; invisible when it belongs
        # to another school, which is not the caller's business either way.
        if quest.get('organization_id') is not None or not quest.get('is_public'):
            return None, None, (jsonify({'success': False, 'error': 'Quest not found'}), 404)
        if for_edit:
            return None, None, (jsonify({
                'success': False,
                'error': "This quest comes from the Optio library and is shared with "
                         "other schools, so it can't be edited here. Duplicate it to "
                         "make it yours.",
            }), 403)
    return org_id, quest, None


def _edit(op, *args):
    """Run a shared editing operation and shape its refusal into a response."""
    try:
        return jsonify(op(_admin(), *args))
    except QuestTaskEditError as e:
        return jsonify({'success': False, 'error': e.message}), e.status


@bp.route('/quests/<quest_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_library_quest(user_id, quest_id):
    """Edit a quest's headline fields.

    Body: {title?, description?, xp_threshold?, allow_custom_tasks?,
    teachers_may_change_xp?}.
    """
    _org_id, _quest, err = _own_quest(user_id, quest_id)
    if err:
        return err
    return _edit(task_editing.update_quest_info, quest_id,
                 request.get_json(silent=True) or {})


@bp.route('/quests/<quest_id>/duplicate', methods=['POST'])
@require_role(*ADMIN_ROLES)
def duplicate_library_quest(user_id, quest_id):
    """Copy a quest, its tasks and its attachments, into this school's library.

    Allowed on a shared Optio-library quest as well as the school's own, for
    the reason the curriculum tab allows it: the copy is org-owned either way,
    so this is how a school takes a library quest and makes it theirs to edit.

    The copy is attached to nothing. A duplicate is a draft somebody is about
    to rename, and putting it on a curriculum or a class would push a quest
    called "X (copy)" at students before anyone had touched it.
    """
    org_id, _quest, err = _own_quest(user_id, quest_id, for_edit=False)
    if err:
        return err
    try:
        out = duplicate_org_quest(_admin(), org_id=org_id, user_id=user_id,
                                  source_quest_id=quest_id,
                                  title=(request.get_json(silent=True) or {}).get('title'))
    except QuestAuthoringError as e:
        return jsonify({'success': False, 'error': str(e)}), e.status
    return jsonify({'success': True, **out})


@bp.route('/quests/<quest_id>/tasks', methods=['GET'])
@require_role(*ADMIN_ROLES)
def library_quest_tasks(user_id, quest_id):
    """The quest's preset tasks. Readable for a shared quest, editable if ours."""
    org_id, quest, err = _own_quest(user_id, quest_id, for_edit=False)
    if err:
        return err
    return jsonify(task_editing.list_tasks(
        _admin(), quest, editable=quest.get('organization_id') == org_id))


@bp.route('/quests/<quest_id>/tasks', methods=['POST'])
@require_role(*ADMIN_ROLES)
def add_library_quest_task(user_id, quest_id):
    _org_id, _quest, err = _own_quest(user_id, quest_id)
    if err:
        return err
    return _edit(task_editing.add_task, quest_id,
                 request.get_json(silent=True) or {})


@bp.route('/quests/<quest_id>/tasks/order', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def reorder_library_quest_tasks(user_id, quest_id):
    """Body: {task_ids: [...]}, the whole set."""
    _org_id, _quest, err = _own_quest(user_id, quest_id)
    if err:
        return err
    return _edit(task_editing.reorder_tasks, quest_id,
                 (request.get_json(silent=True) or {}).get('task_ids') or [])


@bp.route('/quests/<quest_id>/tasks/<task_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_library_quest_task(user_id, quest_id, task_id):
    _org_id, _quest, err = _own_quest(user_id, quest_id)
    if err:
        return err
    return _edit(task_editing.update_task, quest_id, task_id,
                 request.get_json(silent=True) or {})


@bp.route('/quests/<quest_id>/tasks/<task_id>/duplicate', methods=['POST'])
@require_role(*ADMIN_ROLES)
def duplicate_library_quest_task(user_id, quest_id, task_id):
    _org_id, _quest, err = _own_quest(user_id, quest_id)
    if err:
        return err
    return _edit(task_editing.duplicate_task, quest_id, task_id)


@bp.route('/quests/<quest_id>/tasks/<task_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_library_quest_task(user_id, quest_id, task_id):
    _org_id, _quest, err = _own_quest(user_id, quest_id)
    if err:
        return err
    return _edit(task_editing.delete_task, quest_id, task_id)
