"""A school asks an existing Optio account to join (ticket af8469aa).

Mandie at Apogee Cache Valley hit "already has an account" three times in
three days and emailed support each time: the SIS refused an email with a
platform account and pointed at "the school's connect flow", which did not
exist for a school admin. Now the add doors offer "Ask to connect", and the
account's owner (or a minor student's parent) accepts before anything is
attached. These check:

  - asking writes a request and attaches nothing;
  - accepting attaches with the role the school asked for, through the same
    function the superadmin's add path uses;
  - only the account the request names (or its parent) can accept;
  - an account at another school is refused, without naming the school;
  - only the front office can ask, so the email check does not leak.
"""

from unittest.mock import Mock, patch

import pytest

ORG = 'org-1'
TEEN = {'id': 'teen-1', 'email': 'teen@example.com', 'role': 'student', 'org_role': None,
        'org_roles': None, 'organization_id': None, 'first_name': 'Tess', 'last_name': 'Downs',
        'display_name': None, 'date_of_birth': '2011-03-01', 'is_dependent': False,
        'managed_by_parent_id': None}
MUM = {**TEEN, 'id': 'mum-1', 'email': 'mum@example.com', 'role': 'parent', 'first_name': 'Dana',
       'date_of_birth': None}


def _repo(user=None, parents=(), invitation=None, claim=True):
    repo = Mock()
    repo.client = Mock()
    repo.by_email.return_value = user
    repo.user.side_effect = lambda uid, cols: ({**user, 'id': uid} if user and uid == user['id']
                                               else None)
    repo.users.return_value = [{'id': p, 'email': f'{p}@example.com', 'first_name': 'P'}
                               for p in ([user['id']] if user else []) + list(parents)]
    repo.approved_parent_ids.return_value = list(parents)
    repo.pending_invitations_for.return_value = []
    repo.insert_invitation.side_effect = lambda row: {'id': 'inv-1', **row}
    repo.org.return_value = {'id': ORG, 'name': 'Apogee Cache Valley', 'slug': 'apogee-cv'}
    repo.invitation_by_code.return_value = invitation
    repo.set_invitation_status.return_value = claim
    return repo


def _svc(repo):
    from services import org_membership_service as svc
    return patch.multiple(svc, _repo=Mock(return_value=repo))


@pytest.fixture
def mail():
    with patch('services.email_service.email_service') as email, \
         patch('services.notification_service.NotificationService') as ns:
        email.send_templated_email.return_value = True
        yield email, ns.return_value


@pytest.mark.unit
class TestAsking:
    def test_a_request_is_written_and_nothing_is_attached(self, mail):
        from services import org_membership_service as svc
        email, notices = mail
        repo = _repo(user={**TEEN, 'date_of_birth': '1990-01-01'})
        with _svc(repo):
            out = svc.create_request(ORG, 'admin-1', 'Teen@Example.com', 'student')
        assert out['sent_to'] == 'owner'
        row = repo.insert_invitation.call_args.args[0]
        assert row['organization_id'] == ORG and row['role'] == 'student'
        assert row['status'] == 'pending' and row['email'] == 'teen@example.com'
        assert row['metadata'] == {'invitation_type': 'connect', 'target_user_id': 'teen-1',
                                   'approver_user_ids': ['teen-1'], 'household_id': None}
        repo.update_user.assert_not_called()
        assert email.send_templated_email.call_args.kwargs['template_name'] == 'org_connect_request'
        assert notices.create_notification.call_args.kwargs['user_id'] == 'teen-1'

    def test_a_minor_with_a_parent_is_the_parents_to_decide(self, mail):
        from services import org_membership_service as svc
        email, notices = mail
        repo = _repo(user=TEEN, parents=['mum-1'])
        with _svc(repo):
            out = svc.create_request(ORG, 'admin-1', 'teen@example.com', 'student', household_id=None)
        assert out['sent_to'] == 'parent'
        assert repo.insert_invitation.call_args.args[0]['metadata']['approver_user_ids'] == ['mum-1']
        assert [c.kwargs['to_email'] for c in email.send_templated_email.call_args_list] == \
            ['mum-1@example.com']
        assert [c.kwargs['user_id'] for c in notices.create_notification.call_args_list] == ['mum-1']

    def test_an_account_at_another_school_is_refused_without_naming_it(self, mail):
        from services import org_membership_service as svc
        repo = _repo(user={**TEEN, 'organization_id': 'org-2'})
        with _svc(repo), pytest.raises(svc.ConnectRequestError) as err:
            svc.create_request(ORG, 'admin-1', 'teen@example.com', 'student')
        assert err.value.status == 409 and err.value.code == 'other_school'
        assert 'another school' in str(err.value)
        repo.insert_invitation.assert_not_called()

    def test_a_parent_cannot_be_asked_to_join_as_a_student(self, mail):
        from services import org_membership_service as svc
        repo = _repo(user=MUM)
        with _svc(repo), pytest.raises(svc.ConnectRequestError) as err:
            svc.create_request(ORG, 'admin-1', 'mum@example.com', 'student')
        assert err.value.code == 'role_mismatch'
        repo.insert_invitation.assert_not_called()

    def test_admin_is_not_a_connectable_role(self, mail):
        from services import org_membership_service as svc
        with _svc(_repo(user=MUM)), pytest.raises(svc.ConnectRequestError):
            svc.create_request(ORG, 'admin-1', 'mum@example.com', 'org_admin')


