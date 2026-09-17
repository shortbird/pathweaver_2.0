"""
The SIS quest library: every quest the school owns in one list, with where
each is in use, and one door to put a quest on a curriculum from there.

Molly (iCreate, f9b5f2ea): "I'd like it to be a separate tab under
operations. And from there, all the quests would be listed, and we can assign
them as needed from there."

What these pin: the list is the school's own quests only (the Optio library is
a pool for the pickers, not a thing the school maintains); each row says which
curricula and which live classes carry it and how many tasks it has; the
attach refuses another school's curriculum and another school's quest, is
idempotent, and is the SAME writer the curriculum page uses, so the two doors
cannot drift.
"""

from unittest.mock import Mock, patch

import pytest

import routes.sis.quest_library as library
from services import sis_curriculum_sync as sync

ORG = '11111111-1111-4111-8111-111111111111'
OTHER_ORG = '99999999-9999-4999-8999-999999999999'
CURR = '22222222-2222-4222-8222-222222222222'
CURR2 = '22222222-2222-4222-8222-222222222223'
Q1 = '33333333-3333-4333-8333-333333333331'
Q2 = '33333333-3333-4333-8333-333333333332'
CLASS = '66666666-6666-4666-8666-666666666666'
DEAD_CLASS = '66666666-6666-4666-8666-666666666667'
USER = '55555555-5555-4555-8555-555555555555'


class _FakeTable:
    def __init__(self, name, rows, log):
        self.name, self._rows, self._log = name, rows, log

    def __getattr__(self, _name):
        # select / eq / in_ / is_ / ilike / order / limit / range: chainable no-ops
        return lambda *a, **k: self

    def insert(self, payload):
        self._log.append(('insert', self.name, payload))
        return self

    def execute(self):
        return Mock(data=list(self._rows))


def _client(tables, log):
    c = Mock()
    c.table.side_effect = lambda name: _FakeTable(name, tables.get(name, []), log)
    return c


def _run(route, args, body=None, tables=None, query=None):
    log = []
    client = _client(tables or {}, log)
    with patch.object(library, '_admin', return_value=client), \
         patch('services.sis_service.org_or_error', return_value=(ORG, None)), \
         patch('repositories.sis_quest_library_repository.fetch_all_rows',
               side_effect=lambda build: build().execute().data), \
         patch.object(library, 'request', Mock(get_json=lambda silent=True: body or {}, args=query or {})), \
         patch.object(sync, 'push_curriculum_quests_safe', return_value={'classes': 2, 'assignments': 5}):
        from flask import Flask
        app = Flask(__name__)
        with app.app_context():
            fn = route
            while hasattr(fn, '__wrapped__'):
                fn = fn.__wrapped__
            resp = fn(USER, *args)
    body_json = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return body_json, status, log


def _tables():
    return {
        'quests': [
            {'id': Q1, 'title': 'Watercolor Basics', 'description': 'Paint.', 'quest_type': 'project',
             'is_public': False, 'created_at': '2026-09-01', 'updated_at': '2026-09-10'},
            {'id': Q2, 'title': 'Bridge Building', 'description': '', 'quest_type': 'project',
             'is_public': False, 'created_at': '2026-09-02', 'updated_at': '2026-09-09'},
        ],
        'quest_template_tasks': [
            {'id': 't1', 'quest_id': Q1}, {'id': 't2', 'quest_id': Q1}, {'id': 't3', 'quest_id': Q1},
        ],
        'sis_curriculum_quests': [
            {'id': 'l1', 'quest_id': Q1, 'curriculum_id': CURR},
            {'id': 'l2', 'quest_id': Q1, 'curriculum_id': 'not-this-org'},
        ],
        'class_quests': [
            {'id': 'c1', 'quest_id': Q1, 'class_id': CLASS, 'publish_at': None, 'due_date': '2026-10-01'},
            {'id': 'c2', 'quest_id': Q1, 'class_id': DEAD_CLASS, 'publish_at': None, 'due_date': None},
        ],
        'sis_curriculum': [{'id': CURR, 'title': 'Art', 'organization_id': ORG},
                           {'id': CURR2, 'title': 'STEM', 'organization_id': ORG}],
        'org_classes': [{'id': CLASS, 'name': 'Art Expeditions', 'status': 'active'},
                        {'id': DEAD_CLASS, 'name': 'Last year', 'status': 'archived'}],
    }


@pytest.mark.unit
class TestTheList:

    def test_each_quest_says_where_it_is_in_use_and_how_big_it_is(self):
        body, status, _ = _run(library.list_org_quests, (), tables=_tables())
        assert status == 200
        by_id = {q['id']: q for q in body['quests']}
        assert by_id[Q1]['task_count'] == 3 and by_id[Q2]['task_count'] == 0
        assert by_id[Q1]['curricula'] == [{'id': CURR, 'title': 'Art'}]
        # An archived class is not "in use"; a link to a curriculum outside
        # the org's list is dropped rather than shown as an unnamed chip.
        assert [c['name'] for c in by_id[Q1]['classes']] == ['Art Expeditions']
        assert by_id[Q1]['classes'][0]['due_date'] == '2026-10-01'
        assert by_id[Q2]['curricula'] == [] and by_id[Q2]['classes'] == []

    def test_the_pickers_ride_along_so_the_page_is_one_request(self):
        body, _, _ = _run(library.list_org_quests, (), tables=_tables())
        assert [c['title'] for c in body['curricula']] == ['Art', 'STEM']
        assert [c['name'] for c in body['classes']] == ['Art Expeditions']

    def test_no_quests_is_an_empty_list_not_an_error(self):
        body, status, _ = _run(library.list_org_quests, (), tables={'quests': []})
        assert status == 200 and body['quests'] == []


