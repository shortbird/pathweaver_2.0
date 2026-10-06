"""A colleague deletes a message they sent as the school.

Ticket ecc73d0e (campus coordinator, iCreate): "I would like to delete a
message that I sent by mistake." A school-inbox reply goes out with
sender_id = the school's inbox account and sent_by_user_id = the colleague who
wrote it, so the ordinary DM delete ("your own messages") never matched.

DELETE /api/school-inbox/messages/<id> lets the author -- and only the
author -- soft-delete it. A colleague's message, a member's message, or a
message of some other inbox is refused with nothing written. School group
messages have no sent_by column and are not deletable (no migration for it).
"""

import json
from unittest.mock import Mock, patch

import pytest

from services import messaging_extras_service as extras
from services import school_inbox_service as inbox

ORG_ID = 'org-1'
ORG = {'id': ORG_ID, 'name': 'iCreate', 'is_active': True}
INBOX = 'inbox-1'
ME = 'test-user-123'  # mock_verify_token's user
COLLEAGUE = 'becky'
PARENT = 'mum'


def _row(**over):
    row = {'id': 'm-1', 'conversation_id': 'conv-1', 'sender_id': INBOX,
           'recipient_id': PARENT, 'sent_by_user_id': ME, 'is_deleted': False,
           'message_content': 'oops'}
    row.update(over)
    return row


def _role_client():
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': 'org_managed',
                                             'org_role': 'campus_coordinator',
                                             'org_roles': None}])
    return client


@pytest.fixture
def office():
    """The signed-in test user is a campus coordinator on the school inbox."""
    with patch('database.get_supabase_admin_client', return_value=_role_client()), \
         patch('services.sis_service.resolve_org_id', return_value=ORG_ID), \
         patch.object(inbox, 'inbox_access', return_value=True), \
         patch.object(inbox, 'school_account', return_value=(ORG, INBOX)):
        yield


def _data(resp):
    body = json.loads(resp.data)
    return body.get('data', body)


@pytest.mark.unit
class TestDeleteSchoolMessage:
    """ecc73d0e: the rule in the service."""

    @pytest.mark.parametrize('row', [
        _row(sent_by_user_id=COLLEAGUE),           # a colleague wrote it
        _row(sender_id=PARENT, sent_by_user_id=None),  # the family wrote it
        _row(sender_id='inbox-OTHER'),             # another school's inbox
    ])
    def test_refused_and_nothing_written(self, row):
        with patch.object(extras, '_dm_row', return_value=row), \
             patch.object(extras, '_soft_delete') as soft:
            result = extras.delete_school_message(ME, INBOX, 'm-1')
        assert result.get('error')
        soft.assert_not_called()

    def test_missing_message_is_not_found(self):
        with patch.object(extras, '_dm_row', return_value=None), \
             patch.object(extras, '_soft_delete') as soft:
            assert extras.delete_school_message(ME, INBOX, 'm-1') == {'error': 'Message not found'}
        soft.assert_not_called()

    def test_the_author_deletes_it(self):
        row = _row()
        with patch.object(extras, '_dm_row', return_value=row), \
             patch.object(extras, '_soft_delete') as soft:
            assert extras.delete_school_message(ME, INBOX, 'm-1') == {'ok': True}
        soft.assert_called_once_with('dm', row)

    def test_soft_delete_marks_the_row_and_broadcasts(self):
        admin = Mock()
        table = Mock()
        admin.table.return_value = table
        table.update.return_value = table
        table.eq.return_value = table
        with patch.object(extras, '_admin', return_value=admin), \
             patch.object(extras, '_recompute_conversation_preview'), \
             patch.object(extras, 'broadcast_dm') as bc:
            extras._soft_delete('dm', _row())
        admin.table.assert_called_with('direct_messages')
        table.update.assert_called_once_with({'is_deleted': True})
        bc.assert_called_once_with('conv-1', 'deleted', {'message_id': 'm-1'})


@pytest.mark.unit
class TestDeleteRoute:
    """ecc73d0e: DELETE /api/school-inbox/messages/<id>."""

    def test_the_route_has_one_owner(self, app):
        endpoint, _ = app.url_map.bind('localhost').match(
            '/api/school-inbox/messages/m-1', method='DELETE')
        assert endpoint == 'school_inbox.delete_school_message'

    def test_a_colleagues_message_is_refused_and_nothing_written(
            self, client, auth_headers, mock_verify_token, office):
        with patch.object(extras, '_dm_row', return_value=_row(sent_by_user_id=COLLEAGUE)), \
             patch.object(extras, '_soft_delete') as soft:
            resp = client.delete('/api/school-inbox/messages/m-1', headers=auth_headers)
        assert resp.status_code == 403
        soft.assert_not_called()

    def test_another_inboxs_message_is_not_found(
            self, client, auth_headers, mock_verify_token, office):
        with patch.object(extras, '_dm_row', return_value=_row(sender_id='inbox-OTHER')), \
             patch.object(extras, '_soft_delete') as soft:
            resp = client.delete('/api/school-inbox/messages/m-1', headers=auth_headers)
        assert resp.status_code == 404
        soft.assert_not_called()

    def test_off_the_inbox_is_refused_before_anything_is_read(
            self, client, auth_headers, mock_verify_token, office):
        with patch.object(inbox, 'inbox_access', return_value=False), \
             patch.object(extras, '_dm_row') as read, \
             patch.object(extras, '_soft_delete') as soft:
            resp = client.delete('/api/school-inbox/messages/m-1', headers=auth_headers)
        assert resp.status_code == 403
        read.assert_not_called()
        soft.assert_not_called()

    def test_the_author_deletes_it(self, client, auth_headers, mock_verify_token, office):
        with patch.object(extras, '_dm_row', return_value=_row()), \
             patch.object(extras, '_soft_delete') as soft:
            resp = client.delete('/api/school-inbox/messages/m-1', headers=auth_headers)
        assert resp.status_code == 200
        soft.assert_called_once()


@pytest.mark.unit
class TestThreadWire:
    """ecc73d0e: the thread read carries sent_by_user_id and can_delete, so
    the console shows Delete only on the caller's own school messages."""

    def test_can_delete_and_sent_by_are_on_the_wire(
            self, client, auth_headers, mock_verify_token, office):
        svc = Mock()
        svc.get_conversation_messages.return_value = [
            _row(id='mine'),
            _row(id='theirs', sent_by_user_id=COLLEAGUE),
            _row(id='family', sender_id=PARENT, recipient_id=INBOX, sent_by_user_id=None),
            _row(id='gone', is_deleted=True),
        ]
        with patch('routes.school_inbox.message_service', svc), \
             patch.object(inbox, 'conversation_for_inbox', return_value={'id': 'conv-1'}), \
             patch.object(inbox, 'thread_access', return_value='office'), \
             patch.object(inbox, 'attach_sent_by_names'), \
             patch.object(inbox, 'thread_readers', return_value=[]):
            resp = client.get('/api/school-inbox/conversations/conv-1?mark_read=0',
                              headers=auth_headers)
        assert resp.status_code == 200
        by_id = {m['id']: m for m in _data(resp)['messages']}
        assert by_id['mine']['sent_by_user_id'] == ME
        assert {k: by_id[k]['can_delete'] for k in by_id} == {
            'mine': True, 'theirs': False, 'family': False, 'gone': False}
