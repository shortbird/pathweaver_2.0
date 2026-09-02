"""
Open-ended monthly tuition: a set amount per student charged every month until
somebody turns it off.

Covers the date arithmetic (which decides when families are charged), the
household-grouping rule (one invoice and one charge for a family with several
children), the decline policy, the signed card-setup link, and the route wiring.
Stripe and the DB are mocked; nothing here talks to either.
"""

import json
from contextlib import contextmanager
from datetime import date
from unittest.mock import Mock, patch

import pytest

from services import sis_pay_links as links
from services import sis_recurring_tuition_service as recurring


HOUSEHOLD_ID = '7bc0acee-05d6-4566-b53a-93b275185919'


def _admin_client_for_role(role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


@contextmanager
def staff(role='org_admin', org='org-1'):
    with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role(role)), \
         patch('services.sis_service.resolve_org_id', return_value=org):
        yield


# ── Terms ────────────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestValidateTerms:
    def test_accepts_an_amount_with_no_month_count(self):
        # The whole point: open-ended, so nothing asks how many months.
        assert recurring.validate_terms(50000) is None

    @pytest.mark.parametrize('amount', [0, -1, None, '500', 1.5, True])
    def test_rejects_bad_amounts(self, amount):
        assert recurring.validate_terms(amount) is not None

    @pytest.mark.parametrize('day', [0, 29, 31, -1, 'first', 1.5])
    def test_rejects_days_that_do_not_exist_every_month(self, day):
        assert recurring.validate_terms(50000, day) is not None

    @pytest.mark.parametrize('day', [1, 15, 28])
    def test_accepts_days_february_also_has(self, day):
        assert recurring.validate_terms(50000, day) is None


# ── Date arithmetic ──────────────────────────────────────────────────────────

@pytest.mark.unit
class TestSchedulingDates:
    def test_next_month_rolls_the_year(self):
        assert recurring.next_month_from(date(2026, 12, 5), 5) == date(2027, 1, 5)

    def test_next_month_from_january_reaches_february(self):
        # 28 is the cap precisely so this date exists.
        assert recurring.next_month_from(date(2026, 1, 31), 28) == date(2026, 2, 28)

    def test_next_month_clamps_a_day_past_the_cap(self):
        assert recurring.next_month_from(date(2026, 3, 1), 31) == date(2026, 4, 28)

    def test_first_charge_is_this_month_when_the_day_is_still_ahead(self):
        assert recurring.first_charge_date(date(2026, 9, 3), 15) == date(2026, 9, 15)

    def test_first_charge_rolls_to_next_month_once_the_day_has_passed(self):
        assert recurring.first_charge_date(date(2026, 9, 20), 15) == date(2026, 10, 15)

    def test_first_charge_rolls_when_set_up_on_the_billing_day(self):
        # The setup charge is taken immediately, so the NEXT one is next month —
        # billing the same day twice would charge the family twice in a day.
        assert recurring.first_charge_date(date(2026, 9, 15), 15) == date(2026, 10, 15)


@pytest.mark.unit
class TestLineDescription:
    def test_names_the_child_the_amount_is_for(self):
        assert recurring.line_description('Robin Bowman', None) == 'Robin Bowman — Monthly tuition'

    def test_keeps_a_custom_label_after_the_name(self):
        assert recurring.line_description('Uma Ford', 'Upper school') == 'Uma Ford — Upper school'


# ── One family, one invoice, one charge ──────────────────────────────────────

