"""
Unit tests for the pure SIS eligibility / schedule-conflict logic.

No DB, no app — just the rule functions. This is where subtle bugs live
(age math across birthdays, half-open interval overlap, recurring vs one-off
meeting comparison), so coverage here is deliberately exhaustive.
"""

from datetime import date

import pytest

from services import sis_eligibility as elig


class TestAge:
    def test_age_on_before_birthday(self):
        assert elig.age_on('2015-07-01', date(2026, 6, 26)) == 10

    def test_age_on_after_birthday(self):
        assert elig.age_on('2015-06-01', date(2026, 6, 26)) == 11

    def test_age_on_exact_birthday(self):
        assert elig.age_on('2015-06-26', date(2026, 6, 26)) == 11

    def test_age_on_unparseable(self):
        assert elig.age_on('not-a-date') is None
        assert elig.age_on(None) is None

    def test_age_band_warning(self):
        assert elig.age_band_warning(7, 8, 12) is not None      # too young
        assert elig.age_band_warning(13, 8, 12) is not None     # too old
        assert elig.age_band_warning(10, 8, 12) is None         # in band
        assert elig.age_band_warning(None, 8, 12) is None       # unknown age
        assert elig.age_band_warning(10, None, None) is None    # no band


class TestCapacity:
    def test_full(self):
        assert elig.capacity_warning(10, 10) is not None
        assert elig.capacity_warning(10, 11) is not None
        assert elig.is_full(10, 10) is True

    def test_not_full(self):
        assert elig.capacity_warning(10, 9) is None
        assert elig.is_full(10, 9) is False

    def test_unlimited(self):
        assert elig.capacity_warning(None, 999) is None
        assert elig.is_full(None, 999) is False


class TestPrerequisites:
    def test_unmet_class_prereq(self):
        out = elig.prerequisite_warnings([{'prerequisite_class_id': 'c1'}], set())
        assert len(out) == 1

    def test_met_class_prereq(self):
        out = elig.prerequisite_warnings([{'prerequisite_class_id': 'c1'}], {'c1'})
        assert out == []

    def test_note_prereq_always_warns_to_verify(self):
        out = elig.prerequisite_warnings([{'note': 'Can swim'}], {'c1'})
        assert len(out) == 1


class TestMeetingOverlap:
    def test_same_day_overlap(self):
        a = {'day_of_week': 1, 'start_time': '09:00', 'end_time': '10:30'}
        b = {'day_of_week': 1, 'start_time': '10:00', 'end_time': '11:00'}
        assert elig.meetings_overlap(a, b) is True

    def test_same_day_touching_not_overlap(self):
        # half-open: 09:00-10:00 and 10:00-11:00 do NOT overlap
        a = {'day_of_week': 1, 'start_time': '09:00', 'end_time': '10:00'}
        b = {'day_of_week': 1, 'start_time': '10:00', 'end_time': '11:00'}
        assert elig.meetings_overlap(a, b) is False

    def test_different_day_no_overlap(self):
        a = {'day_of_week': 1, 'start_time': '09:00', 'end_time': '10:30'}
        b = {'day_of_week': 2, 'start_time': '09:00', 'end_time': '10:30'}
        assert elig.meetings_overlap(a, b) is False

    def test_one_off_same_date_overlap(self):
        a = {'specific_date': '2026-07-01', 'start_time': '09:00', 'end_time': '10:30'}
        b = {'specific_date': '2026-07-01', 'start_time': '10:00', 'end_time': '11:00'}
        assert elig.meetings_overlap(a, b) is True

    def test_one_off_different_date_no_overlap(self):
        a = {'specific_date': '2026-07-01', 'start_time': '09:00', 'end_time': '10:30'}
        b = {'specific_date': '2026-07-02', 'start_time': '09:00', 'end_time': '10:30'}
        assert elig.meetings_overlap(a, b) is False

    def test_recurring_vs_oneoff_matching_weekday(self):
        # 2026-07-01 is a Wednesday -> our weekday code 3
        a = {'day_of_week': 3, 'start_time': '09:00', 'end_time': '10:30'}
        b = {'specific_date': '2026-07-01', 'start_time': '10:00', 'end_time': '11:00'}
        assert elig.meetings_overlap(a, b) is True

    def test_recurring_vs_oneoff_other_weekday(self):
        a = {'day_of_week': 1, 'start_time': '09:00', 'end_time': '10:30'}
        b = {'specific_date': '2026-07-01', 'start_time': '10:00', 'end_time': '11:00'}
        assert elig.meetings_overlap(a, b) is False

    def test_bad_times_no_overlap(self):
        a = {'day_of_week': 1, 'start_time': None, 'end_time': '10:30'}
        b = {'day_of_week': 1, 'start_time': '10:00', 'end_time': '11:00'}
        assert elig.meetings_overlap(a, b) is False


