"""Staff groups sent from the SIS School tab belong to the school.

iCreate, ac84b6cd: "when I sent a group message from icreate's inbox, the
thread popped into my PERSONAL inbox". The School tab's "Message a group" went
through GroupMessageService.create_group(actor, ...), so the sender owned the
group and was its only admin, and the School tab never listed groups at all.

Owner decision (2026-09-22): a group sent from the School tab is created by the
school-inbox account, the actor is recorded as the sender of what they wrote,
and the org's front office reads it the way it reads the school's DMs. A group
sent from My messages stays the actor's own.

Also here, 11f6ad24: the bell notification for a member's message to the school
linked to '/inbox' with no thread, so "View details" went nowhere.
"""

from unittest.mock import MagicMock, Mock, patch

import pytest

from services import school_inbox_service
from services import sis_messaging_service as messaging
from services.group_message_service import GroupMessageService

ORG_ID = 'org-1'
ORG = {'id': ORG_ID, 'name': 'iCreate', 'is_active': True, 'inbox_user_id': 'inbox-1'}
INBOX = 'inbox-1'
KATE = 'kate-admin'          # the sender
JULIA = 'julia-coordinator'  # front office, not the sender
TEACHER_A = 'teacher-a'
TEACHER_B = 'teacher-b'
PARENT = 'parent-1'
OTHER_ADMIN = 'other-school-admin'

STAFF = [
    {'id': KATE, 'name': 'Kate A', 'first_name': 'Kate', 'roles': ['org_admin'],
     'is_placeholder': False},
    {'id': JULIA, 'name': 'Julia B', 'first_name': 'Julia',
     'roles': ['campus_coordinator'], 'is_placeholder': False},
    {'id': TEACHER_A, 'name': 'Ada L', 'first_name': 'Ada', 'roles': ['advisor'],
     'is_placeholder': False},
    {'id': TEACHER_B, 'name': 'Sam P', 'first_name': 'Sam', 'roles': ['advisor'],
     'is_placeholder': False},
]


class _FakeTable:
    """A chainable PostgREST table double that records writes."""

    def __init__(self, db, name):
        self.db, self.name = db, name
        self._payload = None

    def __getattr__(self, attr):
        # select / eq / neq / in_ / order / limit / single ... all chain.
        return lambda *a, **k: self

    def insert(self, payload):
        self.db.inserts.setdefault(self.name, []).append(payload)
        self._payload = payload
        return self

    def update(self, payload):
        self.db.updates.setdefault(self.name, []).append(payload)
        return self

    def execute(self):
        if self._payload is not None:
            rows = self._payload if isinstance(self._payload, list) else [self._payload]
            return Mock(data=rows, count=None)
        return Mock(data=self.db.reads.get(self.name, []), count=0)


class _FakeDb:
    def __init__(self, reads=None):
        self.inserts, self.updates, self.reads = {}, {}, reads or {}

    def table(self, name):
        return _FakeTable(self, name)


@pytest.fixture
def staff():
    with patch('services.sis_service.list_org_staff', return_value=STAFF):
        yield


# ── Who owns the group ───────────────────────────────────────────────────────

