"""Roster import: a school's spreadsheet becomes linked accounts + invites.

Hearthwood enrolls families offline and sends a finished roster, so nobody ever
signs themselves up. The import has to get three things right on real families:
siblings share one parent account, an email that already has an account is
reused rather than recreated (and never re-invited, since its owner already
chose a password), and a preview never writes anything.
"""

from unittest.mock import patch

import pytest

from services import roster_import_service as ris


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table, admin):
        self.table, self.admin = table, admin
        self._op, self._payload = 'select', None
        self._filters = {}

    def select(self, *a, **k):
        self._op = 'select'; return self

    def insert(self, payload):
        self._op = 'insert'; self._payload = payload; return self

    def upsert(self, payload, **k):
        self._op = 'upsert'; self._payload = payload; return self

    def update(self, payload):
        self._op = 'update'; self._payload = payload; return self

    def eq(self, column, value):
        self._filters[column] = value; return self

    def in_(self, column, values):
        self._filters[column] = list(values); return self

    def limit(self, *a, **k):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        if self._op in ('insert', 'upsert', 'update'):
            self.admin.writes.append((self.table, self._payload))
            return _Resp(self._payload)
        rows = list(self.admin.tables.get(self.table, []))
        for column, value in self._filters.items():
            if isinstance(value, list):
                rows = [r for r in rows if r.get(column) in value]
            else:
                rows = [r for r in rows if r.get(column) == value]
        return _Resp(rows)


class _AuthAdmin:
    def __init__(self, admin):
        self.admin = admin

    def create_user(self, payload):
        if payload['email'] in self.admin.auth_failures:
            raise RuntimeError('email address already registered')
        self.admin.created_auth.append(payload)
        user_id = f"uid-{len(self.admin.created_auth)}"
        return type('R', (), {'user': type('U', (), {'id': user_id})()})()


class FakeAdmin:
    def __init__(self, tables=None, auth_failures=()):
        self.tables = tables or {}
        self.writes = []
        self.created_auth = []
        self.auth_failures = set(auth_failures)
        self.auth = type('A', (), {'admin': _AuthAdmin(self)})()

    def table(self, name):
        return _Query(name, self)

    def written(self, table):
        out = []
        for name, payload in self.writes:
            if name != table:
                continue
            out.extend(payload if isinstance(payload, list) else [payload])
        return out


ORG = 'org-hearthwood'

# The roster as it arrives: pasted out of a spreadsheet, so tab-separated, with
# a User ID column we don't use.
ROSTER = (
    "User ID\tStudent Last Name\tStudent First Name\tStudent Email\t"
    "Parent Last Name\tParent First Name\tParent Email\n"
    "\tHennessy\tNoah\t27nhennessy@dsdmail.net\tHennessy\tMegan\tmhennessy@opened.co\n"
    "\tHennessy\tAva\t29ahennessy@dsdmail.net\tHennessy\tMegan\tmhennessy@opened.co\n"
    "\tOkafor\tLena\tlokafor@dsdmail.net\tOkafor\tTunde\ttokafor@opened.co\n"
)


def plan_for(text, admin=None, org=ORG):
    rows, error = ris.parse_roster_csv(text)
    assert error is None, error
    return ris.build_plan(rows, org, admin or FakeAdmin())


# ── Parsing ──

def test_parses_tab_separated_paste_and_ignores_user_id():
    rows, error = ris.parse_roster_csv(ROSTER)
    assert error is None
    assert len(rows) == 3
    assert rows[0] == {'_row': 2, 'student_last': 'Hennessy', 'student_first': 'Noah',
                       'student_email': '27nhennessy@dsdmail.net', 'parent_last': 'Hennessy',
                       'parent_first': 'Megan', 'parent_email': 'mhennessy@opened.co'}


def test_parses_the_same_roster_saved_as_comma_separated():
    csv_text = ('Student Last Name,Student First Name,Student Email,'
                'Parent Last Name,Parent First Name,Parent Email\n'
                'Hennessy,Noah,27nhennessy@dsdmail.net,Hennessy,Megan,mhennessy@opened.co\n')
    rows, error = ris.parse_roster_csv(csv_text)
    assert error is None
    assert rows[0]['student_email'] == '27nhennessy@dsdmail.net'
    assert rows[0]['parent_email'] == 'mhennessy@opened.co'


def test_missing_student_columns_is_refused_by_name():
    _, error = ris.parse_roster_csv('Parent Email\nmhennessy@opened.co\n')
    assert 'Student First Name' in error and 'Student Last Name' in error
    # Student Email is NOT required at the column level: rows without one
    # become parent-managed dependent profiles.
    assert 'Student Email' not in error


