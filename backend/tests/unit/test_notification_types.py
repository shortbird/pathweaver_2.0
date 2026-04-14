"""Unit tests for notification-type coverage.

Locks in the set of notification types that should fire mobile push,
catches accidental removals, and smoke-tests the helper methods for
the bounty lifecycle.
"""

from unittest.mock import MagicMock, patch

from services.notification_service import (
    MOBILE_PUSH_NOTIFICATION_TYPES,
    NotificationService,
)


REQUIRED_MOBILE_PUSH_TYPES = {
    'message_received',
    'quest_invitation',
    'task_approved',
    'task_revision_requested',
    'announcement',
    'observer_comment',
    'observer_added',
    'parent_approval_required',
    'bounty_posted',
    'bounty_claimed',
    'bounty_submission',
}


FORBIDDEN_TYPES = {
    # Removed when the like/reaction feature was deleted (2026-04-14)
    'observer_like',
    # Removed when the badges feature was deleted (2026-04-14)
    'badge_earned',
}


def test_mobile_push_types_include_required_set():
    missing = REQUIRED_MOBILE_PUSH_TYPES - MOBILE_PUSH_NOTIFICATION_TYPES
    assert not missing, f"Mobile push types missing required entries: {missing}"


def test_mobile_push_types_exclude_removed():
    remaining = FORBIDDEN_TYPES & MOBILE_PUSH_NOTIFICATION_TYPES
    assert not remaining, f"Mobile push types still contain removed entries: {remaining}"


def test_notify_bounty_posted_writes_expected_record():
    with patch('supabase.create_client') as mock_create_client:
        supabase = MagicMock()
        mock_create_client.return_value = supabase
        # insert chain
        supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{'id': 'notif-1', 'type': 'bounty_posted'}]
        )

        svc = NotificationService()
        # Avoid hitting realtime broadcast during test
        svc._broadcast_realtime = MagicMock(return_value=True)
        svc._send_expo_push_notification = MagicMock(return_value=True)

        result = svc.notify_bounty_posted(
            student_id='student-1',
            bounty_title='Build a rocket',
            poster_name='Dr. Smith',
            bounty_id='bounty-1',
        )

    assert result['type'] == 'bounty_posted'
    insert_args = supabase.table.return_value.insert.call_args
    payload = insert_args[0][0]
    assert payload['user_id'] == 'student-1'
    assert payload['type'] == 'bounty_posted'
    assert 'Build a rocket' in payload['message']
    assert payload['link'] == '/bounties/bounty-1'


def test_notify_bounty_claimed_writes_expected_record():
    with patch('supabase.create_client') as mock_create_client:
        supabase = MagicMock()
        mock_create_client.return_value = supabase
        supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{'id': 'notif-2', 'type': 'bounty_claimed'}]
        )

        svc = NotificationService()
        svc._broadcast_realtime = MagicMock(return_value=True)
        svc._send_expo_push_notification = MagicMock(return_value=True)

        svc.notify_bounty_claimed(
            poster_id='poster-1',
            student_name='Jane',
            bounty_title='Learn Spanish',
            bounty_id='b-2',
            claim_id='c-2',
        )

    payload = supabase.table.return_value.insert.call_args[0][0]
    assert payload['user_id'] == 'poster-1'
    assert payload['type'] == 'bounty_claimed'
    assert 'Jane' in payload['message']
    assert payload['metadata']['claim_id'] == 'c-2'
