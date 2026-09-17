"""
One quote for the registration funnel's money (M5, 2026-09-17).

registration_pricing.quote() is the only place the fee (flat, per student,
lesser) and the monthly plan are turned into lines. The funnel route used to
keep its own fee engine (_compute_fee_cents) and the browser mirrored the
monthly arithmetic in monthlyPricing.js; these pin the rules those carried,
now in one place, and the three endpoints that serve them.
"""

import sys
import types
from unittest.mock import patch

import pytest
from flask import Flask

from services import registration_pricing as pricing

TEACHER = {'key': 'teacher_support', 'label': 'Optio teacher support', 'description': '',
           'amount_cents': 50000, 'includes_program_fee': True}
ACADEMY = {'fee_mode': 'flat', 'registration_fee_cents': 0,
           'monthly': {'per_student_cents': 5000, 'family_cap_cents': 15000, 'add_ons': [TEACHER]}}
ICREATE = {'fee_mode': 'lesser', 'registration_fee_cents': 12500, 'per_student_fee_cents': 5000}
KIDS = [{'user_id': 'k1', 'first_name': 'Casey', 'add_ons': []},
        {'user_id': 'k2', 'first_name': 'Riley', 'add_ons': ['teacher_support']}]


@pytest.mark.unit
class TestRegistrationFee:
    """The rules routes.registration_funnel._compute_fee_cents carried."""

    def test_flat_ignores_the_count(self):
        cfg = {'fee_mode': 'flat', 'registration_fee_cents': 12500, 'per_student_fee_cents': 5000}
        assert pricing.registration_fee_cents(cfg, 1) == 12500
        assert pricing.registration_fee_cents(cfg, 4) == 12500

    def test_per_student_multiplies(self):
        cfg = {'fee_mode': 'per_student', 'per_student_fee_cents': 5000}
        assert pricing.registration_fee_cents(cfg, 3) == 15000
        assert pricing.registration_fee_cents(cfg, 0) == 0

    def test_lesser_is_the_cheaper_of_the_two(self):
        assert pricing.registration_fee_cents(ICREATE, 1) == 5000
        assert pricing.registration_fee_cents(ICREATE, 2) == 10000
        assert pricing.registration_fee_cents(ICREATE, 3) == 12500

    def test_lesser_ignores_an_unset_side(self):
        assert pricing.registration_fee_cents({'fee_mode': 'lesser', 'registration_fee_cents': 9000}, 5) == 9000
        assert pricing.registration_fee_cents({'fee_mode': 'lesser'}, 5) == 0

    def test_unset_mode_is_flat_and_garbage_is_zero(self):
        assert pricing.registration_fee_cents({'registration_fee_cents': 100}, 2) == 100
        assert pricing.registration_fee_cents({'registration_fee_cents': 'lots'}, 2) == 0
        assert pricing.registration_fee_cents(None, 2) == 0


@pytest.mark.unit
class TestQuote:
    def test_one_time_fee_only(self):
        q = pricing.quote(ICREATE, [{'user_id': 'k1'}, {'user_id': 'k2'}])
        assert q['cadence'] == 'once'
        assert q['fee'] == {'amount_cents': 10000, 'deferred': False, 'waived': False}
        assert q['monthly'] == {'total_cents': 0, 'plan': None}
        assert [l['key'] for l in q['lines']] == ['registration_fee']
        assert q['lines'][0]['cadence'] == 'once'
        assert q['due_today_cents'] == 10000

    def test_monthly_plan_lines_carry_their_cadence(self):
        q = pricing.quote(ACADEMY, KIDS)
        assert q['cadence'] == 'monthly'
        assert [(l['key'], l['amount_cents'], l['cadence']) for l in q['lines']] == [
            ('program_fee', 5000, 'month'), ('teacher_support', 50000, 'month')]
        assert q['lines'][0]['students'] == ['Casey']
        assert q['monthly']['total_cents'] == 55000
        assert q['monthly']['plan']['per_student_cents'] == 5000
        assert q['due_today_cents'] == 55000

    def test_both_a_fee_and_a_plan(self):
        cfg = {**ACADEMY, 'registration_fee_cents': 2500}
        q = pricing.quote(cfg, KIDS)
        assert q['cadence'] == 'monthly'
        assert [l['key'] for l in q['lines']] == ['program_fee', 'teacher_support', 'registration_fee']
        assert q['due_today_cents'] == 57500

    def test_num_students_prices_before_the_kids_are_saved(self):
        q = pricing.quote(ICREATE, [], num_students=3)
        assert q['fee']['amount_cents'] == 12500
        q = pricing.quote(ACADEMY, [], num_students=3)
        assert q['monthly']['total_cents'] == 0  # no kids means no monthly lines yet

    def test_the_stored_fee_wins_over_the_config(self):
        q = pricing.quote(ICREATE, [{'user_id': 'k1'}], fee_cents=0)
        assert q['fee']['amount_cents'] == 0
        assert q['cadence'] == 'none'
        assert q['lines'] == []

    def test_a_deferred_fee_is_not_due_today(self):
        q = pricing.quote(ICREATE, [{'user_id': 'k1'}], fee_deferred=True)
        assert q['fee'] == {'amount_cents': 5000, 'deferred': True, 'waived': False}
        assert q['due_today_cents'] == 0

    def test_a_waived_fee_is_zero(self):
        q = pricing.quote(ICREATE, [{'user_id': 'k1'}], fee_waived=True)
        assert q['fee'] == {'amount_cents': 0, 'deferred': False, 'waived': True}
        assert q['cadence'] == 'none'


