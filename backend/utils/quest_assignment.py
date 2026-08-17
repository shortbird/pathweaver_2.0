"""
Enrolling somebody else into a quest.

A learner normally creates their own `user_quests` row by picking a quest up.
Everything else — an advisor assigning work, a school putting a training or
orientation quest on its teachers' and families' accounts — has to create that
row on their behalf, and then materialize the quest's template tasks into it so
the person lands on the authored task list instead of the personalization
wizard (see utils/template_tasks).

Both callers want the same three properties, which is why this is one function:
  idempotent   re-running never double-enrols; already-enrolled users are
               counted and skipped. The school case leans on this — "assign to
               everyone" is a button an admin may click again next week.
  per-user     one person failing does not abandon the rest of the roster.
  countable    returns what actually happened, so the UI can say so.

This does NOT check who may be assigned what. Callers own that: they decide the
roster (advisor -> their students, training -> the org's staff or guardians) and
the role gate on the route.
"""

from datetime import datetime, timezone

from utils.logger import get_logger

logger = get_logger(__name__)


def assign_quest_to_users(admin, quest_id, user_ids):
    """Enroll each of user_ids into quest_id, copying the quest's template tasks.

    Returns {'enrolled': n, 'already': n, 'failed': n}. Users already holding an
    enrollment are left exactly as they are — including a quest they set down or
    finished, which must not be silently restarted underneath them.
    """
    from utils.template_tasks import copy_template_tasks_to_enrollment, load_template_tasks

    user_ids = [u for u in dict.fromkeys(user_ids or []) if u]
    if not user_ids:
        return {'enrolled': 0, 'already': 0, 'failed': 0}

    # Loaded once per quest, not once per person.
    template_tasks = load_template_tasks(quest_id)

    already = set()
    # in_() is a URL filter, so a big roster is chunked rather than sent whole.
    for i in range(0, len(user_ids), 200):
        rows = (admin.table('user_quests').select('user_id')
                .eq('quest_id', quest_id)
                .in_('user_id', user_ids[i:i + 200]).execute()).data or []
        already.update(r['user_id'] for r in rows)

    now = datetime.now(timezone.utc).isoformat()
    enrolled = 0
    failed = 0
    for uid in user_ids:
        if uid in already:
            continue
        try:
            result = admin.table('user_quests').insert({
                'user_id': uid, 'quest_id': quest_id, 'status': 'picked_up',
                'is_active': True, 'times_picked_up': 1,
                'last_picked_up_at': now, 'started_at': now,
            }).execute()
            if not result.data:
                failed += 1
                continue
            enrolled += 1
            if template_tasks:
                copy_template_tasks_to_enrollment(
                    admin, quest_id, uid, result.data[0]['id'],
                    template_tasks=template_tasks,
                )
        except Exception as e:
            # One bad row must not cost the rest of the roster their assignment.
            failed += 1
            logger.error(f"Could not assign quest {quest_id} to {str(uid)[:8]}: {e}")

    return {'enrolled': enrolled, 'already': len(already), 'failed': failed}
