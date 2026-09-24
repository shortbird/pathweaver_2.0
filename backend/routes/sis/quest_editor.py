"""
The one SIS quest form's own routes (P6, owner decision 2026-09-23).

  POST   /api/sis/quest-editor/drafts                 start a draft for a screen
  GET    /api/sis/quest-editor/drafts                 the Drafts list for a screen
  GET    /api/sis/quest-editor/<quest_id>             everything the form shows
  PUT    /api/sis/quest-editor/<quest_id>             save the form
  POST   /api/sis/quest-editor/<quest_id>/header-image  upload a header picture
  DELETE /api/sis/quest-editor/<quest_id>/header-image  take it off again
  DELETE /api/sis/quest-editor/<quest_id>             discard a draft

Publishing is not here. It is the one step that differs per screen -- put it on
a class and enrol the students, append it to a curriculum and push it to its
classes, file it in the training catalog -- so it stays beside the routes that
already own those writes: POST /api/sis/quests/<id>/publish (library),
/classes/<id>/quests/<id>/publish, /curriculum/<id>/quests/<id>/publish and
/training/<id>/publish. The rest of the form is the same on every screen, so it
is here once.

Who may do what:
  * Starting a draft: the office anywhere; a teacher on a class they teach.
  * Reading a quest: staff of the school that owns it (or anyone on staff, for
    an Optio-library quest, which is read-only).
  * Changing a quest: services/quest_edit_rules.can_edit_quest -- the office,
    or the teacher who wrote it. Nobody else, whatever class it sits on.

`quest_id` and `class_id` here arrive in the body or the path as quest ids, not
person ids, so no relationship decorator applies
(tests/unit/test_id_routes_declare_relationship.py); every gate is per-quest.
"""

from flask import Blueprint, jsonify, request

from middleware.rate_limiter import rate_limit
from repositories.quest_editor_repository import QuestEditorRepository
from services import quest_edit_rules, sis_service
from services import sis_quest_editor as editor
from services import sis_training_service
from services.sis_quest_authoring import DRAFT_CONTEXTS, is_draft
from utils.auth.decorators import require_role
from utils.logger import get_logger
from utils.sis_roles import STAFF_ROLES
from utils.validation import validate_uuid

logger = get_logger(__name__)

bp = Blueprint('sis_quest_editor', __name__, url_prefix='/api/sis/quest-editor')

# admin client justified: quests, template tasks, training rows and class
#   teacher lists are read across a whole school, which no single caller can
#   see under RLS; the role gate plus quest_edit_rules is the authorization
from utils.admin_client import admin_client as _admin


def _bad_uuid(value):
    ok, _ = validate_uuid(value or '')
    return not ok


def _err(message, status=400):
    return jsonify({'success': False, 'error': message}), status


def _teaches(user_id, class_id, org_id):
    """(class_row, None) when the caller may make quests for this class."""
    if _bad_uuid(class_id):
        return None, _err('Invalid class id')
    row = QuestEditorRepository(client=_admin()).find_class(class_id)
    if not row or row.get('organization_id') != org_id:
        return None, _err('Class not found', 404)
    if quest_edit_rules.is_school_admin(user_id, org_id):
        return row, None
    from utils import class_membership
    if user_id in class_membership.class_teacher_ids(class_id, row):
        return row, None
    return None, _err('Only the class teacher or an administrator can make quests for this class.', 403)


def _load(user_id, quest_id):
    """(org_id, quest, err). Any quest the caller's school may read."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return None, None, err
    if _bad_uuid(quest_id):
        return None, None, _err('Quest not found', 404)
    quest = QuestEditorRepository(client=_admin()).get_quest(quest_id)
    if not quest:
        return None, None, _err('Quest not found', 404)
    owner = quest.get('organization_id')
    if owner != org_id and not (owner is None and quest.get('is_public')):
        return None, None, _err('Quest not found', 404)
    return org_id, quest, None


def _load_editable(user_id, quest_id):
    org_id, quest, err = _load(user_id, quest_id)
    if err:
        return None, None, err
    if not quest_edit_rules.can_edit_quest(user_id, quest):
        return None, None, _err(quest_edit_rules.refusal(quest), 403)
    return org_id, quest, None


def _run(fn, *args, **kwargs):
    try:
        return jsonify({'success': True, **fn(*args, **kwargs)})
    except editor.QuestEditorError as e:
        return _err(e.message, e.status)


@bp.route('/drafts', methods=['POST'])
@require_role(*STAFF_ROLES)
def start_draft(user_id):
    """Start a quest. It exists from this moment, as an inactive draft.

    Body: {context: library|class|curriculum|training, class_id? (class),
    curriculum_id? (curriculum), audience? (training: staff|family|student)}.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    context = data.get('context')
    if context not in DRAFT_CONTEXTS:
        return _err('context must be one of ' + ', '.join(DRAFT_CONTEXTS))
    is_admin = quest_edit_rules.is_school_admin(user_id, org_id)
    target_id = None
    training = None
    if context == 'class':
        target_id = (data.get('class_id') or '').strip()
        _row, err = _teaches(user_id, target_id, org_id)
        if err:
            return err
    elif not is_admin:
        # The library, a curriculum and the training catalog are the office's.
        return _err('Only your school office can start a quest here.', 403)
    elif context == 'curriculum':
        target_id = (data.get('curriculum_id') or '').strip()
        if _bad_uuid(target_id):
            return _err('Invalid curriculum id')
        from repositories.sis_quest_library_repository import SisQuestLibraryRepository
        curriculum = SisQuestLibraryRepository(client=_admin()).find_curriculum(target_id)
        if not curriculum or curriculum.get('organization_id') != org_id:
            return _err('Curriculum not found', 404)
    elif context == 'training':
        audiences = sis_training_service.audiences(data.get('audiences'), data.get('audience'))
        training = {'audience': sis_training_service.primary_audience(audiences),
                    'audiences': audiences}
    return _run(editor.start_draft, _admin(), org_id=org_id, user_id=user_id, context=context,
                target_id=target_id, training=training)


