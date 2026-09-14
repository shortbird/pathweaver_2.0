"""
The one notification the ticket tracker sends: a mail to ADMIN_EMAIL when a
ticket is created, with the title in the subject and a link straight to the
ticket in /admin/tickets.

Tracking only, by decision (2026-09-14) -- no reporter-facing mail, no
digest. This mail predates the tracker (it was the beta feedback email) and
was kept because it is how the owner learns a ticket exists at all.
"""

from unittest.mock import patch

import pytest

from services.email_service import EmailService


@pytest.mark.unit
def test_new_ticket_email_carries_title_link_and_goes_to_admin():
    svc = EmailService()
    with patch.object(svc, 'send_email', return_value=True) as send, \
         patch('services.email_service.Config') as cfg:
        cfg.ADMIN_EMAIL = 'owner@example.com'
        cfg.FRONTEND_URL = 'https://app.example.com'
        svc.send_bug_report_admin_email({
            'report_id': 'abc-123',
            'report_type': 'feature',
            'title': 'Sort classes by day',
            'message': 'The list is alphabetical.\nDay and time would be better.',
            'current_route': '/people?tab=families',
            'reporter_email': 'office@school.org',
            'reporter_role': 'org_admin',
            'org_name': 'iCreate',
            'platform': 'web-sis',
        })

    kwargs = send.call_args.kwargs
    assert kwargs['to_email'] == 'owner@example.com'
    assert kwargs['subject'] == '[Ticket] Feature request from iCreate: Sort classes by day'
    assert 'https://app.example.com/admin/tickets/abc-123' in kwargs['html_body']
    assert 'https://app.example.com/admin/tickets/abc-123' in kwargs['text_body']
    assert 'Sort classes by day' in kwargs['html_body']


@pytest.mark.unit
def test_new_ticket_email_falls_back_to_the_message_when_untitled():
    """Mobile's shake sheet sends no title; the subject still says something."""
    svc = EmailService()
    with patch.object(svc, 'send_email', return_value=True) as send, \
         patch('services.email_service.Config') as cfg:
        cfg.ADMIN_EMAIL = 'owner@example.com'
        cfg.FRONTEND_URL = 'https://app.example.com'
        svc.send_bug_report_admin_email({
            'report_id': 'r2',
            'report_type': 'bug',
            'message': 'Complete button froze on the quest page',
            'reporter_email': 'kid@example.com',
            'platform': 'ios',
        })

    subject = send.call_args.kwargs['subject']
    assert subject.startswith('[Ticket] Bug report from kid@example.com: Complete button froze')
