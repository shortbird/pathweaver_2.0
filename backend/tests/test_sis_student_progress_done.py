"""When the Student Progress grid is allowed to say "Done".

`user_quests.completed_at` is not set by finishing tasks. Nothing on the
platform sets it automatically — the student's own app offers a celebration
modal at the end and ending the quest is their choice, so a student who
finishes everything and dismisses that modal leaves the column NULL forever.

Reading it literally left teachers looking at "1/1" in amber for work that was
checked off everywhere else (Gryffin, 2026-09-02, Presley Davis / "Reading
appreciation"; 35 enrollments across 7 orgs were in that state). These pin the
teacher-facing definition so a later refactor cannot quietly go back to
trusting the column alone.
"""

from routes.sis.class_quests import _is_done


OPEN = {'completed_at': None}
ENDED = {'completed_at': '2026-09-01T00:00:00Z'}


def test_every_task_done_reads_as_done_even_though_the_student_never_ended_it():
    assert _is_done(OPEN, 1, 1) is True
    assert _is_done(OPEN, 3, 3) is True


def test_outstanding_work_is_not_done():
    assert _is_done(OPEN, 0, 1) is False
    assert _is_done(OPEN, 2, 3) is False


def test_a_quest_the_student_ended_stays_done_whatever_the_task_counts_say():
    # A task added after they finished must not un-finish their quest.
    assert _is_done(ENDED, 2, 3) is True
    assert _is_done(ENDED, 0, 0) is True


def test_started_with_no_tasks_is_not_done():
    # "Started, nothing to do yet" must not read as finished work.
    assert _is_done(OPEN, 0, 0) is False


def test_no_enrollment_is_not_done():
    assert _is_done(None, 0, 0) is False


def test_more_completions_than_tasks_still_reads_as_done():
    # Defensive: duplicate completion rows must not flip a finished quest back.
    assert _is_done(OPEN, 4, 3) is True
