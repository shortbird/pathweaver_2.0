"""
Unit tests for the SIS tuition-approver service.

Pure line-item seeding (per-class vs flat UFA plan) and the create_tuition_invoice
validation branches, which reject bad input before ever touching the database.
"""

import pytest

from services import sis_tuition_service as tuition
from services import sis_billing_service as billing


@pytest.mark.unit
class TestSeedLineItems:
    def test_per_class_seed_sums_prices(self):
        classes = [{'class_id': 'c1', 'name': 'Piano', 'price_cents': 10000},
                   {'class_id': 'c2', 'name': 'Art', 'price_cents': 5000}]
        items = tuition.seed_line_items(classes, None, {}, None)
        assert len(items) == 2
        assert items[0] == {'class_id': 'c1', 'description': 'Piano', 'amount_cents': 10000}
        assert sum(i['amount_cents'] for i in items) == 15000

    def test_missing_price_defaults_to_zero(self):
        classes = [{'class_id': 'c1', 'name': 'Piano', 'price_cents': None}]
        items = tuition.seed_line_items(classes, None, {}, None)
        assert items[0]['amount_cents'] == 0

    def test_flat_ufa_plan_bills_single_annual_line(self):
        classes = [{'class_id': 'c1', 'name': 'Piano', 'price_cents': 10000}]
        block = {'ufa': {'year_cents': 475000, 'min_blocks': 5}}
        items = tuition.seed_line_items(classes, 'ufa_academy', block, 'iCreate Academy')
        assert len(items) == 1
        assert items[0]['class_id'] is None
        assert items[0]['amount_cents'] == 475000
        assert 'iCreate Academy' in items[0]['description']

    def test_flat_plan_without_block_pricing_falls_back_to_per_class(self):
        classes = [{'class_id': 'c1', 'name': 'Piano', 'price_cents': 10000}]
        items = tuition.seed_line_items(classes, 'ufa_academy', {}, None)
        assert len(items) == 1
        assert items[0]['class_id'] == 'c1'
        assert items[0]['amount_cents'] == 10000

    def test_no_classes_no_lines(self):
        assert tuition.seed_line_items([], None, {}, None) == []


@pytest.mark.unit
class TestCreateTuitionInvoiceValidation:
    """These all return before any DB call, so no app context / mock is needed."""

    def test_empty_line_items_rejected(self):
        assert billing.create_tuition_invoice('org1', 's1', 'h1', [])['error']

    def test_missing_description_rejected(self):
        assert billing.create_tuition_invoice('org1', 's1', 'h1',
                                              [{'amount_cents': 100}])['error']

    def test_non_integer_amount_rejected(self):
        assert billing.create_tuition_invoice('org1', 's1', 'h1',
                                              [{'description': 'X', 'amount_cents': 1.5}])['error']

    def test_negative_amount_rejected(self):
        assert billing.create_tuition_invoice('org1', 's1', 'h1',
                                              [{'description': 'X', 'amount_cents': -1}])['error']

    def test_bad_status_rejected(self):
        assert billing.create_tuition_invoice(
            'org1', 's1', 'h1', [{'description': 'X', 'amount_cents': 100}],
            status='void')['error']
