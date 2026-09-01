"""
Unit tests for the school label on Optio Support's inbox.

A member writing to Optio Support is one of hundreds from dozens of schools, so
the support inbox says which school each person belongs to. Two rules matter:

- The label is superadmin-only. For anyone else it's a fact about another user
  their inbox has no reason to carry.
- Membership resolves the way the rest of the family-facing SIS resolves it
  (organization_id, then dependents, then approved parent links), but batched:
  a support inbox is a long list, and per-user lookups made it crawl.
"""

from unittest.mock import MagicMock, patch

from services import sis_service
from routes.direct_messages import _label_member_orgs


class _FakeTable:
    """Records the filters a chain applies and replays canned rows."""

    def __init__(self, rows_for):
        self._rows_for = rows_for
        self._table = None
        self._filters = {}

    def table(self, name):
        self._table = name
        self._filters = {}
        return self

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._filters[('eq', col)] = val
        return self

    def in_(self, col, vals):
        self._filters[('in', col)] = list(vals)
        return self

    def not_is_(self, *_a):
        return self

    @property
    def not_(self):
        return self

    def is_(self, *_a):
        return self

    def limit(self, *_a):
        return self

    def execute(self):
        return MagicMock(data=self._rows_for(self._table, self._filters))


def _client(rows_for):
    return _FakeTable(rows_for)


def test_member_orgs_by_user_direct_membership():
    def rows_for(table, filters):
        if table == 'users':
            return [{'id': 'stu-1', 'organization_id': 'org-1'}]
        if table == 'organizations':
            return [{'id': 'org-1', 'name': 'iCreate'}]
        return []

    with patch.object(sis_service, '_admin', return_value=_client(rows_for)):
        out = sis_service.member_orgs_by_user(['stu-1'])
    assert out == {'stu-1': {'id': 'org-1', 'name': 'iCreate'}}


def test_member_orgs_by_user_parent_through_dependent():
    calls = {'users': 0}

    def rows_for(table, filters):
        if table == 'users' and ('in', 'id') in filters:
            return [{'id': 'parent-1', 'organization_id': None}]
        if table == 'users' and ('in', 'managed_by_parent_id') in filters:
            return [{'managed_by_parent_id': 'parent-1', 'organization_id': 'org-1'}]
        if table == 'organizations':
            return [{'id': 'org-1', 'name': 'iCreate'}]
        return []

    with patch.object(sis_service, '_admin', return_value=_client(rows_for)):
        out = sis_service.member_orgs_by_user(['parent-1'])
    assert out == {'parent-1': {'id': 'org-1', 'name': 'iCreate'}}


def test_member_orgs_by_user_parent_through_approved_link():
    def rows_for(table, filters):
        if table == 'users' and ('in', 'id') in filters:
            ids = filters[('in', 'id')]
            if ids == ['parent-1']:
                return [{'id': 'parent-1', 'organization_id': None}]
            return [{'id': 'kid-1', 'organization_id': 'org-2'}]
        if table == 'users':
            return []
        if table == 'parent_student_links':
            return [{'parent_user_id': 'parent-1', 'student_user_id': 'kid-1'}]
        if table == 'organizations':
            return [{'id': 'org-2', 'name': 'Hearthwood'}]
        return []

    with patch.object(sis_service, '_admin', return_value=_client(rows_for)):
        out = sis_service.member_orgs_by_user(['parent-1'])
    assert out == {'parent-1': {'id': 'org-2', 'name': 'Hearthwood'}}


def test_member_orgs_by_user_platform_user_unlabeled():
    def rows_for(table, filters):
        if table == 'users' and ('in', 'id') in filters:
            return [{'id': 'solo-1', 'organization_id': None}]
        return []

    with patch.object(sis_service, '_admin', return_value=_client(rows_for)):
        assert sis_service.member_orgs_by_user(['solo-1']) == {}


def test_member_orgs_by_user_never_raises():
    admin = MagicMock()
    admin.table.side_effect = RuntimeError('db down')
    with patch.object(sis_service, '_admin', return_value=admin):
        assert sis_service.member_orgs_by_user(['stu-1']) == {}


# ── The superadmin gate ──

def _viewer_client(role):
    admin = MagicMock()
    admin.table.return_value.select.return_value.eq.return_value.limit.return_value \
        .execute.return_value = MagicMock(data=[{'role': role, 'org_role': None}])
    return admin


def test_label_member_orgs_for_superadmin():
    people = [{'id': 'stu-1', 'display_name': 'Sam'}]
    with patch('database.get_supabase_admin_client', return_value=_viewer_client('superadmin')), \
         patch('services.sis_service.member_orgs_by_user',
               return_value={'stu-1': {'id': 'org-1', 'name': 'iCreate'}}):
        _label_member_orgs('super-1', people)
    assert people[0]['organization_name'] == 'iCreate'
    assert people[0]['organization_id'] == 'org-1'


def test_label_member_orgs_skipped_for_everyone_else():
    people = [{'id': 'stu-1', 'display_name': 'Sam'}]
    lookup = MagicMock()
    with patch('database.get_supabase_admin_client', return_value=_viewer_client('advisor')), \
         patch('services.sis_service.member_orgs_by_user', lookup):
        _label_member_orgs('advisor-1', people)
    assert 'organization_name' not in people[0]
    lookup.assert_not_called()


def test_label_member_orgs_skips_school_inbox_rows():
    people = [{'id': 'inbox-1', 'is_school': True, 'display_name': 'iCreate'}]
    lookup = MagicMock()
    with patch('services.sis_service.member_orgs_by_user', lookup):
        _label_member_orgs('super-1', people)
    assert 'organization_name' not in people[0]
    lookup.assert_not_called()


def test_label_member_orgs_never_raises():
    people = [{'id': 'stu-1'}]
    with patch('database.get_supabase_admin_client', side_effect=RuntimeError('boom')):
        _label_member_orgs('super-1', people)
    assert people == [{'id': 'stu-1'}]
