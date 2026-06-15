"""
Aggregate-XP reversal helpers.

`quest_task_completions` has no `xp_awarded` column -- a completion's XP is
derived from its task's `user_quest_tasks.xp_value`. The aggregate tables
(`user_skill_xp` per pillar and `users.total_xp`) are denormalized: they are
only ever incremented on completion. Any path that deletes completions must
therefore reverse the aggregates first, or the XP leaks (a user keeps XP for
work whose completion record is gone).

Use `reverse_quest_xp` before deleting a quest's completions.
"""

import logging

logger = logging.getLogger(__name__)


def reverse_quest_xp(admin_supabase, quest_id: str) -> int:
    """
    Reverse user_skill_xp and total_xp for every completion of a quest.

    Must be called BEFORE the quest's quest_task_completions / user_quest_tasks
    rows are deleted, since XP is derived from the task's xp_value.

    Args:
        admin_supabase: an admin (service-role) Supabase client
        quest_id: the quest whose completions are about to be removed

    Returns:
        Total XP reversed across all affected users (for logging).
    """
    completions = admin_supabase.table('quest_task_completions') \
        .select('user_id, user_quest_task_id') \
        .eq('quest_id', quest_id) \
        .execute()
    rows = completions.data or []
    if not rows:
        return 0

    task_ids = list({r['user_quest_task_id'] for r in rows if r.get('user_quest_task_id')})
    if not task_ids:
        return 0

    tasks = admin_supabase.table('user_quest_tasks') \
        .select('id, pillar, xp_value') \
        .in_('id', task_ids) \
        .execute()
    task_map = {t['id']: t for t in (tasks.data or [])}

    # Aggregate the XP to remove per (user, pillar) and per user.
    per_user_pillar: dict = {}
    per_user_total: dict = {}
    for r in rows:
        task = task_map.get(r.get('user_quest_task_id'))
        if not task:
            continue
        xp = task.get('xp_value') or 0
        if xp <= 0:
            continue
        uid = r['user_id']
        pillar = task.get('pillar')
        per_user_total[uid] = per_user_total.get(uid, 0) + xp
        if pillar:
            key = (uid, pillar)
            per_user_pillar[key] = per_user_pillar.get(key, 0) + xp

    # Decrement per-pillar skill XP (clamped at 0).
    for (uid, pillar), xp in per_user_pillar.items():
        try:
            current = admin_supabase.table('user_skill_xp') \
                .select('id, xp_amount') \
                .eq('user_id', uid).eq('pillar', pillar).execute()
            if current.data:
                new_xp = max(0, (current.data[0].get('xp_amount') or 0) - xp)
                admin_supabase.table('user_skill_xp') \
                    .update({'xp_amount': new_xp}) \
                    .eq('id', current.data[0]['id']).execute()
        except Exception as err:
            logger.warning(f"Could not reverse skill XP for user {uid[:8]} pillar {pillar}: {err}")

    # Decrement total XP (clamped at 0).
    total_reversed = 0
    for uid, xp in per_user_total.items():
        try:
            user = admin_supabase.table('users').select('total_xp').eq('id', uid).single().execute()
            if user.data:
                new_total = max(0, (user.data.get('total_xp') or 0) - xp)
                admin_supabase.table('users').update({'total_xp': new_total}).eq('id', uid).execute()
                total_reversed += xp
        except Exception as err:
            logger.warning(f"Could not reverse total XP for user {uid[:8]}: {err}")

    if total_reversed:
        logger.info(f"Reversed {total_reversed} XP across {len(per_user_total)} users for deleted quest {quest_id}")
    return total_reversed
