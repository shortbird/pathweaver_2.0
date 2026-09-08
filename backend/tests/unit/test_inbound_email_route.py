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

FORM = {
    'envelope': '{"to":["reply+abcdefghijklmnopqrstuvwxyz012345@reply.optioeducation.com"]}',
    'from': 'Tanner Bowman <tannerbowman@gmail.com>',
    'text': 'On it.',
    'dkim': '{@gmail.com : pass}',
    'attachments': '0',
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


def test_valid_delivery_is_handed_to_the_relay_service(client):
    with patch('app_config.Config.INBOUND_EMAIL_WEBHOOK_SECRET', 'right'), \
         patch('services.message_email_relay_service.handle_inbound',
               return_value=('delivered', 'msg-1')) as handle:
        resp = client.post('/api/email/inbound?key=right', data=FORM)
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'delivered'
    kwargs = handle.call_args[1]
    assert kwargs['from_header'] == FORM['from']
    assert kwargs['text'] == 'On it.'
    assert kwargs['attachment_count'] == 0


def test_rejected_mail_still_answers_200(client):
    # 200 on purpose — see the module docstring.
    with patch('app_config.Config.INBOUND_EMAIL_WEBHOOK_SECRET', 'right'), \
         patch('services.message_email_relay_service.handle_inbound',
               return_value=('ignored', 'sender is not the relay owner')):
        resp = client.post('/api/email/inbound?key=right', data=FORM)
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'ignored'


def test_handler_crash_still_answers_200(client):
    with patch('app_config.Config.INBOUND_EMAIL_WEBHOOK_SECRET', 'right'), \
         patch('services.message_email_relay_service.handle_inbound',
               side_effect=RuntimeError('boom')):
        resp = client.post('/api/email/inbound?key=right', data=FORM)
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'error'


def test_malformed_attachment_count_does_not_500(client):
    with patch('app_config.Config.INBOUND_EMAIL_WEBHOOK_SECRET', 'right'), \
         patch('services.message_email_relay_service.handle_inbound',
               return_value=('delivered', 'msg-1')) as handle:
        resp = client.post('/api/email/inbound?key=right',
                           data={**FORM, 'attachments': 'not-a-number'})
    assert resp.status_code == 200
    assert handle.call_args[1]['attachment_count'] == 0
