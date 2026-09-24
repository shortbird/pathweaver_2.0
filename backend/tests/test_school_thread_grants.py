"""A school-inbox thread, handed to a staff member with a task.

Tickets bf8b754d and d93b24d2 (iCreate, meeting of 2026-09-23): "Replies in
messaging can be turned into tasks and assigned to school staff" and
"assigning a message to a teacher/staff (who doesn't have access to the school
inbox) - they get the whole thread and can reply."

What these pin:
  - create_task_from_thread calls the tasks stream's assign_task with the
    agreed keyword contract, then writes the grant with the task's id; a task
    that fails writes no grant (access with no end);
  - a grant is live only while its task exists and is not finished, and a
    dead one is revoked on sight;
  - the thread routes let in the office OR a live grant for that exact thread,
    and nobody else learns the thread exists;
  - a granted teacher's reply goes out as the school with their name shown to
    the family ("Tam T for iCreate"), and the office's replies do not;
  - which staff member opened a thread is recorded and returned.
"""

import json
from unittest.mock import Mock, patch

import pytest

from services import school_inbox_service as inbox
from services import thread_task_service as tasks

ORG_ID = 'org-1'
ORG = {'id': ORG_ID, 'name': 'iCreate', 'is_active': True, 'inbox_user_id': 'inbox-1'}
INBOX = 'inbox-1'
KATE = 'kate'        # front office
TAM = 'tam'          # a teacher, no school inbox of their own
MUM = 'mum'
CONVO = {'id': 'conv-1', 'participant_1_id': MUM, 'participant_2_id': INBOX}
STAFF = [{'id': KATE, 'name': 'Kate A', 'roles': ['org_admin']},
         {'id': TAM, 'name': 'Tam T', 'roles': ['advisor']}]


# ── Making the task ──────────────────────────────────────────────────────────

@pytest.fixture
def staff():
    with patch('services.sis_messaging_service.staff_recipients', return_value=STAFF):
        yield


@pytest.fixture
def grants():
    repo = Mock()
    repo.create_grant.side_effect = lambda **k: {'id': 'grant-1', **k}
    with patch.object(tasks, '_repo', return_value=repo):
        yield repo


