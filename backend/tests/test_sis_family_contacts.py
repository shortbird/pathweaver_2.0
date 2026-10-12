"""
Who to contact: the school's "for this, ask that person" list on the family home.

Ticket c58b7c0b (iCreate, org admin): "On parent dashboards, could we create
a section where there is who to contact info? So they can get in touch with
the right person for what they need without having to go through multiple
people... e.g. a question about something in the building message Becky;
late pick-up; general concern about classes message Sharmaine."

The office keeps the list in sis_settings.family_contacts through the
settings PATCH; a bad list is refused whole and nothing is written. Families
read it, resolved to current names and a Message target, on the parent
context and the school hub context.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_family_contacts_service as contacts
from services import sis_parent_service

ORG = 'org-1'
BECKY = {'id': 'becky', 'first_name': 'Becky', 'last_name': 'Lane', 'organization_id': ORG,
         'org_role': 'campus_coordinator', 'org_roles': ['campus_coordinator']}
SHARMAINE = {'id': 'sharmaine', 'first_name': 'Sharmaine', 'last_name': 'Ortiz', 'organization_id': ORG,
             'org_role': 'advisor', 'org_roles': ['advisor']}
FOREIGN = {'id': 'foreign', 'first_name': 'Other', 'last_name': 'School', 'organization_id': 'org-2',
           'org_role': 'org_admin', 'org_roles': ['org_admin']}
A_PARENT = {'id': 'pat', 'first_name': 'Pat', 'last_name': 'Parent', 'organization_id': ORG,
            'org_role': 'parent', 'org_roles': ['parent']}
PEOPLE = {u['id']: u for u in (BECKY, SHARMAINE, FOREIGN, A_PARENT)}


def _users_client(orgs=None):
    """A fake admin client: users.in_('id', ids) answers from PEOPLE;
    organizations answers `orgs`."""
    client = Mock()

    def table(name):
        t = Mock()
        state = {}
        for chained in ('select', 'eq', 'limit'):
            getattr(t, chained).return_value = t

        def in_(col, ids):
            state['ids'] = ids
            return t
        t.in_.side_effect = in_

        def execute():
            if name == 'users':
                return Mock(data=[PEOPLE[i] for i in state.get('ids', []) if i in PEOPLE])
            return Mock(data=orgs or [])
        t.execute.side_effect = execute
        return t
    client.table.side_effect = table
    return client


GOOD = [
    {'topic': 'Building questions', 'staff_user_id': 'becky', 'phone': '(801) 555-0100'},
    {'topic': 'General concerns about classes', 'staff_user_id': 'sharmaine', 'email': 'sharmaine@icreate.test'},
    {'topic': 'Late pick-up', 'name': 'Front desk', 'phone': '801-555-0199 ext 2'},
]


@pytest.mark.unit
class TestCleanContacts:
    def _clean(self, raw):
        with patch.object(contacts, '_admin', return_value=_users_client()):
            return contacts.clean_contacts(ORG, raw)

    def test_a_good_list_is_kept_in_order_and_trimmed(self):
        out, err = self._clean([{**GOOD[0], 'topic': '  Building questions  '}, *GOOD[1:]])
        assert err is None
        assert [c['topic'] for c in out] == ['Building questions', 'General concerns about classes', 'Late pick-up']
        assert out[0] == {'topic': 'Building questions', 'staff_user_id': 'becky', 'phone': '(801) 555-0100'}
        assert out[2] == {'topic': 'Late pick-up', 'name': 'Front desk', 'phone': '801-555-0199 ext 2'}

    def test_none_clears(self):
        assert self._clean(None) == ([], None)

    @pytest.mark.parametrize('raw', [
        'not a list',
        [{'name': 'Becky'}],                                          # no topic
        [{'topic': 'Building'}],                                      # no person
        [{'topic': 'x' * 81, 'name': 'Becky'}],                       # topic too long
        [{'topic': 'Building', 'name': 'Becky', 'email': 'nope'}],    # bad email
        [{'topic': 'Building', 'name': 'Becky', 'phone': 'call me'}],  # bad phone
        [{'topic': f'T{i}', 'name': 'N'} for i in range(21)],          # too many
        [{'topic': 'Building', 'staff_user_id': 'foreign'}],          # another school
        [{'topic': 'Building', 'staff_user_id': 'pat'}],              # not staff
        [{'topic': 'Building', 'staff_user_id': 'ghost'}],            # nobody
    ])
    def test_a_bad_list_is_refused(self, raw):
        out, err = self._clean(raw)
        assert out is None and err


# ── The settings PATCH ───────────────────────────────────────────────────────

def _caller_client(role_row):
    client = Mock()
    table = Mock()
    for chained in ('select', 'eq', 'limit', 'single', 'in_'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[role_row])
    client.table.return_value = table
    return client


ADMIN_ROW = {'id': 'molly', 'role': 'org_managed', 'org_role': 'org_admin',
             'org_roles': ['org_admin'], 'is_org_admin': True,
             'organization_id': ORG, 'email': 'molly@icreate.test'}
TEACHER_ROW = {**ADMIN_ROW, 'id': 't', 'org_role': 'advisor', 'org_roles': ['advisor'], 'is_org_admin': False}


def _patch(client, headers, row, value):
    repo = Mock()
    repo.find_by_id.return_value = {'id': ORG, 'feature_flags': {'sis_settings': {'rooms': [{'name': 'Kitchen'}]}}}
    repo.update_organization.side_effect = lambda org_id, data: {'id': org_id, **data}
    with patch('database.get_supabase_admin_client', return_value=_caller_client(row)), \
         patch('services.sis_service.get_user_org_context',
               return_value={'role': row['org_role'], 'organization_id': ORG}), \
         patch('services.sis_service.resolve_org_id', return_value=ORG), \
         patch('services.sis_service.caller_sees_pay', return_value=True), \
         patch('modules.gate.module_enabled', return_value=True), \
         patch.object(contacts, '_admin', return_value=_users_client()), \
         patch('repositories.organization_repository.OrganizationRepository', return_value=repo):
        resp = client.patch(f'/api/sis/settings?organization_id={ORG}', headers=headers,
                            json={'sis_settings': {contacts.SETTING_KEY: value}})
    return resp, repo


@pytest.mark.unit
class TestTheSetting:
    def test_an_admin_saves_the_list(self, client, auth_headers, mock_verify_token):
        resp, repo = _patch(client, auth_headers, ADMIN_ROW, GOOD)
        assert resp.status_code == 200, resp.get_json()
        written = repo.update_organization.call_args[0][1]['feature_flags']['sis_settings']
        assert [c['topic'] for c in written[contacts.SETTING_KEY]] == [g['topic'] for g in GOOD]
        assert written['rooms'] == [{'name': 'Kitchen'}]

    def test_an_empty_list_removes_the_key(self, client, auth_headers, mock_verify_token):
        resp, repo = _patch(client, auth_headers, ADMIN_ROW, [])
        assert resp.status_code == 200, resp.get_json()
        written = repo.update_organization.call_args[0][1]['feature_flags']['sis_settings']
        assert contacts.SETTING_KEY not in written

    def test_a_teacher_cannot_set_it(self, client, auth_headers, mock_verify_token):
        resp, repo = _patch(client, auth_headers, TEACHER_ROW, GOOD)
        assert resp.status_code == 403
        repo.update_organization.assert_not_called()

    def test_a_staff_member_of_another_school_writes_nothing(self, client, auth_headers, mock_verify_token):
        resp, repo = _patch(client, auth_headers, ADMIN_ROW, [{'topic': 'Building', 'staff_user_id': 'foreign'}])
        assert resp.status_code == 400
        assert resp.get_json()['fields'] == [contacts.SETTING_KEY]
        repo.update_organization.assert_not_called()

    def test_too_many_entries_write_nothing(self, client, auth_headers, mock_verify_token):
        resp, repo = _patch(client, auth_headers, ADMIN_ROW,
                            [{'topic': f'T{i}', 'name': 'N'} for i in range(contacts.MAX_CONTACTS + 1)])
        assert resp.status_code == 400
        repo.update_organization.assert_not_called()


# ── The family's read ────────────────────────────────────────────────────────

@pytest.mark.unit
class TestTheFamilyRead:
    def _read(self, settings, hidden=()):
        with patch.object(contacts, '_admin', return_value=_users_client()), \
             patch('services.school_inbox_service.get_org',
                   return_value={'id': ORG, 'inbox_user_id': 'inbox-1'}), \
             patch('services.school_inbox_service.school_mail_contact_ids', return_value=set(hidden)):
            return contacts.contacts_for_orgs('pat', {ORG: settings})[ORG]

    def test_rows_carry_current_names_and_a_message_target(self):
        rows = self._read({contacts.SETTING_KEY: GOOD})
        assert rows[0] == {'topic': 'Building questions', 'name': 'Becky Lane', 'phone': '(801) 555-0100',
                           'email': None, 'staff_user_id': 'becky', 'message_user_id': 'becky'}
        assert rows[1]['message_user_id'] == 'sharmaine'
        # A typed name has no account: no Message button.
        assert rows[2]['name'] == 'Front desk'
        assert rows[2]['staff_user_id'] is None and rows[2]['message_user_id'] is None

    def test_the_front_office_is_messaged_through_the_school(self):
        """A family writes to the front office through the school inbox, so a
        thread with Becky by name would never open; Message opens the school."""
        rows = self._read({contacts.SETTING_KEY: GOOD}, hidden={'becky'})
        assert rows[0]['message_user_id'] == 'inbox-1'
        assert rows[1]['message_user_id'] == 'sharmaine'

    def test_a_staff_member_who_left_keeps_only_the_typed_name(self):
        rows = self._read({contacts.SETTING_KEY: [
            {'topic': 'Building', 'staff_user_id': 'foreign', 'name': 'Becky'},
            {'topic': 'Gone', 'staff_user_id': 'ghost'},
        ]})
        assert rows == [{'topic': 'Building', 'name': 'Becky', 'phone': None, 'email': None,
                         'staff_user_id': None, 'message_user_id': None}]

    def test_no_list_is_an_empty_list(self):
        assert self._read({}) == []

    def test_the_parent_context_carries_the_list(self):
        org_row = {'id': ORG, 'name': 'iCreate', 'feature_flags': {'sis_settings': {contacts.SETTING_KEY: GOOD}}}
        empty_row = {'id': 'org-3', 'name': 'Quiet', 'feature_flags': {}}
        entries = [{'organization_id': ORG, 'is_guardian': True},
                   {'organization_id': 'org-3', 'is_guardian': True}]
        with patch.object(contacts, '_admin', return_value=_users_client()), \
             patch('services.school_inbox_service.school_mail_contact_ids', return_value=set()):
            sis_parent_service._attach_family_contacts('pat', entries, {ORG: org_row, 'org-3': empty_row})
        assert [c['topic'] for c in entries[0]['family_contacts']] == [g['topic'] for g in GOOD]
        assert entries[1]['family_contacts'] == []

    def test_the_hub_context_gives_it_to_guardians_only(self):
        org_row = {'id': ORG, 'feature_flags': {'sis_settings': {contacts.SETTING_KEY: GOOD}}}
        entries = [{'organization_id': ORG, 'is_guardian': False}]
        with patch.object(contacts, '_admin', return_value=_users_client()):
            sis_parent_service._attach_family_contacts('stu', entries, {ORG: org_row}, guardian_only=True)
        assert entries[0]['family_contacts'] == []