@bp.route('/drafts', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_drafts(user_id):
    """Drafts for one screen.

    ?context=class&class_id=  a class's drafts: the office sees all of them,
                              a teacher sees their own.
    ?context=curriculum&curriculum_id=  a curriculum's drafts (office).
    ?context=library          drafts started in the library (office).
    ?context=all              every draft outside the training catalog
                              (office) -- the library's Drafts view, so a
                              teacher's abandoned class draft is findable.
    Training drafts are listed by the Training page itself, as rows of its
    catalog.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    context = (request.args.get('context') or '').strip()
    is_admin = quest_edit_rules.is_school_admin(user_id, org_id)
    target_id = None
    created_by = None
    if context == 'class':
        target_id = (request.args.get('class_id') or '').strip()
        _row, err = _teaches(user_id, target_id, org_id)
        if err:
            return err
        if not is_admin:
            created_by = user_id
    elif not is_admin:
        return _err('Only your school office can see these drafts.', 403)
    elif context == 'curriculum':
        target_id = (request.args.get('curriculum_id') or '').strip()
        if _bad_uuid(target_id):
            return _err('Invalid curriculum id')
    elif context not in ('library', 'all'):
        return _err('context must be class, curriculum, library or all')
    rows = editor.list_drafts(_admin(), org_id,
                              context=None if context == 'all' else context,
                              target_id=target_id, created_by=created_by)
    if context == 'all':
        rows = [r for r in rows if r.get('context') != 'training']
    return jsonify({'success': True, 'drafts': rows})


@bp.route('/<quest_id>', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_quest(user_id, quest_id):
    """The whole form for one quest, and whether the caller may change it."""
    org_id, quest, err = _load(user_id, quest_id)
    if err:
        return err
    # A draft is its author's work in progress; another teacher has no reason
    # to open it, and the office can.
    if is_draft(quest) and not quest_edit_rules.can_edit_quest(user_id, quest):
        return _err('Quest not found', 404)
    editable = quest_edit_rules.can_edit_quest(user_id, quest)
    return jsonify({'success': True, 'quest': editor.load(
        _admin(), quest, editable=editable,
        is_admin=quest_edit_rules.is_school_admin(user_id, org_id))})


@bp.route('/<quest_id>', methods=['PUT'])
@require_role(*STAFF_ROLES)
def save_quest(user_id, quest_id):
    """Save the form: the quest's fields and its whole task list. See
    services/sis_quest_editor.save for the body."""
    org_id, quest, err = _load_editable(user_id, quest_id)
    if err:
        return err
    try:
        saved = editor.save(_admin(), quest, request.get_json(silent=True) or {},
                            is_admin=quest_edit_rules.is_school_admin(user_id, org_id))
    except editor.QuestEditorError as e:
        return _err(e.message, e.status)
    return jsonify({'success': True, 'quest': saved})


@bp.route('/<quest_id>/header-image', methods=['POST'])
@require_role(*STAFF_ROLES)
@rate_limit(max_requests=30, window_seconds=300)
def upload_header_image(user_id, quest_id):
    """Upload the picture across the top of the quest.

    Only training could do this until P6; every other screen got whatever the
    stock search found for the title. `quest-headers` is a deliberately public
    bucket (utils/storage_urls.py): quest artwork is referenced raw from emails
    and cached pages, where a signed URL would expire before anyone looked.
    """
    _org_id, quest, err = _load_editable(user_id, quest_id)
    if err:
        return err
    file = request.files.get('image')
    if not file or not file.filename:
        return _err('Choose an image to upload.')
    data = file.read()
    if not data:
        return _err('That file is empty.')
    from services.file_upload_service import FileUploadService
    result = FileUploadService().upload_quest_header(
        file_data=data, filename=file.filename, content_type=file.content_type,
        quest_id=quest['id'])
    if not result.success:
        return _err(result.error_message or 'Could not upload that image.')
    return _run(editor.set_header_image, _admin(), quest, result.url)


@bp.route('/<quest_id>/header-image', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def remove_header_image(user_id, quest_id):
    _org_id, quest, err = _load_editable(user_id, quest_id)
    if err:
        return err
    prefer_logo = QuestEditorRepository(client=_admin()).training_row_for(
        quest['id'], quest['organization_id']) is not None
    return _run(editor.clear_header_image, _admin(), quest, prefer_logo=prefer_logo)


@bp.route('/<quest_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def discard_draft(user_id, quest_id):
    """Discard a draft. ?if_empty=1 only when nothing was ever written into it
    (the editor closing on a form somebody opened and left)."""
    _org_id, quest, err = _load_editable(user_id, quest_id)
    if err:
        return err
    only_if_empty = (request.args.get('if_empty') or '').lower() in ('1', 'true')
    try:
        return jsonify(editor.discard(_admin(), quest, only_if_empty=only_if_empty))
    except editor.QuestEditorError as e:
        return _err(e.message, e.status)
