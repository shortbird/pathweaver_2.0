"""
Putting a school's training quest on people's accounts.

iCreate, 2026-08-17, running family orientation and teacher training as quests:
the catalog only ever *listed* the quest, so "required" was a label with nothing
behind it and each person had to go and find it. Now an admin can assign it, and
a catalog row can keep assigning itself to whoever joins next.

The property everything here protects is idempotency. "Assign to everyone" is a
button an admin will press again next week to catch the families who registered
since, and the auto-assign catch-up runs on every page load — so re-running must
never double-enrol anybody, and must never restart the quest of somebody who has
already set it down or finished it.
"""

from unittest.mock import Mock, patch


import routes.sis.staff_training as training
from utils.quest_assignment import assign_quest_to_users


ORG = 'org-1'


class _FakeQuery:
    """Enough of the PostgREST builder to record inserts and answer selects."""

    def __init__(self, name, store, log):
        self.name, self._store, self._log = name, store, log
        self._payload = None

    def __getattr__(self, _n):
        return lambda *a, **k: self

    def insert(self, payload):
        self._log.append((self.name, payload))
        self._payload = payload
        return self

    def execute(self):
        if self._payload is not None:
            # Mimic the returned row so the caller can read its new id.
            return Mock(data=[{'id': f'uq-{len(self._log)}', **self._payload}])
        return Mock(data=list(self._store.get(self.name, [])))


def _client(store=None):
    log = []
    store = store or {}
    client = Mock()
    client.table.side_effect = lambda n: _FakeQuery(n, store, log)
    return client, log


def _assign(user_ids, existing=(), template_tasks=()):
    """Run assign_quest_to_users with a stubbed DB. Returns (counts, inserts)."""
    store = {'user_quests': [{'user_id': u} for u in existing]}
    client, log = _client(store)
    with patch('utils.template_tasks.load_template_tasks', return_value=list(template_tasks)), \
         patch('utils.template_tasks.copy_template_tasks_to_enrollment', return_value=len(template_tasks)):
        counts = assign_quest_to_users(client, 'quest-1', user_ids)
    return counts, log


# ── The primitive ─────────────────────────────────────────────────────────────

def test_enrols_everyone_who_is_not_already_enrolled():
    counts, log = _assign(['a', 'b', 'c'])
    assert counts == {'enrolled': 3, 'already': 0, 'failed': 0}
    assert len([r for r in log if r[0] == 'user_quests']) == 3


def test_already_enrolled_are_counted_and_left_alone():
    """The re-press case. Somebody who finished the quest last week must not be
    handed a fresh enrollment because an admin assigned it again today."""
    counts, log = _assign(['a', 'b', 'c'], existing=['a', 'c'])
    assert counts == {'enrolled': 1, 'already': 2, 'failed': 0}
    inserted = [p['user_id'] for n, p in log if n == 'user_quests']
    assert inserted == ['b']


def test_assigning_twice_is_a_no_op_the_second_time():
    counts, _ = _assign(['a', 'b'], existing=['a', 'b'])
    assert counts['enrolled'] == 0
    assert counts['already'] == 2


def test_duplicate_ids_enrol_once():
    counts, log = _assign(['a', 'a', 'b'])
    assert counts['enrolled'] == 2
    assert len([r for r in log if r[0] == 'user_quests']) == 2


def test_empty_roster_does_nothing():
    counts, log = _assign([])
    assert counts == {'enrolled': 0, 'already': 0, 'failed': 0}
    assert log == []


def test_template_tasks_are_materialized_into_each_enrollment():
    """Without this the assigned person lands on the personalization wizard
    instead of the tasks the school authored."""
    calls = []
    store = {'user_quests': []}
    client, _ = _client(store)
    with patch('utils.template_tasks.load_template_tasks',
               return_value=[{'id': 't1', 'title': 'Read it', 'pillar': 'art'}]), \
         patch('utils.template_tasks.copy_template_tasks_to_enrollment',
               side_effect=lambda *a, **k: calls.append(a[3]) or 1):
        assign_quest_to_users(client, 'quest-1', ['a', 'b'])
    assert len(calls) == 2, 'every new enrollment gets the authored tasks'