@pytest.mark.unit
class TestBillHousehold:
    ROWS = [
        {'id': 'r1', 'organization_id': 'org-1', 'household_id': HOUSEHOLD_ID,
         'student_user_id': 's1', 'monthly_cents': 50000, 'description': None,
         'day_of_month': 1, 'status': 'active'},
        {'id': 'r2', 'organization_id': 'org-1', 'household_id': HOUSEHOLD_ID,
         'student_user_id': 's2', 'monthly_cents': 30000, 'description': None,
         'day_of_month': 1, 'status': 'active'},
    ]

    @contextmanager
    def _billing(self, charged=True, card=True):
        hydrate = [dict(r, student_name=n, household_name='Bowman Family', card=None)
                   for r, n in zip(self.ROWS, ['Robin Bowman', 'Uma Bowman'])]
        with patch.object(recurring, '_hydrate', return_value=hydrate), \
             patch.object(recurring, '_email_invoice'), \
             patch.object(recurring.billing, 'create_tuition_invoice',
                          return_value={'invoice': {'id': 'inv-1'}}) as mk, \
             patch.object(recurring.billing, 'household_saved_card',
                          return_value={'id': 'pm1'} if card else None), \
             patch.object(recurring.billing, 'charge_invoice_off_session',
                          return_value={'status': 'charged' if charged else 'failed',
                                        'amount_cents': 80000,
                                        'error': None if charged else 'card_declined'}) as ch:
            yield mk, ch

    def test_two_children_become_one_invoice_with_two_lines(self):
        with self._billing() as (mk, _):
            recurring.bill_household('org-1', HOUSEHOLD_ID, self.ROWS, date(2026, 9, 1))
        lines = mk.call_args.kwargs['line_items']
        assert len(lines) == 2
        assert [l['amount_cents'] for l in lines] == [50000, 30000]
        assert 'Robin Bowman' in lines[0]['description']

    def test_the_family_invoice_belongs_to_no_single_student(self):
        # The children are the lines; pinning the invoice to one of them would
        # make the other child's tuition look like it was billed to their sibling.
        with self._billing() as (mk, _):
            recurring.bill_household('org-1', HOUSEHOLD_ID, self.ROWS, date(2026, 9, 1))
        assert mk.call_args.kwargs['student_user_id'] is None
        assert mk.call_args.kwargs['household_id'] == HOUSEHOLD_ID

    def test_one_charge_covers_the_whole_family(self):
        with self._billing() as (_, ch):
            result = recurring.bill_household('org-1', HOUSEHOLD_ID, self.ROWS, date(2026, 9, 1))
        assert ch.call_count == 1
        assert result['charged'] is True

    def test_a_decline_leaves_the_invoice_standing(self):
        # The family still owes that month; the invoice is the record of it.
        with self._billing(charged=False):
            result = recurring.bill_household('org-1', HOUSEHOLD_ID, self.ROWS, date(2026, 9, 1))
        assert result['charged'] is False
        assert result['reason'] == 'declined'
        assert result['invoice']['id'] == 'inv-1'

    def test_no_card_still_invoices_the_family(self):
        with self._billing(card=False):
            result = recurring.bill_household('org-1', HOUSEHOLD_ID, self.ROWS, date(2026, 9, 1))
        assert result['charged'] is False
        assert result['reason'] == 'no_card'
        assert result['invoice']['id'] == 'inv-1'


