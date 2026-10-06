"""
A curriculum's quests for chosen students, and class quests grouped by
curriculum. Ticket 1a630837 (iCreate org admin, "Independent study" class).

"Add N to this class" on a curriculum card (POST .../quests/from-curriculum)
always gave the whole set to the whole class. An independent-study class
carries several curricula -- Applied Physics, U.S. History 1, ... -- and each
student takes some of them. Now the request may carry student_ids:

  - new links are written with those students;
  - a quest already on the class for everyone is left alone;
  - a quest already kept to some students gets the union;
  - dates on an existing link never change; nobody loses a quest here.

And the class quest list names each quest's curriculum, the first one attached
to the class when a quest sits on several.
"""

import uuid as _uuid
from unittest.mock import patch

import pytest

import app as _real_app  # noqa: F401 — import graph ordering
from routes.sis import class_quests as cq
from services.class_curriculum_assign import curriculum_by_quest
from tests.test_class_quest_copy import _client, _writes

ORG = 'org-icreate'
CLASS = str(_uuid.uuid4())
PHYSICS = str(_uuid.uuid4())
HISTORY = str(_uuid.uuid4())
NOT_ATTACHED = str(_uuid.uuid4())
Q1, Q2, Q3, Q_SHARED = (str(_uuid.uuid4()) for _ in range(4))
TEACHER = str(_uuid.uuid4())
S1, S2, S3 = (str(_uuid.uuid4()) for _ in range(3))
OUTSIDER = str(_uuid.uuid4())


def _db():
    return {
        'org_classes': [{'id': CLASS, 'organization_id': ORG, 'name': 'Independent study',
                         'primary_instructor_id': TEACHER, 'assistant_instructor_ids': [],
                         'status': 'active'}],
        'class_advisors': [],
        'class_enrollments': [
            {'class_id': CLASS, 'student_id': s, 'status': 'active'} for s in (S1, S2, S3)],
        'quests': [{'id': q, 'title': f'Quest {i}', 'organization_id': ORG,
                    'is_active': True, 'is_public': False}
                   for i, q in enumerate((Q1, Q2, Q3, Q_SHARED))],
        # History is attached first, Physics second (titles sort the other way).
        'sis_curriculum_classes': [
            {'curriculum_id': HISTORY, 'class_id': CLASS, 'created_at': '2026-09-27T21:58:38Z'},
            {'curriculum_id': PHYSICS, 'class_id': CLASS, 'created_at': '2026-09-27T21:58:56Z'},
        ],
        'sis_curriculum': [
            {'id': PHYSICS, 'title': 'Independent: Applied Physics', 'is_active': True},
            {'id': HISTORY, 'title': 'Independent: U.S. History 1', 'is_active': True},
            {'id': NOT_ATTACHED, 'title': 'Somebody else’s', 'is_active': True},
        ],
        'sis_curriculum_quests': [
            {'curriculum_id': PHYSICS, 'quest_id': Q1, 'sequence_order': 0},
            {'curriculum_id': PHYSICS, 'quest_id': Q2, 'sequence_order': 1},
            {'curriculum_id': PHYSICS, 'quest_id': Q_SHARED, 'sequence_order': 2},
            {'curriculum_id': HISTORY, 'quest_id': Q_SHARED, 'sequence_order': 0},
            {'curriculum_id': NOT_ATTACHED, 'quest_id': Q3, 'sequence_order': 0},
        ],
        'class_quests': [],
        'user_quests': [],
        'user_quest_tasks': [],
        'quest_task_completions': [],
        'user_task_evidence_documents': [],
    }


def _from_curriculum(body, db, caller=TEACHER):
    view = cq.copy_quests_from_curriculum
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    from flask import Flask
    log = []
    with Flask(__name__).test_request_context('/fc', method='POST', json=body), \
         patch.object(cq, 'get_supabase_admin_client', return_value=_client(db, log)), \
         patch.object(cq.sis_service, 'caller_is_admin', return_value=False), \
         patch.object(cq.sis_service, 'resolve_org_id', return_value=ORG), \
         patch('routes.quest_types.get_template_tasks', return_value=[]), \
         patch('utils.template_tasks.get_valid_source_template_ids', return_value=set()), \
         patch('utils.class_membership.guardians_by_student', return_value={}):
        resp = view(caller, CLASS)
    out, status = (resp if isinstance(resp, tuple) else (resp, 200))
    return out.get_json(), status, log


def _link(db, quest_id):
    return next(r for r in db['class_quests'] if r['quest_id'] == quest_id)


def _holders(db, quest_id):
    return sorted(r['user_id'] for r in db['user_quests'] if r['quest_id'] == quest_id)


