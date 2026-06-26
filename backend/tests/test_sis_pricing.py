"""
Unit tests for the pure SIS pricing engine (discounts, installment splitting,
date stepping, late fees). No DB.
"""

from datetime import date

from services import sis_pricing as p


class TestDiscountAmount:
    def test_percent(self):
        assert p.discount_amount(10000, {'criteria': {'percent': 10}}) == 1000

    def test_flat(self):
        assert p.discount_amount(10000, {'criteria': {'amount_cents': 2500}}) == 2500

    def test_percent_plus_flat(self):
        assert p.discount_amount(10000, {'criteria': {'percent': 10, 'amount_cents': 500}}) == 1500

    def test_capped_at_base(self):
        assert p.discount_amount(1000, {'criteria': {'amount_cents': 5000}}) == 1000

    def test_rounding(self):
        # 12345 * 10% = 1234.5 -> 1234 (round-half-to-even gives 1234)
        assert p.discount_amount(12345, {'criteria': {'percent': 10}}) == 1234


class TestRuleApplies:
    def test_sibling(self):
        rule = {'rule_type': 'sibling', 'active': True, 'criteria': {'min_students': 2, 'percent': 10}}
        assert p.applicable_discounts(10000, [rule], {'sibling_count': 2})['total_discount_cents'] == 1000
        assert p.applicable_discounts(10000, [rule], {'sibling_count': 1})['total_discount_cents'] == 0

    def test_multi_class(self):
        rule = {'rule_type': 'multi_class', 'active': True, 'criteria': {'min_classes': 3, 'amount_cents': 1000}}
        assert p.applicable_discounts(10000, [rule], {'class_count': 3})['total_discount_cents'] == 1000
        assert p.applicable_discounts(10000, [rule], {'class_count': 2})['total_discount_cents'] == 0

    def test_promo_code_match(self):
        rule = {'rule_type': 'promo', 'active': True, 'criteria': {'code': 'SUMMER', 'percent': 20}}
        assert p.applicable_discounts(10000, [rule], {'promo_code': 'summer'})['total_discount_cents'] == 2000
        assert p.applicable_discounts(10000, [rule], {'promo_code': 'winter'})['total_discount_cents'] == 0
        assert p.applicable_discounts(10000, [rule], {})['total_discount_cents'] == 0

    def test_manual_requires_explicit(self):
        rule = {'id': 'd1', 'rule_type': 'manual', 'active': True, 'criteria': {'amount_cents': 500}}
        assert p.applicable_discounts(10000, [rule], {'manual_rule_ids': ['d1']})['total_discount_cents'] == 500
        assert p.applicable_discounts(10000, [rule], {})['total_discount_cents'] == 0

    def test_inactive_skipped(self):
        rule = {'rule_type': 'sibling', 'active': False, 'criteria': {'min_students': 2, 'percent': 10}}
        assert p.applicable_discounts(10000, [rule], {'sibling_count': 3})['total_discount_cents'] == 0

    def test_stacking_capped(self):
        rules = [
            {'rule_type': 'sibling', 'active': True, 'criteria': {'min_students': 2, 'percent': 60}},
            {'rule_type': 'multi_class', 'active': True, 'criteria': {'min_classes': 2, 'percent': 60}},
        ]
        out = p.applicable_discounts(10000, rules, {'sibling_count': 2, 'class_count': 2})
        assert out['total_discount_cents'] == 10000  # 120% capped to 100%


class TestBuildQuote:
    def test_quote(self):
        rules = [{'rule_type': 'multi_class', 'active': True, 'criteria': {'min_classes': 2, 'percent': 10}}]
        q = p.build_quote([5000, 5000], rules, {})
        assert q['subtotal_cents'] == 10000
        assert q['discount_cents'] == 1000
        assert q['total_cents'] == 9000

    def test_quote_no_discount(self):
        q = p.build_quote([5000], [], {})
        assert q == {'subtotal_cents': 5000, 'discount_cents': 0, 'discount_lines': [], 'total_cents': 5000}


class TestSplitAmount:
    def test_even(self):
        assert p.split_amount(10000, 4) == [2500, 2500, 2500, 2500]

    def test_remainder_on_earliest(self):
        # 10001 / 3 -> 3334, 3334, 3333 (sums to 10001)
        out = p.split_amount(10001, 3)
        assert out == [3334, 3334, 3333]
        assert sum(out) == 10001

    def test_single(self):
        assert p.split_amount(999, 1) == [999]

    def test_zero_count(self):
        assert p.split_amount(100, 0) == []


class TestAddMonths:
    def test_simple(self):
        assert p.add_months(date(2026, 1, 15), 1) == date(2026, 2, 15)

    def test_year_rollover(self):
        assert p.add_months(date(2026, 11, 10), 3) == date(2027, 2, 10)

    def test_day_clamp_to_feb(self):
        assert p.add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)

    def test_leap_year_feb(self):
        assert p.add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)


class TestBuildSchedule:
    def test_monthly(self):
        sched = p.build_schedule(30000, 'monthly', 3, '2026-09-01')
        assert [s['amount_cents'] for s in sched] == [10000, 10000, 10000]
        assert [s['due_date'] for s in sched] == ['2026-09-01', '2026-10-01', '2026-11-01']

    def test_full_collapses(self):
        sched = p.build_schedule(30000, 'full', 5, '2026-09-01')
        assert len(sched) == 1
        assert sched[0]['amount_cents'] == 30000

    def test_semester_step(self):
        sched = p.build_schedule(20000, 'semester', 2, '2026-09-01')
        assert [s['due_date'] for s in sched] == ['2026-09-01', '2027-02-01']


class TestOverdue:
    def test_overdue_unpaid_past_due(self):
        assert p.is_overdue('2026-01-01', 'scheduled', on_date=date(2026, 2, 1)) is True

    def test_not_overdue_if_paid(self):
        assert p.is_overdue('2026-01-01', 'paid', on_date=date(2026, 2, 1)) is False

    def test_not_overdue_before_due(self):
        assert p.is_overdue('2026-03-01', 'scheduled', on_date=date(2026, 2, 1)) is False
