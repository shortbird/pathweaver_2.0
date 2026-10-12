"""The People page's add wizard, at the seams it added to existing doors.

- A staff member can start as a coordinator or an admin, not only a teacher;
  a coordinator still cannot make an admin.
- The family record's "Add a parent" can skip the email and name the primary
  contact (the wizard's switches).
- The roster import answers at /api/sis/roster-import and nowhere else.
"""

from unittest.mock import Mock, patch

import pytest

ORG = 'org-1'


def _create_client(responses):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'update', 'delete', 'insert', 'in_'):
        getattr(table, chained).return_value = table
    table.execute.side_effect = [Mock(data=d) for d in responses] + [Mock(data=[])] * 10
    client.auth.admin.create_user.return_value = Mock(user=Mock(id='new-1'))
    return client, table


def _create_staff(fields, existing=()):
    from services import sis_service
    client, table = _create_client([list(existing), []])
    with patch('services.sis_service._admin', return_value=client), \
         patch('services.sis_service.find_placeholder_match') as match, \
         patch('services.sis_service.send_staff_invite', return_value=True):
        result = sis_service.create_org_teacher(ORG, {'email': 'sam@school.org', **fields},
                                                actor_id='admin-1')
    inserted = [c.args[0] for c in table.insert.call_args_list]
    return result, inserted, match


@pytest.mark.unit
class TestStaffRole:
    def test_a_teacher_by_default(self):
        result, inserted, _ = _create_staff({})
        assert result['teacher']['id'] == 'new-1'
        assert inserted[0]['org_role'] == 'advisor' and inserted[0]['org_roles'] == ['advisor']

    @pytest.mark.parametrize('role', ['campus_coordinator', 'org_admin'])
    def test_starts_in_the_chosen_role(self, role):
        _, inserted, _ = _create_staff({'org_role': role})
        assert inserted[0]['org_role'] == role and inserted[0]['org_roles'] == [role]

    def test_not_a_staff_role_is_refused(self):
        result, inserted, _ = _create_staff({'org_role': 'parent'})
        assert result == {'error': 'Not a staff role'}
        assert inserted == []

    def test_placeholder_matching_is_for_teachers_only(self):
        _, _, match = _create_staff({'org_role': 'org_admin', 'first_name': 'Sam',
                                     'last_name': 'Lee'})
        match.assert_not_called()

    def test_an_existing_account_cannot_be_made_an_admin_here(self):
        result, inserted, _ = _create_staff(
            {'org_role': 'org_admin'},
            existing=[{'id': 'u1', 'email': 'sam@school.org', 'organization_id': ORG}])
        assert 'change their role on their staff record' in result['error']
        assert inserted == []


@pytest.mark.unit
class TestStaffRoute:
    def test_a_coordinator_cannot_add_an_admin(self, app):
        from routes.sis import create_teacher
        inner = create_teacher
        while hasattr(inner, '__wrapped__'):
            inner = inner.__wrapped__
        with app.test_request_context('/api/sis/staff', method='POST',
                                      json={'email': 'a@b.org', 'org_role': 'org_admin'}), \
             patch('services.sis_service.org_or_error', return_value=(ORG, None)), \
             patch('services.sis_service.caller_may_grant', return_value=False) as grant, \
             patch('services.sis_service.create_org_teacher') as create:
            resp, status = inner('coord-1')
        assert status == 403
        grant.assert_called_once_with('coord-1', 'org_admin')
        create.assert_not_called()


@pytest.mark.unit
class TestGuardianSwitches:
    def _add(self, data):
        from services import family_guardian_service as svc
        households = Mock()
        households.find_by_id.return_value = {'id': 'hh-1', 'organization_id': ORG,
                                              'name': 'Watson Family'}
        users = Mock()
        users.find_by_email.return_value = None
        with patch('repositories.household_repository.HouseholdRepository',
                   return_value=households), \
             patch('repositories.user_repository.UserRepository', return_value=users), \
             patch.object(svc, '_admin', return_value=Mock()), \
             patch.object(svc, '_create_org_parent', return_value='mum-1'), \
             patch('services.sis_attach_service.attach_guardian', return_value=[{}]) as attach, \
             patch.object(svc, 'send_guardian_invite', return_value=True) as invite, \
             patch('services.sis_person_service.audit_removal'):
            result = svc.add_guardian_to_household(
                ORG, 'hh-1', 'admin-1',
                {'first_name': 'Shelby', 'last_name': 'Watson',
                 'email': 'shelby@example.com', **data})
        return result, attach, invite

    def test_emails_by_default_and_is_not_primary(self):
        result, attach, invite = self._add({})
        assert result['invite_sent'] is True and result['user_id'] == 'mum-1'
        invite.assert_called_once()
        assert attach.call_args.kwargs['primary'] is False

    def test_send_email_off_makes_the_account_quietly(self):
        result, _, invite = self._add({'send_email': False})
        assert result['invite_sent'] is False
        invite.assert_not_called()

    def test_is_primary(self):
        _, attach, _ = self._add({'is_primary': True})
        assert attach.call_args.kwargs['primary'] is True


@pytest.mark.unit
def test_roster_import_moved_to_the_sis_console(app):
    adapter = app.url_map.bind('localhost')
    for path in ('/api/sis/roster-import/preview', '/api/sis/roster-import/commit',
                 '/api/sis/families'):
        endpoint, _ = adapter.match(path, method='POST')
        assert endpoint.startswith('sis_people_add.'), (path, endpoint)
    from werkzeug.exceptions import NotFound
    with pytest.raises(NotFound):
        adapter.match('/api/admin/roster-import/preview', method='POST')
