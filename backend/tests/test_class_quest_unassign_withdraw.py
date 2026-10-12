"""
Unassigning a quest from a class takes it out of the students' accounts.

iCreate, ticket b38c5085 (2026-10-12), an org admin testing with her own kids
on the "Independent Study" class: "I unassigned IS Science from when it
assigned to Cami, but it still shows up in her learning app."

DELETE /api/sis/classes/<cid>/quests/<qid> deleted the class_quests row and
nothing else, so every enrollment it had created stayed in the students'
accounts. The per-student remove already did this right
(withdraw_students_from_quest); unassigning now applies the same rule to the
row's whole audience:

  - untouched enrollment               deleted
  - work behind it                     set down (work and XP kept)
  - finished                           left alone
  - student not in the row's audience  not touched
  - student who still gets the quest   not touched
    from another live class
  - a quest not yet released           nobody touched (it never reached them
                                       through this class)
"""

from unittest.mock import patch

from flask import Flask

import routes.sis.class_quests as class_quests
from services.class_quest_enrollment import unassign_class_quest_and_withdraw
from tests.test_class_quest_audience import (
    CLASS, FUTURE, PAST, Q1, S1, S2, S3, _client, _db, _run, _task, _uq,
)

CLASS2 = '44444444-4444-4444-8444-444444444445'


def _unassign(db, class_id=CLASS, quest_id=Q1):
    return _run(lambda c: unassign_class_quest_and_withdraw(c, class_id, quest_id), db)


class TestUnassigningWithdraws:

    def test_the_route_takes_the_quest_out_of_the_students_accounts(self):
        """b38c5085: "I unassigned IS Science from when it assigned to Cami,
        but it still shows up in her learning app." Fails on the old route,
        which deleted only the class_quests row."""
        db = _db(user_quests=[_uq(S1, uq_id='uq-1')])
        log = []
        client = _client(db, log)
        with patch.object(class_quests, '_authorize',
                          return_value=({'id': CLASS, 'organization_id': 'org'}, client, None)):
            app = Flask(__name__)
            with app.app_context():
                fn = class_quests.unassign_quest
                while hasattr(fn, '__wrapped__'):
                    fn = fn.__wrapped__
                resp = fn('staff-1', CLASS, Q1)
        assert resp.get_json()['success'] is True
        assert db['class_quests'] == []
        assert db['user_quests'] == []

    def test_untouched_goes_started_is_set_down_finished_stays(self):
        db = _db(
            class_quests=[{'id': 'cq-1', 'class_id': CLASS, 'quest_id': Q1,
                           'publish_at': PAST, 'student_ids': None}],
            class_enrollments=[
                {'class_id': CLASS, 'student_id': S1, 'status': 'active'},
                {'class_id': CLASS, 'student_id': S2, 'status': 'active'},
                {'class_id': CLASS, 'student_id': S3, 'status': 'active'},
            ],
            user_quests=[_uq(S1, uq_id='uq-1'), _uq(S2, uq_id='uq-2'),
                         _uq(S3, uq_id='uq-3', completed_at=PAST)],
            user_quest_tasks=[_task('uq-2', 't-2')],
            quest_task_completions=[{'task_id': 't-2'}],
        )
        out, _ = _unassign(db)
        assert out == {'students': 3, 'shared': 0, 'removed': 1, 'set_down': 1, 'kept': 1}
        left = {r['user_id']: r for r in db['user_quests']}
        assert S1 not in left
        assert left[S2]['is_active'] is False
        assert left[S3]['completed_at'] == PAST and left[S3]['is_active'] is True
        assert db['class_quests'] == []

    def test_a_student_outside_the_rows_audience_is_not_touched(self):
        """A quest kept to S1: S2's enrollment came from somewhere else."""
        db = _db(class_quests=[{'id': 'cq-1', 'class_id': CLASS, 'quest_id': Q1,
                                'publish_at': None, 'student_ids': [S1]}],
                 user_quests=[_uq(S1, uq_id='uq-1'), _uq(S2, uq_id='uq-2')])
        out, _ = _unassign(db)
        assert out['students'] == 1 and out['removed'] == 1
        assert [r['user_id'] for r in db['user_quests']] == [S2]

    def test_a_student_who_still_gets_it_from_another_class_keeps_it(self):
        db = _db(
            class_quests=[
                {'id': 'cq-1', 'class_id': CLASS, 'quest_id': Q1, 'publish_at': None,
                 'student_ids': None},
                {'id': 'cq-2', 'class_id': CLASS2, 'quest_id': Q1, 'publish_at': None,
                 'student_ids': [S1]},
            ],
            class_enrollments=[
                {'class_id': CLASS, 'student_id': S1, 'status': 'active'},
                {'class_id': CLASS, 'student_id': S2, 'status': 'active'},
                {'class_id': CLASS2, 'student_id': S1, 'status': 'active'},
            ],
            org_classes=[{'id': CLASS, 'status': 'active'}, {'id': CLASS2, 'status': 'active'}],
            user_quests=[_uq(S1, uq_id='uq-1'), _uq(S2, uq_id='uq-2')],
        )
        out, _ = _unassign(db)
        assert out['shared'] == 1 and out['removed'] == 1
        assert [r['user_id'] for r in db['user_quests']] == [S1]
        # Only this class's row went.
        assert [r['class_id'] for r in db['class_quests']] == [CLASS2]

    def test_a_quest_not_yet_released_withdraws_nobody(self):
        db = _db(class_quests=[{'id': 'cq-1', 'class_id': CLASS, 'quest_id': Q1,
                                'publish_at': FUTURE, 'student_ids': None}],
                 user_quests=[_uq(S1, uq_id='uq-1')])
        out, _ = _unassign(db)
        assert out['students'] == 0
        assert len(db['user_quests']) == 1
        assert db['class_quests'] == []

    def test_a_quest_not_on_the_class_is_none_and_writes_nothing(self):
        db = _db(user_quests=[_uq(S1, uq_id='uq-1')])
        out, log = _unassign(db, quest_id='33333333-3333-4333-8333-333333333339')
        assert out is None
        assert log == []


def test_the_per_student_remove_is_unchanged():
    """The default path other callers rely on: withdraw_students_from_quest
    still touches only the students it is given."""
    from services.class_quest_enrollment import withdraw_students_from_quest
    db = _db(user_quests=[_uq(S1, uq_id='uq-1'), _uq(S2, uq_id='uq-2')])
    out, _ = _run(lambda c: withdraw_students_from_quest(c, [S1], Q1), db)
    assert out == {'removed': 1, 'set_down': 0, 'kept': 0}
    assert [r['user_id'] for r in db['user_quests']] == [S2]
