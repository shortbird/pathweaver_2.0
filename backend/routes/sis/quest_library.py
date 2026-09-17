"""
SIS quest library -- every quest the school owns, in one list, with where each
one is in use and a way to put it somewhere from there.

  GET  /api/sis/quests                          the org's quests, with their
                                                curricula, classes and task count
  POST /api/sis/quests                          author a new one (optionally
                                                straight onto a curriculum)
  POST /api/sis/quests/<quest_id>/curricula     put one on a curriculum

Why a page of its own. Quests were reachable only through the curriculum that
carried them: open Curriculum, expand an entry, find the quest. A quest on no
curriculum yet (one a teacher built on a class, one a draft made) was not
reachable at all. Molly (iCreate, a8a7b051 / f9b5f2ea, 2026-09-14): "I'd like
it to be a separate tab under operations. And from there, all the quests would
be listed, and we can assign them as needed from there."

What "assign" means here is what it means everywhere else on the SIS, and the
two writes are the ones those screens already make: putting a quest on a
curriculum inserts the same sis_curriculum_quests row the curriculum page
inserts and pushes it to that curriculum's classes the same way
(services.sis_curriculum_sync.attach_quest_to_curriculum, shared with
routes/sis/curriculum.py); putting a quest on a class is the class page's own
POST /api/sis/classes/<id>/quests, which the library page calls directly, so a
release date, a due date and an audience mean the same thing from either
door. Editing stays where the quest lives: the row links to its curriculum.

ADMIN_ROLES throughout, like the curriculum library it sits beside. A teacher
edits quests on the classes they teach; the school-wide list is the office's.
Data access is repositories/sis_quest_library_repository.py.
"""

from flask import Blueprint, request, jsonify

from repositories.sis_quest_library_repository import SisQuestLibraryRepository
from services import sis_service
from services.sis_curriculum_sync import attach_quest_to_curriculum
from services.sis_quest_authoring import QuestAuthoringError, create_org_quest
from utils.auth.decorators import require_role
from utils.logger import get_logger
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
    for t in repo.task_rows(ids):
        tasks_per_quest[t['quest_id']] = tasks_per_quest.get(t['quest_id'], 0) + 1
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
            'task_count': tasks_per_quest.get(q['id'], 0),
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

    Body: {title, description?, tasks?, curriculum_id?}. The same form and the
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
    try:
        created = create_org_quest(
            _admin(), org_id=org_id, user_id=user_id,
            title=data.get('title'), description=data.get('description'),
            raw_tasks=data.get('tasks'),
        )
    except QuestAuthoringError as e:
        return jsonify({'success': False, 'error': e.message}), e.status
    out = {'success': True, 'quest_id': created['quest_id'], 'task_count': created['task_count']}
    if curriculum:
        out['curriculum'] = {'id': curriculum['id'], 'title': curriculum['title']}
        out.update(attach_quest_to_curriculum(_admin(), org_id, curriculum_id, created['quest_id'], user_id))
    return jsonify(out), 201


@bp.route('/quests/<quest_id>/curricula', methods=['POST'])
@require_role(*ADMIN_ROLES)
def put_quest_on_curriculum(user_id, quest_id):
    """Put one of the school's quests (or an Optio library quest) on a curriculum.

    Body: {curriculum_id}. Additive and idempotent: a quest already there is
    left alone and reported as not added. The curriculum's classes get the
    quest pushed, exactly as adding it from the curriculum page would.
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

    result = attach_quest_to_curriculum(_admin(), org_id, curriculum_id, quest_id, user_id)
    return jsonify({'success': True, 'curriculum': {'id': curriculum['id'], 'title': curriculum['title']},
                    **result})
