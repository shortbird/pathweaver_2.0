"""
Unit tests for the school inbox — the "{School Name}" messaging contact.

Locks in the rules that make the feature safe:
- The contact appears for org members (resolved via sis_service.member_org_id,
  so platform parents get it too) and never for outsiders.
- can_message_school allows member <-> inbox for the SAME org only, and denies
  when the org is inactive.
- Messages to the inbox notify the front office (org_admin + campus
  coordinator), not the account itself, and never the member who wrote in.
- sent_by attribution resolves staff names for the shared-inbox view.
"""

from unittest.mock import MagicMock, patch

from services import school_inbox_service
from routes import direct_messages as dm_routes
from routes.direct_messages import _append_school_contact, _deliver_forward


ORG = {'id': 'org-1', 'name': 'iCreate', 'slug': 'icreate',
       'is_active': True, 'inbox_user_id': 'inbox-1'}


# ── The member-facing contact ──

def test_school_contact_shape():
    contact = school_inbox_service.school_contact(ORG, 'inbox-1')
    assert contact['id'] == 'inbox-1'
    assert contact['display_name'] == 'iCreate'
    assert contact['relationship'] == 'school'
    assert contact['is_school'] is True


def test_append_school_contact_for_member():
    with patch.object(school_inbox_service, 'member_org', return_value=ORG), \
         patch.object(school_inbox_service, 'get_or_create_inbox_user', return_value='inbox-1'):
        contacts = [{'id': 'a', 'display_name': 'Alice'}]
        _append_school_contact(contacts, 'member-1')
    assert contacts[-1]['id'] == 'inbox-1'
    assert contacts[-1]['is_school'] is True
    assert contacts[-1]['display_name'] == 'iCreate'


def test_append_school_contact_skipped_for_non_member():
    with patch.object(school_inbox_service, 'member_org', return_value=None):
        contacts = []
        _append_school_contact(contacts, 'platform-user')
    assert contacts == []


def test_append_school_contact_never_raises():
    with patch.object(school_inbox_service, 'member_org', side_effect=RuntimeError('boom')):
        contacts = [{'id': 'a'}]
        _append_school_contact(contacts, 'member-1')
    assert contacts == [{'id': 'a'}]


# ── The permission rule ──

def _admin_with_org_rows(rows):
    admin = MagicMock()
    admin.table.return_value.select.return_value.in_.return_value.execute.return_value = MagicMock(data=rows)
    return admin


def test_can_message_school_member_of_same_org():
    with patch.object(school_inbox_service, '_admin', return_value=_admin_with_org_rows([ORG])), \
         patch('services.sis_service.member_org_id', return_value='org-1'):
        assert school_inbox_service.can_message_school('member-1', 'inbox-1') is True
        # Symmetric: the inbox (staff replying as the school) may DM the member.
        assert school_inbox_service.can_message_school('inbox-1', 'member-1') is True


def test_can_message_school_denies_other_org_member():
    with patch.object(school_inbox_service, '_admin', return_value=_admin_with_org_rows([ORG])), \
         patch('services.sis_service.member_org_id', return_value='org-OTHER'):
        assert school_inbox_service.can_message_school('outsider', 'inbox-1') is False


def test_can_message_school_denies_inactive_org():
    inactive = {**ORG, 'is_active': False}
    with patch.object(school_inbox_service, '_admin', return_value=_admin_with_org_rows([inactive])), \
         patch('services.sis_service.member_org_id', return_value='org-1'):
        assert school_inbox_service.can_message_school('member-1', 'inbox-1') is False


def test_can_message_school_false_for_two_normal_users():
    with patch.object(school_inbox_service, '_admin', return_value=_admin_with_org_rows([])):
        assert school_inbox_service.can_message_school('user-a', 'user-b') is False


# ── Notification fan-out to the front office ──

def test_member_message_notifies_admins_and_coordinators_not_sender():
    staff = [
        {'id': 'admin-1', 'roles': ['org_admin']},
        {'id': 'coord-1', 'roles': ['campus_coordinator', 'parent']},
        {'id': 'teacher-1', 'roles': ['advisor']},
        {'id': 'sender-admin', 'roles': ['org_admin']},
    ]
    notification_service = MagicMock()
    with patch('services.sis_service.list_org_staff', return_value=staff), \
         patch('services.notification_service.NotificationService', return_value=notification_service):
        school_inbox_service.notify_admins_of_member_message(
            ORG, 'sender-admin', 'Sam', 'hello')

    notified = [c.kwargs['user_id'] for c in notification_service.create_notification.call_args_list]
    assert set(notified) == {'admin-1', 'coord-1'}  # teacher excluded, sender excluded
    for c in notification_service.create_notification.call_args_list:
        assert c.kwargs['link'] == '/inbox'
        assert 'iCreate' in c.kwargs['title']