@pytest.mark.unit
class TestSchoolTabGroupIsOwnedByTheSchool:
    def test_compose_from_the_school_tab_creates_a_school_group(self, staff):
        """ac84b6cd: the School tab's group is the school's, written by Kate."""
        svc = Mock()
        svc.create_school_group.return_value = {'id': 'group-1'}
        svc.send_message.return_value = {'id': 'msg-1'}
        with patch('services.group_message_service.GroupMessageService', return_value=svc), \
             patch.object(school_inbox_service, 'school_account', return_value=(ORG, INBOX)):
            result = messaging.compose(ORG_ID, KATE, body='Gate code changed',
                                       recipient_ids=[TEACHER_A, TEACHER_B],
                                       as_school=True)

        assert result['mode'] == 'group'
        svc.create_group.assert_not_called()
        args = svc.create_school_group.call_args
        assert args.args[:3] == (ORG_ID, INBOX, KATE)
        assert sorted(args.kwargs['member_ids']) == [TEACHER_A, TEACHER_B]
        assert args.kwargs['audience'] == 'staff'
        # The actor is the sender of the message; the school's membership is
        # what lets them post.
        send = svc.send_message.call_args
        assert send.args[0] == KATE
        assert send.kwargs['on_behalf_of'] == INBOX

    def test_a_school_group_is_created_by_the_inbox_and_records_the_actor(self):
        """The group row and memberships: the inbox creates and administers
        it, every membership names Kate as who added it, and Kate is not a
        member -- a member's group is what showed up in her personal list."""
        db = _FakeDb()
        svc = GroupMessageService()
        with patch.object(svc, '_get_client', return_value=db), \
             patch.object(svc, 'can_create_group', return_value=True):
            group = svc.create_school_group(ORG_ID, INBOX, KATE, 'Tuesday cover',
                                            [TEACHER_A, TEACHER_B])

        assert group['created_by'] == INBOX
        assert group['organization_id'] == ORG_ID
        assert group['audience'] == 'staff'
        members = db.inserts['group_members'][0]
        by_user = {m['user_id']: m for m in members}
        assert set(by_user) == {INBOX, TEACHER_A, TEACHER_B}
        assert by_user[INBOX]['role'] == 'admin'
        assert KATE not in by_user
        assert {m['added_by'] for m in members} == {KATE}

    def test_a_non_staff_actor_cannot_create_one(self):
        svc = GroupMessageService()
        with patch.object(svc, 'can_create_group', return_value=False):
            with pytest.raises(ValueError):
                svc.create_school_group(ORG_ID, INBOX, PARENT, 'x', [TEACHER_A])

    def test_the_school_tab_group_fails_rather_than_filing_it_personally(self, staff):
        """No inbox account: a retryable error, never the old personal group."""
        svc = Mock()
        with patch('services.group_message_service.GroupMessageService', return_value=svc), \
             patch.object(school_inbox_service, 'school_account', return_value=(ORG, None)):
            with pytest.raises(RuntimeError):
                messaging.compose(ORG_ID, KATE, body='Hi',
                                  recipient_ids=[TEACHER_A, TEACHER_B], as_school=True)
        svc.create_group.assert_not_called()

    def test_separate_messages_from_the_school_tab_go_as_the_school(self, staff):
        sent = []
        with patch.object(school_inbox_service, 'send_as_school',
                          side_effect=lambda org, rid, content, **k: sent.append((org, rid, k))
                          or {'conversation_id': f'conv-{rid}'}):
            result = messaging.compose(ORG_ID, KATE, body='Paperwork', mode='separate',
                                       recipient_ids=[TEACHER_A, TEACHER_B], as_school=True)
        assert result['sent'] == 2
        assert {rid for _o, rid, _k in sent} == {TEACHER_A, TEACHER_B}
        assert {k['sent_by'] for _o, _r, k in sent} == {KATE}


@pytest.mark.unit
class TestMyMessagesGroupStaysPersonal:
    def test_compose_from_my_messages_creates_an_actor_owned_group(self, staff):
        """The personal path is unchanged: Kate owns it and sends as herself."""
        svc = Mock()
        svc.create_group.return_value = {'id': 'group-1'}
        with patch('services.group_message_service.GroupMessageService', return_value=svc):
            messaging.compose(ORG_ID, KATE, body='Hi', recipient_ids=[TEACHER_A, TEACHER_B])

        svc.create_school_group.assert_not_called()
        assert svc.create_group.call_args.args[0] == KATE
        assert svc.send_message.call_args.args[0] == KATE
        assert 'on_behalf_of' not in svc.send_message.call_args.kwargs


# ── Who can read it ──────────────────────────────────────────────────────────

def _group_row(created_by=INBOX, org_id=ORG_ID, active=True):
    return {'id': 'group-1', 'name': 'Tuesday cover', 'created_by': created_by,
            'organization_id': org_id, 'is_active': active, 'audience': 'staff'}


@pytest.fixture
def access_world():
    """One school group, owned by iCreate's inbox; Kate and Julia are the
    front office."""
    def _run(user_id, group=None, superadmin=False):
        repo = Mock()
        repo.group_owner_row.return_value = group or _group_row()
        with patch('repositories.group_repository.GroupRepository', return_value=repo), \
             patch.object(school_inbox_service, '_admin', return_value=Mock()), \
             patch.object(school_inbox_service, 'org_for_inbox_user',
                          side_effect=lambda uid: ORG if uid == INBOX else None), \
             patch('services.sis_service.list_org_staff', return_value=STAFF), \
             patch.object(GroupMessageService, '_is_superadmin', return_value=superadmin):
            return school_inbox_service.school_group_access(user_id, 'group-1')
    return _run


@pytest.mark.unit
class TestWhoReadsASchoolGroup:
    def test_a_colleague_who_did_not_send_it_can_read_it(self, access_world):
        """ac84b6cd: the office shares it, as it shares the school's DMs."""
        access = access_world(JULIA)
        assert access is not None
        assert access['inbox_user_id'] == INBOX
        assert access['org']['id'] == ORG_ID

    def test_the_sender_can_read_it(self, access_world):
        assert access_world(KATE) is not None

    def test_a_teacher_cannot_read_it_as_the_school(self, access_world):
        """A teacher in the room reads it as a member, through /api/groups."""
        assert access_world(TEACHER_A) is None

    def test_a_parent_cannot_read_it(self, access_world):
        assert access_world(PARENT) is None

    def test_another_schools_admin_cannot_read_it(self, access_world):
        assert access_world(OTHER_ADMIN) is None

    def test_a_superadmin_can(self, access_world):
        assert access_world('platform-admin', superadmin=True) is not None

    def test_a_personal_group_is_not_the_schools(self, access_world):
        """Kate's own group from My messages stays hers."""
        assert access_world(JULIA, group=_group_row(created_by=KATE)) is None

    def test_a_group_filed_under_another_org_is_not_this_schools(self, access_world):
        assert access_world(JULIA, group=_group_row(org_id='org-2')) is None

    def test_a_deleted_group_is_not_readable(self, access_world):
        assert access_world(JULIA, group=_group_row(active=False)) is None


