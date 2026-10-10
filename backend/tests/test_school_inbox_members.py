"""Org admins choose who can open the school inbox.

Ticket 19047fd0, Molly (iCreate, org_admin): the school inbox was every org
admin and campus coordinator, with no way to leave a coordinator out.

The decision: org admins pick inbox members, stored in
organizations.feature_flags.sis_settings.school_inbox_member_ids. An empty list
is every office staff member (the old behaviour). Org admins and a superadmin
always have access. The bell, the task assignee list and the school groups
follow the same list; _resolve_inbox is the one route gate.
"""

import json
from unittest.mock import Mock, patch

import pytest

from services import school_inbox_service as inbox
from services import org_settings_service
from services.org_settings_service import FlagsRejected

ORG_ID = 'org-1'
ORG = {'id': ORG_ID, 'name': 'iCreate', 'is_active': True, 'inbox_user_id': 'inbox-1'}
ADMIN = 'molly'
ON_LIST = 'coord-on'
OFF_LIST = 'coord-off'
TEACHER = 'tam'
ME = 'test-user-123'  # mock_verify_token's user

STAFF = [
    {'id': ADMIN, 'name': 'Molly', 'roles': ['org_admin']},
    {'id': ON_LIST, 'name': 'Becky', 'roles': ['campus_coordinator']},
    {'id': OFF_LIST, 'name': 'Kate', 'roles': ['campus_coordinator']},
    {'id': TEACHER, 'name': 'Tam', 'roles': ['advisor']},
]

CTX = {
    ADMIN: {'role': 'org_managed', 'org_role': 'org_admin', 'organization_id': ORG_ID},
    ON_LIST: {'role': 'org_managed', 'org_role': 'campus_coordinator', 'organization_id': ORG_ID},
    OFF_LIST: {'role': 'org_managed', 'org_role': 'campus_coordinator', 'organization_id': ORG_ID},
    TEACHER: {'role': 'org_managed', 'org_role': 'advisor', 'organization_id': ORG_ID},
    'root': {'role': 'superadmin', 'organization_id': None},
}


def _data(resp):
    body = json.loads(resp.data)
    return body.get('data', body)


@pytest.fixture
def world():
    """Staff, roles and the stored list. `world(members)` sets the list."""
    def _set(members):
        return patch.object(inbox, 'inbox_member_ids', return_value=list(members))
    with patch('services.sis_service.list_org_staff', return_value=STAFF), \
         patch('services.sis_service.get_user_org_context',
               side_effect=lambda uid: dict(CTX.get(uid, {}))):
        yield _set


# ── The rule ─────────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestInboxAccess:
    def test_empty_list_is_every_office_staff_member(self, world):
        with world([]):
            assert inbox.inbox_access(ADMIN, ORG_ID) is True
            assert inbox.inbox_access(ON_LIST, ORG_ID) is True
            assert inbox.inbox_access(OFF_LIST, ORG_ID) is True
            assert inbox.inbox_access(TEACHER, ORG_ID) is False
            assert inbox.admin_recipient_ids(ORG_ID) == [ADMIN, ON_LIST, OFF_LIST]

    def test_a_coordinator_off_a_list_is_refused(self, world):
        with world([ON_LIST]):
            assert inbox.inbox_access(OFF_LIST, ORG_ID) is False
            assert inbox.inbox_access(ON_LIST, ORG_ID) is True

    def test_org_admins_and_a_superadmin_always_have_access(self, world):
        with world([ON_LIST]):
            assert inbox.inbox_access(ADMIN, ORG_ID) is True
            assert inbox.inbox_access('root', ORG_ID) is True

    def test_a_teacher_on_the_list_is_still_not_office(self, world):
        with world([TEACHER]):
            assert inbox.inbox_access(TEACHER, ORG_ID) is False

    def test_thread_access_follows_the_list(self, world):
        with world([ON_LIST]):
            assert inbox.thread_access(ON_LIST, ORG) == 'office'
            assert inbox.thread_access(OFF_LIST, ORG) is None

    def test_the_stored_list_is_read_from_sis_settings(self):
        flags = {'sis_settings': {'school_inbox_member_ids': [ON_LIST]}}
        assert inbox.members_from_flags(flags) == [ON_LIST]
        assert inbox.members_from_flags({}) == []
        assert inbox.members_from_flags(None) == []
        assert inbox.members_from_flags({'sis_settings': {'school_inbox_member_ids': 'x'}}) == []