@pytest.mark.unit
class TestCreateTaskFromThread:
    def test_the_task_uses_the_agreed_contract_then_grants_the_thread(self, staff, grants):
        assign = Mock(return_value=[{'id': 'task-1', 'user_id': TAM}])
        with patch('services.sis_onboarding_service.assign_task', assign, create=True):
            result = tasks.create_task_from_thread(
                ORG_ID, KATE, TAM, conversation_id='conv-1', message_id='msg-1',
                action='reply', due_date='2026-09-30', priority='high',
                note='She needs the form by Friday', member_name='Mia Lark',
                quote='Can someone send the field trip form?', quote_sender='Mia Lark')

        kwargs = assign.call_args.kwargs
        assert assign.call_args.args == ()
        assert kwargs['org_id'] == ORG_ID and kwargs['assigner_id'] == KATE
        assert kwargs['recipients'] == [TAM]
        assert kwargs['title'] == 'Reply to Mia Lark'
        assert kwargs['action'] == 'reply' and kwargs['priority'] == 'high'
        assert kwargs['due_date'] == '2026-09-30'
        assert kwargs['source_conversation_id'] == 'conv-1'
        assert kwargs['source_group_id'] is None
        assert kwargs['source_message_id'] == 'msg-1'
        assert 'She needs the form by Friday' in kwargs['description']
        assert 'Mia Lark wrote: "Can someone send the field trip form?"' in kwargs['description']

        grant = grants.create_grant.call_args.kwargs
        assert grant == {'organization_id': ORG_ID, 'user_id': TAM, 'task_id': 'task-1',
                         'granted_by': KATE, 'conversation_id': 'conv-1', 'group_id': None}
        assert result['task']['id'] == 'task-1'

    def test_a_do_task_is_worded_from_the_message(self, staff, grants):
        assign = Mock(return_value=[{'id': 't'}])
        with patch('services.sis_onboarding_service.assign_task', assign, create=True):
            tasks.create_task_from_thread(ORG_ID, KATE, TAM, group_id='g1', action='do',
                                          thread_name='Tuesday cover',
                                          quote='Room 4 is locked\nplease check')
        assert assign.call_args.kwargs['title'] == 'Follow up with Tuesday cover: Room 4 is locked'
        assert assign.call_args.kwargs['source_group_id'] == 'g1'

    def test_the_call_binds_to_the_real_assign_task(self, staff, grants):
        """The tests above replace assign_task with a Mock, which accepts any
        keywords. This one checks the call against the real signature, so a
        renamed parameter on the tasks side fails here, not in production."""
        import inspect
        from services import sis_onboarding_service
        real = inspect.signature(sis_onboarding_service.assign_task)
        assign = Mock(return_value={'tasks': [{'id': 'task-9'}], 'batch_id': 'b'})
        with patch('services.sis_onboarding_service.assign_task', assign):
            result = tasks.create_task_from_thread(
                ORG_ID, KATE, TAM, conversation_id='conv-1', message_id='m',
                action='reply', due_date='2026-09-30', priority='normal', note='n')
        real.bind(**assign.call_args.kwargs)
        assert result['task']['id'] == 'task-9'

    def test_a_failed_task_writes_no_grant(self, staff, grants):
        with patch('services.sis_onboarding_service.assign_task',
                   Mock(return_value={'error': 'Pick at least one person'}), create=True):
            with pytest.raises(ValueError, match='Pick at least one person'):
                tasks.create_task_from_thread(ORG_ID, KATE, TAM, conversation_id='conv-1')
        grants.create_grant.assert_not_called()

    def test_only_staff_of_this_school_can_be_given_a_thread(self, staff, grants):
        assign = Mock()
        with patch('services.sis_onboarding_service.assign_task', assign, create=True):
            with pytest.raises(ValueError):
                tasks.create_task_from_thread(ORG_ID, KATE, MUM, conversation_id='conv-1')
        assign.assert_not_called()

    @pytest.mark.parametrize('kwargs', [
        {},  # no thread
        {'conversation_id': 'c', 'group_id': 'g'},  # two threads
        {'conversation_id': 'c', 'action': 'call'},
        {'conversation_id': 'c', 'priority': 'soon'},
    ])
    def test_what_the_office_can_fix_is_a_value_error(self, staff, grants, kwargs):
        with pytest.raises(ValueError):
            tasks.create_task_from_thread(ORG_ID, KATE, TAM, **kwargs)

    def test_an_envelope_around_the_rows_is_accepted(self):
        assert tasks._created_rows({'rows': [{'id': 'a'}]}) == [{'id': 'a'}]
        assert tasks._created_rows([{'id': 'a'}, {'nope': 1}]) == [{'id': 'a'}]
        assert tasks._created_rows({'error': 'x'}) == []


# ── Which grants are live ────────────────────────────────────────────────────

def _thread_repo(grants, statuses):
    repo = Mock()
    repo.unrevoked_grants.return_value = grants
    repo.task_statuses.return_value = statuses
    return repo