# ── Forward from Optio Support: org admins, by message and by email ──

STAFF = [
    {'id': 'admin-1', 'roles': ['org_admin'], 'email': 'admin@icreate.test',
     'first_name': 'Ada', 'name': 'Ada Admin', 'is_placeholder': False},
    {'id': 'coord-1', 'roles': ['campus_coordinator'], 'email': 'coord@icreate.test',
     'first_name': 'Coby', 'name': 'Coby Coord', 'is_placeholder': False},
    {'id': 'teacher-1', 'roles': ['advisor'], 'email': 'teach@icreate.test',
     'first_name': 'Tam', 'name': 'Tam Teach', 'is_placeholder': False},
    {'id': 'ghost-1', 'roles': ['org_admin'], 'email': 'ghost@placeholder.test',
     'first_name': 'Gus', 'name': 'Gus Ghost', 'is_placeholder': True},
    {'id': 'blank-1', 'roles': ['org_admin'], 'email': None,
     'first_name': 'Bo', 'name': 'Bo Blank', 'is_placeholder': False},
]

ADMINS = [s for s in STAFF if 'org_admin' in s['roles']]


def _email_service(send=True):
    svc = MagicMock()
    svc.send_forwarded_support_message_email.return_value = send
    return svc


def test_forward_targets_org_admins_only():
    # A forward is delivered as a DM FROM the member, and can_message_user only
    # opens that door for org_admin — a coordinator target would 403 the whole
    # forward. Teachers were never the front office.
    with patch('services.sis_service.list_org_staff', return_value=STAFF):
        assert [s['id'] for s in school_inbox_service.org_admin_recipients('org-1')] == [
            'admin-1', 'ghost-1', 'blank-1']


def test_school_that_runs_the_sis_console_keeps_the_shared_inbox():
    # iCreate answers families in the console inbox; a forward belongs there,
    # answered as the school, not in one admin's personal thread.
    sent = MagicMock(return_value={'id': 'm1', 'conversation_id': 'c1'})
    with patch.object(school_inbox_service, 'org_uses_school_inbox', return_value=True), \
         patch.object(school_inbox_service, 'get_or_create_inbox_user', return_value='inbox-1'), \
         patch('services.sis_service.list_org_staff', return_value=STAFF), \
         patch.object(dm_routes.message_service, 'send_message', sent):
        result, err = _deliver_forward(ORG, 'member-1', 'body', [], 'super-1')

    assert err is None
    assert result['via'] == 'school_inbox'
    assert sent.call_args.args[1] == 'inbox-1'
    assert result['reply_url'] == 'https://sis.optioeducation.com/inbox'
    # The whole front office reads that inbox, coordinators included.
    assert [r['id'] for r in result['recipients']] == [
        'admin-1', 'coord-1', 'ghost-1', 'blank-1']


def test_school_without_the_console_gets_admin_dms():
    # Hearthwood never opens the SIS console, so the message goes to the org
    # admins' own Messages, where the web app can open it.
    sent = MagicMock(side_effect=lambda *a, **k: {'id': 'm', 'conversation_id': 'c'})
    with patch.object(school_inbox_service, 'org_uses_school_inbox', return_value=False), \
         patch('services.sis_service.list_org_staff', return_value=STAFF), \
         patch.object(dm_routes.message_service, 'send_message', sent):
        result, err = _deliver_forward(ORG, 'member-1', 'body', [], 'super-1')

    assert err is None
    assert result['via'] == 'org_admins'
    # Org admins only: a member may DM their org admin, never a coordinator.
    assert [c.args[1] for c in sent.call_args_list] == ['admin-1', 'ghost-1', 'blank-1']
    assert result['reply_url'] == 'https://www.optioeducation.com/messages?user=member-1'


