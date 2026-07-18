"""Unit tests: superadmins can see deleted message content (flagged for a
"Deleted" indicator); everyone else gets a blanked tombstone.

Covers enrich_messages and reply_previews in messaging_extras_service.
"""

from unittest.mock import MagicMock, patch

import services.messaging_extras_service as extras


class _FakeTable:
    """Chainable query stub that returns canned data keyed by table name."""

    def __init__(self, name, data_by_table):
        self.name = name
        self.data_by_table = data_by_table

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        return MagicMock(data=self.data_by_table.get(self.name, []))


def _admin_for(role, reply_rows=None):
    data_by_table = {
        'message_reactions': [],
        'users': [{'id': 'viewer', 'role': role,
                   'display_name': 'V', 'first_name': 'V', 'last_name': ''}],
    }
    if reply_rows is not None:
        data_by_table['direct_messages'] = reply_rows
    client = MagicMock()
    client.table.side_effect = lambda name: _FakeTable(name, data_by_table)
    return client


def _deleted_msg():
    return {
        'id': 'm1', 'sender_id': 'user-A', 'recipient_id': 'user-B',
        'conversation_id': 'conv-1', 'is_deleted': True,
        'message_content': 'secret original text',
        'attachments': [{'url': 'http://x/y.png'}],
    }


def test_superadmin_sees_deleted_content_with_flag():
    with patch.object(extras, '_admin', return_value=_admin_for('superadmin')):
        out = extras.enrich_messages('dm', [_deleted_msg()], 'viewer')
    row = out[0]
    assert row['is_deleted'] is True
    assert row['deleted_visible_to_admin'] is True
    assert row['message_content'] == 'secret original text'
    assert row['attachments'] == [{'url': 'http://x/y.png'}]


def test_non_superadmin_gets_blanked_tombstone():
    with patch.object(extras, '_admin', return_value=_admin_for('student')):
        out = extras.enrich_messages('dm', [_deleted_msg()], 'viewer')
    row = out[0]
    assert row['is_deleted'] is True
    assert 'deleted_visible_to_admin' not in row
    assert row['message_content'] == ''
    assert row['attachments'] == []


def test_non_deleted_message_untouched_for_everyone():
    msg = {
        'id': 'm2', 'sender_id': 'user-A', 'recipient_id': 'user-B',
        'conversation_id': 'conv-1', 'is_deleted': False,
        'message_content': 'hello', 'attachments': [],
    }
    with patch.object(extras, '_admin', return_value=_admin_for('student')):
        out = extras.enrich_messages('dm', [msg], 'viewer')
    assert out[0]['message_content'] == 'hello'
    assert 'deleted_visible_to_admin' not in out[0]


def test_reply_preview_hides_deleted_content_for_non_superadmin():
    reply_rows = [{'id': 't1', 'sender_id': 'user-A',
                   'message_content': 'the reply target', 'is_deleted': True}]
    msg = {
        'id': 'm3', 'sender_id': 'user-B', 'recipient_id': 'user-A',
        'conversation_id': 'conv-1', 'is_deleted': False,
        'message_content': 'a reply', 'attachments': [],
        'reply_to_message_id': 't1',
    }
    with patch.object(extras, '_admin', return_value=_admin_for('student', reply_rows)):
        out = extras.enrich_messages('dm', [msg], 'viewer')
    assert out[0]['reply_to']['content'] == 'Message deleted'
    assert out[0]['reply_to']['is_deleted'] is True


def test_reply_preview_reveals_deleted_content_for_superadmin():
    reply_rows = [{'id': 't1', 'sender_id': 'user-A',
                   'message_content': 'the reply target', 'is_deleted': True}]
    msg = {
        'id': 'm3', 'sender_id': 'user-B', 'recipient_id': 'user-A',
        'conversation_id': 'conv-1', 'is_deleted': False,
        'message_content': 'a reply', 'attachments': [],
        'reply_to_message_id': 't1',
    }
    with patch.object(extras, '_admin', return_value=_admin_for('superadmin', reply_rows)):
        out = extras.enrich_messages('dm', [msg], 'viewer')
    assert out[0]['reply_to']['content'] == 'the reply target'
    assert out[0]['reply_to']['is_deleted'] is True
