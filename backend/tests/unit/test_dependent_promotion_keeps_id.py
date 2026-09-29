"""Promoting a dependent to their own account keeps their id.

Ticket 4c26966c: "Promoting a child to their own account changes the account ID
and orphans their data." DependentRepository.promote_dependent_to_independent
created a NEW Supabase auth user and then rewrote users.id to the new auth id.
Every row keyed to the child's old id -- tasks, evidence, XP, enrollments,
roughly 40 tables -- was left pointing at nothing, and the placeholder auth user
create_dependent had made was left behind.

The fix hands the child's EXISTING auth user a real email and password
(update_user_by_id), never touches users.id, and writes an approved
parent_student_links row so the promoting parent still sees the child in their
family view once managed_by_parent_id is cleared (owner decision).

There were no unit tests of this method before; the integration tests in
tests/integration/test_dependents.py only cover refusals at the route layer and
still hold unchanged.
"""

from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest

from repositories.base_repository import PermissionError, ValidationError
from repositories.dependent_repository import DependentRepository


DEPENDENT_ID = '11111111-1111-4111-8111-111111111111'
PARENT_ID = '22222222-2222-4222-8222-222222222222'
EMAIL = 'grown.up@example.com'
PASSWORD = 'StrongP@ssw0rd123!'


class FakeQuery:
    def __init__(self, db, table):
        self.db, self.table, self.op, self.payload, self.filters = db, table, 'select', None, []

    def select(self, *_a, **_k):
        self.op = 'select'
        return self

    def insert(self, payload):
        self.op, self.payload = 'insert', payload
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        return self

    def eq(self, col, val):
        self.filters.append((col, val))
        return self

    def execute(self):
        return self.db.run(self)


class FakeDB:
    """Records every write; answers reads from `in_use_email` and `links`."""

    def __init__(self, in_use_email=False, links=None, fail_users_update=False):
        self.in_use_email = in_use_email
        self.links = list(links or [])
        self.fail_users_update = fail_users_update
        self.writes = []  # (table, op, payload, filters)
        self.auth = MagicMock()

    def table(self, name):
        return FakeQuery(self, name)

    def run(self, q):
        result = MagicMock()
        if q.op == 'select':
            if q.table == 'users':
                result.data = [{'id': 'someone-else'}] if self.in_use_email else []
            elif q.table == 'parent_student_links':
                result.data = [dict(l) for l in self.links]
            else:
                result.data = []
            return result
        self.writes.append((q.table, q.op, q.payload, list(q.filters)))
        if q.table == 'users' and q.op == 'update':
            if self.fail_users_update:
                raise RuntimeError('db down')
            result.data = [{'id': DEPENDENT_ID, **q.payload}]
        elif q.table == 'parent_student_links' and q.op == 'insert':
            self.links.append({'id': 'link-1', **q.payload})
            result.data = [q.payload]
        else:
            result.data = [q.payload]
        return result

    def users_writes(self):
        return [w for w in self.writes if w[0] == 'users']


def _dependent(eligible=True):
    eligible_at = date.today() - timedelta(days=1) if eligible else date.today() + timedelta(days=30)
    return {
        'id': DEPENDENT_ID,
        'display_name': 'Sam Rose',
        'is_dependent': True,
        'managed_by_parent_id': PARENT_ID,
        'email': None,
        'promotion_eligible_at': eligible_at.isoformat(),
    }


def _promote(db, eligible=True):
    repo = DependentRepository(client=db)
    with patch.object(repo, 'get_dependent', return_value=_dependent(eligible)):
        return repo.promote_dependent_to_independent(DEPENDENT_ID, PARENT_ID, EMAIL, PASSWORD)