# -- routes -------------------------------------------------------------------

REG = {'id': 'reg-1', 'organization_id': 'org-1', 'parent_user_id': 'parent-1', 'access_token': 'tok',
       'status': 'fee', 'fee_cents': 0, 'fee_deferred': False, 'monthly_cents': 5000,
       'kids': [{'user_id': 'k1', 'first_name': 'Casey', 'add_ons': []}], 'stripe_session_ids': []}


@pytest.fixture
def client():
    from routes import registration_funnel
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(registration_funnel.bp)
    return app.test_client()


@pytest.mark.unit
class TestQuoteRoutes:
    def _reg_quote(self, client, body, cfg=ACADEMY, reg=REG):
        stripe_mod = types.ModuleType('stripe')
        with patch.dict(sys.modules, {'stripe': stripe_mod}), \
             patch('routes.registration_payments._admin', return_value=object()), \
             patch('routes.registration_payments._load_registration', return_value=dict(reg)), \
             patch('routes.registration_payments._org_config', return_value=cfg):
            return client.post('/api/registration/registrations/reg-1/quote', json={'access_token': 'tok', **body})

    def test_registration_quote_applies_an_unsaved_selection(self, client):
        res = self._reg_quote(client, {'add_ons': {'k1': ['teacher_support']}})
        assert res.status_code == 200
        q = res.get_json()['quote']
        assert [l['key'] for l in q['lines']] == ['teacher_support']
        assert q['due_today_cents'] == 50000

    def test_registration_quote_rejects_a_bad_token(self, client):
        res = self._reg_quote(client, {'access_token': 'nope'})
        assert res.status_code == 403

    def test_registration_quote_can_price_a_student_count(self, client):
        res = self._reg_quote(client, {'num_students': 3}, cfg=ICREATE,
                              reg={**REG, 'fee_cents': 5000, 'kids': []})
        assert res.get_json()['quote']['fee']['amount_cents'] == 12500

    def test_public_quote_by_invitation_code(self, client):
        data = {'organization': {'id': 'org-1', 'name': 'iCreate'}, 'config': ICREATE}
        with patch('routes.registration_payments._load_registration_invite', return_value=(data, None)):
            res = client.post('/api/registration/quote', json={'code': 'abc', 'num_students': 2})
        assert res.status_code == 200
        assert res.get_json()['quote']['fee']['amount_cents'] == 10000

    def test_public_quote_prices_sample_kids(self, client):
        data = {'organization': {'id': 'org-1', 'name': 'Optio Academy'}, 'config': ACADEMY}
        with patch('routes.registration_payments._load_registration_invite', return_value=(data, None)):
            res = client.post('/api/registration/quote', json={
                'code': 'abc', 'kids': [{'id': 'a', 'first_name': 'Sam', 'add_ons': ['teacher_support', 'bogus']},
                                        {'_key': 'b', 'name': 'Jo Sample', 'add_ons': []}]})
        q = res.get_json()['quote']
        assert [(l['key'], l['students']) for l in q['lines']] == [
            ('program_fee', ['Jo']), ('teacher_support', ['Sam'])]

    def test_quote_preview_prices_an_unsaved_config(self, client, auth_headers, mock_verify_token):
        """The setup tab's fee preview: an admin sends the draft config and
        gets the lines a new registrant would see, without saving it."""
        from unittest.mock import Mock
        table = Mock()
        for chained in ('select', 'eq', 'limit', 'single', 'in_'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[{'id': 'test-user-123', 'role': 'org_managed',
                                                 'org_role': 'org_admin', 'org_roles': ['org_admin']}])
        db = Mock()
        db.table.return_value = table
        with patch('database.get_supabase_admin_client', return_value=db), \
             patch('routes.registration_payments.sis_service.org_or_error', return_value=('org-1', None)):
            res = client.post('/api/registration/quote-preview', headers=auth_headers,
                              json={'config': {**ICREATE, 'registration_fee_cents': 30000}, 'num_students': 2})
        assert res.status_code == 200, res.get_json()
        assert res.get_json()['quote']['fee']['amount_cents'] == 10000

    def test_quote_preview_needs_a_config(self, client, auth_headers, mock_verify_token):
        from unittest.mock import Mock
        table = Mock()
        for chained in ('select', 'eq', 'limit', 'single', 'in_'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[{'id': 'test-user-123', 'role': 'org_managed',
                                                 'org_role': 'org_admin', 'org_roles': ['org_admin']}])
        db = Mock()
        db.table.return_value = table
        with patch('database.get_supabase_admin_client', return_value=db), \
             patch('routes.registration_payments.sis_service.org_or_error', return_value=('org-1', None)):
            res = client.post('/api/registration/quote-preview', headers=auth_headers, json={'num_students': 2})
        assert res.status_code == 400
