"""
Calendar booking poll: attendee emails convert matching leads exactly once
per (event, attendee), the owner and non-leads are ignored, a stale sync
token triggers a full resync, and the poll no-ops cleanly when unconfigured.
"""
from unittest.mock import patch

import pytest

from app_config import Config
from services import crm_calendar_service as cal
from tests.crm_fakes import make_world


def _event(event_id='ev-1', attendees=()):
    return {'id': event_id,
            'start': {'dateTime': '2026-08-22T17:00:00Z'},
            'attendees': [{'email': a} for a in attendees]}


@pytest.fixture
def world():
    world = make_world()
    world.data['crm_leads'].append({
        'id': 'lead-1', 'email': 'lead@example.com', 'status': 'active',
        'unsubscribe_token': 't1'})
    world.data['crm_funnel_memberships'].append({
        'id': 'm-1', 'lead_id': 'lead-1', 'funnel_id': 'funnel-1',
        'status': 'active', 'last_step_sent': 0})
    return world


def _run(world, events, sync_token_result='sync-2'):
    with patch.object(Config, 'GOOGLE_CALENDAR_ID', 'owner@gmail.com'), \
         patch.object(Config, 'GOOGLE_CALENDAR_SA_KEY_B64', 'ZmFrZQ=='), \
         patch.object(cal, '_access_token', return_value='token'), \
         patch.object(cal, '_list_events', return_value=(events, sync_token_result)), \
         patch.object(cal, '_db', return_value=world), \
         patch('services.crm_service._db', return_value=world):
        return cal.run_poll()


@pytest.mark.unit
class TestCalendarPoll:
    def test_unconfigured_is_a_noop(self):
        with patch.object(Config, 'GOOGLE_CALENDAR_ID', None), \
             patch.object(Config, 'GOOGLE_CALENDAR_SA_KEY_B64', None):
            assert cal.run_poll() == {'skipped': 'calendar_not_configured',
                                      'converted': 0}

    def test_matching_attendee_converts_lead(self, world):
        result = _run(world, [_event(attendees=['owner@gmail.com',
                                                'LEAD@example.com'])])
        assert result['converted'] == 1
        lead = world.data['crm_leads'][0]
        assert lead['status'] == 'converted'
        assert lead['conversion_event'] == 'video_chat_scheduled'
        assert world.data['crm_funnel_memberships'][0]['status'] == 'exited'
        assert world.data['crm_funnel_memberships'][0]['exit_reason'] \
            == 'converted_video_chat'

    def test_same_booking_never_converts_twice(self, world):
        _run(world, [_event(attendees=['lead@example.com'])])
        result = _run(world, [_event(attendees=['lead@example.com'])])
        assert result['converted'] == 0
        assert len(world.data['crm_calendar_bookings']) == 1

    def test_non_lead_attendees_ignored(self, world):
        result = _run(world, [_event(attendees=['stranger@example.com'])])
        assert result['converted'] == 0
        assert world.data['crm_calendar_bookings'] == []

    def test_sync_token_persisted(self, world):
        _run(world, [], sync_token_result='sync-99')
        stored = [s for s in world.data['crm_settings']
                  if s['key'] == 'calendar_sync_token']
        assert stored and stored[0]['value'] == {'token': 'sync-99'}

    def test_stale_sync_token_triggers_full_resync(self, world):
        calls = []

        def fake_list(token, calendar_id, sync_token):
            calls.append(sync_token)
            if sync_token:
                raise cal._StaleSyncToken()
            return [], 'fresh-token'

        world.data['crm_settings'].append({'key': 'calendar_sync_token',
                                           'value': {'token': 'stale'}})
        with patch.object(Config, 'GOOGLE_CALENDAR_ID', 'owner@gmail.com'), \
             patch.object(Config, 'GOOGLE_CALENDAR_SA_KEY_B64', 'ZmFrZQ=='), \
             patch.object(cal, '_access_token', return_value='token'), \
             patch.object(cal, '_list_events', side_effect=fake_list), \
             patch.object(cal, '_db', return_value=world):
            result = cal.run_poll()
        assert calls == ['stale', None]
        assert result['converted'] == 0
