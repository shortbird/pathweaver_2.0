"""SIS family and student messages go out from the school-inbox account.

The People page's "Message family" and "Message student" buttons used to send
from a SECOND school account -- school-<org_id>@optio-internal-placeholder.local,
minted by sis_service._org_messaging_sender. The School Inbox in the SIS console
lists threads for organizations.inbox_user_id, a different account, so every
reply a parent wrote to one of those messages landed somewhere no page opens and
nobody is notified about. The office saw silence; the family saw no answer.

These tests pin the identity: the sender is the inbox account, the staff member
is recorded in sent_by_user_id, and no second account is ever minted.
"""

import inspect
from unittest.mock import Mock, patch

import pytest

from services import sis_service

ORG = 'org-1'
INBOX = 'inbox-user-1'
STAFF = 'kate-1'
GUARDIAN_A = 'guardian-a'
GUARDIAN_B = 'guardian-b'
STUDENT = 'student-1'


def _household_client(members):
    """An admin double whose household_members read returns `members`."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'insert', 'update', 'delete', 'in_'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=members)
    return client


@pytest.fixture
def sent():
    """Patches DirectMessageService and collects every send_message call."""
    calls = []

    def _send(sender_id, recipient_id, content, **kwargs):
        calls.append({'sender_id': sender_id, 'recipient_id': recipient_id,
                      'content': content, **kwargs})
        return {'conversation_id': f'conv-{recipient_id}'}

    svc = Mock()
    svc.send_message.side_effect = _send
    with patch('services.direct_message_service.DirectMessageService',
               return_value=svc):
        yield calls


def _with_inbox(inbox_id=INBOX):
    """Patch the school-inbox resolution to yield `inbox_id` (None = failure)."""
    org = {'id': ORG, 'name': 'iCreate', 'is_active': True,
           'inbox_user_id': inbox_id}
    return (
        patch('services.school_inbox_service.get_org', return_value=org),
        patch('services.school_inbox_service.get_or_create_inbox_user',
              return_value=inbox_id),
    )


@pytest.mark.unit
class TestTheSenderIsTheSchoolInbox:
    def test_a_family_message_comes_from_the_inbox_account(self, sent):
        members = [{'user_id': GUARDIAN_A, 'relationship': 'guardian'},
                   {'user_id': GUARDIAN_B, 'relationship': 'other'}]
        get_org, get_inbox = _with_inbox()
        with patch('services.sis_service._admin',
                   return_value=_household_client(members)), get_org, get_inbox:
            result = sis_service.message_household_guardians(
                ORG, 'house-1', STAFF, 'Picture day', 'Wear a shirt')

        assert result['sent'] == 2
        assert result['guardians'] == 2
        # The ids the People-page modal turns into "Open in School Inbox".
        # The `sent` fixture records each CALL and mints its thread id from the
        # recipient, so the expectation is derived the same way rather than read
        # back off the call dict, which never held it.
        assert result['conversation_ids'] == [f"conv-{c['recipient_id']}" for c in sent]
        assert result['conversation_id'] == result['conversation_ids'][0]
        assert {c['sender_id'] for c in sent} == {INBOX}
        assert {c['recipient_id'] for c in sent} == {GUARDIAN_A, GUARDIAN_B}

    def test_the_staff_author_is_recorded(self, sent):
        """sent_by_user_id is what lets the inbox show "Sent by Kate" to the
        rest of the office while the family sees only the school."""
        members = [{'user_id': GUARDIAN_A, 'relationship': 'guardian'}]
        get_org, get_inbox = _with_inbox()
        with patch('services.sis_service._admin',
                   return_value=_household_client(members)), get_org, get_inbox:
            sis_service.message_household_guardians(ORG, 'house-1', STAFF, '', 'Hi')

        assert sent[0]['sent_by_user_id'] == STAFF

    def test_a_student_message_comes_from_the_inbox_account(self, sent):
        get_org, get_inbox = _with_inbox()
        with patch('services.sis_service._admin',
                   return_value=_household_client([])), get_org, get_inbox:
            result = sis_service.message_student(
                ORG, STUDENT, STAFF, 'Late bus', 'Running 10 minutes behind')

        assert result == {'conversation_id': f'conv-{STUDENT}'}
        assert sent[0]['sender_id'] == INBOX
        assert sent[0]['recipient_id'] == STUDENT
        assert sent[0]['sent_by_user_id'] == STAFF

    def test_only_guardians_are_messaged(self, sent):
        """A household holds the students too; they are not the family contact."""
        members = [{'user_id': GUARDIAN_A, 'relationship': 'guardian'},
                   {'user_id': STUDENT, 'relationship': 'student'}]
        get_org, get_inbox = _with_inbox()
        with patch('services.sis_service._admin',
                   return_value=_household_client(members)), get_org, get_inbox:
            result = sis_service.message_household_guardians(
                ORG, 'house-1', STAFF, '', 'Hi')

        assert result['guardians'] == 1
        assert [c['recipient_id'] for c in sent] == [GUARDIAN_A]

    def test_the_subject_leads_the_body(self, sent):
        get_org, get_inbox = _with_inbox()
        with patch('services.sis_service._admin',
                   return_value=_household_client([])), get_org, get_inbox:
            sis_service.message_student(ORG, STUDENT, STAFF, 'Late bus', 'Ten minutes')
        assert sent[0]['content'] == 'Late bus\n\nTen minutes'

    def test_no_subject_sends_the_body_alone(self, sent):
        get_org, get_inbox = _with_inbox()
        with patch('services.sis_service._admin',
                   return_value=_household_client([])), get_org, get_inbox:
            sis_service.message_student(ORG, STUDENT, STAFF, '', 'Ten minutes')
        assert sent[0]['content'] == 'Ten minutes'


@pytest.mark.unit
class TestTheFallback:
    """A message that goes out under the wrong name beats one that does not go
    out at all -- but it must go out as a real person, not as a ghost."""

    def test_without_an_inbox_account_the_staff_member_sends_as_themselves(self, sent):
        get_org, get_inbox = _with_inbox(inbox_id=None)
        with patch('services.sis_service._admin',
                   return_value=_household_client([])), get_org, get_inbox:
            sis_service.message_student(ORG, STUDENT, STAFF, '', 'Hi')

        assert sent[0]['sender_id'] == STAFF
        # Not "sent by Kate on behalf of the school" -- it IS Kate.
        assert sent[0]['sent_by_user_id'] is None

    def test_a_lookup_failure_falls_back_rather_than_raising(self, sent):
        with patch('services.sis_service._admin',
                   return_value=_household_client([])), \
                patch('services.school_inbox_service.get_org',
                      side_effect=RuntimeError('boom')):
            sis_service.message_student(ORG, STUDENT, STAFF, '', 'Hi')

        assert sent[0]['sender_id'] == STAFF

    def test_one_unreachable_guardian_does_not_stop_the_others(self, sent):
        members = [{'user_id': GUARDIAN_A, 'relationship': 'guardian'},
                   {'user_id': GUARDIAN_B, 'relationship': 'other'}]
        get_org, get_inbox = _with_inbox()
        with patch('services.sis_service._admin',
                   return_value=_household_client(members)), get_org, get_inbox, \
                patch('services.direct_message_service.DirectMessageService') as ctor:
            svc = ctor.return_value
            svc.send_message.side_effect = [
                ValueError('no permission'), {'conversation_id': 'c2'}]
            result = sis_service.message_household_guardians(
                ORG, 'house-1', STAFF, '', 'Hi')

        assert result['sent'] == 1
        assert result['guardians'] == 2
        # Only the guardian who actually received it contributes a thread.
        assert result['conversation_ids'] == ['c2']
        assert result['conversation_id'] == 'c2'


@pytest.mark.unit
class TestTheSecondSchoolAccountIsGone:
    def test_the_minting_function_no_longer_exists(self):
        """_org_messaging_sender created an org_managed user with org_role
        org_admin on first use. Nothing should ever mint one again."""
        assert not hasattr(sis_service, '_org_messaging_sender')

    def test_sending_never_creates_an_auth_user(self, sent):
        """The old path called auth.admin.create_user the first time an org sent
        a family message. The inbox account is created by school_inbox_service,
        on the member's side, and never from here."""
        admin = _household_client([])
        get_org, get_inbox = _with_inbox()
        with patch('services.sis_service._admin', return_value=admin), \
                get_org, get_inbox:
            sis_service.message_student(ORG, STUDENT, STAFF, '', 'Hi')

        admin.auth.admin.create_user.assert_not_called()

    def test_the_placeholder_address_is_gone_too(self):
        """This test asserted the opposite until 2026-09-11, deliberately.

        `org_messaging_email` was a transitional helper, kept so two roster
        filters could hide an un-migrated placeholder by its address; its own
        docstring said to delete it once the merge migration had run
        everywhere. That migration reached production on 2026-09-10
        (20260910180000 through 210000) and left zero placeholders carrying an
        organization_id -- so both filters matched nothing, and an address
        nothing sends from and nothing filters on is only a way to recreate the
        second account by hand.

        The filters went with it. The school-inbox account cannot turn up in a
        staff roster on its own merits: it carries organization_id NULL, and
        every roster query is scoped to an org.
        """
        assert not hasattr(sis_service, 'org_messaging_email')
        assert not hasattr(sis_service, '_org_messaging_sender')


