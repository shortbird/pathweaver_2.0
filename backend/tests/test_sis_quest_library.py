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
TEACHER = '77777777-7777-4777-8777-777777777777'


class _FakeTable:
    def __init__(self, name, rows, log):
        self.name, self._rows, self._log = name, rows, log

    def __getattr__(self, _name):
        # select / eq / in_ / is_ / ilike / order / limit / range: chainable no-ops
        return lambda *a, **k: self

    def insert(self, payload):
        self._log.append(('insert', self.name, payload))
        return self

    def update(self, payload):
        self._log.append(('update', self.name, payload))
        return self

    def delete(self):
        self._log.append(('delete', self.name))
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
               side_effect=lambda build, order_by='id': build().execute().data), \
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
             'is_public': False, 'created_at': '2026-09-01', 'updated_at': '2026-09-10',
             'created_by': USER},
            {'id': Q2, 'title': 'Bridge Building', 'description': '', 'quest_type': 'project',
             'is_public': False, 'created_at': '2026-09-02', 'updated_at': '2026-09-09',
             'created_by': TEACHER},
        ],
        'quest_template_tasks': [
            {'id': 't2', 'quest_id': Q1, 'title': 'Mix a wash', 'order_index': 1},
            {'id': 't1', 'quest_id': Q1, 'title': 'Stretch the paper', 'order_index': 0},
            {'id': 't3', 'quest_id': Q1, 'title': 'Paint a sky', 'order_index': 2},
        ],
        'users': [
            {'id': USER, 'org_role': 'org_admin', 'role': 'org_managed',
             'first_name': 'Molly', 'last_name': 'Christensen'},
            {'id': TEACHER, 'org_role': 'advisor', 'role': 'org_managed',
             'first_name': 'Sam', 'last_name': 'Teacher', 'preferred_name': ''},
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

    def test_each_quest_carries_its_tasks_in_order_for_the_attachments_panel(self):
        """Ticket 5a20862f: the library opens a quest's attachments per task
        without a second request, so the tasks ride along, in order."""
        body, _, _ = _run(library.list_org_quests, (), tables=_tables())
        by_id = {q['id']: q for q in body['quests']}
        assert [t['title'] for t in by_id[Q1]['tasks']] == ['Stretch the paper', 'Mix a wash', 'Paint a sky']
        assert by_id[Q1]['tasks'][0]['id'] == 't1'
        assert by_id[Q2]['tasks'] == []

    def test_each_quest_names_its_author_and_says_whether_a_teacher_wrote_it(self):
        """Ticket 4579be68: the school library and what teachers made are one
        table told apart by the author's org role."""
        body, _, _ = _run(library.list_org_quests, (), tables=_tables())
        by_id = {q['id']: q for q in body['quests']}
        assert by_id[Q1]['made_by'] == {'id': USER, 'name': 'Molly Christensen', 'teacher': False}
        assert by_id[Q2]['made_by'] == {'id': TEACHER, 'name': 'Sam Teacher', 'teacher': True}

    def test_a_quest_whose_author_is_gone_is_the_schools(self):
        tables = _tables()
        tables['users'] = []
        body, _, _ = _run(library.list_org_quests, (), tables=tables)
        assert body['quests'][0]['made_by'] == {'id': None, 'name': None, 'teacher': False}

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

    def test_attaches_at_the_end_of_the_order_and_does_not_push_to_the_classes(self):
        """Molly (iCreate, a933ee02): "Attach to a curriculum should not assign
        it to all the classes." _run stubs the push to report 2 classes, so a 0
        here means the push never ran."""
        body, status, log = _run(library.put_quest_on_curriculum, (Q2,),
                                 body={'curriculum_id': CURR}, tables=self._tables())
        assert status == 200
        assert body['added'] is True and body['pushed_to_classes'] == 0
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
    # The curriculum page still pushes; only the library files without pushing.
    assert 'push=False' not in inspect.getsource(curriculum.add_quest_to_curriculum)
    assert 'push=False' in inspect.getsource(library.put_quest_on_curriculum)


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
        assert body['added'] is True and body['pushed_to_classes'] == 0
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


S1 = '88888888-8888-4888-8888-888888888881'
S2 = '88888888-8888-4888-8888-888888888882'
GONE = '88888888-8888-4888-8888-888888888883'


class TestGivingAQuestToStudentsByName:
    """Dallin (iCreate, 293c4d99, 2026-09-18): "Can we assign quests to
    individuals too?" The library's third door. It enrolls through the same
    function the class door and the publish sweep use, refuses a student who
    is not at this school before anyone is enrolled, and never writes a
    class_quests row because there is no class."""

    def _run(self, body, tables=None, enroll=None):
        tables = tables or {
            'quests': [{'id': Q1, 'organization_id': ORG, 'is_public': False, 'is_active': True}],
            'users': [{'id': S1, 'organization_id': ORG}, {'id': S2, 'organization_id': ORG}],
        }
        enroll = enroll or Mock(return_value={'enrolled': 2, 'tasks': 6, 'skipped_existing': 0})
        with patch.object(library, 'enroll_students_in_quests', enroll):
            out = _run(library.give_quest_to_students, (Q1,), body=body, tables=tables)
        return (*out, enroll)

    def test_named_students_are_enrolled_through_the_shared_enroller(self):
        body, status, log, enroll = self._run({'student_ids': [S1, S2, S1]})
        assert status == 200
        assert body['enrolled'] == 2 and body['already_had_it'] == 0
        assert body['student_ids'] == [S1, S2]
        args = enroll.call_args.args
        assert args[1] == [S1, S2] and args[2] == [Q1]
        assert not [e for e in log if e[0] == 'insert']

    def test_a_student_who_is_not_at_this_school_stops_the_whole_request(self):
        # The users read is filtered to the org, so GONE never comes back.
        body, status, _log, enroll = self._run({'student_ids': [S1, GONE]})
        assert status == 404
        assert 'not at this school' in body['error']
        enroll.assert_not_called()

    def test_another_schools_quest_is_not_available(self):
        tables = {'quests': [{'id': Q1, 'organization_id': OTHER_ORG, 'is_public': False, 'is_active': True}],
                  'users': [{'id': S1, 'organization_id': ORG}]}
        body, status, _log, enroll = self._run({'student_ids': [S1]}, tables=tables)
        assert status == 404
        enroll.assert_not_called()

    def test_the_optio_library_is_assignable(self):
        tables = {'quests': [{'id': Q1, 'organization_id': None, 'is_public': True, 'is_active': True}],
                  'users': [{'id': S1, 'organization_id': ORG}]}
        _body, status, _log, enroll = self._run({'student_ids': [S1]}, tables=tables)
        assert status == 200
        enroll.assert_called_once()

    def test_nobody_named_is_a_400(self):
        for body in ({}, {'student_ids': []}, {'student_ids': 'not-a-list'}):
            _b, status, _log, enroll = self._run(body)
            assert status == 400
            enroll.assert_not_called()

    def test_a_failed_enrollment_is_reported_not_swallowed(self):
        enroll = Mock(side_effect=RuntimeError('db down'))
        body, status, _log, _ = self._run({'student_ids': [S1]}, enroll=enroll)
        assert status == 500
        assert body['success'] is False


# ---------------------------------------------------------------------------
# Editing, 2026-09-22. Molly (iCreate): "There's no way to edit a quest that I
# can see. I'd also love to be able to duplicate quests."
#
# The gate is the only thing these routes add; everything after it is
# services/sis_quest_task_editing, shared with the Curriculum tab. So what is
# worth pinning here is the gate, and the fact that the shared half is
# actually reached.
# ---------------------------------------------------------------------------

OWN_QUEST = {'id': Q1, 'title': 'Watercolor Basics', 'description': 'Paint.',
             'organization_id': ORG, 'is_active': True, 'is_public': False,
             'quest_type': 'optio'}
SHARED_QUEST = {'id': Q2, 'title': 'Optio Civics', 'description': 'Vote.',
                'organization_id': None, 'is_active': True, 'is_public': True,
                'quest_type': 'optio'}
OTHER_SCHOOLS_QUEST = {'id': Q2, 'title': 'Not yours', 'description': '',
                       'organization_id': OTHER_ORG, 'is_active': True,
                       'is_public': False, 'quest_type': 'optio'}


@pytest.mark.unit
class TestEditingIsScopedByOwnership:
    """A curriculum link is not required, and ownership is."""

    def test_the_school_can_rename_its_own_quest(self):
        out, status, log = _run(library.update_library_quest, (Q1,),
                                body={'title': 'Watercolour Basics'},
                                tables={'quests': [OWN_QUEST]})
        assert status == 200 and out['success'] is True
        writes = [e for e in log if e[0] == 'update' and e[1] == 'quests']
        assert writes, 'the quest row was never written'
        # big_idea travels with description, because create_org_quest sets both
        # and the training catalog reads whichever it finds first.
        out2, _s, log2 = _run(library.update_library_quest, (Q1,),
                              body={'description': 'Paint a season.'},
                              tables={'quests': [OWN_QUEST]})
        payload = [e[2] for e in log2 if e[0] == 'update' and e[1] == 'quests'][0]
        assert payload['description'] == 'Paint a season.'
        assert payload['big_idea'] == 'Paint a season.'

    def test_a_shared_optio_quest_is_refused_with_a_way_forward(self):
        out, status, log = _run(library.update_library_quest, (Q2,),
                                body={'title': 'Mine now'},
                                tables={'quests': [SHARED_QUEST]})
        assert status == 403
        assert 'Duplicate it' in out['error']
        assert not [e for e in log if e[0] == 'update']

    def test_another_schools_quest_is_not_found_rather_than_forbidden(self):
        # Telling them it exists would be telling them about another school.
        out, status, _log = _run(library.update_library_quest, (Q2,),
                                 body={'title': 'Mine now'},
                                 tables={'quests': [OTHER_SCHOOLS_QUEST]})
        assert status == 404
        assert 'not found' in out['error'].lower()

    def test_a_quest_that_is_on_no_curriculum_is_editable_here(self):
        # The whole point. The curriculum routes need a sis_curriculum_quests
        # link; this one asks for no link at all, so a quest nobody ever placed
        # can still be fixed.
        out, status, log = _run(library.add_library_quest_task, (Q1,),
                                body={'title': 'Stretch the paper', 'pillar': 'art',
                                      'xp_value': 100},
                                tables={'quests': [OWN_QUEST],
                                        'quest_template_tasks': [{'id': 'new-1',
                                                                  'title': 'Stretch the paper',
                                                                  'pillar': 'art',
                                                                  'xp_value': 100,
                                                                  'order_index': 0}]})
        assert status == 200
        assert [e for e in log if e[0] == 'insert' and e[1] == 'quest_template_tasks']
        assert not [e for e in log if e[1] == 'sis_curriculum_quests']

    @pytest.mark.parametrize('route, args', [
        ('add_library_quest_task', (Q2,)),
        ('reorder_library_quest_tasks', (Q2,)),
        ('delete_library_quest_task', (Q2, '44444444-4444-4444-8444-444444444444')),
        ('duplicate_library_quest_task', (Q2, '44444444-4444-4444-8444-444444444444')),
        ('update_library_quest_task', (Q2, '44444444-4444-4444-8444-444444444444')),
    ])
    def test_no_task_route_touches_a_shared_quest(self, route, args):
        # An edit to a shared quest's tasks would change it for every school
        # using it, which is the line routes/sis/curriculum.py holds too.
        _out, status, log = _run(getattr(library, route), args,
                                 body={'title': 'x'}, tables={'quests': [SHARED_QUEST]})
        assert status == 403
        assert not [e for e in log if e[0] in ('insert', 'update', 'delete')]


@pytest.mark.unit
class TestReadingAndDuplicatingAreAllowedOnASharedQuest:
    def test_a_shared_quest_lists_its_tasks_but_says_they_are_not_editable(self):
        out, status, _log = _run(library.library_quest_tasks, (Q2,),
                                 tables={'quests': [SHARED_QUEST],
                                         'quest_template_tasks': [
                                             {'id': 't1', 'title': 'Read the ballot',
                                              'pillar': 'civics', 'xp_value': 100,
                                              'order_index': 0}]})
        assert status == 200
        assert out['editable'] is False
        assert [t['title'] for t in out['tasks']] == ['Read the ballot']

    def test_the_schools_own_quest_reads_as_editable(self):
        out, _status, _log = _run(library.library_quest_tasks, (Q1,),
                                  tables={'quests': [OWN_QUEST], 'quest_template_tasks': []})
        assert out['editable'] is True

    def test_a_shared_quest_can_be_duplicated_even_though_it_cannot_be_edited(self):
        # This is how a school gets a copy of a library quest that IS theirs
        # to edit -- the same rule the curriculum tab follows.
        with patch.object(library, 'duplicate_org_quest',
                          return_value={'quest_id': 'new-q', 'title': 'Optio Civics (copy)',
                                        'task_count': 3}) as dup:
            out, status, _log = _run(library.duplicate_library_quest, (Q2,),
                                     tables={'quests': [SHARED_QUEST]})
        assert status == 200
        assert out['title'] == 'Optio Civics (copy)'
        assert dup.call_args.kwargs['org_id'] == ORG
        assert dup.call_args.kwargs['source_quest_id'] == Q2

    def test_the_copy_is_attached_to_nothing(self):
        # A duplicate is a draft somebody is about to rename. Pushing it would
        # put "X (copy)" in front of students before anyone touched it.
        with patch.object(library, 'duplicate_org_quest',
                          return_value={'quest_id': 'new-q', 'title': 'x (copy)',
                                        'task_count': 0}):
            _out, _status, log = _run(library.duplicate_library_quest, (Q1,),
                                      tables={'quests': [OWN_QUEST]})
        assert not [e for e in log if e[1] in ('sis_curriculum_quests', 'class_quests')]

    def test_another_schools_quest_cannot_be_duplicated(self):
        _out, status, _log = _run(library.duplicate_library_quest, (Q2,),
                                  tables={'quests': [OTHER_SCHOOLS_QUEST]})
        assert status == 404


@pytest.mark.unit
class TestAnEditReachesStudentsAlreadyOnTheQuest:
    """A student's task list is a copy taken at enrollment, so an edit that
    stops at the template is an edit nobody sees. Every write here has to push
    it out, exactly as the curriculum and class editors do."""

    @pytest.mark.parametrize('route, args, body', [
        ('add_library_quest_task', (Q1,), {'title': 'New step', 'pillar': 'art'}),
        ('update_library_quest_task', (Q1, '44444444-4444-4444-8444-444444444444'),
         {'title': 'Renamed'}),
        ('duplicate_library_quest_task', (Q1, '44444444-4444-4444-8444-444444444444'), {}),
        ('delete_library_quest_task', (Q1, '44444444-4444-4444-8444-444444444444'), {}),
        ('reorder_library_quest_tasks', (Q1,),
         {'task_ids': ['44444444-4444-4444-8444-444444444444']}),
    ])
    def test_every_task_write_resyncs_enrollments(self, route, args, body):
        task = {'id': '44444444-4444-4444-8444-444444444444', 'title': 'Step',
                'pillar': 'art', 'xp_value': 100, 'order_index': 0}
        with patch('services.sis_quest_task_editing.resync') as resync, \
             patch('repositories.quest_template_task_repository'
                   '.QuestTemplateTaskRepository.reorder', return_value=[task]):
            _out, status, _log = _run(getattr(library, route), args, body=body,
                                      tables={'quests': [OWN_QUEST],
                                              'quest_template_tasks': [task]})
        assert status == 200, f'{route} did not succeed'
        assert resync.called, f'{route} left enrolled students on the old task list'

    def test_renaming_the_quest_does_not_need_a_resync(self):
        # Title and description are read live off the quests row; only the
        # task list is copied per enrollment.
        with patch('services.sis_quest_task_editing.resync') as resync:
            _out, status, _log = _run(library.update_library_quest, (Q1,),
                                      body={'title': 'Renamed'},
                                      tables={'quests': [OWN_QUEST]})
        assert status == 200
        assert not resync.called


@pytest.mark.unit
class TestTheXpAQuestRequiresToFinish:
    """"I'd like to be able to add the required XP per quest" from
    /library?tab=quests (iCreate, 2026-09-22, 3d926fc3).

    Not a new mechanism: `quests.xp_threshold` already existed, POST
    /api/quests/<id>/end already refused below it, and the staff-training and
    class-quest editors already wrote it. The library editor was the one of the
    three that could not, so a quest authored here could only be given a finish
    line by opening it from somewhere else.
    """

    def _patch(self, body, quest=None):
        return _run(library.update_library_quest, (Q1,), body=body,
                    tables={'quests': [quest or OWN_QUEST]})

    def test_it_is_written_to_the_quest(self):
        _out, status, log = self._patch({'xp_threshold': 500})
        assert status == 200
        payload = [e[2] for e in log if e[0] == 'update' and e[1] == 'quests'][0]
        assert payload['xp_threshold'] == 500

    def test_a_number_in_a_string_is_accepted(self):
        """It arrives from a number input, which yields a string."""
        _out, status, log = self._patch({'xp_threshold': '250'})
        assert status == 200
        payload = [e[2] for e in log if e[0] == 'update' and e[1] == 'quests'][0]
        assert payload['xp_threshold'] == 250

    def test_clearing_it_removes_the_requirement(self):
        """Blank and zero both mean "any amount finishes it", which is how
        every quest behaved before an admin set one."""
        for blank in (None, '', 0):
            _out, status, log = self._patch({'xp_threshold': blank})
            assert status == 200, blank
            payload = [e[2] for e in log if e[0] == 'update' and e[1] == 'quests'][0]
            assert payload['xp_threshold'] is None, blank

    def test_a_negative_requirement_is_refused(self):
        out, status, log = self._patch({'xp_threshold': -50})
        assert status == 400
        assert 'negative' in out['error'].lower()
        assert not [e for e in log if e[0] == 'update']

    def test_words_are_refused(self):
        out, status, log = self._patch({'xp_threshold': 'lots'})
        assert status == 400
        assert not [e for e in log if e[0] == 'update']

    def test_it_is_left_alone_when_the_key_is_absent(self):
        """A rename must not wipe the finish line somebody set."""
        _out, status, log = self._patch({'title': 'Watercolour Basics'})
        assert status == 200
        payload = [e[2] for e in log if e[0] == 'update' and e[1] == 'quests'][0]
        assert 'xp_threshold' not in payload

    def test_a_shared_optio_quest_is_still_refused(self):
        _out, status, log = _run(library.update_library_quest, (Q2,),
                                 body={'xp_threshold': 500},
                                 tables={'quests': [SHARED_QUEST]})
        assert status == 403
        assert not [e for e in log if e[0] == 'update']


@pytest.mark.unit
class TestTeachersMayChangeTheXp:
    """Molly (iCreate, 3d926fc3, 2026-09-22): "Then I think it'd be good to
    click on 'teachers may change' if we want teachers to change it."

    quests.teachers_may_change_xp: the library editor writes it, and the list
    carries it so the editor opens on the saved value. The class page's PATCH
    enforces it (tests/test_class_quest_xp_threshold.py).
    """

    def test_the_list_carries_it_and_null_reads_as_on(self):
        tables = _tables()
        tables['quests'][0] = {**tables['quests'][0], 'teachers_may_change_xp': False}
        body, status, _ = _run(library.list_org_quests, (), tables=tables)
        assert status == 200
        by_id = {q['id']: q for q in body['quests']}
        assert by_id[Q1]['teachers_may_change_xp'] is False
        # Q2 has no value at all: the column default, on.
        assert by_id[Q2]['teachers_may_change_xp'] is True

    def test_the_editor_can_lock_it(self):
        _out, status, log = _run(library.update_library_quest, (Q1,),
                                 body={'teachers_may_change_xp': False},
                                 tables={'quests': [OWN_QUEST]})
        assert status == 200
        payload = [e[2] for e in log if e[0] == 'update' and e[1] == 'quests'][0]
        assert payload == {'teachers_may_change_xp': False}

    def test_a_string_is_refused(self):
        out, status, log = _run(library.update_library_quest, (Q1,),
                                body={'teachers_may_change_xp': 'false'},
                                tables={'quests': [OWN_QUEST]})
        assert status == 400
        assert not [e for e in log if e[0] == 'update']


@pytest.mark.unit
class TestTheXpFieldsOnTheCreateForm:
    """iCreate, b067c6c8, 2026-09-23: "Also add the required xp and mark if the
    teacher can change that when first creating too." The create route takes
    the two fields the edit dialog already writes, checks them before the quest
    exists, and writes them through the same update_quest_info."""

    def _create(self, body):
        with patch.object(library, 'create_org_quest',
                          return_value={'quest_id': Q2, 'task_count': 0}) as create:
            out = _run(library.create_library_quest, (), body=body, tables={'quests': [{'id': Q2}]})
        return out + (create,)

    def test_without_the_fields_nothing_else_is_written(self):
        body, status, log, create = self._create({'title': 'Bridge Building'})
        assert status == 201
        create.assert_called_once()
        assert [e for e in log if e[0] == 'update'] == []

    def test_with_the_fields_they_are_written_to_the_new_quest(self):
        body, status, log, _ = self._create(
            {'title': 'Bridge Building', 'xp_threshold': 300, 'teachers_may_change_xp': False})
        assert status == 201
        assert [e for e in log if e[0] == 'update'] == [
            ('update', 'quests', {'xp_threshold': 300, 'teachers_may_change_xp': False})]

    def test_an_empty_requirement_is_no_requirement(self):
        _body, status, log, _ = self._create({'title': 'Bridge Building', 'xp_threshold': ''})
        assert status == 201
        assert [e for e in log if e[0] == 'update'] == [('update', 'quests', {'xp_threshold': None})]

    @pytest.mark.parametrize('bad', [
        {'xp_threshold': -25},
        {'xp_threshold': 'lots'},
        {'teachers_may_change_xp': 'false'},
    ])
    def test_a_bad_value_is_refused_before_the_quest_exists(self, bad):
        body, status, log, create = self._create({'title': 'Bridge Building', **bad})
        assert status == 400
        assert body['success'] is False
        create.assert_not_called()
        assert log == []


@pytest.mark.unit
class TestWhoAlreadyHasTheQuest:
    """iCreate, ebfc9253, 2026-09-23: "When assigning to a student, I can't
    tell if they already have it or not until I enter it in again." The
    picker asks first; only this school's accounts come back."""

    def _tables(self, quest):
        return {
            'quests': [quest],
            # The users read is filtered to the org in the query, so the fake
            # returns only this school's accounts, as the database would.
            'users': [{'id': S1}, {'id': S2}],
            'user_quests': [{'id': 'uq1', 'user_id': S1}],
        }

    def test_this_schools_students_on_the_quest_come_back(self):
        quest = {'id': Q1, 'organization_id': ORG, 'is_public': False, 'is_active': True}
        body, status, _ = _run(library.quest_students, (Q1,), tables=self._tables(quest))
        assert status == 200
        assert body['student_ids'] == [S1]

    def test_the_read_is_scoped_to_this_schools_accounts(self):
        """A shared Optio-library quest has enrollments at other schools; the
        org's own users are read first and the quest read is limited to them."""
        quest = {'id': Q1, 'organization_id': None, 'is_public': True, 'is_active': True}
        seen = []
        orig = _FakeTable.__getattr__

        def spy(self, name):
            fn = orig(self, name)
            def call(*a, **k):
                seen.append((self.name, name, a))
                return fn(*a, **k)
            return call
        with patch.object(_FakeTable, '__getattr__', spy):
            body, status, _ = _run(library.quest_students, (Q1,), tables=self._tables(quest))
        assert status == 200
        assert ('users', 'eq', ('organization_id', ORG)) in seen
        assert ('user_quests', 'in_', ('user_id', [S1, S2])) in seen
        assert ('user_quests', 'eq', ('quest_id', Q1)) in seen

    def test_another_schools_quest_is_not_found(self):
        quest = {'id': Q1, 'organization_id': OTHER_ORG, 'is_public': False, 'is_active': True}
        body, status, _ = _run(library.quest_students, (Q1,), tables=self._tables(quest))
        assert status == 404
        assert 'student_ids' not in body

    def test_a_caller_outside_the_org_gate_is_refused(self):
        from flask import Flask, jsonify
        app = Flask(__name__)
        with app.app_context():
            refusal = (jsonify({'success': False, 'error': 'No organization'}), 403)
            with patch('services.sis_service.org_or_error', return_value=(None, refusal)):
                fn = library.quest_students
                while hasattr(fn, '__wrapped__'):
                    fn = fn.__wrapped__
                resp = fn(USER, Q1)
        assert resp[1] == 403

    def test_the_route_is_admin_only(self):
        """Same role gate as the Give write beside it."""
        import inspect
        src = inspect.getsource(library)
        get_block = src.split("def quest_students")[0].rsplit('@bp.route', 1)[1]
        assert '@require_role(*ADMIN_ROLES)' in get_block
