"""
One household billing view (sis_billing_service.household_billing_summary,
M7 2026-09-17): how a family pays and whether they are current, naming both
monthly mechanisms -- recurring tuition invoiced by the school and a monthly
plan that is a Stripe subscription -- because a family can be on either and
the office could not tell which from any one page (audit A1, G2).
"""

from unittest.mock import patch

import pytest

from services import sis_billing_service as billing

INVOICES = [
    {'id': 'i1', 'status': 'sent', 'total_cents': 50000, 'amount_paid_cents': 20000,
     'processing_fee_cents': 0, 'due_date': '2020-01-01'},                    # overdue, 300 owed
    {'id': 'i2', 'status': 'sent', 'total_cents': 10000, 'amount_paid_cents': 0,
     'processing_fee_cents': 0, 'due_date': '2099-01-01'},                    # open, not yet due
    {'id': 'i3', 'status': 'paid', 'total_cents': 7000, 'amount_paid_cents': 7000,
     'processing_fee_cents': 0, 'due_date': None},
    {'id': 'i4', 'status': 'void', 'total_cents': 9000, 'amount_paid_cents': 0,
     'processing_fee_cents': 0, 'due_date': '2020-01-01'},
]
SCHEDULES = [
    {'id': 's1', 'household_id': 'hh-1', 'status': 'active', 'monthly_cents': 100000, 'student_name': 'Banks Hanna'},
    {'id': 's2', 'household_id': 'hh-1', 'status': 'paused', 'monthly_cents': 100000, 'student_name': 'Rae Hanna'},
    {'id': 's3', 'household_id': 'hh-2', 'status': 'active', 'monthly_cents': 5000, 'student_name': 'Other Kid'},
]


def _summary(reg=None, saved=None, funding='ufa'):
    with patch.object(billing, 'household_billing',
                      return_value={'invoices': INVOICES, 'upcoming_installments': [{'id': 'inst-1'}], 'sbs_pay_url': None}), \
         patch('services.sis_recurring_tuition_service.list_for_org',
               return_value={'schedules': SCHEDULES, 'active_monthly_cents': 105000}), \
         patch('services.sis_service.household_registration', return_value=reg), \
         patch.object(billing, 'household_saved_card', return_value=saved), \
         patch.object(billing, '_household_funding_source', return_value=funding):
        return billing.household_billing_summary('org-1', 'hh-1')


@pytest.mark.unit
class TestHouseholdBillingSummary:
    def test_balances_count_only_open_invoices(self):
        out = _summary()
        assert out['outstanding_cents'] == 40000
        assert out['overdue_cents'] == 30000
        assert out['open_invoice_count'] == 2
        assert out['overdue_invoice_count'] == 1
        assert out['current'] is False
        assert out['invoices'] == INVOICES               # the base read rides along
        assert out['upcoming_installments'] == [{'id': 'inst-1'}]

    def test_recurring_tuition_is_this_household_only_and_sums_the_active(self):
        out = _summary()
        assert [s['id'] for s in out['recurring_tuition']['schedules']] == ['s1', 's2']
        assert out['recurring_tuition']['active_monthly_cents'] == 100000

    def test_the_stripe_subscription_is_named_separately(self):
        out = _summary(reg={'id': 'reg-1', 'stripe_subscription_id': 'sub_1', 'monthly_cents': 15000})
        assert out['subscription'] == {'stripe_subscription_id': 'sub_1', 'monthly_cents': 15000,
                                       'registration_id': 'reg-1'}
        assert _summary(reg={'id': 'reg-2', 'stripe_subscription_id': None})['subscription'] is None

    def test_the_card_on_file_shows_display_fields_only(self):
        saved = {'card_brand': 'visa', 'card_last4': '4242', 'card_exp_month': 4, 'card_exp_year': 2030,
                 'stripe_payment_method_id': 'pm_secret', 'stripe_customer_id': 'cus_secret'}
        out = _summary(saved=saved)
        assert out['card'] == {'brand': 'visa', 'last4': '4242', 'exp_month': 4, 'exp_year': 2030}
        assert out['funding_source'] == 'ufa'
        assert _summary()['card'] is None