# ── The sweep ────────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestChargeDue:
    ROWS = [
        {'id': 'r1', 'organization_id': 'org-1', 'household_id': 'hh1',
         'student_user_id': 's1', 'monthly_cents': 50000, 'day_of_month': 1},
        {'id': 'r2', 'organization_id': 'org-1', 'household_id': 'hh1',
         'student_user_id': 's2', 'monthly_cents': 30000, 'day_of_month': 1},
        {'id': 'r3', 'organization_id': 'org-1', 'household_id': 'hh2',
         'student_user_id': 's3', 'monthly_cents': 40000, 'day_of_month': 1},
    ]

    @contextmanager
    def _sweep(self, results):
        admin = Mock()
        table = Mock()
        admin.table.return_value = table
        for chained in ('select', 'eq', 'lte', 'update'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[])
        with patch.object(recurring, '_admin', return_value=admin), \
             patch.object(recurring, 'fetch_all_rows', return_value=self.ROWS), \
             patch.object(recurring, 'bill_household', side_effect=results) as bill:
            yield bill, table

    def test_bills_once_per_household_not_once_per_student(self):
        with self._sweep([{'charged': True}, {'charged': True}]) as (bill, _):
            out = recurring.charge_due(today='2026-09-01')
        assert bill.call_count == 2          # two households, three students
        assert out == {'households': 2, 'charged': 2, 'failed': 0}

    def test_counts_a_declined_household_as_failed(self):
        with self._sweep([{'charged': True}, {'charged': False}]) as (_, _t):
            out = recurring.charge_due(today='2026-09-01')
        assert out['charged'] == 1 and out['failed'] == 1

    def test_one_bad_household_does_not_stop_the_others(self):
        with self._sweep([RuntimeError('stripe down'), {'charged': True}]) as (bill, _):
            out = recurring.charge_due(today='2026-09-01')
        assert bill.call_count == 2
        assert out['charged'] == 1 and out['failed'] == 1

    def test_a_decline_still_advances_the_date_so_it_is_not_retried_daily(self):
        with self._sweep([{'charged': False}, {'charged': False}]) as (_, table):
            recurring.charge_due(today='2026-09-01')
        advanced = [c.args[0] for c in table.update.call_args_list]
        assert advanced, 'the sweep must move next_charge_on even after a decline'
        assert all(p['next_charge_on'] == '2026-10-01' for p in advanced)
        # ...and must not claim money it did not take.
        assert all('last_charged_on' not in p for p in advanced)

    def test_a_successful_charge_records_the_date(self):
        with self._sweep([{'charged': True}, {'charged': True}]) as (_, table):
            recurring.charge_due(today='2026-09-01')
        patches = [c.args[0] for c in table.update.call_args_list]
        assert all(p['last_charged_on'] == '2026-09-01' for p in patches)


# ── Sending the card-setup link ──────────────────────────────────────────────

@pytest.mark.unit
class TestSendSetupLink:
    """Optio Academy, 2026-09-02: the office set up monthly tuition, sent the
    link, and had no way to tell afterwards whether the parent got anything.
    A send that happened has to leave a mark on the row."""

    ORG = 'org-1'
    SCHEDULE = {'id': 'r1', 'organization_id': ORG, 'household_id': HOUSEHOLD_ID,
                'student_user_id': 's1', 'monthly_cents': 100000,
                'day_of_month': 1, 'status': 'active', 'description': None}

    @contextmanager
    def _sending(self, guardians, sends=True):
        def _table(name):
            t = Mock()
            for chained in ('select', 'eq', 'update', 'neq', 'in_', 'order', 'limit'):
                getattr(t, chained).return_value = t
            t.execute.return_value = Mock(
                data=[{'name': 'Optio Academy'}] if name == 'organizations'
                else [dict(self.SCHEDULE)])
            tables.setdefault(name, t)
            return tables[name]

        tables = {}
        client = Mock()
        client.table.side_effect = _table
        mailer = Mock()
        mailer.return_value.send_email.return_value = sends
        with patch.object(recurring, '_admin', return_value=client), \
             patch.object(recurring, 'household_guardians', return_value=guardians), \
             patch.object(recurring, '_hydrate',
                          side_effect=lambda rows: [dict(r, student_name='Banks Hanna')
                                                    for r in rows]), \
             patch('services.email_service.EmailService', mailer):
            yield tables, mailer

    def test_records_the_send_on_the_family_s_rows(self):
        guardians = [{'user_id': 'p1', 'email': 'paige@example.com', 'name': 'Paige Hanna'}]
        with self._sending(guardians) as (tables, _):
            result = recurring.send_setup_link(self.ORG, HOUSEHOLD_ID)
        assert result['emailed'] == 1
        assert result['sent_to'] == ['Paige Hanna']
        patch_written = tables['sis_recurring_tuition'].update.call_args.args[0]
        assert patch_written['setup_link_sent_at'] == result['sent_at']

    def test_both_parents_are_emailed_and_both_named(self):
        guardians = [{'user_id': 'p1', 'email': 'paige@example.com', 'name': 'Paige Hanna'},
                     {'user_id': 'p2', 'email': 'johnny@example.com', 'name': 'Johnny Hanna'}]
        with self._sending(guardians) as (_, mailer):
            result = recurring.send_setup_link(self.ORG, HOUSEHOLD_ID)
        assert result['emailed'] == 2
        assert result['sent_to'] == ['Paige Hanna', 'Johnny Hanna']
        assert mailer.return_value.send_email.call_count == 2

    def test_a_family_with_nobody_to_email_says_what_to_do(self):
        with self._sending([]) as (tables, _):
            result = recurring.send_setup_link(self.ORG, HOUSEHOLD_ID)
        assert 'Add a parent' in result['error']
        assert 'sis_recurring_tuition' not in tables

    def test_a_failed_send_is_not_recorded_as_sent(self):
        # The stamp is the office's evidence. Stamping a send that bounced tells
        # them next week that the family was asked, and they stop chasing.
        guardians = [{'user_id': 'p1', 'email': 'paige@example.com', 'name': 'Paige Hanna'}]
        with self._sending(guardians, sends=False) as (tables, _):
            result = recurring.send_setup_link(self.ORG, HOUSEHOLD_ID)
        assert 'could not be sent' in result['error']
        tables['sis_recurring_tuition'].update.assert_not_called()


