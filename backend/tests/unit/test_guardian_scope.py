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


def _client(*, managed_by=None, link=False, caller_role='parent', first_name='Ada'):
    """A Supabase double answering the three lookups the resolver makes."""
    client = MagicMock()

    def users_rows(filters):
        # The users table is read twice: the student's row, then the caller's
        # role. Which one is being asked for is the id in the filter.
        if filters.get('id') == KID:
            return {'first_name': first_name, 'managed_by_parent_id': managed_by}
        return {'role': caller_role}

    def link_rows(_filters):
        return [{'id': 'link-1'}] if link else []

    client.table.side_effect = lambda name: _Query(
        users_rows if name == 'users' else link_rows
    )
    return client


@pytest.fixture
def admin_client():
    with patch.object(guardian_scope, 'get_supabase_admin_client') as factory:
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
