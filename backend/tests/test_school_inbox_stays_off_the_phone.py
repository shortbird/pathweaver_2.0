"""School-inbox notices do not go to the phone.

iCreate, 2026-09-30 ("Notifications issue"): "I have this notification on my
phone, but I can't find it on Optio to be able to read it." The mobile app has
no screen for the school inbox, on purpose; the office reads it in the
console. Owner, 2026-10-01: "ensure that notifications for school inbox
don't go to mobile to avoid confusion."

What these pin:
  - a school-inbox notice writes its bell row and its browser push, and no
    phone push; every other message notice still rings the phone;
  - the mobile app's list, badge and "mark all read" leave those notices out,
    and the web and the console still get them;
  - the filter keeps rows that have no link at all.
"""

from unittest.mock import Mock, patch

import pytest

from services import notification_service
from services.notification_service import NotificationService

SCHOOL_LINK = '/inbox?tab=school&conversation=c1'


def _service():
    svc = NotificationService.__new__(NotificationService)
    svc.supabase = Mock()
    svc.supabase.table.return_value.insert.return_value.execute.return_value = Mock(data=[{'id': 'n'}])
    return svc


def _create(link):
    svc = _service()
    with patch.object(svc, '_is_type_enabled', return_value=True), \
         patch.object(svc, '_broadcast_realtime') as realtime, \
         patch.object(svc, '_send_push_notification') as web, \
         patch.object(svc, '_send_expo_push_notification') as phone:
        row = svc.create_notification('kate', 'message_received', 'iCreate inbox: message from Mia',
                                      'hello', link=link)
    return row, realtime, web, phone


@pytest.mark.unit
class TestTheSend:
    def test_a_school_inbox_notice_does_not_ring_the_phone(self):
        row, realtime, web, phone = _create(SCHOOL_LINK)
        assert row == {'id': 'n'}          # the bell row is written
        realtime.assert_called_once()      # and the web bell hears it live
        web.assert_called_once()           # and the browser push still goes
        phone.assert_not_called()

    def test_a_school_group_notice_does_not_either(self):
        _row, _realtime, _web, phone = _create('/inbox?tab=school&group=g1')
        phone.assert_not_called()

    @pytest.mark.parametrize('link', ['/communication?user=u1', '/communication?group=g1', None])
    def test_every_other_message_still_does(self, link):
        _row, _realtime, _web, phone = _create(link)
        phone.assert_called_once()

    def test_the_marker_is_the_link(self):
        assert notification_service.is_school_inbox_link('/inbox')
        assert notification_service.is_school_inbox_link(SCHOOL_LINK)
        assert not notification_service.is_school_inbox_link('/communication?user=u1')
        assert not notification_service.is_school_inbox_link(None)

    def test_the_real_school_inbox_links_carry_it(self):
        """The two builders the fan-outs use, so a renamed route cannot
        quietly bring the phone push back."""
        from services import school_inbox_service
        assert notification_service.is_school_inbox_link(
            school_inbox_service.school_inbox_link(conversation_id='c1'))
        assert notification_service.is_school_inbox_link(
            school_inbox_service.school_inbox_link(group_id='g1'))


class _Query:
    """Records the filters a read or bulk write is built from."""

    def __init__(self):
        self.ors = []

    def __getattr__(self, name):
        def chained(*args, **kwargs):
            if name == 'or_':
                self.ors.append(args[0])
            if name == 'execute':
                return Mock(data=[], count=0)
            return self
        return chained


def _with_query():
    svc = NotificationService.__new__(NotificationService)
    query = _Query()
    svc.supabase = Mock()
    svc.supabase.table.return_value = query
    return svc, query


@pytest.mark.unit
class TestTheMobileListAndBadge:
    FILTER = 'link.is.null,link.not.like./inbox*'

    @pytest.mark.parametrize('call', [
        lambda s, **k: s.get_user_notifications('kate', **k),
        lambda s, **k: s.get_unread_count('kate', **k),
        lambda s, **k: s.mark_all_as_read('kate', **k),
        lambda s, **k: s.delete_all_notifications('kate', **k),
    ])
    def test_the_phone_leaves_them_out_and_everyone_else_keeps_them(self, call):
        svc, query = _with_query()
        call(svc, exclude_school_inbox=True)
        assert query.ors == [self.FILTER]

        svc, query = _with_query()
        call(svc)
        assert query.ors == []

    def test_the_filter_keeps_rows_with_no_link(self):
        """NOT LIKE alone is NULL for a row with no link, which drops it."""
        assert self.FILTER.startswith('link.is.null,')


@pytest.mark.unit
class TestTheRoutesAskWhoIsCalling:
    def _get(self, client, auth_headers, path, platform, method='get'):
        svc = Mock()
        svc.get_user_notifications.return_value = []
        svc.get_unread_count.return_value = 0
        svc.mark_all_as_read.return_value = 0
        svc.delete_all_notifications.return_value = 0
        headers = dict(auth_headers)
        if platform:
            headers['X-Optio-Client'] = platform
        with patch('routes.notifications.NotificationService', return_value=svc), \
             patch('routes.notifications.get_supabase_admin_client'):
            resp = getattr(client, method)(path, headers=headers)
        return resp, svc

    @pytest.mark.parametrize('platform,expected', [('mobile', True), ('web', False), ('sis', False)])
    def test_the_list_and_its_count(self, client, auth_headers, mock_verify_token, platform, expected):
        resp, svc = self._get(client, auth_headers, '/api/notifications', platform)
        assert resp.status_code == 200
        assert svc.get_user_notifications.call_args.kwargs['exclude_school_inbox'] is expected
        assert svc.get_unread_count.call_args.kwargs['exclude_school_inbox'] is expected

    @pytest.mark.parametrize('platform,expected', [('mobile', True), ('sis', False)])
    def test_the_badge(self, client, auth_headers, mock_verify_token, platform, expected):
        resp, svc = self._get(client, auth_headers, '/api/notifications/unread-count', platform)
        assert resp.status_code == 200
        assert svc.get_unread_count.call_args.kwargs['exclude_school_inbox'] is expected

    @pytest.mark.parametrize('platform,expected', [('mobile', True), ('web', False)])
    def test_mark_all_read_on_the_phone_leaves_the_consoles_notices_alone(
            self, client, auth_headers, mock_verify_token, platform, expected):
        resp, svc = self._get(client, auth_headers, '/api/notifications/mark-all-read',
                              platform, method='put')
        assert resp.status_code == 200
        assert svc.mark_all_as_read.call_args.kwargs['exclude_school_inbox'] is expected
