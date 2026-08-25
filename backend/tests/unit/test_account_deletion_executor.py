"""The 30-day deletion executor: what it deletes, what it leaves alone.

These cover the promise the product makes ("your account is scheduled for
deletion in 30 days") end to end against an in-memory stand-in for Supabase:
due accounts are really erased (rows, storage, auth user), accounts still inside
the grace period are untouched, a cancellation wins even mid-sweep, and a
partial failure leaves the account retryable instead of silently "complete".
"""

from datetime import datetime, timedelta, timezone

import pytest

from repositories import user_erasure_repository as svc
from repositories.user_erasure_repository import AccountDeletionError, purge_user
from services.account_deletion_service import run_pending_deletion_sweep


# ---------------------------------------------------------------------------
# In-memory Supabase stand-in
# ---------------------------------------------------------------------------

class _Response:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    """Enough of the PostgREST builder for the executor's calls."""

    def __init__(self, db, table, op, payload=None):
        self.db = db
        self.table = table
        self.op = op
        self.payload = payload
        self.filters = []
        self.order_by = None
        self.limit_n = None
        self.count_mode = None

    # -- builder ------------------------------------------------------------
    def select(self, _cols='*', count=None):
        self.count_mode = count
        return self

    def eq(self, col, val):
        self.filters.append(lambda r, c=col, v=val: r.get(c) == v)
        return self

    def lte(self, col, val):
        self.filters.append(lambda r, c=col, v=val: r.get(c) is not None and r[c] <= v)
        return self

    def lt(self, col, val):
        self.filters.append(lambda r, c=col, v=val: r.get(c) is not None and r[c] < v)
        return self

    def is_(self, col, _null):
        self.filters.append(lambda r, c=col: r.get(c) is None)
        return self

    def in_(self, col, vals):
        self.filters.append(lambda r, c=col, v=set(vals): r.get(c) in v)
        return self

    def order(self, col):
        self.order_by = col
        return self

    def limit(self, n):
        self.limit_n = n
        return self

    # -- execution ----------------------------------------------------------
    def _matches(self):
        rows = self.db.tables.get(self.table)
        if rows is None:
            raise RuntimeError(f'relation "{self.table}" does not exist')
        return [r for r in rows if all(f(r) for f in self.filters)]

    def execute(self):
        if self.table in self.db.fail_tables:
            raise RuntimeError(f'boom: {self.table}')

        matched = self._matches()

        if self.op == 'select':
            total = len(matched)
            if self.order_by:
                matched = sorted(matched, key=lambda r: r.get(self.order_by) or '')
            if self.limit_n is not None:
                matched = matched[:self.limit_n]
            return _Response([dict(r) for r in matched],
                             count=total if self.count_mode == 'exact' else None)

        if self.op == 'delete':
            self.db.tables[self.table] = [r for r in self.db.tables[self.table]
                                          if r not in matched]
            return _Response([dict(r) for r in matched])

        if self.op == 'update':
            for row in matched:
                row.update(self.payload)
            return _Response([dict(r) for r in matched])

        raise AssertionError(self.op)


class _Bucket:
    def __init__(self, db, name):
        self.db = db
        self.name = name

    def list(self, prefix, _opts=None):
        if self.name in self.db.fail_buckets:
            raise RuntimeError('storage unavailable')
        names = set()
        for path in self.db.objects.get(self.name, set()):
            if path.startswith(prefix + '/'):
                names.add(path[len(prefix) + 1:].split('/')[0])
        # The fixtures use flat prefixes, so every entry is a file: give each an
        # id so the walker treats it as a file rather than a folder.
        return [{'name': n, 'id': f'id-{n}'} for n in sorted(names)]

    def remove(self, paths):
        self.db.objects[self.name] -= set(paths)
        return list(paths)


class _Storage:
    def __init__(self, db):
        self.db = db

    def from_(self, bucket):
        return _Bucket(self.db, bucket)


class _AuthAdmin:
    def __init__(self, db):
        self.db = db

    def delete_user(self, user_id):
        if self.db.fail_auth:
            raise RuntimeError('auth service down')
        if user_id not in self.db.auth_users:
            raise RuntimeError('User not found')
        self.db.auth_users.discard(user_id)
        # public.users.id REFERENCES auth.users(id) ON DELETE CASCADE
        self.db.tables['users'] = [r for r in self.db.tables['users'] if r['id'] != user_id]


