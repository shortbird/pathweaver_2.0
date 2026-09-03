"""
The [COPY] that lands in Tanner's inbox says whether a CRM funnel sequence follows
the email it copies. Most Optio mail has nothing behind it, so the no-funnel
banner is the default and tells him to reply himself; a funnel-backed send says
which automation picked the recipient up.

Also covers the sync_lead return value that drives it: the banner must claim a
funnel only when the automation actually started for that recipient (a repeat
submission from someone already on the trigger list starts nothing, because
Brevo automations exclude existing list members).

The [COPY] mechanism itself is OFF by default since Aug 2026 (see
test_email_support_copy_gate.py), so these tests force it on: they are about
what a copy SAYS once someone has deliberately enabled it, not about whether
one gets sent.
"""

from unittest.mock import patch

import pytest

from app_config import Config
from services.email_service import EmailService


def _service():
    """EmailService with config/Jinja init skipped and Brevo sending stubbed."""
    service = EmailService.__new__(EmailService)
    service.api_key = 'test-key'
    service.sender_email = 'support@optioeducation.com'
    service.sender_name = 'Optio'
    return service


def _send(crm_funnel, text_body='Plain text body'):
    """Run send_email and return the [COPY] payload sent to the support inbox."""
    service = _service()
    sent = []
    with patch.object(Config, 'SUPPORT_COPY_EMAILS_ENABLED', True), \
         patch.object(EmailService, '_recipient_org', return_value=None), \
         patch.object(EmailService, '_send_via_sendgrid', side_effect=lambda p: sent.append(p) or 'msg-id'):
        service.send_email(
            to_email='lead@example.com',
            subject='Your free Optio class',
            html_body='<html><body><p>Hi</p></body></html>',
            text_body=text_body,
            crm_funnel=crm_funnel,
        )
    copies = [p for p in sent if p['subject'].startswith('[COPY]')]
    assert len(copies) == 1, 'expected exactly one support copy'
    return copies[0]


@pytest.mark.unit
class TestFunnelBanner:
    def test_no_funnel_copy_says_reply_yourself(self):
        copy = _send(None)
        assert 'No CRM funnel' in copy['htmlContent']
        assert 'reply to it yourself' in copy['htmlContent']
        assert 'No CRM funnel' in copy['textContent']
        assert 'reply to it yourself' in copy['textContent']

    def test_funnel_copy_names_the_automation(self):
        copy = _send('Free Class Nurture')
        assert 'CRM funnel:' in copy['htmlContent']
        assert 'Free Class Nurture' in copy['htmlContent']
        assert 'No CRM funnel' not in copy['htmlContent']
        assert 'Free Class Nurture' in copy['textContent']

    def test_banner_sits_above_the_recipient_line_inside_body(self):
        html = _send(None)['htmlContent']
        # Injected inside <body> (prepending before <!DOCTYPE>/<head> made Gmail
        # drop the stylesheet), banner first, then the existing "Copy:" line.
        assert html.index('<body>') < html.index('No CRM funnel') < html.index('<strong>Copy:</strong>')

    def test_html_only_email_still_gets_the_banner(self):
        copy = _send(None, text_body=None)
        assert 'No CRM funnel' in copy['htmlContent']
        assert 'textContent' not in copy

    def test_recipient_email_never_carries_the_banner(self):
        service = _service()
        sent = []
        with patch.object(Config, 'SUPPORT_COPY_EMAILS_ENABLED', True), \
             patch.object(EmailService, '_recipient_org', return_value=None), \
             patch.object(EmailService, '_send_via_sendgrid', side_effect=lambda p: sent.append(p) or 'msg-id'):
            service.send_email(
                to_email='lead@example.com',
                subject='Your free Optio class',
                html_body='<html><body><p>Hi</p></body></html>',
                text_body='Plain text body',
            )
        recipient = [p for p in sent if not p['subject'].startswith('[COPY]')][0]
        assert 'Brevo funnel' not in recipient['htmlContent']
        assert 'Brevo funnel' not in recipient['textContent']

    def test_funnel_name_is_html_escaped(self):
        copy = _send('<script>alert(1)</script>')
        assert '<script>' not in copy['htmlContent']


# (The sync_lead return-value contract that used to be tested here against
# brevo_service now lives in tests/test_crm_service.py against crm_service —
# same semantics: name only when an automated sequence genuinely starts.)


@pytest.mark.unit
def test_lead_confirmations_pass_the_funnel_through():
    """The contact route's sync result must reach send_email, or every lead copy
    would read as un-funneled."""
    service = _service()
    with patch.object(EmailService, 'send_templated_email', return_value=True) as templated:
        service.send_claim_free_class_confirmation('lead@example.com',
                                                   crm_funnel='Free Class Nurture')
        assert templated.call_args.kwargs['crm_funnel'] == 'Free Class Nurture'

        service.send_family_inquiry_confirmation('Lead', 'lead@example.com',
                                                 crm_funnel='Families Nurture')
        assert templated.call_args.kwargs['crm_funnel'] == 'Families Nurture'

        service.send_demo_request_confirmation('Lead', 'lead@example.com',
                                               crm_funnel='General Interest Nurture')
        assert templated.call_args.kwargs['crm_funnel'] == 'General Interest Nurture'


@pytest.mark.unit
def test_sales_confirmation_has_no_funnel_by_default():
    """B2B inquiries get no drip, so their copy must ask for a personal reply."""
    service = _service()
    with patch.object(EmailService, 'send_templated_email', return_value=True) as templated:
        service.send_sales_inquiry_confirmation('Lead', 'lead@example.com')
    assert templated.call_args.kwargs.get('crm_funnel') is None
