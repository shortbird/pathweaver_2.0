"""
Telling the office a family set their payment up at Stripe.

Optio Academy, 2026-09-03: "email me when a parent payment is set up through
stripe". Both setup flows are no-login links opened from an email, so the card
saves and the billing starts with nobody at the school watching.

What matters here and is easy to get wrong:

  - WHO the alert reaches. Optio Academy has no org_admin — it is Optio's own
    school and a superadmin runs it — so an org-admin-only recipient list sends
    the Academy's alerts to nobody at all, which is the whole feature failing
    silently on the one school that asked for it.
  - That the alert never breaks the flow that just took a family's money.
  - That a parent tapping the link twice doesn't send a second alert.

Stripe, the DB and SendGrid are mocked; nothing here talks to any of them.
"""

from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import sis_billing_alerts as alerts
from services import sis_pay_links as links


HOUSEHOLD_ID = '7bc0acee-05d6-4566-b53a-93b275185919'
ORG = 'org-1'

CARD = {'guardian_user_id': 'g1', 'card_brand': 'visa', 'card_last4': '4242'}
GUARDIAN = {'id': 'g1', 'first_name': 'Jane', 'last_name': 'Larsen',
            'email': 'jane@example.com'}
SCHEDULES = [
    {'student_user_id': 's1', 'monthly_cents': 30000, 'day_of_month': 1, 'description': None,
     'student_name': 'Robin Larsen'},
    {'student_user_id': 's2', 'monthly_cents': 20000, 'day_of_month': 1, 'description': None,
     'student_name': 'Uma Larsen'},
]


@contextmanager
def _school(admins=('office@school.test',), schedules=SCHEDULES, card=CARD):
    """The reads the alert makes, stubbed, with the send captured."""
    sent = Mock(return_value=True)
    with patch.object(alerts, '_org_name', return_value='Optio Academy'), \
         patch.object(alerts, '_household_name', return_value='Larsen Family'), \
         patch.object(alerts, '_saved_card', return_value=card), \
         patch.object(alerts, '_active_schedules', return_value=list(schedules)), \
         patch.object(alerts, '_person', return_value=GUARDIAN), \
         patch('services.sis_service.org_admin_emails', return_value=list(admins)), \
         patch('services.email_service.email_service.send_email', sent):
        yield sent


def _body(sent):
    """Everything the message says, html and plain text together."""
    kwargs = sent.call_args.kwargs
    return f"{kwargs['subject']}\n{kwargs['html_body']}\n{kwargs['text_body']}"


# ── Formatting (pure) ────────────────────────────────────────────────────────

@pytest.mark.unit
class TestFormatting:
    @pytest.mark.parametrize('day,expected', [(1, '1st'), (2, '2nd'), (3, '3rd'), (4, '4th'),
                                              (11, '11th'), (12, '12th'), (13, '13th'),
                                              (21, '21st'), (28, '28th')])
    def test_billing_day_reads_as_a_date(self, day, expected):
        assert alerts._ordinal(day) == expected

    @pytest.mark.parametrize('bad', [None, '', 'first'])
    def test_a_missing_billing_day_is_simply_left_out(self, bad):
        assert alerts._ordinal(bad) == ''

    def test_card_is_named_by_brand_and_last_four(self):
        assert alerts._card_label(CARD) == 'Visa ending 4242'

    def test_card_label_survives_a_row_with_no_brand(self):
        # Brand and expiry are best-effort lookups in the billing service; the
        # alert must not go out saying "None ending 4242".
        assert alerts._card_label({'card_last4': '4242'}) == 'Card ending 4242'
        assert alerts._card_label(None) == 'Card on file'


# ── Recipients ───────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestRecipients:
    def test_the_schools_admins_get_it(self):
        with patch('services.sis_service.org_admin_emails',
                   return_value=['molly@x.test', 'marika@x.test']):
            assert alerts.recipients(ORG) == ['molly@x.test', 'marika@x.test']

    def test_a_school_with_no_admin_falls_back_to_the_platform_admin(self):
        # This IS Optio Academy: no org_admin row exists, because the person who
        # runs it is a superadmin and superadmins belong to no org. Without the
        # fallback the school that asked for this feature is the one school that
        # would never receive it.
        from app_config import Config
        with patch('services.sis_service.org_admin_emails', return_value=[]):
            assert alerts.recipients(ORG) == [Config.ADMIN_EMAIL]

    def test_a_failed_lookup_still_notifies_somebody(self):
        from app_config import Config
        with patch('services.sis_service.org_admin_emails', side_effect=RuntimeError('db down')):
            assert alerts.recipients(ORG) == [Config.ADMIN_EMAIL]


# ── Monthly tuition: a card goes on file ─────────────────────────────────────

