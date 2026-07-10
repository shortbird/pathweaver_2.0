"""
Tests for SIS calendar events: the null-end_at fix and the ICS feed builder.

Regression (beta feedback 2026-07-09): "all day doesn't work. End date isn't
actually optional either." _clean() stringified None to the literal "None",
which Postgres rejected as a timestamp — so any event without an end time
(including every all-day event, which sends end_at: null) failed to save.
"""

import pytest

from routes.sis.events import _clean, build_ics


@pytest.mark.unit
class TestCleanPayload:
    def test_null_end_stays_null(self):
        fields = _clean({'title': 'Field trip', 'start_at': '2026-08-24T09:00:00Z',
                         'end_at': None, 'all_day': False})
        assert fields['end_at'] is None
        assert fields['start_at'] == '2026-08-24T09:00:00Z'

    def test_all_day_event_payload_is_savable(self):
        fields = _clean({'title': 'Closure', 'all_day': True,
                         'start_at': '2026-09-01T00:00:00Z', 'end_at': None})
        assert fields['all_day'] is True
        assert fields['end_at'] is None

    def test_category_is_sanitized_and_optional(self):
        assert _clean({'category': ' Camps '})['category'] == 'Camps'
        assert _clean({'category': ''})['category'] is None
        assert _clean({'category': None})['category'] is None

    def test_unknown_fields_are_dropped(self):
        assert 'organization_id' not in _clean({'organization_id': 'x', 'title': 't'})


@pytest.mark.unit
class TestBuildIcs:
    def test_timed_event_uses_floating_wall_clock(self):
        ics = build_ics('iCreate', [{
            'id': 'e1', 'title': 'Showcase', 'all_day': False,
            'start_at': '2026-08-24T09:00:00+00:00', 'end_at': '2026-08-24T11:30:00+00:00',
            'created_at': '2026-07-10T00:00:00+00:00',
        }])
        assert 'DTSTART:20260824T090000' in ics
        assert 'DTEND:20260824T113000' in ics
        assert 'SUMMARY:Showcase' in ics
        assert 'X-WR-CALNAME:iCreate' in ics
        # Floating time: DTSTART must NOT carry a Z (viewer-timezone shifts).
        assert 'DTSTART:20260824T090000Z' not in ics

    def test_all_day_event_dtend_is_exclusive_next_day(self):
        ics = build_ics('iCreate', [{
            'id': 'e2', 'title': 'Fall Camp', 'all_day': True,
            'start_at': '2026-10-05T00:00:00Z', 'end_at': '2026-10-07T23:59:00Z',
            'created_at': '2026-07-10T00:00:00+00:00',
        }])
        assert 'DTSTART;VALUE=DATE:20261005' in ics
        # Oct 5-7 inclusive -> exclusive DTEND Oct 8 (RFC 5545).
        assert 'DTEND;VALUE=DATE:20261008' in ics

    def test_text_is_escaped_and_category_included(self):
        ics = build_ics('iCreate', [{
            'id': 'e3', 'title': 'Lunch, Learn; Play', 'all_day': False,
            'start_at': '2026-08-24T12:00:00Z', 'end_at': None,
            'description': 'Line1\nLine2', 'category': 'Events',
            'created_at': '2026-07-10T00:00:00+00:00',
        }])
        assert 'SUMMARY:Lunch\\, Learn\\; Play' in ics
        assert 'DESCRIPTION:Line1\\nLine2' in ics
        assert 'CATEGORIES:Events' in ics

    def test_events_without_start_are_skipped(self):
        ics = build_ics('iCreate', [{'id': 'e4', 'title': 'Broken', 'start_at': None}])
        assert 'BEGIN:VEVENT' not in ics
        assert ics.startswith('BEGIN:VCALENDAR')
