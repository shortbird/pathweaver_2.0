"""
The [COPY] that lands in Tanner's inbox says whether a Brevo automation follows
the email it copies. Most Optio mail has nothing behind it, so the no-funnel
banner is the default and tells him to reply himself; a funnel-backed send says
which automation picked the recipient up.

Also covers the sync_lead return value that drives it: the banner must claim a
funnel only when the automation actually started for that recipient (a repeat
submission from someone already on the trigger list starts nothing, because
Brevo automations exclude existing list members).
"""

from unittest.mock import MagicMock, patch

import pytest

from services import brevo_service
from services.email_service import EmailService


def _service():
    """EmailService with config/Jinja init skipped and Brevo sending stubbed."""
    service = EmailService.__new__(EmailService)
    service.api_key = 'test-key'
    service.sender_email = 'support@optioeducation.com'
    service.sender_name = 'Optio'
    return service


def _send(brevo_funnel, text_body='Plain text body'):
    """Run send_email and return the [COPY] payload sent to the support inbox."""
    service = _service()
    sent = []
    with patch.object(EmailService, '_recipient_org', return_value=None), \
         patch.object(EmailService, '_send_via_brevo', side_effect=lambda p: sent.append(p) or True):
        service.send_email(
            to_email='lead@example.com',
            subject='Your free Optio class',
            html_body='<html><body><p>Hi</p></body></html>',
            text_body=text_body,
            brevo_funnel=brevo_funnel,
        )
    copies = [p for p in sent if p['subject'].startswith('[COPY]')]
    assert len(copies) == 1, 'expected exactly one support copy'
    return copies[0]


@pytest.mark.unit
class TestFunnelBanner:
    def test_no_funnel_copy_says_reply_yourself(self):
        copy = _send(None)
        assert 'No Brevo funnel' in copy['htmlContent']
        assert 'reply to it yourself' in copy['htmlContent']
        assert 'No Brevo funnel' in copy['textContent']
        assert 'reply to it yourself' in copy['textContent']

    def test_funnel_copy_names_the_automation(self):
        copy = _send('Free Class Nurture')
        assert 'Brevo funnel:' in copy['htmlContent']
        assert 'Free Class Nurture' in copy['htmlContent']
        assert 'No Brevo funnel' not in copy['htmlContent']
        assert 'Free Class Nurture' in copy['textContent']

    def test_banner_sits_above_the_recipient_line_inside_body(self):
        html = _send(None)['htmlContent']
        # Injected inside <body> (prepending before <!DOCTYPE>/<head> made Gmail
        # drop the stylesheet), banner first, then the existing "Copy:" line.
        assert html.index('<body>') < html.index('No Brevo funnel') < html.index('<strong>Copy:</strong>')

    def test_html_only_email_still_gets_the_banner(self):
        copy = _send(None, text_body=None)
        assert 'No Brevo funnel' in copy['htmlContent']
        assert 'textContent' not in copy

    def test_recipient_email_never_carries_the_banner(self):
        service = _service()
        sent = []
        with patch.object(EmailService, '_recipient_org', return_value=None), \
             patch.object(EmailService, '_send_via_brevo', side_effect=lambda p: sent.append(p) or True):
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


@pytest.mark.unit
class TestSyncLeadFunnelReturn:
    def _sync(self, contact_type, existing_lists, upsert_ok=True):
        with patch.object(brevo_service.Config, 'BREVO_API_KEY', 'test-key'), \
             patch.object(brevo_service, '_existing_lead_lists', return_value=existing_lists), \
             patch.object(brevo_service, '_upsert_contact', return_value=upsert_ok):
            return brevo_service.sync_lead('lead@example.com', contact_type, name='Lead Name')

    def test_new_lead_returns_its_automation(self):
        assert self._sync('claim_free_class', []) == 'Free Class Nurture'
        assert self._sync('families', []) == 'Families Nurture'
        assert self._sync('demo', []) == 'General Interest Nurture'

    def test_b2b_types_have_no_automation(self):
        # B2B #6 is a CRM pipeline plus a personal reply, by design.
        assert self._sync('sales', []) is None
        assert self._sync('academy', []) is None

    def test_repeat_submission_starts_nothing(self):
        # Already on the trigger list -> the automation excludes them.
        assert self._sync('claim_free_class', [brevo_service.LIST_FREE_CLASS_LEADS]) is None

    def test_other_lead_list_wins_and_skips_sync(self):
        assert self._sync('claim_free_class', [brevo_service.LIST_B2B]) is None

    def test_failed_upsert_claims_no_funnel(self):
        assert self._sync('claim_free_class', [], upsert_ok=False) is None

    def test_unknown_type_and_disabled_key_claim_no_funnel(self):
        assert self._sync('philosophy', []) is None
        with patch.object(brevo_service.Config, 'BREVO_API_KEY', None):
            assert brevo_service.sync_lead('lead@example.com', 'claim_free_class') is None

    def test_poe_parents_list_has_no_automation(self):
        assert brevo_service.automation_for_list(brevo_service.LIST_POE_PARENTS) is None


@pytest.mark.unit
def test_lead_confirmations_pass_the_funnel_through():
    """The contact route's sync result must reach send_email, or every lead copy
    would read as un-funneled."""
    service = _service()
    with patch.object(EmailService, 'send_templated_email', return_value=True) as templated:
        service.send_claim_free_class_confirmation('lead@example.com',
                                                   brevo_funnel='Free Class Nurture')
        assert templated.call_args.kwargs['brevo_funnel'] == 'Free Class Nurture'

        service.send_family_inquiry_confirmation('Lead', 'lead@example.com',
                                                 brevo_funnel='Families Nurture')
        assert templated.call_args.kwargs['brevo_funnel'] == 'Families Nurture'

        service.send_demo_request_confirmation('Lead', 'lead@example.com',
                                               brevo_funnel='General Interest Nurture')
        assert templated.call_args.kwargs['brevo_funnel'] == 'General Interest Nurture'


@pytest.mark.unit
def test_sales_confirmation_has_no_funnel_by_default():
    """B2B inquiries get no drip, so their copy must ask for a personal reply."""
    service = _service()
    with patch.object(EmailService, 'send_templated_email', return_value=True) as templated:
        service.send_sales_inquiry_confirmation('Lead', 'lead@example.com')
    assert templated.call_args.kwargs.get('brevo_funnel') is None
