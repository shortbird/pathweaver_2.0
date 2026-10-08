"""
Email lists at /admin/crm/lists: the directory the page filters, and the
saved lists. The page copies addresses for Gmail BCC; nothing here sends.
"""
from unittest.mock import patch

import pytest

from services.crm_email_lists import build_directory, clean_list_payload
from tests.crm_fakes import make_world

ADMIN = 'admin-1'


def _users():
    return [
        {'id': 'p1', 'email': 'pat@gmail.com', 'first_name': 'Pat', 'last_name': 'Lee',
         'role': 'org_managed', 'org_roles': ['parent', 'org_admin'], 'is_org_admin': True,
         'organization_id': 'org-a', 'deletion_status': 'none'},
        {'id': 'p2', 'email': 'hh@gmail.com', 'first_name': 'Hana', 'last_name': 'Ho',
         'role': 'org_managed', 'org_role': 'parent', 'organization_id': 'org-a'},
        {'id': 'k1', 'email': None, 'first_name': 'Kid', 'last_name': 'Lee',
         'role': 'org_managed', 'org_role': 'student', 'organization_id': 'org-a'},
        {'id': 'k2', 'email': 'kim@gmail.com', 'first_name': 'Kim', 'last_name': 'Ho',
         'role': 'org_managed', 'org_role': 'student', 'organization_id': 'org-a'},
        {'id': 'x1', 'email': 'Gone@gmail.com', 'first_name': 'Gone', 'role': 'parent',
         'organization_id': None, 'deletion_status': 'pending'},
    ]


@pytest.mark.unit
class TestDirectory:
    def test_guardians_carry_their_childrens_classes(self):
        people = build_directory(
            _users(),
            classes_by_student={'k1': {'robotics'}, 'k2': {'art'}},
            guardians={'k1': {'p1'}, 'k2': {'p2'}},
            suppressed={'gone@gmail.com'},
        )
        by_id = {p['id']: p for p in people}
        # No email, no row: a dependent cannot be on a BCC list.
        assert 'k1' not in by_id
        assert by_id['p1']['child_class_ids'] == ['robotics']
        assert by_id['p1']['children'] == ['Kid Lee']
        assert by_id['p2']['child_class_ids'] == ['art']
        assert by_id['k2']['class_ids'] == ['art']
        assert by_id['x1']['suppressed'] is True
        assert by_id['x1']['deleting'] is True

    def test_org_admin_flag_and_every_org_role_count(self):
        people = build_directory(_users(), {}, {}, set())
        pat = next(p for p in people if p['id'] == 'p1')
        assert pat['roles'] == ['org_admin', 'parent']
        hana = next(p for p in people if p['id'] == 'p2')
        assert hana['roles'] == ['parent']


@pytest.mark.unit
class TestListPayload:
    def test_name_is_required(self):
        with pytest.raises(ValueError):
            clean_list_payload({'name': '  '})

    def test_ids_deduplicated_and_validated(self):
        out = clean_list_payload({'name': 'Robotics parents', 'include_ids': ['b', 'a', 'b']})
        assert out['include_ids'] == ['a', 'b']
        assert out['exclude_ids'] == []
        with pytest.raises(ValueError):
            clean_list_payload({'name': 'x', 'exclude_ids': 'abc'})

    def test_partial_update_touches_only_what_was_sent(self):
        assert clean_list_payload({'exclude_ids': ['u1']}, partial=True) == {'exclude_ids': ['u1']}


def _call(app, view, *args, json=None, method='GET'):
    from routes.admin import crm_lists
    with app.test_request_context(json=json, method=method):
        resp = getattr(crm_lists, view).__wrapped__(ADMIN, *args)
    if isinstance(resp, tuple):
        body = resp[0].get_json() if hasattr(resp[0], 'get_json') else None
        return body, resp[1]
    return resp.get_json(), 200


@pytest.fixture
def world():
    w = make_world()
    w.data['crm_email_lists'] = []
    with patch('routes.admin.crm_lists._db', return_value=w), \
         patch('routes.admin.crm_lists._audit'):
        yield w


@pytest.mark.unit
class TestSavedLists:
    def test_save_rename_and_delete(self, app, world):
        body, status = _call(app, 'create_list', method='POST', json={
            'name': 'Academy parents', 'filters': {'roles': ['parent'], 'org_ids': ['org-a']},
            'exclude_ids': ['p9']})
        assert status == 201
        saved = body['list']
        assert saved['created_by'] == ADMIN
        assert saved['filters'] == {'roles': ['parent'], 'org_ids': ['org-a']}

        body, status = _call(app, 'update_list', saved['id'], method='PUT',
                             json={'name': 'Academy parents, fall'})
        assert status == 200
        assert body['list']['name'] == 'Academy parents, fall'
        assert body['list']['exclude_ids'] == ['p9']

        body, _ = _call(app, 'list_lists')
        assert [l['name'] for l in body['lists']] == ['Academy parents, fall']

        _, status = _call(app, 'delete_list', saved['id'], method='DELETE')
        assert status == 204
        assert world.data['crm_email_lists'] == []

    def test_unnamed_list_is_refused(self, app, world):
        _, status = _call(app, 'create_list', method='POST', json={'name': ''})
        assert status == 400
        assert world.data['crm_email_lists'] == []

    def test_updating_a_missing_list_is_a_404(self, app, world):
        _, status = _call(app, 'update_list', 'nope', method='PUT', json={'name': 'x'})
        assert status == 404