@pytest.mark.parametrize('text', ['', '   ', 'Student First Name,Student Last Name,Student Email\n'])
def test_empty_input_is_refused(text):
    rows, error = ris.parse_roster_csv(text)
    assert rows is None and error


def test_oversized_roster_is_refused_rather_than_timing_out():
    header = 'Student Last Name,Student First Name,Student Email\n'
    body = ''.join(f'L{i},F{i},s{i}@x.com\n' for i in range(ris.MAX_ROWS + 1))
    _, error = ris.parse_roster_csv(header + body)
    assert str(ris.MAX_ROWS) in error


# ── Planning ──

def test_siblings_collapse_to_one_parent_with_two_links():
    plan = plan_for(ROSTER)
    assert plan['counts'] == {'rows': 3, 'students_new': 3, 'students_existing': 0,
                              'parents_new': 2, 'parents_existing': 0, 'dependents_new': 0,
                              'adopted': 0, 'links': 3, 'invalid_rows': 0}
    megan = next(p for p in plan['parents'] if p['email'] == 'mhennessy@opened.co')
    assert megan['student_emails'] == ['27nhennessy@dsdmail.net', '29ahennessy@dsdmail.net']


def test_existing_emails_are_planned_as_links_not_creations():
    admin = FakeAdmin({'users': [
        {'id': 'existing-parent', 'email': 'mhennessy@opened.co', 'organization_id': ORG},
    ]})
    plan = plan_for(ROSTER, admin)
    megan = next(p for p in plan['parents'] if p['email'] == 'mhennessy@opened.co')
    assert megan['status'] == 'existing' and megan['existing_user_id'] == 'existing-parent'
    assert plan['counts']['parents_new'] == 1


def test_an_account_at_another_school_refuses_its_row_by_name():
    """Never moved silently: pulling a student off another school's roster is
    not a decision an import of somebody's spreadsheet gets to make."""
    admin = FakeAdmin({
        'users': [{'id': 'elsewhere', 'email': 'lokafor@dsdmail.net',
                   'organization_id': 'org-arete'}],
        'organizations': [{'id': 'org-arete', 'name': 'Arete Academy'}],
    })
    plan = plan_for(ROSTER, admin)

    error = next(e for e in plan['row_errors'] if e['student_email'] == 'lokafor@dsdmail.net')
    assert 'Arete Academy' in error['errors'][0]
    assert 'lokafor@dsdmail.net' not in [s['email'] for s in plan['students']]
    # The rest of the roster is still importable once that row is removed.
    assert plan['counts']['students_new'] == 2


def test_a_foreign_parent_refuses_every_row_that_names_them():
    admin = FakeAdmin({
        'users': [{'id': 'elsewhere', 'email': 'mhennessy@opened.co',
                   'organization_id': 'org-arete'}],
        'organizations': [{'id': 'org-arete', 'name': 'Arete Academy'}],
    })
    plan = plan_for(ROSTER, admin)
    assert [e['row'] for e in plan['row_errors']] == [2, 3]
    assert all('Arete Academy' in ' '.join(e['errors']) for e in plan['row_errors'])


def test_an_account_with_no_organization_is_planned_for_adoption():
    admin = FakeAdmin({'users': [
        {'id': 'platform-kid', 'email': 'lokafor@dsdmail.net', 'organization_id': None},
    ]})
    plan = plan_for(ROSTER, admin)

    lena = next(s for s in plan['students'] if s['email'] == 'lokafor@dsdmail.net')
    assert lena['status'] == 'adopt' and lena['existing_user_id'] == 'platform-kid'
    assert plan['counts']['adopted'] == 1
    # Stated up front: this changes an account somebody else already uses.
    assert any('will be added to this organization' in w and 'lokafor@dsdmail.net' in w
               for w in plan['warnings'])


def test_bad_rows_are_reported_per_row_and_dropped_from_the_plan():
    text = ('Student Last Name,Student First Name,Student Email,Parent Email,'
            'Parent First Name,Parent Last Name\n'
            'A,Amy,not-an-email,p@x.com,P,Q\n'
            'B,Bob,bob@x.com,bob@x.com,P,Q\n'
            'C,Cal,cal@x.com,p2@x.com,,\n'
            ',,d@x.com,p3@x.com,P,Q\n'
            'E,Eve,eve@x.com,p4@x.com,P,Q\n'
            'F,Fay,eve@x.com,p5@x.com,P,Q\n')
    plan = plan_for(text)
    reasons = {e['row']: ' '.join(e['errors']) for e in plan['row_errors']}
    assert 'not a valid email' in reasons[2]
    assert 'share an email' in reasons[3]
    assert 'Parent first and last name' in reasons[4]
    assert 'first and last name are required' in reasons[5]
    assert 'Duplicate student email' in reasons[7]
    assert [s['email'] for s in plan['students']] == ['eve@x.com']


