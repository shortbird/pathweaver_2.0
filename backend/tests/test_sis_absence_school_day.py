"""
"Today" for a planned absence is the SCHOOL's today, not UTC's.

iCreate, 2026-09-02: "Why do I keep getting notifications that students will be
absent on the day after they are already absent?" UTC rolls over at 6pm
Mountain, so from late afternoon the reporting form defaulted to tomorrow and
the server rejected the day that was actually missed as "in the past" — a
guardian telling the school at 8pm could only file the NEXT day, and the office
got a notification dated a day after the absence.
"""

from datetime import date, datetime, timezone
from unittest.mock import patch

from services import sis_planned_absence_service as svc


# 2026-09-02 20:00 Mountain — already 2026-09-03 in UTC.
EVENING_UTC = datetime(2026, 9, 3, 2, 0, tzinfo=timezone.utc)
SCHOOL_TODAY = date(2026, 9, 2)


class TestSchoolToday:
    def test_today_uses_the_org_timezone(self):
        with patch('services.sis_parent_service._org_today', return_value=SCHOOL_TODAY) as org_today:
            assert svc._today('org-1') == SCHOOL_TODAY
        org_today.assert_called_once_with('org-1')

    def test_today_falls_back_to_utc_without_an_org(self):
        with patch.object(svc, 'datetime') as dt:
            dt.now.return_value = EVENING_UTC
            assert svc._today() == date(2026, 9, 3)

    def test_today_falls_back_to_utc_when_the_lookup_fails(self):
        with patch('services.sis_parent_service._org_today', side_effect=RuntimeError('no db')), \
             patch.object(svc, 'datetime') as dt:
            dt.now.return_value = EVENING_UTC
            assert svc._today('org-1') == date(2026, 9, 3)


class TestParseSpan:
    def test_this_evening_can_still_report_today(self):
        """The bug: at 8pm Mountain, today's date read as past and was refused."""
        with patch('services.sis_parent_service._org_today', return_value=SCHOOL_TODAY):
            start, end, err = svc._parse_span('2026-09-02', None, 'org-1')
        assert err is None
        assert start == end == SCHOOL_TODAY

    def test_yesterday_is_still_refused(self):
        with patch('services.sis_parent_service._org_today', return_value=SCHOOL_TODAY):
            _start, _end, err = svc._parse_span('2026-09-01', None, 'org-1')
        assert err == 'absence_date cannot be in the past'
