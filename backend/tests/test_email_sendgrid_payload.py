"""
The SendGrid cutover kept the service-internal message dict in its Brevo-era
shape and moved provider translation into `_send_via_sendgrid`, at the wire.
These tests pin that translation: what leaves the building must be a valid
SendGrid v3 mail/send body, whatever the internal dict looks like.

Covers CRM plan PR2 (docs/CRM_REPLACEMENT_PLAN.md): payload mapping, the
text-before-html content order SendGrid requires, attachment/mimetype
passthrough, categories/headers/custom_args, the Optional[str] return contract
(message id or None — callers test `is None`, never truthiness), and
send_crm_email's marketing envelope (tags, one-click unsubscribe, no support
copy ever).
"""

from unittest.mock import MagicMock, patch

import pytest

from app_config import Config
from services import email_service as email_service_module
from services.email_service import EmailService

# The autouse _no_outbound_email fixture (conftest.py) replaces
# _send_via_sendgrid on the class for every test — the right default, but this
# module exists to test that very method. Capture the real function at import
# time (before any fixture patches) and re-install it per test; the mocked
# `requests` below is what actually keeps mail off the wire here.
_REAL_SEND = EmailService._send_via_sendgrid


def _service():
    """EmailService with config/Jinja init skipped."""
    service = EmailService.__new__(EmailService)
    service.api_key = 'test-key'
    service.sender_email = 'support@optioeducation.com'
    service.sender_name = 'Optio Support'
    return service


def _response(status_code=202, message_id='sg-msg-id', text=''):
    response = MagicMock()
    response.status_code = status_code
    response.headers = {'X-Message-Id': message_id} if message_id is not None else {}
    response.text = text
    return response


def _send(service=None, response=None, **kwargs):
    """Run send_email with requests.post mocked; returns (result, post mock)."""
    service = service or _service()
    defaults = dict(
        to_email='parent@example.com',
        subject='Your invoice',
        html_body='<body>Hello</body>',
    )
    defaults.update(kwargs)
    with patch.object(EmailService, '_send_via_sendgrid', _REAL_SEND), \
         patch.object(EmailService, '_recipient_org', return_value=None), \
         patch.object(email_service_module, 'requests') as requests_mock:
        requests_mock.post.return_value = response or _response()
        requests_mock.RequestException = Exception
        result = service.send_email(**defaults)
    return result, requests_mock.post


@pytest.mark.unit
class TestSendGridTranslation:
    def test_core_field_mapping(self):
        result, post = _send(
            text_body='Plain hello',
            cc=['cc@example.com'],
            bcc=['bcc@example.com'],
            reply_to='replies@optioeducation.com',
        )
        assert result is True
        assert post.call_count == 1
        url = post.call_args.args[0]
        body = post.call_args.kwargs['json']
        assert url == 'https://api.sendgrid.com/v3/mail/send'
        assert post.call_args.kwargs['headers']['Authorization'] == 'Bearer test-key'
        assert body['from'] == {'email': 'support@optioeducation.com',
                                'name': 'Optio Support'}
        personalization = body['personalizations'][0]
        assert personalization['to'] == [{'email': 'parent@example.com'}]
        assert personalization['cc'] == [{'email': 'cc@example.com'}]
        assert personalization['bcc'] == [{'email': 'bcc@example.com'}]
        assert body['subject'] == 'Your invoice'
        assert body['reply_to'] == {'email': 'replies@optioeducation.com'}

    def test_text_part_precedes_html_part(self):
        # SendGrid rejects bodies where text/html comes before text/plain.
        _, post = _send(text_body='Plain hello')
        content = post.call_args.kwargs['json']['content']
        assert [c['type'] for c in content] == ['text/plain', 'text/html']
        assert content[0]['value'] == 'Plain hello'
        assert content[1]['value'] == '<body>Hello</body>'

    def test_html_only_email_sends_single_part(self):
        _, post = _send()
        content = post.call_args.kwargs['json']['content']
        assert [c['type'] for c in content] == ['text/html']

    def test_attachments_carry_filename_type_and_disposition(self):
        _, post = _send(attachments=[
            {'filename': 'invoice.pdf', 'content': b'%PDF', 'mimetype': 'application/pdf'},
            {'filename': 'blob.bin', 'content': b'\x00'},
        ])
        attachments = post.call_args.kwargs['json']['attachments']
        assert attachments[0]['filename'] == 'invoice.pdf'
        assert attachments[0]['type'] == 'application/pdf'
        assert attachments[0]['disposition'] == 'attachment'
        assert attachments[0]['content']  # base64, non-empty
        assert attachments[1]['type'] == 'application/octet-stream'

    def test_categories_default_to_transactional(self):
        _, post = _send()
        assert post.call_args.kwargs['json']['categories'] == ['transactional']

    def test_categories_headers_custom_args_pass_through(self):
        _, post = _send(
            categories=['crm', 'free_class_nurture'],
            headers={'List-Unsubscribe': '<https://example.com/u>'},
            custom_args={'send_id': 'abc'},
        )
        body = post.call_args.kwargs['json']
        assert body['categories'] == ['crm', 'free_class_nurture']
        assert body['headers'] == {'List-Unsubscribe': '<https://example.com/u>'}
        assert body['custom_args'] == {'send_id': 'abc'}


