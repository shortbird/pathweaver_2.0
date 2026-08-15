"""Archiving, restoring and deleting an organization.

The dangerous part of this feature is the DELETE: 77 tables carry an FK to
organizations(id), a mix of CASCADE and SET NULL, so one unguarded delete takes
a school's announcements, class materials and discussion posts with it. These
tests pin the three guards that stand in front of it, and the member conversion
that archiving performs -- the one operation here that touches real people's
accounts.
"""

from unittest.mock import patch

import pytest

from services import organization_lifecycle as lifecycle


class _Resp:
    def __init__(self, data):
        self.data = data


class _Rpc:
    """supabase-py defers RPCs the same way it defers table queries."""

    def __init__(self, data):
        self._data = data

    def execute(self):
        return _Resp(self._data)


class _Query:
    def __init__(self, table, admin):
        self.table, self.admin = table, admin
        self._op, self._payload = 'select', None
        self._filters = {}
        self._range = None

    def select(self, *a, **k):
        self._op = 'select'; return self

    def insert(self, payload):
        self._op = 'insert'; self._payload = payload; return self

    def update(self, payload):
        self._op = 'update'; self._payload = payload; return self

    def delete(self):
        self._op = 'delete'; return self

    def eq(self, column, value):
        self._filters[column] = value; return self

    def in_(self, column, values):
        self._filters[column] = list(values); return self

    def limit(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def range(self, start, end):
        self._range = (start, end); return self

    def _matching(self):
        rows = list(self.admin.tables.get(self.table, []))
        for column, value in self._filters.items():
            if isinstance(value, list):
                rows = [r for r in rows if r.get(column) in value]
            else:
                rows = [r for r in rows if r.get(column) == value]
        return rows

    def execute(self):
        if self.admin.fail_on and self.admin.fail_on == (self.table, self._op):
            raise RuntimeError('simulated database failure')

        if self._op == 'insert':
            self.admin.writes.append((self.table, self._payload))
            self.admin.tables.setdefault(self.table, []).append(self._payload)
            return _Resp([self._payload])

        if self._op == 'update':
            matched = self._matching()
            self.admin.writes.append((self.table, dict(self._payload),
                                      [r.get('id') for r in matched]))
            for row in matched:
                row.update(self._payload)
            return _Resp(matched)

        if self._op == 'delete':
            matched = self._matching()
            remaining = [r for r in self.admin.tables.get(self.table, [])
                         if r not in matched]
            self.admin.tables[self.table] = remaining
            self.admin.deletes.append((self.table, [r.get('id') for r in matched]))
            return _Resp(matched)

        rows = self._matching()
        if self._range:
            start, end = self._range
            rows = rows[start:end + 1]
        return _Resp(rows)


class FakeAdmin:
    def __init__(self, tables=None, content=(), fail_on=None):
        self.tables = tables or {}
        self.writes = []
        self.deletes = []
        self.rpc_calls = []
        self.content = list(content)
        self.fail_on = fail_on

    def table(self, name):
        return _Query(name, self)

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))
        return _Rpc(list(self.content))

    def updates_to(self, table):
        return [w for w in self.writes if w[0] == table and len(w) == 3]

    def inserted(self, table):
        return [w[1] for w in self.writes if w[0] == table and len(w) == 2]


ORG_ID = 'org-hearthwood'
ADMIN = 'superadmin-1'


def org_row(**overrides):
    row = {'id': ORG_ID, 'name': 'Hearthwood Academy', 'slug': 'hearthwood',
           'is_active': True, 'archived_at': None, 'archived_by': None}
    row.update(overrides)
    return row


def member(user_id, org_role, role='org_managed'):
    return {'id': user_id, 'role': role, 'org_role': org_role,
            'organization_id': ORG_ID}


# ── Role mapping on the way out ──

@pytest.mark.parametrize('org_role,expected', [
    ('student', 'student'),
    ('parent', 'parent'),
    ('advisor', 'advisor'),
    ('observer', 'observer'),
    # Neither of these exists as a platform role, so they land on the least
    # privileged one rather than quietly becoming a platform advisor with reach
    # into other people's students.
    ('org_admin', 'student'),
    ('campus_coordinator', 'student'),
    (None, 'student'),
])
def test_departing_member_lands_on_a_valid_platform_role(org_role, expected):
    assert lifecycle.platform_role_for(org_role) == expected


def test_platform_roles_are_the_four_that_can_hold_a_null_organization():
    # campus_coordinator is org-only by design (OrgRole, deliberately not
    # UserRole) -- putting it here would write a value users.role rejects.
    assert set(lifecycle.PLATFORM_ROLES) == {'student', 'parent', 'advisor', 'observer'}


# ── Archiving ──

