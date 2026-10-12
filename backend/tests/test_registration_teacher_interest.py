"""
The Optio teacher follow-up email (2026-10-12).

A family that ticks "interested in an Optio teacher" on the Academy
registration hears how a teacher works, what it costs, and how to book a
call. Before this the answer reached the school's alert and the family heard
nothing.
"""

from unittest.mock import patch

import pytest

from services import registration_teacher_interest as rti

CFG = {'monthly': {'per_student_cents': 5000, 'family_cap_cents': 15000, 'add_ons': [
    {'key': 'teacher_support', 'label': 'Optio teacher support',
     'amount_cents': 50000, 'includes_program_fee': True}]}}
ORG = {'name': 'Optio Academy', 'slug': 'optio-academy'}
PARENT = {'first_name': 'Pat', 'email': 'pat@example.com'}
YES = ['Yes, I am interested in an Optio teacher for this student.']


def _reg(answer, add_ons=None):
    return {'id': 'reg-1', 'kids': [
        {'user_id': 'kid-1', 'first_name': 'Casey', 'add_ons': add_ons or []},
        {'user_id': 'kid-2', 'first_name': 'Riley', 'add_ons': []},
    ], 'answers': {'teacher_support': answer}}


def _send(reg, org=ORG):
    with patch('services.email_service.email_service.send_email', return_value=True) as send:
        ok = rti.send_if_interested(reg, CFG, org, PARENT)
    return ok, send


@pytest.mark.unit
class TestTeacherInterestEmail:
    def test_sends_with_how_it_works_the_price_and_the_booking_link(self):
        ok, send = _send(_reg({'kid-1': YES}))
        assert ok is True
        # The real template renders; only the provider call is patched.
        to_email, subject, html = send.call_args.args[:3]
        assert to_email == 'pat@example.com'
        assert subject == 'About an Optio teacher for Casey'
        assert send.call_args.kwargs['reply_to'] == 'tanner@optioeducation.com'
        assert 'Hi Pat,' in html
        assert 'weekly video call' in html.lower()
        assert 'message their teacher' in html
        assert '$500.00 per month for each student' in html
        assert 'includes the $50.00 monthly program fee' in html
        assert rti.BOOKING_URL in html
        assert 'Dr. Tanner Bowman' in html
        assert 'Riley' not in subject

    def test_names_every_interested_student(self):
        _, send = _send(_reg({'kid-1': YES, 'kid-2': YES}))
        assert send.call_args.args[1] == 'About an Optio teacher for Casey and Riley'

    def test_no_email_when_nobody_ticked_the_box(self):
        ok, send = _send(_reg({'kid-1': [], 'kid-2': []}))
        assert ok is False
        send.assert_not_called()

    def test_a_student_who_already_bought_a_teacher_is_left_out(self):
        ok, send = _send(_reg({'kid-1': YES}, add_ons=['teacher_support']))
        assert ok is False
        send.assert_not_called()

    def test_only_optio_academy(self):
        ok, send = _send(_reg({'kid-1': YES}), org={'name': 'Other', 'slug': 'other-school'})
        assert ok is False
        send.assert_not_called()

    def test_never_raises(self):
        with patch('services.email_service.email_service.send_email', side_effect=RuntimeError('boom')):
            assert rti.send_if_interested(_reg({'kid-1': YES}), CFG, ORG, PARENT) is False
