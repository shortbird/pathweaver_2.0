"""Reading a thread neither invents one nor drops the newest half of it.

Two bugs that shipped together in the DM read path, both found on 2026-09-03
when an admin reported "a message notification from a parent, but no message in
the thread":

1. `get_conversation_messages` called `get_or_create_conversation`, so merely
   OPENING a contact card wrote a `message_conversations` row -- stamped with
   `last_message_at = now()`, which every client reads as "this thread has
   traffic". The row surfaced at the top of Messages as a brand-new
   conversation from someone who had never sent anything. 137 of the 230 rows
   in production were these.

2. The page was ordered `created_at` ASC and sliced `range(0, 49)`, i.e. the
   OLDEST 50 messages, and no client paginates. Past 50 messages a thread
   would simply stop showing new ones, with no error anywhere.
"""

from unittest.mock import MagicMock, patch

import pytest

from services.direct_message_service import DirectMessageService


# Real UUIDs: ids are validated as UUIDs before they reach the database, so
# placeholder strings would not exercise the lookups at all.
CONVO = '11111111-1111-4111-8111-111111111111'
READER = '22222222-2222-4222-8222-222222222222'
WRITER = '33333333-3333-4333-8333-333333333333'


class _ConversationTable:
    """A `message_conversations` fake that answers by the filters it was given,
    the way PostgREST would -- the service looks a thread up by id AND by
    participant pair, so a fake that ignores filters cannot tell them apart.
    Records every insert."""

    def __init__(self, rows):
        self.rows = list(rows)
        self.inserted = []
        self._filters = {}

    def select(self, *_a, **_k):
        self._filters = {}
        return self

    def eq(self, column, value):
        self._filters[column] = value
        return self

    def limit(self, _n):
        return self

    def insert(self, payload):
        self.inserted.append(payload)
        self.rows.append(payload)
        return _Executed([payload])

    def execute(self):
        return MagicMock(data=[
            r for r in self.rows
            if all(r.get(col) == val for col, val in self._filters.items())
        ])


class _Executed:
    def __init__(self, data):
        self._data = data

    def execute(self):
        return MagicMock(data=self._data)


class _MessagesTable:
    """A `direct_messages` fake that honours order/range, so the test can tell
    which END of the thread was fetched."""

    def __init__(self, rows):
        self.rows = rows
        self._desc = None
        self._range = None

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a):
        return self

    def order(self, _col, desc=False):
        self._desc = desc
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def execute(self):
        ordered = sorted(self.rows, key=lambda m: m['created_at'], reverse=self._desc)
        start, end = self._range
        return MagicMock(data=ordered[start:end + 1])


def _client(convo_table, messages_table):
    client = MagicMock()

    def table(name):
        if name == 'message_conversations':
            return convo_table
        if name == 'direct_messages':
            return messages_table
        return MagicMock()

    client.table.side_effect = table
    return client


@pytest.fixture
def service():
    return DirectMessageService()


@pytest.fixture(autouse=True)
def _passthrough_enrichment():
    """enrich_messages signs attachments and reads roles; the ordering is what
    these tests are about, so let the rows through untouched."""
    with patch('services.messaging_extras_service.enrich_messages',
               side_effect=lambda _kind, rows, _viewer: rows):
        yield


class TestOpeningAThreadDoesNotCreateOne:
    def test_no_conversation_row_is_written_for_a_thread_that_does_not_exist(self, service):
        convos = _ConversationTable([])

        with patch.object(service, '_get_client',
                          return_value=_client(convos, _MessagesTable([]))):
            assert service.get_conversation_messages(WRITER, READER) == []

        # The whole bug in one assertion: opening a contact you have never
        # written to must cost nothing.
        assert convos.inserted == []

    def test_an_existing_thread_is_found_by_the_other_persons_user_id(self, service):
        """The web client sends the other participant's id, not the conversation
        id (ChatWindow's `conversation.id` comes from contactToConversation).
        Dropping the create must not drop that lookup with it."""
        p1, p2 = sorted([READER, WRITER])
        convos = _ConversationTable([
            {'id': CONVO, 'participant_1_id': p1, 'participant_2_id': p2},
        ])
        messages = _MessagesTable([{'id': 'm1', 'created_at': '2026-09-01T00:00:00'}])

        with patch.object(service, '_get_client', return_value=_client(convos, messages)):
            out = service.get_conversation_messages(WRITER, READER)

        assert [m['id'] for m in out] == ['m1']
        assert convos.inserted == []

    def test_a_created_conversation_starts_with_no_last_message_at(self, service):
        """The send path still creates rows. NULL until a message actually
        lands, because a non-null last_message_at is what makes a client render
        an empty row as a live thread."""
        convos = _ConversationTable([])

        with patch.object(service, '_get_client',
                          return_value=_client(convos, _MessagesTable([]))):
            service.get_or_create_conversation(READER, WRITER)

        assert len(convos.inserted) == 1
        assert convos.inserted[0]['last_message_at'] is None

    def test_a_non_participant_is_refused(self, service):
        convos = _ConversationTable([
            {'id': CONVO, 'participant_1_id': 'someone', 'participant_2_id': 'else'},
        ])

        with patch.object(service, '_get_client',
                          return_value=_client(convos, _MessagesTable([]))):
            with pytest.raises(ValueError, match='not a participant'):
                service.get_conversation_messages(CONVO, READER)


