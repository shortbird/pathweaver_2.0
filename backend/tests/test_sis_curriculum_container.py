"""
The curriculum as the container for a class's teaching material.

iCreate, 2026-08-06: "consolidate curriculum/courses/quests. admin should attach
courses/quests to curriculum so they're reusable year after year and teachers
have resources to use, rather than requiring teachers to create their own
quests."

Half of this already existed: sis_curriculum_quests (2026-08-04) let a class
save its quest list back onto the curriculum. What was missing was the other
direction — an admin setting a year up before any section exists has no class to
edit the set from — and courses, which had no link to a curriculum at all.

The rules worth pinning down here are the boundaries. A curriculum may point at
its own school's material or at the shared Optio library, and never at another
school's: a link to somebody else's course renders as nothing for everyone but
them, so it has to be refused at the door rather than filtered at read time.
"""

from unittest.mock import Mock, patch

import pytest

import routes.sis.curriculum as curriculum


# Real UUIDs: the routes validate ids before anything else, so 'curr-1' would
# 404 on shape and never reach the logic under test.
ORG = '11111111-1111-4111-8111-111111111111'
CURR = '22222222-2222-4222-8222-222222222222'
Q1 = '33333333-3333-4333-8333-333333333331'
Q2 = '33333333-3333-4333-8333-333333333332'
C1 = '44444444-4444-4444-8444-444444444441'
OTHER_ORG = '55555555-5555-4555-8555-555555555555'


class _FakeTable:
    """Records deletes/inserts and answers selects from a canned table map."""

    def __init__(self, name, rows, log):
        self.name = name
        self._rows = rows
        self._log = log

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def is_(self, *_a, **_k):
        return self

    def ilike(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, *_a, **_k):
        return self

    def delete(self):
        self._log.append(('delete', self.name))
        return self

    def insert(self, payload):
        self._log.append(('insert', self.name, payload))
        return self

    def execute(self):
        return Mock(data=self._rows)


def _client(tables, log):
    c = Mock()
    c.table.side_effect = lambda name: _FakeTable(name, tables.get(name, []), log)
    return c


def _put(route, body, tables, owned=True):
    """Drive one of the PUT routes with a stubbed DB. Returns (json, status, log)."""
    log = []
    app_ctx = curriculum.bp
    with patch.object(curriculum, '_admin', return_value=_client(tables, log)), \
         patch.object(curriculum, '_org_or_error', return_value=(ORG, None)), \
         patch.object(curriculum, '_owned',
                      return_value={'id': CURR, 'organization_id': ORG} if owned else None), \
         patch.object(curriculum, 'request', Mock(get_json=lambda silent=True: body,
                                                  args={})):
        from flask import Flask
        app = Flask(__name__)
        with app.app_context():
            resp = route.__wrapped__('user-1', CURR) if hasattr(route, '__wrapped__') \
                else route('user-1', CURR)
    body_json = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    assert app_ctx is not None
    return body_json, status, log


def _inserted(log, table):
    for entry in log:
        if entry[0] == 'insert' and entry[1] == table:
            return entry[2]
    return None


@pytest.mark.unit
class TestTheQuestSet:
    def test_an_admin_can_set_it_without_going_through_a_class(self):
        """The direction that was missing: setting a year up before the sections
        that will teach it exist."""
        tables = {'quests': [{'id': Q1, 'organization_id': ORG},
                             {'id': Q2, 'organization_id': ORG}]}
        body, status, log = _put(curriculum.set_curriculum_quests,
                                 {'quest_ids': [Q1, Q2]}, tables)
        assert status == 200 and body['attached'] == 2
        assert [r['quest_id'] for r in _inserted(log, 'sis_curriculum_quests')] == [Q1, Q2]

    def test_the_order_is_kept(self):
        tables = {'quests': [{'id': Q1, 'organization_id': ORG},
                             {'id': Q2, 'organization_id': ORG}]}
        _, _, log = _put(curriculum.set_curriculum_quests,
                         {'quest_ids': [Q2, Q1]}, tables)
        rows = _inserted(log, 'sis_curriculum_quests')
        assert [r['quest_id'] for r in rows] == [Q2, Q1]
        assert [r['sequence_order'] for r in rows] == [0, 1]

    def test_the_shared_optio_library_is_allowed(self):
        tables = {'quests': [{'id': Q1, 'organization_id': None}]}
        body, _, _ = _put(curriculum.set_curriculum_quests, {'quest_ids': [Q1]}, tables)
        assert body['attached'] == 1

    def test_another_school_s_quest_is_refused(self):
        """Not filtered at read time — refused at the door. A link nobody but the
        other school can resolve is a row that renders as nothing forever."""
        tables = {'quests': [{'id': Q1, 'organization_id': OTHER_ORG}]}
        body, _, log = _put(curriculum.set_curriculum_quests, {'quest_ids': [Q1]}, tables)
        assert body['success'] is True
        assert (body['attached'], body['rejected']) == (0, 1)
        assert _inserted(log, 'sis_curriculum_quests') is None
        # Nothing was attached, so nothing is pushed at the classes either.
        assert body['pushed_assignments'] == 0
        assert _inserted(log, 'class_quests') is None

    def test_duplicates_collapse(self):
        tables = {'quests': [{'id': Q1, 'organization_id': ORG}]}
        body, _, log = _put(curriculum.set_curriculum_quests,
                            {'quest_ids': [Q1, Q1]}, tables)
        assert body['attached'] == 1
        assert len(_inserted(log, 'sis_curriculum_quests')) == 1

    def test_an_empty_list_clears_the_set(self):
        body, _, log = _put(curriculum.set_curriculum_quests, {'quest_ids': []}, {})
        assert body['attached'] == 0
        assert ('delete', 'sis_curriculum_quests') in log

    def test_a_curriculum_from_another_school_is_not_found(self):
        _, status, log = _put(curriculum.set_curriculum_quests,
                              {'quest_ids': []}, {}, owned=False)
        assert status == 404
        assert log == []


@pytest.mark.unit
class TestTheCourseSet:
    def test_the_school_s_own_course_attaches(self):
        tables = {'courses': [{'id': C1, 'organization_id': ORG, 'visibility': 'private'}]}
        body, _, log = _put(curriculum.set_curriculum_courses, {'course_ids': [C1]}, tables)
        assert body['attached'] == 1
        assert _inserted(log, 'sis_curriculum_courses')[0]['course_id'] == C1

    def test_a_public_library_course_attaches(self):
        tables = {'courses': [{'id': C1, 'organization_id': None, 'visibility': 'public'}]}
        body, _, _ = _put(curriculum.set_curriculum_courses, {'course_ids': [C1]}, tables)
        assert body['attached'] == 1

    def test_another_school_s_private_course_is_refused(self):
        tables = {'courses': [{'id': C1, 'organization_id': OTHER_ORG, 'visibility': 'private'}]}
        body, _, log = _put(curriculum.set_curriculum_courses, {'course_ids': [C1]}, tables)
        assert body == {'success': True, 'attached': 0, 'rejected': 1}
        assert _inserted(log, 'sis_curriculum_courses') is None

    def test_removing_one_replaces_the_whole_set(self):
        """A live link, not a copy: clearing it here clears it on every class
        using this curriculum, which is the point of linking rather than
        copying."""
        _, _, log = _put(curriculum.set_curriculum_courses, {'course_ids': []}, {})
        assert ('delete', 'sis_curriculum_courses') in log
