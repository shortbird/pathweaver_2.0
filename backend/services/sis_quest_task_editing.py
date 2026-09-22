"""Editing a quest's preset tasks, wherever the admin reached the quest from.

Three screens now open the same quest and expect the same six actions on its
task list: the Curriculum tab (scoped by a sis_curriculum_quests link), the
class Quests tab (scoped by a class_quests link, moderator-tier) and, since
2026-09-22, the Library Quests tab, which is scoped by nothing but ownership.

That third one is why this module exists. The library page was built to reach
the quest a curriculum does not carry -- a teacher's draft, a quest made and
never placed -- and those are exactly the quests whose tasks no screen could
edit, because every editing route demanded a link the quest did not have.
Molly (iCreate, 2026-09-22): "There's no way to edit a quest that I can see."

The route keeps the gate; the gate is the only thing the three screens do not
share. What follows the gate is identical, so it lives here once rather than
a third time.

Every function takes the admin client and a quest_id the caller has ALREADY
authorized. Nothing here checks who is asking or whether the quest is the
school's own -- a caller that forgets is a caller that edits an Optio-library
quest for every school at once, which is why each route does that check first
and this module refuses to look like it did it for them.
"""

from typing import Any, Dict, List

from services.sis_quest_authoring import (
    clean_task,
    duplicate_template_task,
    norm_pillar,
    subject_updates,
)
from utils.logger import get_logger
from utils.validation import validate_uuid

logger = get_logger(__name__)

#: A quest title is stored wider than this, but the editors have always cut it
#: here and a title that disagrees between two screens is worse than a short one.
MAX_TITLE = 200


class QuestTaskEditError(Exception):
    """A refusal with the words and the status the route should send back."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def _bad_uuid(*values) -> bool:
    return any(not validate_uuid(v) for v in values)


def serialize_task(t: Dict[str, Any]) -> Dict[str, Any]:
    """The one task shape. PresetTaskManager renders this from all three tabs."""
    return {
        'id': t['id'],
        'title': t.get('title'),
        'description': t.get('description') or '',
        'pillar': t.get('pillar'),
        'xp_value': t.get('xp_value'),
        'is_required': bool(t.get('is_required')),
        'order_index': t.get('order_index', 0),
        'diploma_subjects': t.get('diploma_subjects') or [],
        'subject_xp_distribution': t.get('subject_xp_distribution') or {},
    }


def resync(admin, quest_id: str) -> None:
    """Push a template edit into the task lists students already hold.

    Those lists are copies taken at enrollment, so an edit that stops here is
    an edit no student ever sees. Best effort on purpose: the edit itself has
    already landed, and a failed resync must not read as a failed save.
    """
    try:
        from utils.template_tasks import resync_enrollments_to_template
        resync_enrollments_to_template(admin, quest_id)
    except Exception as e:  # noqa: BLE001 - the edit itself succeeded
        logger.warning(f'Saved but enrollment resync failed for {quest_id}: {e}')


def list_tasks(admin, quest: Dict[str, Any], editable: bool) -> Dict[str, Any]:
    """The quest, its description and its tasks in order.

    `editable` is the caller's answer, not this module's: it is false for an
    Optio-library quest, and PresetTaskManager hides every control on it.
    """
    tasks = (admin.table('quest_template_tasks').select('*')
             .eq('quest_id', quest['id']).order('order_index').execute()).data or []
    return {
        'success': True,
        'editable': editable,
        'quest': {'id': quest['id'], 'title': quest.get('title'),
                  'description': quest.get('description') or ''},
        'tasks': [serialize_task(t) for t in tasks],
    }


def update_quest_info(admin, quest_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Rename a quest, or rewrite its description.

    big_idea is written alongside description because create_org_quest sets
    both from the same field and the training catalog reads `big_idea or
    description`. Writing only one of them made a renamed quest describe
    itself two different ways depending on which screen asked.
    """
    updates: Dict[str, Any] = {}
    if 'title' in data:
        title = (data.get('title') or '').strip()[:MAX_TITLE]
        if not title:
            raise QuestTaskEditError('A title is required')
        updates['title'] = title
    if 'description' in data:
        description = (data.get('description') or '').strip() or None
        updates['description'] = description
        updates['big_idea'] = description
    if not updates:
        raise QuestTaskEditError('Nothing to update')

    row = (admin.table('quests').update(updates).eq('id', quest_id).execute()).data
    q = row[0] if row else {}
    return {'success': True, 'quest': {
        'id': quest_id, 'title': q.get('title'),
        'description': q.get('description') or '',
    }}


