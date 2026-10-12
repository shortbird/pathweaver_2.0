"""
A class's supply expense log.

Ticket e7a50b4b (iCreate, advisor on /my-classes/<id>): "I would like to see
what I have spent on each class supply budget already/how much I have left."

Who may write: the class's teachers for their own class and only their own
entries; the front office (class_scope None: org admin, campus coordinator,
superadmin) for every entry. Every refusal must write nothing.
"""

from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import sis_supply_expense_service as svc
from tests.test_sis_teacher_portal import as_role


BASE = '/api/sis/teacher/classes'
ME = 'test-user-123'  # conftest.mock_verify_token


def _class_client(org='org-1'):
    q = Mock()
    for chained in ('table', 'select', 'eq', 'limit'):
        getattr(q, chained).return_value = q
    q.execute.return_value = Mock(data=[{'id': 'c1', 'organization_id': org}])
    return q


def _entry(created_by='t1', class_id='c1', org='org-1'):
    return {'id': 'x1', 'organization_id': org, 'class_id': class_id, 'amount_cents': 1250,
            'description': 'Clay', 'spent_on': '2026-10-01', 'created_by': created_by}


@contextmanager
def _world(office=False, scope=('c1',), class_org='org-1', entry=None):
    repo = Mock()
    repo.entry.return_value = entry
    repo.insert.side_effect = lambda row: {**row, 'id': 'new'}
    repo.update_entry.side_effect = lambda eid, fields: {**(entry or {}), **fields}
    repo.for_classes.return_value = [entry] if entry else []
    role = ('org_admin' if office else 'advisor')
    with as_role('org_managed', org_role=role, org_roles=[role],
                 scope=None if office else list(scope)), \
         patch('routes.sis.staff_portal.get_supabase_admin_client',
               return_value=_class_client(class_org)), \
         patch.object(svc, '_repo', return_value=repo):
        yield repo


def _wrote_nothing(repo):
    repo.insert.assert_not_called()
    repo.update_entry.assert_not_called()
    repo.delete_entry.assert_not_called()


# ── Pure rules ───────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestParseFields:
    def test_dollars_become_cents(self):
        fields, err = svc.parse_fields({'amount': '12.50', 'description': ' Clay ',
                                        'spent_on': '2026-10-01'})
        assert err is None
        assert fields == {'amount_cents': 1250, 'description': 'Clay', 'spent_on': '2026-10-01'}

    def test_date_defaults_to_today(self):
        fields, _ = svc.parse_fields({'amount': 5, 'description': 'Paper'})
        assert fields['spent_on']

    @pytest.mark.parametrize('body', [
        {'amount': 0, 'description': 'x'},
        {'amount': -3, 'description': 'x'},
        {'amount': 'abc', 'description': 'x'},
        {'amount': 5, 'description': '   '},
        {'amount': 5, 'description': 'x' * 201},
        {'amount': 5, 'description': 'x', 'spent_on': 'soon'},
        {'amount_cents': 1.5, 'description': 'x'},
    ])
    def test_refusals(self, body):
        fields, err = svc.parse_fields(body)
        assert fields is None and err

    def test_an_edit_changes_only_what_it_names(self):
        assert svc.parse_fields({'description': 'Glaze'}, partial=True) == ({'description': 'Glaze'}, None)

    def test_may_change(self):
        assert svc.may_change({'created_by': 't1'}, 't1', False)
        assert not svc.may_change({'created_by': 't2'}, 't1', False)
        assert svc.may_change({'created_by': 't2'}, 'office', True)


# ── Routes: refused, writing nothing ─────────────────────────────────────────

