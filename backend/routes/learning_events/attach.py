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
from utils.quest_status import is_class_credit_awarded

from routes.learning_events import learning_events_bp

logger = get_logger(__name__)


def _select_in_chunks(make_query, ids, chunk_size=100):
    """Run an ``.in_(col, ids)`` select over chunks of ids and concat results.

    PostgREST encodes ``in_`` filters in the URL, so a few hundred UUIDs (e.g.
    a test account enrolled in 200+ course projects) overflows the request URL
    and 400s. Chunking keeps each request bounded.

    ``make_query(chunk)`` must build and ``.execute()`` the query for one chunk.
    """
    rows = []
    for start in range(0, len(ids), chunk_size):
        chunk = ids[start:start + chunk_size]
        if not chunk:
            continue
        resp = make_query(chunk)
        rows.extend(resp.data or [])
    return rows


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

    Mirrors the quest-detail query pattern (which is known to work): scope
    tasks through the enrollment FK `user_quest_id` and require approved
    tasks. The earlier implementation filtered `user_quest_tasks` directly
    by `user_id` + `quest_id`, which returned no rows for enrollments where
    tasks were created via the personalization wizard (approval_status
    transitions) — hence the bogus "no active quests" message.

    Accepts an optional `student_id` query param for parents/observers
    capturing a moment on behalf of a child. The caller must be that
    student's parent (via dependents) or linked observer; otherwise the
    student scope is ignored and we fall back to the caller's own quests.

    Shape:
      { quests: [ { id, title, tasks: [ { id, title, pillar, xp_value,
                                          attached_moment_id | null } ] } ] }
    """
    try:
        # admin client justified: learning event reads/writes scoped to caller (self) under @require_auth; ownership verified via user_id match on the event row
        supabase = get_supabase_admin_client()

        # Resolve the effective student id. When a `student_id` query param
        # is supplied, verify the caller has parent/observer permission for
        # that student before honoring it.
        from flask import request
        scope_id = user_id
        requested_student = (request.args.get('student_id') or '').strip()
        if requested_student and requested_student != user_id:
            allowed = False
            try:
                deps = supabase.table('users') \
                    .select('id, managed_by_parent_id') \
                    .eq('id', requested_student) \
                    .single().execute()
                if deps.data and deps.data.get('managed_by_parent_id') == user_id:
                    allowed = True
            except Exception:
                pass
            if not allowed:
                try:
                    links = supabase.table('observer_student_links') \
                        .select('id') \
                        .eq('observer_id', user_id) \
                        .eq('student_id', requested_student) \
                        .eq('is_active', True) \
                        .limit(1).execute()
                    if links.data:
                        allowed = True
                except Exception:
                    pass
            if not allowed:
                try:
                    pl = supabase.table('parent_student_links') \
                        .select('id') \
                        .eq('parent_id', user_id) \
                        .eq('student_id', requested_student) \
                        .limit(1).execute()
                    if pl.data:
                        allowed = True
                except Exception:
                    pass
            if allowed:
                scope_id = requested_student

        enrollments = supabase.table('user_quests') \
            .select('id, quest_id, quests(quest_type, class_review_status)') \
            .eq('user_id', scope_id) \
            .eq('is_active', True) \
            .is_('completed_at', 'null') \
            .execute()

        # A credit-awarded class stays is_active with no completed_at (see
        # utils/quest_status), so it slips past the filter above. It's complete
        # — exclude it so you can't attach new evidence to a finished class.
        enrollment_rows = [
            r for r in (enrollments.data or [])
            if not is_class_credit_awarded(r.get('quests'))
        ]
        if not enrollment_rows:
            return jsonify({'quests': []}), 200

        enrollment_ids = [r['id'] for r in enrollment_rows if r.get('id')]
        quest_ids = list({r['quest_id'] for r in enrollment_rows if r.get('quest_id')})
        if not enrollment_ids or not quest_ids:
            return jsonify({'quests': []}), 200

        # Exclude quests that belong to a course — students see those tasks
        # via the course's own surface, and including them here makes the
        # attach picker show way more quests than they're "really" active in.
        course_quest_rows = _select_in_chunks(
            lambda chunk: supabase.table('course_quests')
                .select('quest_id')
                .in_('quest_id', chunk)
                .execute(),
            quest_ids,
        )
        course_quest_ids = {
            r['quest_id'] for r in course_quest_rows if r.get('quest_id')
        }
        if course_quest_ids:
            quest_ids = [qid for qid in quest_ids if qid not in course_quest_ids]
            enrollment_rows = [r for r in enrollment_rows if r.get('quest_id') not in course_quest_ids]
            enrollment_ids = [r['id'] for r in enrollment_rows if r.get('id')]
            if not enrollment_ids or not quest_ids:
                return jsonify({'quests': []}), 200

        # enrollment.id -> quest_id, so we can route tasks back to their quest
        enrollment_to_quest = {r['id']: r['quest_id'] for r in enrollment_rows if r.get('id')}

        quest_titles_rows = _select_in_chunks(
            lambda chunk: supabase.table('quests')
                .select('id, title')
                .in_('id', chunk)
                .execute(),
            quest_ids,
        )
        quest_titles = {q['id']: q['title'] for q in quest_titles_rows}

        # Same shape the quest-detail screen pulls — scope by enrollment FK
        # and require approved tasks.
        all_tasks = _select_in_chunks(
            lambda chunk: supabase.table('user_quest_tasks')
                .select('id, user_quest_id, title, pillar, xp_value, order_index')
                .in_('user_quest_id', chunk)
                .eq('approval_status', 'approved')
                .execute(),
            enrollment_ids,
        )
        task_ids = [t['id'] for t in all_tasks]

        # Fetch completions / attachments scoped to this user (small result
        # set), then intersect with task_ids in Python. The previous IN-list
        # filter on potentially hundreds of task UUIDs overflowed the
        # PostgREST URL and returned 400 Bad Request.
        task_ids_set = set(task_ids)

        completed_ids = set()
        if task_ids:
            comp_resp = supabase.table('quest_task_completions') \
                .select('user_quest_task_id') \
                .eq('user_id', scope_id) \
                .execute()
            completed_ids = {
                r['user_quest_task_id']
                for r in (comp_resp.data or [])
                if r.get('user_quest_task_id') in task_ids_set
            }

        attached_map = {}
        if task_ids:
            # Moments (learning_events) attached to any of the scoped user's
            # tasks. The FK chain guarantees the task belongs to scope_id, so
            # scoping the moments lookup the same way keeps the query bounded.
            att_resp = supabase.table('learning_events') \
                .select('id, attached_task_id') \
                .eq('user_id', scope_id) \
                .not_.is_('attached_task_id', 'null') \
                .execute()
            attached_map = {
                r['attached_task_id']: r['id']
                for r in (att_resp.data or [])
                if r.get('attached_task_id') in task_ids_set
            }

        by_quest = {}
        for t in all_tasks:
            if t['id'] in completed_ids:
                continue
            quest_id = enrollment_to_quest.get(t['user_quest_id'])
            if not quest_id:
                continue
            by_quest.setdefault(quest_id, []).append({
                'id': t['id'],
                'title': t['title'],
                'pillar': t['pillar'],
                'xp_value': t.get('xp_value') or 0,
                'order_index': t.get('order_index') or 0,
                'attached_moment_id': attached_map.get(t['id']),
            })

        quests_out = []
        seen = set()
        for r in enrollment_rows:
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
