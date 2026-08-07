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

    def test_all_categories_are_exported(self):
        ics = build_ics('iCreate', [{
            'id': 'e5', 'title': 'Museum day', 'all_day': True,
            'start_at': '2026-08-24T00:00:00Z', 'end_at': None,
            'category': 'Field trips', 'categories': ['Field trips', 'No school'],
            'created_at': '2026-07-10T00:00:00+00:00',
        }])
        assert 'CATEGORIES:Field trips,No school' in ics


@pytest.mark.unit
class TestMultipleCategories:
    """iCreate, 2026-07-30: "can we make it so that we can choose more than one
    category? Some things will belong in more than one category." `category`
    stays the primary (colour + per-category feeds) and mirrors categories[0]."""

    def test_categories_set_the_primary(self):
        fields = _clean({'categories': ['Field trips', 'No school']})
        assert fields['categories'] == ['Field trips', 'No school']
        assert fields['category'] == 'Field trips'

    def test_blank_and_duplicate_entries_are_dropped(self):
        fields = _clean({'categories': ['Camps', '  ', 'camps', 'Camps ', None]})
        assert fields['categories'] == ['Camps']

    def test_clearing_categories_clears_the_primary(self):
        fields = _clean({'categories': []})
        assert fields['categories'] == []
        assert fields['category'] is None

    def test_a_legacy_single_category_payload_fills_the_array(self):
        fields = _clean({'category': 'Camps'})
        assert fields['categories'] == ['Camps']

    def test_a_legacy_cleared_category_clears_the_array(self):
        fields = _clean({'category': ''})
        assert fields['categories'] == []

    def test_the_list_is_capped(self):
        fields = _clean({'categories': [f'C{i}' for i in range(20)]})
        assert len(fields['categories']) == 8


@pytest.mark.unit
class TestFamilyFeedUrl:
    """The family subscribe URL (/api/sis/parent/events/feed): membership-gated,
    one lazily-minted token per org, never the staff token."""

    def _url(self, member=True, existing_token='tok123'):
        from unittest.mock import patch
        from services import sis_parent_service as parent
        minted = {}

        def fake_set(org_id, name, value, updated_by=None):
            minted['name'] = name
            minted['value'] = value

        with patch.object(parent, '_is_org_member', return_value=member), \
             patch('utils.org_secrets.get_org_secret', return_value=existing_token), \
             patch('utils.org_secrets.set_org_secret', side_effect=fake_set):
            return parent.calendar_feed_url('u1', 'org-1', 'https://api.example.com'), minted

    def test_a_member_gets_the_tokened_ics_url(self):
        url, minted = self._url()
        assert url == 'https://api.example.com/api/sis/calendar/org-1.ics?token=tok123'
        assert minted == {}  # existing token reused, nothing minted

    def test_a_non_member_gets_nothing(self):
        url, _ = self._url(member=False)
        assert url is None

    def test_the_family_token_is_minted_lazily_and_is_the_family_one(self):
        url, minted = self._url(existing_token=None)
        assert minted['name'] == 'calendar_feed_token_family'
        assert minted['value'] and f"token={minted['value']}" in url
