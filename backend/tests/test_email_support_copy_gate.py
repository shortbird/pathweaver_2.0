"""
The [COPY] monitoring duplicate of every transactional email is off unless
someone deliberately turns it on, and never carries student records.

Why: this platform mails tuition invoices, credit awards, and portfolio PDFs
full of children's evidence text and photos. Copying all of it to one personal
inbox by default made that mailbox a standing archive of minors' education
records — a disclosure surface far larger than the debugging convenience it was
built for.

Rules under test:
  1. Default is OFF (Config.SUPPORT_COPY_EMAILS_ENABLED false) — no copy, even
     when a caller passes support_copy=True.
  2. Turned on, the pre-existing behaviour returns for ordinary mail.
  3. Turned on, a message with an attachment is still never copied.
  4. Turned on, a message flagged contains_student_records is never copied.
"""

from unittest.mock import patch

import pytest

from app_config import Config
from services.email_service import EmailService


def _service():
    """EmailService without the Jinja/template init the constructor does."""
    service = EmailService.__new__(EmailService)
    service.api_key = 'test-key'
    service.sender_email = 'support@optioeducation.com'
    service.sender_name = 'Optio Support'
    return service


def _send(enabled, **kwargs):
    """Send one email with the copy switch forced to `enabled`.

    Returns the list of payloads handed to Brevo — the real message is always
    payloads[0]; a monitoring copy, if any, is payloads[1].
    """
    service = _service()
    payloads = []

    def capture(payload):
        payloads.append(payload)
        return 'msg-id'

    body = kwargs.pop('html_body', '<body>Hello</body>')
    with patch.object(Config, 'SUPPORT_COPY_EMAILS_ENABLED', enabled), \
         patch.object(EmailService, '_send_via_sendgrid', side_effect=capture), \
         patch.object(EmailService, '_recipient_org', return_value=None):
        sent = service.send_email(
            to_email='parent@example.com',
            subject='Your invoice',
            html_body=body,
            **kwargs,
        )
    assert sent is True
    return payloads


def _copies(payloads):
    return [p for p in payloads if p['to'][0]['email'] == Config.SUPPORT_COPY_EMAIL]


@pytest.mark.unit
class TestSupportCopyDefaultsOff:
    def test_no_copy_by_default(self):
        payloads = _send(False)
        assert len(payloads) == 1
        assert not _copies(payloads)

    def test_caller_cannot_force_a_copy_while_the_switch_is_off(self):
        # support_copy=True is a request, not an override: the setting wins.
        payloads = _send(False, support_copy=True)
        assert not _copies(payloads)

    def test_the_real_email_still_goes_out(self):
        payloads = _send(False)
        assert payloads[0]['to'] == [{'email': 'parent@example.com'}]
        assert payloads[0]['subject'] == 'Your invoice'


@pytest.mark.unit
class TestSupportCopyWhenEnabled:
    def test_ordinary_mail_is_copied(self):
        payloads = _send(True)
        copies = _copies(payloads)
        assert len(copies) == 1
        assert copies[0]['subject'] == '[COPY] Your invoice'

    def test_attachments_are_never_copied(self):
        # The credit-award PDF is a child's evidence portfolio. An attachment on
        # Optio mail is always a record of some kind, so the attachment itself
        # is the signal — no caller has to remember to flag it.
        payloads = _send(True, attachments=[{
            'filename': 'Ada - Physics - Credit Portfolio.pdf',
            'content': b'%PDF-1.4 fake',
            'mimetype': 'application/pdf',
        }])
        assert len(payloads) == 1
        assert not _copies(payloads)
        assert 'attachment' in payloads[0]  # the family still gets the PDF

    def test_attachments_are_not_copied_even_when_forced(self):
        payloads = _send(True, support_copy=True, attachments=[{
            'filename': 'portfolio.pdf', 'content': b'%PDF', 'mimetype': 'application/pdf',
        }])
        assert not _copies(payloads)

    def test_flagged_student_records_are_never_copied(self):
        # Same protection for records quoted inline, with no attachment.
        payloads = _send(True, contains_student_records=True)
        assert not _copies(payloads)

    def test_flagged_student_records_are_not_copied_even_when_forced(self):
        payloads = _send(True, support_copy=True, contains_student_records=True)
        assert not _copies(payloads)