# ── Sending on behalf of the school ──────────────────────────────────────────

@pytest.mark.unit
class TestSendingInASchoolGroup:
    def _send(self, **kwargs):
        db = _FakeDb(reads={'group_conversations': {'announcement_only': False,
                                                    'audience': 'staff'}})
        svc = GroupMessageService()
        checked = []
        with patch.object(svc, '_get_client', return_value=db), \
             patch.object(svc, 'is_group_member',
                          side_effect=lambda uid, gid: checked.append(uid) or uid == INBOX), \
             patch.object(svc, '_screen_kind', return_value=None), \
             patch.object(svc, '_notify_group_members'), \
             patch.object(svc, '_get_user_info', side_effect=lambda uid: {'id': uid}), \
             patch('services.messaging_extras_service.enrich_messages',
                   side_effect=lambda kind, rows, uid: rows), \
             patch('services.messaging_extras_service.broadcast_group'), \
             patch('utils.storage_urls.sign_in_place'):
            svc.send_message(KATE, 'group-1', 'Did the room get sorted?',
                             sent_from='web', **kwargs)
        return db, checked

    def test_the_actor_is_the_sender_and_the_school_is_the_member(self):
        db, checked = self._send(on_behalf_of=INBOX)
        assert checked == [INBOX]
        assert db.inserts['group_messages'][0]['sender_id'] == KATE

    def test_without_the_school_a_non_member_is_refused(self):
        with pytest.raises(ValueError):
            self._send()


# ── Notifications (11f6ad24) ─────────────────────────────────────────────────

@pytest.mark.unit
class TestTheBellOpensTheThread:
    def test_the_link_and_metadata_carry_the_conversation(self):
        """11f6ad24: "View details" linked to /inbox, the page the reader was
        already on. The link now opens the thread; the id is in metadata too."""
        notifications = MagicMock()
        with patch('services.sis_service.list_org_staff', return_value=STAFF), \
             patch('services.notification_service.NotificationService',
                   return_value=notifications):
            school_inbox_service.notify_admins_of_member_message(
                ORG, PARENT, 'Pat Parent', 'hello', conversation_id='conv-9')

        calls = notifications.create_notification.call_args_list
        assert {c.kwargs['user_id'] for c in calls} == {KATE, JULIA}
        for c in calls:
            assert c.kwargs['link'] == '/inbox?tab=school&conversation=conv-9'
            assert c.kwargs['metadata']['conversation_id'] == 'conv-9'

    def test_the_dm_send_passes_its_conversation_to_the_school_notification(self):
        from services.direct_message_service import DirectMessageService
        svc = DirectMessageService()
        with patch.object(svc, '_get_user_info',
                          return_value={'display_name': 'Pat Parent'}), \
             patch.object(school_inbox_service, 'org_for_inbox_user', return_value=ORG), \
             patch.object(school_inbox_service, 'notify_admins_of_member_message') as notify:
            svc._notify_recipient(PARENT, INBOX, 'hello', conversation_id='conv-9')
        assert notify.call_args.kwargs['conversation_id'] == 'conv-9'

    def test_a_reply_in_a_school_group_reaches_the_office_not_the_inbox_account(self):
        """The inbox account is a member nobody logs in as; the front office
        hears about a teacher's reply instead, linked to the group in the
        console."""
        db = _FakeDb(reads={
            'group_conversations': {'name': 'Tuesday cover', 'organization_id': ORG_ID,
                                    'created_by': INBOX},
            'group_members': [{'user_id': INBOX}, {'user_id': TEACHER_B}],
        })
        svc = GroupMessageService()
        notifications = MagicMock()
        with patch.object(svc, '_get_client', return_value=db), \
             patch.object(svc, '_get_user_info', return_value={'display_name': 'Ada'}), \
             patch.object(school_inbox_service, 'org_for_inbox_user',
                          side_effect=lambda uid: ORG if uid == INBOX else None), \
             patch('services.sis_service.list_org_staff', return_value=STAFF), \
             patch('services.group_message_service.NotificationService',
                   return_value=notifications):
            svc._notify_group_members(TEACHER_A, 'group-1', 'Yes, sorted')

        by_user = {c.kwargs['user_id']: c.kwargs
                   for c in notifications.create_notification.call_args_list}
        assert INBOX not in by_user
        assert set(by_user) == {KATE, JULIA, TEACHER_B}
        assert by_user[KATE]['link'] == '/inbox?tab=school&group=group-1'
        assert by_user[JULIA]['metadata']['group_id'] == 'group-1'
