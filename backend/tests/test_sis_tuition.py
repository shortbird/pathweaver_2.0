"""
Unit tests for the SIS tuition-approver service.

Pure line-item seeding (per-class vs flat UFA plan) and the create_tuition_invoice
validation branches, which reject bad input before ever touching the database.
"""

from unittest.mock import Mock, patch

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
class TestClassLabel:
    """iCreate, 2026-08-26: "If classes could always show the initials of which
    day, that would be helpful on billing and tuition pages." The same class
    name repeats across sections -- three Reading Tutorings, two Ukelele Jams --
    so a bare name on a bill does not say which one is being charged for."""

    def test_the_days_are_appended_to_the_name(self):
        label = tuition.class_label({
            'name': 'Ukelele Jam',
            'meetings': [{'day_of_week': 2}, {'day_of_week': 4}],
        })
        assert label == 'Ukelele Jam (T/Th)'

    def test_days_come_out_in_week_order_not_row_order(self):
        label = tuition.class_label({
            'name': 'Piano',
            'meetings': [{'day_of_week': 5}, {'day_of_week': 1}],
        })
        assert label == 'Piano (M/F)'

    def test_a_repeated_day_is_listed_once(self):
        label = tuition.class_label({
            'name': 'Art',
            'meetings': [{'day_of_week': 3}, {'day_of_week': 3}],
        })
        assert label == 'Art (W)'

    def test_a_class_with_no_meetings_keeps_its_bare_name(self):
        assert tuition.class_label({'name': 'Independent Study'}) == 'Independent Study'
        assert tuition.class_label({'name': 'Solo', 'meetings': []}) == 'Solo'

    def test_a_name_that_already_says_the_day_is_left_alone(self):
        """iCreate names its sections "Ukelele Jam (Thurs Block 3)"; adding
        "(Th)" on top of that reads as a mistake."""
        label = tuition.class_label({
            'name': 'Reading (Th Block 1)',
            'meetings': [{'day_of_week': 4}],
        })
        assert label == 'Reading (Th Block 1)'

    def test_an_unnamed_class_still_gets_a_description(self):
        assert tuition.class_label({'meetings': [{'day_of_week': 1}]}) == 'Class (M)'


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


@pytest.mark.unit
class TestQueueShowsEveryone:
    """iCreate: "Can I have everyone show up on the tuition page whether or not
    they have completed their CLP, please?" (87d32ab1). The CLP was a gate, so a
    family mid-plan was not on the page at all and an empty queue was
    indistinguishable from a hidden one. It rides along as a flag now."""

    def test_a_student_without_a_finished_clp_is_listed_and_flagged(self):
        from services import sis_tuition_service as svc
        with patch.object(svc, '_enrolled_student_ids', return_value=['s1', 's2']), \
             patch.object(svc, '_invoiced_student_ids', return_value=set()), \
             patch('services.sis_clp_service.finished_student_ids', return_value={'s1'}), \
             patch.object(svc, '_sis_settings', return_value={}), \
             patch.object(svc, '_org_private_school_name', return_value=None), \
             patch.object(svc.catalog, 'list_classes', return_value=[]), \
             patch.object(svc, '_admin') as admin, \
             patch.object(svc.sis_service, '_household_by_user', return_value={}), \
             patch.object(svc.payment_profile, 'profiles_for_org', return_value={}):
            table = Mock()
            admin.return_value.table.return_value = table
            for chained in ('select', 'eq', 'in_', 'neq', 'order', 'range'):
                getattr(table, chained).return_value = table
            table.execute.return_value = Mock(data=[])
            result = svc.tuition_queue('org-1')

        by_id = {s['student_id']: s for s in result['students']}
        assert set(by_id) == {'s1', 's2'}
        assert by_id['s1']['clp_finished'] is True
        assert by_id['s2']['clp_finished'] is False

    def test_an_invoiced_student_still_drops_out(self):
        from services import sis_tuition_service as svc
        with patch.object(svc, '_enrolled_student_ids', return_value=['s1', 's2']), \
             patch.object(svc, '_invoiced_student_ids', return_value={'s1'}), \
             patch.object(svc, '_sis_settings', return_value={}), \
             patch('services.sis_clp_service.finished_student_ids', return_value=set()), \
             patch.object(svc, '_org_private_school_name', return_value=None), \
             patch.object(svc.catalog, 'list_classes', return_value=[]), \
             patch.object(svc, '_admin') as admin, \
             patch.object(svc.sis_service, '_household_by_user', return_value={}), \
             patch.object(svc.payment_profile, 'profiles_for_org', return_value={}):
            table = Mock()
            admin.return_value.table.return_value = table
            for chained in ('select', 'eq', 'in_', 'neq', 'order', 'range'):
                getattr(table, chained).return_value = table
            table.execute.return_value = Mock(data=[])
            result = svc.tuition_queue('org-1')
        assert [s['student_id'] for s in result['students']] == ['s2']

    def test_the_dashboard_tile_counts_what_the_page_lists(self):
        """A tile that disagrees with the page it links to is worse than none."""
        from services import sis_tuition_service as svc
        with patch.object(svc, '_enrolled_student_ids', return_value=['s1', 's2', 's3']), \
             patch.object(svc, '_invoiced_student_ids', return_value={'s3'}):
            assert svc.pending_count('org-1') == 2