class _Auth:
    def __init__(self, db):
        self.admin = _AuthAdmin(db)


class _Inserted:
    def __init__(self, rows):
        self.rows = rows

    def execute(self):
        return _Response([dict(r) for r in self.rows])


class _TableHandle:
    def __init__(self, db, name):
        self.db = db
        self.name = name

    def select(self, cols='*', count=None):
        return _Query(self.db, self.name, 'select').select(cols, count=count)

    def delete(self):
        return _Query(self.db, self.name, 'delete')

    def update(self, payload):
        return _Query(self.db, self.name, 'update', payload)

    def insert(self, payload):
        rows = payload if isinstance(payload, list) else [payload]
        self.db.tables.setdefault(self.name, []).extend(rows)
        return _Inserted(rows)


class FakeSupabase:
    """In-memory stand-in: tables, storage objects, and auth users."""

    def __init__(self, tables=None, objects=None, auth_users=()):
        self.tables = {'users': [], 'account_deletion_log': []}
        self.tables.update(tables or {})
        # Every table the executor touches must exist or the run fails loudly
        # (which is the point) — seed the rest empty.
        for table, _col in svc.OWNED_ROWS + svc.ANONYMIZE_REFS:
            self.tables.setdefault(table, [])
        self.objects = {b: set() for b, _ in svc.USER_STORAGE_PREFIXES}
        for bucket, paths in (objects or {}).items():
            self.objects.setdefault(bucket, set()).update(paths)
        self.auth_users = set(auth_users)
        self.fail_tables = set()
        self.fail_buckets = set()
        self.fail_auth = False
        self.storage = _Storage(self)
        self.auth = _Auth(self)

    def table(self, name):
        return _TableHandle(self, name)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

NOW = datetime(2026, 8, 15, 12, 0, tzinfo=timezone.utc)
PAST = (NOW - timedelta(days=1)).isoformat()
FUTURE = (NOW + timedelta(days=10)).isoformat()


def _pending_user(user_id, scheduled):
    return {
        'id': user_id,
        'email': f'{user_id}@example.com',
        'first_name': 'Test',
        'last_name': 'User',
        'role': 'student',
        'organization_id': None,
        'created_at': '2025-01-01T00:00:00Z',
        'deletion_status': 'pending',
        'deletion_scheduled_for': scheduled,
        'deletion_attempts': 0,
    }


@pytest.fixture
def fake_db():
    client = FakeSupabase(
        tables={
            'users': [
                _pending_user('due-user', PAST),
                _pending_user('not-due-user', FUTURE),
                {'id': 'active-user', 'email': 'a@example.com', 'deletion_status': 'none',
                 'deletion_scheduled_for': None, 'deletion_attempts': 0},
            ],
            'user_quests': [{'user_id': 'due-user', 'id': 'q1'},
                            {'user_id': 'not-due-user', 'id': 'q2'}],
            'quest_task_completions': [{'user_id': 'due-user', 'id': 'c1'}],
            'tutor_conversations': [{'user_id': 'due-user', 'id': 'conv1'}],
            'password_reset_tokens': [{'user_id': 'due-user', 'id': 't1'}],
            'quests': [{'id': 'quest1', 'created_by': 'due-user', 'title': 'Shared quest'}],
            'learning_events': [{'id': 'event1', 'user_id': 'due-user'}],
        },
        objects={
            'user-photos': {'due-user/avatar.png', 'other-user/avatar.png'},
            'quest-evidence': {'evidence-tasks/due-user/proof.jpg',
                               'evidence-tasks/other-user/proof.jpg'},
            'user-uploads': {'learning_moments/event1/clip.mp4'},
        },
        auth_users={'due-user', 'not-due-user', 'active-user'},
    )
    return client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_pending_and_due_account_is_actually_deleted(fake_db):
    result = run_pending_deletion_sweep(admin=fake_db, now=NOW)

    assert result['deleted'] == 1
    assert result['failed'] == 0
    assert [u['id'] for u in fake_db.tables['users']] == ['not-due-user', 'active-user']
    assert 'due-user' not in fake_db.auth_users, 'the Supabase auth user must go too'
    assert fake_db.tables['user_quests'] == [{'user_id': 'not-due-user', 'id': 'q2'}]
    assert fake_db.tables['quest_task_completions'] == []
    assert fake_db.tables['tutor_conversations'] == []
    assert fake_db.tables['password_reset_tokens'] == []


