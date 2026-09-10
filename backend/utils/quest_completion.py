"""Is a student finished with a quest, as a teacher means it?

One rule, used everywhere the platform answers that question about assigned
work: the class progress grid, the "remind this student" nudge, and the weekly
parent digest. They must agree, because a family reads all three.
"""


def is_quest_done(user_quest, done: int, total: int) -> bool:
    """True when the student is finished with this quest.

    `user_quests.completed_at` is NOT the answer on its own. Nothing on the
    platform sets it automatically: finishing the last task only makes the
    student's own app offer a celebration modal, and ending the quest there is
    the student's choice — they are equally free to keep it open and add more
    tasks ("The Process Is The Goal"). A student who finishes everything and
    dismisses that modal leaves completed_at NULL forever.

    Read literally, that left the class grid saying "1/1" in amber for work that
    was checked off everywhere else on the platform (Gryffin, 2026-09-02: "why
    Presley's reading appreciation task doesn't say 'done' in the progress, but
    is checked off everywhere else"). 35 enrollments across 7 orgs were in that
    state. A teacher asking "is this student done" means every assigned task is
    turned in, so answer that question instead.

    The parent digest depends on this too, and more sharply: the difference
    between the two readings is the difference between telling a family their
    child has 15 late assignments and telling them the truth.

    Args:
        user_quest: the student's `user_quests` row for the quest, or None when
            they have never started it.
        done: how many of their tasks for it have a completion.
        total: how many tasks they have for it.
    """
    return bool(user_quest and user_quest.get('completed_at')) or (total > 0 and done >= total)


def task_progress(client, user_quest_ids):
    """{user_quest_id: (done, total)} for these enrollments.

    Counts every task on the enrollment, not just the ones flagged required.
    That is the rule `is_quest_done` applies, and the two have to agree: a
    quest auto-ended on the required-only reading would drop off the student's
    home page while the teacher's grid still showed it outstanding.

    Bounded by the caller's own enrollments. For a whole-org sweep, page the
    task read with utils.db_fetch.fetch_all_rows instead.
    """
    if not user_quest_ids:
        return {}

    ids = list(user_quest_ids)
    tasks = []
    for start in range(0, len(ids), 100):
        tasks.extend((client.table('user_quest_tasks')
                      .select('id, user_quest_id')
                      .in_('user_quest_id', ids[start:start + 100])
                      .execute()).data or [])

    task_ids = [t['id'] for t in tasks]
    done_ids = set()
    for start in range(0, len(task_ids), 200):  # keep the IN list sane
        rows = (client.table('quest_task_completions')
                .select('task_id')
                .in_('task_id', task_ids[start:start + 200])
                .execute()).data or []
        done_ids.update(r['task_id'] for r in rows)

    progress = {uq_id: [0, 0] for uq_id in ids}
    for t in tasks:
        bucket = progress.setdefault(t['user_quest_id'], [0, 0])
        bucket[1] += 1
        if t['id'] in done_ids:
            bucket[0] += 1
    return {uq_id: (done, total) for uq_id, (done, total) in progress.items()}
