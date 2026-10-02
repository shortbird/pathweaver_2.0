"""Viewing as someone must not change what they have read.

Ticket 50082917, Marika (iCreate, org_admin): "I'm viewing as Nicole Connole
and I looked at one of her messages and the notification icon disappeared. so
now it's marked unread and shouldn't be."

During a masquerade every request runs as the target, so every "mark read"
landed on Nicole's account. Each read-state route now asks one helper
(utils/auth/read_state.masquerade_read_only) and, during a masquerade, answers
its normal success shape without writing anything. Outside a masquerade the
write still happens; those cases are pinned here too.

The same ticket was filed while viewing as Nicole, and the bug report row named
Nicole as the reporter. The create route now records the real admin and keeps
the target in extra.viewing_as.
"""

import json
from unittest.mock import Mock, patch

import pytest

from utils.auth import read_state


def _data(resp):
    body = json.loads(resp.data)
    return body.get('data', body)


def _admin_client_for_role(role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


# ── The helper ───────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestHelper:
    def test_true_during_a_masquerade(self):
        with patch.object(read_state.session_manager, 'is_masquerading', return_value=True):
            assert read_state.masquerade_read_only() is True

    def test_false_otherwise(self):
        with patch.object(read_state.session_manager, 'is_masquerading', return_value=False):
            assert read_state.masquerade_read_only() is False

    def test_a_broken_check_keeps_normal_behaviour(self):
        with patch.object(read_state.session_manager, 'is_masquerading',
                          side_effect=RuntimeError('no request context')):
            assert read_state.masquerade_read_only() is False


# ── Direct messages ──────────────────────────────────────────────────────────

@pytest.mark.unit
class TestDirectMessages:
    @pytest.mark.parametrize('masq', [True, False])
    def test_mark_conversation_read(self, client, auth_headers, mock_verify_token, masq):
        svc = Mock()
        svc.mark_conversation_read.return_value = 3
        with patch('routes.direct_messages.masquerade_read_only', return_value=masq), \
             patch('routes.direct_messages.message_service', svc):
            resp = client.post('/api/messages/conversations/conv-1/read', headers=auth_headers)
        assert resp.status_code == 200
        data = _data(resp)
        assert data['success'] is True
        assert data['conversation_id'] == 'conv-1'
        if masq:
            svc.mark_conversation_read.assert_not_called()
            assert data['marked_read'] == 0
        else:
            svc.mark_conversation_read.assert_called_once_with('conv-1', 'test-user-123')
            assert data['marked_read'] == 3

    @pytest.mark.parametrize('masq', [True, False])
    def test_mark_one_message_read(self, client, auth_headers, mock_verify_token, masq):
        svc = Mock()
        svc.mark_as_read.return_value = True
        with patch('routes.direct_messages.masquerade_read_only', return_value=masq), \
             patch('routes.direct_messages.message_service', svc):
            resp = client.put('/api/messages/msg-1/read', headers=auth_headers)
        assert resp.status_code == 200
        assert _data(resp) == {'success': True, 'message_id': 'msg-1'}
        assert svc.mark_as_read.called is (not masq)


# ── Group chats ──────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestGroupMessages:
    @pytest.mark.parametrize('masq', [True, False])
    def test_mark_group_read(self, client, auth_headers, mock_verify_token, masq):
        svc = Mock()
        svc.mark_as_read.return_value = True
        with patch('routes.group_messages.masquerade_read_only', return_value=masq), \
             patch('routes.group_messages.group_service', svc):
            resp = client.post('/api/groups/g-1/read', headers=auth_headers)
        assert resp.status_code == 200
        assert _data(resp) == {'success': True, 'group_id': 'g-1'}
        assert svc.mark_as_read.called is (not masq)

    @pytest.mark.parametrize('masq', [True, False])
    def test_opening_a_group_reads_without_marking(self, client, auth_headers,
                                                  mock_verify_token, masq):
        svc = Mock()
        svc.get_messages.return_value = [{'id': 'm1'}]
        with patch('routes.group_messages.masquerade_read_only', return_value=masq), \
             patch('routes.group_messages.group_service', svc):
            resp = client.get('/api/groups/g-1/messages', headers=auth_headers)
        assert resp.status_code == 200
        assert _data(resp)['messages'] == [{'id': 'm1'}]
        assert svc.get_messages.call_args.kwargs['mark_read'] is (not masq)


@pytest.mark.unit
class TestGroupServiceMarkRead:
    """The service skips last_read_at and the bell row when mark_read=False."""

    def _run(self, mark_read):
        from unittest.mock import MagicMock
        from services.group_message_service import GroupMessageService
        supabase = MagicMock()
        supabase.table.return_value.select.return_value.eq.return_value.order.return_value \
            .range.return_value.execute.return_value = MagicMock(data=[])
        service = GroupMessageService()
        service._get_client = MagicMock(return_value=supabase)
        service.is_group_member = MagicMock(return_value=True)
        with patch('services.messaging_extras_service.enrich_messages', return_value=[]), \
             patch('repositories.notification_repository.NotificationRepository') as repo:
            assert service.get_messages('u1', 'g-1', mark_read=mark_read) == []
        tables = [c.args[0] for c in supabase.table.call_args_list]
        return tables, repo

    def test_read_only_writes_nothing(self):
        tables, repo = self._run(False)
        assert 'group_members' not in tables
        repo.assert_not_called()

    def test_default_still_marks_read(self):
        tables, repo = self._run(True)
        assert 'group_members' in tables
        repo.return_value.mark_group_messages_read.assert_called_once_with('u1', 'g-1')


# ── Notifications (the bell) ─────────────────────────────────────────────────

@pytest.mark.unit
class TestNotifications:
    @pytest.mark.parametrize('masq', [True, False])
    def test_mark_one_read(self, client, auth_headers, mock_verify_token, masq):
        svc = Mock()
        with patch('routes.notifications.masquerade_read_only', return_value=masq), \
             patch('routes.notifications.get_supabase_admin_client', return_value=Mock()), \
             patch('routes.notifications.NotificationService', return_value=svc):
            resp = client.put('/api/notifications/n-1/read', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['success'] is True
        assert svc.mark_as_read.called is (not masq)

    @pytest.mark.parametrize('masq', [True, False])
    def test_mark_all_read(self, client, auth_headers, mock_verify_token, masq):
        svc = Mock()
        svc.mark_all_as_read.return_value = 4
        with patch('routes.notifications.masquerade_read_only', return_value=masq), \
             patch('routes.notifications.get_supabase_admin_client', return_value=Mock()), \
             patch('routes.notifications.NotificationService', return_value=svc):
            resp = client.put('/api/notifications/mark-all-read', headers=auth_headers)
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body['success'] is True
        assert svc.mark_all_as_read.called is (not masq)
        assert body['message'] == ('Marked 0 notifications as read' if masq
                                   else 'Marked 4 notifications as read')


# ── Announcements ────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_announcement_reads_are_not_written_while_viewing_as(client, auth_headers,
                                                            mock_verify_token):
    admin = Mock()
    with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('student')), \
         patch('routes.announcements.masquerade_read_only', return_value=True), \
         patch('routes.announcements.get_supabase_admin_client', return_value=admin):
        resp = client.post('/api/announcements/mark-read', headers=auth_headers,
                           json={'announcement_ids': ['3f1c1b1e-0000-4000-8000-000000000001']})
    assert resp.status_code == 200
    assert json.loads(resp.data) == {'success': True, 'marked': 0}
    admin.table.assert_not_called()


