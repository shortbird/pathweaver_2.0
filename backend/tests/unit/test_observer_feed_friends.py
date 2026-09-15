"""A student's feed carries their friends' work, on the peer terms.

Friends phase 2 (2026-09-16). What must stay true:

  * a friend's items arrive with viewer_relationship='peer' and can_share
    False -- seeing a friend's work is not licence to publish it
  * the caller's own items stay 'self'; a linked child's stay 'adult'
  * scope=self drops the friends; scope=friends drops everything else
  * peer comments count into comments_count and reactions ride each item
  * a friends lookup that fails leaves the feed standing
"""

from unittest.mock import MagicMock, patch

import pytest


CALLER_ID = 'test-user-123'
FRIEND_ID = 'a1b2c3d4-3333-4333-8333-333333333333'


class _Chain:
    """A PostgREST builder that honours eq / in_ / is_ against dict rows and
    passes everything else through. The school-label harness ignores
    filters, which is fine with one user row; this test needs two users
    and a `managed_by_parent_id` read that must come back empty."""

    def __init__(self, rows):
        self._rows = list(rows)

    def eq(self, col, val):
        return _Chain([r for r in self._rows if r.get(col) == val])

    def in_(self, col, vals):
        vals = set(vals or [])
        return _Chain([r for r in self._rows if r.get(col) in vals])

    def is_(self, col, val):
        if val == 'null':
            return _Chain([r for r in self._rows if r.get(col) is None])
        return self

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def execute(self):
        return MagicMock(data=self._rows)

    def maybe_single(self):
        return _Single(self._rows[0] if self._rows else None)


class _Single:
    def __init__(self, row):
        self._row = row

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def execute(self):
        return MagicMock(data=self._row)


def _moment(mid, owner, title):
    return {'id': mid, 'user_id': owner, 'title': title, 'description': 'x',
            'pillars': ['stem'], 'created_at': '2026-09-14T10:00:00Z',
            'source_type': 'realtime', 'captured_by_user_id': None,
            'attached_task_id': None, 'is_confidential': False}


