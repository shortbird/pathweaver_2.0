"""A topic that is not the named user's is "not found", never a 500.

Tickets bb7b5b20 + 6d9a9c57 (Sentry, 2026-09-24): a parent had one child's
"Think" topic open in the mobile Journal and switched the header to her other
child. The app asked for /api/parent/children/<second child>/topics/<first
child's topic>. The service read the track with ``.single()``, PostgREST
answered PGRST116 ("The result contains 0 rows"), and the service handed that
raw message back -- which does not contain "not found", so both routes that
call it answered 500 and logged an error to Sentry.

The mobile screen now drops the open topic when the child changes; this is
the backend half, so a stale id is a quiet 404 whoever sends it.
"""
from unittest.mock import MagicMock, patch

import pytest

from services.interest_tracks_service import InterestTracksService

PARENT_ID = 'e1f2a3b4-1111-4111-8111-111111111111'
CHILD_ID = 'e1f2a3b4-2222-4222-8222-222222222222'
SIBLING_TRACK_ID = 'e1f2a3b4-4444-4444-8444-444444444444'


def _admin(track_execute_result, moments=None):
    """An admin client whose interest_tracks read returns `track_execute_result`
    from execute(). supabase-py's maybe_single() returns None for no row."""
    admin = MagicMock()
    t = MagicMock()
    for m in ('select', 'eq', 'maybe_single', 'single', 'order', 'in_'):
        getattr(t, m).return_value = t
    t.execute.return_value = track_execute_result
    admin.table.return_value = t
    admin.rpc.return_value.execute.return_value = MagicMock(data=moments or [])
    return admin, t


@pytest.mark.unit
class TestTheServiceReadsTheTrackAsMaybeSingle:
    @pytest.mark.parametrize('no_row', [None, MagicMock(data=None)])
    def test_no_row_is_track_not_found_and_logs_no_error(self, no_row):
        admin, _t = _admin(no_row)
        with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=admin), \
             patch('services.interest_tracks_service.logger') as log:
            result = InterestTracksService.get_track_with_moments(CHILD_ID, SIBLING_TRACK_ID)

        assert result == {'success': False, 'error': 'Track not found'}
        log.error.assert_not_called()
        admin.rpc.assert_not_called()

    def test_the_owners_track_still_comes_back_with_its_moments(self):
        admin, t = _admin(MagicMock(data={'id': SIBLING_TRACK_ID, 'name': 'Think'}))
        with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=admin):
            result = InterestTracksService.get_track_with_moments(CHILD_ID, SIBLING_TRACK_ID)

        assert result['success'] is True
        assert result['track']['name'] == 'Think'
        assert result['track']['moments'] == []
        t.maybe_single.assert_called_once()
        t.single.assert_not_called()
        # Still scoped to the named user: the ownership filter is the check.
        t.eq.assert_any_call('user_id', CHILD_ID)


@pytest.mark.unit
class TestTheParentRouteAnswers404ForASiblingsTopic:
    def test_a_topic_that_is_not_this_childs_is_404(self, client):
        admin, _t = _admin(None)
        with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=admin), \
             patch('routes.parent.learning_moments.get_supabase_admin_client', return_value=admin), \
             patch('utils.auth.relationships._is_platform_staff', return_value=False), \
             patch('utils.portfolio_access.is_parent_of', return_value=True), \
             patch('utils.portfolio_access.is_observer_of', return_value=False), \
             patch('utils.session_manager.session_manager.get_effective_user_id', return_value=PARENT_ID), \
             patch('utils.session_manager.session_manager.get_actual_admin_id', return_value=PARENT_ID), \
             patch('utils.session_manager.session_manager.get_masquerade_info', return_value=None):
            resp = client.get(f'/api/parent/children/{CHILD_ID}/topics/{SIBLING_TRACK_ID}')

        assert resp.status_code == 404, resp.get_data(as_text=True)
        assert resp.get_json()['error'] == 'Track not found'