class TestScheduleConflicts:
    def test_collects_conflicts(self):
        prospective = [{'day_of_week': 1, 'start_time': '09:00', 'end_time': '10:00'}]
        existing = [
            {'id': 'm1', 'day_of_week': 1, 'start_time': '09:30', 'end_time': '10:30'},
            {'id': 'm2', 'day_of_week': 2, 'start_time': '09:30', 'end_time': '10:30'},
        ]
        out = elig.schedule_conflicts(prospective, existing)
        assert [m['id'] for m in out] == ['m1']

    def test_empty(self):
        assert elig.schedule_conflicts([], []) == []


class TestEvaluate:
    def _class(self, **kw):
        base = {'capacity': 10, 'min_age': 8, 'max_age': 12}
        base.update(kw)
        return base

    def test_clean(self):
        out = elig.evaluate(
            student_dob='2015-01-01', klass=self._class(), enrolled=2,
            prerequisites=[], satisfied_class_ids=set(),
            prospective_meetings=[], existing_meetings=[],
        )
        assert out['eligible'] is True
        assert out['is_full'] is False
        assert out['warnings'] == []

    def test_accumulates_all_warnings(self):
        out = elig.evaluate(
            student_dob='2020-01-01',  # ~6yo -> too young
            klass=self._class(capacity=5),
            enrolled=5,                 # full
            prerequisites=[{'prerequisite_class_id': 'c9'}],  # unmet
            satisfied_class_ids=set(),
            prospective_meetings=[{'day_of_week': 1, 'start_time': '09:00', 'end_time': '10:00'}],
            existing_meetings=[{'id': 'x', 'day_of_week': 1, 'start_time': '09:30', 'end_time': '10:30'}],
        )
        # age + capacity + prereq + conflict = 4 warnings, but still eligible (soft)
        assert out['eligible'] is True
        assert out['is_full'] is True
        assert len(out['warnings']) == 4
        assert len(out['conflicts']) == 1


class TestRosterConflicts:
    # Mon 1-3 vs Mon 1-3 overlap; a Wed class never collides with them.
    MEETINGS = {
        'hist_mon': [{'day_of_week': 1, 'start_time': '13:00', 'end_time': '15:00'}],
        'sci_mon':  [{'day_of_week': 1, 'start_time': '13:00', 'end_time': '15:00'}],
        'sci_wed':  [{'day_of_week': 3, 'start_time': '13:00', 'end_time': '15:00'}],
        'no_mtg':   [],
    }

    def test_two_classes_same_slot_conflict(self):
        out = elig.find_roster_conflicts({'s1': ['hist_mon', 'sci_mon']}, self.MEETINGS)
        assert out == [{'student_id': 's1', 'class_a': 'hist_mon', 'class_b': 'sci_mon'}]

    def test_pair_ordering_is_stable(self):
        # Same input in a different list order yields the same a<b pair.
        out = elig.find_roster_conflicts({'s1': ['sci_mon', 'hist_mon']}, self.MEETINGS)
        assert out == [{'student_id': 's1', 'class_a': 'hist_mon', 'class_b': 'sci_mon'}]

    def test_different_days_no_conflict(self):
        out = elig.find_roster_conflicts({'s1': ['hist_mon', 'sci_wed']}, self.MEETINGS)
        assert out == []

    def test_class_without_meetings_never_conflicts(self):
        out = elig.find_roster_conflicts({'s1': ['hist_mon', 'no_mtg']}, self.MEETINGS)
        assert out == []

    def test_duplicate_class_ids_deduped(self):
        out = elig.find_roster_conflicts({'s1': ['hist_mon', 'hist_mon']}, self.MEETINGS)
        assert out == []

    def test_three_classes_one_overlapping_pair(self):
        out = elig.find_roster_conflicts({'s1': ['hist_mon', 'sci_mon', 'sci_wed']}, self.MEETINGS)
        assert out == [{'student_id': 's1', 'class_a': 'hist_mon', 'class_b': 'sci_mon'}]

    def test_per_student_isolation(self):
        out = elig.find_roster_conflicts(
            {'s1': ['hist_mon', 'sci_mon'], 's2': ['hist_mon', 'sci_wed']}, self.MEETINGS)
        assert out == [{'student_id': 's1', 'class_a': 'hist_mon', 'class_b': 'sci_mon'}]

    def test_no_enrollments(self):
        assert elig.find_roster_conflicts({}, self.MEETINGS) == []