def _invitation(**over):
    inv = {'id': 'inv-1', 'organization_id': ORG, 'role': 'student', 'status': 'pending',
           'invited_by': 'admin-1', 'expires_at': '2999-01-01T00:00:00+00:00',
           'metadata': {'invitation_type': 'connect', 'target_user_id': 'teen-1',
                        'approver_user_ids': ['mum-1'], 'household_id': 'hh-1'}}
    inv.update(over)
    return inv


@pytest.mark.unit
class TestAccepting:
    def _accept(self, user_id, repo):
        from services import org_membership_service as svc
        with _svc(repo), \
             patch.object(svc, 'attach_account_to_org', return_value=None) as attach, \
             patch('services.sis_attach_service.attach_student') as family, \
             patch.object(svc, '_notice'):
            out = svc.accept('code-1', user_id)
        return out, attach, family

    def test_the_parent_accepts_and_the_teen_joins_with_the_asked_role(self):
        repo = _repo(user=TEEN, invitation=_invitation())
        out, attach, family = self._accept('mum-1', repo)
        assert out['status'] == 'accepted'
        attach.assert_called_once_with('teen-1', ORG, 'student', keep_platform_role=False,
                                       allow_move=False, client=repo.client)
        assert family.call_args.args[:3] == (ORG, 'teen-1', 'hh-1')
        assert repo.set_invitation_status.call_args.kwargs == {'only_if_status': 'pending'}

    def test_someone_else_cannot_accept(self):
        from services import org_membership_service as svc
        repo = _repo(user=TEEN, invitation=_invitation())
        for wrong in ('teen-1', 'stranger-1'):  # the teen too: their parent decides
            with pytest.raises(svc.ConnectRequestError) as err:
                self._accept(wrong, repo)
            assert err.value.status == 403
        repo.set_invitation_status.assert_not_called()

    def test_an_account_that_joined_another_school_meanwhile_is_refused(self):
        from services import org_membership_service as svc
        repo = _repo(user={**TEEN, 'organization_id': 'org-2'}, invitation=_invitation())
        with pytest.raises(svc.ConnectRequestError) as err:
            self._accept('mum-1', repo)
        assert err.value.code == 'other_school'
        repo.set_invitation_status.assert_not_called()

    def test_a_used_request_cannot_be_accepted_twice(self):
        from services import org_membership_service as svc
        repo = _repo(user=TEEN, invitation=_invitation(), claim=False)
        with pytest.raises(svc.ConnectRequestError):
            out, attach, _ = self._accept('mum-1', repo)

    def test_an_email_invitation_code_is_not_a_connect_request(self):
        from services import org_membership_service as svc
        repo = _repo(user=TEEN, invitation=_invitation(metadata={}))
        with pytest.raises(svc.ConnectRequestError) as err:
            self._accept('mum-1', repo)
        assert err.value.status == 404