# ── School inbox ─────────────────────────────────────────────────────────────

ORG = {'id': 'org-1', 'name': 'iCreate', 'is_active': True}
CONVO = {'id': 'conv-1', 'participant_1_id': 'mum', 'participant_2_id': 'inbox-1',
         'last_message_at': '2026-10-01T12:00:00Z'}


@pytest.fixture
def as_office():
    from services import school_inbox_service as inbox
    with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('org_admin')), \
         patch('services.sis_service.resolve_org_id', return_value='org-1'), \
         patch.object(inbox, 'school_account', return_value=(ORG, 'inbox-1')), \
         patch.object(inbox, 'inbox_access', return_value=True, create=True):
        yield inbox


@pytest.mark.unit
class TestSchoolInbox:
    @pytest.mark.parametrize('masq', [True, False])
    def test_opening_a_thread(self, client, auth_headers, mock_verify_token, as_office, masq):
        inbox = as_office
        svc = Mock()
        svc.get_conversation_messages.return_value = [{'id': 'm1', 'sender_id': 'mum'}]
        with patch('routes.school_inbox.masquerade_read_only', return_value=masq), \
             patch.object(inbox, 'conversation_for_inbox', return_value=CONVO), \
             patch.object(inbox, 'thread_access', return_value='office'), \
             patch.object(inbox, 'mark_conversation_read') as mark, \
             patch.object(inbox, 'record_thread_read') as record, \
             patch.object(inbox, 'thread_readers', return_value=[]), \
             patch('routes.school_inbox.message_service', svc):
            resp = client.get('/api/school-inbox/conversations/conv-1', headers=auth_headers)
        assert resp.status_code == 200
        assert _data(resp)['messages'] == [{'id': 'm1', 'sender_id': 'mum'}]
        assert mark.called is (not masq)
        assert record.called is (not masq)

    @pytest.mark.parametrize('masq', [True, False])
    def test_opening_a_group(self, client, auth_headers, mock_verify_token, as_office, masq):
        inbox = as_office
        groups = Mock()
        groups.get_messages.return_value = [{'id': 'm1'}]
        bell = Mock()
        with patch('routes.school_inbox.masquerade_read_only', return_value=masq), \
             patch('routes.school_inbox._school_group_or_404',
                   return_value=({'org': ORG, 'inbox_user_id': 'inbox-1', 'via': 'office'}, None)), \
             patch('routes.school_inbox._groups', return_value=groups), \
             patch.object(inbox, 'record_thread_read') as record, \
             patch.object(inbox, 'thread_readers', return_value=[]), \
             patch('services.notification_service.NotificationService', return_value=bell):
            resp = client.get('/api/school-inbox/groups/g-1/messages', headers=auth_headers)
        assert resp.status_code == 200
        assert groups.get_messages.call_args.kwargs['mark_read'] is (not masq)
        assert record.called is (not masq)
        assert bell.mark_group_message_notifications_read.called is (not masq)


