"""
The Timesheets page reports its own preconditions.

iCreate, 2026-08-25: "Timesheets would be a nice feature if it worked!" Every
piece of it did work — clock in/out, entry review, period approval, payroll
CSV. What did not work was finding the switch. `sis_staff_profiles.uses_time_clock`
defaults to false, so in prod at the time of the report the org had eleven staff
profiles, zero with the clock on, zero with an hourly rate, and the page said
"No time entries in this period." forever without naming any of that.

So `timeclock_setup` answers the question the empty page was raising: could
anyone be clocking in, is anyone, and is anyone on the clock without a rate —
that last one because payroll.csv leaves Amount blank rather than guess a rate,
and a blank column in a payroll export should be found before payday.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_staff_service


ORG = 'org-1'


def _profile(uid, *, clock=False, rate=None, active=True):
    return {'user_id': uid, 'uses_time_clock': clock, 'hourly_rate_cents': rate,
            'is_active': active}


def _setup(profiles, staff=None, calls=None):
    """Run timeclock_setup over a scripted sis_staff_profiles table.

    The read is paged through fetch_all_rows, so the double has to answer
    .order().range() and return a short page to end the loop.
    """
    def table(name):
        t = Mock()
        for chained in ('select', 'eq', 'is_', 'limit'):
            getattr(t, chained).return_value = t

        def order(col, *a, **k):
            if calls is not None:
                calls.append(col)
            return t
        t.order.side_effect = order
        t.range.return_value = t
        t.execute.return_value = Mock(
            data=profiles if name == 'sis_staff_profiles' else [])
        return t

    client = Mock()
    client.table.side_effect = table
    roster = staff if staff is not None else [
        {'id': p['user_id'], 'name': f"Staff {p['user_id']}"} for p in profiles]
    with patch.object(sis_staff_service, '_admin', return_value=client), \
         patch.object(sis_staff_service.sis_service, 'list_org_staff',
                      return_value=roster):
        return sis_staff_service.timeclock_setup(ORG)


@pytest.mark.unit
class TestNobodyOnTheClock:
    def test_the_report_case_reads_as_setup_not_as_an_empty_week(self):
        """Eleven staff, nobody on the clock — what iCreate actually had."""
        result = _setup([_profile(f'u{i}') for i in range(11)])
        assert result['staff_total'] == 11
        assert result['clock_enabled'] == 0
        assert result['missing_rate'] == []

    def test_an_org_with_no_staff_at_all_is_still_answerable(self):
        assert _setup([]) == {'staff_total': 0, 'clock_enabled': 0, 'missing_rate': []}


@pytest.mark.unit
class TestWhoCounts:
    def test_inactive_staff_are_not_offered_as_people_to_switch_on(self):
        """A departed teacher is not a reason the page is empty."""
        result = _setup([_profile('u1', clock=True, rate=2500),
                         _profile('u2', active=False)])
        assert result['staff_total'] == 1
        assert result['clock_enabled'] == 1

    def test_an_inactive_profile_with_the_clock_on_is_not_counted_as_enabled(self):
        result = _setup([_profile('u1', clock=True, rate=2500, active=False)])
        assert result['clock_enabled'] == 0


@pytest.mark.unit
class TestMissingRate:
    def test_clock_on_without_a_rate_is_named(self):
        """payroll.csv leaves Amount blank for these; say so before payday."""
        result = _setup([_profile('u1', clock=True), _profile('u2', clock=True, rate=2500)],
                        staff=[{'id': 'u1', 'name': 'Marika Connole'},
                               {'id': 'u2', 'name': 'Molly Christensen'}])
        assert result['clock_enabled'] == 2
        assert result['missing_rate'] == [{'user_id': 'u1', 'name': 'Marika Connole'}]

    def test_a_zero_rate_counts_as_missing(self):
        """0 cents/hour exports as a blank amount too, so it is the same problem."""
        result = _setup([_profile('u1', clock=True, rate=0)])
        assert [s['user_id'] for s in result['missing_rate']] == ['u1']

    def test_someone_off_the_clock_without_a_rate_is_not_flagged(self):
        """A salaried admin has no hourly rate and never will. Not a warning."""
        assert _setup([_profile('u1')])['missing_rate'] == []

    def test_a_profile_with_no_matching_staff_row_still_reports(self):
        result = _setup([_profile('u1', clock=True)], staff=[])
        assert result['missing_rate'] == [{'user_id': 'u1', 'name': 'Unknown'}]


@pytest.mark.unit
class TestPaging:
    def test_the_read_pages_on_a_column_that_exists(self):
        """sis_staff_profiles is keyed on (user_id, organization_id) and has no
        id column, so fetch_all_rows' default order_by would 400 rather than
        return a short read."""
        calls = []
        _setup([_profile('u1')], calls=calls)
        assert calls and all(c == 'user_id' for c in calls)
