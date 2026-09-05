"""
Who spoke last in each thread.

iCreate, 2026-08-27 (2ca63bde): "It might be helpful if we had a spot for
messages to go once they are completed, so that only new messages that haven't
been replied to show" — and 2026-09-01 (7fb34ed4): "How do I send messages? I
see the inbox, but I don't have an outbox really."

Both are the same question asked from two ends: which of these is still waiting
on us, and which have we already answered? Unread does not answer it — a thread
read this morning and not yet replied to is exactly the one that gets forgotten.

The conversation row already stores `last_message_at`, so the sender is looked
up by asking for the messages AT those instants: one query, about one row per
thread, instead of every message in every thread.
"""

from unittest.mock import Mock, patch

import pytest

from services import school_inbox_service


SCHOOL = 'inbox-user'
PARENT = 'parent-1'


def _admin_returning(rows, raises=False):
    admin = Mock()
    chain = Mock()
    admin.table.return_value = chain
    for m in ('select', 'in_'):
        getattr(chain, m).return_value = chain
    if raises:
        chain.execute.side_effect = RuntimeError('postgrest is down')
    else:
        chain.execute.return_value = Mock(data=rows)
    return admin


def _annotate(convos, rows, raises=False):
    admin = _admin_returning(rows, raises=raises)
    with patch.object(school_inbox_service, '_admin', return_value=admin):
        school_inbox_service.annotate_last_sender(convos)
    return admin


@pytest.mark.unit
class TestAnnotateLastSender:
    def test_it_names_who_sent_the_last_message(self):
        convos = [{'id': 'c1', 'last_message_at': '2026-09-01T10:00:00Z'}]
        _annotate(convos, [{'conversation_id': 'c1', 'sender_id': PARENT,
                            'created_at': '2026-09-01T10:00:00Z'}])
        assert convos[0]['last_message_sender_id'] == PARENT

    def test_a_thread_the_school_answered_is_marked_as_ours(self):
        convos = [{'id': 'c1', 'last_message_at': '2026-09-01T10:00:00Z'}]
        _annotate(convos, [{'conversation_id': 'c1', 'sender_id': SCHOOL,
                            'created_at': '2026-09-01T10:00:00Z'}])
        assert convos[0]['last_message_sender_id'] == SCHOOL

    def test_two_threads_sharing_an_instant_do_not_swap_senders(self):
        """Matched on (thread, instant), never on the instant alone — two
        parents writing in the same second is not far-fetched at 8am."""
        same = '2026-09-01T10:00:00Z'
        convos = [{'id': 'c1', 'last_message_at': same},
                  {'id': 'c2', 'last_message_at': same}]
        _annotate(convos, [
            {'conversation_id': 'c2', 'sender_id': SCHOOL, 'created_at': same},
            {'conversation_id': 'c1', 'sender_id': PARENT, 'created_at': same},
        ])
        assert convos[0]['last_message_sender_id'] == PARENT
        assert convos[1]['last_message_sender_id'] == SCHOOL

    def test_an_older_message_in_the_thread_is_not_the_last_one(self):
        convos = [{'id': 'c1', 'last_message_at': '2026-09-01T10:00:00Z'}]
        _annotate(convos, [{'conversation_id': 'c1', 'sender_id': SCHOOL,
                            'created_at': '2026-08-30T09:00:00Z'}])
        assert convos[0]['last_message_sender_id'] is None

    def test_it_asks_only_for_the_instants_the_threads_name(self):
        """This is what keeps it one bounded query rather than the whole table."""
        convos = [{'id': 'c1', 'last_message_at': '2026-09-01T10:00:00Z'},
                  {'id': 'c2', 'last_message_at': '2026-09-02T11:00:00Z'}]
        admin = _annotate(convos, [])
        in_calls = {c.args[0]: c.args[1] for c in admin.table.return_value.select.return_value.in_.call_args_list}
        assert in_calls['conversation_id'] == ['c1', 'c2']
        assert in_calls['created_at'] == ['2026-09-01T10:00:00Z', '2026-09-02T11:00:00Z']

    def test_nothing_is_asked_for_an_empty_inbox(self):
        admin = _annotate([], [])
        admin.table.assert_not_called()

    def test_a_thread_with_no_messages_yet_is_skipped(self):
        convos = [{'id': 'c1', 'last_message_at': None}]
        admin = _annotate(convos, [])
        admin.table.assert_not_called()

    def test_a_failed_lookup_leaves_the_inbox_readable(self):
        """The annotation is a convenience; losing it must not lose the threads.
        Unannotated reads as "needs a reply" on the client, which errs toward
        showing a thread rather than hiding one."""
        convos = [{'id': 'c1', 'last_message_at': '2026-09-01T10:00:00Z'}]
        _annotate(convos, [], raises=True)
        assert 'last_message_sender_id' not in convos[0]