# ── Bug reports filed while viewing as ───────────────────────────────────────

@pytest.fixture(autouse=False)
def quiet_report_mail():
    with patch('routes.bug_reports._notify_admin_email') as notify:
        yield notify


def _identity(uid):
    return {
        'marika': ('marika@icreate.org', 'org_admin', 'org-1'),
        'test-user-123': ('nicole@example.com', 'parent', 'org-1'),
    }[uid]


@pytest.mark.unit
class TestBugReportWhileViewingAs:
    def _file(self, client, auth_headers, admin_id):
        repo = Mock()
        repo.create.return_value = {'id': 'r-1'}
        with patch('routes.bug_reports.BugReportRepository', return_value=repo), \
             patch('routes.bug_reports._masquerade_admin_id', return_value=admin_id), \
             patch('routes.bug_reports._lookup_user_identity', side_effect=_identity):
            resp = client.post('/api/bug-reports', headers=auth_headers, json={
                'message': 'The bell cleared when I opened her message',
                'extra': {'report_type': 'bug', 'surface': 'sis'},
            })
        assert resp.status_code == 201
        return repo.create.call_args[0][0]

    def test_the_real_admin_is_the_reporter(self, client, auth_headers, mock_verify_token,
                                            quiet_report_mail):
        record = self._file(client, auth_headers, 'marika')
        assert record['user_id'] == 'marika'
        assert record['user_email'] == 'marika@icreate.org'
        assert record['user_role'] == 'org_admin'
        assert record['extra']['viewing_as'] == {
            'user_id': 'test-user-123', 'email': 'nicole@example.com',
            'role': 'parent', 'organization_id': 'org-1'}
        # The client's own extra survives beside it.
        assert record['extra']['surface'] == 'sis'
        assert quiet_report_mail.call_args.args[2] == 'marika'

    def test_without_a_masquerade_nothing_changes(self, client, auth_headers, mock_verify_token,
                                                  quiet_report_mail):
        record = self._file(client, auth_headers, None)
        assert record['user_id'] == 'test-user-123'
        assert record['user_email'] == 'nicole@example.com'
        assert 'viewing_as' not in record['extra']
