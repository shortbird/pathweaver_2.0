"""
A student's class quests under their curriculum headings, read by the student
or by a guardian working as them; and the home page's quests carrying the
curriculum and the school's order.

Ticket 8700c16d (iCreate org admin who is also a parent): "When I am working
with brady I don't actually see his classes. When he looks up classes he sees
all the quests I assigned in independent study class, but they aren't
organized by class (or in any way for that matter.)"

Ticket 4cc854cd (feature, approved): "Is there a way to see the quests by
class as a student? Or to see them grouped here by class? We still wanted to
have these be able to be sorted. By date, order of quest, class, priority."
"""

from unittest.mock import MagicMock, patch

import pytest

import app as _real_app  # noqa: F401 — import graph ordering
from routes.classes import quests as class_quests_routes
from services.student_quest_sources import attach_curriculum_order
from tests.test_class_curriculum_assign import (
    CLASS, HISTORY, ORG, PHYSICS, Q1, Q3, Q_SHARED, S1, _db,
)
from tests.test_class_quest_copy import _client
from utils.guardian_scope import StudentScope

PARENT = '99999999-9999-4999-8999-999999999999'


def _rows():
    return [
        {'id': f'cq-{i}', 'class_id': CLASS, 'quest_id': q, 'sequence_order': i,
         'quests': {'id': q, 'title': f'Quest {i}'}}
        for i, q in enumerate((Q1, Q_SHARED, Q3))]


def _call(caller, scope_student=None):
    """The view below require_role, so @student_scope runs for real against a
    patched guardian check."""
    view = class_quests_routes.get_class_quests.__wrapped__
    service = MagicMock()
    service.can_access_class.return_value = True
    service.get_class_quests.return_value = _rows()
    scope = StudentScope(caller_id=caller, student_id=scope_student or caller,
                         via='parent' if scope_student else 'self')
    from flask import Flask
    qs = f'?student_id={scope_student}' if scope_student else ''
    with Flask(__name__).test_request_context(f'/q{qs}'), \
         patch('utils.guardian_scope.resolve_student_scope_from_request', return_value=scope), \
         patch.object(class_quests_routes, 'ClassService', return_value=service), \
         patch.object(class_quests_routes, 'get_caller',
                      return_value=(['student'], ORG, {'id': scope.student_id})) as caller_lookup, \
         patch.object(class_quests_routes, 'get_supabase_admin_client',
                      return_value=_client(_db(), [])):
        resp = view(caller, ORG, CLASS)
    body = (resp[0] if isinstance(resp, tuple) else resp).get_json()
    return body, service, caller_lookup


@pytest.mark.unit
class TestClassQuestsCarryCurriculum:

    def test_each_row_names_its_curriculum_or_null(self):
        """8700c16d: "they aren't organized by class (or in any way for that
        matter)" -- the student's list now says which curriculum each quest is
        under, and null for a quest on none of the class's curricula."""
        body, _, _ = _call(S1)
        by_id = {r['quest_id']: r for r in body['quests']}
        assert by_id[Q1]['curriculum_title'] == 'Independent: Applied Physics'
        assert by_id[Q1]['curriculum_id'] == PHYSICS
        # On two curricula: the first one attached to the class wins.
        assert by_id[Q_SHARED]['curriculum_title'] == 'Independent: U.S. History 1'
        assert by_id[Q_SHARED]['curriculum_rank'] == 0
        assert by_id[Q1]['curriculum_rank'] == 1
        assert 'curriculum_title' in by_id[Q3] and by_id[Q3]['curriculum_title'] is None

    def test_a_guardian_in_family_scope_reads_the_class_as_the_child(self):
        """8700c16d: "When I am working with brady I don't actually see his
        classes." With student_id the route answers as the child: the child's
        roles, the child's audience filter -- not the org admin's whole class."""
        body, service, caller_lookup = _call(PARENT, scope_student=S1)
        assert body['success'] is True
        caller_lookup.assert_called_once_with(S1)
        assert service.get_class_quests.call_args.kwargs['student_id'] == S1
        assert body['scope'] == {'student_id': S1, 'delegated': True}


@pytest.mark.unit
class TestDashboardSourceClassCarriesCurriculum:

    def _enrollments(self):
        return [
            {'quest_id': Q1, 'source_class': {'id': CLASS, 'name': 'Independent study',
                                              'enrolled': True}},
            {'quest_id': Q3, 'source_class': {'id': CLASS, 'name': 'Independent study',
                                              'enrolled': True}},
            {'quest_id': 'own-quest', 'source_class': None},
        ]

    def test_source_class_names_the_curriculum_and_the_order(self):
        """4cc854cd: grouped by class, then curriculum, sortable by the school's
        order."""
        db = _db()
        db['class_quests'] = [
            {'class_id': CLASS, 'quest_id': Q1, 'sequence_order': 4},
            {'class_id': CLASS, 'quest_id': Q3, 'sequence_order': 7},
        ]
        es = self._enrollments()
        attach_curriculum_order(_client(db, []), es)
        q1, q3, own = (e['source_class'] for e in es)
        assert q1['curriculum_title'] == 'Independent: Applied Physics'
        assert q1['curriculum_id'] == PHYSICS
        assert q1['curriculum_rank'] == 1 and q1['curriculum_position'] == 0
        assert q1['class_position'] == 4
        # On no curriculum of the class: null heading, class order still known.
        assert q3['curriculum_title'] is None and q3['curriculum_rank'] is None
        assert q3['class_position'] == 7
        assert own is None
        # The three overviews' keys are untouched.
        assert (q1['id'], q1['name'], q1['enrolled']) == (CLASS, 'Independent study', True)

    def test_a_failed_read_leaves_nulls_not_an_error(self):
        broken = MagicMock()
        broken.table.side_effect = RuntimeError('db down')
        es = self._enrollments()
        attach_curriculum_order(broken, es)
        assert es[0]['source_class']['curriculum_title'] is None
        assert es[0]['source_class']['class_position'] is None


@pytest.mark.unit
def test_history_is_rank_zero_because_it_was_attached_first():
    """Guard on the fixture the ranks above rely on."""
    db = _db()
    assert db['sis_curriculum_classes'][0]['curriculum_id'] == HISTORY