def test_template_tasks_are_loaded_once_per_quest_not_once_per_person():
    store = {'user_quests': []}
    client, _ = _client(store)
    with patch('utils.template_tasks.load_template_tasks', return_value=[]) as get_tasks, \
         patch('utils.template_tasks.copy_template_tasks_to_enrollment'):
        assign_quest_to_users(client, 'quest-1', ['a', 'b', 'c', 'd'])
    assert get_tasks.call_count == 1


def test_one_bad_row_does_not_cost_the_rest_of_the_roster():
    """A 40-family orientation must not half-assign because one insert blew up."""
    store = {'user_quests': []}
    client, _ = _client(store)
    calls = {'n': 0}

    def _table(name):
        q = _FakeQuery(name, store, [])
        if name == 'user_quests':
            real_insert = q.insert

            def insert(payload):
                calls['n'] += 1
                if payload.get('user_id') == 'b':
                    raise RuntimeError('boom')
                return real_insert(payload)
            q.insert = insert
        return q

    client.table.side_effect = _table
    with patch('utils.template_tasks.load_template_tasks', return_value=[]), \
         patch('utils.template_tasks.copy_template_tasks_to_enrollment'):
        counts = assign_quest_to_users(client, 'quest-1', ['a', 'b', 'c'])
    assert counts == {'enrolled': 2, 'already': 0, 'failed': 1}


# ── Who a catalog row applies to ──────────────────────────────────────────────

def test_role_narrowed_staff_training_only_reaches_those_roles():
    """Admins are exempt from narrowing (see below), so the excluded case here
    is a role that simply is not targeted."""
    item = {'visible_to_roles': ['advisor']}
    teacher = {'id': 'u1', 'roles': ['advisor']}
    observer = {'id': 'u2', 'roles': ['observer']}
    assert training._item_applies_to(item, teacher, 'staff') is True
    assert training._item_applies_to(item, observer, 'staff') is False


def test_untargeted_staff_training_reaches_everyone():
    item = {'visible_to_roles': None}
    assert training._item_applies_to(item, {'id': 'u', 'roles': ['advisor']}, 'staff') is True


def test_an_admin_is_eligible_even_for_teacher_only_training():
    """iCreate, 2026-08-17: admins were missing from the people picker. A course
    aimed at teachers still has to be doable by the person who set it — to try
    it before it goes out, and because at a small school the admin teaches."""
    item = {'visible_to_roles': ['advisor']}
    assert training._item_applies_to(item, {'id': 'u', 'roles': ['org_admin']}, 'staff') is True
    assert training._item_applies_to(
        item, {'id': 'u', 'roles': ['campus_coordinator']}, 'staff') is True


def test_narrowing_still_excludes_the_roles_it_leaves_out():
    """Admins being exempt must not mean the targeting stopped working."""
    item = {'visible_to_roles': ['advisor']}
    assert training._item_applies_to(item, {'id': 'u', 'roles': ['observer']}, 'staff') is False


# ── Students, and the age window ──────────────────────────────────────────────
#
# iCreate, 2026-08-17, of their orientation quest: they did not want it on
# everybody's account, they wanted it on "12+ students and all parents". Two
# groups at once, one of which the catalog could not name and one of which needs
# an age gate.

def _student(uid='s1', age=13):
    return {'id': uid, 'group': 'student', 'age': age}


def test_a_row_with_no_age_window_reaches_every_student():
    assert training._item_applies_to({}, _student(age=6)) is True


def test_twelve_and_up_leaves_the_younger_ones_out():
    item = {'student_min_age': 12}
    assert training._item_applies_to(item, _student(age=12)) is True
    assert training._item_applies_to(item, _student(age=17)) is True
    assert training._item_applies_to(item, _student(age=11)) is False


def test_a_window_can_be_closed_at_both_ends():
    item = {'student_min_age': 8, 'student_max_age': 11}
    assert training._item_applies_to(item, _student(age=8)) is True
    assert training._item_applies_to(item, _student(age=11)) is True
    assert training._item_applies_to(item, _student(age=12)) is False


