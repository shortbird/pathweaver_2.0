"""Re-entering /act-as from INSIDE an acting-as session must still work.

The web client re-mints the acting-as token on every page load
(services/actingAsRestore), so this endpoint is normally called by a browser
that is already acting as the child. @require_auth hands the view the EFFECTIVE
user, which in that session is the child -- so the view asked "is this child a
parent?", got no, and answered 403. actingAsRestore reads 403 as "no longer
authorized", clears the session, and the parent lands back in their own account.

Every reload, for every family using act-as: Sentry OPTIO-WEB-3, 80 reports
across 45 people between 2026-09-01 and 2026-09-10.

The relationship gate above the view never had this problem -- it resolves the
caller with authorizing_user_id(), which sees past an acting-as session to the
parent. That is why the gate PASSED and the body failed, and why the fix is to
make the body ask the same question the gate did.
"""

from unittest.mock import MagicMock, patch

import pytest

from utils.session_manager import session_manager


# Real v4 shapes: validate_uuid_param checks the version and variant nibbles.
PARENT_ID = 'c1d2e3f4-1111-4111-8111-111111111111'
CHILD_ID = 'c1d2e3f4-2222-4222-8222-222222222222'

IPHONE = ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
          'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')


def _act_as(client, *, effective_user, authorizing_user, parents=(PARENT_ID,)):
    """POST /api/dependents/<child>/act-as.

    `effective_user` is who @require_auth resolves (the CHILD once the session
    is established); `authorizing_user` is who authorizing_user_id() resolves
    (always the parent behind the session).

    verify_parent_role refuses anybody outside `parents`, exactly as it does in
    production -- a child holds no parent role anywhere, so a stub that accepts
    every id would let the original bug pass these tests.
    """
    repo = MagicMock()
    repo.get_dependent.return_value = {'id': CHILD_ID, 'display_name': 'Robin'}

    seen = {}

    def _verify_parent_role(user_id, check_relationships=False):
        seen['verified'] = user_id
        if user_id not in parents:
            from middleware.error_handler import AuthorizationError
            raise AuthorizationError('Only parent accounts can manage dependent profiles')
        return True

    def _mint(parent_id, dependent_id):
        seen.setdefault('minted', []).append((parent_id, dependent_id))
        return 'a-token'

    with patch('routes.dependents_acting_as.get_supabase_admin_client', return_value=MagicMock()), \
         patch('routes.dependents_acting_as.DependentRepository', return_value=repo), \
         patch('routes.dependents.verify_parent_role', _verify_parent_role), \
         patch('routes.dependents_acting_as.authorizing_user_id', return_value=authorizing_user), \
         patch('utils.auth.relationships.authorizing_user_id', return_value=authorizing_user), \
         patch('utils.portfolio_access.is_parent_of', return_value=True), \
         patch.object(session_manager, 'get_effective_user_id', return_value=effective_user), \
         patch.object(session_manager, 'get_current_user_id', return_value=authorizing_user), \
         patch.object(session_manager, 'generate_acting_as_token', _mint), \
         patch.object(session_manager, 'generate_acting_as_refresh_token',
                      lambda p, d: 'a-refresh'):
        resp = client.post(f'/api/dependents/{CHILD_ID}/act-as', json={},
                           headers={'User-Agent': IPHONE})
    return resp, seen, repo


@pytest.mark.unit
class TestReEntryFromInsideTheSession:
    def test_a_reload_while_acting_as_does_not_403(self, client):
        """THE ONE THAT MATTERS. Effective user is the CHILD, because the
        acting-as credential is already installed."""
        resp, _, _ = _act_as(client, effective_user=CHILD_ID, authorizing_user=PARENT_ID)
        assert resp.status_code == 200, resp.get_data(as_text=True)

    def test_the_parent_role_check_is_asked_about_the_parent(self, client):
        """Asking it about the child is the bug itself -- a child is not a
        parent, so the answer is always no."""
        _, seen, _ = _act_as(client, effective_user=CHILD_ID, authorizing_user=PARENT_ID)
        assert seen['verified'] == PARENT_ID

    def test_ownership_is_checked_against_the_parent(self, client):
        """get_dependent(child, parent) is the ownership check. Passing the
        child as the owner would compare managed_by_parent_id to the child's
        own id and refuse a parent who does own them."""
        _, _, repo = _act_as(client, effective_user=CHILD_ID, authorizing_user=PARENT_ID)
        repo.get_dependent.assert_called_once_with(CHILD_ID, PARENT_ID)

    def test_the_minted_token_names_the_parent_as_the_actor(self, client):
        """Worse than the 403 would have been a token naming the child as its
        own guardian: stop-acting-as resolves the way back from this claim."""
        _, seen, _ = _act_as(client, effective_user=CHILD_ID, authorizing_user=PARENT_ID)
        assert seen['minted'] == [(PARENT_ID, CHILD_ID)]


@pytest.mark.unit
class TestTheFirstEntryStillWorks:
    def test_a_parent_not_yet_acting_as_anybody(self, client):
        """Outside an acting-as session both resolvers agree on the parent."""
        resp, seen, _ = _act_as(client, effective_user=PARENT_ID, authorizing_user=PARENT_ID)
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert seen['verified'] == PARENT_ID


@pytest.mark.unit
class TestTheGateIsStillClosed:
    def test_a_caller_who_is_no_parent_is_still_refused(self, client):
        """The fix moves WHICH id is checked, not whether it is checked."""
        resp, _, _ = _act_as(client, effective_user=CHILD_ID, authorizing_user=PARENT_ID,
                             parents=())
        assert resp.status_code == 403