class TestPagingFromTheNewestEnd:
    def _thread(self, n):
        # Timestamps sort lexicographically the way Postgres sorts them, so the
        # fraction is zero-padded rather than counting minutes past 59.
        return [{'id': f'm{i:03d}', 'created_at': f'2026-09-01T00:00:00.{i:06d}'}
                for i in range(n)]

    def test_a_long_thread_returns_its_newest_page(self, service):
        """The regression: 120 messages, a default page of 50, and the client
        never asks for an offset. It must get m070..m119, not m000..m049."""
        p1, p2 = sorted([READER, WRITER])
        convos = _ConversationTable([
            {'id': CONVO, 'participant_1_id': p1, 'participant_2_id': p2},
        ])
        messages = _MessagesTable(self._thread(120))

        with patch.object(service, '_get_client', return_value=_client(convos, messages)):
            out = service.get_conversation_messages(CONVO, READER)

        assert len(out) == 50
        assert out[-1]['id'] == 'm119'
        assert out[0]['id'] == 'm070'

    def test_the_page_is_still_oldest_to_newest(self, service):
        """Fetched newest-first for the slice, handed back chronological -- the
        client renders the list top to bottom without reversing it."""
        p1, p2 = sorted([READER, WRITER])
        convos = _ConversationTable([
            {'id': CONVO, 'participant_1_id': p1, 'participant_2_id': p2},
        ])
        messages = _MessagesTable(self._thread(5))

        with patch.object(service, '_get_client', return_value=_client(convos, messages)):
            out = service.get_conversation_messages(CONVO, READER)

        assert [m['id'] for m in out] == ['m000', 'm001', 'm002', 'm003', 'm004']

    def test_offset_walks_backwards_into_the_history(self, service):
        p1, p2 = sorted([READER, WRITER])
        convos = _ConversationTable([
            {'id': CONVO, 'participant_1_id': p1, 'participant_2_id': p2},
        ])
        messages = _MessagesTable(self._thread(120))

        with patch.object(service, '_get_client', return_value=_client(convos, messages)):
            out = service.get_conversation_messages(CONVO, READER, limit=50, offset=50)

        assert out[0]['id'] == 'm020'
        assert out[-1]['id'] == 'm069'


class TestConversationListWithEmptyThreads:
    def test_a_thread_with_no_last_message_at_sorts_last_and_does_not_crash(self, service):
        """`None` is not comparable to a string, so an unsorted-key crash here
        would 500 the entire inbox, not just hide one row."""
        rows = [
            {'id': 'c-empty', 'participant_1_id': READER, 'participant_2_id': WRITER,
             'last_message_at': None, 'last_message_preview': '',
             'unread_count_p1': 0, 'unread_count_p2': 0,
             'created_at': 'x', 'updated_at': 'x'},
            {'id': 'c-live', 'participant_1_id': READER, 'participant_2_id': CONVO,
             'last_message_at': '2026-09-01T00:00:00', 'last_message_preview': 'hi',
             'unread_count_p1': 0, 'unread_count_p2': 0,
             'created_at': 'x', 'updated_at': 'x'},
        ]
        client = MagicMock()
        convos = MagicMock()
        convos.select.return_value = convos
        convos.or_.return_value = _Executed(rows)
        client.table.return_value = convos

        with patch.object(service, '_get_client', return_value=client), \
             patch.object(service, '_get_users_info', return_value={}), \
             patch('utils.db_fetch.fetch_all_rows', return_value=[]), \
             patch('services.school_inbox_service.mark_school_conversations'), \
             patch('utils.storage_urls.sign_thumbs_in_place'):
            out = service.get_user_conversations(READER)

        assert [c['id'] for c in out] == ['c-live', 'c-empty']