@pytest.mark.unit
class TestWhoHearsAndWhoGetsTasks:
    def test_the_bell_rings_only_the_list_and_the_admins(self, world):
        notifier = Mock()
        with world([ON_LIST]), \
             patch('services.notification_service.NotificationService', return_value=notifier):
            inbox.notify_admins_of_member_message(ORG, 'mum', 'Mia', 'hello', conversation_id='c1')
        rung = [c.kwargs['user_id'] for c in notifier.create_notification.call_args_list]
        assert rung == [ADMIN, ON_LIST]

    def test_a_task_cannot_go_to_a_coordinator_off_the_list(self, world):
        from services import thread_task_service as tasks
        assign = Mock(return_value=[{'id': 't1'}])
        with world([ON_LIST]), \
             patch('services.sis_onboarding_service.assign_task', assign, create=True):
            with pytest.raises(ValueError):
                tasks.create_task_from_thread(ORG_ID, ADMIN, OFF_LIST, conversation_id='c1',
                                              action='reply')
            assign.assert_not_called()
            tasks.create_task_from_thread(ORG_ID, ADMIN, ON_LIST, conversation_id='c1',
                                          action='reply')
            assert assign.call_args.kwargs['org_id'] == ORG_ID

    def test_the_front_office_quick_pick_is_still_every_coordinator(self, world):
        """The compose "Front office" pick names the job, not the inbox."""
        with world([ON_LIST]):
            assert inbox.office_staff_ids(ORG_ID) == [ADMIN, ON_LIST, OFF_LIST]


# ── The route gate ───────────────────────────────────────────────────────────

def _role_client(org_role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': 'org_managed', 'org_role': org_role,
                                             'org_roles': None}])
    return client


@pytest.fixture
def as_caller(world):
    """Sign the test user in as one of the people above."""
    def _as(who, members):
        # The signed-in test user is always ME; they take `who`'s place in the
        # staff list and on the inbox list.
        ctx = CTX[who]
        staff = [dict(s, id=ME) if s['id'] == who else s for s in STAFF]
        members = [ME if m == who else m for m in members]
        stack = [
            patch('database.get_supabase_admin_client',
                  return_value=_role_client(ctx.get('org_role'))),
            patch('services.sis_service.get_user_org_context', return_value=dict(ctx)),
            patch('services.sis_service.resolve_org_id', return_value=ORG_ID),
            patch('services.sis_service.list_org_staff', return_value=staff),
            patch.object(inbox, 'school_account', return_value=(ORG, 'inbox-1')),
            world(members),
        ]
        return stack
    return _as


class _Stack:
    def __init__(self, patches):
        self.patches = patches

    def __enter__(self):
        for p in self.patches:
            p.start()

    def __exit__(self, *exc):
        for p in reversed(self.patches):
            p.stop()


@pytest.mark.unit
class TestRouteGate:
    def test_a_coordinator_off_the_list_is_refused_and_nothing_is_read_or_written(
            self, client, auth_headers, mock_verify_token, as_caller):
        svc = Mock()
        with _Stack(as_caller(OFF_LIST, [ON_LIST])), \
             patch('routes.school_inbox.message_service', svc), \
             patch.object(inbox, 'mark_conversation_read') as mark, \
             patch.object(inbox, 'record_thread_read') as record, \
             patch.object(inbox, 'send_as_school') as send:
            listing = client.get('/api/school-inbox/conversations', headers=auth_headers)
            thread = client.get('/api/school-inbox/conversations/conv-1', headers=auth_headers)
            count = client.get('/api/school-inbox/unread-count', headers=auth_headers)
            reply = client.post('/api/school-inbox/conversations/mum/send',
                                headers=auth_headers, json={'content': 'hi'})
        assert listing.status_code == 403
        assert thread.status_code == 403
        assert count.status_code == 403
        assert reply.status_code == 403
        svc.get_user_conversations.assert_not_called()
        svc.get_conversation_messages.assert_not_called()
        mark.assert_not_called()
        record.assert_not_called()
        send.assert_not_called()

    def test_a_coordinator_on_the_list_is_let_in(self, client, auth_headers,
                                                  mock_verify_token, as_caller):
        svc = Mock()
        svc.get_user_conversations.return_value = [{'id': 'conv-1'}]
        with _Stack(as_caller(ON_LIST, [ON_LIST])), \
             patch('routes.school_inbox.message_service', svc):
            resp = client.get('/api/school-inbox/conversations', headers=auth_headers)
        assert resp.status_code == 200
        assert _data(resp)['conversations'] == [{'id': 'conv-1'}]

    def test_with_no_list_every_coordinator_is_let_in(self, client, auth_headers,
                                                      mock_verify_token, as_caller):
        svc = Mock()
        svc.get_user_conversations.return_value = []
        with _Stack(as_caller(OFF_LIST, [])), \
             patch('routes.school_inbox.message_service', svc):
            resp = client.get('/api/school-inbox/conversations', headers=auth_headers)
        assert resp.status_code == 200