@pytest.mark.unit
class TestReturnContract:
    def test_accepted_send_returns_message_id(self):
        service = _service()
        with patch.object(email_service_module, 'requests') as requests_mock:
            requests_mock.post.return_value = _response(message_id='sg-msg-id')
            requests_mock.RequestException = Exception
            assert _REAL_SEND(service, _minimal_payload()) == 'sg-msg-id'

    def test_accepted_send_without_header_returns_empty_string_not_none(self):
        service = _service()
        with patch.object(email_service_module, 'requests') as requests_mock:
            requests_mock.post.return_value = _response(message_id=None)
            requests_mock.RequestException = Exception
            result = _REAL_SEND(service, _minimal_payload())
        assert result == ''
        assert result is not None  # '' must still count as success

    def test_http_error_returns_none_and_send_email_false(self):
        result, _ = _send(response=_response(status_code=401, text='bad key'))
        assert result is False

    def test_request_exception_returns_none(self):
        service = _service()
        with patch.object(email_service_module.requests, 'post',
                          side_effect=email_service_module.requests.RequestException('boom')):
            assert _REAL_SEND(service, _minimal_payload()) is None

    def test_missing_api_key_returns_none_without_calling_out(self):
        service = _service()
        service.api_key = None
        with patch.object(email_service_module, 'requests') as requests_mock:
            assert _REAL_SEND(service, _minimal_payload()) is None
            requests_mock.post.assert_not_called()


@pytest.mark.unit
class TestSendCrmEmail:
    def _crm_send(self, **kwargs):
        service = _service()
        defaults = dict(
            to_email='lead@example.com',
            subject='Welcome to your free class',
            html_body='<div>Hi</div>',
        )
        defaults.update(kwargs)
        with patch.object(EmailService, '_send_via_sendgrid', _REAL_SEND), \
             patch.object(email_service_module, 'requests') as requests_mock:
            requests_mock.post.return_value = _response()
            requests_mock.RequestException = Exception
            result = service.send_crm_email(**defaults)
        return result, requests_mock.post

    def test_returns_message_id_and_tags_funnel(self):
        result, post = self._crm_send(funnel_key='free_class_nurture')
        assert result == 'sg-msg-id'
        assert post.call_args.kwargs['json']['categories'] == ['crm', 'free_class_nurture']

    def test_unsubscribe_url_sets_one_click_headers(self):
        _, post = self._crm_send(unsubscribe_url='https://api.optioeducation.com/api/crm/unsubscribe?token=t')
        headers = post.call_args.kwargs['json']['headers']
        assert headers['List-Unsubscribe'] == '<https://api.optioeducation.com/api/crm/unsubscribe?token=t>'
        assert headers['List-Unsubscribe-Post'] == 'List-Unsubscribe=One-Click'

    def test_send_and_lead_ids_ride_custom_args(self):
        _, post = self._crm_send(send_id='send-1', lead_id='lead-1')
        assert post.call_args.kwargs['json']['custom_args'] == {
            'send_id': 'send-1', 'lead_id': 'lead-1'}

    def test_never_sends_a_support_copy_even_when_enabled(self):
        # Marketing mail must not land lead emails in the [COPY] inbox.
        with patch.object(Config, 'SUPPORT_COPY_EMAILS_ENABLED', True):
            _, post = self._crm_send()
        assert post.call_count == 1


def _minimal_payload():
    return {
        'sender': {'name': 'Optio Support', 'email': 'support@optioeducation.com'},
        'to': [{'email': 'parent@example.com'}],
        'subject': 'Subject',
        'htmlContent': '<body>Hello</body>',
    }
