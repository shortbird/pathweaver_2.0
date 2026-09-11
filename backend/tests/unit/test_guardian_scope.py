"""Guard: `?student_id=` on a student-scoped read is a guardian-only door.

The parent's quest screen is now the STUDENT's quest screen, pointed at the
child — one component in the app, one payload shape from the API. That parity
rests entirely on these read routes swapping whose rows they return, so the
swap itself has to be exactly as narrow as the write rules it fronts:

  * a guardian (managed dependent, or an approved parent_student_link) passes,
  * a stranger gets a 403, not a 500 and not somebody's kid's work,
  * an observer gets nothing — `verify_parent_access` lets them read the
    curated parent dashboard, but the quest surface fronts task authoring,
    evidence upload and completion, none of which they may do.
"""

from unittest.mock import MagicMock, patch

import pytest

from utils import guardian_scope
from utils.guardian_scope import GuardianAccessError


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
KID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
STRANGER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'


class _Query:
    """A PostgREST chain that records its .eq() filters and answers once."""

    def __init__(self, rows_for):
        self._rows_for = rows_for
        self.filters = {}

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def in_(self, column, values):
        self.filters[column] = list(values)
        return self

    def limit(self, *_a):
        return self

    def maybe_single(self):
        return self

    def single(self):
        return self

    def execute(self):
        result = MagicMock()
        result.data = self._rows_for(self.filters)
        return result


def _client(*, managed_by=None, link=False, caller_role='parent', first_name='Ada',
            is_dependent=None, household=False):
    """A Supabase double answering every lookup the resolver makes.

    It serves BOTH guardian_scope's own client and the one inside
    portfolio_access.is_parent_of, which guardian_relationship delegates the
    "are these two family?" question to.

    `household` is the third link (household_members): guardian and student in
    one household, the shape the SIS registration funnel writes.
    """
    client = MagicMock()
    if is_dependent is None:
        is_dependent = managed_by is not None

    def users_rows(filters):
        # The users table is read twice: the student's row, then the caller's
        # role. Which one is being asked for is the id in the filter.
        if filters.get('id') == KID:
            return {'first_name': first_name, 'is_dependent': is_dependent,
                    'managed_by_parent_id': managed_by}
        return {'role': caller_role}

    def link_rows(_filters):
        # portfolio_access.is_parent_of reads status; guardian_scope's old
        # inline query filtered on it. Serve a shape that satisfies both.
        return [{'id': 'link-1', 'status': 'approved'}] if link else []

    def household_rows(filters):
        if not household:
            return []
        # is_household_guardian asks twice: the caller's guardian rows, then
        # whether the student is a 'student' member of one of those households.
        if filters.get('relationship') == 'student':
            return [{'household_id': 'house-1'}]
        return [{'household_id': 'house-1', 'relationship': 'guardian'}]

    def rows_for(name):
        if name == 'users':
            return users_rows
        if name == 'household_members':
            return household_rows
        return link_rows

    client.table.side_effect = lambda name: _Query(rows_for(name))
    return client


@pytest.fixture
def admin_client():
    """Patches both clients the relationship answer now flows through."""
    from utils import portfolio_access
    with patch.object(guardian_scope, 'get_supabase_admin_client') as factory, \
            patch.object(portfolio_access, '_admin', side_effect=factory), \
            patch.object(portfolio_access, '_fetch_user') as fetch_user:
        def _student_row(user_id, _cols):
            client = factory.return_value
            if not isinstance(client, MagicMock):
                return None
            return client.table('users').select().eq('id', user_id).maybe_single().execute().data
        fetch_user.side_effect = _student_row
        yield factory


def test_no_student_id_leaves_the_caller_reading_their_own_rows(admin_client):
    """The overwhelmingly common case: a student on their own quest."""
    assert guardian_scope.resolve_student_scope(PARENT, None) == PARENT
    admin_client.assert_not_called()


def test_parent_of_a_managed_dependent_may_read(admin_client):
    admin_client.return_value = _client(managed_by=PARENT)
    assert guardian_scope.resolve_student_scope(PARENT, KID) == KID


def test_approved_link_may_read(admin_client):
    """Hearthwood families: the student keeps their own login and the tie is a
    parent_student_link, not managed_by_parent_id."""
    admin_client.return_value = _client(managed_by=None, link=True)
    assert guardian_scope.resolve_student_scope(PARENT, KID) == KID