@pytest.mark.unit
class TestPuttingAQuestOnACurriculum:

    def _tables(self, quest_org=ORG, curr_org=ORG, already=False):
        return {
            'sis_curriculum': [{'id': CURR, 'organization_id': curr_org, 'title': 'Art'}],
            'quests': [{'id': Q2, 'organization_id': quest_org, 'is_public': False, 'is_active': True}],
            'sis_curriculum_quests': [{'id': 'x', 'sequence_order': 4}] if already else [],
        }

    def test_attaches_at_the_end_of_the_order_and_pushes_to_the_classes(self):
        body, status, log = _run(library.put_quest_on_curriculum, (Q2,),
                                 body={'curriculum_id': CURR}, tables=self._tables())
        assert status == 200
        assert body['added'] is True and body['pushed_to_classes'] == 2
        assert body['curriculum'] == {'id': CURR, 'title': 'Art'}
        inserts = [e for e in log if e[0] == 'insert']
        assert inserts == [('insert', 'sis_curriculum_quests',
                            {'curriculum_id': CURR, 'quest_id': Q2, 'sequence_order': 0, 'added_by': USER})]

    def test_a_quest_already_there_is_left_alone(self):
        body, status, log = _run(library.put_quest_on_curriculum, (Q2,),
                                 body={'curriculum_id': CURR}, tables=self._tables(already=True))
        assert status == 200 and body['added'] is False and body['pushed_to_classes'] == 0
        assert not [e for e in log if e[0] == 'insert']

    def test_another_schools_curriculum_is_not_found(self):
        _, status, log = _run(library.put_quest_on_curriculum, (Q2,),
                              body={'curriculum_id': CURR}, tables=self._tables(curr_org=OTHER_ORG))
        assert status == 404 and not log

    def test_another_schools_quest_is_not_available(self):
        body, status, log = _run(library.put_quest_on_curriculum, (Q2,),
                                 body={'curriculum_id': CURR}, tables=self._tables(quest_org=OTHER_ORG))
        assert status == 404 and 'not available' in body['error'] and not log

    def test_a_bad_id_is_a_400(self):
        _, status, _ = _run(library.put_quest_on_curriculum, ('nope',), body={'curriculum_id': CURR})
        assert status == 400


@pytest.mark.unit
def test_the_curriculum_page_and_the_library_share_one_attach_writer():
    """Two doors, one meaning. add_quest_to_curriculum in routes/sis/curriculum.py
    used to carry its own copy of the insert; a drift there would have made
    "on a curriculum" mean two things."""
    import inspect
    import routes.sis.curriculum as curriculum
    assert 'attach_quest_to_curriculum(' in inspect.getsource(curriculum.add_quest_to_curriculum)
    assert 'attach_quest_to_curriculum(' in inspect.getsource(library.put_quest_on_curriculum)
    assert "table('sis_curriculum_quests').insert" not in inspect.getsource(curriculum.add_quest_to_curriculum)


@pytest.mark.unit
class TestAuthoringFromTheLibrary:
    """"Add quest" on the library page: the same authoring service as the
    curriculum and class forms, with nothing required to hang the quest on."""

    def _run_create(self, body, tables=None, created=None):
        with patch.object(library, 'create_org_quest',
                          return_value=created or {'quest_id': Q2, 'task_count': 3}) as create:
            out = _run(library.create_library_quest, (), body=body, tables=tables or {})
        return out + (create,)

    def test_a_quest_can_be_written_first_and_placed_later(self):
        body, status, log, create = self._run_create(
            {'title': 'Bridge Building', 'description': 'Build one.', 'tasks': [{'title': 'Draw it'}]})
        assert status == 201
        assert body['quest_id'] == Q2 and body['task_count'] == 3
        assert 'curriculum' not in body
        kwargs = create.call_args.kwargs
        assert kwargs['org_id'] == ORG and kwargs['user_id'] == USER
        assert kwargs['title'] == 'Bridge Building' and kwargs['raw_tasks'] == [{'title': 'Draw it'}]
        assert not [e for e in log if e[0] == 'insert']

    def test_with_a_curriculum_it_is_placed_in_the_same_request(self):
        tables = {'sis_curriculum': [{'id': CURR, 'organization_id': ORG, 'title': 'Art'}],
                  'sis_curriculum_quests': []}
        body, status, log, _ = self._run_create(
            {'title': 'Bridge Building', 'tasks': [], 'curriculum_id': CURR}, tables=tables)
        assert status == 201
        assert body['curriculum'] == {'id': CURR, 'title': 'Art'}
        assert body['added'] is True and body['pushed_to_classes'] == 2
        assert [e for e in log if e[0] == 'insert'] == [('insert', 'sis_curriculum_quests',
            {'curriculum_id': CURR, 'quest_id': Q2, 'sequence_order': 0, 'added_by': USER})]

    def test_another_schools_curriculum_is_refused_before_anything_is_written(self):
        tables = {'sis_curriculum': [{'id': CURR, 'organization_id': OTHER_ORG, 'title': 'Art'}]}
        body, status, log, create = self._run_create(
            {'title': 'Bridge Building', 'curriculum_id': CURR}, tables=tables)
        assert status == 404
        create.assert_not_called()

    def test_the_authoring_services_rejection_is_returned_as_is(self):
        from services.sis_quest_authoring import QuestAuthoringError
        with patch.object(library, 'create_org_quest', side_effect=QuestAuthoringError('A title is required', 400)):
            body, status, _ = _run(library.create_library_quest, (), body={'title': ''})
        assert status == 400 and body['error'] == 'A title is required'
