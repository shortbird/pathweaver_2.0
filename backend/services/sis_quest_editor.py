"""
The one SIS quest form: open, save, list drafts, discard.

Owner decision, 2026-09-23 (P6 of
docs/icreate/TASKS_MESSAGING_QUESTS_PLAN_2026-09-23.md): the create form and the
edit form merge into one editor, used everywhere the SIS console makes or edits
a quest -- the library, a class's Quests tab, a curriculum, and the training
catalog for staff, families and students. There were four create paths and
five editors, and each had a different subset of the features: only training
could upload a header image, only the library could set the XP lock, the class
editor could not reach attachments on a new quest, and training dropped the
diploma subjects on every save.

How it works now:

  * Starting a quest writes it straight away as an inactive DRAFT
    (sis_quest_authoring.create_org_quest(draft=True)). Everything the editor
    offers -- the header image, files and links on the quest and on each task --
    works from the first minute, because the quest has an id from the first
    minute.
  * Save writes the whole form: the quest's own fields and its task list
    (pair-by-id, so a task's attachments and its students' copies survive).
  * Publish is the context's: it flips the draft live and runs that screen's
    attach step (routes/sis/quest_library.py, class_quests.py, curriculum.py,
    staff_training.py). Publishing is where a class's students get the quest,
    not before -- a draft is invisible to students and to the assign pickers.
  * Drafts are listed per screen and are never deleted automatically. The
    author can resume one or discard it.

Who may do what is services/quest_edit_rules.can_edit_quest; the routes check
it before calling anything here. This module trusts its caller the way
sis_quest_task_editing does.
"""

from typing import Any, Dict, List, Optional

from repositories.quest_editor_repository import QuestEditorRepository
from services import sis_quest_authoring as authoring
from services.sis_quest_task_editing import resync, serialize_task
from utils.logger import get_logger
from utils.person_name import full_name

logger = get_logger(__name__)


class QuestEditorError(Exception):
    """A refusal with the words and the status the route should send back."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def _repo(admin) -> QuestEditorRepository:
    return QuestEditorRepository(client=admin)


def draft_info(quest: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """{context, target_id} for a draft, or None for a published quest."""
    if not authoring.is_draft(quest):
        return None
    marker = (quest.get('metadata') or {}).get('draft') or {}
    return {'context': marker.get('context'), 'target_id': marker.get('target_id')}


def serialize(quest: Dict[str, Any], tasks: List[Dict[str, Any]], *,
              editable: bool, is_admin: bool) -> Dict[str, Any]:
    """The editor's whole payload for one quest."""
    return {
        'id': quest['id'],
        'title': quest.get('title') or '',
        'description': quest.get('description') or quest.get('big_idea') or '',
        'header_image_url': quest.get('header_image_url') or '',
        'header_style': (quest.get('metadata') or {}).get('header_style'),
        'is_active': bool(quest.get('is_active')),
        'is_draft': authoring.is_draft(quest),
        'draft': draft_info(quest),
        'is_library': not quest.get('organization_id'),
        'created_by': quest.get('created_by'),
        'xp_threshold': quest.get('xp_threshold') or 0,
        # Null reads as the column default, on.
        'teachers_may_change_xp': quest.get('teachers_may_change_xp') is not False,
        'allow_custom_tasks': quest.get('allow_custom_tasks') is not False,
        'has_source_material': bool(quest.get('source_material')),
        'tasks': [serialize_task(t) for t in tasks],
        # What the caller may do. The routes enforce both; these only decide
        # which controls the form draws.
        'editable': editable,
        'can_lock_xp': editable and is_admin,
    }


def load(admin, quest: Dict[str, Any], *, editable: bool, is_admin: bool) -> Dict[str, Any]:
    tasks = _repo(admin).template_tasks(quest['id'])
    return serialize(quest, tasks, editable=editable, is_admin=is_admin)


