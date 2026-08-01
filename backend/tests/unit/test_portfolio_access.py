"""Tests for utils.portfolio_access -- who may see student work, who decides.

The behaviours pinned here are the ones that were wrong in production before
2026-08-01, so each test names the failure it prevents rather than just the
branch it covers.
"""

from datetime import date, timedelta
from unittest.mock import Mock, patch

import pytest


# ---------------------------------------------------------------------------
# is_minor -- the fail-closed age check
# ---------------------------------------------------------------------------

def test_missing_dob_is_treated_as_minor():
    """The bug this replaces: date_of_birth is optional at registration, and a
    NULL was read as 'adult'. 267 students of unknown age could publish their
    own records to the open internet with no parent involved."""
    from utils.portfolio_access import is_minor

    assert is_minor({'id': 'u1', 'date_of_birth': None, 'is_dependent': False}) is True
    assert is_minor({'id': 'u1'}) is True


def test_absent_user_row_is_treated_as_minor():
    from utils.portfolio_access import is_minor

    assert is_minor(None) is True
    assert is_minor({}) is True


def test_unparseable_dob_is_treated_as_minor():
    from utils.portfolio_access import is_minor

    assert is_minor({'id': 'u1', 'date_of_birth': 'not-a-date'}) is True


def test_dependent_flag_wins_over_an_adult_birthdate():
    from utils.portfolio_access import is_minor

    adult_dob = (date.today() - timedelta(days=365 * 30)).isoformat()
    assert is_minor({'id': 'u1', 'date_of_birth': adult_dob, 'is_dependent': True}) is True


def test_clear_adult_is_not_a_minor():
    from utils.portfolio_access import is_minor

    adult_dob = (date.today() - timedelta(days=365 * 30)).isoformat()
    assert is_minor({'id': 'u1', 'date_of_birth': adult_dob, 'is_dependent': False}) is False


def test_seventeen_year_old_is_a_minor():
    from utils.portfolio_access import is_minor

    dob = (date.today() - timedelta(days=int(365.25 * 17))).isoformat()
    assert is_minor({'id': 'u1', 'date_of_birth': dob, 'is_dependent': False}) is True


# ---------------------------------------------------------------------------
# can_manage_privacy -- who is allowed to decide
# ---------------------------------------------------------------------------

def _users(rows_by_id):
    """Mock admin client resolving users by id, and returning [] elsewhere."""
    client = Mock()

    def table(name):
        tbl = Mock()

        def select(_cols):
            sel = Mock()

            def eq(col, val):
                chain = Mock()
                if name == 'users' and col == 'id':
                    row = rows_by_id.get(val)
                    data = [row] if row else []
                else:
                    data = []
                chain.limit.return_value.execute.return_value = Mock(data=data)
                chain.execute.return_value = Mock(data=data)
                chain.eq.return_value.execute.return_value = Mock(data=[])
                chain.eq.return_value.limit.return_value.execute.return_value = Mock(data=[])
                return chain

            sel.eq.side_effect = eq
            return sel

        tbl.select.side_effect = select
        return tbl

    client.table.side_effect = table
    return client


def test_minor_cannot_publish_their_own_portfolio():
    """A minor asking to publish must be refused and told who can decide."""
    from utils import portfolio_access

    student = {'id': 's1', 'is_dependent': True, 'date_of_birth': None,
               'role': 'student', 'organization_id': None}
    client = _users({'s1': student})

    with patch.object(portfolio_access, '_admin', return_value=client):
        allowed, reason = portfolio_access.can_manage_privacy('s1', 's1')

    assert allowed is False
    assert 'parent' in (reason or '').lower()


def test_adult_student_controls_their_own_portfolio():
    from utils import portfolio_access

    adult_dob = (date.today() - timedelta(days=365 * 25)).isoformat()
    student = {'id': 's1', 'is_dependent': False, 'date_of_birth': adult_dob,
               'role': 'student', 'organization_id': None}
    client = _users({'s1': student})

    with patch.object(portfolio_access, '_admin', return_value=client):
        allowed, _ = portfolio_access.can_manage_privacy('s1', 's1')

    assert allowed is True


def test_parent_may_manage_their_dependent_child():
    """The gap this closes: a parent previously could not make their own
    child's portfolio private through any supported path."""
    from utils import portfolio_access

    with patch.object(portfolio_access, '_fetch_user') as fetch, \
         patch.object(portfolio_access, 'is_parent_of', return_value=True):
        fetch.side_effect = lambda uid, cols: {
            'p1': {'id': 'p1', 'role': 'parent', 'organization_id': None},
            's1': {'id': 's1', 'organization_id': None},
        }.get(uid)

        allowed, _ = portfolio_access.can_manage_privacy('p1', 's1')

    assert allowed is True