def test_a_student_with_no_parent_email_is_imported_unlinked_with_a_warning():
    text = ('Student Last Name,Student First Name,Student Email,Parent Email\n'
            'Solo,Sam,sam@x.com,\n')
    plan = plan_for(text)
    assert plan['students'][0]['parent_email'] is None
    assert plan['parents'] == []
    assert plan['warnings'] and 'not be linked' in plan['warnings'][0]


def test_planning_writes_nothing():
    admin = FakeAdmin()
    plan_for(ROSTER, admin)
    assert admin.writes == [] and admin.created_auth == []


# ── Execution ──

def _execute(admin, plan, send_emails=True):
    with patch.object(ris, '_send_invite', return_value=True) as invite:
        outcome = ris.execute_plan(plan, ORG, 'Hearthwood Academy', admin,
                                   send_emails=send_emails)
    return outcome, invite


def test_import_creates_org_accounts_links_siblings_and_invites_everyone_new():
    admin = FakeAdmin()
    outcome, invite = _execute(admin, plan_for(ROSTER, admin))

    assert outcome['counts'] == {'created': 5, 'existing': 0, 'adopted': 0,
                                 'failed': 0, 'invited': 5, 'linked': 3}

    profiles = {p['email']: p for p in admin.written('users')}
    assert profiles['27nhennessy@dsdmail.net']['org_role'] == 'student'
    assert profiles['mhennessy@opened.co']['org_role'] == 'parent'
    for profile in profiles.values():
        # Org members are org_managed with the real role in org_role.
        assert profile['role'] == 'org_managed'
        assert profile['organization_id'] == ORG

    # Never email a password: accounts are made unconfirmed and the invite link
    # both sets the password and confirms the address.
    assert all(payload['email_confirm'] is False for payload in admin.created_auth)
    assert {call.args[2] for call in invite.call_args_list} == set(profiles)

    links = admin.written('parent_student_links')
    assert len(links) == 3
    assert all(link['status'] == 'approved' and link['admin_verified'] for link in links)
    megan_id = profiles['mhennessy@opened.co']['id']
    assert sum(1 for link in links if link['parent_user_id'] == megan_id) == 2


def test_existing_accounts_are_linked_but_never_recreated_or_re_invited():
    admin = FakeAdmin({'users': [
        {'id': 'existing-parent', 'email': 'mhennessy@opened.co', 'organization_id': ORG},
        {'id': 'existing-student', 'email': '27nhennessy@dsdmail.net', 'organization_id': ORG},
    ]})
    outcome, invite = _execute(admin, plan_for(ROSTER, admin))

    assert outcome['counts']['created'] == 3
    assert outcome['counts']['existing'] == 2
    assert 'mhennessy@opened.co' not in {c['email'] for c in admin.created_auth}
    assert 'mhennessy@opened.co' not in {c.args[2] for c in invite.call_args_list}

    # The already-existing pair still gets joined together.
    links = admin.written('parent_student_links')
    assert {'parent_user_id': 'existing-parent', 'student_user_id': 'existing-student',
            'status': 'approved', 'admin_verified': True,
            'admin_notes': 'Roster import'} in links


def test_an_already_linked_pair_is_not_linked_twice_on_a_re_run():
    admin = FakeAdmin({
        'users': [
            {'id': 'p1', 'email': 'mhennessy@opened.co', 'organization_id': ORG},
            {'id': 's1', 'email': '27nhennessy@dsdmail.net', 'organization_id': ORG},
        ],
        'parent_student_links': [{'id': 'link-1', 'parent_user_id': 'p1',
                                  'student_user_id': 's1'}],
    })
    _execute(admin, plan_for(ROSTER, admin))
    assert not any(link['parent_user_id'] == 'p1' and link['student_user_id'] == 's1'
                   for link in admin.written('parent_student_links'))


