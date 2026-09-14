"""
Who spoke last in each thread, and "this one is handled".

iCreate, 2026-08-27 (2ca63bde): "It might be helpful if we had a spot for
messages to go once they are completed, so that only new messages that haven't
been replied to show" — and 2026-09-01 (7fb34ed4): "How do I send messages? I
see the inbox, but I don't have an outbox really."

Both are the same question asked from two ends: which of these is still waiting
on us, and which have we already answered? Unread does not answer it — a thread
read this morning and not yet replied to is exactly the one that gets forgotten.

The first answer looked the sender up at read time by matching
direct_messages.created_at against message_conversations.last_message_at. The
two were written by two now() calls ~90 ms apart, 12 of iCreate's 32 threads
missed, and every miss read as "needs a reply": the queue said 22 and it was 7
(2026-09-14, 7ee545c4). The sender is now written on the thread on send, and
"handled" is a per-participant mark (5c858931) that the next message from the
other side outdates.
"""

from unittest.mock import MagicMock

import pytest

from services.direct_message_service import DirectMessageService


CONVO = '11111111-1111-4111-8111-111111111111'
SCHOOL = '22222222-2222-4222-8222-222222222222'   # participant_1 (sorts first)
PARENT = '33333333-3333-4333-8333-333333333333'   # participant_2
STRANGER = '44444444-4444-4444-8444-444444444444'


class _Table:
    """Enough of PostgREST's builder to record one update and answer one
    conversation lookup."""

    def __init__(self, recorder, convo_row):
        self._recorder = recorder
        self._row = convo_row
        self._filters = {}
        self._payload = None
        self._single = False

    def select(self, *_a, **_k):
        return self

    def update(self, payload):
        self._payload = payload
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def limit(self, _n):
        return self

    def single(self):
        self._single = True
        return self

    def execute(self):
        if self._payload is not None:
            self._recorder.append((dict(self._filters), self._payload))
            return MagicMock(data=[self._row])
        rows = [self._row] if self._row and all(
            self._row.get(c) == v for c, v in self._filters.items()) else []
        # .single() hands back the row itself, the way PostgREST does.
        return MagicMock(data=(rows[0] if rows else None) if self._single else rows)


def _service(convo_row):
    recorder = []
    client = MagicMock()
    client.table.side_effect = lambda _name: _Table(recorder, convo_row)
    svc = DirectMessageService()
    svc._get_client = lambda: client
    return svc, recorder


CONVO_ROW = {'id': CONVO, 'participant_1_id': SCHOOL, 'participant_2_id': PARENT,
             'unread_count_p1': 0, 'unread_count_p2': 0}


@pytest.mark.unit
class TestLastSenderIsWrittenOnSend:
    def test_the_thread_records_who_sent_the_last_message(self):
        svc, writes = _service(CONVO_ROW)
        svc._update_conversation_metadata(CONVO, SCHOOL, PARENT, 'hello',
                                          sent_at='2026-09-14T10:00:00.000001')
        assert len(writes) == 1
        _filters, payload = writes[0]
        assert payload['last_message_sender_id'] == SCHOOL

    def test_the_thread_is_stamped_with_the_message_s_own_instant(self):
        """One timestamp, not two now() calls: anything still comparing the
        message row to the thread row must find them equal."""
        svc, writes = _service(CONVO_ROW)
        svc._update_conversation_metadata(CONVO, PARENT, SCHOOL, 'hi',
                                          sent_at='2026-09-14T10:00:00.000001')
        assert writes[0][1]['last_message_at'] == '2026-09-14T10:00:00.000001'

    def test_without_an_instant_it_still_stamps_now(self):
        svc, writes = _service(CONVO_ROW)
        svc._update_conversation_metadata(CONVO, PARENT, SCHOOL, 'hi')
        assert writes[0][1]['last_message_at']
        assert writes[0][1]['last_message_sender_id'] == PARENT


@pytest.mark.unit
class TestResolvingAThread:
    def test_the_school_side_resolves_its_own_column(self):
        svc, writes = _service(CONVO_ROW)
        value = svc.set_conversation_resolved(CONVO, SCHOOL, True)
        assert value
        filters, payload = writes[0]
        assert filters == {'id': CONVO}
        assert payload == {'resolved_at_p1': value}

    def test_the_member_side_resolves_the_other_column(self):
        svc, writes = _service(CONVO_ROW)
        value = svc.set_conversation_resolved(CONVO, PARENT, True)
        assert writes[0][1] == {'resolved_at_p2': value}

    def test_reopening_clears_the_mark(self):
        svc, writes = _service(CONVO_ROW)
        assert svc.set_conversation_resolved(CONVO, SCHOOL, False) is None
        assert writes[0][1] == {'resolved_at_p1': None}

    def test_a_non_participant_may_not_resolve_it(self):
        svc, writes = _service(CONVO_ROW)
        with pytest.raises(ValueError):
            svc.set_conversation_resolved(CONVO, STRANGER, True)
        assert writes == []

    def test_a_thread_that_does_not_exist_is_an_error_not_a_write(self):
        svc, writes = _service(None)
        with pytest.raises(ValueError):
            svc.set_conversation_resolved(CONVO, SCHOOL, True)
        assert writes == []


@pytest.mark.unit
class TestTheListCarriesEachSideItsOwnMark:
    """get_user_conversations hands the caller THEIR resolved_at and drops the
    other participant's -- the two ends of a thread are two queues."""

    def _list_for(self, user_id):
        row = {**CONVO_ROW, 'last_message_at': '2026-09-14T10:00:00',
               'last_message_preview': 'x', 'created_at': 'c', 'updated_at': 'u',
               'last_message_sender_id': PARENT,
               'resolved_at_p1': '2026-09-14T11:00:00', 'resolved_at_p2': None}
        svc = DirectMessageService()
        client = MagicMock()
        table = MagicMock()
        client.table.return_value = table
        table.select.return_value = table
        table.or_.return_value = table
        table.eq.return_value = table
        table.is_.return_value = table
        table.in_.return_value = table
        table.execute.return_value = MagicMock(data=[row])
        svc._get_client = lambda: client
        svc._get_users_info = lambda ids: {}
        # The unread recount, school flagging and avatar signing are not under
        # test; the recount reads the same fake and sees no unread rows.
        return svc.get_user_conversations(user_id)

    def test_the_school_sees_its_mark_and_not_the_parent_s(self):
        convos = self._list_for(SCHOOL)
        assert convos[0]['resolved_at'] == '2026-09-14T11:00:00'
        assert 'resolved_at_p1' not in convos[0]
        assert 'resolved_at_p2' not in convos[0]
        assert convos[0]['last_message_sender_id'] == PARENT

    def test_the_parent_sees_no_mark_because_they_made_none(self):
        convos = self._list_for(PARENT)
        assert convos[0]['resolved_at'] is None
        assert 'resolved_at_p1' not in convos[0]