def test_promotion_keeps_the_id_ticket_4c26966c():
    """Ticket 4c26966c: promoting a child to their own account changed the
    account ID and orphaned their data. The existing auth user gets the
    credentials; users.id is never written; no second auth user is made."""
    db = FakeDB()

    result = _promote(db)

    assert result['id'] == DEPENDENT_ID
    db.auth.admin.update_user_by_id.assert_called_once()
    uid, attrs = db.auth.admin.update_user_by_id.call_args.args
    assert uid == DEPENDENT_ID
    assert attrs['email'] == EMAIL
    assert attrs['password'] == PASSWORD
    assert attrs['email_confirm'] is True
    assert attrs['user_metadata']['promoted_from_dependent'] is True
    assert 'promoted_at' in attrs['user_metadata']
    db.auth.admin.create_user.assert_not_called()

    [(table, op, payload, filters)] = db.users_writes()
    assert op == 'update'
    assert 'id' not in payload
    assert payload == {'email': EMAIL, 'is_dependent': False, 'managed_by_parent_id': None}
    assert filters == [('id', DEPENDENT_ID)]


def test_the_promoting_parent_keeps_the_child_through_an_approved_link():
    db = FakeDB()

    _promote(db)

    inserts = [w for w in db.writes if w[0] == 'parent_student_links' and w[1] == 'insert']
    assert len(inserts) == 1
    payload = inserts[0][2]
    assert payload['parent_user_id'] == PARENT_ID
    assert payload['student_user_id'] == DEPENDENT_ID
    assert payload['status'] == 'approved'
    # Nothing touches household_members: a shared household stays as it was.
    assert not [w for w in db.writes if w[0] == 'household_members']


def test_an_existing_approved_link_is_left_alone():
    db = FakeDB(links=[{'id': 'link-1', 'status': 'approved'}])

    _promote(db)

    assert not [w for w in db.writes if w[0] == 'parent_student_links']


def test_a_stale_pending_link_is_raised_to_approved_not_duplicated():
    db = FakeDB(links=[{'id': 'link-1', 'status': 'pending_approval'}])

    _promote(db)

    link_writes = [w for w in db.writes if w[0] == 'parent_student_links']
    assert link_writes == [('parent_student_links', 'update', {'status': 'approved'}, [('id', 'link-1')])]


def test_the_link_is_written_before_the_parent_is_unset():
    """If the link write came after users lost managed_by_parent_id, a failure
    between the two would leave the parent unable to see their child."""
    db = FakeDB()

    _promote(db)

    order = [(w[0], w[1]) for w in db.writes]
    assert order.index(('parent_student_links', 'insert')) < order.index(('users', 'update'))


def test_a_failed_auth_update_leaves_the_users_row_untouched():
    db = FakeDB()
    db.auth.admin.update_user_by_id.side_effect = RuntimeError('gotrue unavailable')

    with pytest.raises(ValidationError):
        _promote(db)

    assert db.writes == []
    db.auth.admin.create_user.assert_not_called()


def test_an_address_held_only_in_auth_is_refused_as_in_use():
    db = FakeDB()
    db.auth.admin.update_user_by_id.side_effect = RuntimeError(
        'A user with this email address has already been registered')

    with pytest.raises(ValidationError, match='already in use'):
        _promote(db)

    assert db.writes == []


def test_a_missing_auth_user_is_created_with_the_same_id():
    """No production dependent lacks an auth user (238 of 238 on 2026-09-29),
    but if one did, the new auth user must take the profile's id."""
    db = FakeDB()
    missing = RuntimeError('User not found')
    missing.status = 404
    db.auth.admin.update_user_by_id.side_effect = missing
    db.auth.admin.create_user.return_value = MagicMock(user=MagicMock(id=DEPENDENT_ID))

    result = _promote(db)

    assert result['id'] == DEPENDENT_ID
    created = db.auth.admin.create_user.call_args.args[0]
    assert created['id'] == DEPENDENT_ID
    assert created['email'] == EMAIL
    assert 'id' not in db.users_writes()[0][2]


def test_not_yet_eligible_is_refused_with_nothing_written():
    db = FakeDB()

    with pytest.raises(PermissionError, match='not yet eligible'):
        _promote(db, eligible=False)

    assert db.writes == []
    db.auth.admin.update_user_by_id.assert_not_called()
    db.auth.admin.create_user.assert_not_called()


def test_an_email_already_on_a_profile_is_refused_with_nothing_written():
    db = FakeDB(in_use_email=True)

    with pytest.raises(ValidationError, match='already in use'):
        _promote(db)

    assert db.writes == []
    db.auth.admin.update_user_by_id.assert_not_called()
    db.auth.admin.create_user.assert_not_called()