def test_a_student_with_no_date_of_birth_is_left_out_of_a_windowed_row():
    """"12 and up" has to mean it. Guessing would put a quest written for
    teenagers on a six-year-old's account, where nobody would see it happen."""
    assert training._item_applies_to({'student_min_age': 12}, _student(age=None)) is False


def test_but_an_unknown_age_is_fine_when_the_row_has_no_window():
    assert training._item_applies_to({}, _student(age=None)) is True


def test_the_age_window_does_not_leak_onto_staff_or_families():
    """A row for parents AND 12+ students must not quietly age-check a parent."""
    item = {'student_min_age': 12}
    assert training._item_applies_to(item, {'id': 'g1', 'group': 'family'}) is True
    assert training._item_applies_to(
        item, {'id': 'u1', 'group': 'staff', 'roles': ['advisor']}) is True


def test_an_admin_is_not_swept_into_a_student_row_by_being_an_admin():
    """Admins are exempt from staff ROLE narrowing. That exemption must not
    carry over: running the school does not make you a 12-year-old."""
    item = {'student_min_age': 12, 'student_max_age': 17}
    admin_as_student = {'id': 'u1', 'group': 'student',
                        'roles': ['org_admin'], 'age': 40}
    assert training._item_applies_to(item, admin_as_student) is False


def test_one_row_reaches_several_groups(monkeypatch):
    """The whole point: parents and 12+ students off a single catalog row."""
    monkeypatch.setattr(training, '_audience_people', lambda org, group: {
        'family': [{'id': 'mum', 'group': 'family'}],
        'student': [{'id': 'teen', 'group': 'student', 'age': 14},
                    {'id': 'little', 'group': 'student', 'age': 6}],
        'staff': [{'id': 'teacher', 'group': 'staff', 'roles': ['advisor']}],
    }[group])
    people = training._eligible_people(ORG, {
        'audiences': ['family', 'student'], 'student_min_age': 12})
    assert [p['id'] for p in people] == ['mum', 'teen']


def test_somebody_in_two_groups_is_counted_once(monkeypatch):
    """At iCreate the admins are parents too. Reaching them twice would make
    "assigned to 12 people" a count of memberships rather than of people."""
    monkeypatch.setattr(training, '_audience_people', lambda org, group: {
        'staff': [{'id': 'molly', 'group': 'staff', 'roles': ['org_admin']}],
        'family': [{'id': 'molly', 'group': 'family'}, {'id': 'dana', 'group': 'family'}],
        'student': [],
    }[group])
    people = training._eligible_people(ORG, {'audiences': ['staff', 'family']})
    assert [p['id'] for p in people] == ['molly', 'dana']


def test_a_row_written_before_the_column_is_read_as_what_it_was(monkeypatch):
    """Every existing catalog row has audiences NULL until it is next saved."""
    monkeypatch.setattr(training, '_audience_people', lambda org, group:
                        [{'id': f'{group}-1', 'group': group}])
    people = training._eligible_people(ORG, {'audience': 'family'})
    assert [p['id'] for p in people] == ['family-1']


# ── Who counts as a guardian ──────────────────────────────────────────────────

def test_roles_are_read_from_every_column_that_holds_one():
    """A person can hold several roles. Reading only org_role is how an admin
    who is also a parent went missing from their own school's family quests."""
    roles = training._roles_of({
        'org_role': 'org_admin', 'org_roles': ['org_admin', 'parent'], 'role': 'org_managed',
    })
    assert 'parent' in roles and 'org_admin' in roles


def test_roles_survive_a_null_org_roles_array():
    assert training._roles_of({'org_role': 'parent', 'org_roles': None, 'role': 'org_managed'}) \
        == {'parent', 'org_managed'}


def _family_audience(users):
    client, _ = _client({'users': users})
    with patch.object(training, '_admin', return_value=client), \
         patch('utils.db_fetch.fetch_all_rows', lambda q: users), \
         patch('services.sis_service.org_messaging_email', return_value='school@placeholder.local'):
        return {p['id'] for p in training._guardians('org-1')}


