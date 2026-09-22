"""
The school hears when a family SUBMITS the family step, not only when they
finish (2026-09-22).

The completion alert had been live since 2026-09-14 and was still missing most
of what the office wanted to know, because most families do not complete. On
the day this was written three of Optio Academy's seven most recent
registrations sat unfinished -- two of them parked at the payment step with
every field filled in, one from that same morning -- and no email had gone out
for any of them.

Two things are load-bearing here and both are tested below:
  - the alert fires once, on the first submission only, because the same
    endpoint is the back-edit for every later step;
  - it never fails the registration, which has already created real user rows
    by the time it runs.
"""

from unittest.mock import patch

import pytest

from services import registration_alerts

CFG = {
    'monthly': {'per_student_cents': 5000, 'family_cap_cents': 15000,
                'add_ons': [{'key': 'teacher_support', 'label': 'Optio teacher support',
                             'amount_cents': 50000, 'includes_program_fee': True}]},
    'questions': [{'key': 'grade_level', 'label': 'Grade Level', 'per_student': True}],
}
REG = {
    'id': 'reg-1', 'organization_id': 'org-academy', 'fee_cents': 2500, 'monthly_cents': 10000,
    'kids': [
        {'user_id': 'kid-1', 'first_name': 'Casey', 'name': 'Casey Sample', 'dob': '2018-03-14'},
        {'user_id': 'kid-2', 'first_name': 'Riley', 'name': 'Riley Sample', 'dob': '2020-06-01'},
    ],
}
ORG = {'name': 'Optio Academy'}
PARENT = {'first_name': 'Pat', 'last_name': 'Sample', 'email': 'pat@example.com'}
CONTACT = {
    'phone': '(555) 555-0100',
    'address': {'address_line1': '12 Oak St', 'address_line2': 'Apt 4',
                'city': 'Provo', 'state': 'UT', 'postal_code': '84604'},
}


def _send(reg=REG, contact=CONTACT, parent=PARENT, admins=None):
    with patch('services.sis_billing_alerts.recipients', return_value=admins if admins is not None
               else ['tanner@optioeducation.com']), \
         patch('services.email_service.email_service.send_email', return_value=True) as send:
        ok = registration_alerts.notify_registration_started(reg, CFG, ORG, parent, contact)
    return ok, send


@pytest.mark.unit
class TestRegistrationStartedAlert:
    def test_carries_the_family_the_school_would_call_back(self):
        ok, send = _send()
        assert ok is True
        kwargs = send.call_args.kwargs
        assert kwargs['to_email'] == 'tanner@optioeducation.com'
        assert kwargs['subject'] == 'Optio Academy: Pat Sample started registering 2 students'
        text = kwargs['text_body']
        assert 'Pat Sample (pat@example.com, (555) 555-0100)' in text
        assert '12 Oak St, Apt 4' in text
        assert 'Provo, UT 84604' in text
        assert 'Casey Sample (DOB 2018-03-14)' in text
        assert 'Riley Sample (DOB 2020-06-01)' in text
        assert 'https://sis.optioeducation.com/people' in text
        # Staff notice, never copied to support.
        assert kwargs['support_copy'] is False

    def test_says_it_is_unfinished(self):
        """The whole reason this email exists is the families who stop here, so
        it must not read like a completed enrolment."""
        _, send = _send()
        text = send.call_args.kwargs['text_body']
        assert 'Not finished yet' in text
        assert 'A second email follows if and when they do.' in text
        assert 'finished registering' not in text

    def test_money_is_expected_not_taken(self):
        _, send = _send()
        text = send.call_args.kwargs['text_body']
        assert 'Registration fee $25.00 expected' in text
        assert 'Monthly $100.00/month expected, before add-ons' in text
        # Nothing has been charged at this step, so no payment language may claim it was.
        assert 'paid by card' not in text
        assert 'Stripe' not in text

    def test_free_school_says_nothing_is_owed(self):
        _, send = _send(reg={**REG, 'fee_cents': 0, 'monthly_cents': 0})
        text = send.call_args.kwargs['text_body']
        assert 'No registration fee owed' in text
        assert 'Monthly' not in text

    def test_one_student_is_singular(self):
        _, send = _send(reg={**REG, 'kids': [REG['kids'][0]]})
        assert send.call_args.kwargs['subject'].endswith('started registering 1 student')

    def test_partial_address_skips_the_blanks(self):
        contact = {'phone': '5555550100',
                   'address': {'address_line1': '12 Oak St', 'address_line2': '',
                               'city': 'Provo', 'state': 'UT', 'postal_code': ''}}
        _, send = _send(contact=contact)
        text = send.call_args.kwargs['text_body']
        assert '12 Oak St\n' in text
        assert 'Provo, UT' in text
        assert ', ,' not in text

    def test_first_admin_to_and_the_rest_cc(self):
        _, send = _send(admins=['a@school.org', 'b@school.org'])
        assert send.call_args.kwargs['to_email'] == 'a@school.org'
        assert send.call_args.kwargs['cc'] == ['b@school.org']

    def test_nobody_to_notify_sends_nothing(self):
        ok, send = _send(admins=[])
        assert ok is False
        assert not send.called

    def test_never_raises(self):
        """The parent's children already exist as user rows by the time this
        runs. It may never turn a created family into a 500."""
        with patch('services.sis_billing_alerts.recipients', side_effect=RuntimeError('db down')):
            assert registration_alerts.notify_registration_started(REG, CFG, ORG, PARENT, CONTACT) is False

    def test_escapes_html_in_names_without_leaking_entities_into_the_text(self):
        parent = {**PARENT, 'first_name': '<b>Pat</b>'}
        _, send = _send(parent=parent)
        assert '&lt;b&gt;Pat&lt;/b&gt;' in send.call_args.kwargs['html_body']
        assert '<b>Pat</b>' not in send.call_args.kwargs['html_body']
        # The plain-text body is not HTML and must not carry entities.
        assert '<b>Pat</b>' in send.call_args.kwargs['text_body']
        assert '&lt;' not in send.call_args.kwargs['text_body']


@pytest.mark.unit
class TestSchoolNameResolution:
    """The family-step caller has no org row to hand, so the alert looks the
    name up itself."""

    def test_uses_the_org_row_when_given_one(self):
        _, send = _send()
        assert send.call_args.kwargs['subject'].startswith('Optio Academy:')

    def test_looks_it_up_when_not(self):
        with patch('services.sis_billing_alerts.recipients', return_value=['x@y.z']), \
             patch('services.email_service.email_service.send_email', return_value=True) as send, \
             patch('repositories.organization_repository.OrganizationRepository') as repo:
            repo.return_value.names_for.return_value = {'org-academy': 'Optio Academy'}
            registration_alerts.notify_registration_started(REG, CFG, None, PARENT, CONTACT)
        assert send.call_args.kwargs['subject'].startswith('Optio Academy:')

    def test_a_failed_lookup_still_sends(self):
        with patch('services.sis_billing_alerts.recipients', return_value=['x@y.z']), \
             patch('services.email_service.email_service.send_email', return_value=True) as send, \
             patch('repositories.organization_repository.OrganizationRepository',
                   side_effect=RuntimeError('db down')):
            ok = registration_alerts.notify_registration_started(REG, CFG, None, PARENT, CONTACT)
        assert ok is True
        assert send.call_args.kwargs['subject'].startswith('Your school:')