def test_archive_converts_every_member_to_a_platform_account():
    admin = FakeAdmin({
        'organizations': [org_row()],
        'users': [member('u1', 'student'), member('u2', 'parent'),
                  member('u3', 'advisor'), member('u4', 'org_admin')],
    })

    result = lifecycle.archive_organization(admin, ORG_ID, ADMIN)

    assert result['members_converted'] == 4
    assert result['members_by_role'] == {'student': 2, 'parent': 1, 'advisor': 1}
    for user in admin.tables['users']:
        assert user['organization_id'] is None
        assert user['org_role'] is None
        assert user['role'] in lifecycle.PLATFORM_ROLES


def test_archive_never_writes_is_org_admin_by_hand():
    # It is derived by the sync_is_org_admin trigger. Writing it directly is
    # what let demoted admins keep admin access before the trigger existed.
    admin = FakeAdmin({
        'organizations': [org_row()],
        'users': [member('u1', 'org_admin')],
    })

    lifecycle.archive_organization(admin, ORG_ID, ADMIN)

    for _, payload, _ in admin.updates_to('users'):
        assert 'is_org_admin' not in payload


def test_archive_leaves_a_superadmin_alone():
    admin = FakeAdmin({
        'organizations': [org_row()],
        'users': [member('u1', 'student'),
                  {'id': 'sa', 'role': 'superadmin', 'org_role': None,
                   'organization_id': ORG_ID}],
    })

    result = lifecycle.archive_organization(admin, ORG_ID, ADMIN)

    assert result['members_converted'] == 1
    superadmin = next(u for u in admin.tables['users'] if u['id'] == 'sa')
    assert superadmin['role'] == 'superadmin'
    assert superadmin['organization_id'] == ORG_ID


def test_archive_hides_the_org_and_records_who_did_it():
    admin = FakeAdmin({'organizations': [org_row()], 'users': []})

    lifecycle.archive_organization(admin, ORG_ID, ADMIN)

    stored = admin.tables['organizations'][0]
    assert stored['is_active'] is False
    assert stored['archived_by'] == ADMIN
    assert stored['archived_at']


def test_archiving_an_archived_org_is_refused():
    admin = FakeAdmin({'organizations': [org_row(is_active=False)], 'users': []})

    with pytest.raises(lifecycle.OrganizationLifecycleError):
        lifecycle.archive_organization(admin, ORG_ID, ADMIN)


def test_archive_reads_members_in_pages():
    # An org's headcount grows with the org, so a plain select would be
    # truncated at the PostgREST row cap and silently leave the tail of a large
    # school still pointing at an archived org.
    many = [member(f'u{i}', 'student') for i in range(2500)]
    admin = FakeAdmin({'organizations': [org_row()], 'users': many})

    with patch('utils.db_fetch._default_page_size', return_value=1000):
        result = lifecycle.archive_organization(admin, ORG_ID, ADMIN)

    assert result['members_converted'] == 2500
    assert all(u['organization_id'] is None for u in admin.tables['users'])


def test_archive_survives_a_failed_audit_write():
    admin = FakeAdmin({'organizations': [org_row()],
                       'users': [member('u1', 'student')]},
                      fail_on=('admin_audit_logs', 'insert'))

    result = lifecycle.archive_organization(admin, ORG_ID, ADMIN)

    assert result['members_converted'] == 1
    assert admin.tables['organizations'][0]['is_active'] is False


# ── Restoring ──

def test_restore_brings_the_org_back_and_clears_the_archive_stamp():
    admin = FakeAdmin({'organizations': [
        org_row(is_active=False, archived_at='2026-08-15T00:00:00Z', archived_by=ADMIN)
    ]})

    lifecycle.restore_organization(admin, ORG_ID, ADMIN)

    stored = admin.tables['organizations'][0]
    assert stored['is_active'] is True
    assert stored['archived_at'] is None
    assert stored['archived_by'] is None


def test_restore_does_not_pull_former_members_back_in():
    # They are live platform accounts now; re-attaching them behind the user's
    # back is not something a restore should do.
    admin = FakeAdmin({
        'organizations': [org_row(is_active=False)],
        'users': [{'id': 'u1', 'role': 'student', 'org_role': None,
                   'organization_id': None}],
    })

    lifecycle.restore_organization(admin, ORG_ID, ADMIN)

    assert admin.tables['users'][0]['organization_id'] is None
    assert admin.updates_to('users') == []


def test_restoring_a_live_org_is_refused():
    admin = FakeAdmin({'organizations': [org_row()]})

    with pytest.raises(lifecycle.OrganizationLifecycleError):
        lifecycle.restore_organization(admin, ORG_ID, ADMIN)


# ── Deleting ──

def test_delete_is_refused_while_the_org_is_still_live():
    admin = FakeAdmin({'organizations': [org_row()]})

    with pytest.raises(lifecycle.OrganizationLifecycleError, match='Archive'):
        lifecycle.delete_organization(admin, ORG_ID, ADMIN, 'Hearthwood Academy')

    assert admin.tables['organizations']


