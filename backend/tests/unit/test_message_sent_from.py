"""Every message records which surface sent it, and only a superadmin sees it.

Three things pinned here:

  1. utils/client_platform.py names the surface from the request: the mobile
     app's `X-Optio-Client` header first, then the User-Agent / Origin
     fallbacks that cover the web app (which sends no header, on purpose) and
     a mobile build older than the header.
  2. DirectMessageService / GroupMessageService write it on the row, and the
     email relay names 'email' explicitly.
  3. messaging_extras_service.enrich_messages hands `sent_from` to a
     superadmin viewer and to nobody else, and the realtime broadcast of a new
     message never carries it, since a broadcast has no viewer to gate on.
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

import services.messaging_extras_service as extras
from utils import client_platform


# ── 1. Naming the surface from the request ───────────────────────────────────
@pytest.fixture
def app():
    return Flask(__name__)


MOBILE_IOS_UA = 'OptioMobile/1.0 CFNetwork/1494.0.7 Darwin/23.4.0'
MOBILE_ANDROID_UA = 'okhttp/4.9.2'
CHROME_UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
             '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36')


def _platform(app, headers):
    with app.test_request_context('/api/messages/x/send', method='POST',
                                  headers=headers):
        return client_platform.request_client_platform()


def test_mobile_header_wins_even_from_a_browser_user_agent(app):
    # Mobile's web target in dev: a browser UA, but the app says who it is.
    assert _platform(app, {'X-Optio-Client': 'mobile',
                           'User-Agent': CHROME_UA}) == 'mobile'


def test_header_is_case_insensitive_and_unknown_values_are_ignored(app):
    assert _platform(app, {'X-Optio-Client': 'Mobile',
                           'User-Agent': MOBILE_IOS_UA}) == 'mobile'
    # 'email' is set server-side by the relay; a client may not claim it.
    assert _platform(app, {'X-Optio-Client': 'email',
                           'User-Agent': CHROME_UA,
                           'Origin': 'https://app.optioeducation.com'}) == 'web'


def test_native_http_stacks_are_mobile_without_the_header(app):
    # An app build from before the header still sends okhttp / CFNetwork.
    assert _platform(app, {'User-Agent': MOBILE_IOS_UA}) == 'mobile'
    assert _platform(app, {'User-Agent': MOBILE_ANDROID_UA}) == 'mobile'


def test_a_browser_on_the_web_app_is_web(app):
    assert _platform(app, {'User-Agent': CHROME_UA,
                           'Origin': 'https://app.optioeducation.com'}) == 'web'
    assert _platform(app, {'User-Agent': CHROME_UA,
                           'Origin': 'http://localhost:3000'}) == 'web'


def test_a_browser_on_the_sis_console_is_sis(app):
    assert _platform(app, {'User-Agent': CHROME_UA,
                           'Origin': 'https://sis.optioeducation.com'}) == 'sis'


def test_mobile_web_target_origin_is_mobile(app):
    assert _platform(app, {'User-Agent': CHROME_UA,
                           'Origin': 'http://localhost:8081'}) == 'mobile'


def test_no_request_context_means_unknown():
    assert client_platform.request_client_platform() is None


# ── 2. The row carries it ────────────────────────────────────────────────────
class _Table:
    """Chainable stub: records inserts, answers reads from `data_by_table`."""

    def __init__(self, name, data_by_table, inserts):
        self.name = name
        self.data_by_table = data_by_table
        self.inserts = inserts
        self._inserted = None
        self._single = False

    def __getattr__(self, _name):
        # Any query-builder method (select, eq, in_, order, range...) chains.
        return lambda *a, **k: self

    def single(self):
        self._single = True
        return self

    def insert(self, row):
        self.inserts.append((self.name, row))
        self._inserted = row
        return self

    def execute(self):
        if self._inserted is not None:
            return MagicMock(data=[self._inserted])
        rows = self.data_by_table.get(self.name, [])
        if self._single:
            return MagicMock(data=rows[0] if rows else None)
        return MagicMock(data=rows)


def _client(data_by_table, inserts):
    client = MagicMock()
    client.table.side_effect = lambda name: _Table(name, data_by_table, inserts)
    return client


def _dm_service(inserts):
    from services.direct_message_service import DirectMessageService
    svc = DirectMessageService()
    svc._get_client = lambda: _client({
        'users': [{'id': 'viewer', 'role': 'student'}],
        'message_conversations': [],
        'message_reactions': [],
    }, inserts)
    svc.can_message_user = lambda *a: True
    svc.get_or_create_conversation = lambda *a: {'id': 'conv-1'}
    svc._update_conversation_metadata = lambda *a, **k: None
    svc._notify_recipient = lambda *a, **k: None
    return svc


def test_dm_row_is_stamped_from_the_request(app):
    inserts = []
    svc = _dm_service(inserts)
    with app.test_request_context(headers={'X-Optio-Client': 'mobile'}), \
            patch.object(extras, '_admin', return_value=_client(
                {'users': [{'id': 'a', 'role': 'student'}]}, [])), \
            patch.object(extras, 'broadcast_dm'):
        svc.send_message('a', 'b', 'hello')
    rows = [row for table, row in inserts if table == 'direct_messages']
    assert rows and rows[0]['sent_from'] == 'mobile'


def test_dm_row_takes_an_explicit_surface_over_the_request(app):
    inserts = []
    svc = _dm_service(inserts)
    with app.test_request_context(headers={'X-Optio-Client': 'mobile'}), \
            patch.object(extras, '_admin', return_value=_client(
                {'users': [{'id': 'a', 'role': 'student'}]}, [])), \
            patch.object(extras, 'broadcast_dm'):
        svc.send_message('a', 'b', 'hello', sent_from='email')
    rows = [row for table, row in inserts if table == 'direct_messages']
    assert rows[0]['sent_from'] == 'email'


def test_dm_row_outside_a_request_is_unknown_not_guessed():
    inserts = []
    svc = _dm_service(inserts)
    with patch.object(extras, '_admin', return_value=_client(
                {'users': [{'id': 'a', 'role': 'student'}]}, [])), \
            patch.object(extras, 'broadcast_dm'):
        svc.send_message('a', 'b', 'hello')
    rows = [row for table, row in inserts if table == 'direct_messages']
    assert rows[0]['sent_from'] is None


def test_group_row_is_stamped_from_the_request(app):
    from services.group_message_service import GroupMessageService
    inserts = []
    svc = GroupMessageService()
    svc._get_client = lambda: _client({
        'group_conversations': [{'announcement_only': False}],
        'message_reactions': [],
    }, inserts)
    svc.is_group_member = lambda *a: True
    svc.is_group_admin = lambda *a: True
    svc._notify_group_members = lambda *a, **k: None
    svc._get_user_info = lambda *a: {'id': 'a', 'display_name': 'A'}
    with app.test_request_context(headers={'User-Agent': CHROME_UA,
                                           'Origin': 'https://app.optioeducation.com'}), \
            patch.object(extras, '_admin', return_value=_client(
                {'users': [{'id': 'a', 'role': 'student'}]}, [])), \
            patch.object(extras, 'broadcast_group'), \
            patch('utils.storage_urls.sign_in_place'):
        svc.send_message('a', 'group-1', 'hello')
    rows = [row for table, row in inserts if table == 'group_messages']
    assert rows and rows[0]['sent_from'] == 'web'


# ── 3. Only a superadmin sees it ─────────────────────────────────────────────
def _admin_for(role):
    return _client({
        'message_reactions': [],
        'users': [{'id': 'viewer', 'role': role}],
    }, [])


def _msg(**overrides):
    row = {
        'id': str(uuid.uuid4()), 'sender_id': 'user-A', 'recipient_id': 'user-B',
        'conversation_id': 'conv-1', 'is_deleted': False,
        'message_content': 'hi', 'attachments': [], 'sent_from': 'mobile',
    }
    row.update(overrides)
    return row


def test_superadmin_viewer_sees_sent_from():
    with patch.object(extras, '_admin', return_value=_admin_for('superadmin')):
        out = extras.enrich_messages('dm', [_msg()], 'viewer')
    assert out[0]['sent_from'] == 'mobile'


@pytest.mark.parametrize('role', ['student', 'parent', 'advisor', 'org_admin',
                                  'org_managed', 'observer'])
def test_every_other_viewer_does_not(role):
    with patch.object(extras, '_admin', return_value=_admin_for(role)):
        out = extras.enrich_messages('dm', [_msg()], 'viewer')
    assert 'sent_from' not in out[0]
    assert out[0]['message_content'] == 'hi'   # nothing else touched


def test_a_row_from_before_the_column_stays_absent_for_a_superadmin():
    # Pre-2026-09-16 rows have no value; the client shows nothing, not "Web".
    with patch.object(extras, '_admin', return_value=_admin_for('superadmin')):
        out = extras.enrich_messages('dm', [_msg(sent_from=None)], 'viewer')
    assert out[0].get('sent_from') is None


def test_broadcast_payload_never_carries_the_superadmin_fields():
    enriched = {**_msg(), 'reactions': [], 'deleted_visible_to_admin': True}
    payload = extras.broadcast_payload(enriched)
    assert 'sent_from' not in payload
    assert 'deleted_visible_to_admin' not in payload
    assert payload['message_content'] == 'hi'
    assert enriched['sent_from'] == 'mobile'   # the sender's own copy is intact


def test_dm_send_broadcasts_without_sent_from_even_for_a_superadmin_sender(app):
    inserts = []
    svc = _dm_service(inserts)
    with app.test_request_context(headers={'X-Optio-Client': 'mobile'}), \
            patch.object(extras, '_admin', return_value=_client(
                {'users': [{'id': 'a', 'role': 'superadmin'}]}, [])), \
            patch.object(extras, 'broadcast_dm') as bc:
        returned = svc.send_message('a', 'b', 'hello')
    assert returned['sent_from'] == 'mobile'
    _topic, _event, payload = bc.call_args[0]
    assert 'sent_from' not in payload