@pytest.mark.unit
class TestActiveGrants:
    def test_an_open_task_keeps_the_thread_a_finished_or_deleted_one_ends_it(self):
        rows = [
            {'id': 'g-open', 'organization_id': ORG_ID, 'task_id': 't-open', 'conversation_id': 'c'},
            {'id': 'g-done', 'organization_id': ORG_ID, 'task_id': 't-done', 'conversation_id': 'c'},
            {'id': 'g-gone', 'organization_id': ORG_ID, 'task_id': 't-gone', 'conversation_id': 'c'},
            {'id': 'g-null', 'organization_id': ORG_ID, 'task_id': None, 'conversation_id': 'c'},
            {'id': 'g-exp', 'organization_id': ORG_ID, 'task_id': 't-exp', 'conversation_id': 'c'},
        ]
        repo = _thread_repo(rows, {'t-open': 'in_progress', 't-done': 'complete',
                                   't-exp': 'expired'})
        with patch.object(inbox, '_thread_repo', return_value=repo):
            live = inbox.active_grants(TAM, conversation_id='c')
        assert [g['id'] for g in live] == ['g-open']
        assert sorted(repo.revoke.call_args.args[0]) == ['g-done', 'g-exp', 'g-gone', 'g-null']

    def test_another_schools_grant_is_not_this_ones(self):
        repo = _thread_repo([{'id': 'g', 'organization_id': 'org-2', 'task_id': 't'}],
                            {'t': 'in_progress'})
        with patch.object(inbox, '_thread_repo', return_value=repo):
            assert inbox.active_grants(TAM, conversation_id='c', organization_id=ORG_ID) == []

    def test_a_failed_lookup_is_no_access(self):
        repo = Mock()
        repo.unrevoked_grants.side_effect = RuntimeError('db down')
        with patch.object(inbox, '_thread_repo', return_value=repo):
            assert inbox.active_grants(TAM, conversation_id='c') == []

    def test_thread_access_office_then_grant_then_nobody(self):
        with patch('services.sis_service.caller_is_admin', return_value=True):
            assert inbox.thread_access(KATE, ORG, conversation_id='c') == 'office'
        with patch('services.sis_service.caller_is_admin', return_value=False), \
             patch.object(inbox, 'active_grants', return_value=[{'id': 'g'}]) as grants:
            assert inbox.thread_access(TAM, ORG, conversation_id='c') == 'grant'
        assert grants.call_args.kwargs == {'conversation_id': 'c', 'group_id': None,
                                           'organization_id': ORG_ID}
        with patch('services.sis_service.caller_is_admin', return_value=False), \
             patch.object(inbox, 'active_grants', return_value=[]):
            assert inbox.thread_access(TAM, ORG, conversation_id='c') is None

    def test_a_granted_teacher_opens_a_school_group(self):
        group_repo = Mock()
        group_repo.group_owner_row.return_value = {
            'id': 'g1', 'is_active': True, 'created_by': INBOX, 'organization_id': ORG_ID}
        with patch('repositories.group_repository.GroupRepository', return_value=group_repo), \
             patch.object(inbox, 'org_for_inbox_user', return_value=ORG), \
             patch.object(inbox, 'admin_recipient_ids', return_value=[KATE]), \
             patch('services.group_message_service.GroupMessageService._is_superadmin',
                   return_value=False), \
             patch.object(inbox, 'active_grants', side_effect=lambda u, **k: [{'id': 'g'}] if u == TAM else []):
            assert inbox.school_group_access(TAM, 'g1')['via'] == 'grant'
            assert inbox.school_group_access(KATE, 'g1')['via'] == 'office'
            assert inbox.school_group_access(MUM, 'g1') is None

    def test_a_granted_teacher_hears_about_the_familys_answer(self):
        notifier = Mock()
        with patch.object(inbox, 'admin_recipient_ids', return_value=[KATE]), \
             patch.object(inbox, 'grant_holder_ids', return_value=[TAM]), \
             patch('services.notification_service.NotificationService', return_value=notifier):
            inbox.notify_admins_of_member_message(ORG, MUM, 'Mia', 'hello', conversation_id='conv-1')
        notified = [c.kwargs['user_id'] for c in notifier.create_notification.call_args_list]
        assert notified == [KATE, TAM]


# ── The routes ───────────────────────────────────────────────────────────────

def _admin_client_for_role(role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


@pytest.fixture
def as_teacher():
    with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('advisor')), \
         patch('services.sis_service.resolve_org_id', return_value=ORG_ID), \
         patch.object(inbox, 'school_account', return_value=(ORG, INBOX)):
        yield


