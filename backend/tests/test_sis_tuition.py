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
        assert items[0] == {'class_id': 'c1', 'description': 'Piano',
                            'amount_cents': 10000, 'kind': 'tuition'}
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

    def test_supply_fee_becomes_its_own_line(self):
        classes = [{'class_id': 'c1', 'name': 'Piano', 'price_cents': 10000,
                    'supply_fee_cents': 4500}]
        items = tuition.seed_line_items(classes, None, {}, None)
        assert [i['kind'] for i in items] == ['tuition', 'supply']
        supply = items[1]
        assert supply['amount_cents'] == 4500
        assert supply['class_id'] == 'c1'
        # The class name is on the supply line too — UFA reads the same invoice
        # and has to tell one $45 supply charge from another.
        assert supply['description'] == 'Piano — supplies'
        assert sum(i['amount_cents'] for i in items) == 14500

    def test_classes_without_a_supply_fee_add_no_line(self):
        classes = [{'class_id': 'c1', 'name': 'Piano', 'price_cents': 10000},
                   {'class_id': 'c2', 'name': 'Art', 'price_cents': 5000,
                    'supply_fee_cents': 0}]
        items = tuition.seed_line_items(classes, None, {}, None)
        assert len(items) == 2
        assert all(i['kind'] == 'tuition' for i in items)

    def test_flat_plan_still_bills_supplies(self):
        """A flat plan covers tuition, not materials — the parent Schedule
        Builder has always quoted them on top."""
        classes = [{'class_id': 'c1', 'name': 'Piano', 'price_cents': 10000,
                    'supply_fee_cents': 20000}]
        block = {'ufa': {'year_cents': 475000, 'min_blocks': 5}}
        items = tuition.seed_line_items(classes, 'ufa_academy', block, 'iCreate Academy')
        assert [i['kind'] for i in items] == ['tuition', 'supply']
        assert sum(i['amount_cents'] for i in items) == 495000


@pytest.mark.unit
class TestSupplyFeeCents:
    """org_classes.supply_fee is numeric DOLLARS and PostgREST returns it as a
    string; every invoice column is cents."""

    @pytest.mark.parametrize('raw, expected', [
        ('45.00', 4500), (45, 4500), (12.5, 1250), ('0.00', 0),
        (None, 0), ('', 0), ('not a number', 0), (-5, 0),
    ])
    def test_conversion(self, raw, expected):
        assert tuition.supply_fee_cents(raw) == expected


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
