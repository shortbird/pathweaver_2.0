"""
One tuition quote (sis_tuition_service.schedule_quote), M5 2026-09-17.

These are the cases web/src/pages/scheduleBuilderPage.test.jsx pinned while
the browser did the arithmetic (block tiers, the UFA flat plan, billing_blocks,
the 4th-day charge, the payment plan). The builder now draws the server's
quote and the invoice records its lines, so the rules live here.
"""

import pytest

from services import sis_tuition_service as tuition

BLOCKS = [
    {'start': '09:30', 'end': '10:30'}, {'start': '10:30', 'end': '11:30'}, {'start': '11:30', 'end': '12:30'},
    {'start': '12:30', 'end': '13:00', 'label': 'Lunch'}, {'start': '13:00', 'end': '14:00'}, {'start': '14:00', 'end': '15:00'},
]
PRICING = {
    'tiers': [{'blocks': 5, 'year_cents': 150000}, {'blocks': 10, 'year_cents': 280000}],
    'installments': 10,
    'convenience_fee_pct': 6,
    'ufa': {'year_cents': 475000, 'min_blocks': 5},
}


def one_block(cid, day, **over):
    return {'class_id': cid, 'name': f'Class {cid}', 'price_cents': 36500, 'supply_fee_cents': 0,
            'meetings': [{'day_of_week': day, 'start_time': '09:30', 'end_time': '10:30'}], **over}


def q(classes, plan=None, learning_day=None):
    return tuition.schedule_quote(classes, time_blocks=BLOCKS, block_pricing=PRICING,
                                  tuition_plan=plan, learning_day=learning_day,
                                  private_school_name='UFA Private School' if plan else None)


@pytest.mark.unit
class TestBlocks:
    def test_meetings_count_against_teaching_blocks_not_lunch(self):
        two_hours = {'meetings': [{'day_of_week': 2, 'start_time': '11:30', 'end_time': '14:00'}]}
        assert tuition.class_blocks(two_hours, BLOCKS) == 2  # 11:30 block + 1:00 block; lunch never counts

    def test_billing_blocks_overrides(self):
        assert tuition.class_blocks({'billing_blocks': 4, 'meetings': []}, BLOCKS) == 4

    def test_tier_is_the_cheapest_that_covers(self):
        assert tuition.tier_for(PRICING['tiers'], 5)['year_cents'] == 150000
        assert tuition.tier_for(PRICING['tiers'], 6)['year_cents'] == 280000
        assert tuition.tier_for(PRICING['tiers'], 11) is None


@pytest.mark.unit
class TestTiers:
    def test_block_tier_wins_when_cheaper_than_the_per_class_sum(self):
        # 5 one-block classes = $1825 per class vs the 5-block tier at $1500;
        # payment plan = $1500 x 1.06 / 10 = $159.00.
        out = q([one_block(f'c{i}', (i % 4) + 1) for i in range(1, 6)])
        assert out['blocks'] == 5
        assert out['tuition_cents'] == 150000
        assert out['total_cents'] == 150000
        assert out['note'] == '5-block plan'
        assert out['installments'] == {'count': 10, 'fee_pct': 6, 'per_payment_cents': 15900}
        # One line per class, the tier shared across them, so the invoice names
        # what the family is paying for (2026-09-20: "Some families need to
        # show that for their reimbursements") and still adds up to the tier.
        assert [(l['kind'], l['amount_cents']) for l in out['lines']] == [('tuition', 30000)] * 5
        assert [l['class_id'] for l in out['lines']] == ['c1', 'c2', 'c3', 'c4', 'c5']
        assert out['lines'][0]['description'] == 'Class c1 (T) (5-block plan)'

    def test_the_tier_is_shared_by_price_and_the_cents_add_back_up(self):
        # A $1,225 four-block class beside a $365 one: the $1,500 tier splits
        # 1225:365 and the rounding remainder lands on a line, never in the void.
        exceptional = {'class_id': 'ek', 'name': 'Exceptional Kids (Tuesday)', 'price_cents': 122500,
                       'supply_fee_cents': 0, 'billing_blocks': 4,
                       'meetings': [{'day_of_week': 2, 'start_time': '13:00', 'end_time': '15:00'}]}
        out = q([exceptional, one_block('c1', 4)])
        amounts = [l['amount_cents'] for l in out['lines']]
        assert sum(amounts) == 150000
        assert amounts == [115567, 34433]
        assert out['lines'][0]['description'] == 'Exceptional Kids (Tuesday) (5-block plan)'

    def test_stays_per_class_below_the_tiers_and_rolls_supplies_in(self):
        # 2 blocks = $730 per class + $35 supplies = $765; 10 payments of $81.09.
        out = q([one_block('c1', 2, supply_fee_cents=3500), one_block('c2', 4)])
        assert out['tuition_cents'] == 73000
        assert out['supply_cents'] == 3500
        assert out['total_cents'] == 76500
        assert out['note'] is None
        assert out['installments']['per_payment_cents'] == 8109
        assert [(l['kind'], l['amount_cents']) for l in out['lines']] == [
            ('tuition', 36500), ('tuition', 36500), ('supply', 3500)]

    def test_billing_blocks_override_the_hourly_count(self):
        # 2 hourly blocks billing as 4, plus a 1-block class = 5 billing blocks:
        # per class $1225 + $365 = $1590 vs the 5-block tier $1500 -- tier wins.
        exceptional = {'class_id': 'ek', 'name': 'Exceptional Kids (Tuesday)', 'price_cents': 122500,
                       'supply_fee_cents': 0, 'billing_blocks': 4,
                       'meetings': [{'day_of_week': 2, 'start_time': '13:00', 'end_time': '15:00'}]}
        out = q([exceptional, one_block('c1', 4)])
        assert out['blocks'] == 5
        assert out['tuition_cents'] == 150000
        assert out['note'] == '5-block plan'

    def test_no_pricing_config_is_per_class_with_no_plan(self):
        out = tuition.schedule_quote([one_block('c1', 2)], time_blocks=[], block_pricing=None, tuition_plan=None)
        assert out['tuition_cents'] == 36500
        assert out['installments'] is None
        assert out['tier'] is None
        assert out['ufa'] is None

    def test_an_empty_week_is_zero(self):
        out = q([])
        assert out['total_cents'] == 0
        assert out['lines'] == []