# ── Card-setup link ──────────────────────────────────────────────────────────

@pytest.mark.unit
class TestSetupTokens:
    def test_roundtrip(self):
        token = links.make_setup_token(HOUSEHOLD_ID)
        assert links.household_from_setup_token(token) == HOUSEHOLD_ID

    def test_a_pay_link_cannot_save_a_card(self):
        # Three namespaces, three powers: paying an invoice must not also hand
        # over the right to put a card on file for the family.
        assert links.household_from_setup_token(links.make_token(HOUSEHOLD_ID)) is None

    def test_a_setup_link_cannot_pay_an_invoice(self):
        assert links.invoice_id_from_token(links.make_setup_token(HOUSEHOLD_ID)) is None

    @pytest.mark.parametrize('bad', ['', 'nope', 'not-a-uuid.abc', HOUSEHOLD_ID])
    def test_malformed_tokens_rejected(self, bad):
        assert links.household_from_setup_token(bad) is None


@pytest.mark.unit
class TestSetupRoutes:
    def _token(self):
        return links.make_setup_token(HOUSEHOLD_ID)

    def test_invalid_token_redirects(self, client):
        resp = client.get('/api/sis/pay/setup/garbage')
        assert resp.status_code == 302
        assert 'autopay=invalid_link' in resp.headers['Location']

    def test_starts_checkout(self, client):
        with patch('services.sis_recurring_tuition_service.household_org_id',
                   return_value='org-1'), \
             patch('services.sis_billing_service.start_card_setup_for_household',
                   return_value={'checkout_url': 'https://stripe.test/setup'}):
            resp = client.get(f'/api/sis/pay/setup/{self._token()}')
        assert resp.headers['Location'] == 'https://stripe.test/setup'

    def test_no_guardian_is_reported_as_such(self, client):
        with patch('services.sis_recurring_tuition_service.household_org_id',
                   return_value='org-1'), \
             patch('services.sis_billing_service.start_card_setup_for_household',
                   return_value={'error': 'x', 'reason': 'no_guardian'}):
            resp = client.get(f'/api/sis/pay/setup/{self._token()}')
        assert 'autopay=no_guardian' in resp.headers['Location']

    def test_return_activates_and_reports_active(self, client):
        with patch('services.sis_recurring_tuition_service.household_org_id',
                   return_value='org-1'), \
             patch('services.sis_billing_service.save_card_from_setup_session',
                   return_value={'ready': True}), \
             patch('services.sis_recurring_tuition_service.activate_household',
                   return_value={'activated': 2, 'charged': True}):
            resp = client.get(f'/api/sis/pay/setup/{self._token()}/return?session_id=cs_1')
        assert 'autopay=active' in resp.headers['Location']

    def test_return_without_a_session_id_is_pending(self, client):
        resp = client.get(f'/api/sis/pay/setup/{self._token()}/return')
        assert 'autopay=pending' in resp.headers['Location']

    def test_saved_card_but_declined_first_charge_says_so(self, client):
        with patch('services.sis_recurring_tuition_service.household_org_id',
                   return_value='org-1'), \
             patch('services.sis_billing_service.save_card_from_setup_session',
                   return_value={'ready': True}), \
             patch('services.sis_recurring_tuition_service.activate_household',
                   return_value={'activated': 1, 'charged': False}):
            resp = client.get(f'/api/sis/pay/setup/{self._token()}/return?session_id=cs_1')
        assert 'autopay=card_saved_unpaid' in resp.headers['Location']

    def test_return_never_shows_a_parent_a_stack_trace(self, client):
        with patch('services.sis_recurring_tuition_service.household_org_id',
                   return_value='org-1'), \
             patch('services.sis_billing_service.save_card_from_setup_session',
                   side_effect=RuntimeError('boom')):
            resp = client.get(f'/api/sis/pay/setup/{self._token()}/return?session_id=cs_1')
        assert resp.status_code == 302
        assert 'autopay=pending' in resp.headers['Location']