@pytest.mark.unit
class TestTheSharedAttach:
    """attach_account_to_org is the superadmin add path's write, lifted out
    so the connect request uses the same one."""

    def _attach(self, user, **kw):
        from services import org_membership_service as svc
        repo = _repo(user=user)
        with _svc(repo):
            why = svc.attach_account_to_org(user['id'], ORG, kw.pop('role', 'student'), **kw)
        return why, repo

    def test_connect_uses_the_asked_role(self):
        why, repo = self._attach(MUM, role='advisor', keep_platform_role=False, allow_move=False)
        assert why is None
        repo.update_user.assert_called_once_with('mum-1', {
            'organization_id': ORG, 'role': 'org_managed', 'org_role': 'advisor', 'org_roles': ['advisor']})

    def test_the_superadmin_path_keeps_the_platform_role(self):
        why, repo = self._attach(MUM, role='student', keep_platform_role=True, allow_move=True)
        assert why is None
        assert repo.update_user.call_args.args[1]['org_role'] == 'parent'

    def test_another_school_is_refused_unless_moving_is_allowed(self):
        why, repo = self._attach({**MUM, 'organization_id': 'org-2', 'role': 'org_managed'},
                                 keep_platform_role=False, allow_move=False)
        assert why == 'other_org'
        repo.update_user.assert_not_called()

    def test_a_superadmin_is_never_absorbed(self):
        why, repo = self._attach({**MUM, 'role': 'superadmin'}, keep_platform_role=True, allow_move=True)
        assert why == 'superadmin'
        repo.update_user.assert_not_called()

    def test_the_add_route_calls_it(self, client, auth_headers, mock_verify_token):
        caller = Mock()
        table = Mock()
        for chained in ('select', 'eq', 'limit', 'single', 'in_'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data={'id': 'sa', 'role': 'superadmin', 'org_role': None,
                                                'org_roles': None, 'organization_id': None,
                                                'is_org_admin': False, 'email': 'sa@optio.test'})
        caller.table.return_value = table
        with patch('database.get_supabase_admin_client', return_value=caller), \
             patch('routes.admin.organization_users.get_supabase_admin_client', return_value=caller), \
             patch('services.org_membership_service.attach_account_to_org',
                   side_effect=[None, 'other_org']) as attach:
            resp = client.post(f'/api/admin/organizations/{ORG}/users/add', headers=auth_headers,
                               json={'user_ids': ['u1', 'u2'], 'org_role': 'parent'})
        assert resp.status_code == 200
        assert resp.get_json()['users_added'] == 1 and resp.get_json()['skipped'] == 1
        assert attach.call_args_list[0].kwargs == {'keep_platform_role': True, 'allow_move': True,
                                                   'client': caller}


@pytest.mark.unit
class TestTheAddDoors:
    def test_the_family_form_offers_to_connect_a_platform_parent(self):
        from services import sis_family_create_service as fam
        users = Mock()
        users.find_by_email.return_value = MUM
        with patch('repositories.user_repository.UserRepository', return_value=users), \
             patch.object(fam, '_admin', return_value=Mock()), \
             patch('services.org_membership_service.classify_email',
                   return_value={'state': 'connectable', 'user': MUM}):
            out = fam.validate(ORG, {'guardians': [{'first_name': 'Dana', 'last_name': 'Downs',
                                                    'email': 'mum@example.com'}]})
        assert out['status'] == 409 and out['code'] == 'connectable'
        assert out['connect'] == {'email': 'mum@example.com', 'role': 'parent', 'household_id': None}
        assert 'support@' not in out['error']

    def test_the_family_record_offers_to_connect_a_platform_teen(self):
        from services import family_student_service as fss
        households = Mock()
        households.find_by_id.return_value = {'id': 'hh-1', 'organization_id': ORG}
        households.members_for_households.return_value = [{'user_id': 'mum-1', 'relationship': 'guardian'}]
        with patch('repositories.household_repository.HouseholdRepository', return_value=households), \
             patch.object(fss, '_admin', return_value=Mock()), \
             patch('services.sis_service.find_household_duplicates', return_value=[]), \
             patch('services.org_membership_service.classify_email',
                   return_value={'state': 'connectable', 'user': TEEN}), \
             patch.object(fss, 'create_child') as create:
            out = fss.add_child_to_household(ORG, 'hh-1', 'admin-1', {
                'first_name': 'Tess', 'last_name': 'Downs', 'date_of_birth': '2011-03-01',
                'email': 'teen@example.com'})
        assert out['code'] == 'connectable' and out['connect']['household_id'] == 'hh-1'
        create.assert_not_called()


# ── Routes ──────────────────────────────────────────────────────────────────

