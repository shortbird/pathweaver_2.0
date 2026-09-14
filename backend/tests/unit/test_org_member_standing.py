"""Guard tests for POST /api/admin/organizations/<org>/users/<id>/standing.

"Withdraw from school" for schools without the SIS console (2026-09-14). The
route must refuse: cross-org callers, targets outside the named org,
superadmins, self, and a status it does not know. The write itself is
sis_person_service.set_student_standing, tested below on its own.
"""

from unittest.mock import Mock, patch

import pytest
from flask import Flask

from services import sis_person_service as people

ADMIN_ID = 'admin-1'
TARGET_ID = 'target-1'
ORG = 'org-1'


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    return app


def _mock_supabase(target_row):
    supabase = Mock()
    maybe = supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value
    maybe.execute.return_value = Mock(data=target_row)
    return supabase


def _call(app, target_row, *, body=None, caller_org=ORG, is_superadmin=False,
          org_id=ORG, target_id=TARGET_ID, service_result=None):
    from routes.admin.org_member_standing import set_member_standing

    supabase = _mock_supabase(target_row)
    service = Mock(return_value=service_result or {'withdrawn': True, 'name': 'A Student', 'seats_released': 1})
    with app.test_request_context(json=body or {'status': 'withdrawn'}), \
         patch('routes.admin.org_member_standing.get_supabase_admin_client', return_value=supabase), \
         patch('routes.admin.org_member_standing.sis_person_service.set_student_standing', service):
        view = set_member_standing
        while hasattr(view, '__wrapped__'):
            view = view.__wrapped__
        result = view(ADMIN_ID, caller_org, is_superadmin, org_id, target_id)
    return result, service


def _student(org=ORG):
    return {'role': 'org_managed', 'organization_id': org}


def test_withdraws_a_student_in_own_org(app):
    (body, code), service = _call(app, _student())
    assert code == 200
    assert body.get_json()['withdrawn'] is True
    service.assert_called_once_with(ORG, TARGET_ID, withdrawn=True)


def test_reinstates_with_the_other_status(app):
    (body, code), service = _call(app, _student(), body={'status': 'enrolled'},
                                  service_result={'withdrawn': False, 'name': 'A Student'})
    assert code == 200
    service.assert_called_once_with(ORG, TARGET_ID, withdrawn=False)


def test_refuses_an_unknown_status(app):
    (_, code), service = _call(app, _student(), body={'status': 'gone'})
    assert code == 400
    service.assert_not_called()


def test_refuses_cross_org_caller(app):
    (_, code), service = _call(app, _student(), caller_org='other-org')
    assert code == 403
    service.assert_not_called()


def test_refuses_target_outside_named_org(app):
    (_, code), service = _call(app, _student(org='other-org'))
    assert code == 404
    service.assert_not_called()


def test_refuses_superadmin_target(app):
    (_, code), service = _call(app, {'role': 'superadmin', 'organization_id': ORG})
    assert code == 403
    service.assert_not_called()


def test_refuses_self(app):
    (_, code), service = _call(app, _student(), target_id=ADMIN_ID)
    assert code == 400
    service.assert_not_called()


def test_a_parent_is_refused_by_the_service_and_reads_as_400(app):
    (body, code), _ = _call(app, _student(),
                            service_result={'error': 'Only a student can be withdrawn.'})
    assert code == 400
    assert 'student' in body.get_json()['error']


USERS = {
    's1': {'id': 's1', 'first_name': 'Sam', 'last_name': 'Student', 'role': 'org_managed',
           'org_role': 'student', 'org_roles': None, 'organization_id': ORG},
    'p1': {'id': 'p1', 'first_name': 'Penny', 'last_name': 'Parent', 'role': 'org_managed',
           'org_role': 'parent', 'org_roles': None, 'organization_id': ORG},
}


@pytest.mark.unit
class TestSetStudentStanding:
    def test_withdrawing_archives_the_student_the_way_the_roster_does(self):
        archive = Mock(return_value={'archived': True, 'seats_released': 2})
        with patch('services.sis_person_service._user', side_effect=lambda org, uid: USERS.get(uid)), \
             patch('services.sis_person_service._archive', archive):
            result = people.set_student_standing(ORG, 's1', withdrawn=True)
        archive.assert_called_once_with(ORG, 's1', 'Sam Student', student=True)
        assert result == {'withdrawn': True, 'name': 'Sam Student', 'seats_released': 2}

    def test_reinstating_writes_enrolled_and_takes_no_seats(self):
        admin = Mock()
        with patch('services.sis_person_service._user', side_effect=lambda org, uid: USERS.get(uid)), \
             patch('services.sis_person_service._admin', return_value=admin), \
             patch('services.sis_person_service._archive') as archive:
            result = people.set_student_standing(ORG, 's1', withdrawn=False)
        archive.assert_not_called()
        payload = admin.table.return_value.upsert.call_args.args[0]
        assert payload['status'] == 'enrolled'
        assert payload['student_user_id'] == 's1'
        assert result == {'withdrawn': False, 'name': 'Sam Student'}

    def test_a_parent_cannot_be_withdrawn(self):
        with patch('services.sis_person_service._user', side_effect=lambda org, uid: USERS.get(uid)):
            result = people.set_student_standing(ORG, 'p1', withdrawn=True)
        assert 'Only a student' in result['error']

    def test_someone_outside_the_org_is_not_found(self):
        with patch('services.sis_person_service._user', return_value=None):
            assert 'not found' in people.set_student_standing(ORG, 'zz', withdrawn=True)['error']