@pytest.mark.unit
class TestAccessEndpoint:
    def test_a_member_sees_every_field(self, client, auth_headers, mock_verify_token, as_caller):
        with _Stack(as_caller(ON_LIST, [ON_LIST])), \
             patch('routes.school_inbox._email_me_on', return_value=True), \
             patch('routes.school_inbox._email_replies_on', return_value=True):
            resp = client.get('/api/school-inbox/access', headers=auth_headers)
        assert resp.status_code == 200
        assert {k: v for k, v in _data(resp).items()} == {
            'organization_id': ORG_ID,
            'inbox_access': True,
            'can_manage': False,
            'member_ids': [ME],
            'everyone': False,
            'office_ids': [ADMIN, ME],
            # "Email me every message" (2026-10-09), and whether a reply to
            # that email comes back in.
            'email_me': True,
            'email_replies': True,
        }

    def test_the_default_is_everyone(self, client, auth_headers, mock_verify_token, as_caller):
        with _Stack(as_caller(ADMIN, [])):
            resp = client.get('/api/school-inbox/access', headers=auth_headers)
        data = _data(resp)
        assert data['inbox_access'] is True
        assert data['can_manage'] is True
        assert data['member_ids'] == []
        assert data['everyone'] is True
        assert data['office_ids'] == [ME, ON_LIST, OFF_LIST]

    def test_a_coordinator_off_the_list_is_told_so(self, client, auth_headers,
                                                   mock_verify_token, as_caller):
        """The School tab hides on this answer, so it must not be a 403."""
        with _Stack(as_caller(OFF_LIST, [ON_LIST])):
            resp = client.get('/api/school-inbox/access', headers=auth_headers)
        assert resp.status_code == 200
        assert _data(resp)['inbox_access'] is False


@pytest.mark.unit
class TestSettingTheList:
    def _put(self, client, auth_headers, as_caller, who, body):
        with _Stack(as_caller(who, [])), \
             patch('services.sis_service.caller_sees_pay', return_value=who != OFF_LIST), \
             patch('services.org_settings_service.patch_feature_flags') as write:
            resp = client.put('/api/school-inbox/access', headers=auth_headers, json=body)
        return resp, write

    def test_a_coordinator_cannot_set_it(self, client, auth_headers, mock_verify_token, as_caller):
        resp, write = self._put(client, auth_headers, as_caller, OFF_LIST,
                                {'member_ids': [OFF_LIST]})
        assert resp.status_code == 403
        write.assert_not_called()

    def test_an_org_admin_sets_it(self, client, auth_headers, mock_verify_token, as_caller):
        resp, write = self._put(client, auth_headers, as_caller, ADMIN,
                                {'member_ids': [ON_LIST, ON_LIST]})
        assert resp.status_code == 200
        patch_body = write.call_args.args[1]
        assert patch_body == {'sis_settings': {'school_inbox_member_ids': [ON_LIST]}}
        assert _data(resp)['member_ids'] == [ON_LIST]
        assert _data(resp)['everyone'] is False

    def test_an_empty_list_clears_it_back_to_everyone(self, client, auth_headers,
                                                      mock_verify_token, as_caller):
        resp, write = self._put(client, auth_headers, as_caller, ADMIN, {'member_ids': []})
        assert resp.status_code == 200
        assert write.call_args.args[1] == {'sis_settings': {'school_inbox_member_ids': None}}
        assert _data(resp)['everyone'] is True

    def test_a_teacher_or_stranger_cannot_be_added(self, client, auth_headers,
                                                   mock_verify_token, as_caller):
        resp, write = self._put(client, auth_headers, as_caller, ADMIN,
                                {'member_ids': [TEACHER, 'someone-else']})
        assert resp.status_code == 400
        write.assert_not_called()

    def test_a_body_without_a_list_is_refused(self, client, auth_headers,
                                              mock_verify_token, as_caller):
        resp, write = self._put(client, auth_headers, as_caller, ADMIN, {'member_ids': 'x'})
        assert resp.status_code == 400
        write.assert_not_called()


@pytest.mark.unit
class TestTheOtherSettingsDoors:
    """PATCH /api/sis/settings and the admin console PUT both pass through
    clean_feature_flags; a coordinator may not put themselves on the list."""

    STORED = {'sis_settings': {'school_inbox_member_ids': [ON_LIST]}}

    def test_a_coordinator_changing_the_list_is_refused(self):
        incoming = {'sis_settings': {'school_inbox_member_ids': [ON_LIST, OFF_LIST]}}
        with pytest.raises(FlagsRejected) as rejected:
            org_settings_service.clean_feature_flags(
                ORG_ID, incoming, sees_finance=False, is_superadmin=False, stored=self.STORED)
        assert rejected.value.status == 403

    def test_a_coordinator_saving_other_settings_keeps_the_list(self):
        incoming = {'sis_settings': {'school_inbox_member_ids': [ON_LIST], 'rooms': ['A']}}
        flags, _ = org_settings_service.clean_feature_flags(
            ORG_ID, incoming, sees_finance=False, is_superadmin=False, stored=self.STORED)
        assert flags['sis_settings']['school_inbox_member_ids'] == [ON_LIST]

    def test_an_org_admin_may_change_it(self):
        incoming = {'sis_settings': {'school_inbox_member_ids': [OFF_LIST]}}
        flags, _ = org_settings_service.clean_feature_flags(
            ORG_ID, incoming, sees_finance=True, is_superadmin=False, stored=self.STORED)
        assert flags['sis_settings']['school_inbox_member_ids'] == [OFF_LIST]
