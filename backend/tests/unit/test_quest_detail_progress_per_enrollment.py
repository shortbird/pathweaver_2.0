"""GET /api/quests/<id>: progress counts only the current enrollment's tasks.

The completions read is per quest, so after a re-enrollment it also returns
the earlier run's completions. Progress counted those against the new run's
tasks: over 100%, or 100% with tasks still open -- and the web app read 100%
as "ended" and hid the End button (London Grover, 2026-10-02).
"""

from tests.unit.test_quest_detail_opened_and_reviews import STUDENT, _call, _db


def _with_old_run_completions(db):
    db['quest_task_completions'] = db['quest_task_completions'] + [
        {'id': 'old-1', 'user_quest_task_id': 'old-task-1', 'evidence_text': 'x',
         'evidence_url': None, 'completed_at': '2026-01-10T10:00:00+00:00'},
        {'id': 'old-2', 'user_quest_task_id': 'old-task-2', 'evidence_text': 'y',
         'evidence_url': None, 'completed_at': '2026-01-11T10:00:00+00:00'},
    ]
    return db


def test_an_earlier_runs_completions_do_not_count_toward_this_run():
    payload, status = _call(_with_old_run_completions(_db()), STUDENT)

    assert status == 200
    progress = payload['quest']['progress']
    assert progress['completed_tasks'] == 1
    assert progress['total_tasks'] == 2
    assert progress['percentage'] == 50


def test_this_runs_completions_still_mark_their_tasks_done():
    payload, _ = _call(_with_old_run_completions(_db()), STUDENT)

    done = {t['id']: t['is_completed'] for t in payload['quest']['quest_tasks']}
    assert done == {'t1': True, 't2': False}
