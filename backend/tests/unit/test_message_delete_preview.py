"""Unit tests: deleting/editing a message keeps the conversation-list preview
in sync so a removed last message stops showing its old content.

Regression for the "deleted message preview bug": delete_message previously only
flipped is_deleted and never recomputed message_conversations.last_message_preview,
so the conversation list kept showing the deleted text.
"""

from unittest.mock import MagicMock, patch

import services.messaging_extras_service as extras


class _FakeTable:
    def __init__(self, name, store):
        self.name = name
        self.store = store
        self._filters = {}
        self._update_payload = None

    # query builder (all chainable, return self)
    def select(self, *a, **k):
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def limit(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def update(self, payload):
        self._update_payload = payload
        return self

    def execute(self):
        if self._update_payload is not None:
            self.store['updates'].append((self.name, self._update_payload, dict(self._filters)))
            return MagicMock(data=[{}])
        if self.name in ('direct_messages', 'group_messages'):
            # recompute path filters on is_deleted; the row lookup filters on id
            if 'is_deleted' in self._filters:
                return MagicMock(data=self.store['latest'])
            return MagicMock(data=self.store['target'])
        return MagicMock(data=[])


def _fake_admin(store):
    client = MagicMock()
    client.table.side_effect = lambda name: _FakeTable(name, store)
    return client


def _conversation_updates(store, table='message_conversations'):
    return [u for u in store['updates'] if u[0] == table]


def test_delete_last_dm_updates_preview_to_previous_message():
    target = [{
        'id': 'm2', 'sender_id': 'user-A', 'recipient_id': 'user-B',
        'conversation_id': 'conv-1', 'is_deleted': False,
    }]
    latest = [{
        'message_content': 'Older surviving message',
        'attachments': [], 'created_at': '2026-01-01T00:00:00Z',
    }]
    store = {'target': target, 'latest': latest, 'updates': []}

    with patch.object(extras, '_admin', return_value=_fake_admin(store)), \
         patch.object(extras, 'broadcast_dm'):
        result = extras.delete_message('user-A', 'dm', 'm2')

    assert result == {'ok': True}
    conv_updates = _conversation_updates(store)
    assert conv_updates, 'expected a message_conversations preview update'
    payload = conv_updates[-1][1]
    assert payload['last_message_preview'] == 'Older surviving message'
    assert payload['last_message_at'] == '2026-01-01T00:00:00Z'


def test_delete_only_dm_clears_preview():
    target = [{
        'id': 'm1', 'sender_id': 'user-A', 'recipient_id': 'user-B',
        'conversation_id': 'conv-1', 'is_deleted': False,
    }]
    store = {'target': target, 'latest': [], 'updates': []}

    with patch.object(extras, '_admin', return_value=_fake_admin(store)), \
         patch.object(extras, 'broadcast_dm'):
        result = extras.delete_message('user-A', 'dm', 'm1')

    assert result == {'ok': True}
    payload = _conversation_updates(store)[-1][1]
    assert payload['last_message_preview'] == ''
    # last_message_at is left untouched so the empty conversation keeps its slot
    assert 'last_message_at' not in payload


def test_delete_attachment_only_message_previews_as_attachment():
    target = [{
        'id': 'm2', 'sender_id': 'user-A', 'recipient_id': 'user-B',
        'conversation_id': 'conv-1', 'is_deleted': False,
    }]
    latest = [{
        'message_content': '', 'attachments': [{'url': 'http://x/y.png'}],
        'created_at': '2026-01-02T00:00:00Z',
    }]
    store = {'target': target, 'latest': latest, 'updates': []}

    with patch.object(extras, '_admin', return_value=_fake_admin(store)), \
         patch.object(extras, 'broadcast_dm'):
        extras.delete_message('user-A', 'dm', 'm2')

    payload = _conversation_updates(store)[-1][1]
    assert payload['last_message_preview'] == 'Sent an attachment'


def test_delete_non_owner_does_not_touch_preview():
    target = [{
        'id': 'm2', 'sender_id': 'user-A', 'recipient_id': 'user-B',
        'conversation_id': 'conv-1', 'is_deleted': False,
    }]
    store = {'target': target, 'latest': [], 'updates': []}

    with patch.object(extras, '_admin', return_value=_fake_admin(store)), \
         patch.object(extras, 'broadcast_dm'):
        # user-B is the recipient, not the sender -> not allowed to delete
        result = extras.delete_message('user-B', 'dm', 'm2')

    assert 'error' in result
    assert _conversation_updates(store) == []


def test_edit_last_dm_updates_preview():
    target = [{
        'id': 'm2', 'sender_id': 'user-A', 'recipient_id': 'user-B',
        'conversation_id': 'conv-1', 'is_deleted': False,
    }]
    latest = [{
        'message_content': 'Edited text', 'attachments': [],
        'created_at': '2026-01-03T00:00:00Z',
    }]
    store = {'target': target, 'latest': latest, 'updates': []}

    with patch.object(extras, '_admin', return_value=_fake_admin(store)), \
         patch.object(extras, 'broadcast_dm'):
        result = extras.edit_message('user-A', 'dm', 'm2', 'Edited text')

    assert result == {'ok': True}
    payload = _conversation_updates(store)[-1][1]
    assert payload['last_message_preview'] == 'Edited text'


def test_delete_last_group_message_updates_group_preview():
    target = [{
        'id': 'g2', 'sender_id': 'user-A', 'group_id': 'grp-1', 'is_deleted': False,
    }]
    latest = [{
        'message_content': 'Surviving group message', 'attachments': [],
        'created_at': '2026-01-04T00:00:00Z',
    }]
    store = {'target': target, 'latest': latest, 'updates': []}

    with patch.object(extras, '_admin', return_value=_fake_admin(store)), \
         patch.object(extras, 'broadcast_group'), \
         patch.object(extras, 'is_group_admin', return_value=False):
        result = extras.delete_message('user-A', 'group', 'g2')

    assert result == {'ok': True}
    payload = _conversation_updates(store, 'group_conversations')[0][1]
    assert payload['last_message_preview'] == 'Surviving group message'
    assert payload['last_message_at'] == '2026-01-04T00:00:00Z'