def test_one_failed_family_does_not_stop_the_rest_of_the_roster():
    admin = FakeAdmin(auth_failures={'lokafor@dsdmail.net'})
    outcome, _ = _execute(admin, plan_for(ROSTER, admin))

    assert outcome['counts']['failed'] == 1
    assert outcome['counts']['created'] == 4
    failed = next(r for r in outcome['results'] if r['email'] == 'lokafor@dsdmail.net')
    assert 'already registered' in failed['error']
    # The Hennessys still landed, links and all.
    assert len(admin.written('parent_student_links')) == 2


def test_send_emails_off_creates_the_accounts_without_mailing_anyone():
    admin = FakeAdmin()
    outcome, invite = _execute(admin, plan_for(ROSTER, admin), send_emails=False)
    assert outcome['counts']['created'] == 5
    assert outcome['counts']['invited'] == 0
    invite.assert_not_called()


def test_adoption_joins_the_org_without_touching_the_password_or_the_name():
    admin = FakeAdmin({'users': [
        {'id': 'platform-kid', 'email': 'lokafor@dsdmail.net', 'organization_id': None,
         'first_name': 'Lenaya', 'role': 'student'},
    ]})
    outcome, invite = _execute(admin, plan_for(ROSTER, admin))

    update = next(payload for table, payload in admin.writes
                  if table == 'users' and payload.get('organization_id') == ORG
                  and 'id' not in payload)
    assert update == {'organization_id': ORG, 'role': 'org_managed',
                      'org_role': 'student', 'org_roles': ['student']}
    # The account is already someone's: no new auth user, no invite, and the
    # name they chose is left alone.
    assert 'lokafor@dsdmail.net' not in {c['email'] for c in admin.created_auth}
    assert 'lokafor@dsdmail.net' not in {c.args[2] for c in invite.call_args_list}
    assert 'first_name' not in update

    assert outcome['counts']['adopted'] == 1
    assert outcome['counts']['created'] == 4
    # And they are linked to their parent like anyone else on the roster.
    assert len(admin.written('parent_student_links')) == 3


def test_an_existing_member_of_this_org_is_left_exactly_as_it_is():
    admin = FakeAdmin({'users': [
        {'id': 'already-here', 'email': 'lokafor@dsdmail.net', 'organization_id': ORG},
    ]})
    outcome, _ = _execute(admin, plan_for(ROSTER, admin))

    assert outcome['counts']['adopted'] == 0
    assert not [p for table, p in admin.writes if table == 'users' and 'id' not in p]


def test_the_audit_row_uses_columns_admin_audit_logs_actually_has():
    """The insert is wrapped in try/except so a bad audit never undoes a good
    import, which means a wrong column name fails silently. The first version
    copied action/entity_type/entity_id/details from bulk_import.py and every
    import logged nothing."""
    columns = {'id', 'organization_id', 'user_id', 'action_type', 'resource_type',
               'resource_id', 'changes', 'ip_address', 'user_agent', 'created_at'}
    entry = ris.audit_entry('admin-1', ORG, {'created': 5, 'failed': 0}, send_emails=True)

    assert set(entry) <= columns
    assert entry['action_type'] == 'roster_import'
    assert entry['changes'] == {'created': 5, 'failed': 0, 'send_emails': True}


# ── Students without emails (parent-managed dependents) ──

# Hearthwood's real roster: every parent has an email, not every student does.
DEPENDENT_ROSTER = (
    'Student Last Name,Student First Name,Student Email,'
    'Parent Last Name,Parent First Name,Parent Email\n'
    'Hennessy,Noah,,Hennessy,Megan,mhennessy@opened.co\n'
    'Okafor,Lena,lokafor@dsdmail.net,Okafor,Tunde,tokafor@opened.co\n'
)


def test_a_student_with_no_email_is_planned_as_a_managed_dependent():
    plan = plan_for(DEPENDENT_ROSTER)

    noah = next(s for s in plan['students'] if s['first_name'] == 'Noah')
    assert noah['email'] is None
    assert noah['dependent'] is True and noah['status'] == 'create'
    assert noah['parent_email'] == 'mhennessy@opened.co'
    assert plan['counts']['dependents_new'] == 1
    assert plan['counts']['students_new'] == 2
    # Said up front: no invite is coming for this student.
    assert any('parent-managed' in w for w in plan['warnings'])


def test_a_student_with_neither_email_is_refused():
    text = ('Student Last Name,Student First Name,Student Email,Parent Email\n'
            'Solo,Sam,,\n')
    plan = plan_for(text)
    assert 'Student email or parent email is required' in plan['row_errors'][0]['errors']
    assert plan['students'] == []


