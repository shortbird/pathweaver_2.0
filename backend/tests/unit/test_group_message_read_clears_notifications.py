"""Reading a group chat clears its 'message_received' notifications.

Group reads only stamped group_members.last_read_at, so opening a class chat
left the bell holding one unread notification per message — reported by a
parent on 2026-09-02 ("I still need to click into the message inbox itself to
clear the notification"). DMs already did this; groups now match.
"""

from unittest.mock import MagicMock, patch

from services.group_message_service import GroupMessageService
from services.notification_service import NotificationService


def _service_with_mock_client():
    supabase = MagicMock()
    service = GroupMessageService()
    service._get_client = MagicMock(return_value=supabase)
    service.is_group_member = MagicMock(return_value=True)
    return service, supabase


def test_mark_as_read_clears_group_notifications():
    service, supabase = _service_with_mock_client()

    with patch.object(
        NotificationService, 'mark_group_message_notifications_read', return_value=3
    ) as clear:
        assert service.mark_as_read('user-1', 'group-1') is True

    clear.assert_called_once_with(user_id='user-1', group_id='group-1')
    supabase.table.assert_any_call('group_members')


def test_mark_as_read_still_succeeds_when_clearing_notifications_fails():
    """Notification cleanup is best-effort — it must not fail the read."""
    service, _ = _service_with_mock_client()

    with patch.object(
        NotificationService,
        'mark_group_message_notifications_read',
        side_effect=Exception('postgrest down'),
    ):
        assert service.mark_as_read('user-1', 'group-1') is True


def test_mark_group_message_notifications_read_filters_on_group_metadata():
    supabase = MagicMock()
    chain = (
        supabase.table.return_value
        .update.return_value
        .eq.return_value.eq.return_value.eq.return_value.eq.return_value
    )
    chain.execute.return_value = MagicMock(data=[{'id': 'n1'}, {'id': 'n2'}])

    service = NotificationService()
    service.supabase = supabase

    assert service.mark_group_message_notifications_read('user-1', 'group-1') == 2

    supabase.table.assert_called_with('notifications')
    supabase.table.return_value.update.assert_called_once_with({'is_read': True})

    # The four filters, in order: recipient, type, unread-only, this group.
    eq_calls = []
    node = supabase.table.return_value.update.return_value
    for _ in range(4):
        eq_calls.append(node.eq.call_args[0])
        node = node.eq.return_value
    assert eq_calls == [
        ('user_id', 'user-1'),
        ('type', 'message_received'),
        ('is_read', False),
        ('metadata->>group_id', 'group-1'),
    ]


def test_mark_group_message_notifications_read_swallows_errors():
    supabase = MagicMock()
    supabase.table.side_effect = Exception('boom')

    service = NotificationService()
    service.supabase = supabase

    assert service.mark_group_message_notifications_read('user-1', 'group-1') == 0