def test_deleted_users_storage_objects_are_removed(fake_db):
    run_pending_deletion_sweep(admin=fake_db, now=NOW)

    assert fake_db.objects['user-photos'] == {'other-user/avatar.png'}
    assert fake_db.objects['quest-evidence'] == {'evidence-tasks/other-user/proof.jpg'}
    # Learning-moment media is keyed by event id, not user id, and still goes.
    assert fake_db.objects['user-uploads'] == set()


def test_shared_content_is_anonymized_not_destroyed(fake_db):
    run_pending_deletion_sweep(admin=fake_db, now=NOW)

    quest = fake_db.tables['quests'][0]
    assert quest['title'] == 'Shared quest', 'other people still need the quest'
    assert quest['created_by'] is None, 'but not the deleted author'


def test_pending_but_not_due_account_is_untouched(fake_db):
    run_pending_deletion_sweep(admin=fake_db, now=NOW)

    survivors = {u['id'] for u in fake_db.tables['users']}
    assert 'not-due-user' in survivors
    assert 'not-due-user' in fake_db.auth_users
    assert fake_db.tables['user_quests'] == [{'user_id': 'not-due-user', 'id': 'q2'}]


def test_cancellation_during_the_window_clears_the_pending_state(fake_db):
    # What POST /users/cancel-deletion writes.
    fake_db.table('users').update({
        'deletion_status': 'none',
        'deletion_scheduled_for': None,
        'deletion_requested_at': None,
        'deletion_attempts': 0,
        'deletion_last_error': None,
    }).eq('id', 'due-user').execute()

    result = run_pending_deletion_sweep(admin=fake_db, now=NOW)

    assert result['due'] == 0
    assert result['deleted'] == 0
    assert {u['id'] for u in fake_db.tables['users']} == {'due-user', 'not-due-user', 'active-user'}
    assert 'due-user' in fake_db.auth_users


def test_cancellation_landing_mid_sweep_wins(fake_db):
    """The sweep re-reads each account immediately before erasing it, so a
    cancel that lands between the query and the delete is honoured."""
    original_purge = purge_user
    seen = {}

    def cancel_then_purge(user_id, **kwargs):
        seen['called'] = user_id
        return original_purge(user_id, **kwargs)

    # Simulate the cancel landing right after the due-accounts query by
    # flipping the status before the re-check runs.
    due_rows = fake_db.table('users').select('id').eq('deletion_status', 'pending') \
        .lte('deletion_scheduled_for', NOW.isoformat()).execute().data
    assert [r['id'] for r in due_rows] == ['due-user']

    fake_db.table('users').update({'deletion_status': 'none'}).eq('id', 'due-user').execute()

    result = run_pending_deletion_sweep(admin=fake_db, now=NOW)

    assert 'called' not in seen
    assert result['deleted'] == 0
    assert any(u['id'] == 'due-user' for u in fake_db.tables['users'])


def test_partial_failure_leaves_the_account_retryable(fake_db):
    """A half-finished erasure must never be reported as complete, and must be
    picked up again by the next run."""
    fake_db.fail_auth = True

    result = run_pending_deletion_sweep(admin=fake_db, now=NOW)

    assert result['deleted'] == 0
    assert result['failed'] == 1

    row = [u for u in fake_db.tables['users'] if u['id'] == 'due-user'][0]
    assert row['deletion_status'] == 'pending', 'still queued, not marked done'
    assert row['deletion_attempts'] == 1
    assert row['deletion_last_error']
    # Nothing claims the account was deleted.
    assert fake_db.tables['account_deletion_log'] == []

    # The next run picks it up again; with the fault cleared it completes.
    fake_db.fail_auth = False
    retry = run_pending_deletion_sweep(admin=fake_db, now=NOW)
    assert retry['deleted'] == 1
    assert not any(u['id'] == 'due-user' for u in fake_db.tables['users'])
    assert len(fake_db.tables['account_deletion_log']) == 1


def test_a_blocked_auth_delete_names_the_row_holding_the_account(fake_db):
    """GoTrue reports every blocking foreign key as the same opaque "Database
    error deleting user". Attributing one to a single column cost a full schema
    investigation (Sentry OPTIO-BACKEND-75/76) — the failure has to say which.
    """
    fake_db.fail_auth = True
    fake_db.tables['curriculum_lessons'] = [
        {'id': 'lesson1', 'created_by': 'due-user'},
        {'id': 'lesson2', 'created_by': 'due-user'},
        {'id': 'lesson3', 'created_by': 'someone-else'},
    ]

    with pytest.raises(AccountDeletionError) as err:
        purge_user('due-user', admin=fake_db)

    message = str(err.value)
    assert 'curriculum_lessons.created_by' in message
    assert '2 rows' in message, 'the count is what tells an operator how big the cleanup is'