# ── Staff routes ─────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestRecurringRoutes:
    URL = '/api/sis/tuition/recurring?organization_id=org-1'

    def test_forbidden_for_advisor(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('advisor')):
            resp = client.get(self.URL, headers=auth_headers)
        assert resp.status_code == 403

    def test_lists_schedules(self, client, auth_headers, mock_verify_token):
        with staff(), patch('services.sis_recurring_tuition_service.list_for_org',
                            return_value={'schedules': [], 'active_monthly_cents': 0}):
            resp = client.get(self.URL, headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['active_monthly_cents'] == 0

    def test_create_requires_a_student(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post(self.URL, headers=auth_headers, json={'monthly_cents': 50000})
        assert resp.status_code == 400

    def test_create_rejects_a_zero_amount(self, client, auth_headers, mock_verify_token):
        with staff(), patch('services.sis_recurring_tuition_service.create') as create:
            resp = client.post(self.URL, headers=auth_headers,
                               json={'student_id': 's1', 'monthly_cents': 0})
        assert resp.status_code == 400
        create.assert_not_called()

    def test_create_success(self, client, auth_headers, mock_verify_token):
        with staff(), patch('services.sis_recurring_tuition_service.create',
                            return_value={'schedule': {'id': 'r1'}}):
            resp = client.post(self.URL, headers=auth_headers,
                               json={'student_id': 's1', 'monthly_cents': 50000})
        assert resp.status_code == 201

    def test_status_change(self, client, auth_headers, mock_verify_token):
        with staff(), patch('services.sis_recurring_tuition_service.set_status',
                            return_value={'schedule': {'id': 'r1', 'status': 'paused'}}) as st:
            resp = client.post('/api/sis/tuition/recurring/r1/status?organization_id=org-1',
                               headers=auth_headers, json={'status': 'paused'})
        assert resp.status_code == 200
        assert st.call_args.args[2] == 'paused'

    def test_setup_link_send(self, client, auth_headers, mock_verify_token):
        with staff(), patch('services.sis_recurring_tuition_service.send_setup_link',
                            return_value={'emailed': 2, 'monthly_cents': 80000}):
            resp = client.post(
                f'/api/sis/tuition/recurring/households/{HOUSEHOLD_ID}/setup-link'
                '?organization_id=org-1', headers=auth_headers, json={})
        assert resp.status_code == 200
        assert json.loads(resp.data)['emailed'] == 2
