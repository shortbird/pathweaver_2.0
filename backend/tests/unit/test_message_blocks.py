"""Unit test: direct messaging must deny if either side has blocked the other."""

from unittest.mock import MagicMock, patch

from services.direct_message_service import DirectMessageService


def _build_mock_with_block(block_rows):
    supabase = MagicMock()

    def table(name):
        t = MagicMock()
        if name == 'user_blocks':
            t.select.return_value.or_.return_value.limit.return_value.execute.return_value = MagicMock(
                data=block_rows
            )
        else:
            # Default no-op chains — force fallback to no relationship, so test
            # depends on the block check alone.
            t.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data={'role': 'student', 'org_role': None, 'organization_id': None}
            )
            t.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            t.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        return t

    supabase.table.side_effect = table
    return supabase


def test_can_message_user_false_when_blocker_blocks_target():
    supabase = _build_mock_with_block([{'id': 'blk-1'}])
    svc = DirectMessageService()
    with patch.object(svc, '_get_client', return_value=supabase):
        assert svc.can_message_user('user-A', 'user-B') is False


def test_can_message_user_false_when_target_blocked_caller():
    # Same mock (the or_ query covers both directions)
    supabase = _build_mock_with_block([{'id': 'blk-2'}])
    svc = DirectMessageService()
    with patch.object(svc, '_get_client', return_value=supabase):
        assert svc.can_message_user('user-B', 'user-A') is False


def test_can_message_user_block_check_failure_does_not_deny():
    """If the block lookup errors, we should not block legitimate messaging."""
    supabase = MagicMock()

    def table(name):
        t = MagicMock()
        if name == 'user_blocks':
            t.select.return_value.or_.return_value.limit.return_value.execute.side_effect = Exception('boom')
        elif name == 'users':
            t.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data={'role': 'superadmin', 'org_role': None, 'organization_id': None}
            )
        return t

    supabase.table.side_effect = table
    svc = DirectMessageService()
    with patch.object(svc, '_get_client', return_value=supabase):
        # Superadmin path should still allow even though block check raised
        assert svc.can_message_user('user-A', 'user-B') is True
