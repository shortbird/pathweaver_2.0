"""Every message to the Optio Support account is mailed to its inbox.

Tanner, 2026-10-12: "all messages sent to optio support or the optio academy
superadmin (me) need to come to my email, and when i reply via email, the text
should come through the same way other optio messages do."

Optio Academy families write to the Optio Support contact, which is Tanner's
own superadmin account, not to the school inbox, so the 2026-10-09 school
inbox alerts never fired for them. The mail uses the same personal relay as
"Email this to me", so a reply posts into the thread as him.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from services import message_email_relay_service as relay  # noqa: E402
from services import school_inbox_service  # noqa: E402

SUPPORT = {'id': 'support-id', 'email': 'TannerBowman@gmail.com', 'role': 'superadmin'}
FAMILY = {'id': 'parent-id', 'display_name': 'Pat Parent'}
MESSAGE = {'id': 'msg-1', 'conversation_id': 'conv-1', 'message_content': 'Hi there'}


def _run(owner, *, staff=('tannerbowman@gmail.com',)):
    repo = MagicMock()
    repo.get_caller.return_value = owner
    repo.get_person.return_value = FAMILY
    send = MagicMock(return_value={'sent': True, 'reply_address': 'reply+x@d', 'to': 'x'})
    with patch.object(relay, '_repo', return_value=repo), \
         patch.object(relay.Config, 'PLATFORM_STAFF_EMAILS', staff), \
         patch.object(school_inbox_service, 'member_org',
                      return_value={'name': 'Optio Academy'}), \
         patch.object(relay, 'email_message_to_owner', send):
        sent = relay.email_support_message(MESSAGE, 'parent-id', owner and owner['id'])
    return sent, send


def test_message_to_support_account_is_mailed_with_a_reply_relay_to_the_sender():
    sent, send = _run(SUPPORT)
    assert sent is True
    kwargs = send.call_args.kwargs
    assert kwargs['owner'] is SUPPORT
    # The reply must reach the family, never loop back to the support account.
    assert kwargs['other_party'] is FAMILY
    assert kwargs['author'] is FAMILY
    assert kwargs['org_name'] == 'Optio Academy'


def test_another_superadmin_is_not_mailed():
    sent, send = _run({**SUPPORT, 'email': 'tyler@zionforge.com'})
    assert sent is False
    send.assert_not_called()


def test_a_non_superadmin_with_the_address_is_not_mailed():
    sent, send = _run({**SUPPORT, 'role': 'parent'})
    assert sent is False
    send.assert_not_called()


def test_a_mail_failure_never_raises():
    repo = MagicMock()
    repo.get_caller.side_effect = RuntimeError('db down')
    with patch.object(relay, '_repo', return_value=repo):
        assert relay.email_support_message(MESSAGE, 'parent-id', 'support-id') is False


def test_notify_recipient_mails_a_direct_message():
    from services.direct_message_service import DirectMessageService
    svc = DirectMessageService.__new__(DirectMessageService)
    svc._get_user_info = MagicMock(return_value=FAMILY)
    svc._get_client = MagicMock()
    with patch.object(school_inbox_service, 'org_for_inbox_user', return_value=None), \
         patch.object(relay, 'email_support_message') as mail, \
         patch('services.direct_message_service.NotificationService'):
        svc._notify_recipient('parent-id', 'support-id', 'Hi there',
                              conversation_id='conv-1', message_row=MESSAGE)
    mail.assert_called_once_with(MESSAGE, 'parent-id', 'support-id')
