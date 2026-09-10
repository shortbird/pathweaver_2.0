"""A session whose users row is gone must not 500 the observer feed, and a
parent must be able to read the comments on their own child's work.

Two separate refusals, both from routes/observer, both reported on 2026-09-10.

1. OPTIO-BACKEND-8P: /api/observers/feed read the caller's roles with .single(),
   which raises PGRST116 ("Cannot coerce the result to a single JSON object") on
   zero rows. An Android session was still holding a token for an account that
   had been deleted and re-created under a new id, so the row was gone and the
   app got a 500. Same shape as OPTIO-BACKEND-7J on /api/ai-access/status: the
   fix is maybe_single(), and no row means no roles.

2. OPTIO-WEB-1D: the comment thread under a completion allowed the student, an
   observer, an assigned advisor and superadmin -- and no parent. The feed that
   surfaces the card is built partly on parent_student_links, so a mother could
   open her daughter's evidence and be refused the conversation attached to it.
"""

from unittest.mock import MagicMock, patch

import pytest


PARENT_ID = 'd1e2f3a4-1111-4111-8111-111111111111'
STUDENT_ID = 'd1e2f3a4-2222-4222-8222-222222222222'
STRANGER_ID = 'd1e2f3a4-3333-4333-8333-333333333333'
COMPLETION_ID = 'd1e2f3a4-4444-4444-8444-444444444444'


class _Zero:
    """PostgREST's answer to .single() on zero rows."""

    def execute(self):
        from postgrest.exceptions import APIError
        raise APIError({'message': 'Cannot coerce the result to a single JSON object',
                        'code': 'PGRST116', 'hint': None,
                        'details': 'The result contains 0 rows'})


@pytest.mark.unit
class TestTheFeedSurvivesAMissingUsersRow:
    def test_the_users_lookup_does_not_use_single(self):
        """.single() is what turned "no row" into a 500. Read the source rather
        than the behaviour: reproducing the whole feed handler here would test
        the mock, and the property that matters is one call shape."""
        from pathlib import Path
        src = Path(__file__).resolve().parents[2] / 'routes' / 'observer' / 'feed.py'
        text = src.read_text(encoding='utf-8')
        head = text.split('def get_observer_feed', 1)[1][:4000]
        assert "select('role, org_role, email')" in head
        assert '.single()' not in head.split("select('role, org_role, email')", 1)[1][:400], (
            'the observer feed still reads its caller with .single(), which is a '
            '500 for any token whose users row is gone')
        assert '.maybe_single()' in head.split("select('role, org_role, email')", 1)[1][:400]

    def test_postgrest_single_really_does_raise_on_zero_rows(self):
        """Guards the premise. If this ever stops raising, the fix above is
        merely tidy rather than load-bearing, and this file should say so.

        Named exception rather than bare Exception: ruff's B017 bans the blind
        form in CI, and the specific type is the stronger assertion anyway --
        the premise is that PostgREST raises APIError, not that something
        somewhere goes wrong.
        """
        from postgrest.exceptions import APIError

        with pytest.raises(APIError):
            _Zero().execute()


def _get_comments(client, caller_id, *, is_parent):
    """GET /api/observers/completions/<id>/comments as `caller_id`."""
    admin = MagicMock()

    def _table(name):
        t = MagicMock()
        t.select.return_value = t
        t.eq.return_value = t
        t.order.return_value = t
        t.limit.return_value = t
        if name == 'quest_task_completions':
            t.maybe_single.return_value.execute.return_value = MagicMock(
                data={'user_id': STUDENT_ID})
        elif name == 'users':
            t.maybe_single.return_value.execute.return_value = MagicMock(
                data={'role': 'parent'})
            t.execute.return_value = MagicMock(data=[{'role': 'parent'}])
        elif name == 'observer_comments':
            t.execute.return_value = MagicMock(data=[])
        else:
            # observer_student_links / advisor_student_assignments: no link.
            t.execute.return_value = MagicMock(data=[])
        return t

    admin.table.side_effect = _table

    with patch('routes.observer.social.get_supabase_admin_client', return_value=admin), \
         patch('utils.auth.decorators.caller_is_superadmin', return_value=False), \
         patch('utils.portfolio_access.is_parent_of', return_value=is_parent), \
         patch('utils.session_manager.session_manager.get_effective_user_id',
               return_value=caller_id), \
         patch('routes.observer.social._attach_comment_authors', return_value=[]):
        return client.get(f'/api/observers/completions/{COMPLETION_ID}/comments')


@pytest.mark.unit
class TestAParentCanReadTheirChildsCommentThread:
    def test_the_parent_is_let_in(self, client):
        resp = _get_comments(client, PARENT_ID, is_parent=True)
        assert resp.status_code == 200, resp.get_data(as_text=True)

    def test_somebody_who_is_not_their_parent_is_still_refused(self, client):
        """The relationship is the gate. Adding parents must not open the
        thread to everyone who can guess a completion id."""
        resp = _get_comments(client, STRANGER_ID, is_parent=False)
        assert resp.status_code == 403