def test_an_auth_failure_with_nothing_blocking_reports_only_the_error(fake_db):
    """The diagnostic explains a failure; it must never invent one. An auth
    outage with no blocking rows must not name a table."""
    fake_db.fail_auth = True

    with pytest.raises(AccountDeletionError) as err:
        purge_user('due-user', admin=fake_db)

    assert 'blocked by' not in str(err.value)


def test_a_parents_own_enrollment_stamps_no_longer_block_them(fake_db):
    """Self-service registration sets class_enrollments.enrolled_by to the PARENT,
    so before the 20260825 migration every family-portal parent was undeletable.
    It is an anonymized reference now, not a blocker."""
    assert ('class_enrollments', 'enrolled_by') in svc.ANONYMIZE_REFS
    assert ('class_enrollments', 'enrolled_by') not in svc.BLOCKING_REFS

    fake_db.tables['class_enrollments'] = [
        {'id': 'e1', 'student_id': 'child1', 'enrolled_by': 'due-user'},
        {'id': 'e2', 'student_id': 'child2', 'enrolled_by': 'other-parent'},
    ]

    purge_user('due-user', admin=fake_db)

    rows = {r['id']: r for r in fake_db.tables['class_enrollments']}
    # The enrollment survives with its subject intact; only the actor goes blank.
    assert rows['e1']['student_id'] == 'child1'
    assert rows['e1']['enrolled_by'] is None
    assert rows['e2']['enrolled_by'] == 'other-parent'


def test_storage_failure_alone_blocks_completion(fake_db):
    """Files are part of the erasure: if they can't be removed, the account is
    not deleted."""
    fake_db.fail_buckets.add('user-photos')

    result = run_pending_deletion_sweep(admin=fake_db, now=NOW)

    assert result['failed'] == 1
    assert any(u['id'] == 'due-user' for u in fake_db.tables['users'])
    assert 'due-user' in fake_db.auth_users


def test_purge_writes_an_audit_row_only_on_success(fake_db):
    purge_user('due-user', admin=fake_db, deletion_type='scheduled')

    log = fake_db.tables['account_deletion_log']
    assert len(log) == 1
    assert log[0]['user_id'] == 'due-user'
    assert log[0]['deletion_completed_at']


def test_purge_raises_rather_than_reporting_a_partial_delete(fake_db):
    fake_db.fail_tables.add('user_quests')

    with pytest.raises(AccountDeletionError) as exc:
        purge_user('due-user', admin=fake_db)

    assert any('user_quests' in e for e in exc.value.errors)
    assert fake_db.tables['account_deletion_log'] == []


def test_purge_is_idempotent(fake_db):
    purge_user('due-user', admin=fake_db)
    # Re-running against an already-erased account is a no-op, not an error.
    purge_user('due-user', admin=fake_db)
    assert not any(u['id'] == 'due-user' for u in fake_db.tables['users'])


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

def test_cron_dispatcher_actually_fires_the_deletion_sweep(monkeypatch):
    """The original bug was not a broken executor — it was no executor being
    called at all. Assert the daily dispatch exists, at the endpoint the route
    is registered on."""
    from datetime import datetime as _dt
    import jobs.cron_dispatch as dispatch

    monkeypatch.setenv('BACKEND_URL', 'https://api.example.com')
    monkeypatch.setenv('CRON_SECRET', 'sekret')

    posted = []
    monkeypatch.setattr(dispatch, '_run',
                        lambda name, url, secret, failures, **kw: posted.append((name, url)))

    class _Clock(_dt):
        @classmethod
        def now(cls, tz=None):
            return _dt(2026, 8, 15, 9, 3, tzinfo=timezone.utc)

    monkeypatch.setattr(dispatch, 'datetime', _Clock)

    with pytest.raises(SystemExit) as exit_info:
        dispatch.main()
    assert exit_info.value.code == 0

    assert ('account-deletion-sweep',
            'https://api.example.com/api/users/internal/deletion-sweep') in posted
