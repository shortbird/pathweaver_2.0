"""
Library > Quests: the Optio library as the school sees it, the school's quest
visibility policy, curated grants, and Unpublish / Publish again.

These moved from the web org console (QuestVisibilityManager, the Deactivate
toggle) into the SIS on 2026-10-15. What they pin: the policy takes only the
three values; grants need the curated policy and refuse a school's own quest;
the library page marks each quest available by the policy; Unpublish and
Publish again work on the school's own quests only.
"""

from unittest.mock import Mock, patch

from flask import Flask

import routes.sis.quest_library as library

ORG = '11111111-1111-4111-8111-111111111111'
USER = '55555555-5555-4555-8555-555555555555'
OWN = '33333333-3333-4333-8333-333333333331'
LIB_A = '33333333-3333-4333-8333-333333333332'
LIB_B = '33333333-3333-4333-8333-333333333333'


class _Query:
    def __init__(self, name, tables, log):
        self.name, self._tables, self._log = name, tables, log
        self._rows = list(tables.get(name, []))

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._rows = [r for r in self._rows if r.get(col) == val]
        return self

    def is_(self, col, _val):
        self._rows = [r for r in self._rows if r.get(col) is None]
        return self

    def in_(self, col, vals):
        vals = set(vals)
        self._rows = [r for r in self._rows if r.get(col) in vals]
        return self

    @property
    def not_(self):
        outer = self

        class _Not:
            def in_(self, col, vals):
                vals = set(vals)
                outer._rows = [r for r in outer._rows if r.get(col) not in vals]
                return outer
        return _Not()

    def __getattr__(self, _name):  # ilike / order / limit / range
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
        return Mock(data=list(self._rows), count=len(self._rows))


def _tables(policy='curated', grants=(LIB_A,)):
    return {
        'organizations': [{'id': ORG, 'quest_visibility_policy': policy}],
        'organization_quest_access': [{'id': f'a{i}', 'organization_id': ORG, 'quest_id': q}
                                      for i, q in enumerate(grants)],
        'quests': [
            {'id': OWN, 'title': 'Ours', 'organization_id': ORG, 'is_public': False,
             'is_active': True, 'quest_type': 'optio', 'archived_at': None},
            {'id': LIB_A, 'title': 'Alpha', 'organization_id': None, 'is_public': True,
             'is_active': True, 'quest_type': 'optio', 'archived_at': None},
            {'id': LIB_B, 'title': 'Beta', 'organization_id': None, 'is_public': True,
             'is_active': True, 'quest_type': 'course', 'archived_at': None},
        ],
    }


def _run(route, args=(), body=None, query=None, tables=None):
    log = []
    tables = tables or _tables()
    client = Mock()
    client.table.side_effect = lambda name: _Query(name, tables, log)
    with patch.object(library, '_admin', return_value=client), \
         patch('services.sis_service.org_or_error', return_value=(ORG, None)), \
         patch('repositories.org_quest_visibility_repository.fetch_all_rows',
               side_effect=lambda build, **_k: build().execute().data), \
         patch.object(library, 'request', Mock(get_json=lambda silent=True: body or {}, args=query or {})):
        app = Flask(__name__)
        with app.app_context():
            fn = route
            while hasattr(fn, '__wrapped__'):
                fn = fn.__wrapped__
            resp = fn(USER, *args)
    out = resp[0] if isinstance(resp, tuple) else resp
    return out.get_json(), (resp[1] if isinstance(resp, tuple) else 200), log


def test_library_page_marks_curated_availability():
    body, status, _ = _run(library.list_optio_quests)
    assert status == 200
    assert body['policy'] == 'curated'
    marks = {q['id']: q['available'] for q in body['quests']}
    assert marks == {LIB_A: True, LIB_B: False}  # never the school's own quest
    assert body['granted_count'] == 1


def test_library_page_filters_to_what_is_not_available():
    body, _, _ = _run(library.list_optio_quests, query={'show': 'unavailable'})
    assert [q['id'] for q in body['quests']] == [LIB_B]


