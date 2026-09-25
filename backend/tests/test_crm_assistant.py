"""
CRM assistant, phase 1 (docs/CRM_AI_ASSISTANT_PLAN.md): the Gmail mailbox,
contact matching, to-dos, drafts, and the rule that the AI never sends.
"""
import ast
import base64
import pathlib
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from tests.crm_fakes import make_world

ADMIN = 'admin-1'
MAILBOX = 'tanner@optioeducation.com'
BACKEND = pathlib.Path(__file__).resolve().parents[1]


def _world():
    world = make_world()
    world.data['users'] = [
        {'id': ADMIN, 'email': MAILBOX, 'first_name': 'Tanner', 'last_name': 'Bowman',
         'role': 'superadmin', 'org_role': None, 'organization_id': None},
        {'id': 'u-parent', 'email': 'pat@example.com', 'role': 'parent',
         'org_role': None, 'organization_id': None},
        {'id': 'u-student', 'email': 'kid@example.com', 'role': 'student',
         'org_role': None, 'organization_id': None},
        {'id': 'u-orgstudent', 'email': 'orgkid@example.com', 'role': 'org_managed',
         'org_role': 'student', 'organization_id': 'org-1'},
        {'id': 'u-admin', 'email': 'molly@school.org', 'role': 'org_managed',
         'org_role': 'org_admin', 'organization_id': 'org-1'},
    ]
    world.data['organizations'] = [
        {'id': 'org-1', 'name': 'iCreate', 'slug': 'icreate', 'is_active': True,
         'archived_at': None},
        {'id': 'org-2', 'name': 'Hearthwood', 'slug': 'hearthwood', 'is_active': True,
         'archived_at': None},
    ]
    world.data['crm_leads'].append({
        'id': 'lead-1', 'email': 'lead@example.com', 'status': 'active',
        'first_name': 'Lee', 'last_name': None, 'user_id': None,
    })
    # A student who was once captured as a lead is still not a contact.
    world.data['crm_leads'].append({
        'id': 'lead-kid', 'email': 'kid@example.com', 'status': 'active', 'user_id': None,
    })
    for table in ('crm_messages', 'crm_tasks', 'crm_drafts', 'crm_mail_accounts'):
        world.data[table] = []
    world.data['crm_mail_accounts'].append({
        'id': 'acct-1', 'email': MAILBOX, 'refresh_token': 'rt',
        'history_id': '100', 'connected_at': '2026-09-25T00:00:00+00:00',
    })
    return world


@pytest.fixture
def world():
    w = _world()
    with patch('services.crm_gmail_service._db', return_value=w), \
         patch('services.crm_assistant_service._db', return_value=w), \
         patch('routes.admin.crm_assistant._db', return_value=w), \
         patch('routes.admin.crm_assistant._audit'):
        yield w


def _call(app, view, *args, json=None, method='GET', query_string=None):
    from routes.admin import crm_assistant
    with app.test_request_context(json=json, method=method, query_string=query_string):
        resp = getattr(crm_assistant, view).__wrapped__(ADMIN, *args)
    if isinstance(resp, tuple):
        return resp[0].get_json(), resp[1]
    return resp.get_json(), 200


# ---------------------------------------------------------------- the rule

@pytest.mark.unit
class TestTheAiNeverSends:
    """Only the superadmin send route may send from the mailbox."""

    def _callers(self, name):
        hits = []
        for path in BACKEND.rglob('*.py'):
            if '.venv' in path.parts or 'tests' in path.parts:
                continue
            tree = ast.parse(path.read_text(encoding='utf-8'))
            for node in ast.walk(tree):
                if isinstance(node, ast.Name) and node.id == name:
                    hits.append(path.relative_to(BACKEND).as_posix())
                elif isinstance(node, ast.alias) and node.name == name:
                    hits.append(path.relative_to(BACKEND).as_posix())
                elif isinstance(node, ast.Attribute) and node.attr == name:
                    hits.append(path.relative_to(BACKEND).as_posix())
        return set(hits)

    def test_only_the_send_route_reaches_the_send_function(self):
        assert self._callers('send_approved_draft') == {'routes/admin/crm_assistant.py'}

    def test_the_send_route_requires_a_signed_in_superadmin(self):
        source = (BACKEND / 'routes/admin/crm_assistant.py').read_text(encoding='utf-8')
        tree = ast.parse(source)
        send = next(n for n in ast.walk(tree)
                    if isinstance(n, ast.FunctionDef) and n.name == 'send_draft')
        decorators = [ast.unparse(d) for d in send.decorator_list]
        assert 'require_superadmin' in decorators

    def test_no_cron_route_mentions_sending_mail(self):
        source = (BACKEND / 'routes/crm.py').read_text(encoding='utf-8')
        assert 'send_approved_draft' not in source
        assert 'drafts' not in source