def test_an_admin_who_is_also_a_parent_is_in_the_family_audience():
    ids = _family_audience([
        {'id': 'a', 'email': 'admin@x.com', 'org_role': 'org_admin',
         'org_roles': ['org_admin', 'parent'], 'role': 'org_managed'},
    ])
    assert ids == {'a'}


def test_an_admin_who_is_not_a_parent_can_still_be_given_a_family_quest():
    """They run the school; back-to-school-night is theirs to be able to do."""
    ids = _family_audience([
        {'id': 'a', 'email': 'admin@x.com', 'org_role': 'org_admin',
         'org_roles': ['org_admin'], 'role': 'org_managed'},
    ])
    assert ids == {'a'}


def test_students_are_not_in_the_family_audience():
    """A family quest is the guardian's own work, not their child's."""
    ids = _family_audience([
        {'id': 's', 'email': 'kid@x.com', 'org_role': 'student',
         'org_roles': ['student'], 'role': 'org_managed'},
        {'id': 'p', 'email': 'mum@x.com', 'org_role': 'parent',
         'org_roles': None, 'role': 'org_managed'},
    ])
    assert ids == {'p'}


def test_the_school_s_own_messaging_identity_is_not_a_person():
    ids = _family_audience([
        {'id': 'bot', 'email': 'school@placeholder.local', 'org_role': 'org_admin',
         'org_roles': None, 'role': 'org_managed'},
    ])
    assert ids == set()


def test_family_rows_carry_no_role_targeting():
    """Guardians have no staff roles; a stray visible_to_roles must not exclude
    every family from their own orientation quest."""
    item = {'visible_to_roles': ['advisor']}
    assert training._item_applies_to(item, {'id': 'g1'}, 'family') is True


# ── The endpoint ──────────────────────────────────────────────────────────────

def _row(org=ORG, active=True, **extra):
    return {'id': 'x', 'organization_id': org, 'quest_id': 'q1',
            'audience': 'family', 'visible_to_roles': None,
            'quests': {'is_active': active}, **extra}


def _assign_route(row, body=None):
    from flask import Flask
    app = Flask(__name__)
    client, _ = _client({'sis_staff_training': [row] if row else []})
    with patch.object(training, '_admin', return_value=client), \
         patch.object(training, '_org_or_error', return_value=(ORG, None)), \
         patch.object(training, '_assign_item',
                      return_value={'enrolled': 3, 'already': 1, 'failed': 0}) as assigner, \
         app.test_request_context(json=body or {}):
        fn = getattr(training.assign_training, '__wrapped__', training.assign_training)
        resp = fn('user-1', '3f8a2b1c-9d4e-4f6a-8b7c-1e2d3f4a5b6c')
    payload = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return payload, status, assigner


def test_assign_reports_what_happened():
    body, status, _ = _assign_route(_row())
    assert status == 200
    assert body['enrolled'] == 3 and body['already'] == 1
    assert body['audience'] == 'family'


def test_assign_refuses_another_org_s_training_row():
    """The id comes from the client, so ownership is re-checked before enrolling
    anybody — otherwise one school could assign quests to another's families."""
    body, status, assigner = _assign_route(_row(org='someone-else'))
    assert status == 404
    assigner.assert_not_called()


def test_assign_404s_when_the_row_is_gone():
    body, status, assigner = _assign_route(None)
    assert status == 404
    assigner.assert_not_called()


def test_a_draft_cannot_be_assigned_to_anybody():
    """Not being on anybody's account is what makes it a draft."""
    body, status, assigner = _assign_route(_row(active=False))
    assert status == 400
    assert 'draft' in body['error'].lower()
    assigner.assert_not_called()


def test_assigning_to_chosen_people_passes_them_through():
    ids = ['3f8a2b1c-9d4e-4f6a-8b7c-1e2d3f4a5b6c', '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f']
    _, status, assigner = _assign_route(_row(), body={'user_ids': ids})
    assert status == 200
    assert assigner.call_args.kwargs['only_user_ids'] == ids


