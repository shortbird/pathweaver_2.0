"""
Unit tests for the family directory and org resources reads in
sis_parent_service. Privacy properties under test: a family is only visible
family-to-family when it is listed under the school's model (opt-in, or
default-listed with no opt-out), and a guardian can only flip their OWN
household.
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

    def limit(self, *_a, **_k):
        return self

    def range(self, *_a, **_k):
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


# Org 'org1': guardian g1 + student stu1 in household h1 (opted in); household
# h2 has made no choice; household h3 has explicitly opted out. Which of those
# appear depends on the school's directory model.
_HOUSEHOLDS = [
    {'id': 'h1', 'name': 'One Family', 'phone': '555-1111', 'city': 'Provo',
     'directory_opt_in': True, 'directory_opted_out': False, 'carpool_interest': True},
    {'id': 'h2', 'name': 'Two Family', 'phone': '555-2222', 'city': 'Orem',
     'directory_opt_in': False, 'directory_opted_out': False, 'carpool_interest': False},
    {'id': 'h3', 'name': 'Three Family', 'phone': '555-3333', 'city': 'Lehi',
     'directory_opt_in': False, 'directory_opted_out': True, 'carpool_interest': True},
]


def _make_resolver(default_in=False):
    def _r(table, eq, in_):
        if table == 'organizations':
            return [{'feature_flags': {'sis_settings': {'directory_default_in': default_in}}}]
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
            if in_.get('id'):
                return [h for h in _HOUSEHOLDS if h['id'] in in_['id']]
            return list(_HOUSEHOLDS)
        return _shared_resolver(table, eq, in_)
    return _r


def _resolver(table, eq, in_):
    return _make_resolver()(table, eq, in_)


def _shared_resolver(table, eq, in_):
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
    def test_requires_org_membership(self):
        # Membership, not guardianship: the library is readable by anyone in the
        # school (see test_sis_school_context), and by nobody outside it.
        with patch('services.sis_parent_service._is_org_member', return_value=False):
            assert parent.org_resources('stranger', 'org1') is None

    def test_lists_resources_for_family(self):
        client, _ = _fake_admin(_resolver)
        with patch('services.sis_parent_service._is_org_member', return_value=True), \
             patch('services.sis_parent_service.get_supabase_admin_client', return_value=client):
            rows = parent.org_resources('g1', 'org1')
        assert rows[0]['title'] == 'Family Guidebook'


@pytest.mark.unit
class TestFamilyDirectory:
    def test_requires_org_membership(self):
        with patch('services.sis_parent_service._is_org_member', return_value=False):
            assert parent.family_directory('stranger', 'org1') is None

    def test_lists_only_opted_in_households_with_guardians_and_kid_first_names(self):
        client, _ = _fake_admin(_resolver)
        with patch('services.sis_parent_service._is_org_member', return_value=True), \
             patch('services.sis_parent_service.get_supabase_admin_client', return_value=client):
            families = parent.family_directory('g1', 'org1')
        # Opt-in school: only h1 chose to be listed.
        assert len(families) == 1
        fam = families[0]
        assert fam['family_name'] == 'One Family'
        assert fam['guardians'] == [{'name': 'Gina One', 'email': 'g1@x.com'}]
        assert fam['students'] == ['Sam']  # first names only
        assert fam['phone'] == '555-1111'
        # City is shown without the street address, so families can find
        # neighbours to carpool with.
        assert fam['city'] == 'Provo'
        assert fam['address'] is None
        assert fam['carpool_interest'] is True

    def test_default_in_school_lists_everyone_except_opt_outs(self):
        """iCreate's ask: opt OUT, not opt in. A family that never touched the
        setting is listed; one that explicitly opted out stays hidden."""
        client, _ = _fake_admin(_make_resolver(default_in=True))
        with patch('services.sis_parent_service._has_org_access', return_value=True), \
             patch('services.sis_parent_service.get_supabase_admin_client', return_value=client):
            families = parent.family_directory('g1', 'org1')
        names = {f['family_name'] for f in families}
        assert names == {'One Family', 'Two Family'}  # h3 opted out

    def test_opt_in_updates_only_own_households(self):
        client, captured = _fake_admin(_resolver)
        with patch('services.sis_parent_service.get_supabase_admin_client', return_value=client):
            result = parent.set_directory_opt_in('g1', 'org1', True)
        assert result['opted_in'] is True
        assert result['default_in'] is False
        assert captured['update'] == {
            'table': 'households',
            'fields': {'directory_opt_in': True, 'directory_opted_out': False},
        }
        assert captured['update_filters']['in'] == {'id': ['h1']}

    def test_opting_out_is_recorded_so_it_survives_a_default_change(self):
        """Turning the switch off has to write the opt-out column: under a
        default-listed school, a stored `directory_opt_in = false` alone would
        put the family straight back in the directory."""
        client, captured = _fake_admin(_resolver)
        with patch('services.sis_parent_service.get_supabase_admin_client', return_value=client):
            parent.set_directory_opt_in('g1', 'org1', False)
        assert captured['update']['fields'] == {
            'directory_opt_in': False, 'directory_opted_out': True,
        }

    def test_carpool_interest_is_saved(self):
        client, captured = _fake_admin(_resolver)
        with patch('services.sis_parent_service.get_supabase_admin_client', return_value=client):
            result = parent.set_directory_opt_in('g1', 'org1', True,
                                                 shares={'carpool_interest': True})
        assert result['carpool_interest'] is True
        assert captured['update']['fields']['carpool_interest'] is True

    def test_opt_in_errors_without_a_household(self):
        client, _ = _fake_admin(lambda *_: [])
        with patch('services.sis_parent_service.get_supabase_admin_client', return_value=client):
            assert parent.set_directory_opt_in('nobody', 'org1', True).get('error')

    def test_status_reflects_household_flag(self):
        client, _ = _fake_admin(_resolver)
        with patch('services.sis_parent_service.get_supabase_admin_client', return_value=client):
            status = parent.directory_opt_in_status('g1', 'org1')
        assert status['opted_in'] is True
        assert status['default_in'] is False
        assert status['carpool_interest'] is True
        # Per-field sharing defaults: email/phone on (the directory always
        # showed them), address off (never shown before — explicit opt-in).
        assert status['share_email'] is True
        assert status['share_phone'] is True
        assert status['share_address'] is False

    def test_status_says_listed_under_a_default_in_school(self):
        """A family that never opted in is still listed, and the page needs to
        say so rather than inviting them to join something they're already in."""
        client, _ = _fake_admin(_make_resolver(default_in=True))
        with patch('services.sis_parent_service._guardian_households',
                   return_value=[_HOUSEHOLDS[1]]), \
             patch('services.sis_parent_service.get_supabase_admin_client', return_value=client):
            status = parent.directory_opt_in_status('g2', 'org1')
        assert status['opted_in'] is True
        assert status['default_in'] is True
