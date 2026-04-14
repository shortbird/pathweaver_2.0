"""Unit test: observer feed endpoint must exclude blocked users' content."""

import json
from unittest.mock import MagicMock, patch


def test_feed_excludes_blocked_student(client, mock_verify_token):
    """Build a supabase mock whose user_blocks table returns one blocked id,
    and assert that learning_events / quest_task_completions queries receive
    the in_() call without that id.
    """
    supabase = MagicMock()
    captured_in_calls: list[list[str]] = []

    def table(name):
        t = MagicMock()
        if name == 'users':
            # role lookup at top of feed route
            t.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data={'role': 'student', 'org_role': None}
            )
            # students_map lookup: select().in_().execute()
            t.select.return_value.in_.return_value.execute.return_value = MagicMock(data=[])
        elif name == 'observer_student_links':
            t.select.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[
                    {'student_id': 'student-allowed', 'can_view_evidence': True},
                    {'student_id': 'student-blocked', 'can_view_evidence': True},
                ]
            )
        elif name == 'user_blocks':
            t.select.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[{'blocked_id': 'student-blocked'}]
            )
        elif name == 'parent_student_links':
            t.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        elif name in ('quest_task_completions', 'learning_events'):
            # Capture the user_ids passed to in_()
            def _in(col, ids):
                captured_in_calls.append(list(ids))
                chain = MagicMock()
                chain.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
                return chain
            t.select.return_value.in_.side_effect = _in
        else:
            # Generic empty results for any other tables queried in the route
            empty = MagicMock()
            empty.execute.return_value = MagicMock(data=[])
            t.select.return_value = empty
            t.select.return_value.eq.return_value = empty
            t.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            t.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            t.select.return_value.in_.return_value.execute.return_value = MagicMock(data=[])
            t.select.return_value.in_.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        return t

    supabase.table.side_effect = table

    with patch('routes.observer.feed.get_supabase_admin_client', return_value=supabase):
        resp = client.get(
            '/api/observers/feed',
            headers={'Authorization': 'Bearer t'},
        )

    assert resp.status_code == 200
    # Assert the blocked student_id was filtered out of every bulk .in_() query
    # that fetches feed content.
    for ids in captured_in_calls:
        assert 'student-blocked' not in ids, f"Blocked student leaked into query: {ids}"
        # The allowed student must survive
        assert 'student-allowed' in ids


def test_feed_filter_rejects_blocked_student_filter(client, mock_verify_token):
    """If the caller tries to filter by a blocked student id, feed 403s."""
    supabase = MagicMock()

    def table(name):
        t = MagicMock()
        if name == 'users':
            t.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data={'role': 'student', 'org_role': None}
            )
        elif name == 'observer_student_links':
            t.select.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[{'student_id': 'student-blocked', 'can_view_evidence': True}]
            )
        elif name == 'user_blocks':
            t.select.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[{'blocked_id': 'student-blocked'}]
            )
        elif name == 'parent_student_links':
            t.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        else:
            t.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        return t

    supabase.table.side_effect = table

    with patch('routes.observer.feed.get_supabase_admin_client', return_value=supabase):
        resp = client.get(
            '/api/observers/feed?student_id=student-blocked',
            headers={'Authorization': 'Bearer t'},
        )

    assert resp.status_code == 403