def test_stranger_is_refused(admin_client):
    admin_client.return_value = _client(managed_by=None, link=False, caller_role='parent')
    with pytest.raises(GuardianAccessError):
        guardian_scope.resolve_student_scope(STRANGER, KID)


def test_observer_is_refused(admin_client):
    """An observer link is not a guardian link. Nothing here consults
    observer_student_links, so an observer falls through to the refusal."""
    admin_client.return_value = _client(managed_by=None, link=False, caller_role='observer')
    with pytest.raises(GuardianAccessError):
        guardian_scope.resolve_student_scope(STRANGER, KID)


def test_superadmin_may_read(admin_client):
    admin_client.return_value = _client(managed_by=None, link=False, caller_role='superadmin')
    assert guardian_scope.resolve_student_scope(STRANGER, KID) == KID


def test_a_non_uuid_student_id_never_reaches_a_filter(admin_client):
    """The value is interpolated into PostgREST filters downstream; anything
    that is not a UUID is refused before any query runs."""
    with pytest.raises(GuardianAccessError):
        guardian_scope.resolve_student_scope(PARENT, 'not-a-uuid')
    admin_client.assert_not_called()


def test_capabilities_match_the_write_rules_for_a_dependent(admin_client):
    admin_client.return_value = _client(managed_by=PARENT)
    caps = guardian_scope.guardian_capabilities(PARENT, KID)
    assert caps == {
        'student_id': KID,
        'student_name': 'Ada',
        'is_dependent': True,
        'can_add_tasks': True,
        'can_complete_tasks': True,
        'can_remove_tasks': True,
    }


def test_capabilities_for_a_linked_student_allow_adding_only(admin_client):
    """Adding a task only ever offers a student more to do. Completing and
    removing undo work that a student with their own login owns — the same
    line routes/family_quests draws on delete and uncomplete."""
    admin_client.return_value = _client(managed_by=None, link=True)
    caps = guardian_scope.guardian_capabilities(PARENT, KID)
    assert caps['is_dependent'] is False
    assert caps['can_add_tasks'] is True
    assert caps['can_complete_tasks'] is False
    assert caps['can_remove_tasks'] is False


# ── The third link, and the co-guardian (2026-09-10) ─────────────────────────
#
# A family is linked three ways, not two. The SIS registration funnel writes the
# third -- a guardian row in household_members -- and until these landed, a
# guardian who registered that way was refused their own child's quest screen
# while the SIS pages let them pay that child's tuition.

def test_a_household_guardian_may_read(admin_client):
    """No managed_by, no parent_student_link -- just a shared household."""
    admin_client.return_value = _client(managed_by=None, link=False, household=True)
    assert guardian_scope.resolve_student_scope(PARENT, KID) == KID


def test_a_household_guardian_of_a_dependent_gets_the_full_capabilities(admin_client):
    """The second parent is as much a parent as the first.

    is_dependent used to be computed as `managed_by_parent_id == caller`, so
    whichever guardian had clicked "add a child" got the complete and remove
    buttons and the other did not -- on the same child, in the same family.
    """
    admin_client.return_value = _client(managed_by='someone-else', link=False,
                                        household=True, is_dependent=True)
    caps = guardian_scope.guardian_capabilities(PARENT, KID)
    assert caps['is_dependent'] is True
    assert caps['can_complete_tasks'] is True
    assert caps['can_remove_tasks'] is True


def test_a_household_guardian_of_a_teen_still_may_not_complete(admin_client):
    """The dependent line has not moved: work owned by a student with their own
    login is still theirs to complete, whoever the guardian is."""
    admin_client.return_value = _client(managed_by=None, link=False,
                                        household=True, is_dependent=False)
    caps = guardian_scope.guardian_capabilities(PARENT, KID)
    assert caps['is_dependent'] is False
    assert caps['can_add_tasks'] is True
    assert caps['can_complete_tasks'] is False


def test_sharing_no_household_is_still_a_refusal(admin_client):
    admin_client.return_value = _client(managed_by=None, link=False, household=False)
    with pytest.raises(GuardianAccessError):
        guardian_scope.resolve_student_scope(STRANGER, KID)