@pytest.mark.unit
class TestThreadRoutes:
    def _get(self, client, auth_headers, access):
        svc = Mock()
        svc.get_conversation_messages.return_value = [{'id': 'm1', 'sender_id': MUM}]
        with patch.object(inbox, 'conversation_for_inbox', return_value=CONVO), \
             patch.object(inbox, 'thread_access', return_value=access), \
             patch.object(inbox, 'mark_conversation_read') as mark, \
             patch.object(inbox, 'record_thread_read') as record, \
             patch.object(inbox, 'thread_readers', return_value=[{'user_id': TAM, 'name': 'Tam T'}]), \
             patch('routes.school_inbox.message_service', svc):
            resp = client.get('/api/school-inbox/conversations/conv-1', headers=auth_headers)
        return resp, mark, record

    def test_a_teacher_with_a_grant_reads_the_whole_thread(self, client, auth_headers,
                                                            mock_verify_token, as_teacher):
        resp, mark, record = self._get(client, auth_headers, 'grant')
        assert resp.status_code == 200
        body = json.loads(resp.data)
        data = body.get('data', body)
        assert data['access'] == 'grant'
        assert data['opened_by'] == [{'user_id': TAM, 'name': 'Tam T'}]
        record.assert_called_once_with(ORG_ID, 'test-user-123', conversation_id='conv-1')

    def test_a_teacher_without_one_is_told_it_does_not_exist(self, client, auth_headers,
                                                             mock_verify_token, as_teacher):
        resp, mark, record = self._get(client, auth_headers, None)
        assert resp.status_code == 404
        mark.assert_not_called()
        record.assert_not_called()

    def test_a_student_never_reaches_the_check(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('student')):
            resp = client.get('/api/school-inbox/conversations/conv-1', headers=auth_headers)
        assert resp.status_code == 403

    def _send(self, client, auth_headers, *, admin, convo, access):
        with patch('services.sis_service.caller_is_admin', return_value=admin), \
             patch.dict('utils.auth.relationships.RELATIONSHIPS', {'org_staff': lambda a, b: True}), \
             patch.object(inbox, 'conversation_with_member', return_value=convo), \
             patch.object(inbox, 'thread_access', return_value=access), \
             patch.object(inbox, 'send_as_school',
                          return_value={'id': 'm2', 'conversation_id': 'conv-1'}) as send:
            resp = client.post(f'/api/school-inbox/conversations/{MUM}/send',
                               headers=auth_headers, json={'content': 'The form is attached'})
        return resp, send

    def test_a_granted_reply_names_the_teacher_to_the_family(self, client, auth_headers,
                                                             mock_verify_token, as_teacher):
        resp, send = self._send(client, auth_headers, admin=False, convo=CONVO, access='grant')
        assert resp.status_code == 200
        assert send.call_args.kwargs['sent_by'] == 'test-user-123'
        assert send.call_args.kwargs['show_sender_name'] is True

    def test_an_office_reply_stays_under_the_schools_name(self, client, auth_headers,
                                                          mock_verify_token, as_teacher):
        resp, send = self._send(client, auth_headers, admin=True, convo=None, access=None)
        assert resp.status_code == 200
        assert 'show_sender_name' not in send.call_args.kwargs

    def test_a_teacher_cannot_start_a_thread_as_the_school(self, client, auth_headers,
                                                           mock_verify_token, as_teacher):
        resp, send = self._send(client, auth_headers, admin=False, convo=None, access=None)
        assert resp.status_code == 404
        send.assert_not_called()

    def test_making_a_task_is_the_offices(self, client, auth_headers, mock_verify_token, as_teacher):
        resp = client.post('/api/school-inbox/conversations/conv-1/task', headers=auth_headers,
                           json={'assignee_id': TAM})
        assert resp.status_code == 403

    def test_making_a_task_passes_the_thread_and_the_message(self, client, auth_headers,
                                                             mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('org_admin')), \
             patch('services.sis_service.resolve_org_id', return_value=ORG_ID), \
             patch.object(inbox, 'school_account', return_value=(ORG, INBOX)), \
             patch.object(inbox, 'conversation_for_inbox', return_value=CONVO), \
             patch.object(inbox, 'user_display_names', return_value={MUM: 'Mia Lark'}), \
             patch.object(inbox, 'message_in_thread',
                          return_value={'id': 'msg-1', 'sender_id': MUM,
                                        'message_content': 'Where is the form?'}), \
             patch('services.thread_task_service.create_task_from_thread',
                   return_value={'task': {'id': 't1'}, 'grant': {'id': 'g1'}}) as make:
            resp = client.post('/api/school-inbox/conversations/conv-1/task', headers=auth_headers,
                               json={'assignee_id': TAM, 'message_id': 'msg-1', 'action': 'reply',
                                     'priority': 'high', 'due_date': '2026-09-30'})
        assert resp.status_code == 201
        args, kwargs = make.call_args
        assert args == (ORG_ID, 'test-user-123', TAM)
        assert kwargs['conversation_id'] == 'conv-1' and kwargs['message_id'] == 'msg-1'
        assert kwargs['member_name'] == 'Mia Lark'
        assert kwargs['quote'] == 'Where is the form?' and kwargs['quote_sender'] == 'Mia Lark'

    def test_a_message_from_another_thread_is_refused(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('org_admin')), \
             patch('services.sis_service.resolve_org_id', return_value=ORG_ID), \
             patch.object(inbox, 'school_account', return_value=(ORG, INBOX)), \
             patch.object(inbox, 'conversation_for_inbox', return_value=CONVO), \
             patch.object(inbox, 'user_display_names', return_value={}), \
             patch.object(inbox, 'message_in_thread', return_value=None), \
             patch('services.thread_task_service.create_task_from_thread') as make:
            resp = client.post('/api/school-inbox/conversations/conv-1/task', headers=auth_headers,
                               json={'assignee_id': TAM, 'message_id': 'elsewhere'})
        assert resp.status_code == 400
        make.assert_not_called()


