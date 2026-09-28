"""A student picks which optional template tasks to start a quest with.

The quest page sends the picked ids as template_task_ids on enroll
(2026-09-28). Required tasks always come; an older client that sends no pick
gets every task, as before.
"""
from routes.quest.enrollment import template_task_wanted

REQUIRED = {'id': 't-req', 'is_required': True}
OPTIONAL_A = {'id': 't-a', 'is_required': False}
OPTIONAL_B = {'id': 't-b', 'is_required': False}


def test_no_pick_takes_every_task():
    assert all(template_task_wanted(t, None) for t in (REQUIRED, OPTIONAL_A, OPTIONAL_B))


def test_pick_takes_required_and_picked_optional_only():
    picked = {'t-a'}
    assert template_task_wanted(REQUIRED, picked)
    assert template_task_wanted(OPTIONAL_A, picked)
    assert not template_task_wanted(OPTIONAL_B, picked)


def test_empty_pick_still_takes_required():
    assert template_task_wanted(REQUIRED, set())
    assert not template_task_wanted(OPTIONAL_A, set())