def _feed(client, *, scope=None, friends=(FRIEND_ID,), friends_raise=False,
          peer_comment_counts=None, reactions=None):
    rows = {
        'users': [
            {'id': CALLER_ID, 'role': 'student', 'org_role': None, 'email': 's@x',
             'display_name': 'Me', 'first_name': 'Me', 'last_name': 'M',
             'avatar_url': None, 'portfolio_slug': None, 'organization_id': None},
            {'id': FRIEND_ID, 'display_name': 'Ada', 'first_name': 'Ada',
             'last_name': 'Surname', 'avatar_url': None, 'portfolio_slug': None,
             'organization_id': None},
        ],
        'learning_events': [_moment('le-mine', CALLER_ID, 'Mine'),
                            _moment('le-ada', FRIEND_ID, 'Adas')],
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda name: _Chain(rows.get(name, []))

    def peers(_uid):
        if friends_raise:
            raise RuntimeError('db down')
        return list(friends)

    params = {'scope': scope} if scope else {}
    with patch('routes.observer.feed.get_supabase_admin_client', return_value=supabase), \
         patch('utils.storage_urls.sign_in_place'), \
         patch('services.peer_connection_service.active_peer_ids', side_effect=peers), \
         patch('services.peer_connection_service.peer_comment_counts',
               return_value=peer_comment_counts or {}), \
         patch('services.peer_connection_service.reactions_for_feed',
               return_value=reactions or {}):
        resp = client.get('/api/observers/feed', query_string=params,
                          headers={'Authorization': 'Bearer t'})
    assert resp.status_code == 200, resp.get_data(as_text=True)
    return {i['learning_event_id']: i for i in resp.get_json()['items']}


@pytest.mark.unit
class TestFriendsOnTheFeed:
    def test_a_friends_item_is_peer_and_not_shareable(self, client, mock_verify_token):
        items = _feed(client)
        assert set(items) == {'le-mine', 'le-ada'}
        assert items['le-ada']['viewer_relationship'] == 'peer'
        assert items['le-ada']['can_share'] is False
        assert items['le-mine']['viewer_relationship'] == 'self'
        assert items['le-mine']['can_share'] is True

    def test_the_friend_shape_carries_no_surname(self, client, mock_verify_token):
        student = _feed(client)['le-ada']['student']
        assert 'last_name' not in student
        assert student['display_name'] == 'Ada'

    def test_scope_self_drops_the_friends(self, client, mock_verify_token):
        assert set(_feed(client, scope='self')) == {'le-mine'}

    def test_scope_friends_drops_everything_else(self, client, mock_verify_token):
        assert set(_feed(client, scope='friends')) == {'le-ada'}

    def test_peer_comments_and_reactions_ride_each_item(self, client, mock_verify_token):
        items = _feed(client,
                      peer_comment_counts={'le-ada': 2},
                      reactions={'le-ada': {'by_key': {'proud': 1}, 'mine': 'proud'}})
        assert items['le-ada']['comments_count'] == 2
        assert items['le-ada']['reactions'] == {'by_key': {'proud': 1}, 'mine': 'proud'}
        assert items['le-mine']['reactions'] == {'by_key': {}, 'mine': None}

    def test_a_failed_friends_lookup_leaves_the_feed_standing(self, client, mock_verify_token):
        assert set(_feed(client, friends_raise=True)) == {'le-mine'}


@pytest.mark.unit
class TestAFriendsOwnPage:
    def test_filtering_to_a_friend_reads_through_the_peer_grant(self, client, mock_verify_token):
        """mobile /friends/<id> asks for one friend's work; the friend has to
        be resolved even though the request names a student."""
        rows = {
            'users': [
                {'id': CALLER_ID, 'role': 'student', 'org_role': None, 'email': 's@x',
                 'display_name': 'Me', 'first_name': 'Me', 'avatar_url': None,
                 'portfolio_slug': None, 'organization_id': None},
                {'id': FRIEND_ID, 'display_name': 'Ada', 'first_name': 'Ada',
                 'avatar_url': None, 'portfolio_slug': None, 'organization_id': None},
            ],
            'learning_events': [_moment('le-mine', CALLER_ID, 'Mine'),
                                _moment('le-ada', FRIEND_ID, 'Adas')],
        }
        supabase = MagicMock()
        supabase.table.side_effect = lambda name: _Chain(rows.get(name, []))
        with patch('routes.observer.feed.get_supabase_admin_client', return_value=supabase), \
             patch('utils.storage_urls.sign_in_place'), \
             patch('services.peer_connection_service.active_peer_ids', return_value=[FRIEND_ID]), \
             patch('services.peer_connection_service.peer_comment_counts', return_value={}), \
             patch('services.peer_connection_service.reactions_for_feed', return_value={}):
            resp = client.get('/api/observers/feed', query_string={'student_id': FRIEND_ID},
                              headers={'Authorization': 'Bearer t'})
        assert resp.status_code == 200, resp.get_data(as_text=True)
        items = {i['learning_event_id']: i for i in resp.get_json()['items']}
        assert set(items) == {'le-ada'}
        assert items['le-ada']['viewer_relationship'] == 'peer'

    def test_a_stranger_is_still_refused(self, client, mock_verify_token):
        rows = {'users': [{'id': CALLER_ID, 'role': 'student', 'org_role': None, 'email': 's@x'}]}
        supabase = MagicMock()
        supabase.table.side_effect = lambda name: _Chain(rows.get(name, []))
        with patch('routes.observer.feed.get_supabase_admin_client', return_value=supabase), \
             patch('services.peer_connection_service.active_peer_ids', return_value=[]):
            resp = client.get('/api/observers/feed', query_string={'student_id': FRIEND_ID},
                              headers={'Authorization': 'Bearer t'})
        assert resp.status_code == 403
