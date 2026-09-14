"""
Monthly program pricing for the registration funnel (Optio Academy).

The rules, as stated: $50 per student each month, capped at $150 per family;
an Optio teacher is $500 per month per student and INCLUDES that student's
program fee -- a one-child family with a teacher pays $500, not $550.
"""

import pytest

from services.registration_pricing import (
    PROGRAM_FEE_KEY,
    apply_add_on_selection,
    monthly_line_items,
    monthly_plan,
    monthly_total_cents,
    stripe_line_items,
)

TEACHER = {
    'key': 'teacher_support', 'label': 'Optio teacher support',
    'description': 'A weekly meeting with an Optio teacher.',
    'amount_cents': 50000, 'includes_program_fee': True,
}
ACADEMY = {'monthly': {'per_student_cents': 5000, 'family_cap_cents': 15000, 'add_ons': [TEACHER]}}


def _kid(i, add_ons=None):
    return {'user_id': f'kid-{i}', 'first_name': f'Kid{i}', 'name': f'Kid{i} Sample',
            'add_ons': add_ons or []}


@pytest.mark.unit
class TestMonthlyPlan:
    def test_no_block_means_no_plan(self):
        assert monthly_plan({}) is None
        assert monthly_plan({'monthly': None}) is None
        assert monthly_plan({'monthly': 'yes'}) is None
        assert monthly_plan(None) is None

    def test_zero_fee_and_no_add_ons_is_no_plan(self):
        assert monthly_plan({'monthly': {'per_student_cents': 0, 'add_ons': []}}) is None

    def test_normalizes_and_drops_malformed_add_ons(self):
        plan = monthly_plan({'monthly': {
            'per_student_cents': '5000', 'family_cap_cents': None,
            'add_ons': [
                TEACHER,
                {'key': '', 'label': 'No key', 'amount_cents': 100},
                {'key': 'free', 'label': 'Free thing', 'amount_cents': 0},
                {'key': 'teacher_support', 'label': 'Duplicate key', 'amount_cents': 1},
                {'key': PROGRAM_FEE_KEY, 'label': 'Reserved key', 'amount_cents': 1},
                'not a dict',
            ],
        }})
        assert plan['per_student_cents'] == 5000
        assert plan['family_cap_cents'] == 0
        assert [a['key'] for a in plan['add_ons']] == ['teacher_support']
        assert plan['add_ons'][0]['includes_program_fee'] is True

    def test_add_ons_alone_make_a_plan(self):
        plan = monthly_plan({'monthly': {'add_ons': [TEACHER]}})
        assert plan['per_student_cents'] == 0
        assert len(plan['add_ons']) == 1


@pytest.mark.unit
class TestMonthlyTotal:
    plan = monthly_plan(ACADEMY)

    def test_one_kid_is_fifty(self):
        assert monthly_total_cents(self.plan, [_kid(1)]) == 5000

    def test_three_kids_hit_the_cap(self):
        assert monthly_total_cents(self.plan, [_kid(1), _kid(2), _kid(3)]) == 15000

    def test_four_kids_stay_at_the_cap(self):
        assert monthly_total_cents(self.plan, [_kid(i) for i in range(4)]) == 15000

    def test_teacher_includes_the_program_fee(self):
        # $500, not $550.
        assert monthly_total_cents(self.plan, [_kid(1, ['teacher_support'])]) == 50000

    def test_teacher_for_one_of_two_kids(self):
        kids = [_kid(1, ['teacher_support']), _kid(2)]
        assert monthly_total_cents(self.plan, kids) == 55000

    def test_cap_applies_to_the_kids_without_a_teacher(self):
        kids = [_kid(1, ['teacher_support']), _kid(2), _kid(3), _kid(4), _kid(5)]
        # Four kids on the program fee -> capped at $150, plus the teacher.
        assert monthly_total_cents(self.plan, kids) == 65000

    def test_no_cap_when_cap_is_zero(self):
        plan = monthly_plan({'monthly': {'per_student_cents': 5000, 'family_cap_cents': 0}})
        assert monthly_total_cents(plan, [_kid(i) for i in range(4)]) == 20000

    def test_no_plan_is_zero(self):
        assert monthly_total_cents(None, [_kid(1)]) == 0

    def test_add_on_that_does_not_include_the_fee_stacks(self):
        plan = monthly_plan({'monthly': {
            'per_student_cents': 5000, 'family_cap_cents': 15000,
            'add_ons': [{'key': 'lunch', 'label': 'Lunch', 'amount_cents': 2000}],
        }})
        assert monthly_total_cents(plan, [_kid(1, ['lunch'])]) == 7000