# ------------------------------------------------------------- contacts

@pytest.mark.unit
class TestKnownContacts:
    def test_leads_and_adults_count_students_and_colleagues_do_not(self, world):
        from services.crm_gmail_service import known_contacts
        got = known_contacts([
            'lead@example.com', 'pat@example.com', 'kid@example.com',
            'orgkid@example.com', 'molly@school.org', 'someone@optioeducation.com',
            MAILBOX, 'stranger@example.com'], MAILBOX)
        assert got == ['lead@example.com', 'molly@school.org', 'pat@example.com']


def _gmail_message(msg_id, sender, to, subject='Hello', body='Hi there', labels=None):
    data = base64.urlsafe_b64encode(body.encode()).decode()
    headers = [{'name': 'From', 'value': sender}, {'name': 'To', 'value': to},
               {'name': 'Subject', 'value': subject},
               {'name': 'Message-ID', 'value': f'<{msg_id}@mail>'}]
    return {'id': msg_id, 'threadId': f't-{msg_id}', 'labelIds': labels or ['INBOX'],
            'snippet': body[:50], 'internalDate': '1790000000000',
            'payload': {'mimeType': 'text/plain', 'headers': headers, 'body': {'data': data}}}


@pytest.mark.unit
class TestStore:
    def test_mail_with_no_contact_on_it_is_never_written(self, world):
        from services import crm_gmail_service as g
        msg = _gmail_message('m1', 'news@shop.com', MAILBOX)
        with patch.object(g, '_get', return_value=msg):
            assert g._store('tok', 'm1', MAILBOX) is False
        assert world.data['crm_messages'] == []

    def test_a_reply_from_a_lead_is_stored_and_pauses_their_funnel(self, world):
        from services import crm_gmail_service as g
        world.data['crm_funnel_memberships'].append({
            'id': 'mem-1', 'lead_id': 'lead-1', 'funnel_id': 'funnel-1', 'status': 'active'})
        msg = _gmail_message('m2', 'Lee <lead@example.com>', MAILBOX, body='Yes, let us talk')
        with patch.object(g, '_get', return_value=msg):
            assert g._store('tok', 'm2', MAILBOX) is True
        stored = world.data['crm_messages'][0]
        assert stored['direction'] == 'inbound'
        assert stored['contact_emails'] == ['lead@example.com']
        assert stored['body_text'] == 'Yes, let us talk'
        membership = world.data['crm_funnel_memberships'][0]
        assert (membership['status'], membership['exit_reason']) == ('exited', 'replied')
        assert any(e['event_type'] == 'replied' for e in world.data['crm_events'])

    def test_outbound_mail_does_not_pause_anything(self, world):
        from services import crm_gmail_service as g
        world.data['crm_funnel_memberships'].append({
            'id': 'mem-1', 'lead_id': 'lead-1', 'funnel_id': 'funnel-1', 'status': 'active'})
        msg = _gmail_message('m3', MAILBOX, 'lead@example.com', labels=['SENT'])
        with patch.object(g, '_get', return_value=msg):
            g._store('tok', 'm3', MAILBOX)
        assert world.data['crm_messages'][0]['direction'] == 'outbound'
        assert world.data['crm_funnel_memberships'][0]['status'] == 'active'

    def test_spam_is_ignored_even_from_a_contact(self, world):
        from services import crm_gmail_service as g
        msg = _gmail_message('m4', 'lead@example.com', MAILBOX, labels=['SPAM'])
        with patch.object(g, '_get', return_value=msg):
            assert g._store('tok', 'm4', MAILBOX) is False


