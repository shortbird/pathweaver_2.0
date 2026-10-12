"""
A library curriculum edit assigns only what is new, and only to the students
the class gives that curriculum to.

iCreate, ticket 30968a7e (2026-10-12), an org admin on the "Independent
Study" class: "I did not assign Independent Study: Science to the kids in the
class, but it assigned it anyway."

Two mistakes stacked:

  - PUT /curriculum/<id>/quests pushed the WHOLE saved list on every save, so
    an unchanged re-save or a reorder re-gave each class every quest of the
    curriculum it did not have (including ones a teacher had taken off).
  - push_curriculum_quests_to_classes wrote every new row for the whole class,
    ignoring that a class like Independent Study gives each curriculum to the
    students taking it (823de297's per-curriculum "Who gets it", which lives
    on the class_quests rows of that curriculum's quests).

Now: only quests new to the set are pushed, each to the curriculum's audience
on that class. A class that gives the curriculum to nobody, and keeps quests
to chosen students, gets nothing. An ordinary whole-class section (no quest
kept to anyone) still gets the curriculum's quests for everyone, which is the
2026-09-02 behaviour every other caller relies on.
"""

from unittest.mock import Mock, patch

import routes.sis.curriculum as curriculum
from services.sis_curriculum_sync import push_curriculum_quests_to_classes
from tests.test_class_quest_audience import CLASS, Q1, Q2, S1, S2, _Table, _run
from tests.test_sis_curriculum_container import ORG, _put

CURR = '22222222-2222-4222-8222-222222222222'
OTHER_CURR = '22222222-2222-4222-8222-222222222229'
Q3 = '33333333-3333-4333-8333-333333333333'
ADMIN = '99999999-9999-4999-8999-999999999999'


class _UpsertTable(_Table):
    def upsert(self, payload, **_k):
        return self.insert(payload)


def _client(db, log):
    c = Mock()
    c.table.side_effect = lambda name: _UpsertTable(db, name, log)
    return c


def _db(class_quests, saved=(Q1, Q2)):
    """CLASS on CURR, roster S1 + S2; CURR saves `saved`; Q1..Q3 are the org's."""
    return {
        'sis_curriculum_classes': [{'curriculum_id': CURR, 'class_id': CLASS}],
        'org_classes': [{'id': CLASS, 'status': 'active'}],
        'sis_curriculum_quests': [{'curriculum_id': CURR, 'quest_id': q, 'sequence_order': i}
                                  for i, q in enumerate(saved)],
        'quests': [{'id': q, 'organization_id': ORG, 'is_active': True, 'is_public': False}
                   for q in (Q1, Q2, Q3)],
        'class_quests': class_quests,
        'class_enrollments': [{'class_id': CLASS, 'student_id': S1, 'status': 'active'},
                              {'class_id': CLASS, 'student_id': S2, 'status': 'active'}],
        'user_quests': [], 'user_quest_tasks': [],
        'quest_task_completions': [], 'user_task_evidence_documents': [],
    }


def _push(db, **kw):
    log = []

    def go(_c):
        return push_curriculum_quests_to_classes(_client(db, log), CURR, ORG, ADMIN, **kw)
    out, _ = _run(go, db)
    return out


def _row(quest, student_ids, seq=0):
    return {'id': f'cq-{quest[-1]}', 'class_id': CLASS, 'quest_id': quest,
            'sequence_order': seq, 'publish_at': None, 'student_ids': student_ids}


def _new_row(db, quest):
    return next(r for r in db['class_quests'] if r['quest_id'] == quest)


def _enrolled(db, quest):
    return sorted(r['user_id'] for r in db['user_quests'] if r['quest_id'] == quest)


class TestTheLibraryEditPushesOnlyWhatIsNew:

    def _save(self, quest_ids, saved_before):
        tables = {'quests': [{'id': q, 'organization_id': ORG} for q in (Q1, Q2, Q3)],
                  'sis_curriculum_quests': [{'quest_id': q} for q in saved_before]}
        with patch.object(curriculum, 'push_curriculum_quests_safe',
                          return_value={'classes': 1, 'assignments': 1}) as push:
            body, status, _ = _put(curriculum.set_curriculum_quests,
                                   {'quest_ids': quest_ids}, tables)
        assert status == 200
        return body, push

    def test_an_unchanged_resave_assigns_nothing(self):
        """30968a7e: "I did not assign Independent Study: Science to the kids in
        the class, but it assigned it anyway." The old route pushed the whole
        list on every save."""
        body, push = self._save([Q1, Q2], saved_before=[Q1, Q2])
        push.assert_not_called()
        assert body['pushed_assignments'] == 0

    def test_a_reorder_assigns_nothing(self):
        _, push = self._save([Q2, Q1], saved_before=[Q1, Q2])
        push.assert_not_called()

    def test_only_the_added_quest_is_pushed(self):
        _, push = self._save([Q1, Q3, Q2], saved_before=[Q1, Q2])
        assert push.call_args.kwargs['quest_ids'] == [Q3]


class TestANewQuestFollowsTheCurriculumsAudience:

    def test_a_curriculum_kept_to_one_student_reaches_only_that_student(self):
        """30968a7e: the class gives this curriculum to S1 only."""
        db = _db([_row(Q1, [S1])])
        out = _push(db, quest_ids=[Q2])
        assert out == {'classes': 1, 'assignments': 1}
        assert _new_row(db, Q2)['student_ids'] == [S1]
        assert _enrolled(db, Q2) == [S1]

    def test_a_curriculum_given_to_nobody_on_a_per_student_class_gets_nothing(self):
        """The Science case: the class keeps other curricula's quests to chosen
        students and has none of this one's."""
        db = _db([_row(Q3, [S2])], saved=(Q1, Q2))
        out = _push(db, quest_ids=[Q2])
        assert out == {'classes': 0, 'assignments': 0}
        assert [r['quest_id'] for r in db['class_quests']] == [Q3]
        assert db['user_quests'] == []

    def test_a_whole_class_curriculum_still_reaches_everyone(self):
        db = _db([_row(Q1, None)])
        _push(db, quest_ids=[Q2])
        assert _new_row(db, Q2)['student_ids'] is None
        assert _enrolled(db, Q2) == [S1, S2]

    def test_the_default_path_an_ordinary_section_gets_it_for_everyone(self):
        """Other callers (class attach, create-in-curriculum) rely on this: a
        class that keeps nothing to chosen students gets the curriculum's
        quests for the whole class, as since 2026-09-02."""
        db = _db([])
        out = _push(db)
        assert out == {'classes': 1, 'assignments': 2}
        assert {r['quest_id']: r['student_ids'] for r in db['class_quests']} == {Q1: None, Q2: None}
        assert _enrolled(db, Q1) == [S1, S2]


class TestAttachingAClass:

    def test_a_per_student_class_newly_attached_is_assigned_nothing(self):
        """The class-attach path had the same mistake: attaching a curriculum
        to Independent Study from the library put its whole set on every
        student."""
        db = _db([_row(Q3, [S2])])
        out = _push(db, class_ids=[CLASS])
        assert out == {'classes': 0, 'assignments': 0}
        assert db['user_quests'] == []

    def test_an_ordinary_class_newly_attached_inherits_the_set(self):
        db = _db([])
        out = _push(db, class_ids=[CLASS])
        assert out['assignments'] == 2
