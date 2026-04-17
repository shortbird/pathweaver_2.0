"""Attach a learning moment to a quest task as draft evidence.

Mobile-first flow: students attach captured moments to pending tasks. Task
completion still happens on the web — attachment just pre-fills the evidence
for the web completion form.

Rules:
- 1:1 — each moment attaches to at most one task, each task has at most one
  attached moment (enforced by a partial unique index on attached_task_id).
- Only pending tasks (no completion row yet) can receive an attachment.
- Only the moment owner can attach, and the task must belong to the same user.
"""
from flask import jsonify, request
from utils.auth.decorators import require_auth
from database import get_supabase_admin_client
from utils.logger import get_logger

from routes.learning_events import learning_events_bp

logger = get_logger(__name__)


def _task_is_pending(supabase, user_quest_task_id: str) -> bool:
    """A task is pending if it has no completion row yet."""
    resp = supabase.table('quest_task_completions') \
        .select('id') \
        .eq('user_quest_task_id', user_quest_task_id) \
        .limit(1) \
        .execute()
    return not (resp.data or [])


@learning_events_bp.route('/api/learning-events/<event_id>/attach-task', methods=['POST'])
@require_auth
def attach_moment_to_task(user_id, event_id):
    """Attach the moment to a user_quest_task. Reassigns if already attached."""
    try:
        data = request.get_json() or {}
        task_id = data.get('task_id')
        if not task_id:
            return jsonify({'error': 'task_id is required'}), 400

        # admin client justified: learning event writes scoped to caller (self) under @require_auth; ownership verified via user_id match on the event row
        supabase = get_supabase_admin_client()

        event = supabase.table('learning_events') \
            .select('id, user_id, attached_task_id') \
            .eq('id', event_id) \
            .single() \
            .execute()
        if not event.data or event.data['user_id'] != user_id:
            return jsonify({'error': 'Moment not found'}), 404

        task = supabase.table('user_quest_tasks') \
            .select('id, user_id, quest_id, title, pillar, xp_value') \
            .eq('id', task_id) \
            .single() \
            .execute()
        if not task.data or task.data['user_id'] != user_id:
            return jsonify({'error': 'Task not found'}), 404

        if not _task_is_pending(supabase, task_id):
            return jsonify({'error': 'Task already completed'}), 409

        # Free the task slot if another moment is attached there (shouldn't
        # happen in the mobile flow, but keep the API idempotent).
        existing = supabase.table('learning_events') \
            .select('id') \
            .eq('attached_task_id', task_id) \
            .neq('id', event_id) \
            .execute()
        if existing.data:
            supabase.table('learning_events') \
                .update({'attached_task_id': None}) \
                .eq('id', existing.data[0]['id']) \
                .execute()

        updated = supabase.table('learning_events') \
            .update({'attached_task_id': task_id}) \
            .eq('id', event_id) \
            .execute()

        return jsonify({
            'success': True,
            'event': (updated.data or [None])[0],
            'task': task.data,
        }), 200

    except Exception as e:
        logger.error(f"attach_moment_to_task failed: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/<event_id>/attach-task', methods=['DELETE'])
@require_auth
def detach_moment_from_task(user_id, event_id):
    """Detach the moment from its task."""
    try:
        # admin client justified: learning event reads/writes scoped to caller (self) under @require_auth; ownership verified via user_id match on the event row
        supabase = get_supabase_admin_client()

        event = supabase.table('learning_events') \
            .select('id, user_id') \
            .eq('id', event_id) \
            .single() \
            .execute()
        if not event.data or event.data['user_id'] != user_id:
            return jsonify({'error': 'Moment not found'}), 404

        supabase.table('learning_events') \
            .update({'attached_task_id': None}) \
            .eq('id', event_id) \
            .execute()

        return jsonify({'success': True}), 200

    except Exception as e:
        logger.error(f"detach_moment_from_task failed: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/quests/<quest_id>/task-attachments', methods=['GET'])
@require_auth
def list_quest_task_attachments(user_id, quest_id):
    """Return a map of task_id -> moment_id for a quest's tasks (current user)."""
    try:
        # admin client justified: learning event reads/writes scoped to caller (self) under @require_auth; ownership verified via user_id match on the event row
        supabase = get_supabase_admin_client()

        tasks_resp = supabase.table('user_quest_tasks') \
            .select('id') \
            .eq('user_id', user_id) \
            .eq('quest_id', quest_id) \
            .execute()
        task_ids = [t['id'] for t in (tasks_resp.data or [])]
        if not task_ids:
            return jsonify({'attachments': {}}), 200

        att_resp = supabase.table('learning_events') \
            .select('id, attached_task_id') \
            .eq('user_id', user_id) \
            .in_('attached_task_id', task_ids) \
            .execute()

        return jsonify({
            'attachments': {
                r['attached_task_id']: r['id']
                for r in (att_resp.data or [])
            }
        }), 200

    except Exception as e:
        logger.error(f"list_quest_task_attachments failed: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/user-quest-tasks/<task_id>/attached-moment', methods=['GET'])
@require_auth
def get_task_attached_moment(user_id, task_id):
    """Fetch the moment attached to a task (for the web completion form)."""
    try:
        # admin client justified: learning event reads/writes scoped to caller (self) under @require_auth; ownership verified via user_id match on the event row
        supabase = get_supabase_admin_client()

        task = supabase.table('user_quest_tasks') \
            .select('id, user_id') \
            .eq('id', task_id) \
            .single() \
            .execute()
        if not task.data or task.data['user_id'] != user_id:
            return jsonify({'error': 'Task not found'}), 404

        moment = supabase.table('learning_events') \
            .select('*') \
            .eq('attached_task_id', task_id) \
            .maybe_single() \
            .execute()
        if not moment or not moment.data:
            return jsonify({'moment': None}), 200

        blocks = supabase.table('learning_event_evidence_blocks') \
            .select('*') \
            .eq('learning_event_id', moment.data['id']) \
            .order('order_index') \
            .execute()
        moment.data['evidence_blocks'] = blocks.data or []

        return jsonify({'moment': moment.data}), 200

    except Exception as e:
        logger.error(f"get_task_attached_moment failed: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/attachable-tasks', methods=['GET'])
@require_auth
def list_attachable_tasks(user_id):
    """List active quests with their pending tasks, for the attach picker.

    Shape:
      { quests: [ { id, title, tasks: [ { id, title, pillar, xp_value,
                                          attached_moment_id | null } ] } ] }
    """
    try:
        # admin client justified: learning event reads/writes scoped to caller (self) under @require_auth; ownership verified via user_id match on the event row
        supabase = get_supabase_admin_client()

        active_quests = supabase.table('user_quests') \
            .select('quest_id') \
            .eq('user_id', user_id) \
            .eq('is_active', True) \
            .is_('completed_at', 'null') \
            .execute()

        quest_rows = active_quests.data or []
        if not quest_rows:
            return jsonify({'quests': []}), 200

        quest_ids = list({r['quest_id'] for r in quest_rows if r.get('quest_id')})
        if not quest_ids:
            return jsonify({'quests': []}), 200

        quest_titles_resp = supabase.table('quests') \
            .select('id, title') \
            .in_('id', quest_ids) \
            .execute()
        quest_titles = {q['id']: q['title'] for q in (quest_titles_resp.data or [])}

        tasks_resp = supabase.table('user_quest_tasks') \
            .select('id, quest_id, title, pillar, xp_value, order_index') \
            .eq('user_id', user_id) \
            .in_('quest_id', quest_ids) \
            .execute()
        all_tasks = tasks_resp.data or []
        task_ids = [t['id'] for t in all_tasks]

        completed_ids = set()
        if task_ids:
            comp_resp = supabase.table('quest_task_completions') \
                .select('user_quest_task_id') \
                .in_('user_quest_task_id', task_ids) \
                .execute()
            completed_ids = {r['user_quest_task_id'] for r in (comp_resp.data or [])}

        attached_map = {}
        if task_ids:
            att_resp = supabase.table('learning_events') \
                .select('id, attached_task_id') \
                .in_('attached_task_id', task_ids) \
                .execute()
            attached_map = {
                r['attached_task_id']: r['id']
                for r in (att_resp.data or [])
            }

        by_quest = {}
        for t in all_tasks:
            if t['id'] in completed_ids:
                continue
            by_quest.setdefault(t['quest_id'], []).append({
                'id': t['id'],
                'title': t['title'],
                'pillar': t['pillar'],
                'xp_value': t.get('xp_value') or 0,
                'order_index': t.get('order_index') or 0,
                'attached_moment_id': attached_map.get(t['id']),
            })

        quests_out = []
        seen = set()
        for r in quest_rows:
            qid = r.get('quest_id')
            if not qid or qid in seen:
                continue
            seen.add(qid)
            tasks = sorted(
                by_quest.get(qid, []),
                key=lambda t: (t['order_index'], t['title'])
            )
            if not tasks:
                continue
            quests_out.append({
                'id': qid,
                'title': quest_titles.get(qid) or 'Quest',
                'tasks': tasks,
            })

        return jsonify({'quests': quests_out}), 200

    except Exception as e:
        import traceback
        logger.error(
            f"list_attachable_tasks failed: {type(e).__name__}: {e}\n"
            f"{traceback.format_exc()}"
        )
        return jsonify({'error': 'Internal server error'}), 500