def _caller(row):
    client = Mock()
    table = Mock()
    for chained in ('select', 'eq', 'limit', 'single', 'in_'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[row])
    client.table.return_value = table
    return client


@pytest.mark.unit
class TestRoutes:
    def _ask(self, client, auth_headers, org_role):
        row = {'id': 'test-user-123', 'role': 'org_managed', 'org_role': org_role,
               'org_roles': [org_role], 'organization_id': ORG}
        with patch('database.get_supabase_admin_client', return_value=_caller(row)), \
             patch('modules.gate.check_module', return_value=None), \
             patch('services.sis_service.org_or_error', return_value=(ORG, None)), \
             patch('services.org_membership_service.classify_email') as classify, \
             patch('services.org_membership_service.create_request',
                   return_value={'request_id': 'inv-1', 'sent_to': 'owner', 'email_sent': True}) as create:
            resp = client.post('/api/sis/connect-requests', headers=auth_headers,
                               json={'email': 'teen@example.com', 'role': 'student'})
        return resp, create, classify

    @pytest.mark.parametrize('org_role', ['student', 'parent', 'advisor', 'observer'])
    def test_only_the_front_office_can_ask_so_the_email_check_does_not_leak(
            self, client, auth_headers, mock_verify_token, org_role):
        resp, create, classify = self._ask(client, auth_headers, org_role)
        assert resp.status_code == 403
        create.assert_not_called()
        classify.assert_not_called()

    @pytest.mark.parametrize('org_role', ['org_admin', 'campus_coordinator'])
    def test_the_front_office_can_ask(self, client, auth_headers, mock_verify_token, org_role):
        resp, create, _ = self._ask(client, auth_headers, org_role)
        assert resp.status_code == 201
        assert create.call_args.args[:4] == (ORG, 'test-user-123', 'teen@example.com', 'student')

    def test_accepting_needs_a_signed_in_account(self, client):
        resp = client.post('/api/connect-requests/code-1/accept', json={})
        assert resp.status_code == 401

    def test_accepting_passes_the_signed_in_account(self, client, auth_headers, mock_verify_token):
        with patch('services.org_membership_service.accept',
                   return_value={'status': 'accepted', 'org_name': 'X', 'role': 'student', 'self': True}) as acc:
            resp = client.post('/api/connect-requests/code-1/accept', headers=auth_headers)
        assert resp.status_code == 200
        acc.assert_called_once_with('code-1', 'test-user-123')

    def test_the_password_accept_door_refuses_a_connect_request(self, client):
        """Otherwise a teen could accept with their own password and skip the
        parent the request was sent to."""
        db = Mock()
        db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value \
            .execute.return_value = Mock(data=_invitation())
        with patch('routes.admin.user_invitations.get_supabase_admin_client', return_value=db):
            resp = client.post('/api/admin/organizations/invitations/accept/code-1',
                               json={'email': 'teen@example.com', 'password': 'whatever1'})
        assert resp.status_code == 400
        db.table.return_value.update.assert_not_called()

    def test_one_owner_per_route(self, app):
        adapter = app.url_map.bind('localhost')
        for url, owner in (('/api/sis/connect-requests', 'sis_people_add.'),
                           ('/api/connect-requests/c/accept', 'org_connect_requests.'),
                           ('/api/connect-requests/c/decline', 'org_connect_requests.')):
            endpoint, _ = adapter.match(url, method='POST')
            assert endpoint.startswith(owner), (url, endpoint)


@pytest.mark.unit
def test_a_connect_request_cannot_be_resent(app):
    """Resend sends the generic invitation mail to the invitation's own
    address, which for a minor is the teen, not the parent the request went
    to (ticket af8469aa). It is refused; the school sends a new request."""
    import inspect
    from routes.admin.user_invitations import resend_invitation
    db = Mock()
    q = db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value
    q.execute.return_value = Mock(data=_invitation())
    with app.test_request_context(json={}), \
         patch('routes.admin.user_invitations.get_supabase_admin_client', return_value=db), \
         patch('services.email_service.email_service') as email:
        resp, status = inspect.unwrap(resend_invitation)('admin-1', ORG, False, ORG, 'inv-1')
    assert status == 400
    assert 'cannot be resent' in resp.get_json()['error']
    db.table.return_value.update.assert_not_called()
    email.send_templated_email.assert_not_called()
