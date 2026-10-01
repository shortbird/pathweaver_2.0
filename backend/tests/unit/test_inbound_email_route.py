"""POST /api/email/inbound — the SendGrid Inbound Parse callback.

Two properties this endpoint must hold, both of them counter-intuitive:

  1. It is CLOSED while unconfigured. An inbound handler that accepts anything
     until someone remembers to set a secret is a mail-injection endpoint with
     a public URL.
  2. It answers 200 to mail it rejects. A 4xx makes SendGrid retry and then
     bounce back at whoever sent the message — so one spoofed delivery becomes
     a mail loop aimed at a real person's inbox.
"""

from unittest.mock import patch

# A reply to one of the old "Send to Gmail" copies. Reply-by-email was removed
# on 2026-10-01, so this is now mail for an address nothing reads.
FORM = {
    'envelope': '{"to":["reply+abcdefghijklmnopqrstuvwxyz012345@reply.optioeducation.com"]}',
    'from': 'Tanner Bowman <tannerbowman@gmail.com>',
    'text': 'On it.',
    'dkim': '{@gmail.com : pass}',
    'attachments': '0',
}

# The one address that is read: the Meet notes import address. Any 24 hex
# characters route there; whether the token is the right one is the import
# service's check, and it is patched out below.
NOTES_FORM = {
    'envelope': '{"to":["notes+0123456789abcdef01234567@reply.optioeducation.com"]}',
    'to': 'notes+0123456789abcdef01234567@reply.optioeducation.com',
    'from': 'Google Meet <gemini-notes@google.com>',
    'subject': 'Notes: "Weekly check-in"',
    'text': 'Notes from "Weekly check-in"',
    'dkim': '{@google.com : pass}',
}


def test_unconfigured_endpoint_refuses_everything(client):
    with patch('app_config.Config.INBOUND_EMAIL_WEBHOOK_SECRET', None):
        resp = client.post('/api/email/inbound?key=anything', data=FORM)
    assert resp.status_code == 403


def test_wrong_key_is_refused(client):
    with patch('app_config.Config.INBOUND_EMAIL_WEBHOOK_SECRET', 'right'):
        resp = client.post('/api/email/inbound?key=wrong', data=FORM)
    assert resp.status_code == 403


def test_missing_key_is_refused(client):
    with patch('app_config.Config.INBOUND_EMAIL_WEBHOOK_SECRET', 'right'):
        resp = client.post('/api/email/inbound', data=FORM)
    assert resp.status_code == 403


def test_the_import_address_is_handed_to_the_notes_import(client):
    with patch('app_config.Config.INBOUND_EMAIL_WEBHOOK_SECRET', 'right'), \
         patch('services.meet_notes_import_service.handle_inbound',
               return_value={'status': 'attached'}) as handle:
        resp = client.post('/api/email/inbound?key=right', data=NOTES_FORM)
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'attached'
    kwargs = handle.call_args[1]
    assert kwargs['to_header'] == NOTES_FORM['to']
    assert kwargs['envelope_to'] == NOTES_FORM['envelope']
    assert kwargs['from_header'] == NOTES_FORM['from']
    assert kwargs['dkim'] == NOTES_FORM['dkim']


def test_rejected_mail_still_answers_200(client):
    # 200 on purpose — see the module docstring.
    with patch('app_config.Config.INBOUND_EMAIL_WEBHOOK_SECRET', 'right'), \
         patch('services.meet_notes_import_service.handle_inbound',
               return_value={'status': 'ignored', 'detail': 'sender'}):
        resp = client.post('/api/email/inbound?key=right', data=NOTES_FORM)
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'ignored'


def test_handler_crash_still_answers_200(client):
    with patch('app_config.Config.INBOUND_EMAIL_WEBHOOK_SECRET', 'right'), \
         patch('services.meet_notes_import_service.handle_inbound',
               side_effect=RuntimeError('boom')):
        resp = client.post('/api/email/inbound?key=right', data=NOTES_FORM)
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'error'


def test_mail_for_any_other_address_is_ignored_with_a_200(client):
    # Includes a reply to an old "Send to Gmail" copy: nothing posts it into a
    # thread any more, and it must not bounce back at the person who wrote it.
    with patch('app_config.Config.INBOUND_EMAIL_WEBHOOK_SECRET', 'right'), \
         patch('services.meet_notes_import_service.handle_inbound') as handle, \
         patch('services.direct_message_service.DirectMessageService.send_message') as send:
        resp = client.post('/api/email/inbound?key=right', data=FORM)
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'ignored'
    handle.assert_not_called()
    send.assert_not_called()
