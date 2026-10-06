"""Getting a student or parent their setup email again (2026-10-06).

Apogee Central Florida imported 60 students with school email and asked how
to get them signed in. Two doors were shut:

- An account that exists but was never used (an import, "Add a child", "Add a
  parent") had no Resend on its People row; only staff did.
- An "Invite by email" that was never accepted could not be sent again: a
  second invite answered 409 "A pending invitation already exists" for seven
  days.
"""

import inspect
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from services import sis_service

ORG = 'org-1'


def _admin_returning(user_row, last_sign_in_at=None):
    admin = MagicMock()
    q = admin.table.return_value
    for name in ('select', 'eq', 'limit'):
        getattr(q, name).return_value = q
    q.execute.return_value = MagicMock(data=[user_row] if user_row else [])
    admin.auth.admin.get_user_by_id.return_value = SimpleNamespace(
        user=SimpleNamespace(last_sign_in_at=last_sign_in_at))
    return admin


def _resend(user_row, last_sign_in_at=None, sent=True):
    admin = _admin_returning(user_row, last_sign_in_at)
    with patch.object(sis_service, '_admin', return_value=admin), \
         patch.object(sis_service, '_org_name', return_value='Apogee'), \
         patch('services.roster_import_service._send_invite', return_value=sent) as send:
        return sis_service.resend_member_invite(ORG, 'p1'), send


STUDENT = {'id': 'p1', 'email': 'silas@school.org', 'first_name': 'Silas',
           'organization_id': ORG, 'org_role': 'student', 'org_roles': ['student'],
           'last_active': None}
PARENT = {**STUDENT, 'email': 'mom@x.com', 'org_role': 'parent', 'org_roles': ['parent']}


@pytest.mark.unit
class TestResendMemberInvite:
    def test_a_student_who_never_signed_in_gets_the_student_setup_email(self):
        out, send = _resend(STUDENT)
        assert out == {'email': 'silas@school.org', 'email_sent': True}
        args, kwargs = send.call_args
        assert args[1:5] == ('p1', 'silas@school.org', 'Silas', 'Apogee')
        assert kwargs['is_parent'] is False

    def test_a_parent_gets_the_parent_email(self):
        out, send = _resend(PARENT)
        assert out['email_sent'] is True
        assert send.call_args.kwargs['is_parent'] is True

    def test_refused_once_they_have_signed_in(self):
        out, send = _resend(STUDENT, last_sign_in_at='2026-10-06T10:00:00Z')
        assert 'already set up' in out['error']
        send.assert_not_called()

    def test_refused_once_active_even_without_an_auth_sign_in(self):
        out, send = _resend({**STUDENT, 'last_active': '2026-10-06T10:00:00Z'})
        assert 'already set up' in out['error']
        send.assert_not_called()

    def test_a_username_student_is_told_to_reset_the_password(self):
        out, send = _resend({**STUDENT, 'email': None})
        assert 'no email' in out['error']
        send.assert_not_called()

    def test_another_schools_person_is_not_found(self):
        out, send = _resend({**STUDENT, 'organization_id': 'org-2'})
        assert out == {'error': 'Person not found'}
        send.assert_not_called()

    def test_staff_go_through_the_staff_invite(self):
        with patch.object(sis_service, 'resend_staff_invite', return_value={'email_sent': True}) as staff:
            out, send = _resend({**STUDENT, 'org_role': 'advisor', 'org_roles': ['advisor']})
        staff.assert_called_once_with(ORG, 'p1')
        send.assert_not_called()

    def test_a_failed_send_says_so(self):
        out, _ = _resend(STUDENT, sent=False)
        assert 'could not be sent' in out['error']


@pytest.mark.unit
class TestSetupPendingFlag:
    def test_real_email_never_active_is_pending(self):
        assert sis_service.is_setup_pending({'email': 'a@b.org', 'last_active': None})

    def test_active_is_not(self):
        assert not sis_service.is_setup_pending({'email': 'a@b.org', 'last_active': '2026-10-01'})

    def test_no_email_or_a_placeholder_is_not(self):
        assert not sis_service.is_setup_pending({'email': None})
        assert not sis_service.is_setup_pending(
            {'email': 'orgstudent_ab@optio-internal-placeholder.local'})


@pytest.mark.unit
def test_route_answers_400_with_the_services_reason():
    from routes import sis as route
    handler = inspect.unwrap(route.resend_member_invite)
    app = Flask(__name__)
    with app.test_request_context(json={}), \
         patch.object(route.sis_service, 'org_or_error', return_value=(ORG, None)), \
         patch.object(route.sis_service, 'resend_member_invite',
                      return_value={'error': 'Person not found'}):
        resp, status = handler('admin-1', 'p1')
    assert status == 400 and resp.get_json()['error'] == 'Person not found'


# ── "Invite by email" a second time ───────────────────────────────────────────

class _FakeDb:
    """org_invitations / users / organizations, enough for create_invitation."""

    def __init__(self, pending):
        self.pending = pending
        self.updates, self.inserts = [], []

    def table(self, name):
        db = self
        q = MagicMock()
        state = {'op': 'select'}
        for chained in ('select', 'eq', 'single'):
            getattr(q, chained).side_effect = lambda *a, **k: q

        def update(payload):
            state['op'] = 'update'
            db.updates.append((name, payload))
            return q

        def insert(payload):
            state['op'] = 'insert'
            db.inserts.append((name, payload))
            return q

        def execute():
            if state['op'] == 'insert':
                return MagicMock(data=[{**db.inserts[-1][1], 'id': 'new-inv'}])
            if name == 'users':
                return MagicMock(data=[])
            if name == 'org_invitations':
                return MagicMock(data=db.pending)
            if name == 'organizations':
                return MagicMock(data={'name': 'Apogee', 'slug': 'apogee'})
            return MagicMock(data=None)
        q.update.side_effect = update
        q.insert.side_effect = insert
        q.execute.side_effect = execute
        return q


@pytest.mark.unit
def test_inviting_an_email_with_a_live_pending_invite_sends_a_fresh_one():
    from routes.admin import user_invitations as route
    handler = inspect.unwrap(route.create_invitation)
    db = _FakeDb(pending=[{'id': 'old-inv', 'status': 'pending',
                           'expires_at': '2099-01-01T00:00:00+00:00'}])
    app = Flask(__name__)
    with app.test_request_context(json={'email': 'kid@school.org', 'role': 'student'}), \
         patch.object(route, 'get_supabase_admin_client', return_value=db), \
         patch('services.sis_service.caller_may_grant', return_value=True), \
         patch('services.email_service.EmailService') as mail:
        mail.return_value.send_templated_email.return_value = True
        resp, status = handler('admin-1', ORG, False, ORG)
    body = resp.get_json()
    assert status == 201, body
    assert body['replaced'] is True and body['email_sent'] is True
    assert ('org_invitations', {'status': 'expired'}) in db.updates
    inserted = [p for n, p in db.inserts if n == 'org_invitations']
    assert inserted and inserted[0]['email'] == 'kid@school.org'
    mail.return_value.send_templated_email.assert_called_once()