@pytest.mark.unit
class TestRefused:
    def test_another_class_teacher_may_not_add(self, client, auth_headers, mock_verify_token):
        with _world(scope=('c9',)) as repo:
            resp = client.post(f'{BASE}/c1/supply-expenses?organization_id=org-1',
                               headers=auth_headers, json={'amount': 5, 'description': 'Clay'})
        assert resp.status_code == 404
        _wrote_nothing(repo)

    def test_another_org_class_is_not_found(self, client, auth_headers, mock_verify_token):
        with _world(office=True, class_org='org-2') as repo:
            resp = client.post(f'{BASE}/c1/supply-expenses?organization_id=org-1',
                               headers=auth_headers, json={'amount': 5, 'description': 'Clay'})
        assert resp.status_code == 404
        _wrote_nothing(repo)

    def test_a_teacher_may_not_edit_someone_elses_entry(self, client, auth_headers, mock_verify_token):
        with _world(entry=_entry(created_by='someone-else')) as repo:
            resp = client.patch(f'{BASE}/c1/supply-expenses/x1?organization_id=org-1',
                                headers=auth_headers, json={'amount': 99})
        assert resp.status_code == 403
        _wrote_nothing(repo)

    def test_a_teacher_may_not_delete_someone_elses_entry(self, client, auth_headers, mock_verify_token):
        with _world(entry=_entry(created_by='someone-else')) as repo:
            resp = client.delete(f'{BASE}/c1/supply-expenses/x1?organization_id=org-1',
                                 headers=auth_headers)
        assert resp.status_code == 403
        _wrote_nothing(repo)

    def test_an_entry_of_another_class_is_not_found(self, client, auth_headers, mock_verify_token):
        with _world(office=True, entry=_entry(class_id='c9')) as repo:
            resp = client.delete(f'{BASE}/c1/supply-expenses/x1?organization_id=org-1',
                                 headers=auth_headers)
        assert resp.status_code == 404
        _wrote_nothing(repo)

    def test_an_entry_of_another_org_is_not_found(self, client, auth_headers, mock_verify_token):
        with _world(office=True, entry=_entry(org='org-2')) as repo:
            resp = client.patch(f'{BASE}/c1/supply-expenses/x1?organization_id=org-1',
                                headers=auth_headers, json={'amount': 1})
        assert resp.status_code == 404
        _wrote_nothing(repo)

    def test_a_bad_amount_writes_nothing(self, client, auth_headers, mock_verify_token):
        with _world() as repo:
            resp = client.post(f'{BASE}/c1/supply-expenses?organization_id=org-1',
                               headers=auth_headers, json={'amount': 0, 'description': 'Clay'})
        assert resp.status_code == 400
        _wrote_nothing(repo)

    def test_a_student_may_not_reach_it(self, client, auth_headers, mock_verify_token):
        with as_role('student'), patch.object(svc, '_repo') as repo:
            resp = client.post(f'{BASE}/c1/supply-expenses?organization_id=org-1',
                               headers=auth_headers, json={'amount': 5, 'description': 'Clay'})
        assert resp.status_code == 403
        repo.return_value.insert.assert_not_called()


# ── Routes: allowed ──────────────────────────────────────────────────────────

@pytest.mark.unit
class TestAllowed:
    def test_the_class_teacher_adds_one(self, client, auth_headers, mock_verify_token):
        with _world() as repo:
            resp = client.post(f'{BASE}/c1/supply-expenses?organization_id=org-1',
                               headers=auth_headers,
                               json={'amount': '12.50', 'description': 'Clay', 'spent_on': '2026-10-01'})
        assert resp.status_code == 201
        row = repo.insert.call_args[0][0]
        assert row['amount_cents'] == 1250
        assert row['class_id'] == 'c1' and row['organization_id'] == 'org-1'
        assert row['created_by'] == ME

    def test_a_teacher_edits_their_own(self, client, auth_headers, mock_verify_token):
        with _world(entry=_entry(created_by=ME)) as repo:
            resp = client.patch(f'{BASE}/c1/supply-expenses/x1?organization_id=org-1',
                                headers=auth_headers, json={'description': 'Glaze'})
        assert resp.status_code == 200
        assert repo.update_entry.call_args[0][1]['description'] == 'Glaze'

    def test_the_office_edits_and_deletes_anyones(self, client, auth_headers, mock_verify_token):
        with _world(office=True, entry=_entry(created_by='teacher')) as repo:
            r1 = client.patch(f'{BASE}/c1/supply-expenses/x1?organization_id=org-1',
                              headers=auth_headers, json={'amount': 3})
            r2 = client.delete(f'{BASE}/c1/supply-expenses/x1?organization_id=org-1',
                               headers=auth_headers)
        assert r1.status_code == 200 and r2.status_code == 200
        assert repo.update_entry.call_args[0][1]['amount_cents'] == 300
        repo.delete_entry.assert_called_once_with('x1')

    def test_the_list_says_which_lines_the_caller_may_change(self, client, auth_headers, mock_verify_token):
        with _world(entry=_entry(created_by='someone-else')):
            resp = client.get(f'{BASE}/c1/supply-expenses?organization_id=org-1',
                              headers=auth_headers)
        body = resp.get_json()
        assert resp.status_code == 200
        assert body['spent'] == 12.5
        assert body['expenses'][0]['can_edit'] is False
