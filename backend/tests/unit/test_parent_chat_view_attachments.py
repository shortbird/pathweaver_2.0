"""A parent reading their child's chats sees the pictures.

The parent's read-only views of a child's direct messages and class chats
selected the text and the sender and nothing else, so a photo the child sent
was an empty bubble on the family page ("as penny i can't see the image sam
sent in the chat", 2026-09-15). Both routes now carry `attachments`, signed
on read the way every thread signs them.
"""

from unittest.mock import MagicMock, patch

PARENT_ID = 'e1f2a3b4-1111-4111-8111-111111111111'
STUDENT_ID = 'e1f2a3b4-2222-4222-8222-222222222222'
GROUP_ID = 'e1f2a3b4-4444-4444-8444-444444444444'
CONV_ID = 'e1f2a3b4-5555-4555-8555-555555555555'

STORED = 'https://x.supabase.co/storage/v1/object/public/user-uploads/kid/a.jpg'


def _admin(rows):
    admin = MagicMock()

    def _table(name):
        t = MagicMock()
        # Every chained builder call returns the same mock; execute answers.
        for m in ('select', 'eq', 'order', 'range', 'single', 'limit', 'in_'):
            getattr(t, m).return_value = t
        if name in ('group_messages', 'direct_messages'):
            t.execute.return_value = MagicMock(data=rows)
        elif name == 'message_conversations':
            t.execute.return_value = MagicMock(
                data={'id': CONV_ID, 'participant_1_id': STUDENT_ID, 'participant_2_id': 'x'})
        else:
            t.execute.return_value = MagicMock(data=[{'id': 'm'}])
        return t

    admin.table.side_effect = _table
    return admin


def _get(client, path):
    rows = [{'id': 'g1', 'sender_id': STUDENT_ID, 'content': 'look', 'created_at': 't',
             'attachments': [{'url': STORED, 'type': 'image', 'name': 'a.jpg', 'size': 10}],
             'sender': {'id': STUDENT_ID, 'display_name': 'Sam', 'avatar_url': None}}]
    with patch('routes.parent.communications.get_supabase_admin_client', return_value=_admin(rows)), \
         patch('utils.auth.relationships._is_platform_staff', return_value=False), \
         patch('utils.portfolio_access.is_parent_of', return_value=True), \
         patch('utils.session_manager.session_manager.get_effective_user_id', return_value=PARENT_ID), \
         patch('utils.session_manager.session_manager.get_actual_admin_id', return_value=PARENT_ID), \
         patch('utils.session_manager.session_manager.get_masquerade_info', return_value=None), \
         patch('routes.parent.communications.sign_in_place'), \
         patch('services.messaging_extras_service.sign_stored_urls',
               return_value={STORED: STORED + '?token=signed'}) as sign:
        resp = client.get(path)
    return resp, sign


def test_a_parent_sees_the_pictures_in_a_childs_class_chat(client):
    resp, sign = _get(client, f'/api/parent/student/{STUDENT_ID}/group-conversations/{GROUP_ID}/messages')
    assert resp.status_code == 200, resp.get_data(as_text=True)
    msg = resp.get_json()['messages'][0]
    assert msg['attachments'][0]['url'] == STORED + '?token=signed'
    sign.assert_called_once()


def test_a_parent_sees_the_pictures_in_a_childs_direct_messages(client):
    resp, _ = _get(client, f'/api/parent/student/{STUDENT_ID}/dm-conversations/{CONV_ID}/messages')
    assert resp.status_code == 200, resp.get_data(as_text=True)
    msg = resp.get_json()['messages'][0]
    assert msg['attachments'][0]['url'] == STORED + '?token=signed'
