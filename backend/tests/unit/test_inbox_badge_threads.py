"""The SIS sidebar badge counts what the inbox page counts.

iCreate, 2026-09-15 (4b364a4c): "Why does it say I have 9+ messages when I
only have 3 unanswered?" The page lists threads waiting for a reply; the badge
summed unread MESSAGES across the school inbox, the coordinator's own DMs and
class chats the page cannot show. One chatty parent was five, and a thread the
office had already answered still counted if a message in it was never opened.

count_threads_needing_reply is the page's needsReply rule, server-side: the
other side spoke last, and the thread was not marked resolved since.
"""

from unittest.mock import patch

import pytest

from services.direct_message_service import DirectMessageService

ME = 'inbox-1'


def _count(convos):
    svc = DirectMessageService.__new__(DirectMessageService)
    with patch.object(DirectMessageService, 'get_user_conversations', return_value=convos):
        return svc.count_threads_needing_reply(ME)


def _convo(last_by, last_at='2026-09-15T10:00:00+00:00', resolved_at=None):
    return {'id': 'c', 'last_message_sender_id': last_by,
            'last_message_at': last_at, 'resolved_at': resolved_at, 'unread_count': 5}


@pytest.mark.unit
class TestThreadsNeedingReply:
    def test_a_thread_where_they_spoke_last_counts_once_however_many_messages(self):
        assert _count([_convo('parent-1')]) == 1

    def test_a_thread_where_we_spoke_last_does_not_count(self):
        assert _count([_convo(ME)]) == 0

    def test_resolved_after_their_last_message_does_not_count(self):
        assert _count([_convo('parent-1', last_at='2026-09-15T10:00:00+00:00',
                              resolved_at='2026-09-15T11:00:00+00:00')]) == 0

    def test_resolved_before_they_wrote_again_counts(self):
        assert _count([_convo('parent-1', last_at='2026-09-15T12:00:00+00:00',
                              resolved_at='2026-09-15T11:00:00+00:00')]) == 1

    def test_an_empty_thread_does_not_count(self):
        assert _count([_convo('parent-1', last_at=None)]) == 0

    def test_no_recorded_sender_still_counts(self):
        # Older payloads: better to show a thread than to hide one.
        assert _count([_convo(None)]) == 1

    def test_the_three_the_office_can_see(self):
        convos = [
            _convo('p1'), _convo('p2'), _convo('p3'),
            _convo(ME), _convo(ME), _convo(ME),
            _convo('p4', resolved_at='2026-09-16T00:00:00+00:00'),
        ]
        assert _count(convos) == 3

    def test_a_failed_read_is_zero_not_an_error(self):
        svc = DirectMessageService.__new__(DirectMessageService)
        with patch.object(DirectMessageService, 'get_user_conversations', side_effect=RuntimeError('db')):
            assert svc.count_threads_needing_reply(ME) == 0