@pytest.mark.unit
class TestSyncBudget:
    def test_what_a_pass_cannot_finish_waits_for_the_next(self, world):
        from services import crm_gmail_service as g
        clock = iter([0, 0, 1, 999, 999, 999])
        with patch.object(g, 'is_configured', return_value=True), \
             patch.object(g, '_access_token', return_value='tok'), \
             patch.object(g, '_get', return_value={'historyId': '200'}), \
             patch.object(g, '_history_ids', return_value=(['a', 'b', 'c'], '200')), \
             patch.object(g, '_store', return_value=True), \
             patch.object(g.time, 'monotonic', side_effect=lambda: next(clock)):
            result = g.run_sync()
        assert result['read'] == 2 and result['pending'] == 1
        assert g._pending() == ['c']
        assert world.data['crm_mail_accounts'][0]['history_id'] == '200'


# ------------------------------------------------------------------ oauth

@pytest.mark.unit
class TestConnectState:
    def _state(self, world, state, minutes):
        world.data['crm_settings'].append({'key': 'gmail_oauth_state', 'value': {
            'state': state, 'user_id': ADMIN,
            'expires_at': (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()}})

    def test_matching_fresh_state_names_the_admin_once(self, world):
        from services.crm_gmail_service import _consume_state
        self._state(world, 'abc', 5)
        assert _consume_state('abc') == ADMIN
        assert _consume_state('abc') is None

    def test_wrong_or_expired_state_is_refused(self, world):
        from services.crm_gmail_service import _consume_state
        self._state(world, 'abc', 5)
        assert _consume_state('xyz') is None
        self._state(world, 'abc', -1)
        assert _consume_state('abc') is None

    def test_connect_with_a_bad_state_never_calls_google(self, world):
        from services import crm_gmail_service as g
        with patch.object(g.requests, 'post') as post:
            with pytest.raises(ValueError):
                g.complete_connect('code', 'forged')
        post.assert_not_called()


# ------------------------------------------------------------------- send

def _draft(world, **fields):
    row = {'id': 'd-1', 'contact_email': 'lead@example.com', 'to_email': 'lead@example.com',
           'subject': 'Checking in', 'body_text': 'Hi Lee', 'status': 'draft',
           'thread_id': None, 'in_reply_to': None, 'origin': 'ai', **fields}
    world.data['crm_drafts'].append(row)
    return row


@pytest.mark.unit
class TestSend:
    def test_send_marks_the_draft_sent_with_the_gmail_id(self, app, world):
        from services import crm_gmail_service as g
        _draft(world)
        ok = MagicMock(status_code=200)
        ok.json.return_value = {'id': 'gm-1', 'threadId': 't-1'}
        with patch.object(g, '_access_token', return_value='tok'), \
             patch.object(g.requests, 'post', return_value=ok) as post, \
             patch.object(g, '_store'):
            body, status = _call(app, 'send_draft', 'd-1', method='POST',
                                 json={'body_text': 'Hi Lee, edited'})
        assert status == 200
        assert body['draft']['status'] == 'sent'
        assert body['draft']['gmail_message_id'] == 'gm-1'
        assert body['draft']['sent_by'] == ADMIN
        raw = base64.urlsafe_b64decode(post.call_args.kwargs['json']['raw']).decode()
        assert 'Hi Lee, edited' in raw
        assert f'Tanner Bowman <{MAILBOX}>' in raw

    def test_a_failed_send_leaves_a_draft_to_try_again(self, app, world):
        from services import crm_gmail_service as g
        _draft(world)
        with patch.object(g, '_access_token', return_value='tok'), \
             patch.object(g.requests, 'post', return_value=MagicMock(status_code=500, text='x')):
            _, status = _call(app, 'send_draft', 'd-1', method='POST', json={})
        assert status == 409
        assert world.data['crm_drafts'][0]['status'] == 'draft'

    def test_a_draft_already_being_sent_is_not_sent_again(self, app, world):
        from services import crm_gmail_service as g
        _draft(world, status='sending')
        with patch.object(g, '_access_token', return_value='tok'), \
             patch.object(g.requests, 'post') as post:
            _, status = _call(app, 'send_draft', 'd-1', method='POST', json={})
        assert status == 409
        post.assert_not_called()

    def test_a_reply_threads_in_gmail(self, app, world):
        from services import crm_gmail_service as g
        _draft(world, thread_id='t-9', in_reply_to='<orig@mail>')
        ok = MagicMock(status_code=200)
        ok.json.return_value = {'id': 'gm-2'}
        with patch.object(g, '_access_token', return_value='tok'), \
             patch.object(g.requests, 'post', return_value=ok) as post, \
             patch.object(g, '_store'):
            _call(app, 'send_draft', 'd-1', method='POST', json={})
        sent = post.call_args.kwargs['json']
        assert sent['threadId'] == 't-9'
        assert 'In-Reply-To: <orig@mail>' in base64.urlsafe_b64decode(sent['raw']).decode()


# ------------------------------------------------------- tasks and drafts

@pytest.mark.unit
class TestContactFile:
    def test_todo_lifecycle(self, app, world):
        body, status = _call(app, 'create_task', method='POST', json={
            'email': 'Lead@Example.com', 'title': 'Send the pricing sheet', 'due_on': '2026-09-30'})
        assert status == 201
        task_id = body['task']['id']
        assert body['task']['contact_email'] == 'lead@example.com'
        body, _ = _call(app, 'update_task', task_id, method='PUT', json={'status': 'done'})
        assert body['task']['status'] == 'done' and body['task']['completed_at']
        contact, _ = _call(app, 'get_contact', query_string={'email': 'lead@example.com'})
        assert [t['title'] for t in contact['tasks']] == ['Send the pricing sheet']

    def test_due_list_holds_open_todos_due_by_today(self, app, world):
        for title, due, status in (('overdue', '2026-01-01', 'open'),
                                   ('far future', '2099-01-01', 'open'),
                                   ('no date', None, 'open'),
                                   ('finished', '2026-01-01', 'done')):
            _call(app, 'create_task', method='POST', json={
                'email': 'lead@example.com', 'title': title, 'due_on': due})
            if status == 'done':
                world.data['crm_tasks'][-1]['status'] = 'done'
        body, _ = _call(app, 'due_tasks')
        assert [t['title'] for t in body['tasks']] == ['overdue']
        assert body['links'] == {'lead@example.com': '/admin/crm/leads/lead-1'}

    def test_bad_due_date_is_refused(self, app, world):
        _, status = _call(app, 'create_task', method='POST', json={
            'email': 'lead@example.com', 'title': 'x', 'due_on': 'next week'})
        assert status == 400

    def test_reply_draft_takes_the_thread_and_subject(self, app, world):
        world.data['crm_messages'].append({
            'id': 'msg-1', 'gmail_message_id': 'g1', 'thread_id': 't-1',
            'rfc_message_id': '<g1@mail>', 'direction': 'inbound',
            'from_email': 'lead@example.com', 'to_emails': [MAILBOX], 'cc_emails': [],
            'contact_emails': ['lead@example.com'], 'subject': 'Fall classes',
            'sent_at': '2026-09-24T10:00:00+00:00'})
        body, status = _call(app, 'create_draft', method='POST', json={
            'email': 'lead@example.com', 'thread_id': 't-1', 'body_text': 'Thanks!'})
        assert status == 201
        assert body['draft']['subject'] == 'Re: Fall classes'
        assert body['draft']['in_reply_to'] == '<g1@mail>'

    def test_cannot_reply_into_someone_elses_thread(self, app, world):
        world.data['crm_messages'].append({
            'id': 'msg-1', 'gmail_message_id': 'g1', 'thread_id': 't-1',
            'from_email': 'pat@example.com', 'to_emails': [MAILBOX], 'cc_emails': [],
            'contact_emails': ['pat@example.com'], 'subject': 'x',
            'sent_at': '2026-09-24T10:00:00+00:00'})
        _, status = _call(app, 'create_draft', method='POST', json={
            'email': 'lead@example.com', 'thread_id': 't-1'})
        assert status == 400

    def test_a_sent_draft_cannot_be_edited(self, app, world):
        _draft(world, status='sent')
        _, status = _call(app, 'update_draft', 'd-1', method='PUT', json={'body_text': 'new'})
        assert status == 404


@pytest.mark.unit
class TestClientOrgs:
    def test_org_admins_of_client_orgs_are_client_contacts(self, app, world):
        body, _ = _call(app, 'set_client_orgs', method='PUT', json={'org_ids': ['org-1']})
        assert [o['is_client'] for o in body['orgs']] == [False, True]  # Hearthwood, iCreate
        contact, _ = _call(app, 'get_contact', query_string={'email': 'molly@school.org'})
        assert contact['client_org'] == 'iCreate'
        contact, _ = _call(app, 'get_contact', query_string={'email': 'pat@example.com'})
        assert contact['client_org'] is None
