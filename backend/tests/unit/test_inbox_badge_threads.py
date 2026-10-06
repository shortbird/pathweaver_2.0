"""The SIS sidebar badge counts what the inbox page counts.

iCreate, 2026-09-15 (4b364a4c): "Why does it say I have 9+ messages when I
only have 3 unanswered?" The badge summed unread MESSAGES; one chatty parent
was five. So it counts threads, one per row on the page.

iCreate, 2026-10-06 (13aa8bd0): "It says I have 5 new messages but I have no
unread messages in my folder." The badge then counted the Open view (the other
side spoke last, nobody pressed Close). All five of her threads were read and
most ended in "thank you". Owner decision: the badge counts threads with
unread messages; the Open view button keeps the needs-reply count.

count_threads_with_unread is the page's hasUnread rule, server-side.
"""

from unittest.mock import patch

import pytest

from services.direct_message_service import DirectMessageService

ME = 'inbox-1'


def _count(convos, office=None):
    from services import school_inbox_service
    svc = DirectMessageService.__new__(DirectMessageService)
    with patch.object(DirectMessageService, 'get_user_conversations', return_value=convos), \
         patch.object(school_inbox_service, 'office_inbox_id', return_value=office):
        return svc.count_threads_with_unread(ME)


def _convo(last_by='parent-1', unread=5, last_at='2026-09-15T10:00:00+00:00',
           resolved_at=None, other='parent-1'):
    return {'id': 'c', 'last_message_sender_id': last_by, 'other_user': {'id': other},
            'last_message_at': last_at, 'resolved_at': resolved_at, 'unread_count': unread}


@pytest.mark.unit
class TestThreadsWithUnread:
    def test_a_thread_with_unread_counts_once_however_many_messages(self):
        assert _count([_convo(unread=5)]) == 1

    def test_a_read_open_thread_does_not_count(self):
        """13aa8bd0: they spoke last, nobody closed it, but it is read."""
        assert _count([_convo('parent-1', unread=0)]) == 0

    def test_rebeccas_five_read_open_threads_count_zero(self):
        assert _count([_convo(f'p{i}', unread=0, other=f'p{i}') for i in range(5)]) == 0

    def test_an_unread_thread_counts_even_if_closed_or_our_turn(self):
        # Unread is unread: the badge points at the unread marker, whatever
        # view the thread is in.
        assert _count([_convo(ME, unread=1)]) == 1
        assert _count([_convo('parent-1', unread=1,
                              resolved_at='2026-09-15T11:00:00+00:00')]) == 1

    def test_missing_unread_count_is_read(self):
        c = _convo()
        del c['unread_count']
        assert _count([c]) == 0

    def test_the_offices_own_thread_with_its_school_is_not_counted(self):
        """iCreate, ticket 16d13eb4: "my messages says I have 1 unread, but I
        have no idea where that message might be." GET /conversations hides
        the office member's own thread with the school inbox account (they
        read it on the School tab, as the school), and the count used to walk
        get_user_conversations, so it still counted the hidden thread."""
        convos = [_convo('inbox-9', other='inbox-9'), _convo('teacher-1', other='teacher-1')]
        assert _count(convos, office='inbox-9') == 1
        # A teacher (no office inbox) still counts a thread with the school.
        assert _count(convos, office=None) == 2

    def test_a_failed_read_is_zero_not_an_error(self):
        svc = DirectMessageService.__new__(DirectMessageService)
        with patch.object(DirectMessageService, 'get_user_conversations', side_effect=RuntimeError('db')):
            assert svc.count_threads_with_unread(ME) == 0


def _admin_client_for_role(role):
    from unittest.mock import Mock
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


@pytest.mark.unit
def test_school_tab_count_adds_the_schools_group_threads_with_unread(
        client, auth_headers, mock_verify_token):
    """iCreate, ticket 16d13eb4: "my messages says I have 1 unread, but I have
    no idea where that message might be." One rule on every tab: 1:1 threads
    with unread + group threads with unread (13aa8bd0). On the School tab the groups
    are the ones the school owns (get_school_groups), so owned_by is the
    inbox account."""
    from unittest.mock import Mock
    from services import school_inbox_service as inbox
    org = {'id': 'org-1', 'name': 'iCreate', 'is_active': True}
    svc = Mock()
    svc.count_threads_with_unread.return_value = 2
    groups = Mock()
    groups.count_groups_with_unread.return_value = 1
    with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('org_admin')), \
         patch('services.sis_service.resolve_org_id', return_value='org-1'), \
         patch.object(inbox, 'school_account', return_value=(org, 'inbox-1')), \
         patch.object(inbox, 'inbox_access', return_value=True, create=True), \
         patch('routes.school_inbox.message_service', svc), \
         patch('routes.school_inbox._groups', return_value=groups):
        resp = client.get('/api/school-inbox/unread-count', headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()['data']
    assert data['unread_threads'] == 3
    assert data['needs_reply_threads'] == 3  # old name, old bundles
    assert data['direct_threads'] == 2 and data['group_threads'] == 1
    groups.count_groups_with_unread.assert_called_once_with('inbox-1', owned_by='inbox-1')
