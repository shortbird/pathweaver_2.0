"""Acting as a child: the grant and the per-request re-check must agree.

Two gates decide whether a parent may work as their child:

    DependentRepository.get_dependent      once, when the token is minted
    token_authority.is_acting_as_still_authorized   on every request after

They are a pair. A re-check stricter than the grant hands out a token that dies
on its first use -- the banner appears, the page loads, and the next click logs
you out. So when get_dependent widened from "the managing parent" to "any
guardian" (2026-09-10, to include household guardians and the second parent of
a shared child), the re-check had to widen with it, and these tests exist to
keep them moving together.

What did NOT widen: `is_dependent`. A student with their own login is never
impersonable, by any guardian, and both gates still refuse that outright.
"""

from unittest.mock import Mock, patch

import pytest

from repositories.base_repository import PermissionError as RepoPermissionError
from repositories.dependent_repository import DependentRepository
from utils import token_authority

OWNER = 'owner-parent'
CO_GUARDIAN = 'co-guardian'
STRANGER = 'stranger'
KID = 'kid-1'


def _repo(row):
    """A DependentRepository whose users read answers with `row`."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'single', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=row)
    return DependentRepository(client=client)


def _authority(row):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[row] if row else [])
    return client


DEPENDENT = {'id': KID, 'is_dependent': True, 'managed_by_parent_id': OWNER}
TEEN = {'id': KID, 'is_dependent': False, 'managed_by_parent_id': None}


@pytest.mark.unit
class TestTheGrant:
    def test_the_managing_parent_may_act(self):
        assert _repo(DEPENDENT).get_dependent(KID, OWNER)['id'] == KID

    def test_a_co_guardian_may_act(self):
        """The second parent of the same child. Before this, whichever guardian
        had clicked "add a child" could act as them and the other could not."""
        with patch('utils.portfolio_access.is_parent_of', return_value=True):
            assert _repo(DEPENDENT).get_dependent(KID, CO_GUARDIAN)['id'] == KID

    def test_a_stranger_may_not(self):
        with patch('utils.portfolio_access.is_parent_of', return_value=False):
            with pytest.raises(RepoPermissionError):
                _repo(DEPENDENT).get_dependent(KID, STRANGER)

    def test_the_relationship_is_only_asked_when_ownership_fails(self):
        with patch('utils.portfolio_access.is_parent_of') as gate:
            _repo(DEPENDENT).get_dependent(KID, OWNER)
        gate.assert_not_called()


@pytest.mark.unit
class TestOwnerOnly:
    """Delete, promote and add-login are not "acting for the child" -- they end
    or hand over the account. They stay with the guardian who created it."""

    def test_a_co_guardian_is_refused(self):
        with patch('utils.portfolio_access.is_parent_of', return_value=True):
            with pytest.raises(RepoPermissionError):
                _repo(DEPENDENT).get_dependent(KID, CO_GUARDIAN, owner_only=True)

    def test_the_owner_is_still_allowed(self):
        assert _repo(DEPENDENT).get_dependent(KID, OWNER, owner_only=True)['id'] == KID


@pytest.mark.unit
class TestTheRecheck:
    def test_it_accepts_the_managing_parent(self):
        with patch.object(token_authority, '_admin', return_value=_authority(DEPENDENT)):
            assert token_authority.is_acting_as_still_authorized(OWNER, KID) is True

    def test_it_accepts_a_co_guardian(self):
        """The half that would otherwise kill the token on the next request."""
        with patch.object(token_authority, '_admin', return_value=_authority(DEPENDENT)), \
                patch('utils.portfolio_access.is_parent_of', return_value=True):
            assert token_authority.is_acting_as_still_authorized(CO_GUARDIAN, KID) is True

    def test_it_refuses_a_stranger(self):
        with patch.object(token_authority, '_admin', return_value=_authority(DEPENDENT)), \
                patch('utils.portfolio_access.is_parent_of', return_value=False):
            assert token_authority.is_acting_as_still_authorized(STRANGER, KID) is False

    def test_it_refuses_a_student_with_their_own_login(self):
        """The line that did not move. Checked before the relationship, so no
        widening of "who is a guardian" can ever reach past it."""
        with patch.object(token_authority, '_admin', return_value=_authority(TEEN)), \
                patch('utils.portfolio_access.is_parent_of', return_value=True) as gate:
            assert token_authority.is_acting_as_still_authorized(CO_GUARDIAN, KID) is False
        gate.assert_not_called()

    def test_it_fails_closed_when_the_lookup_raises(self):
        client = _authority(DEPENDENT)
        client.table.return_value.execute.side_effect = RuntimeError('boom')
        with patch.object(token_authority, '_admin', return_value=client):
            assert token_authority.is_acting_as_still_authorized(OWNER, KID) is False

    def test_it_fails_closed_when_the_guardian_check_raises(self):
        with patch.object(token_authority, '_admin', return_value=_authority(DEPENDENT)), \
                patch('utils.portfolio_access.is_parent_of',
                      side_effect=RuntimeError('boom')):
            assert token_authority.is_acting_as_still_authorized(CO_GUARDIAN, KID) is False

    def test_it_refuses_a_missing_user(self):
        with patch.object(token_authority, '_admin', return_value=_authority(None)):
            assert token_authority.is_acting_as_still_authorized(OWNER, KID) is False


@pytest.mark.unit
class TestTheTwoGatesAgree:
    """The property that matters, stated directly: anyone the grant admits, the
    re-check must admit too."""

    @pytest.mark.parametrize('caller,related', [
        (OWNER, False),        # ownership alone, no relationship lookup needed
        (CO_GUARDIAN, True),   # guardian by one of the other two links
    ])
    def test_whoever_may_be_granted_may_keep_going(self, caller, related):
        with patch('utils.portfolio_access.is_parent_of', return_value=related):
            granted = _repo(DEPENDENT).get_dependent(KID, caller)
        assert granted['id'] == KID

        with patch.object(token_authority, '_admin', return_value=_authority(DEPENDENT)), \
                patch('utils.portfolio_access.is_parent_of', return_value=related):
            assert token_authority.is_acting_as_still_authorized(caller, KID) is True

    def test_whoever_is_refused_the_grant_is_refused_the_recheck(self):
        with patch('utils.portfolio_access.is_parent_of', return_value=False):
            with pytest.raises(RepoPermissionError):
                _repo(DEPENDENT).get_dependent(KID, STRANGER)

        with patch.object(token_authority, '_admin', return_value=_authority(DEPENDENT)), \
                patch('utils.portfolio_access.is_parent_of', return_value=False):
            assert token_authority.is_acting_as_still_authorized(STRANGER, KID) is False
