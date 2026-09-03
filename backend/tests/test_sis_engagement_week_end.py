"""
Unfinished-work alerts wait for the end of the school week.

iCreate, 2026-09-02 (Nicole, ALD): a pile of "students have not completed their
tasks" notifications landed at the START of the week, when the students had
barely been given the work. Class quests tend to publish on the first teaching
day, so the condition first becomes true the same morning it is handed out. The
condition is right; the day was wrong.
"""

from datetime import date
from unittest.mock import Mock, patch

from services import sis_engagement_service as svc


def _admin_with_meetings(days):
    """A client whose class_meetings read returns these day_of_week values."""
    table = Mock()
    for m in ('select', 'in_'):
        getattr(table, m).return_value = table
    table.execute.return_value = Mock(data=[{'day_of_week': d} for d in days])
    admin = Mock()
    admin.table.return_value = table
    return admin


class TestLastSchoolWeekday:
    def test_latest_weekday_the_school_teaches(self):
        # Mon, Tue, Thu -> Thursday (4) ends the week, not Friday.
        assert svc._last_school_weekday(_admin_with_meetings([1, 2, 4]), ['c1']) == 4

    def test_a_saturday_class_does_not_move_the_end_of_the_week(self):
        assert svc._last_school_weekday(_admin_with_meetings([1, 3, 6]), ['c1']) == 3

    def test_weekend_only_school_ends_on_its_own_day(self):
        assert svc._last_school_weekday(_admin_with_meetings([6]), ['c1']) == 6

    def test_falls_back_to_friday_with_no_meetings_on_file(self):
        assert svc._last_school_weekday(_admin_with_meetings([]), ['c1']) == 5


class TestIsLastSchoolDay:
    def test_true_on_the_last_teaching_day(self):
        admin = _admin_with_meetings([1, 2, 3, 4])          # ends Thursday
        with patch('services.sis_parent_service._org_today', return_value=date(2026, 9, 3)):
            assert svc._is_last_school_day('org-1', admin, ['c1']) is True   # a Thursday

    def test_false_at_the_start_of_the_week(self):
        admin = _admin_with_meetings([1, 2, 3, 4])
        with patch('services.sis_parent_service._org_today', return_value=date(2026, 8, 31)):
            assert svc._is_last_school_day('org-1', admin, ['c1']) is False  # a Monday

    def test_fails_open_so_a_broken_lookup_never_silences_the_alert(self):
        admin = _admin_with_meetings([1, 2, 3, 4])
        with patch('services.sis_parent_service._org_today', side_effect=RuntimeError('no db')):
            assert svc._is_last_school_day('org-1', admin, ['c1']) is True