@pytest.mark.unit
class TestRecurringCardSaved:
    ACTIVATED = {'activated': 2, 'charged': True, 'amount_cents': 50000}

    def test_one_message_to_the_whole_admin_team(self):
        # Not one send per admin: that delivered N copies of the same alert, the
        # mistake the waitlist seat alert had to unlearn.
        with _school(admins=('a@x.test', 'b@x.test', 'c@x.test')) as sent:
            assert alerts.notify_recurring_card_saved(ORG, HOUSEHOLD_ID, self.ACTIVATED)
        assert sent.call_count == 1
        assert sent.call_args.kwargs['to_email'] == 'a@x.test'
        assert sent.call_args.kwargs['cc'] == ['b@x.test', 'c@x.test']

    def test_says_which_family_which_parent_and_which_card(self):
        with _school() as sent:
            alerts.notify_recurring_card_saved(ORG, HOUSEHOLD_ID, self.ACTIVATED)
        body = _body(sent)
        assert 'Larsen Family' in body
        assert 'Jane Larsen' in body and 'jane@example.com' in body
        assert 'Visa ending 4242' in body

    def test_reports_the_monthly_total_across_the_children(self):
        with _school() as sent:
            alerts.notify_recurring_card_saved(ORG, HOUSEHOLD_ID, self.ACTIVATED)
        body = _body(sent)
        assert '$500.00' in body                       # 300 + 200
        assert 'Robin Larsen' in body and 'Uma Larsen' in body
        assert 'charged on the 1st' in body

    def test_confirms_the_first_charge_went_through(self):
        with _school() as sent:
            alerts.notify_recurring_card_saved(ORG, HOUSEHOLD_ID, self.ACTIVATED)
        assert '$500.00 paid' in _body(sent)

    def test_a_declined_first_charge_is_flagged_for_follow_up(self):
        with _school() as sent:
            alerts.notify_recurring_card_saved(
                ORG, HOUSEHOLD_ID, {'activated': 2, 'charged': False, 'reason': 'declined'})
        assert 'Declined' in _body(sent)

    def test_a_card_saved_with_nothing_to_bill_still_sends(self):
        # The card IS on file and the family thinks they are set up. Until staff
        # add a schedule nobody bills them, and this alert is the only thing that
        # says so.
        with _school(schedules=[]) as sent:
            alerts.notify_recurring_card_saved(
                ORG, HOUSEHOLD_ID, {'error': 'No monthly tuition is set up for this family'})
        assert sent.call_count == 1
        assert 'no monthly tuition is set up' in _body(sent).lower()

    def test_never_raises_into_the_flow_that_took_the_money(self):
        with patch.object(alerts, '_org_name', side_effect=RuntimeError('db down')):
            assert alerts.notify_recurring_card_saved(ORG, HOUSEHOLD_ID, self.ACTIVATED) is False

    def test_no_recipients_is_reported_not_raised(self):
        from app_config import Config
        with _school(admins=()) as sent, patch.object(Config, 'ADMIN_EMAIL', ''):
            assert alerts.notify_recurring_card_saved(ORG, HOUSEHOLD_ID, self.ACTIVATED) is False
        sent.assert_not_called()


# ── Invoice payment plan ─────────────────────────────────────────────────────

@pytest.mark.unit
class TestAutopayPlanCreated:
    INVOICE = {'id': 'inv-1', 'household_id': HOUSEHOLD_ID, 'invoice_number': 'INV-2609-0007'}
    RESULT = {'plan': {'id': 'p1', 'installments': [{'amount_cents': 25000}] * 10},
              'first_charge': {'status': 'charged'}}

    def test_states_the_plan_and_the_invoice_it_pays(self):
        with _school() as sent:
            assert alerts.notify_autopay_plan_created(ORG, self.INVOICE, CARD, self.RESULT)
        body = _body(sent)
        assert 'INV-2609-0007' in body
        assert '10 monthly payments of $250.00' in body
        assert '$250.00 paid' in body

    def test_a_declined_first_installment_is_flagged(self):
        with _school() as sent:
            alerts.notify_autopay_plan_created(
                ORG, self.INVOICE, CARD,
                {**self.RESULT, 'first_charge': {'status': 'failed', 'error': 'card_declined'}})
        assert 'Declined' in _body(sent)

    def test_never_raises_into_the_flow_that_took_the_money(self):
        with patch.object(alerts, '_org_name', side_effect=RuntimeError('db down')):
            assert alerts.notify_autopay_plan_created(ORG, self.INVOICE, CARD, self.RESULT) is False


# ── Wiring: the alert actually fires where a card is saved ───────────────────