def test_delete_is_refused_when_the_typed_name_does_not_match():
    admin = FakeAdmin({'organizations': [org_row(is_active=False)]})

    with pytest.raises(lifecycle.OrganizationLifecycleError, match='exactly'):
        lifecycle.delete_organization(admin, ORG_ID, ADMIN, 'hearthwood academy')

    assert admin.tables['organizations']


def test_delete_is_refused_while_anything_still_references_the_org():
    admin = FakeAdmin(
        {'organizations': [org_row(is_active=False)]},
        content=[{'rel_name': 'announcements', 'row_count': 3},
                 {'rel_name': 'org_classes', 'row_count': 12}],
    )

    with pytest.raises(lifecycle.OrganizationNotEmpty) as exc:
        lifecycle.delete_organization(admin, ORG_ID, ADMIN, 'Hearthwood Academy')

    # The UI needs to say what is in the way, not just "no".
    assert exc.value.blockers == [{'table': 'org_classes', 'rows': 12},
                                  {'table': 'announcements', 'rows': 3}]
    assert admin.tables['organizations']


def test_delete_removes_an_archived_empty_org():
    admin = FakeAdmin({'organizations': [org_row(is_active=False)],
                       'organization_secrets': [{'id': 's1', 'organization_id': ORG_ID}]})

    result = lifecycle.delete_organization(admin, ORG_ID, ADMIN, 'Hearthwood Academy')

    assert result['deleted'] is True
    assert admin.tables['organizations'] == []
    # Credentials go with the org -- they are excluded from the blocker count
    # precisely so a stored Stripe key can't wedge a dead org in place forever.
    assert admin.tables['organization_secrets'] == []


def test_delete_accepts_a_name_with_stray_whitespace():
    admin = FakeAdmin({'organizations': [org_row(is_active=False)]})

    lifecycle.delete_organization(admin, ORG_ID, ADMIN, '  Hearthwood Academy  ')

    assert admin.tables['organizations'] == []


def test_delete_writes_its_audit_row_before_the_org_disappears():
    admin = FakeAdmin({'organizations': [org_row(is_active=False)]})

    lifecycle.delete_organization(admin, ORG_ID, ADMIN, 'Hearthwood Academy')

    entry = admin.inserted('admin_audit_logs')[0]
    assert entry['action_type'] == 'delete_organization'
    # organization_id is FK'd ON DELETE SET NULL, so the copy inside `changes`
    # is the part that survives.
    assert entry['changes']['organization_name'] == 'Hearthwood Academy'


def test_a_missing_org_is_a_404_not_a_500():
    admin = FakeAdmin({'organizations': []})

    for call in (
        lambda: lifecycle.archive_organization(admin, ORG_ID, ADMIN),
        lambda: lifecycle.restore_organization(admin, ORG_ID, ADMIN),
        lambda: lifecycle.delete_organization(admin, ORG_ID, ADMIN, 'x'),
        lambda: lifecycle.deletion_preview(admin, ORG_ID),
    ):
        with pytest.raises(lifecycle.OrganizationNotFound):
            call()


# ── Preview ──

def test_preview_reports_both_reasons_a_delete_would_be_refused():
    admin = FakeAdmin(
        {'organizations': [org_row()]},
        content=[{'rel_name': 'quests', 'row_count': 2}],
    )

    preview = lifecycle.deletion_preview(admin, ORG_ID)

    assert preview['can_delete'] is False
    assert len(preview['reasons']) == 2
    assert preview['blockers'] == [{'table': 'quests', 'rows': 2}]


def test_preview_clears_an_archived_empty_org_for_deletion():
    admin = FakeAdmin({'organizations': [org_row(is_active=False)]})

    preview = lifecycle.deletion_preview(admin, ORG_ID)

    assert preview['can_delete'] is True
    assert preview['blockers'] == []
    assert admin.rpc_calls == [('organization_content_summary', {'p_org_id': ORG_ID})]


# ── The audit row's column names ──

def test_audit_entry_uses_this_tables_columns():
    # admin_audit_logs has user_id/changes -- NOT the admin_id/metadata pair
    # AdminAuditRepository.log_action writes, and not the action/entity_type
    # columns other admin routes use. Every insert here is wrapped in
    # try/except, so a wrong column name fails silently and stays wrong.
    entry = lifecycle.audit_entry(ADMIN, org_row(), 'archive_organization',
                                  {'converted': 4})

    assert set(entry) == {'user_id', 'organization_id', 'action_type',
                          'resource_type', 'resource_id', 'changes'}
    assert entry['user_id'] == ADMIN
    assert entry['resource_type'] == 'organization'
    assert entry['changes']['converted'] == 4