def test_assigning_to_everyone_stays_the_default():
    """No user_ids means the whole audience, not nobody."""
    _, status, assigner = _assign_route(_row())
    assert assigner.call_args.kwargs['only_user_ids'] is None


def test_an_empty_selection_is_refused_rather_than_assigning_everyone():
    """The dangerous misreading: [] must not mean 'no filter'."""
    body, status, assigner = _assign_route(_row(), body={'user_ids': []})
    assert status == 400
    assigner.assert_not_called()


def test_a_junk_user_id_is_refused():
    body, status, assigner = _assign_route(_row(), body={'user_ids': ['not-a-uuid']})
    assert status == 400
    assigner.assert_not_called()


def test_user_ids_must_be_a_list():
    body, status, assigner = _assign_route(_row(), body={'user_ids': 'everyone'})
    assert status == 400
    assigner.assert_not_called()


# ── Choosing people is intersected, never trusted ─────────────────────────────

def test_chosen_ids_are_intersected_with_who_the_row_applies_to():
    """The ids come from the browser. An admin editing the request must not be
    able to enrol a student, another school's parent, or a teacher the training
    was never aimed at."""
    eligible = [{'id': 'a', 'roles': ['advisor']}, {'id': 'b', 'roles': ['advisor']}]
    with patch.object(training, '_eligible_people', return_value=eligible), \
         patch.object(training, '_admin', return_value=Mock()), \
         patch('utils.quest_assignment.assign_quest_to_users',
               return_value={'enrolled': 1, 'already': 0, 'failed': 0}) as assign:
        training._assign_item(ORG, {'quest_id': 'q1'}, 'staff',
                              only_user_ids=['a', 'outsider'])
    assert assign.call_args[0][2] == ['a'], 'the outsider is dropped, not enrolled'


def test_no_selection_assigns_everyone_the_row_applies_to():
    eligible = [{'id': 'a'}, {'id': 'b'}]
    with patch.object(training, '_eligible_people', return_value=eligible), \
         patch.object(training, '_admin', return_value=Mock()), \
         patch('utils.quest_assignment.assign_quest_to_users',
               return_value={'enrolled': 2, 'already': 0, 'failed': 0}) as assign:
        training._assign_item(ORG, {'quest_id': 'q1'}, 'family')
    assert assign.call_args[0][2] == ['a', 'b']


# ── The catch-up on read ──────────────────────────────────────────────────────

def test_catch_up_enrols_only_auto_assign_rows_not_yet_started():
    catalog = [
        {'quest_id': 'q1', 'auto_assign': True, 'my_progress': {'started': False}},
        {'quest_id': 'q2', 'auto_assign': False, 'my_progress': {'started': False}},
        {'quest_id': 'q3', 'auto_assign': True, 'my_progress': {'started': True}},
    ]
    with patch.object(training, '_admin', return_value=Mock()), \
         patch('utils.quest_assignment.assign_quest_to_users',
               return_value={'enrolled': 1, 'already': 0, 'failed': 0}) as assigner:
        created = training.catch_up_auto_assigned('u1', catalog, 'staff')
    assert created == 1
    assert [c.args[1] for c in assigner.call_args_list] == ['q1']


def test_catch_up_is_a_no_op_with_nothing_to_do():
    catalog = [{'quest_id': 'q1', 'auto_assign': False, 'my_progress': {'started': False}}]
    with patch('utils.quest_assignment.assign_quest_to_users') as assigner:
        assert training.catch_up_auto_assigned('u1', catalog, 'staff') == 0
    assigner.assert_not_called()


def test_catch_up_failure_does_not_break_the_page():
    """Reading your training list is the point; a failed enrollment must not
    turn the page into an error."""
    catalog = [{'quest_id': 'q1', 'auto_assign': True, 'my_progress': {'started': False}}]
    with patch.object(training, '_admin', return_value=Mock()), \
         patch('utils.quest_assignment.assign_quest_to_users', side_effect=RuntimeError('boom')):
        assert training.catch_up_auto_assigned('u1', catalog, 'staff') == 0