# ── "Tam T for iCreate" ──────────────────────────────────────────────────────

@pytest.mark.unit
def test_the_family_sees_who_wrote_a_granted_reply():
    from services import messaging_extras_service as extras
    repo = Mock()
    repo.user_names.return_value = {TAM: {'id': TAM, 'first_name': 'Tam', 'last_name': 'T'}}
    repo.orgs_by_inbox_user.return_value = {INBOX: {'id': ORG_ID, 'name': 'iCreate'}}
    messages = [
        {'id': 'a', 'sender_id': INBOX, 'sent_by_user_id': TAM, 'show_sender_name': True},
        {'id': 'b', 'sender_id': INBOX, 'sent_by_user_id': KATE},  # the office: no label
        {'id': 'c', 'sender_id': MUM},
    ]
    with patch('repositories.school_thread_repository.SchoolThreadRepository', return_value=repo), \
         patch.object(extras, '_admin'):
        extras.attach_sender_labels(messages)
    assert messages[0]['sender_label'] == 'Tam T for iCreate'
    assert 'sender_label' not in messages[1] and 'sender_label' not in messages[2]


@pytest.mark.unit
def test_show_sender_name_is_only_written_when_true():
    """The column is new; a send that never sets it must not name it, so the
    ordinary send cannot fail on a database that has not been migrated."""
    from services.direct_message_service import DirectMessageService
    svc = DirectMessageService()
    inserted = []
    client = Mock()

    def table(name):
        t = Mock()
        for chained in ('select', 'eq', 'limit', 'single', 'update', 'order'):
            getattr(t, chained).return_value = t
        t.insert.side_effect = lambda row: (inserted.append((name, row)), t)[1]
        t.execute.return_value = Mock(data=[{'id': 'm', 'conversation_id': 'c'}])
        return t
    client.table.side_effect = table
    with patch.object(svc, 'can_message_user', return_value=True), \
         patch.object(svc, '_screen_kind', return_value=None), \
         patch.object(svc, 'get_or_create_conversation', return_value={'id': 'c'}), \
         patch.object(svc, '_get_client', return_value=client), \
         patch.object(svc, '_update_conversation_metadata'), \
         patch.object(svc, '_notify_recipient') as notify, \
         patch('services.messaging_extras_service.enrich_messages', side_effect=lambda t, rows, v: rows), \
         patch('services.messaging_extras_service.broadcast_dm'):
        svc.send_message(INBOX, MUM, 'hi', sent_by_user_id=KATE)
        svc.send_message(INBOX, MUM, 'hi', sent_by_user_id=TAM, show_sender_name=True, push=False)
    rows = [row for name, row in inserted if name == 'direct_messages']
    assert 'show_sender_name' not in rows[0]
    assert rows[1]['show_sender_name'] is True
    assert 'push' not in notify.call_args_list[0].kwargs
    assert notify.call_args_list[1].kwargs['push'] is False


@pytest.mark.unit
def test_push_off_keeps_the_bell_and_skips_the_phone():
    from services.notification_service import NotificationService
    svc = NotificationService.__new__(NotificationService)
    svc.supabase = Mock()
    svc.supabase.table.return_value.insert.return_value.execute.return_value = Mock(data=[{'id': 'n'}])
    with patch.object(svc, '_is_type_enabled', return_value=True), \
         patch.object(svc, '_broadcast_realtime') as realtime, \
         patch.object(svc, '_send_push_notification') as web, \
         patch.object(svc, '_send_expo_push_notification') as mobile:
        svc.create_notification(MUM, 'message_received', 't', 'm', push=False)
        realtime.assert_called_once()
        web.assert_not_called()
        mobile.assert_not_called()
        svc.create_notification(MUM, 'message_received', 't', 'm')
        assert web.call_count + mobile.call_count >= 1
