"""A class quest ends itself once the assigned work is turned in.

Gryffin student check-ins, 2026-09-10 (Dallin Bird): "Tarien still has a quest
in class quests that is already done for reading." He was right. Tarien had
turned in both tasks of "Dickenson at first sight" and the quest was still open
on his home page and still amber on the class list.

Nothing on the platform used to set `user_quests.completed_at` by itself. That
is deliberate for a quest a student picked: finishing the last task only offers
a celebration modal, and the student is free to dismiss it and keep adding to
the quest, because the process is the goal. It is wrong for schoolwork. An
assignment is finished when the teacher's tasks are turned in. Leaving it open
made a student re-read their own finished work looking for what they missed.

So the rule splits by where the quest came from:

  - assigned through a class -> the platform ends it when every task on the
    student's enrollment has a completion;
  - the student's own pick -> nothing changes, it ends when they end it.

The done-ness test is `utils.quest_completion.is_quest_done`, the same one the
teacher's progress grid and the weekly parent digest use. A quest that ends
itself on a different reading of "done" than the grid shows would put a family
and their teacher on opposite sides of an argument about late work.

Ending is reversible: POST /api/quests/<id>/reopen puts it back, and a teacher
who adds a task to the class quest later resyncs it into the enrollment.
"""

from utils.class_assignments import is_class_assigned
from utils.logger import get_logger
from utils.quest_completion import task_progress
from utils.timestamps import now_iso

logger = get_logger(__name__)


def _emit_completion_events(admin, user_id, quest_id):
    """The same side effects the student's own "End quest" button fires.

    An auto-ended quest is as complete as a hand-ended one, so anything
    downstream that listens for completion has to hear about both. Each is
    best-effort: the enrollment is already closed, and a webhook that cannot be
    delivered must not turn a finished quest back into an unfinished one.
    """
    try:
        from services.webhook_service import WebhookService

        completions = (admin.table('quest_task_completions')
                       .select('user_quest_task_id, user_quest_tasks!inner(xp_value)')
                       .eq('user_id', user_id).eq('quest_id', quest_id).execute()).data or []
        total_xp = sum((c.get('user_quest_tasks') or {}).get('xp_value', 0) for c in completions)

        user_row = (admin.table('users').select('organization_id')
                    .eq('id', user_id).limit(1).execute()).data or []
        quest_row = (admin.table('quests').select('title')
                     .eq('id', quest_id).limit(1).execute()).data or []

        WebhookService(admin).emit_event(
            event_type='quest.completed',
            data={
                'user_id': user_id,
                'quest_id': quest_id,
                'quest_title': (quest_row[0].get('title') if quest_row else None) or 'Unknown Quest',
                'tasks_completed': len(completions),
                'total_xp_earned': total_xp,
                'completed_at': now_iso(),
                'auto_completed': True,
            },
            organization_id=(user_row[0].get('organization_id') if user_row else None),
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f'quest.completed webhook failed for auto-ended {quest_id}: {e}')

    try:
        from services.lti_grade_sync_service import enqueue_for_quest_completion
        enqueue_for_quest_completion(user_id, quest_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'LTI grade sync enqueue failed for auto-ended {quest_id}: {e}')


def end_if_class_quest_complete(admin, user_id, quest_id):
    """End this enrollment if it is assigned schoolwork and the work is done.

    Returns True when this call is the one that closed it. Safe to call after
    every task completion: it reads the enrollment first and does nothing for a
    student-started quest, an unfinished one, or one already closed.

    Args:
        admin: a Supabase client that bypasses RLS (the caller already
            authorized the student).
        user_id: the student whose enrollment this is.
        quest_id: the quest they just completed a task on.
    """
    try:
        # Every open enrollment for this pair, not just one. `user_quests` has
        # no unique index on (user_id, quest_id) and duplicates are real in
        # production, so reading a single row picks an arbitrary one — half the
        # time the wrong one, leaving a finished enrollment open forever.
        rows = (admin.table('user_quests')
                .select('id, completed_at, archived_at')
                .eq('user_id', user_id).eq('quest_id', quest_id)
                .is_('completed_at', 'null').is_('archived_at', 'null')
                .execute()).data or []
        if not rows:
            return False

        progress = task_progress(admin, [r['id'] for r in rows])
        finished = [r for r in rows
                    if progress.get(r['id'], (0, 0))[1] > 0
                    and progress[r['id']][0] >= progress[r['id']][1]]
        if not finished:
            return False

        # Asked last, because it is the only question that costs extra reads.
        if not is_class_assigned(admin, user_id, quest_id):
            return False

        stamp = now_iso()
        closed = 0
        for row in finished:
            # `is` completed_at null is an optimistic lock, the same one the
            # atomic completion path uses: two tasks finished in the same breath
            # would otherwise both end the quest and fire two webhooks.
            updated = (admin.table('user_quests')
                       .update({'completed_at': stamp,
                                'is_active': False,
                                'last_set_down_at': stamp})
                       .eq('id', row['id'])
                       .is_('completed_at', 'null')
                       .execute()).data or []
            closed += 1 if updated else 0

        if not closed:
            return False

        done, total = progress[finished[0]['id']]
        logger.info(f'Auto-ended class quest {quest_id} for student {user_id} '
                    f'({done}/{total} tasks turned in, {closed} enrollment(s))')
        _emit_completion_events(admin, user_id, quest_id)
        return True

    except Exception as e:  # noqa: BLE001 — the task completion itself succeeded
        logger.warning(f'Could not auto-end class quest {quest_id} for {user_id}: {e}')
        return False
