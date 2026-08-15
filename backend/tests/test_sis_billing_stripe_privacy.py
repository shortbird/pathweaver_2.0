"""
What a minor's identity looks like by the time it reaches Stripe.

Two rules:

1. A student is named by FIRST NAME ONLY on anything sent to Stripe. Checkout
   line items used to carry the full display name, which put a child's full
   identity into a payment processor's records tied to a card, a household, and
   an amount. A fully opaque id would leak nothing but would make the invoice
   unreadable — this string is what a parent paying for three kids at once sees
   on the Checkout page — so first name is the deliberate middle.

2. A dependent account never becomes a Stripe customer. Guardians are
   legitimately Stripe customers; children are not, and a Stripe Customer record
   is durable and holds an email plus a saved card.
"""

from unittest.mock import MagicMock, patch

import pytest

from services import sis_billing_service as billing

ORG = 'org-uuid'
HOUSEHOLD = 'hh-uuid'
GUARDIAN = 'guardian-uuid'
STUDENT = 'student-uuid'

INVOICE = {
    'id': 'inv-uuid',
    'organization_id': ORG,
    'household_id': HOUSEHOLD,
    'student_user_id': STUDENT,
    'invoice_number': 'INV-1042',
    'total_cents': 50000,
    'amount_paid_cents': 0,
    'status': 'open',
    'stripe_session_ids': [],
}


@pytest.mark.unit
class TestStudentPaymentReference:
    def test_uses_first_name_only(self):
        assert billing._student_payment_reference({
            'first_name': 'Ada', 'last_name': 'Byron', 'display_name': 'Ada Byron',
        }) == 'Ada'

    def test_falls_back_to_the_first_word_of_a_display_name(self):
        assert billing._student_payment_reference({'display_name': 'Ada Byron'}) == 'Ada'

    def test_never_returns_an_email_or_username(self):
        # _display_name falls back to email/username; this must not, because a
        # school email is usually firstname.lastname@.
        ref = billing._student_payment_reference({
            'username': 'ada.byron', 'email': 'ada.byron@school.org',
        })
        assert ref == 'Student'

    def test_surname_never_appears(self):
        for user in (
            {'first_name': 'Ada', 'last_name': 'Byron'},
            {'display_name': 'Ada Byron'},
            {'display_name': 'Ada Byron', 'last_name': 'Byron'},
        ):
            assert 'Byron' not in billing._student_payment_reference(user)


def _family_checkout(guardian_row, student_row=None):
    """Run create_family_checkout with the DB and Stripe stubbed.

    Returns (result, session_create_mock).
    """
    users = {GUARDIAN: {'id': GUARDIAN, **guardian_row}}
    if student_row is not None:
        users[STUDENT] = {'id': STUDENT, **student_row}

    session = MagicMock()
    session.id = 'cs_test_1'
    session.url = 'https://checkout.stripe.com/c/pay/cs_test_1'

    with patch.object(billing, '_guardian_household_rows',
                      return_value=[{'id': HOUSEHOLD, 'organization_id': ORG}]), \
         patch.object(billing, '_org_stripe_secret', return_value='sk_test_x'), \
         patch.object(billing, '_household_open_invoices', return_value=[dict(INVOICE)]), \
         patch.object(billing, 'compute_processing_fee', return_value=0), \
         patch.object(billing, '_org_branding', return_value={ORG: {'name': 'iCreate'}}), \
         patch.object(billing, '_users_map',
                      side_effect=lambda ids: {i: users[i] for i in ids if i in users}), \
         patch.object(billing, '_admin', return_value=MagicMock()), \
         patch('stripe.checkout.Session.create', return_value=session) as create:
        result = billing.create_family_checkout(GUARDIAN, HOUSEHOLD, 'https://app.example.com/billing')
    return result, create


@pytest.mark.unit
class TestFamilyCheckoutLineItems:
    def test_line_item_carries_the_first_name_only(self):
        result, create = _family_checkout(
            {'first_name': 'Grace', 'email': 'grace@example.com'},
            {'first_name': 'Ada', 'last_name': 'Byron', 'display_name': 'Ada Byron'},
        )
        assert 'checkout_url' in result
        line_items = create.call_args.kwargs['line_items']
        names = [li['price_data']['product_data']['name'] for li in line_items]
        assert names == ['iCreate tuition · Ada']
        assert 'Byron' not in ' '.join(names)

    def test_the_guardian_is_still_the_stripe_contact(self):
        # Only the MINOR's identity stops flowing — a parent paying a bill is a
        # normal Stripe customer and the receipt has to reach them.
        _, create = _family_checkout(
            {'first_name': 'Grace', 'email': 'grace@example.com'},
            {'first_name': 'Ada'},
        )
        assert create.call_args.kwargs['customer_email'] == 'grace@example.com'

    def test_falls_back_to_the_invoice_number_when_the_student_is_unknown(self):
        _, create = _family_checkout({'first_name': 'Grace', 'email': 'grace@example.com'})
        name = create.call_args.kwargs['line_items'][0]['price_data']['product_data']['name']
        assert name == 'iCreate tuition · INV-1042'


@pytest.mark.unit
class TestDependentsNeverReachStripe:
    def test_a_dependent_cannot_start_a_family_checkout(self):
        result, create = _family_checkout(
            {'first_name': 'Ada', 'email': 'ada@example.com', 'is_dependent': True},
            {'first_name': 'Ada'},
        )
        assert create.called is False
        assert 'guardian' in result['error']

    def test_a_dependent_cannot_become_a_stripe_customer_via_autopay(self):
        with patch.object(billing, '_guardian_invoice', return_value=dict(INVOICE)), \
             patch.object(billing, '_org_stripe_secret', return_value='sk_test_x'), \
             patch.object(billing, '_users_map',
                          return_value={GUARDIAN: {'id': GUARDIAN, 'email': 'ada@example.com',
                                                   'is_dependent': True}}), \
             patch('stripe.Customer.create') as customer_create:
            result = billing.create_autopay_setup_checkout(
                GUARDIAN, INVOICE['id'], 'https://app.example.com/billing')

        assert customer_create.called is False
        assert 'guardian' in result['error']

    def test_a_real_guardian_can_still_set_up_autopay(self):
        session = MagicMock()
        session.id = 'cs_test_2'
        session.url = 'https://checkout.stripe.com/c/pay/cs_test_2'
        customer = MagicMock()
        customer.id = 'cus_test_1'

        with patch.object(billing, '_guardian_invoice', return_value=dict(INVOICE)), \
             patch.object(billing, '_org_stripe_secret', return_value='sk_test_x'), \
             patch.object(billing, '_users_map',
                          return_value={GUARDIAN: {'id': GUARDIAN, 'email': 'grace@example.com'}}), \
             patch.object(billing, '_existing_stripe_customer', return_value=None), \
             patch.object(billing, '_admin', return_value=MagicMock()), \
             patch('stripe.Customer.create', return_value=customer) as customer_create, \
             patch('stripe.checkout.Session.create', return_value=session):
            result = billing.create_autopay_setup_checkout(
                GUARDIAN, INVOICE['id'], 'https://app.example.com/billing')

        assert customer_create.called is True
        assert result['checkout_url'].startswith('https://checkout.stripe.com/')
