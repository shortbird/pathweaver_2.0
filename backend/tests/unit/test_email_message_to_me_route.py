"""POST /api/messages/<id>/email-to-me — who is allowed to use it.

The route mails one person's words to a mailbox they did not choose, and hands
that mailbox a standing write capability into the thread. Two gates, and both
matter: superadmin only, AND the caller must actually be in the conversation.
Superadmin can read a great deal on this platform; that is not the same as
being allowed to forward a thread between two other people to a personal inbox.
"""

import json
from unittest.mock import MagicMock, patch

MESSAGE = {
    'id': 'msg-1',
    'conversation_id': 'conv-1',
    'sender_id': 'member-id',
    'recipient_id': 'test-user-123',
    'message_content': 'I am confused about the credit situation',
    'created_at': '2026-09-08T15:00:00+00:00',
    'attachments': [],
    'is_deleted': False,
}


def _supabase(caller_role='superadmin', message=None):
    """Stub the two reads the route makes: the caller, then the message."""
    supabase = MagicMock()
    users_single = MagicMock()
    users_single.data = {
        'id': 'test-user-123', 'email': 'tannerbowman@gmail.com',
        'role': caller_role, 'org_role': None, 'organization_id': None,
    }

    def table(name):
        t = MagicMock()
        if name == 'users':
            t.select.return_value.eq.return_value.single.return_value.execute.return_value = users_single
            t.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[{'id': 'member-id', 'display_name': 'Finn O\'Neill',
                       'first_name': 'Finn', 'last_name': "O'Neill"}]
            )
        else:
            t.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[message] if message else []
            )
        return t

    supabase.table.side_effect = table
    return supabase


def _post(client, supabase, relay_result=None):
    relay = MagicMock()
    relay.email_message_to_owner.return_value = relay_result or {
        'sent': True, 'to': 'tannerbowman@gmail.com',
        'reply_address': 'reply+tok@reply.optioeducation.com',
    }
    inbox = MagicMock()
    inbox.member_org.return_value = {'id': 'org-1', 'name': 'iCreate'}
    with patch('database.get_supabase_admin_client', return_value=supabase), \
         patch('services.message_email_relay_service.email_message_to_owner',
               relay.email_message_to_owner), \
         patch('services.school_inbox_service.member_org', inbox.member_org):
        resp = client.post(
            '/api/messages/msg-1/email-to-me',
            headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
            data=json.dumps({}),
        )
    return resp, relay


def test_superadmin_in_the_thread_can_email_it(client, mock_verify_token):
    resp, relay = _post(client, _supabase(message=MESSAGE))
    assert resp.status_code == 200
    body = resp.get_json()['data']
    assert body['emailed_to'] == 'tannerbowman@gmail.com'
    assert body['replies_enabled'] is True

    kwargs = relay.email_message_to_owner.call_args[1]
    # A reply must reach the far side of the thread, never loop back to the
    # caller — the relay is keyed to other_party, not to the message's author.
    assert kwargs['other_party']['id'] == 'member-id'
    assert kwargs['author']['id'] == 'member-id'
    assert kwargs['org_name'] == 'iCreate'


def test_non_superadmin_is_refused(client, mock_verify_token):
    resp, relay = _post(client, _supabase(caller_role='advisor', message=MESSAGE))
    assert resp.status_code == 403
    relay.email_message_to_owner.assert_not_called()


def test_a_thread_the_caller_is_not_part_of_is_refused(client, mock_verify_token):
    other_thread = dict(MESSAGE, sender_id='member-id', recipient_id='someone-else')
    resp, relay = _post(client, _supabase(message=other_thread))
    assert resp.status_code == 403
    relay.email_message_to_owner.assert_not_called()


def test_deleted_message_is_refused(client, mock_verify_token):
    resp, relay = _post(client, _supabase(message=dict(MESSAGE, is_deleted=True)))
    assert resp.status_code == 400
    relay.email_message_to_owner.assert_not_called()


def test_missing_message_is_404(client, mock_verify_token):
    resp, relay = _post(client, _supabase(message=None))
    assert resp.status_code == 404
    relay.email_message_to_owner.assert_not_called()


def test_replies_off_still_sends_and_says_so(client, mock_verify_token):
    resp, _ = _post(client, _supabase(message=MESSAGE), relay_result={
        'sent': True, 'to': 'tannerbowman@gmail.com', 'reply_address': None,
    })
    assert resp.status_code == 200
    assert resp.get_json()['data']['replies_enabled'] is False


def test_send_failure_is_reported_not_swallowed(client, mock_verify_token):
    resp, _ = _post(client, _supabase(message=MESSAGE), relay_result={
        'sent': False, 'to': 'tannerbowman@gmail.com', 'reply_address': None,
    })
    assert resp.status_code == 502