def _raw(view):
    """The view function with require_role / require_relationship_to unwrapped."""
    return inspect.unwrap(view)


@pytest.mark.unit
class TestRoutesReturnTheConversation:
    """The modal cannot offer "Open in School Inbox" without an id to open.

    The service returning a conversation id is only half of it -- the route has
    to hand it to the client. Ported from the People-page branch, which had the
    only coverage of this hop.
    """

    def _ctx(self, app, path, payload):
        return app.test_request_context(path, json=payload, method='POST')

    def test_student_route_passes_the_conversation_id_through(self):
        from flask import Flask
        import routes.sis as sis_routes

        app = Flask(__name__)
        with self._ctx(app, '/api/sis/students/s1/message', {'body': 'Hello'}), \
             patch.object(sis_routes, '_org_or_error', return_value=(ORG, None)), \
             patch.object(sis_routes.sis_service, 'student_in_org', return_value=True), \
             patch.object(sis_routes.sis_service, 'message_student',
                          return_value={'conversation_id': 'convo-9'}):
            resp = _raw(sis_routes.message_student)(STAFF, 's1')

        assert resp.get_json() == {'success': True, 'conversation_id': 'convo-9'}

    def test_household_route_passes_the_conversation_id_through(self):
        from flask import Flask
        import routes.sis as sis_routes

        repo = Mock()
        repo.find_by_id.return_value = {'id': 'hh-1', 'organization_id': ORG}
        app = Flask(__name__)
        with self._ctx(app, '/api/sis/households/hh-1/message', {'body': 'Hello'}), \
             patch.object(sis_routes, '_org_or_error', return_value=(ORG, None)), \
             patch.object(sis_routes, 'get_supabase_admin_client', return_value=Mock()), \
             patch.object(sis_routes, 'HouseholdRepository', return_value=repo), \
             patch.object(sis_routes.sis_service, 'message_household_guardians',
                          return_value={'sent': 1, 'guardians': 1,
                                        'conversation_id': 'convo-a',
                                        'conversation_ids': ['convo-a']}):
            resp = _raw(sis_routes.message_household)(STAFF, 'hh-1')

        body = resp.get_json()
        assert body['success'] is True
        assert body['conversation_id'] == 'convo-a'
        assert body['sent'] == 1
