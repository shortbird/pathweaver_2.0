"""
Quest discovery hides a school quest nobody assigned (owner decision, 2026-09-24).

A school quest (organization_id = the student's org) lists in discovery only
when it is on a class, a curriculum or the training catalog. The database
answers "assigned" through the quest_is_assigned(quests) computed field
(supabase/migrations/20260924140000_quest_is_assigned.sql); these tests pin the
filter the repository sends, the fallback while that migration is unapplied,
and the staff exemption that keeps the course builder's quest picker whole.
"""

import uuid
from unittest.mock import patch

import pytest
from postgrest.exceptions import APIError

import repositories.quest_repository as quest_repository
from repositories.quest_repository import QuestRepository


class _Resp:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _QuestsQuery:
    """Records the filters one quests query was built with."""

    def __init__(self, client):
        self.client = client
        self.ors = []
        self.calls = []

    def _chain(self, name, *args):
        self.calls.append((name, args))
        return self

    def select(self, *a, **k):
        return self._chain('select', *a)

    def eq(self, *a):
        return self._chain('eq', *a)

    def is_(self, *a):
        return self._chain('is_', *a)

    def contains(self, *a):
        return self._chain('contains', *a)

    def order(self, *a, **k):
        return self._chain('order', *a)

    def range(self, *a):
        return self._chain('range', *a)

    def in_(self, *a):
        return self._chain('in_', *a)

    def or_(self, expr):
        self.ors.append(expr)
        return self

    def execute(self):
        self.client.quest_queries.append(self)
        uses_field = any('quest_is_assigned' in e for e in self.ors)
        if uses_field and not self.client.field_exists:
            raise APIError({
                'code': '42703',
                'message': 'column quests.quest_is_assigned does not exist',
                'details': None,
                'hint': None,
            })
        rows = self.client.quest_rows
        return _Resp(rows, len(rows))


class _Table:
    def __init__(self, data):
        self._data = data

    def select(self, *a, **k):
        return self

    def eq(self, *a):
        return self

    def single(self):
        self._single = True
        return self

    def execute(self):
        if getattr(self, '_single', False):
            return _Resp(self._data[0] if self._data else None)
        return _Resp(self._data)


class _RPC:
    def __init__(self, org_id):
        self.org_id = org_id

    def execute(self):
        return _Resp([{'organization_id': self.org_id}])


class FakeAdmin:
    def __init__(self, org_id, policy='all_optio', user_row=None,
                 field_exists=True, curated_ids=None):
        self.org_id = org_id
        self.policy = policy
        self.user_row = user_row or {'role': 'org_managed', 'org_role': 'student',
                                     'org_roles': ['student']}
        self.field_exists = field_exists
        self.curated_ids = curated_ids or []
        self.quest_rows = [{'id': 'q1', 'created_at': '2026-09-01'}]
        self.quest_queries = []
        self.users_reads = 0

    def rpc(self, name, params):
        return _RPC(self.org_id)

    def table(self, name):
        if name == 'quests':
            return _QuestsQuery(self)
        if name == 'organizations':
            return _Table([{'quest_visibility_policy': self.policy}])
        if name == 'users':
            self.users_reads += 1
            return _Table([dict(self.user_row, id='u')])
        if name == 'organization_quest_access':
            return _Table([{'quest_id': q} for q in self.curated_ids])
        raise AssertionError(f'unexpected table {name}')


@pytest.fixture(autouse=True)
def _reset_field_cache():
    quest_repository._assigned_field_missing_until = 0.0
    yield
    quest_repository._assigned_field_missing_until = 0.0


def _run(admin, **kwargs):
    with patch('database.get_supabase_admin_client', return_value=admin):
        return QuestRepository().get_quests_for_user(str(uuid.uuid4()), **kwargs)


def _visibility_ors(admin):
    return [e for q in admin.quest_queries for e in q.ors if 'created_by' in e]