@pytest.mark.unit
class TestRecurringRouteFires:
    def _return_url(self):
        return f'/api/sis/pay/setup/{links.make_setup_token(HOUSEHOLD_ID)}/return?session_id=cs_1'

    @contextmanager
    def _flow(self, activation):
        with patch('services.sis_recurring_tuition_service.household_org_id', return_value=ORG), \
             patch('services.sis_billing_service.save_card_from_setup_session',
                   return_value={'ready': True}), \
             patch('services.sis_recurring_tuition_service.activate_household',
                   return_value=activation), \
             patch('services.sis_billing_alerts.notify_recurring_card_saved') as notify:
            yield notify

    def test_the_office_is_told_when_the_card_saves(self, client):
        with self._flow({'activated': 1, 'charged': True}) as notify:
            resp = client.get(self._return_url())
        assert 'autopay=active' in resp.headers['Location']
        notify.assert_called_once_with(ORG, HOUSEHOLD_ID, {'activated': 1, 'charged': True})

    def test_card_saved_with_no_schedule_still_alerts(self, client):
        # A different redirect branch: the alert must sit before the branching,
        # not inside the happy one.
        with self._flow({'error': 'No monthly tuition is set up for this family'}) as notify:
            resp = client.get(self._return_url())
        assert 'autopay=card_saved' in resp.headers['Location']
        assert notify.call_count == 1

    def test_a_failed_alert_does_not_change_what_the_parent_sees(self, client):
        with patch('services.sis_recurring_tuition_service.household_org_id', return_value=ORG), \
             patch('services.sis_billing_service.save_card_from_setup_session',
                   return_value={'ready': True}), \
             patch('services.sis_recurring_tuition_service.activate_household',
                   return_value={'activated': 1, 'charged': True}), \
             patch('services.sis_billing_alerts.notify_recurring_card_saved',
                   return_value=False):
            resp = client.get(self._return_url())
        assert 'autopay=active' in resp.headers['Location']

    def test_nothing_is_sent_when_the_card_never_saved(self, client):
        with patch('services.sis_recurring_tuition_service.household_org_id', return_value=ORG), \
             patch('services.sis_billing_service.save_card_from_setup_session',
                   return_value={'ready': False}), \
             patch('services.sis_billing_alerts.notify_recurring_card_saved') as notify:
            client.get(self._return_url())
        notify.assert_not_called()


@pytest.mark.unit
class TestAutopayConfirmFires:
    """Both autopay paths — emailed link and signed-in portal — go through
    _confirm_autopay, so that is the one place that has to notify."""

    INVOICE = {'id': 'inv-1', 'organization_id': ORG, 'household_id': HOUSEHOLD_ID,
               'total_cents': 250000, 'amount_paid_cents': 0,
               'stripe_session_ids': ['cs_1']}

    @contextmanager
    def _confirm(self, existing_plan=None):
        from services import sis_billing_service as billing
        session = {'status': 'complete', 'customer': 'cus_1',
                   'metadata': {'kind': 'autopay_setup', 'guardian_user_id': 'g1',
                                'installment_count': '10'},
                   'setup_intent': {'payment_method': 'pm_1'}}
        admin = Mock()
        table = Mock()
        admin.table.return_value = table
        for chained in ('select', 'eq', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=list(existing_plan or []))
        stripe = Mock()
        stripe.checkout.Session.retrieve.return_value = session
        stripe.PaymentMethod.retrieve.return_value = {'card': {'brand': 'visa', 'last4': '4242'}}
        with patch.dict('sys.modules', {'stripe': stripe}), \
             patch.object(billing, '_admin', return_value=admin), \
             patch.object(billing, '_org_stripe_secret', return_value='sk_test'), \
             patch.object(billing, '_upsert_saved_pm', return_value={'id': 'pm-row', **CARD}), \
             patch.object(billing, '_create_autopay_plan',
                          return_value={'plan': {'id': 'p1'}, 'first_charge': {'status': 'charged'}}), \
             patch('services.sis_billing_alerts.notify_autopay_plan_created') as notify:
            yield billing, notify

    def test_a_new_plan_notifies_the_office(self):
        with self._confirm() as (billing, notify):
            out = billing._confirm_autopay(self.INVOICE, 'g1', installment_count=10)
        assert out['ready'] is True
        assert notify.call_count == 1

    def test_tapping_the_link_twice_does_not_send_a_second_alert(self):
        with self._confirm(existing_plan=[{'id': 'p1'}]) as (billing, notify):
            out = billing._confirm_autopay(self.INVOICE, 'g1', installment_count=10)
        assert out.get('already') is True
        notify.assert_not_called()

    def test_a_plan_that_failed_to_build_notifies_nobody(self):
        with self._confirm() as (billing, notify):
            with patch.object(billing, '_create_autopay_plan',
                              return_value={'error': 'This invoice is already paid'}):
                billing._confirm_autopay(self.INVOICE, 'g1', installment_count=10)
        notify.assert_not_called()
