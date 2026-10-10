"""School inbox email alerts, and the reply that comes back as the school.

Tanner, 2026-10-09: "I'm not getting alerted when a message is sent to the
Optio Academy inbox. Email me every time a message comes through. I want to be
able to reply to the email and have it appear in Optio messages just like as if
I had typed my reply directly there."

Optio Academy has no org admin and no campus coordinator, so the bell fan-out
(admin_recipient_ids) reached nobody. A reader who turns on "Email me every
message" now gets the bell too, plus an email whose Reply-To is a school relay.
A reply to that relay goes through send_as_school exactly as a console reply
does: the school is the sender, the reader is sent_by, the thread is kept.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from services import message_email_relay_service as relay  # noqa: E402
from services import school_inbox_service  # noqa: E402

ORG = {'id': 'org-academy', 'name': 'Optio Academy', 'is_active': True,
       'inbox_user_id': 'inbox-user'}
TOKEN = 'abcdefghijklmnopqrstuvwxyz012345'
TO = '{"to":["reply+%s@reply.optioeducation.com"]}' % TOKEN

SCHOOL_RELAY = {
    'id': 'relay-2',
    'token': TOKEN,
    'owner_id': 'superadmin-id',
    'owner_email': 'tannerbowman@gmail.com',
    'recipient_id': 'parent-id',
    'organization_id': 'org-academy',
    'reply_count': 0,
    'expires_at': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
    'revoked': False,
}


# ─────────────────────────── the reply direction ───────────────────────────

def _inbound(relay_row, *, can_read=True, text='Yes, that works.'):
    send = MagicMock(return_value={'id': 'msg-9', 'conversation_id': 'conv-9'})
    personal = MagicMock()
    with patch.object(relay, 'find_relay', return_value=relay_row), \
         patch.object(relay, '_admin', return_value=MagicMock()), \
         patch.object(school_inbox_service, 'inbox_access', return_value=can_read), \
         patch.object(school_inbox_service, 'get_org', return_value=ORG), \
         patch.object(school_inbox_service, 'send_as_school', send), \
         patch('services.direct_message_service.DirectMessageService', personal):
        status, detail = relay.handle_inbound(
            to_header=None, envelope_to=TO,
            from_header='Tanner Bowman <tannerbowman@gmail.com>',
            text=text + '\n\nOn Thu, Oct 9, 2026 at 9:00 AM Optio wrote:\n> Can we meet?',
            dkim='{@gmail.com : pass}',
        )
    return status, send, personal


def test_reply_to_a_school_alert_goes_out_as_the_school():
    status, send, personal = _inbound(SCHOOL_RELAY)
    assert status == 'delivered'
    # The same call a console reply makes: school sender, the reader signed
    # as sent_by, kept in the existing thread. Only the typed words, no quote.
    send.assert_called_once_with(
        ORG, 'parent-id', 'Yes, that works.', sent_by='superadmin-id',
        in_thread=True, sent_from='email',
    )
    personal.return_value.send_message.assert_not_called()


def test_reply_from_someone_taken_off_the_inbox_is_refused():
    status, send, _ = _inbound(SCHOOL_RELAY, can_read=False)
    assert status == 'ignored'
    send.assert_not_called()


def test_personal_relay_still_replies_as_its_owner():
    personal_row = {**SCHOOL_RELAY, 'organization_id': None}
    status, send, personal = _inbound(personal_row)
    assert status == 'delivered'
    send.assert_not_called()
    personal.return_value.send_message.assert_called_once_with(
        'superadmin-id', 'parent-id', 'Yes, that works.', sent_from='email')


def test_school_relay_is_keyed_apart_from_the_personal_one():
    repo = MagicMock()
    repo.find_for_pair.return_value = None
    repo.insert_relay.side_effect = lambda fields: fields
    with patch.object(relay, '_repo', return_value=repo):
        row = relay.get_or_create_relay('superadmin-id', 'T@x.com', 'parent-id',
                                        organization_id='org-academy')
    repo.find_for_pair.assert_called_once_with('superadmin-id', 'parent-id', 'org-academy')
    assert row['organization_id'] == 'org-academy'


# ─────────────────────────── the alert direction ───────────────────────────

MESSAGE = {'id': 'msg-1', 'conversation_id': 'conv-1',
           'message_content': 'Can we meet Friday?', 'attachments': []}


def test_alert_email_carries_the_message_and_a_school_relay():
    email = MagicMock()
    email.return_value.send_email.return_value = True
    with patch.object(relay, 'replies_enabled', return_value=True), \
         patch.object(relay, 'get_or_create_relay', return_value={'token': TOKEN}) as mint, \
         patch('services.email_service.EmailService', email), \
         patch('app_config.Config.INBOUND_EMAIL_DOMAIN', 'reply.optioeducation.com'):
        ok = relay.email_school_message_to_watcher(
            {'id': 'superadmin-id', 'email': 'tannerbowman@gmail.com'}, ORG, MESSAGE,
            {'id': 'parent-id', 'first_name': 'Jane', 'last_name': 'Doe'})
    assert ok
    assert mint.call_args.kwargs['organization_id'] == 'org-academy'
    kwargs = email.return_value.send_email.call_args.kwargs
    assert kwargs['to_email'] == 'tannerbowman@gmail.com'
    assert kwargs['reply_to'] == f'reply+{TOKEN}@reply.optioeducation.com'
    # Fixed per family, so Gmail keeps one family's alerts in one thread.
    assert kwargs['subject'] == 'Optio Academy inbox: Jane Doe'
    assert kwargs['text_body'].startswith('Can we meet Friday?')
    assert kwargs['support_copy'] is False


def test_placeholder_reader_gets_no_email():
    email = MagicMock()
    with patch('services.email_service.EmailService', email):
        assert not relay.email_school_message_to_watcher(
            {'id': 'x', 'email': 'a@b.com', 'is_placeholder': True}, ORG, MESSAGE,
            {'id': 'parent-id'})
    email.return_value.send_email.assert_not_called()


def test_watchers_who_still_read_the_inbox_are_emailed_but_not_the_sender():
    repo = MagicMock()
    repo.school_inbox_email_ids.return_value = ['superadmin-id', 'moved-away-id', 'parent-id']
    people = MagicMock()
    people.return_value.get_people_with_email.return_value = [
        {'id': 'superadmin-id', 'email': 'tannerbowman@gmail.com'},
        {'id': 'parent-id', 'email': 'jane@example.com', 'first_name': 'Jane'},
    ]
    mail = MagicMock(return_value=True)
    with patch('repositories.notification_repository.NotificationRepository',
               return_value=repo), \
         patch('repositories.message_email_relay_repository.MessageEmailRelayRepository',
               people), \
         patch.object(school_inbox_service, '_admin', return_value=MagicMock()), \
         patch.object(school_inbox_service, 'reads_inbox_of',
                      side_effect=lambda uid, org_id: uid != 'moved-away-id'), \
         patch.object(relay, 'email_school_message_to_watcher', mail):
        sent = school_inbox_service.email_watchers_of_member_message(
            ORG, MESSAGE, 'parent-id')
    assert sent == 1
    watcher, org, message, member = mail.call_args.args
    assert watcher['id'] == 'superadmin-id'
    assert member['id'] == 'parent-id'


def test_a_watcher_outside_the_office_list_gets_the_bell_too():
    notifications = MagicMock()
    with patch('services.notification_service.NotificationService', notifications), \
         patch.object(school_inbox_service, 'admin_recipient_ids', return_value=[]), \
         patch.object(school_inbox_service, 'email_watcher_ids',
                      return_value=['superadmin-id']):
        school_inbox_service.notify_admins_of_member_message(
            ORG, 'parent-id', 'Jane Doe', 'Can we meet Friday?', conversation_id='conv-1')
    call = notifications.return_value.create_notification.call_args.kwargs
    assert call['user_id'] == 'superadmin-id'
    assert 'conversation=conv-1' in call['link']


def test_reader_check_refuses_another_schools_admin():
    with patch('services.sis_service.resolve_org_id', return_value='org-other'), \
         patch.object(school_inbox_service, 'inbox_access', return_value=True):
        assert not school_inbox_service.reads_inbox_of('admin-elsewhere', 'org-academy')
    with patch('services.sis_service.resolve_org_id', return_value='org-academy'), \
         patch.object(school_inbox_service, 'inbox_access', return_value=True):
        assert school_inbox_service.reads_inbox_of('superadmin-id', 'org-academy')
