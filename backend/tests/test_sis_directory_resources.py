"""
Unit tests for the family directory (opt-in) and org resources reads in
sis_parent_service. Privacy property under test: only opted-in households are
visible family-to-family, and a guardian can only flip their OWN household.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_parent_service as parent


class _Query:
    def __init__(self, table, resolver, captured):
        self._table = table
        self._resolver = resolver
        self._captured = captured
        self._eq = {}
        self._in = {}

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._eq[col] = val
        return self

    def in_(self, col, vals):
        self._in[col] = vals
        return self

    def order(self, *_a, **_k):
        return self

    def update(self, fields):
        self._captured['update'] = {'table': self._table, 'fields': fields}
        return self

    def execute(self):
        if 'update' in self._captured and self._captured['update']['table'] == self._table:
            self._captured.setdefault('update_filters', {'eq': self._eq, 'in': self._in})
        return Mock(data=self._resolver(self._table, self._eq, self._in))


def _fake_admin(resolver, captured=None):
    captured = captured if captured is not None else {}
    client = Mock()
    client.table.side_effect = lambda name: _Query(name, resolver, captured)
    return client, captured


# Org 'org1': guardian g1 + student stu1 in household h1 (opted in);
# household h2 exists but is NOT opted in.
def _resolver(table, eq, in_):
    if table == 'household_members':
        if eq.get('user_id') == 'g1':
            return [{'household_id': 'h1', 'relationship': 'guardian'}]
        if in_.get('household_id'):
            return [
                {'household_id': 'h1', 'user_id': 'g1', 'relationship': 'guardian'},
                {'household_id': 'h1', 'user_id': 'stu1', 'relationship': 'student'},
            ]
        return []
    if table == 'households':
        if eq.get('directory_opt_in') is True:
            return [{'id': 'h1', 'name': 'One Family', 'phone': '555-1111'}]
        return [{'id': 'h1', 'name': 'One Family', 'phone': '555-1111', 'directory_opt_in': True}]
    if table == 'users':
        return [
            {'id': 'g1', 'display_name': 'Gina One', 'first_name': 'Gina', 'email': 'g1@x.com'},
            {'id': 'stu1', 'first_name': 'Sam', 'display_name': 'Sam One'},
        ]
    if table == 'org_resources':
        return [{'id': 'r1', 'title': 'Family Guidebook', 'url': 'https://x/guide.pdf',
                 'category': 'Policies', 'description': None, 'sort_order': 0}]
    return []


@pytest.mark.unit
class TestOrgResources:
    def test_requires_org_access(self):
        with patch('services.sis_parent_service._has_org_access', return_value=False):
            assert parent.org_resources('stranger', 'org1') is None

    def test_lists_resources_for_family(self):
        client, _ = _fake_admin(_resolver)
        with patch('services.sis_parent_service._has_org_access', return_value=True), \
             patch('services.sis_parent_service.get_supabase_admin_client', return_value=client):
            rows = parent.org_resources('g1', 'org1')
        assert rows[0]['title'] == 'Family Guidebook'


@pytest.mark.unit
class TestFamilyDirectory:
    def test_requires_org_access(self):
        with patch('services.sis_parent_service._has_org_access', return_value=False):
            assert parent.family_directory('stranger', 'org1') is None

    def test_lists_only_opted_in_households_with_guardians_and_kid_first_names(self):
        client, _ = _fake_admin(_resolver)
        with patch('services.sis_parent_service._has_org_access', return_value=True), \
             patch('services.sis_parent_service.get_supabase_admin_client', return_value=client):
            families = parent.family_directory('g1', 'org1')
        assert len(families) == 1
        fam = families[0]
        assert fam['family_name'] == 'One Family'
        assert fam['guardians'] == [{'name': 'Gina One', 'email': 'g1@x.com'}]
        assert fam['students'] == ['Sam']  # first names only
        assert fam['phone'] == '555-1111'

    def test_opt_in_updates_only_own_households(self):
        client, captured = _fake_admin(_resolver)
        with patch('services.sis_parent_service.get_supabase_admin_client', return_value=client):
            result = parent.set_directory_opt_in('g1', 'org1', True)
        assert result == {'opted_in': True}
        assert captured['update'] == {'table': 'households', 'fields': {'directory_opt_in': True}}
        assert captured['update_filters']['in'] == {'id': ['h1']}

    def test_opt_in_errors_without_a_household(self):
        client, _ = _fake_admin(lambda *_: [])
        with patch('services.sis_parent_service.get_supabase_admin_client', return_value=client):
            assert parent.set_directory_opt_in('nobody', 'org1', True).get('error')

    def test_status_reflects_household_flag(self):
        client, _ = _fake_admin(_resolver)
        with patch('services.sis_parent_service.get_supabase_admin_client', return_value=client):
            assert parent.directory_opt_in_status('g1', 'org1') == {'opted_in': True}