def add_task(admin, quest_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    last = (admin.table('quest_template_tasks').select('order_index')
            .eq('quest_id', quest_id).order('order_index', desc=True)
            .limit(1).execute()).data
    next_order = ((last[0]['order_index'] or 0) + 1) if last else 0
    task = clean_task(data, next_order)
    if not task:
        raise QuestTaskEditError('A task title is required.')
    task['quest_id'] = quest_id
    row = admin.table('quest_template_tasks').insert(task).execute().data
    if not row:
        raise QuestTaskEditError('Could not add the task.', 500)
    resync(admin, quest_id)
    return {'success': True, 'task': serialize_task(row[0])}


def reorder_tasks(admin, quest_id: str, task_ids: List[str]) -> Dict[str, Any]:
    """Put the tasks in the order sent. The whole set, or a 409."""
    task_ids = [t for t in (task_ids or []) if t]
    if not task_ids or _bad_uuid(*task_ids):
        raise QuestTaskEditError('Send every task id, in order.')
    from repositories.quest_template_task_repository import QuestTemplateTaskRepository
    rows = QuestTemplateTaskRepository(client=admin).reorder(quest_id, task_ids)
    if rows is None:
        raise QuestTaskEditError(
            'That is not the full task list -- reload and try again.', 409)
    resync(admin, quest_id)
    return {'success': True, 'tasks': [serialize_task(t) for t in rows]}


def update_task(admin, quest_id: str, task_id: str,
                data: Dict[str, Any]) -> Dict[str, Any]:
    """Patch one field or several on one task.

    Note the XP rule here is max(0, xp), not the max(25, xp) floor that
    clean_task applies on create. That difference predates this module and is
    preserved rather than quietly changed, because it is a platform-wide
    economy decision rather than a detail of this screen. It now has one home
    instead of two, so changing it is a one-line change when somebody decides.
    """
    if _bad_uuid(task_id):
        raise QuestTaskEditError('Invalid task id')

    updates: Dict[str, Any] = {}
    if 'title' in data:
        title = (data.get('title') or '').strip()
        if not title:
            raise QuestTaskEditError('A task title is required.')
        updates['title'] = title
    if 'description' in data:
        updates['description'] = (data.get('description') or '').strip()
    if 'pillar' in data:
        updates['pillar'] = norm_pillar(data.get('pillar'))
    if 'xp_value' in data:
        try:
            xp = int(data.get('xp_value'))
        except (TypeError, ValueError):
            raise QuestTaskEditError('XP must be a number.') from None
        updates['xp_value'] = max(0, xp)
    if 'is_required' in data:
        updates['is_required'] = bool(data.get('is_required'))
    if not updates and 'diploma_subjects' not in data \
            and 'subject_xp_distribution' not in data:
        raise QuestTaskEditError('Nothing to update.')

    # Read before write: the subject split is stored as XP amounts, not
    # percentages, so it depends on the XP and pillar the task will hold AFTER
    # this patch. Rescaling against values the caller never sent is how a task
    # ends up crediting a subject it no longer has.
    current = (admin.table('quest_template_tasks')
               .select('xp_value, pillar, diploma_subjects, subject_xp_distribution')
               .eq('id', task_id).eq('quest_id', quest_id).limit(1).execute()).data
    if not current:
        raise QuestTaskEditError('Task not found.', 404)
    updates.update(subject_updates(current[0], data, updates))

    row = (admin.table('quest_template_tasks').update(updates)
           .eq('id', task_id).eq('quest_id', quest_id).execute()).data
    if not row:
        raise QuestTaskEditError('Task not found.', 404)
    resync(admin, quest_id)
    return {'success': True, 'task': serialize_task(row[0])}


def duplicate_task(admin, quest_id: str, task_id: str) -> Dict[str, Any]:
    """Copy one preset task to the end of the same quest, title and all."""
    if _bad_uuid(task_id):
        raise QuestTaskEditError('Invalid task id')
    rows = (admin.table('quest_template_tasks').select('*')
            .eq('id', task_id).eq('quest_id', quest_id).limit(1).execute()).data
    if not rows:
        raise QuestTaskEditError('Task not found.', 404)
    row = duplicate_template_task(admin, rows[0], quest_id)
    if not row:
        raise QuestTaskEditError('Could not duplicate the task.', 500)
    resync(admin, quest_id)
    return {'success': True, 'task': serialize_task(row)}


def delete_task(admin, quest_id: str, task_id: str) -> Dict[str, Any]:
    if _bad_uuid(task_id):
        raise QuestTaskEditError('Invalid task id')
    admin.table('quest_template_tasks').delete() \
        .eq('id', task_id).eq('quest_id', quest_id).execute()
    resync(admin, quest_id)
    return {'success': True}
