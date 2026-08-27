"""Opening a thread is one write, not one per message.

ChatWindow used to mark a conversation read by firing `PUT /messages/<id>/read`
for every unread message it had just rendered, and each of those responses
invalidated the conversation-list query on its way back. A thread with twenty
unread messages therefore produced twenty writes and twenty refetches of the
most expensive endpoint on the page — participants, unread recount and avatar
signing, twenty times over — while the reader sat there watching.

`mark_conversation_read` replaces the loop with a single scoped UPDATE.
"""

from unittest.mock import MagicMock, patch

import pytest

from services.direct_message_service import DirectMessageService


CONVO = 'convo-1'
READER = 'user-reader'
WRITER = 'user-writer'


class _Update:
    """Records the filters an update was scoped by, and reports rows changed."""

    def __init__(self, recorder, rows):
        self._recorder = recorder
        self._rows = rows

    def eq(self, col, val):
        self._recorder['filters'].append((col, val))
        return self

    def is_(self, col, val):
        self._recorder['filters'].append((col, val))
        return self

    def execute(self):
        self._recorder['executed'] += 1
        return MagicMock(data=self._rows)


@pytest.fixture
def service():
    svc = DirectMessageService()
    return svc


def _client(convo_row, unread_rows, recorder):
    client = MagicMock()

    def table(name):
        t = MagicMock()
        if name == 'message_conversations':
            sel = MagicMock()
            sel.select.return_value = sel
            sel.eq.return_value = sel
            sel.single.return_value = sel
            sel.execute.return_value = MagicMock(data=convo_row)
            t.select = sel.select
            t.update.return_value = _Update(recorder['convo'], [])
        elif name == 'direct_messages':
            t.update.return_value = _Update(recorder['messages'], unread_rows)
        return t

    client.table.side_effect = table
    return client


def _recorders():
    return {
        'messages': {'filters': [], 'executed': 0},
        'convo': {'filters': [], 'executed': 0},
    }


class TestMarkConversationRead:
    def test_one_update_clears_every_unread_message(self, service):
        rec = _recorders()
        rows = [{'id': f'm{i}', 'sender_id': WRITER} for i in range(20)]
        convo = {'id': CONVO, 'participant_1_id': READER, 'participant_2_id': WRITER}

        with patch.object(service, '_get_client', return_value=_client(convo, rows, rec)), \
             patch('services.direct_message_service.NotificationService'):
            assert service.mark_conversation_read(CONVO, READER) == 20

        # Twenty messages, one write.
        assert rec['messages']['executed'] == 1

    def test_the_update_can_only_touch_the_callers_own_unread(self, service):
        """The filters are the authorization: without recipient_id scoping this
        endpoint would let a participant mark the OTHER person's messages read."""
        rec = _recorders()
        convo = {'id': CONVO, 'participant_1_id': READER, 'participant_2_id': WRITER}

        with patch.object(service, '_get_client',
                          return_value=_client(convo, [{'id': 'm1', 'sender_id': WRITER}], rec)), \
             patch('services.direct_message_service.NotificationService'):
            service.mark_conversation_read(CONVO, READER)

        assert ('conversation_id', CONVO) in rec['messages']['filters']
        assert ('recipient_id', READER) in rec['messages']['filters']
        assert ('read_at', 'null') in rec['messages']['filters']

    def test_a_non_participant_is_refused(self, service):
        rec = _recorders()
        convo = {'id': CONVO, 'participant_1_id': 'someone', 'participant_2_id': 'else'}

        with patch.object(service, '_get_client', return_value=_client(convo, [], rec)):
            with pytest.raises(ValueError, match='not a participant'):
                service.mark_conversation_read(CONVO, READER)

        assert rec['messages']['executed'] == 0

    def test_nothing_unread_writes_nothing(self, service):
        """The client calls this on every open; an already-read thread must not
        churn the conversation counters (or invalidate the list) for nothing."""
        rec = _recorders()
        convo = {'id': CONVO, 'participant_1_id': READER, 'participant_2_id': WRITER}

        with patch.object(service, '_get_client', return_value=_client(convo, [], rec)), \
             patch('services.direct_message_service.NotificationService'):
            assert service.mark_conversation_read(CONVO, READER) == 0

        assert rec['convo']['executed'] == 0

    def test_the_counter_is_zeroed_on_the_readers_own_side(self, service):
        """participant_2 reading must not clear participant_1's badge."""
        rec = _recorders()
        convo = {'id': CONVO, 'participant_1_id': WRITER, 'participant_2_id': READER}
        captured = {}

        client = _client(convo, [{'id': 'm1', 'sender_id': WRITER}], rec)
        original = client.table.side_effect

        def table(name):
            t = original(name)
            if name == 'message_conversations':
                def update(payload):
                    captured.update(payload)
                    return _Update(rec['convo'], [])
                t.update = update
            return t

        client.table.side_effect = table

        with patch.object(service, '_get_client', return_value=client), \
             patch('services.direct_message_service.NotificationService'):
            service.mark_conversation_read(CONVO, READER)

        assert captured == {'unread_count_p2': 0}