@pytest.mark.unit
class TestLineItems:
    plan = monthly_plan(ACADEMY)

    def test_program_fee_names_the_students_it_covers(self):
        items = monthly_line_items(self.plan, [_kid(1, ['teacher_support']), _kid(2)])
        by_key = {i['key']: i for i in items}
        assert by_key[PROGRAM_FEE_KEY]['students'] == ['Kid2']
        assert by_key[PROGRAM_FEE_KEY]['amount_cents'] == 5000
        assert by_key['teacher_support']['students'] == ['Kid1']
        assert by_key['teacher_support']['amount_cents'] == 50000

    def test_capped_flag(self):
        items = monthly_line_items(self.plan, [_kid(i) for i in range(4)])
        assert items[0]['capped'] is True
        items = monthly_line_items(self.plan, [_kid(1)])
        assert items[0]['capped'] is False

    def test_all_kids_with_teachers_have_no_program_fee_line(self):
        items = monthly_line_items(self.plan, [_kid(1, ['teacher_support'])])
        assert [i['key'] for i in items] == ['teacher_support']

    def test_preferred_name_wins(self):
        kid = {**_kid(1), 'preferred_name': 'Kiddo'}
        assert monthly_line_items(self.plan, [kid])[0]['students'] == ['Kiddo']

    def test_stripe_lines_are_recurring_monthly(self):
        lines = stripe_line_items(self.plan, [_kid(1, ['teacher_support']), _kid(2)], 'Optio Academy')
        assert all(line['price_data']['recurring'] == {'interval': 'month'} for line in lines)
        assert all(line['price_data']['currency'] == 'usd' for line in lines)
        names = [line['price_data']['product_data']['name'] for line in lines]
        assert names == ['Optio Academy monthly program fee (1 student)',
                         'Optio teacher support (Kid1)']
        assert sum(line['price_data']['unit_amount'] for line in lines) == 55000

    def test_stripe_lines_pluralize(self):
        lines = stripe_line_items(self.plan, [_kid(1), _kid(2)], 'Optio Academy')
        assert lines[0]['price_data']['product_data']['name'] == 'Optio Academy monthly program fee (2 students)'


@pytest.mark.unit
class TestApplySelection:
    plan = monthly_plan(ACADEMY)

    def test_selection_lands_on_the_kid(self):
        kids = apply_add_on_selection(self.plan, [_kid(1), _kid(2)], {'kid-2': ['teacher_support']})
        assert kids[0]['add_ons'] == []
        assert kids[1]['add_ons'] == ['teacher_support']

    def test_unknown_keys_and_kids_are_dropped(self):
        kids = apply_add_on_selection(self.plan, [_kid(1)],
                                      {'kid-1': ['teacher_support', 'pony'], 'stranger': ['teacher_support']})
        assert kids == [{**_kid(1), 'add_ons': ['teacher_support']}]

    def test_none_leaves_stored_choices_alone(self):
        stored = [_kid(1, ['teacher_support'])]
        assert apply_add_on_selection(self.plan, stored, None) == stored

    def test_garbage_selection_is_ignored(self):
        # Not a dict: treated like "nothing submitted", stored choices stand.
        assert apply_add_on_selection(self.plan, [_kid(1, ['teacher_support'])], 'yes') \
            == [_kid(1, ['teacher_support'])]
        # A dict whose value is not a list: that kid gets nothing.
        kids = apply_add_on_selection(self.plan, [_kid(1)], {'kid-1': 'teacher_support'})
        assert kids[0]['add_ons'] == []

    def test_no_plan_offers_nothing(self):
        kids = apply_add_on_selection(None, [_kid(1)], {'kid-1': ['teacher_support']})
        assert kids[0]['add_ons'] == []

    def test_selection_is_deduplicated_and_sorted(self):
        plan = monthly_plan({'monthly': {'per_student_cents': 100, 'add_ons': [
            {'key': 'b', 'label': 'B', 'amount_cents': 1},
            {'key': 'a', 'label': 'A', 'amount_cents': 1},
        ]}})
        kids = apply_add_on_selection(plan, [_kid(1)], {'kid-1': ['b', 'a', 'b']})
        assert kids[0]['add_ons'] == ['a', 'b']