def test_private_only_shows_nothing_as_available():
    body, _, _ = _run(library.list_optio_quests, query={'show': 'available'},
                      tables=_tables(policy='private_only'))
    assert body['quests'] == [] and body['total'] == 0


def test_policy_takes_only_the_three_values():
    body, status, log = _run(library.set_quest_visibility, body={'policy': 'everything'})
    assert status == 400 and not log
    body, status, log = _run(library.set_quest_visibility, body={'policy': 'private_only'})
    assert status == 200
    assert ('update', 'organizations', {'quest_visibility_policy': 'private_only'}) in log


def test_grants_need_the_curated_policy():
    _, status, log = _run(library.set_optio_quest_access,
                          body={'quest_ids': [LIB_B], 'available': True},
                          tables=_tables(policy='all_optio'))
    assert status == 409 and not log


def test_grant_refuses_the_schools_own_quest():
    _, status, log = _run(library.set_optio_quest_access,
                          body={'quest_ids': [OWN], 'available': True})
    assert status == 400 and not log


def test_grant_and_revoke():
    _, status, log = _run(library.set_optio_quest_access,
                          body={'quest_ids': [LIB_A, LIB_B], 'available': True})
    assert status == 200
    # LIB_A is already granted; only LIB_B is written.
    assert log == [('insert', 'organization_quest_access',
                    [{'organization_id': ORG, 'quest_id': LIB_B, 'granted_by': USER}])]
    _, status, log = _run(library.set_optio_quest_access,
                          body={'quest_ids': [LIB_A], 'available': False})
    assert status == 200 and log == [('delete', 'organization_quest_access')]


def test_unpublish_and_publish_again_the_schools_own_quest():
    with patch('utils.quest_validation.can_activate_quest', return_value=(True, '')):
        _, status, log = _run(library.set_library_quest_active, args=(OWN,), body={'active': False})
        assert status == 200
        assert log[0][0:2] == ('update', 'quests') and log[0][2]['is_active'] is False
        assert log[0][2]['deactivated_at']
        _, status, log = _run(library.set_library_quest_active, args=(OWN,), body={'active': True})
        assert status == 200
        assert log[0][2] == {'is_active': True, 'deactivated_at': None}


def test_unpublish_refuses_an_optio_library_quest():
    _, status, log = _run(library.set_library_quest_active, args=(LIB_A,), body={'active': False})
    assert status == 403 and not log


def test_publish_again_applies_the_activation_rule():
    with patch('utils.quest_validation.can_activate_quest',
               return_value=(False, 'A course quest needs its tasks first.')):
        body, status, log = _run(library.set_library_quest_active, args=(OWN,), body={'active': True})
    assert status == 400 and not log
    assert body['error'] == 'A course quest needs its tasks first.'


# ── quest groups: the front office manages them from the SIS ────────────────

import pytest  # noqa: E402

import routes.quest_groups as quest_groups  # noqa: E402


@pytest.mark.parametrize('user, allowed', [
    ({'role': 'org_managed', 'org_role': 'org_admin', 'organization_id': ORG}, True),
    ({'role': 'org_managed', 'org_role': 'campus_coordinator', 'organization_id': ORG}, True),
    ({'role': 'org_managed', 'org_role': 'advisor', 'organization_id': ORG}, True),
    ({'role': 'org_managed', 'org_role': 'campus_coordinator', 'organization_id': 'other'}, False),
    ({'role': 'org_managed', 'org_role': 'student', 'organization_id': ORG}, False),
    ({'role': 'superadmin', 'organization_id': None}, True),
])
def test_quest_group_access_admits_the_front_office(user, allowed):
    client = Mock()
    client.table.side_effect = lambda name: _Query(name, {'users': [{'id': USER, **user}]}, [])
    with patch.object(quest_groups, 'get_supabase_admin_client', return_value=client):
        assert quest_groups._org_access(USER, ORG) is allowed
