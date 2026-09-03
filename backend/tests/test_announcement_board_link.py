"""
A board post and the send it spawned are one notice to a family.

Posting on the Community Hub with "notify" writes two rows: the
sis_announcements board post and an announcements fan-out row. Nothing tied
them together, so:

  * editing the post's title broke the family feed's title+day dedupe and the
    same notice showed twice (iCreate, 2026-08-27);
  * deleting the post left the send alive, so "Summit Program Info" was gone
    from the admin side and still on the parent dashboard (iCreate, 2026-08-28).

announcements.source_announcement_id is that link, and these are the two halves
that have to move together.
"""

from unittest.mock import Mock, patch

import pytest

from services import announcement_service as svc


def _admin_client(select_rows):
    """A Supabase double whose every chained call returns itself."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'insert', 'update', 'delete', 'filter',
                    'limit', 'range', 'order'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=select_rows)
    return client, table


@pytest.mark.unit
class TestPublishRecordsItsSource:
    def test_the_send_carries_the_board_post_id(self):
        client, table = _admin_client([{'id': 'sent-1'}])
        with patch('services.announcement_service._admin', return_value=client), \
                patch('services.announcement_service.recipients_for', return_value=set()), \
                patch('services.announcement_service._snapshot_recipients'):
            svc.publish('org-1', 'author-1', 'Picture day', 'Wear a shirt',
                        ['parents'], source_announcement_id='board-9')
        row = table.insert.call_args[0][0]
        assert row['source_announcement_id'] == 'board-9'

    def test_a_messaging_page_send_has_no_source(self):
        client, table = _admin_client([{'id': 'sent-1'}])
        with patch('services.announcement_service._admin', return_value=client), \
                patch('services.announcement_service.recipients_for', return_value=set()), \
                patch('services.announcement_service._snapshot_recipients'):
            svc.publish('org-1', 'author-1', 'Picture day', 'Wear a shirt', ['parents'])
        assert table.insert.call_args[0][0]['source_announcement_id'] is None


@pytest.mark.unit
class TestRetract:
    def test_it_deletes_the_row_and_sweeps_the_notifications(self):
        client, table = _admin_client([])
        with patch('services.announcement_service._admin', return_value=client):
            svc.retract('sent-1')
        assert table.delete.call_count == 2          # announcements + notifications
        assert client.table.call_args_list[0][0][0] == 'announcements'
        assert client.table.call_args_list[1][0][0] == 'notifications'

    def test_a_failed_notification_sweep_still_leaves_it_deleted(self):
        client, table = _admin_client([])
        table.execute.side_effect = [Mock(data=[]), RuntimeError('boom')]
        with patch('services.announcement_service._admin', return_value=client):
            svc.retract('sent-1')  # must not raise

    def test_deleting_a_board_post_pulls_every_send_it_spawned(self):
        client, _ = _admin_client([{'id': 'sent-1'}, {'id': 'sent-2'}])
        with patch('services.announcement_service._admin', return_value=client), \
                patch('services.announcement_service.retract') as retract:
            assert svc.retract_for_source('board-9') == 2
        assert [c[0][0] for c in retract.call_args_list] == ['sent-1', 'sent-2']

    def test_a_board_post_that_was_never_sent_retracts_nothing(self):
        client, _ = _admin_client([])
        with patch('services.announcement_service._admin', return_value=client), \
                patch('services.announcement_service.retract') as retract:
            assert svc.retract_for_source('board-9') == 0
        retract.assert_not_called()


@pytest.mark.unit
class TestRevise:
    def test_an_edited_title_reaches_the_send(self):
        client, table = _admin_client([{'id': 'sent-1'}])
        with patch('services.announcement_service._admin', return_value=client):
            assert svc.revise_for_source('board-9', title='Picture day (moved)') == 1
        assert table.update.call_args_list[0][0][0] == {'title': 'Picture day (moved)'}

    def test_the_bell_notification_is_updated_too(self):
        """The notification carries its own copy of the words; an edit that stops
        at the announcements row leaves the old text in everyone's list."""
        client, table = _admin_client([{'id': 'sent-1'}])
        with patch('services.announcement_service._admin', return_value=client):
            svc.revise_for_source('board-9', title='New title')
        tables = [c[0][0] for c in client.table.call_args_list]
        assert 'notifications' in tables

    def test_an_edit_with_nothing_in_it_touches_nothing(self):
        client, table = _admin_client([{'id': 'sent-1'}])
        with patch('services.announcement_service._admin', return_value=client):
            assert svc.revise_for_source('board-9') == 0
        table.update.assert_not_called()

    def test_the_body_is_sanitized_on_the_way_through(self):
        client, table = _admin_client([{'id': 'sent-1'}])
        with patch('services.announcement_service._admin', return_value=client):
            svc.revise_for_source('board-9', content='<p>Hi</p><script>x()</script>')
        assert 'script' not in table.update.call_args_list[0][0][0]['message']
