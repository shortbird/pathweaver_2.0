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
