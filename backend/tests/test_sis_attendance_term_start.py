"""
No attendance reminders before the school year starts.

iCreate, 2026-08-06: "teachers are getting notifications to take attendance even
though school isn't in session yet. the SIS has a first day of school date, don't
send these notifications until school starts."

The sweep only ever asked whether the clock was between the school's start and
end HOUR. Nothing asked whether school was in session at all, so every weekday of
the summer looked like a school day — with, unsurprisingly, a suspicious number
of students unaccounted for. Teachers got start-of-class reminders and admins got
attendance-gap alerts for classes that had not begun.

The setting already existed and four other services already respected it
(schedule changes, staff, supply budgets, the waitlist). This one didn't.
"""

from datetime import date
from unittest.mock import patch

import pytest

from services import sis_attendance_sweep_service as sweep


ORG = 'org-1'


def _with_first_day(value):
    return patch.object(sweep, 'org_settings', return_value={
        'timezone': 'America/Denver', 'school_start_hour': 8, 'school_end_hour': 15,
        'first_day_of_school': value,
    })


@pytest.mark.unit
class TestWhetherTermHasStarted:
    def test_the_day_before_term_is_not_in_session(self):
        with _with_first_day('2026-08-20'):
            assert sweep.term_has_started(ORG, date(2026, 8, 19)) is False

    def test_the_first_day_itself_is_in_session(self):
        """Inclusive: attendance is taken ON the first day, not from the second."""
        with _with_first_day('2026-08-20'):
            assert sweep.term_has_started(ORG, date(2026, 8, 20)) is True

    def test_mid_year_is_in_session(self):
        with _with_first_day('2026-08-20'):
            assert sweep.term_has_started(ORG, date(2026, 11, 3)) is True

    def test_a_school_with_no_first_day_set_is_treated_as_in_session(self):
        """The setting's absence is not a claim that term hasn't started. Going
        quiet for every org that never filled it in would be a worse bug than
        the one this fixes."""
        with _with_first_day(None):
            assert sweep.term_has_started(ORG, date(2026, 8, 19)) is True

    def test_a_malformed_date_does_not_silence_attendance_all_year(self):
        for junk in ('not-a-date', '2026-13-45', 42, ''):
            with _with_first_day(junk):
                assert sweep.term_has_started(ORG, date(2026, 8, 19)) is True

    def test_a_full_timestamp_is_accepted(self):
        with _with_first_day('2026-08-20T00:00:00Z'):
            assert sweep.term_has_started(ORG, date(2026, 8, 19)) is False


@pytest.mark.unit
class TestTheSweepItself:
    def _run(self, started):
        with patch.object(sweep, 'term_has_started', return_value=started), \
             patch.object(sweep, 'org_settings', return_value={
                 'timezone': 'America/Denver', 'school_start_hour': 0,
                 'school_end_hour': 23, 'first_day_of_school': '2026-08-20'}), \
             patch.object(sweep, 'org_now') as now, \
             patch.object(sweep, '_admin') as admin:
            now.return_value.date.return_value = date(2026, 8, 10)
            now.return_value.hour = 10
            now.return_value.minute = 0
            return sweep._sweep_org(ORG), admin

    def test_nothing_is_sent_before_the_first_day(self):
        counts, admin = self._run(started=False)
        assert counts == {'gap_alerts': 0, 'class_reminders': 0}
        # It returns before reading anything, so there is no roster to be wrong
        # about and no notification to suppress later.
        assert not admin.called

    def test_the_sweep_runs_once_term_starts(self):
        _, admin = self._run(started=True)
        assert admin.called
