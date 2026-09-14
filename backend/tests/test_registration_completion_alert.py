"""
The school hears when a family finishes registering (2026-09-14).

The parent's completion email existed; a staff one did not, and with support
copies off since August the school learned about a new family only by
noticing a new row on the People page. For Optio Academy that school is one
superadmin with no org admins, so the recipient rule matters as much as the
content: org admins if there are any, Config.ADMIN_EMAIL if not.
"""

from unittest.mock import patch

import pytest

from services import registration_alerts

TEACHER = {'key': 'teacher_support', 'label': 'Optio teacher support',
           'amount_cents': 50000, 'includes_program_fee': True}
CFG = {
    'monthly': {'per_student_cents': 5000, 'family_cap_cents': 15000, 'add_ons': [TEACHER]},
    'questions': [{'key': 'grade_level', 'label': 'Grade Level', 'per_student': True},
                  {'key': 'how_heard', 'label': 'How did you hear about us?'}],
}
REG = {
    'id': 'reg-1', 'organization_id': 'org-academy', 'fee_cents': 0, 'monthly_cents': 55000,
    'kids': [
        {'user_id': 'kid-1', 'first_name': 'Casey', 'name': 'Casey Sample', 'dob': '2018-03-14',
         'add_ons': ['teacher_support']},
        {'user_id': 'kid-2', 'first_name': 'Riley', 'name': 'Riley Sample', 'dob': '2020-06-01', 'add_ons': []},
    ],
    'answers': {'grade_level': {'kid-1': '2nd', 'kid-2': 'Kindergarten'}, 'how_heard': 'A friend'},
}
ORG = {'name': 'Optio Academy'}
PARENT = {'first_name': 'Pat', 'last_name': 'Sample', 'email': 'pat@example.com', 'phone_number': '(555) 555-0100'}


def _send(reg=REG, extra=None, admins=None):
    with patch('services.sis_billing_alerts.recipients', return_value=admins if admins is not None
               else ['tanner@optioeducation.com']), \
         patch('services.email_service.email_service.send_email', return_value=True) as send:
        ok = registration_alerts.notify_registration_completed(reg, CFG, ORG, PARENT, extra)
    return ok, send


@pytest.mark.unit
class TestRegistrationCompletionAlert:
    def test_goes_to_the_school_with_the_family_and_the_money(self):
        ok, send = _send(extra={'stripe_subscription_id': 'sub_123', 'fee_paid_at': '2026-09-14T10:00:00'})
        assert ok is True
        kwargs = send.call_args.kwargs
        assert kwargs['to_email'] == 'tanner@optioeducation.com'
        assert kwargs['cc'] == []
        assert kwargs['subject'] == 'Optio Academy: Pat Sample registered 2 students'
        text = kwargs['text_body']
        assert 'Pat Sample (pat@example.com, (555) 555-0100)' in text
        assert 'Casey Sample (DOB 2018-03-14) -- Optio teacher support' in text
        assert 'Riley Sample (DOB 2020-06-01)' in text
        assert 'Monthly $550.00/month: Program fee (Riley) $50.00; Optio teacher support (Casey) $500.00' in text
        assert 'Stripe subscription sub_123' in text
        assert 'Grade Level: Casey: 2nd; Riley: Kindergarten' in text
        assert 'How did you hear about us?: A friend' in text
        assert 'https://sis.optioeducation.com/people' in text
        # Staff notice, never copied to support.
        assert kwargs['support_copy'] is False
        # HTML carries the same facts and escapes them.
        assert 'Optio teacher support' in kwargs['html_body']

    def test_first_admin_to_and_the_rest_cc(self):
        _, send = _send(admins=['a@school.org', 'b@school.org'])
        assert send.call_args.kwargs['to_email'] == 'a@school.org'
        assert send.call_args.kwargs['cc'] == ['b@school.org']

    def test_nobody_to_notify_sends_nothing(self):
        ok, send = _send(admins=[])
        assert ok is False
        assert not send.called

    def test_no_subscription_says_so(self):
        _, send = _send()
        assert 'No subscription on file' in send.call_args.kwargs['text_body']

    def test_one_time_fee_only(self):
        reg = {**REG, 'fee_cents': 2500, 'monthly_cents': 0,
               'kids': [{**REG['kids'][1]}], 'answers': {}}
        _, send = _send(reg=reg, extra={'fee_paid_at': 'now'})
        text = send.call_args.kwargs['text_body']
        assert 'registered 1 student' in send.call_args.kwargs['subject']
        assert 'Registration fee $25.00 (paid by card)' in text
        assert 'Monthly' not in text

    def test_never_raises(self):
        with patch('services.sis_billing_alerts.recipients', side_effect=RuntimeError('db down')):
            assert registration_alerts.notify_registration_completed(REG, CFG, ORG, PARENT) is False

    def test_escapes_html_in_names(self):
        parent = {**PARENT, 'first_name': '<b>Pat</b>'}
        with patch('services.sis_billing_alerts.recipients', return_value=['x@y.z']), \
             patch('services.email_service.email_service.send_email', return_value=True) as send:
            registration_alerts.notify_registration_completed(REG, CFG, ORG, parent)
        assert '&lt;b&gt;Pat&lt;/b&gt;' in send.call_args.kwargs['html_body']
        assert '<b>Pat</b>' not in send.call_args.kwargs['html_body']