@pytest.mark.unit
class TestSplitCents:
    def test_equal_weights_share_the_remainder_from_the_front(self):
        assert tuition.split_cents(100, [1, 1, 1]) == [34, 33, 33]

    def test_weights_of_zero_fall_back_to_an_equal_split(self):
        assert tuition.split_cents(150000, [0, 0]) == [75000, 75000]

    def test_a_free_class_beside_a_priced_one_takes_no_share(self):
        assert tuition.split_cents(1000, [0, 500]) == [0, 1000]

    def test_nothing_to_split(self):
        assert tuition.split_cents(500, []) == []


@pytest.mark.unit
class TestUfa:
    def test_flat_plan_price_with_the_requirements(self):
        out = q([one_block('c1', 2)], plan='ufa_academy')
        assert out['tuition_cents'] == 475000
        assert out['total_cents'] == 475000
        assert out['note'] == 'UFA Private School tuition'
        assert out['lines'][0] == {'class_id': None, 'description': 'UFA Private School annual tuition',
                                   'amount_cents': 475000, 'kind': 'tuition'}
        ufa = out['ufa']
        assert ufa['shortfall'] == 4            # 1 of 5 blocks scheduled
        assert ufa['campus_days'] == [2]
        assert ufa['total_days'] == 1          # no learning day yet
        assert ufa['included_days'] == 3
        assert ufa['extra'] is None

    def test_a_learning_day_counts_as_an_instructional_day(self):
        out = q([one_block('c1', 1), one_block('c2', 3)], plan='ufa_academy', learning_day='quest_learning_day')
        assert out['ufa']['total_days'] == 3

    def test_a_fourth_day_bills_its_classes_a_la_carte(self):
        # Mon/Tue/Wed + a cheap Thursday class: Thursday is the extra (cheapest) day.
        thursday = one_block('c4', 4, price_cents=10000, name='Chess Club')
        out = q([one_block('c1', 1), one_block('c2', 2), one_block('c3', 3), thursday], plan='ufa_academy')
        assert out['ufa']['extra'] == {'days': [4], 'class_names': ['Chess Club'], 'amount_cents': 10000}
        assert out['extra_cents'] == 10000
        assert out['total_cents'] == 485000
        assert [(l['kind'], l['amount_cents']) for l in out['lines']] == [
            ('tuition', 475000), ('extra_day', 10000)]
        assert 'beyond the 3 covered days' in out['lines'][1]['description']

    def test_supplies_are_not_covered_by_the_flat_plan(self):
        out = q([one_block('c1', 2, supply_fee_cents=3500)], plan='ufa_academy')
        assert out['total_cents'] == 478500
        assert out['lines'][-1]['kind'] == 'supply'

    def test_a_plan_the_org_has_no_price_for_falls_back_to_the_tiers(self):
        out = tuition.schedule_quote([one_block('c1', 2)], time_blocks=BLOCKS,
                                     block_pricing={'tiers': PRICING['tiers']}, tuition_plan='ufa_academy')
        assert out['tuition_cents'] == 36500
        assert out['ufa'] is None


@pytest.mark.unit
def test_seed_line_items_are_the_quote_lines():
    classes = [one_block(f'c{i}', (i % 4) + 1) for i in range(1, 6)]
    seeds = tuition.seed_line_items(classes, None, PRICING, None, time_blocks=BLOCKS)
    assert seeds == q(classes)['lines']
