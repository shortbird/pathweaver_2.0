"""
One attach path, every door (M16, 2026-09-18).

Whichever door puts a person in a family -- the funnel's family step, the
learning app's "add a student" for an org admin, the People page's
add-member, a script -- sis_attach_service does the same steps in the same
order: the guardian's household found or made, the guardian in it, the
student given the org's student shape and parent links FIRST (so a refusal
never leaves a half-connected member), then the membership row, then the
staged directive applied once. These tests drive the service with a fake
client and check the sequence; the door tests elsewhere check each door
calls it.
"""
from unittest.mock import Mock, patch

import pytest

from services import sis_attach_service as attach


class _Query:
    def __init__(self, table, db):
        self.table, self.db = table, db
        self.filters = {}
        self.op = 'select'
        self.payload = None

    def select(self, *_a, **_k):
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def in_(self, k, v):
        self.filters[k] = list(v)
        return self

    def limit(self, *_a):
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        return self

    def insert(self, payload):
        self.op, self.payload = 'insert', payload
        return self

    def execute(self):
        rows = self.db.rows.get(self.table, [])
        if self.op == 'insert':
            row = {'id': f'{self.table}-{len(rows) + 1}', **self.payload}
            rows.append(row)
            self.db.writes.append((self.table, 'insert', self.payload))
            return Mock(data=[row])
        if self.op == 'update':
            self.db.writes.append((self.table, 'update', self.payload, dict(self.filters)))
            return Mock(data=rows)
        out = rows
        for k, v in self.filters.items():
            if isinstance(v, list):
                out = [r for r in out if r.get(k) in v]
            else:
                out = [r for r in out if r.get(k) == v]
        return Mock(data=list(out))


class _FakeDb:
    def __init__(self, rows=None):
        self.rows = {k: list(v) for k, v in (rows or {}).items()}
        self.writes = []

    def table(self, name):
        self.rows.setdefault(name, [])
        return _Query(name, self)


@pytest.fixture
def repo_join():
    """join_household writes through HouseholdRepository.add_members; record
    the rows it was given instead of upserting into the fake."""
    with patch('repositories.household_repository.HouseholdRepository') as repo_cls:
        repo = repo_cls.return_value
        repo.add_members.side_effect = lambda rows: rows
        repo.members_for_households.side_effect = lambda ids: [
            m for m in _MEMBERS if m['household_id'] in ids]
        yield repo


_MEMBERS: list = []


@pytest.mark.unit
class TestHouseholdForGuardian:
    """The one read is HouseholdRepository.for_guardian (its own tests pin
    the query); the service passes the ids through and swallows a failure."""

    def test_asks_the_repository_with_the_guardian_and_the_org(self):
        with patch('repositories.household_repository.HouseholdRepository') as repo_cls:
            repo_cls.return_value.for_guardian.return_value = 'h1'
            assert attach.household_for_guardian('org-1', 'p1', client=_FakeDb()) == 'h1'
        repo_cls.return_value.for_guardian.assert_called_once_with('p1', 'org-1')

    def test_a_failed_lookup_is_none_not_an_error(self):
        with patch('repositories.household_repository.HouseholdRepository') as repo_cls:
            repo_cls.return_value.for_guardian.side_effect = RuntimeError('boom')
            assert attach.household_for_guardian('org-1', 'p1', client=_FakeDb()) is None


@pytest.mark.unit
class TestAttachStudent:
    def test_org_shape_and_links_come_before_the_membership_row(self, repo_join):
        _MEMBERS[:] = [{'household_id': 'h1', 'user_id': 'p1', 'relationship': 'guardian'}]
        db = _FakeDb()
        calls = []
        with patch('services.sis_service.attach_student_to_org',
                   side_effect=lambda *a, **k: calls.append(('org', a, k)) or True):
            repo_join.add_members.side_effect = lambda rows: calls.append(('join', rows)) or rows
            res = attach.attach_student('org-1', 'k1', 'h1', source='test', client=db)
        assert res['attached'] is True
        assert [c[0] for c in calls] == ['org', 'join']
        assert calls[0][1] == ('org-1', 'k1')
        assert calls[0][2] == {'guardian_ids': ['p1'], 'client': db}
        assert calls[1][1] == [{'household_id': 'h1', 'user_id': 'k1',
                                'relationship': 'student', 'is_primary_guardian': False}]

    def test_a_refused_account_never_gets_a_membership_row(self, repo_join):
        _MEMBERS[:] = []
        with patch('services.sis_service.attach_student_to_org', return_value=False):
            res = attach.attach_student('org-1', 'k1', 'h1', source='test', client=_FakeDb())
        assert res['attached'] is False
        assert 'another school' in res['error']
        repo_join.add_members.assert_not_called()