@pytest.mark.unit
@pytest.mark.parametrize('policy', ['all_optio', 'curated', 'private_only'])
def test_student_sees_only_assigned_school_quests(policy):
    org = str(uuid.uuid4())
    admin = FakeAdmin(org, policy=policy, curated_ids=[str(uuid.uuid4())])

    result = _run(admin)

    assert result['total'] == 1
    ors = _visibility_ors(admin)
    assert ors, 'the visibility filter was not applied'
    for expr in ors:
        assert f'and(organization_id.eq.{org},quest_is_assigned.is.true)' in expr
        # The bare org clause is exactly the leak being closed.
        assert f',organization_id.eq.{org},' not in f',{expr},'


@pytest.mark.unit
def test_global_and_own_quests_are_unchanged():
    org = str(uuid.uuid4())
    admin = FakeAdmin(org)

    _run(admin)

    (expr,) = _visibility_ors(admin)
    assert 'and(organization_id.is.null,is_public.eq.true)' in expr
    assert 'created_by.eq.' in expr


@pytest.mark.unit
def test_popular_sort_keeps_the_assigned_rule_on_both_reads():
    org = str(uuid.uuid4())
    admin = FakeAdmin(org)

    result = _run(admin, sort='popular')

    assert result['total'] == 1
    assert [r['id'] for r in result['quests']] == ['q1']
    # One id-ranking read and one page read, both assigned-only.
    assert len(admin.quest_queries) == 2
    for q in admin.quest_queries:
        assert any('quest_is_assigned.is.true' in e for e in q.ors)


@pytest.mark.unit
def test_falls_back_to_old_listing_while_migration_is_unapplied():
    org = str(uuid.uuid4())
    admin = FakeAdmin(org, field_exists=False)

    result = _run(admin)

    assert result['total'] == 1
    last = admin.quest_queries[-1]
    assert any(f'organization_id.eq.{org}' in e and 'quest_is_assigned' not in e
               for e in last.ors)

    # The miss is remembered: the next call does not ask for the field again.
    admin.quest_queries.clear()
    _run(admin)
    assert len(admin.quest_queries) == 1
    assert not any('quest_is_assigned' in e for e in admin.quest_queries[0].ors)


@pytest.mark.unit
def test_other_errors_are_not_mistaken_for_a_missing_field():
    org = str(uuid.uuid4())
    admin = FakeAdmin(org)

    def boom(self):
        raise APIError({'code': '57014', 'message': 'statement timeout',
                        'details': None, 'hint': None})

    from repositories.base_repository import DatabaseError
    with patch.object(_QuestsQuery, 'execute', boom), pytest.raises(DatabaseError):
        _run(admin)
    assert quest_repository._assigned_field_available()


@pytest.mark.unit
@pytest.mark.parametrize('user_row', [
    {'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin']},
    {'role': 'org_managed', 'org_role': 'advisor', 'org_roles': ['advisor', 'parent']},
    {'role': 'org_managed', 'org_role': 'campus_coordinator',
     'org_roles': ['campus_coordinator']},
])
def test_staff_still_see_every_active_school_quest(user_row):
    """The course builder's quest picker reads this same endpoint."""
    org = str(uuid.uuid4())
    admin = FakeAdmin(org, user_row=user_row)

    _run(admin)

    (expr,) = _visibility_ors(admin)
    assert f'organization_id.eq.{org}' in expr
    assert 'quest_is_assigned' not in expr


@pytest.mark.unit
def test_parent_is_held_to_the_assigned_rule():
    org = str(uuid.uuid4())
    admin = FakeAdmin(org, user_row={'role': 'org_managed', 'org_role': 'parent',
                                     'org_roles': ['parent']})

    _run(admin)

    (expr,) = _visibility_ors(admin)
    assert 'quest_is_assigned.is.true' in expr


@pytest.mark.unit
def test_user_without_org_needs_no_role_read():
    admin = FakeAdmin(None)

    _run(admin)

    assert admin.users_reads == 0
    (expr,) = _visibility_ors(admin)
    assert 'quest_is_assigned' not in expr