@pytest.mark.unit
class TestChosenStudents:

    def test_the_set_goes_to_the_chosen_students_only(self):
        """1a630837: assign Applied Physics to the students taking it."""
        db = _db()
        out, status, _ = _from_curriculum({'curriculum_id': PHYSICS, 'student_ids': [S1, S2]}, db)
        assert status == 200, out
        assert out['added'] == 3
        for q in (Q1, Q2, Q_SHARED):
            assert sorted(_link(db, q)['student_ids']) == sorted([S1, S2])
            assert _holders(db, q) == sorted([S1, S2])
        assert out['students_enrolled'] == 6

    def test_without_student_ids_it_is_the_whole_class_as_before(self):
        db = _db()
        out, status, _ = _from_curriculum({'curriculum_id': PHYSICS}, db)
        assert status == 200, out
        assert _link(db, Q1)['student_ids'] is None
        assert _holders(db, Q1) == sorted([S1, S2, S3])

    def test_every_student_picked_is_stored_as_the_whole_class(self):
        """So the quests keep reaching students who join later."""
        db = _db()
        _from_curriculum({'curriculum_id': PHYSICS, 'student_ids': [S3, S1, S2]}, db)
        assert _link(db, Q1)['student_ids'] is None

    def test_a_student_not_on_the_class_is_dropped(self):
        db = _db()
        _from_curriculum({'curriculum_id': PHYSICS, 'student_ids': [S1, OUTSIDER]}, db)
        assert _link(db, Q1)['student_ids'] == [S1]

    def test_nobody_on_the_class_is_refused_and_nothing_is_written(self):
        db = _db()
        out, status, log = _from_curriculum({'curriculum_id': PHYSICS, 'student_ids': [OUTSIDER]}, db)
        assert status == 400, out
        assert _writes(log) == []

    def test_a_malformed_list_is_refused(self):
        out, status, _ = _from_curriculum({'curriculum_id': PHYSICS, 'student_ids': 'S1'}, _db())
        assert status == 400, out

    def test_a_curriculum_not_attached_to_the_class_is_refused(self):
        out, status, log = _from_curriculum({'curriculum_id': NOT_ATTACHED, 'student_ids': [S1]}, _db())
        assert status == 404, out
        assert _writes(log) == []


@pytest.mark.unit
class TestQuestsAlreadyOnTheClass:

    def _seeded(self):
        db = _db()
        db['class_quests'] = [
            # Everyone's already: must stay everyone's.
            {'id': 'cq-1', 'class_id': CLASS, 'quest_id': Q1, 'sequence_order': 0,
             'publish_at': None, 'due_date': '2026-10-20T23:59:59Z', 'student_ids': None},
            # Kept to S2: gets the union.
            {'id': 'cq-2', 'class_id': CLASS, 'quest_id': Q2, 'sequence_order': 1,
             'publish_at': None, 'due_date': '2026-10-21T23:59:59Z', 'student_ids': [S2]},
        ]
        return db

    def test_a_whole_class_quest_is_left_alone(self):
        db = self._seeded()
        out, _, _ = _from_curriculum({'curriculum_id': PHYSICS, 'student_ids': [S1]}, db)
        assert _link(db, Q1)['student_ids'] is None
        assert _link(db, Q1)['due_date'] == '2026-10-20T23:59:59Z'
        assert out['skipped_already_present'] == 1

    def test_a_per_student_quest_gets_the_union_and_keeps_its_dates(self):
        db = self._seeded()
        out, _, _ = _from_curriculum({'curriculum_id': PHYSICS, 'student_ids': [S1]}, db)
        assert sorted(_link(db, Q2)['student_ids']) == sorted([S1, S2])
        assert _link(db, Q2)['due_date'] == '2026-10-21T23:59:59Z'
        assert S1 in _holders(db, Q2)
        assert out['widened'] == 1 and out['added'] == 1

    def test_asking_for_everyone_widens_a_per_student_quest_to_everyone(self):
        db = self._seeded()
        _from_curriculum({'curriculum_id': PHYSICS}, db)
        assert _link(db, Q2)['student_ids'] is None
        # S1 and S3 are new to it; S2 had it already.
        assert set(_holders(db, Q2)) >= {S1, S3}

    def test_nobody_loses_a_quest(self):
        db = self._seeded()
        db['user_quests'] = [{'id': 'uq-1', 'user_id': S2, 'quest_id': Q2,
                              'is_active': True, 'completed_at': None}]
        _from_curriculum({'curriculum_id': PHYSICS, 'student_ids': [S1]}, db)
        assert S2 in _holders(db, Q2)


@pytest.mark.unit
class TestGroupedByCurriculum:

    def test_a_quest_on_two_curricula_goes_under_the_first_attached(self):
        """History was attached first, so the shared quest is a History quest
        even though Physics sorts first by title."""
        groups = curriculum_by_quest(_client(_db(), []), CLASS)
        assert groups[Q_SHARED] == {'curriculum_id': HISTORY,
                                    'curriculum_title': 'Independent: U.S. History 1'}
        assert groups[Q1]['curriculum_id'] == PHYSICS
        # A curriculum not attached to the class names nothing.
        assert Q3 not in groups

    def test_the_class_list_carries_the_heading(self):
        db = _db()
        quests = {q['id']: q for q in db['quests']}
        db['class_quests'] = [
            {'id': f'cq-{i}', 'class_id': CLASS, 'quest_id': q, 'sequence_order': i,
             'publish_at': None, 'due_date': None, 'student_ids': None, 'quests': quests[q]}
            for i, q in enumerate((Q1, Q3))]
        view = cq.list_class_quests
        while hasattr(view, '__wrapped__'):
            view = view.__wrapped__
        from flask import Flask
        with Flask(__name__).test_request_context('/l'), \
             patch.object(cq, 'get_supabase_admin_client', return_value=_client(db, [])), \
             patch.object(cq.sis_service, 'caller_is_admin', return_value=False), \
             patch.object(cq.sis_service, 'resolve_org_id', return_value=ORG), \
             patch.object(cq.student_class_quests, 'made_by', return_value={}):
            out = view(TEACHER, CLASS).get_json()
        by_id = {q['quest_id']: q for q in out['quests']}
        assert by_id[Q1]['curriculum_title'] == 'Independent: Applied Physics'
        assert by_id[Q3]['curriculum_id'] is None and by_id[Q3]['curriculum_title'] is None
