"""
Per-class supply budget (2026-07-28).

iCreate's rule: supply fee x enrolled students, plus a materials allowance
funded from tuition, both per student per year. These tests pin the two
decisions that are easy to get wrong later — who counts as enrolled, and when
the number stops moving.
"""

from datetime import date, timedelta
from unittest.mock import patch

import pytest

from services import sis_supply_budget_service as budget


ORG = 'org-1'


def _run(classes, settings=None, enrollments=None):
    """Compute budgets with the two DB reads stubbed out."""
    with patch.object(budget, '_org_settings', return_value=settings or {}), \
         patch.object(budget, '_enrolled_counts', return_value=enrollments or {}):
        return budget.budget_for_classes(ORG, classes)


def _class(class_id='c1', supply_fee=None, override=None):
    return {'id': class_id, 'supply_fee': supply_fee,
            'supply_budget_per_student': override}


@pytest.mark.unit
class TestSupplyBudget:

    def test_fee_times_students(self):
        out = _run([_class(supply_fee=35)], enrollments={'c1': 12})

        assert out['c1']['from_fees'] == 420.0
        assert out['c1']['total'] == 420.0

    def test_allowance_is_added_on_top_of_the_fee(self):
        out = _run([_class(supply_fee=35)],
                   settings={'supply_budget_per_student': 15},
                   enrollments={'c1': 10})

        assert out['c1']['from_fees'] == 350.0
        assert out['c1']['from_allowance'] == 150.0
        assert out['c1']['total'] == 500.0

    def test_class_override_beats_the_school_default(self):
        out = _run([_class(supply_fee=0, override=25)],
                   settings={'supply_budget_per_student': 15},
                   enrollments={'c1': 4})

        assert out['c1']['total'] == 100.0

    def test_override_of_zero_means_no_allowance_not_fall_back(self):
        """0 is a real answer — "this class gets nothing extra" — and must not be
        confused with an unset override."""
        out = _run([_class(supply_fee=10, override=0)],
                   settings={'supply_budget_per_student': 15},
                   enrollments={'c1': 5})

        assert out['c1']['from_allowance'] == 0.0
        assert out['c1']['total'] == 50.0

    def test_class_with_no_students_has_no_budget(self):
        out = _run([_class(supply_fee=35)], enrollments={})

        assert out['c1']['students'] == 0
        assert out['c1']['total'] == 0.0

    def test_missing_fee_is_treated_as_zero(self):
        out = _run([_class(supply_fee=None)], enrollments={'c1': 6})

        assert out['c1']['total'] == 0.0

    def test_budget_is_live_before_the_first_day_of_school(self):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        out = _run([_class(supply_fee=10)],
                   settings={'first_day_of_school': tomorrow},
                   enrollments={'c1': 3})

        assert out['c1']['frozen'] is False

    def test_budget_freezes_once_school_has_started(self):
        """Otherwise a teacher who bought supplies watches their budget fall when
        a student drops."""
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        out = _run([_class(supply_fee=10)],
                   settings={'first_day_of_school': yesterday},
                   enrollments={'c1': 3})

        assert out['c1']['frozen'] is True
        assert out['c1']['as_of'] == yesterday

    def test_no_first_day_configured_stays_live(self):
        out = _run([_class(supply_fee=10)], settings={}, enrollments={'c1': 3})

        assert out['c1']['frozen'] is False

    def test_unparseable_first_day_does_not_blow_up(self):
        out = _run([_class(supply_fee=10)],
                   settings={'first_day_of_school': 'not a date'},
                   enrollments={'c1': 3})

        assert out['c1']['frozen'] is False

    def test_several_classes_are_costed_independently(self):
        out = _run([_class('c1', supply_fee=35), _class('c2', supply_fee=5)],
                   enrollments={'c1': 2, 'c2': 10})

        assert out['c1']['total'] == 70.0
        assert out['c2']['total'] == 50.0


@pytest.mark.unit
class TestEnrolledCounts:
    """Only active enrollments count — waitlisted and withdrawn students never
    paid a supply fee and must not inflate a teacher's budget."""

    def test_only_active_enrollments_are_counted(self):
        rows = [
            {'class_id': 'c1', 'status': 'active'},
            {'class_id': 'c1', 'status': 'active'},
            {'class_id': 'c1', 'status': 'waitlisted'},
            {'class_id': 'c1', 'status': 'withdrawn'},
        ]
        with patch.object(budget, '_admin') as admin:
            (admin.return_value.table.return_value.select.return_value
             .in_.return_value.execute.return_value.data) = rows
            counts = budget._enrolled_counts(['c1'])

        assert counts == {'c1': 2}

    def test_missing_status_counts_as_active(self):
        """Older rows predate the status column being populated."""
        with patch.object(budget, '_admin') as admin:
            (admin.return_value.table.return_value.select.return_value
             .in_.return_value.execute.return_value.data) = [{'class_id': 'c1', 'status': None}]
            counts = budget._enrolled_counts(['c1'])

        assert counts == {'c1': 1}
