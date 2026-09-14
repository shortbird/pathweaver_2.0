"""Guard: `student_id` on a student-scoped route is a guardian-only door.

The parent's quest screen is the STUDENT's quest screen, pointed at the child
— one component in the app, one payload shape from the API. That parity rests
entirely on these routes swapping whose rows they read and write, so the swap
itself has to be exactly as narrow as the relationship gate it shares a
decision with (`utils.auth.relationships.relationship_between`):

  * a guardian (managed dependent, an approved parent_student_link, or a
    shared household) passes,
  * a stranger gets a 403, not a 500 and not somebody's kid's work,
  * an observer gets nothing — `verify_parent_access` lets them read the
    curated parent dashboard, but the working surfaces front task authoring,
    evidence upload and completion, none of which they may do.

Since 2026-09-15 every guardian gets the full capability set. The
`is_dependent` line — complete and remove only on a managed profile — is
gone; a parent may do everything the child can do, whatever the child's age
or login.
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
        self._single = False

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
        self._single = True
        return self

    def single(self):
        self._single = True
        return self

    def execute(self):
        result = MagicMock()
        rows = self._rows_for(self.filters)
        # A plain .execute() (no single) answers a list, the way PostgREST
        # does -- relationships._is_platform_staff reads the caller's row
        # that way and indexes [0].
        if not self._single and isinstance(rows, dict):
            rows = [rows]
        result.data = rows
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
        # The users table is read for the student (name, flag, managed_by --
        # by guardian_scope and by is_parent_of) and for the caller (the
        # platform-staff check). Which one is being asked for is the id in
        # the filter.
        if filters.get('id') == KID:
            return {'first_name': first_name, 'is_dependent': is_dependent,
                    'managed_by_parent_id': managed_by}
        return {'id': filters.get('id'), 'role': caller_role, 'email': None,
                'org_role': None, 'org_roles': None, 'organization_id': None}

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
    """Patches every client the relationship answer flows through: this
    module's own, portfolio_access (is_parent_of), and the one
    relationships._is_platform_staff reaches for from `database`."""
    from utils import portfolio_access
    with patch.object(guardian_scope, 'get_supabase_admin_client') as factory, \
            patch.object(portfolio_access, '_admin', side_effect=factory), \
            patch('database.get_supabase_admin_client', side_effect=factory), \
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


def test_capabilities_for_a_linked_student_are_the_full_set(admin_client):
    """Paige Hanna's case: the child is 12, has his own login, and the tie is
    an approved parent_student_link. Until 2026-09-15 this answered
    can_complete False and can_remove False -- "work owned by a student with
    their own login is theirs to finish" -- and Paige could not mark her son's
    task done from her phone. The owner's rule now: a parent may do everything
    the child can do. `is_dependent` stays in the payload for the "Under 13"
    chip and decides nothing."""
    admin_client.return_value = _client(managed_by=None, link=True)
    caps = guardian_scope.guardian_capabilities(PARENT, KID)
    assert caps['is_dependent'] is False
    assert caps['can_add_tasks'] is True
    assert caps['can_complete_tasks'] is True
    assert caps['can_remove_tasks'] is True


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


def test_a_household_guardian_of_a_teen_may_complete(admin_client):
    """The third link gets the same full set as the other two."""
    admin_client.return_value = _client(managed_by=None, link=False,
                                        household=True, is_dependent=False)
    caps = guardian_scope.guardian_capabilities(PARENT, KID)
    assert caps['is_dependent'] is False
    assert caps['can_add_tasks'] is True
    assert caps['can_complete_tasks'] is True
    assert caps['can_remove_tasks'] is True


def test_sharing_no_household_is_still_a_refusal(admin_client):
    admin_client.return_value = _client(managed_by=None, link=False, household=False)
    with pytest.raises(GuardianAccessError):
        guardian_scope.resolve_student_scope(STRANGER, KID)


# ── One decision, and the disclosure log (2026-09-15) ────────────────────────
#
# guardian_scope used to carry its own superadmin lookup beside the one in
# utils.auth.relationships. Now it asks relationship_between, so the two gates
# cannot drift, and a delegated read is logged the way a URL-gated read is.

def test_the_decision_is_relationship_between(admin_client):
    """Whatever relationship_between says, this module says."""
    from utils.auth import relationships
    admin_client.return_value = _client(managed_by=None, link=False)
    with patch.object(relationships, 'relationship_between', return_value='parent') as gate:
        assert guardian_scope.resolve_student_scope(PARENT, KID) == KID
    gate.assert_called_once_with(PARENT, KID, allow=('self', 'parent'))


def test_a_delegated_read_logs_a_disclosure(admin_client):
    admin_client.return_value = _client(managed_by=None, link=True)
    from utils.auth import relationships
    with patch.object(relationships, 'log_disclosure') as log:
        guardian_scope.resolve_student_scope(PARENT, KID, discloses='progress')
    log.assert_called_once_with(PARENT, KID, 'progress', 'parent')


def test_a_staff_read_is_logged_as_staff_not_as_a_parent(admin_client):
    admin_client.return_value = _client(managed_by=None, link=False, caller_role='superadmin')
    from utils.auth import relationships
    with patch.object(relationships, 'log_disclosure') as log:
        guardian_scope.resolve_student_scope(STRANGER, KID, discloses='progress')
    log.assert_called_once_with(STRANGER, KID, 'progress', None)


def test_reading_your_own_rows_logs_nothing(admin_client):
    from utils.auth import relationships
    with patch.object(relationships, 'log_disclosure') as log:
        assert guardian_scope.resolve_student_scope(PARENT, PARENT, discloses='progress') == PARENT
    log.assert_not_called()


def test_a_read_without_discloses_logs_nothing(admin_client):
    admin_client.return_value = _client(managed_by=None, link=True)
    from utils.auth import relationships
    with patch.object(relationships, 'log_disclosure') as log:
        guardian_scope.resolve_student_scope(PARENT, KID)
    log.assert_not_called()


# ── The request-shaped resolver ──────────────────────────────────────────────

@pytest.fixture
def app():
    from flask import Flask
    return Flask(__name__)


def test_request_scope_reads_the_query_string_first(app, admin_client):
    admin_client.return_value = _client(managed_by=PARENT)
    with app.test_request_context(f'/x?student_id={KID}', method='POST', json={'student_id': STRANGER}):
        scope = guardian_scope.resolve_student_scope_from_request(PARENT)
    assert scope.student_id == KID
    assert scope.caller_id == PARENT
    assert scope.via == 'parent'
    assert scope.delegated is True


def test_request_scope_reads_the_json_body(app, admin_client):
    admin_client.return_value = _client(managed_by=PARENT)
    with app.test_request_context('/x', method='POST', json={'student_id': KID}):
        assert guardian_scope.resolve_student_scope_from_request(PARENT).student_id == KID


def test_request_scope_reads_a_form_field(app, admin_client):
    """The completion route receives a multipart upload."""
    admin_client.return_value = _client(managed_by=PARENT)
    with app.test_request_context('/x', method='POST', data={'student_id': KID}):
        assert guardian_scope.resolve_student_scope_from_request(PARENT).student_id == KID


def test_request_scope_accepts_the_deprecated_alias(app, admin_client):
    """An app that predates the rename still sends acting_as_dependent_id."""
    admin_client.return_value = _client(managed_by=PARENT)
    with app.test_request_context('/x', method='POST', data={'acting_as_dependent_id': KID}):
        assert guardian_scope.resolve_student_scope_from_request(PARENT).student_id == KID


def test_request_scope_without_a_student_is_the_caller_about_themselves(app, admin_client):
    with app.test_request_context('/x', method='POST', json={}):
        scope = guardian_scope.resolve_student_scope_from_request(PARENT)
    assert scope.student_id == PARENT
    assert scope.via == 'self'
    assert scope.delegated is False
    admin_client.assert_not_called()


def test_request_scope_refuses_a_stranger(app, admin_client):
    admin_client.return_value = _client(managed_by=None, link=False)
    with app.test_request_context(f'/x?student_id={KID}'):
        with pytest.raises(GuardianAccessError):
            guardian_scope.resolve_student_scope_from_request(STRANGER)
