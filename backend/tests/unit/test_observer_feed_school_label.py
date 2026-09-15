"""The global feed tells platform staff which school a card belongs to, and
tells nobody else.

Superadmin moderates a feed that spans every org, and a card with only a
first name gives no clue where it came from. So each feed item's `student`
carries `organization: {id, name}` -- for platform staff only. A parent or
advisor reads the same endpoint, and the field must be absent for them:
"which school is that kid at" is not a family's business.
"""

from unittest.mock import MagicMock, patch

import pytest


CALLER_ID = 'test-user-123'
STUDENT_ID = 'a1b2c3d4-1111-4111-8111-111111111111'
ORG_ID = 'a1b2c3d4-2222-4222-8222-222222222222'


class _Chain:
    """Every PostgREST builder method returns the same chain; execute() answers
    with the rows handed in. maybe_single() answers with the first row."""

    def __init__(self, rows):
        self._rows = rows

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def execute(self):
        return MagicMock(data=self._rows)

    def maybe_single(self):
        return _Chain(self._rows[0] if self._rows else None)


def _feed_for(client, caller_role, *, email='someone@example.com'):
    """GET /api/observers/feed as a caller with `caller_role`, over a database
    holding one learning moment by one org student."""
    rows = {
        'users': [{
            # The role lookup and the students lookup both read this table;
            # a single row wearing both hats keeps the mock honest enough.
            'id': STUDENT_ID, 'role': caller_role, 'org_role': None, 'email': email,
            'display_name': 'Sam', 'first_name': 'Sam', 'last_name': 'H',
            'avatar_url': None, 'portfolio_slug': None, 'organization_id': ORG_ID,
        }],
        'organizations': [{'id': ORG_ID, 'name': 'Hearthwood Academy'}],
        'learning_events': [{
            'id': 'le-1', 'user_id': STUDENT_ID, 'title': 'Built a bridge',
            'description': 'Out of popsicle sticks', 'pillars': ['stem'],
            'created_at': '2026-09-14T10:00:00Z', 'source_type': 'realtime',
            'captured_by_user_id': None, 'attached_task_id': None,
        }],
        # A parent or advisor reaches the student through these links.
        'parent_student_links': [{'student_user_id': STUDENT_ID}],
        'observer_student_links': [{'student_id': STUDENT_ID, 'can_view_evidence': True}],
        'advisor_student_assignments': [{'student_id': STUDENT_ID}],
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda name: _Chain(rows.get(name, []))

    with patch('routes.observer.feed.get_supabase_admin_client', return_value=supabase), \
         patch('routes.observer.feed.sign_in_place', create=True), \
         patch('utils.storage_urls.sign_in_place'):
        resp = client.get('/api/observers/feed', headers={'Authorization': 'Bearer t'})
    assert resp.status_code == 200, resp.get_data(as_text=True)
    items = resp.get_json()['items']
    assert len(items) == 1, items
    return items[0]


@pytest.mark.unit
class TestTheSchoolOnAFeedCard:
    def test_superadmin_sees_the_school(self, client, mock_verify_token):
        item = _feed_for(client, 'superadmin')
        assert item['student']['organization'] == {'id': ORG_ID, 'name': 'Hearthwood Academy'}

    def test_a_parent_does_not(self, client, mock_verify_token):
        item = _feed_for(client, 'parent')
        assert item['student']['organization'] is None

    def test_an_advisor_does_not(self, client, mock_verify_token):
        item = _feed_for(client, 'advisor')
        assert item['student']['organization'] is None