def test_one_failed_admin_thread_does_not_lose_the_others():
    def _send(sender, target, *a, **k):
        if target == 'admin-1':
            raise RuntimeError('blocked')
        return {'id': 'm', 'conversation_id': 'c'}

    with patch.object(school_inbox_service, 'org_uses_school_inbox', return_value=False), \
         patch('services.sis_service.list_org_staff', return_value=STAFF), \
         patch.object(dm_routes.message_service, 'send_message', side_effect=_send):
        result, err = _deliver_forward(ORG, 'member-1', 'body', [], 'super-1')

    assert err is None
    # Only the admins actually reached are emailed — no "check your messages"
    # mail pointing at a thread that never got the message.
    assert [r['id'] for r in result['recipients']] == ['ghost-1', 'blank-1']


def test_forward_refused_when_the_school_has_no_org_admin():
    from flask import Flask
    with Flask(__name__).app_context(), \
         patch.object(school_inbox_service, 'org_uses_school_inbox', return_value=False), \
         patch('services.sis_service.list_org_staff', return_value=[]):
        result, err = _deliver_forward(ORG, 'member-1', 'body', [], 'super-1')
        body, status = err
        payload = body.get_json()
    assert result is None
    # A refusal the superadmin can act on, not a silent no-op.
    assert status == 400
    assert 'no org admin' in payload['error']


def test_forward_reply_url_opens_the_thread_in_the_web_app():
    url = school_inbox_service.forward_reply_url('member-9')
    # The web app is the surface every admin has; ?user= opens that thread.
    assert url == 'https://www.optioeducation.com/messages?user=member-9'
    assert 'sis.' not in url


def test_forward_emails_reachable_admins():
    svc = _email_service()
    with patch('services.email_service.EmailService', return_value=svc):
        sent = school_inbox_service.email_admins_of_forwarded_message(
            ORG, ADMINS, 'Sam Student', 'My schedule is wrong',
            'https://www.optioeducation.com/messages?user=member-9')

    addressed = [c.kwargs['to_email']
                 for c in svc.send_forwarded_support_message_email.call_args_list]
    # Placeholder and empty addresses bounce.
    assert addressed == ['admin@icreate.test']
    assert sent == 1
    first = svc.send_forwarded_support_message_email.call_args_list[0].kwargs
    assert first['org_name'] == 'iCreate'
    assert first['member_name'] == 'Sam Student'
    assert first['message_text'] == 'My schedule is wrong'
    assert first['reply_url'].endswith('/messages?user=member-9')
    assert first['school_inbox'] is False


def test_forward_email_counts_only_successful_sends():
    svc = _email_service(send=False)
    with patch('services.email_service.EmailService', return_value=svc):
        assert school_inbox_service.email_admins_of_forwarded_message(
            ORG, ADMINS, 'Sam', 'hi', 'https://x/messages?user=m') == 0


def test_forward_email_failure_never_raises():
    svc = MagicMock()
    svc.send_forwarded_support_message_email.side_effect = RuntimeError('sendgrid down')
    with patch('services.email_service.EmailService', return_value=svc):
        # The message is already in the admin's inbox; a mail outage must not
        # undo it.
        assert school_inbox_service.email_admins_of_forwarded_message(
            ORG, ADMINS, 'Sam', 'hi', 'https://x/messages?user=m') == 0


def test_admin_recipient_ids_still_the_whole_front_office():
    # The shared-inbox bell keeps including campus coordinators; only the
    # forward narrows to org admins.
    with patch('services.sis_service.list_org_staff', return_value=STAFF):
        assert school_inbox_service.admin_recipient_ids('org-1') == [
            'admin-1', 'coord-1', 'ghost-1', 'blank-1']


# ── sent_by attribution ──

def test_attach_sent_by_names():
    admin = MagicMock()
    admin.table.return_value.select.return_value.in_.return_value.execute.return_value = MagicMock(
        data=[{'id': 'staff-1', 'display_name': 'Kate', 'first_name': 'Kate', 'last_name': ''}]
    )
    messages = [
        {'id': 'm1', 'sent_by_user_id': 'staff-1'},
        {'id': 'm2', 'sent_by_user_id': None},
    ]
    with patch.object(school_inbox_service, '_admin', return_value=admin):
        school_inbox_service.attach_sent_by_names(messages)
    assert messages[0]['sent_by_name'] == 'Kate'
    assert 'sent_by_name' not in messages[1]