def start_draft(admin, *, org_id: str, user_id: str, context: str,
                target_id: Optional[str] = None,
                training: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Write an empty draft for this screen. Returns {'quest_id', 'training_id'?}.

    `training` is the catalog row to file it under ({audience, audiences}), for
    the training screen only. Filing it now, rather than at publish, is what
    lets the Training page list the draft beside the published rows, as it
    always has -- a draft there has been a catalog row with an inactive quest
    since 2026-08.
    """
    extra = {}
    if context == 'training':
        # Off unless asked for: training is a set list of things the school
        # needs done, so a learner inventing extra tasks is the exception.
        extra['allow_custom_tasks'] = False
    try:
        created = authoring.create_org_quest(
            admin, org_id=org_id, user_id=user_id, title='', description='',
            draft=True, draft_context=context, draft_target_id=target_id,
            extra_fields=extra)
    except authoring.QuestAuthoringError as e:
        raise QuestEditorError(e.message, e.status) from e
    out = {'quest_id': created['quest_id']}
    if context == 'training' and training is not None:
        repo = _repo(admin)
        audience = training['audience']
        row = repo.insert_training_row({
            'organization_id': org_id,
            'quest_id': created['quest_id'],
            'audience': audience,
            'audiences': training.get('audiences') or [audience],
            'is_required': False,
            # On by default, as the old builder had it: somebody setting a
            # quest for their whole school almost always means "put it on their
            # accounts". A draft enrols nobody whatever this says.
            'auto_assign': True,
            'sequence_order': repo.last_training_order(org_id, audience),
            'created_by': user_id,
        })
        out['training_id'] = (row or {}).get('id')
    return out


def _clean_tasks(raw_tasks: Any) -> List[Dict[str, Any]]:
    """The submitted task list as insertable rows, each keeping its saved id."""
    if not isinstance(raw_tasks, list):
        raise QuestEditorError('tasks must be a list.')
    if len(raw_tasks) > authoring.MAX_TASKS:
        raise QuestEditorError(f'A quest can have at most {authoring.MAX_TASKS} tasks.')
    cleaned: List[Dict[str, Any]] = []
    for raw in raw_tasks:
        if not isinstance(raw, dict):
            continue
        row = authoring.clean_task(raw, len(cleaned))
        if not row:
            continue
        task_id = (raw.get('id') or '').strip() if isinstance(raw.get('id'), str) else ''
        if task_id:
            row['id'] = task_id
        cleaned.append(row)
    return cleaned


def save(admin, quest: Dict[str, Any], data: Dict[str, Any], *, is_admin: bool) -> Dict[str, Any]:
    """Write the form. Keys absent from `data` are left as they are.

    Body: {title?, description?, xp_threshold?, allow_custom_tasks?,
    teachers_may_change_xp? (office only), source_material?, tasks?[]}.

    A draft may be saved with no title (somebody attaching the handout before
    naming the quest); a live quest may not lose its title.

    The task list is the whole list, in order. Every saved task comes back
    with its id and is updated in place; a row with no id is new; a saved task
    missing from the list is deleted, and its attachments with it. The
    students already on a live quest get the new list (resync), minus nothing
    they have already done.
    """
    from services.sis_training_service import clean_xp_threshold
    from app_config import Config

    fields: Dict[str, Any] = {}
    if 'title' in data:
        title = (data.get('title') or '').strip()
        if len(title) > authoring.MAX_TITLE_LEN:
            raise QuestEditorError('Title is too long.')
        if not title and not authoring.is_draft(quest):
            raise QuestEditorError('A quest title is required.')
        fields['title'] = title
    if 'description' in data:
        description = (data.get('description') or '').strip()
        # big_idea too: create_org_quest sets both from one field and the
        # training catalog reads `big_idea or description`.
        fields['description'] = description
        fields['big_idea'] = description
    if 'xp_threshold' in data:
        value, err = clean_xp_threshold(data.get('xp_threshold'))
        if err:
            raise QuestEditorError(err)
        current = quest.get('xp_threshold') or None
        # The office's lock on the finish line (3d926fc3). A teacher editing
        # their own quest still cannot move a number the office pinned.
        if (value != current and not is_admin
                and quest.get('teachers_may_change_xp') is False):
            raise QuestEditorError('Your school office sets the XP to finish for this quest.', 403)
        fields['xp_threshold'] = value
    if 'allow_custom_tasks' in data:
        if not isinstance(data.get('allow_custom_tasks'), bool):
            raise QuestEditorError('allow_custom_tasks must be true or false')
        fields['allow_custom_tasks'] = data['allow_custom_tasks']
        if not data['allow_custom_tasks']:
            # Only worth keeping while learners can generate against it.
            fields['source_material'] = None
    if (data.get('source_material') or '').strip() and fields.get('allow_custom_tasks', True):
        fields['source_material'] = data['source_material'].strip()[
            :Config.AI_SOURCE_MATERIAL_MAX_CHARS]
    if 'teachers_may_change_xp' in data:
        if not isinstance(data.get('teachers_may_change_xp'), bool):
            raise QuestEditorError('teachers_may_change_xp must be true or false')
        # The office's lock. A teacher who could write it could unlock
        # themselves, so theirs is refused rather than ignored.
        if not is_admin and data['teachers_may_change_xp'] != (
                quest.get('teachers_may_change_xp') is not False):
            raise QuestEditorError('Only your school office can change who sets the XP to finish.', 403)
        if is_admin:
            fields['teachers_may_change_xp'] = data['teachers_may_change_xp']

    cleaned = _clean_tasks(data['tasks']) if 'tasks' in data else None

    repo = _repo(admin)
    if fields:
        repo.update_quest(quest['id'], fields)
    if cleaned is not None:
        authoring.replace_template_tasks(admin, quest['id'], cleaned, pair_by_id_only=True)
    if quest.get('is_active') and (cleaned is not None or fields):
        # Students hold copies taken at enrollment; without this an edit
        # reaches only whoever starts the quest next.
        resync(admin, quest['id'])

    fresh = repo.get_quest(quest['id']) or {**quest, **fields}
    return serialize(fresh, repo.template_tasks(quest['id']), editable=True, is_admin=is_admin)


def set_header_image(admin, quest: Dict[str, Any], url: str) -> Dict[str, Any]:
    """Point the quest at a picture uploaded through the editor.

    header_style is dropped: an uploaded picture is meant to fill the header,
    and 'org_logo' would shrink it into a badge.
    """
    meta = dict(quest.get('metadata') or {})
    meta.pop('header_style', None)
    _repo(admin).update_quest(quest['id'], {
        'header_image_url': url, 'image_url': url, 'metadata': meta})
    return {'header_image_url': url}


def clear_header_image(admin, quest: Dict[str, Any], *, prefer_logo: bool) -> Dict[str, Any]:
    """Take an uploaded picture off. A draft goes back to "none yet" (publish
    picks one); a live quest gets the fallback now, because a live quest with
    no header renders a blank band on every card."""
    meta = dict(quest.get('metadata') or {})
    meta.pop('header_style', None)
    url, style = (None, None)
    if quest.get('is_active'):
        url, style = authoring.fallback_header(
            admin, quest.get('organization_id'), quest.get('title') or '',
            quest.get('description') or '', prefer_logo=prefer_logo)
    if style:
        meta['header_style'] = style
    _repo(admin).update_quest(quest['id'], {
        'header_image_url': url, 'image_url': url, 'metadata': meta})
    return {'header_image_url': url or ''}


def list_drafts(admin, org_id: str, *, context: Optional[str], target_id: Optional[str],
                created_by: Optional[str]) -> List[Dict[str, Any]]:
    """The drafts a Drafts list shows, with who started each and where it goes."""
    repo = _repo(admin)
    rows = repo.list_drafts(org_id, context=context, target_id=target_id, created_by=created_by)
    authors = repo.names(sorted({r['created_by'] for r in rows if r.get('created_by')}))
    class_ids = sorted({(r.get('metadata') or {}).get('draft', {}).get('target_id')
                        for r in rows
                        if ((r.get('metadata') or {}).get('draft') or {}).get('context') == 'class'
                        and ((r.get('metadata') or {}).get('draft') or {}).get('target_id')})
    curriculum_ids = sorted({(r.get('metadata') or {}).get('draft', {}).get('target_id')
                             for r in rows
                             if ((r.get('metadata') or {}).get('draft') or {}).get('context') == 'curriculum'
                             and ((r.get('metadata') or {}).get('draft') or {}).get('target_id')})
    class_names = repo.class_names(class_ids)
    curriculum_names = repo.curriculum_names(curriculum_ids)
    out = []
    for r in rows:
        marker = (r.get('metadata') or {}).get('draft') or {}
        target = marker.get('target_id')
        where = None
        if marker.get('context') == 'class' and target:
            where = class_names.get(target)
        elif marker.get('context') == 'curriculum' and target:
            where = curriculum_names.get(target)
        out.append({
            'id': r['id'],
            'title': r.get('title') or '',
            'description': (r.get('description') or '')[:280],
            'context': marker.get('context'),
            'target_id': target,
            'target_name': where,
            'created_by': r.get('created_by'),
            'created_by_name': full_name(authors.get(r['created_by']), fallback='Staff')
            if r.get('created_by') else None,
            'created_at': r.get('created_at'),
            'updated_at': r.get('updated_at'),
        })
    return out


def discard(admin, quest: Dict[str, Any], *, only_if_empty: bool = False) -> Dict[str, Any]:
    """Delete a draft. Refuses a published quest outright.

    only_if_empty is the editor closing on a draft nobody wrote anything into
    (no title, no tasks, no attachments): that row is not a draft anybody
    started, it is a form somebody opened and closed, and keeping it would fill
    Drafts with blanks. Anything with a word in it stays until a person
    discards it -- drafts are never deleted automatically.
    """
    if not authoring.is_draft(quest):
        raise QuestEditorError('Only a draft can be discarded. This quest is published.', 409)
    repo = _repo(admin)
    if repo.has_enrollments(quest['id']):
        raise QuestEditorError('Somebody is already on this quest, so it cannot be discarded.', 409)
    if only_if_empty:
        empty = (not (quest.get('title') or '').strip()
                 and not (quest.get('description') or '').strip()
                 and not quest.get('header_image_url')
                 and not repo.template_tasks(quest['id'])
                 and repo.resource_count(quest['id']) == 0)
        if not empty:
            return {'success': True, 'discarded': False}
    repo.delete_draft(quest['id'])
    return {'success': True, 'discarded': True}
