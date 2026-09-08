"""Reply-by-email: address parsing, quote stripping, and the inbound gate.

The gate is the part worth testing hardest. A relay address is a standing write
capability into a superadmin's message threads, and it travels in plain text
through Gmail — quoted into replies, visible to anyone the mail is forwarded to.
The token being unguessable is therefore not enough on its own; the sender check
is what keeps a leaked address from being usable.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from services import message_email_relay_service as relay  # noqa: E402


# ─────────────────────────── address parsing ───────────────────────────

def test_token_comes_from_envelope_or_to_header():
    token = 'abcdefghijklmnopqrstuvwxyz012345'
    assert relay.extract_relay_token(
        '{"to":["reply+%s@reply.optioeducation.com"],"from":"t@x.com"}' % token
    ) == token
    assert relay.extract_relay_token(None, f'Optio <reply+{token}@reply.optioeducation.com>') == token


def test_token_is_none_for_ordinary_mail():
    assert relay.extract_relay_token('{"to":["support@optioeducation.com"]}') is None
    assert relay.extract_relay_token(None, None) is None


def test_short_local_parts_are_not_treated_as_tokens():
    # A real token is 32 url-safe bytes. Accepting a short one would make the
    # address space small enough to walk.
    assert relay.extract_relay_token('reply+abc@reply.optioeducation.com') is None


@pytest.mark.parametrize('header,expected', [
    ('Tanner Bowman <tannerbowman@gmail.com>', 'tannerbowman@gmail.com'),
    ('tannerbowman@gmail.com', 'tannerbowman@gmail.com'),
    ('  TANNERBOWMAN@GMAIL.COM ', 'tannerbowman@gmail.com'),
    ('', None),
    (None, None),
])
def test_sender_email_parsing(header, expected):
    assert relay.extract_sender_email(header) == expected


# ─────────────────────────── quote stripping ───────────────────────────

def test_gmail_quoted_thread_is_dropped():
    body = (
        "Sounds good, I'll take a look today.\n"
        "\n"
        "On Mon, Sep 8, 2026 at 9:14 AM Optio Support <support@optioeducation.com> wrote:\n"
        "> Hi, I'm confused about the credit situation\n"
    )
    assert relay.strip_quoted_reply(body) == "Sounds good, I'll take a look today."


def test_outlook_and_signature_blocks_are_dropped():
    assert relay.strip_quoted_reply(
        "Done.\n\n-----Original Message-----\nFrom: someone"
    ) == 'Done.'
    assert relay.strip_quoted_reply("Done.\n\n-- \nTanner\nOptio") == 'Done.'
    assert relay.strip_quoted_reply("Done.\n\nSent from my iPhone") == 'Done.'


def test_empty_reply_stays_empty():
    assert relay.strip_quoted_reply('') == ''
    assert relay.strip_quoted_reply(
        'On Mon, Sep 8, 2026 at 9:14 AM X wrote:\n> hello'
    ) == ''


# ──────────────────────────── the inbound gate ────────────────────────────

RELAY_ROW = {
    'id': 'relay-1',
    'token': 'abcdefghijklmnopqrstuvwxyz012345',
    'owner_id': 'superadmin-id',
    'owner_email': 'tannerbowman@gmail.com',
    'recipient_id': 'member-id',
    'reply_count': 0,
    'expires_at': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
    'revoked': False,
}

TO = '{"to":["reply+abcdefghijklmnopqrstuvwxyz012345@reply.optioeducation.com"]}'


def _inbound(**overrides):
    """handle_inbound with a live relay and a stubbed message service."""
    kwargs = {
        'to_header': None,
        'envelope_to': TO,
        'from_header': 'Tanner Bowman <tannerbowman@gmail.com>',
        'text': 'On it.',
        'dkim': '{@gmail.com : pass}',
    }
    kwargs.update(overrides)
    service = MagicMock()
    service.return_value.send_message.return_value = {
        'id': 'msg-1', 'conversation_id': 'conv-1'
    }
    with patch.object(relay, 'find_relay', return_value=RELAY_ROW), \
         patch.object(relay, '_admin', return_value=MagicMock()), \
         patch('services.direct_message_service.DirectMessageService', service):
        status, detail = relay.handle_inbound(**kwargs)
    return status, detail, service


def test_reply_from_the_relay_owner_is_delivered():
    status, _, service = _inbound()
    assert status == 'delivered'
    service.return_value.send_message.assert_called_once_with(
        'superadmin-id', 'member-id', 'On it.'
    )


def test_reply_from_another_address_is_refused():
    # The whole point of the sender check: the token leaked (forwarded email,
    # quoted header) but the address it was minted for did not.
    status, detail, service = _inbound(from_header='someone-else@example.com')
    assert status == 'ignored'
    assert 'owner' in detail
    service.return_value.send_message.assert_not_called()


def test_reply_failing_dkim_is_refused():
    status, _, service = _inbound(dkim='{@gmail.com : fail}')
    assert status == 'ignored'
    service.return_value.send_message.assert_not_called()


def test_mail_with_no_relay_address_is_ignored():
    status, _, service = _inbound(envelope_to='{"to":["hello@optioeducation.com"]}')
    assert status == 'ignored'
    service.return_value.send_message.assert_not_called()


def test_reply_that_is_only_quoted_text_is_not_posted():
    status, _, service = _inbound(
        text='On Mon, Sep 8, 2026 at 9:14 AM X wrote:\n> hello'
    )
    assert status == 'empty'
    service.return_value.send_message.assert_not_called()


def test_attachments_are_announced_not_dropped_silently():
    status, _, service = _inbound(attachment_count=2)
    assert status == 'delivered'
    body = service.return_value.send_message.call_args[0][2]
    assert 'On it.' in body
    assert '2 attachment(s)' in body


def test_expired_or_revoked_relay_refuses():
    service = MagicMock()
    with patch.object(relay, 'find_relay', return_value=None), \
         patch('services.direct_message_service.DirectMessageService', service):
        status, _ = relay.handle_inbound(
            to_header=None, envelope_to=TO,
            from_header='tannerbowman@gmail.com', text='hi',
        )
    assert status == 'ignored'
    service.return_value.send_message.assert_not_called()


# ────────────────────────────── configuration ──────────────────────────────

def test_replies_need_both_domain_and_secret():
    with patch.object(relay.Config, 'INBOUND_EMAIL_DOMAIN', 'reply.optioeducation.com'), \
         patch.object(relay.Config, 'INBOUND_EMAIL_WEBHOOK_SECRET', None):
        # A domain with no webhook secret means the endpoint rejects every
        # delivery, so advertising a Reply-To would promise a bounce.
        assert relay.replies_enabled() is False
    with patch.object(relay.Config, 'INBOUND_EMAIL_DOMAIN', ''), \
         patch.object(relay.Config, 'INBOUND_EMAIL_WEBHOOK_SECRET', 'x'):
        assert relay.replies_enabled() is False
    with patch.object(relay.Config, 'INBOUND_EMAIL_DOMAIN', 'reply.optioeducation.com'), \
         patch.object(relay.Config, 'INBOUND_EMAIL_WEBHOOK_SECRET', 'x'):
        assert relay.replies_enabled() is True


def test_find_relay_rejects_expired_and_revoked_rows():
    stale = dict(RELAY_ROW,
                 expires_at=(datetime.now(timezone.utc) - timedelta(days=1)).isoformat())
    for row in (stale, dict(RELAY_ROW, revoked=True)):
        client = MagicMock()
        client.table.return_value.select.return_value.eq.return_value \
            .limit.return_value.execute.return_value.data = [row]
        with patch.object(relay, '_admin', return_value=client):
            assert relay.find_relay(row['token']) is None