def test_unrelated_adult_may_not_manage_a_student():
    from utils import portfolio_access

    with patch.object(portfolio_access, '_fetch_user') as fetch, \
         patch.object(portfolio_access, 'is_parent_of', return_value=False), \
         patch.object(portfolio_access, 'is_advisor_of', return_value=False):
        fetch.side_effect = lambda uid, cols: {
            'x1': {'id': 'x1', 'role': 'parent', 'organization_id': None},
            's1': {'id': 's1', 'organization_id': None},
        }.get(uid)

        allowed, reason = portfolio_access.can_manage_privacy('x1', 's1')

    assert allowed is False
    assert reason


def test_org_admin_may_manage_a_student_in_their_own_org_only():
    from utils import portfolio_access

    def fetch(uid, cols):
        return {
            'a1': {'id': 'a1', 'role': 'org_managed', 'org_role': 'org_admin',
                   'organization_id': 'org-A'},
            's1': {'id': 's1', 'organization_id': 'org-A'},
            's2': {'id': 's2', 'organization_id': 'org-B'},
        }.get(uid)

    with patch.object(portfolio_access, '_fetch_user', side_effect=fetch), \
         patch.object(portfolio_access, 'is_parent_of', return_value=False):
        same_org, _ = portfolio_access.can_manage_privacy('a1', 's1')
        other_org, _ = portfolio_access.can_manage_privacy('a1', 's2')

    assert same_org is True
    assert other_org is False


def test_superadmin_may_always_manage():
    from utils import portfolio_access

    with patch.object(portfolio_access, '_fetch_user') as fetch:
        fetch.side_effect = lambda uid, cols: {
            'sa': {'id': 'sa', 'role': 'superadmin', 'organization_id': None},
        }.get(uid)

        allowed, _ = portfolio_access.can_manage_privacy('sa', 's1')

    assert allowed is True


# ---------------------------------------------------------------------------
# can_view_portfolio -- relationship reading
# ---------------------------------------------------------------------------

def test_owner_may_view_their_own_portfolio():
    from utils import portfolio_access

    assert portfolio_access.can_view_portfolio('s1', 's1') is True


def test_anonymous_caller_may_not_view():
    from utils import portfolio_access

    assert portfolio_access.can_view_portfolio(None, 's1') is False
    assert portfolio_access.can_view_portfolio('', 's1') is False


@pytest.mark.parametrize('relation', ['is_parent_of', 'is_advisor_of', 'is_observer_of'])
def test_connected_adults_may_view_a_private_portfolio(relation):
    """Without this, private-by-default would cut parents and advisors off
    entirely and push families to publish to everyone just so one person
    could look."""
    from utils import portfolio_access

    patches = {
        'is_parent_of': False, 'is_advisor_of': False, 'is_observer_of': False,
    }
    patches[relation] = True

    with patch.object(portfolio_access, '_fetch_user',
                      return_value={'id': 'v1', 'role': 'parent', 'organization_id': None}), \
         patch.object(portfolio_access, 'is_parent_of', return_value=patches['is_parent_of']), \
         patch.object(portfolio_access, 'is_advisor_of', return_value=patches['is_advisor_of']), \
         patch.object(portfolio_access, 'is_observer_of', return_value=patches['is_observer_of']):
        assert portfolio_access.can_view_portfolio('v1', 's1') is True


def test_stranger_may_not_view_a_private_portfolio():
    """The IDOR this replaces: any signed-in account could read any other
    user's portfolio summary, curated picks and evidence snippets included."""
    from utils import portfolio_access

    with patch.object(portfolio_access, '_fetch_user') as fetch, \
         patch.object(portfolio_access, 'is_parent_of', return_value=False), \
         patch.object(portfolio_access, 'is_advisor_of', return_value=False), \
         patch.object(portfolio_access, 'is_observer_of', return_value=False):
        fetch.side_effect = lambda uid, cols: {
            'x1': {'id': 'x1', 'role': 'student', 'organization_id': None},
            's1': {'id': 's1', 'organization_id': 'org-A'},
        }.get(uid)

        assert portfolio_access.can_view_portfolio('x1', 's1') is False


# ---------------------------------------------------------------------------
# find_approver -- and the honest "nobody"
# ---------------------------------------------------------------------------

def test_no_parent_and_no_org_means_nobody_can_approve():
    """104 platform-only students have no parent at all. The right answer is
    that their work cannot be published -- not a silent success."""
    from utils import portfolio_access

    client = _users({'s1': {'id': 's1', 'managed_by_parent_id': None,
                            'organization_id': None}})

    with patch.object(portfolio_access, '_admin', return_value=client):
        assert portfolio_access.find_approver('s1') is None


def test_managing_parent_is_the_approver():
    from utils import portfolio_access

    def fetch(uid, cols):
        return {
            's1': {'id': 's1', 'managed_by_parent_id': 'p1', 'organization_id': None},
            'p1': {'id': 'p1', 'first_name': 'Dana'},
        }.get(uid)

    with patch.object(portfolio_access, '_fetch_user', side_effect=fetch):
        approver = portfolio_access.find_approver('s1')

    assert approver['user_id'] == 'p1'
    assert approver['kind'] == 'parent'
    assert approver['first_name'] == 'Dana'