@pytest.mark.unit
class TestAttachGuardian:
    def test_links_to_the_students_already_there_then_joins_as_primary(self, repo_join):
        _MEMBERS[:] = [{'household_id': 'h1', 'user_id': 'k1', 'relationship': 'student'},
                       {'household_id': 'h1', 'user_id': 'k2', 'relationship': 'student'}]
        db = _FakeDb()
        with patch('services.sis_service.link_guardian_to_students') as link:
            rows = attach.attach_guardian('org-1', 'p1', 'h1', primary=True, relationship='other',
                                          source='test', client=db)
        link.assert_called_once_with('p1', ['k1', 'k2'], client=db)
        assert rows == [{'household_id': 'h1', 'user_id': 'p1',
                         'relationship': 'other', 'is_primary_guardian': True}]


@pytest.mark.unit
class TestAttachFamily:
    """The funnel's whole family step, and the admin path's."""

    def test_makes_the_household_and_attaches_everyone_and_applies_the_directive_once(self, repo_join):
        _MEMBERS[:] = []
        repo_join.for_guardian.return_value = None
        repo_join.create.side_effect = lambda org_id, fields: {'id': 'h-new', 'organization_id': org_id, **fields}
        directive = {'id': 'd1', 'registration_hold': True}
        with patch('services.sis_service.attach_student_to_org', return_value=True), \
                patch('services.sis_service.link_guardian_to_students'), \
                patch('services.sis_holds.apply_directives') as applied:
            out = attach.attach_family(
                'org-1', 'p1', ['k1', 'k2', 'k1'],
                household_fields={'name': 'Ant Family', 'city': 'Provo'},
                directive=directive, source='funnel', client=_FakeDb())
        assert out['created'] is True
        assert out['household_id'] == 'h-new'
        assert out['attached'] == ['k1', 'k2']          # deduplicated
        assert out['refused'] == {}
        repo_join.create.assert_called_once_with(
            'org-1', {'name': 'Ant Family', 'city': 'Provo', 'primary_contact_user_id': 'p1'})
        repo_join.update.assert_not_called()
        applied.assert_called_once_with('h-new', directive)
        joined = [row for call in repo_join.add_members.call_args_list for row in call[0][0]]
        assert [(r['user_id'], r['relationship'], r['is_primary_guardian']) for r in joined] == [
            ('p1', 'guardian', True), ('k1', 'student', False), ('k2', 'student', False)]

    def test_reuses_the_household_and_fills_the_rest_but_keeps_its_name(self, repo_join):
        _MEMBERS[:] = []
        repo_join.for_guardian.return_value = "h1"
        with patch('services.sis_service.attach_student_to_org', return_value=True), \
                patch('services.sis_service.link_guardian_to_students'):
            out = attach.attach_family(
                'org-1', 'p1', ['k1'],
                household_fields={'name': 'Ant Family', 'city': 'Provo', 'organization_id': 'org-1'},
                source='funnel', client=_FakeDb())
        assert out == {'household_id': 'h1', 'created': False, 'attached': ['k1'], 'refused': {}}
        repo_join.create.assert_not_called()
        repo_join.update.assert_called_once_with('h1', {'city': 'Provo'})

    def test_a_refused_child_is_reported_not_raised(self, repo_join):
        _MEMBERS[:] = []
        repo_join.for_guardian.return_value = "h1"
        with patch('services.sis_service.attach_student_to_org', side_effect=[True, False]), \
                patch('services.sis_service.link_guardian_to_students'):
            out = attach.attach_family('org-1', 'p1', ['k1', 'k2'],
                                       household_fields={'name': 'Ant Family'},
                                       source='admin_add_student', client=_FakeDb())
        assert out['attached'] == ['k1']
        assert list(out['refused']) == ['k2']

    def test_no_directive_means_no_directive_call(self, repo_join):
        _MEMBERS[:] = []
        repo_join.for_guardian.return_value = "h1"
        with patch('services.sis_service.attach_student_to_org', return_value=True), \
                patch('services.sis_service.link_guardian_to_students'), \
                patch('services.sis_holds.apply_directives') as applied:
            attach.attach_family('org-1', 'p1', [], household_fields={'name': 'X'},
                                 source='seed', client=_FakeDb())
        applied.assert_not_called()


@pytest.mark.unit
class TestTheDoorsCallIt:
    """Each door reaches the service; the steps are its, not the door's."""

    def test_the_admin_path_no_longer_has_its_own_household_logic(self):
        from routes.admin import organization_users
        assert not hasattr(organization_users, '_ensure_shared_household')
        assert organization_users.sis_attach_service is attach

    def test_the_funnel_no_longer_has_its_own_household_lookup(self):
        from routes import registration_funnel
        assert not hasattr(registration_funnel, '_existing_household_for_parent')
        assert registration_funnel.sis_attach_service is attach