def test_the_same_dependent_twice_under_one_parent_is_a_duplicate():
    text = ('Student Last Name,Student First Name,Student Email,'
            'Parent Last Name,Parent First Name,Parent Email\n'
            'Hennessy,Noah,,Hennessy,Megan,mhennessy@opened.co\n'
            'Hennessy,Noah,,Hennessy,Megan,mhennessy@opened.co\n')
    plan = plan_for(text)
    assert any('Duplicate student' in ' '.join(e['errors']) for e in plan['row_errors'])
    assert len(plan['students']) == 1


def test_import_creates_a_dependent_profile_under_the_parent():
    admin = FakeAdmin()
    outcome, invite = _execute(admin, plan_for(DEPENDENT_ROSTER, admin))

    profiles = {(p['first_name'], p['last_name']): p for p in admin.written('users')}
    megan = profiles[('Megan', 'Hennessy')]
    noah = profiles[('Noah', 'Hennessy')]
    assert noah['is_dependent'] is True
    assert noah['managed_by_parent_id'] == megan['id']
    assert noah['email'] is None
    assert noah['role'] == 'org_managed' and noah['org_role'] == 'student'
    assert noah['organization_id'] == ORG

    # The auth stub lives on a placeholder address nobody can log in with, and
    # no invite goes to a student who has no inbox.
    noah_auth = next(a for a in admin.created_auth
                     if a['email'].endswith('@optio-internal-placeholder.local'))
    assert noah_auth['email_confirm'] is False
    assert {call.args[2] for call in invite.call_args_list} == {
        'mhennessy@opened.co', 'tokafor@opened.co', 'lokafor@dsdmail.net'}

    # managed_by_parent_id IS the relationship: no parent_student_links row.
    links = admin.written('parent_student_links')
    assert len(links) == 1 and links[0]['student_user_id'] != noah['id']

    assert outcome['counts'] == {'created': 4, 'existing': 0, 'adopted': 0,
                                 'failed': 0, 'invited': 3, 'linked': 2}
    noah_result = next(r for r in outcome['results'] if r['name'] == 'Noah Hennessy')
    assert noah_result['dependent'] is True
    assert noah_result['linked_to'] == 'mhennessy@opened.co'
    assert noah_result['invited'] is False


def test_rerunning_a_dependent_roster_reuses_the_profile_instead_of_duplicating():
    """No email to match on, so a re-run matches on the parent plus the
    student's name -- case-insensitively, since the school's sheet and the
    first import need not agree on capitalization."""
    admin = FakeAdmin({'users': [
        {'id': 'p1', 'email': 'mhennessy@opened.co', 'organization_id': ORG},
        {'id': 'dep1', 'first_name': 'NOAH', 'last_name': 'hennessy',
         'is_dependent': True, 'managed_by_parent_id': 'p1', 'organization_id': ORG},
    ]})
    plan = plan_for(DEPENDENT_ROSTER, admin)

    noah = next(s for s in plan['students'] if s['first_name'] == 'Noah')
    assert noah['status'] == 'existing' and noah['existing_user_id'] == 'dep1'

    outcome, _ = _execute(admin, plan)
    assert outcome['counts']['created'] == 2  # Tunde and Lena only
    assert outcome['counts']['existing'] == 2
    assert not any(a['email'].endswith('@optio-internal-placeholder.local')
                   for a in admin.created_auth)


def test_a_dependent_row_fails_when_its_parent_fails():
    """A managed profile with no manager would be unreachable by anyone."""
    admin = FakeAdmin(auth_failures={'mhennessy@opened.co'})
    outcome, _ = _execute(admin, plan_for(DEPENDENT_ROSTER, admin))

    noah = next(r for r in outcome['results'] if r['name'] == 'Noah Hennessy')
    assert noah['status'] == 'failed' and 'parent account failed' in noah['error']
    assert not any(a['email'].endswith('@optio-internal-placeholder.local')
                   for a in admin.created_auth)
    # The Okafors still landed.
    assert outcome['counts']['created'] == 2
    assert outcome['counts']['failed'] == 2


def test_a_failed_link_is_reported_without_losing_the_created_accounts():
    admin = FakeAdmin()
    plan = plan_for(ROSTER, admin)
    with patch.object(ris, '_send_invite', return_value=True), \
         patch.object(ris, '_link', side_effect=RuntimeError('link table down')):
        outcome = ris.execute_plan(plan, ORG, 'Hearthwood Academy', admin)

    assert outcome['counts']['created'] == 5
    assert outcome['counts']['linked'] == 0
    assert all(r.get('link_error') for r in outcome['results'] if r['kind'] == 'student')
