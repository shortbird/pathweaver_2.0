"""
The archive says which of its rows are a board post's receipt.

A Community Hub post made with "also notify" is two rows: the board post and
the send (recipients snapshot, notification, email), linked by
announcements.source_announcement_id. A family reads the notice once, as the
board post, which carries pinned and urgent; the send is its receipt. Until
M1 (docs/sis/CONSOLIDATION_PLAN.md) each client worked out which archive rows
were receipts -- the web by the link, the phone by matching title and day, so
an edited title showed twice on the phone. The archive now marks them
`on_board`, and a client renders what is not.

The send stays in the archive's rows either way: the read receipts a family
reports are keyed on it, and once the post expires or is taken down it is the
notice, so `on_board` is "the source post is on the board right now", not
"has a source".
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_community_service as community


@pytest.mark.unit
class TestVisibleAnnouncementIds:

    def test_only_posts_a_family_can_read_now(self):
        rows = [
            {'id': 'live', 'created_at': '2026-09-01T00:00:00Z'},
            {'id': 'scheduled', 'created_at': '2026-09-01T00:00:00Z', 'publish_at': '2099-01-01T00:00:00Z'},
            {'id': 'expired', 'created_at': '2026-09-01T00:00:00Z', 'expires_at': '2000-01-01T00:00:00Z'},
        ]
        with patch.object(community, 'list_announcements', wraps=None) as la:
            la.side_effect = lambda org_id, include_hidden=True: (
                [r for r in rows if r['id'] == 'live'] if not include_hidden else rows)
            assert community.visible_announcement_ids('org-1') == {'live'}
            la.assert_called_once_with('org-1', include_hidden=False)


PARENT = {'id': 'test-user-123', 'organization_id': 'org-1', 'role': 'org_managed',
          'org_role': 'parent', 'org_roles': ['parent'], 'is_org_admin': False,
          'email': 'p@x.y'}


class _Table:
    """The decorator reads the caller's row as a list; the route reads it with
    .single() as a dict. Both come from the same stub."""

    def __init__(self, name):
        self.name = name
        self._single = False

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def single(self):
        self._single = True
        return self

    def execute(self):
        if self.name == 'users':
            return Mock(data=PARENT if self._single else [PARENT])
        if self.name == 'organizations':
            return Mock(data={'name': 'iCreate'})
        return Mock(data=[])


ROWS = [
    {'id': 'send-1', 'title': 'Picture day', 'message': 'Wear a shirt', 'target_audience': 'parents',
     'author_id': 'a', 'created_at': '2026-09-10T10:00:00Z', 'source_announcement_id': 'board-live',
     'attachments': None},
    {'id': 'send-2', 'title': 'Old news', 'message': 'From August', 'target_audience': 'parents',
     'author_id': 'a', 'created_at': '2026-08-10T10:00:00Z', 'source_announcement_id': 'board-expired',
     'attachments': None},
    {'id': 'send-3', 'title': 'Direct send', 'message': 'From the composer', 'target_audience': 'everyone',
     'author_id': 'a', 'created_at': '2026-09-11T10:00:00Z', 'source_announcement_id': None,
     'attachments': None},
]


@pytest.mark.unit
class TestTheArchiveMarksReceipts:

    def test_on_board_means_the_source_post_is_on_the_board_now(self, client, auth_headers, mock_verify_token):
        stub = Mock()
        stub.table.side_effect = _Table
        with patch('database.get_supabase_admin_client', return_value=stub), \
             patch('routes.announcements.get_supabase_admin_client', return_value=stub), \
             patch('routes.announcements.fetch_range', return_value=Mock(data=ROWS, count=3)), \
             patch('routes.announcements._received_announcement_ids', return_value=[]), \
             patch('services.sis_community_service.visible_announcement_ids', return_value={'board-live'}):
            resp = client.get('/api/announcements/archive', headers=auth_headers)
        assert resp.status_code == 200, resp.get_json()
        by_id = {a['id']: a for a in resp.get_json()['announcements']}
        assert by_id['send-1']['on_board'] is True      # its post is live: the board shows it
        assert by_id['send-2']['on_board'] is False     # its post expired: the archive is the notice
        assert by_id['send-3']['on_board'] is False     # never a board post
        # The receipt row is still returned -- read receipts are keyed on it.
        assert set(by_id) == {'send-1', 'send-2', 'send-3'}
