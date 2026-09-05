"""
DELETE /api/sis/households/<id> reports who it left without a family.

iCreate, 2026-09-01: "once I delete a family...how can I delete the children? I
deleted 'Tester' family but now the kids still show and I don't know how to
remove them from certain reports (like allergies)..."

The accounts surviving is deliberate -- a family record groups people, it does
not own them, and deleting a duplicate registration must not delete a child's
work. The dialog has said so since July, but it says so BEFORE the deletion,
which is not the moment the question gets asked. The names come back from the
delete now so the office can be sent straight at them.
"""

from unittest.mock import Mock, patch

import pytest


LINKS = [
    {'user_id': 's2', 'role': 'student'},
    {'user_id': 's1', 'role': 'student'},
    {'user_id': 'g1', 'role': 'guardian'},
]
USERS = [
    {'id': 's1', 'display_name': None, 'first_name': 'Ada', 'last_name': 'Tester'},
    {'id': 's2', 'display_name': None, 'first_name': 'Blaise', 'last_name': 'Tester'},
    {'id': 'g1', 'display_name': 'Mo Tester', 'first_name': 'Mo', 'last_name': 'Tester'},
]


class _Table:
    """Records what was deleted, and answers the two reads the route makes."""

    def __init__(self, name, log, links, users):
        self.name, self._log, self._links, self._users = name, log, links, users
        self._op = 'select'

    def select(self, *_a, **_k):
        self._op = 'select'
        return self

    def delete(self):
        self._op = 'delete'
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self._op == 'delete':
            self._log.append(self.name)
            return Mock(data=[])
        if self.name == 'household_members':
            return Mock(data=self._links)
        if self.name == 'users':
            # require_role's own lookup asks users for a role row first.
            return Mock(data=self._users if self._users is not None else [])
        return Mock(data=[])


def _delete(client, auth_headers, links=LINKS, users=USERS):
    log = []
    role_row = [{'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin']}]
    seen = {'users': 0}

    def _users_rows():
        seen['users'] += 1
        return role_row if seen['users'] == 1 else users

    admin = Mock()
    admin.table.side_effect = lambda n: _Table(
        n, log, links, _users_rows() if n == 'users' else None)

    repo = Mock()
    repo.find_by_id.return_value = {'id': 'h1', 'organization_id': 'org-1',
                                    'name': 'Tester Family'}
    with patch('database.get_supabase_admin_client', return_value=admin), \
         patch('routes.sis.get_supabase_admin_client', return_value=admin), \
         patch('routes.sis.HouseholdRepository', return_value=repo), \
         patch('services.sis_service.resolve_org_id', return_value='org-1'):
        resp = client.delete('/api/sis/households/h1?organization_id=org-1',
                             headers=auth_headers)
    return resp, log


@pytest.mark.unit
class TestDeletingAFamily:
    def test_it_names_everyone_it_left_behind(self, client, auth_headers, mock_verify_token):
        resp, _ = _delete(client, auth_headers)
        assert resp.status_code == 200
        names = [m['name'] for m in resp.get_json()['orphaned_members']]
        # Alphabetical, so the list reads the way the office scans it.
        assert names == ['Ada Tester', 'Blaise Tester', 'Mo Tester']

    def test_it_says_what_each_of_them_was_to_the_family(self, client, auth_headers, mock_verify_token):
        resp, _ = _delete(client, auth_headers)
        by_name = {m['name']: m['role'] for m in resp.get_json()['orphaned_members']}
        assert by_name['Ada Tester'] == 'student'
        assert by_name['Mo Tester'] == 'guardian'

    def test_the_household_and_its_links_are_still_deleted(self, client, auth_headers, mock_verify_token):
        _, log = _delete(client, auth_headers)
        assert log == ['household_members', 'households']

    def test_an_empty_family_reports_nobody(self, client, auth_headers, mock_verify_token):
        resp, log = _delete(client, auth_headers, links=[], users=[])
        assert resp.status_code == 200
        assert resp.get_json()['orphaned_members'] == []
        assert log == ['household_members', 'households']
