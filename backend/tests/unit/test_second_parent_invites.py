"""
Ticket d11e5168 (no way to message BOTH parents): "Invite second parents".

Most second parents existed only as emergency contacts ('parent', 'father')
with an email and no account, so no message could reach them. The bulk action
lists them and sends each selected row through the one-family "+ Add a parent"
door (family_guardian_service.add_guardian_to_household).

What these pin:
  - a contact already linked as a guardian (any link type) is not listed;
  - a contact with no email, or who is not a parent, is not listed;
  - one row per family and email, so siblings share one invite;
  - the POST acts only on keys from the caller's own org preview, and calls
    the existing add-parent path once per row;
  - a non-admin is refused and nothing is read or written.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import second_parent_invite_service as svc

ORG = 'org-1'
ADA = {'id': 'ada', 'first_name': 'Ada', 'last_name': 'Larson', 'email': 'ada@kid.test'}
BEN = {'id': 'ben', 'first_name': 'Ben', 'last_name': 'Larson', 'email': None}
CAL = {'id': 'cal', 'first_name': 'Cal', 'last_name': 'Moss', 'email': None}

CONTACTS = [
    # Mum is the linked guardian already: never listed.
    {'id': 'c1', 'student_user_id': 'ada', 'name': 'Marika Larson',
     'relationship': 'Parent', 'email': 'MUM@family.test'},
    # Dad on both siblings: one row.
    {'id': 'c2', 'student_user_id': 'ada', 'name': 'Andrew Larson',
     'relationship': 'father', 'email': 'andrew@family.test '},
    {'id': 'c3', 'student_user_id': 'ben', 'name': 'Andrew Larson',
     'relationship': 'parent', 'email': 'andrew@family.test'},
    # A parent with no email: nothing to invite.
    {'id': 'c4', 'student_user_id': 'cal', 'name': 'Pat Moss',
     'relationship': 'parent', 'email': ''},
    # A grandparent with an email: an emergency contact, not a guardian.
    {'id': 'c5', 'student_user_id': 'cal', 'name': 'Gran Moss',
     'relationship': 'Grandparent', 'email': 'gran@family.test'},
    # A parent whose email has an account at another school.
    {'id': 'c6', 'student_user_id': 'cal', 'name': 'Sam Moss',
     'relationship': 'mother', 'email': 'sam@elsewhere.test'},
]
HOUSES = {'ada': {'id': 'hh-l', 'name': 'Larson Family'},
          'ben': {'id': 'hh-l', 'name': 'Larson Family'},
          'cal': {'id': 'hh-m', 'name': 'Moss Family'}}
LINKED = {'ada': {'mum@family.test'}, 'ben': {'mum@family.test'}}
ACCOUNTS = {'sam@elsewhere.test': {'id': 'sam', 'email': 'sam@elsewhere.test',
                                   'organization_id': 'org-2', 'org_role': None}}


@contextmanager
def school(students=(ADA, BEN, CAL), contacts=CONTACTS, linked=None, accounts=None):
    with patch.object(svc, '_students', return_value=list(students)), \
         patch.object(svc, '_contacts', return_value=list(contacts)), \
         patch.object(svc, '_households', return_value=HOUSES), \
         patch.object(svc, '_linked_guardian_emails',
                      return_value=LINKED if linked is None else linked), \
         patch.object(svc, '_accounts', return_value=ACCOUNTS if accounts is None else accounts):
        yield


@pytest.mark.unit
class TestPreview:
    """d11e5168: who the office would invite."""

    def test_linked_guardians_and_contacts_without_email_are_not_listed(self):
        with school():
            rows = svc.preview(ORG)
        emails = {r['email'] for r in rows}
        assert 'mum@family.test' not in emails      # already linked
        assert 'gran@family.test' not in emails     # not a parent
        assert all(r['email'] for r in rows)        # c4 had none
        assert emails == {'andrew@family.test', 'sam@elsewhere.test'}

    def test_siblings_share_one_row(self):
        with school():
            rows = svc.preview(ORG)
        andrew = next(r for r in rows if r['email'] == 'andrew@family.test')
        assert andrew['household_id'] == 'hh-l'
        assert {s['id'] for s in andrew['students']} == {'ada', 'ben'}
        assert (andrew['first_name'], andrew['last_name']) == ('Andrew', 'Larson')
        assert andrew['account'] == 'new' and andrew['invitable'] is True

    def test_an_account_at_another_school_is_shown_but_not_invitable(self):
        with school():
            sam = next(r for r in svc.preview(ORG) if r['email'] == 'sam@elsewhere.test')
        assert sam['account'] == 'other_school' and sam['invitable'] is False
        assert sam['reason']

    def test_a_parent_linked_to_one_sibling_is_that_familys_guardian(self):
        """Andrew linked to Ada only: the family already has him."""
        with school(linked={'ada': {'mum@family.test', 'andrew@family.test'}}):
            emails = {r['email'] for r in svc.preview(ORG)}
        assert 'andrew@family.test' not in emails

    def test_a_contact_of_another_orgs_student_is_never_listed(self):
        stray = {'id': 'c9', 'student_user_id': 'zed', 'name': 'Zed Parent',
                 'relationship': 'parent', 'email': 'zed@other.test'}
        with school(contacts=CONTACTS + [stray]):
            emails = {r['email'] for r in svc.preview(ORG)}
        assert 'zed@other.test' not in emails

    def test_an_existing_account_at_this_school_is_connected(self):
        with school(accounts={'andrew@family.test': {'id': 'and', 'organization_id': ORG,
                                                     'org_role': 'parent'}}):
            andrew = next(r for r in svc.preview(ORG) if r['email'] == 'andrew@family.test')
        assert andrew['account'] == 'existing' and andrew['invitable'] is True


@pytest.mark.unit
class TestInvite:
    """d11e5168: the POST goes through "+ Add a parent", one call per row."""

    def test_each_selected_row_calls_the_existing_add_parent_path(self):
        with school():
            key = next(r['key'] for r in svc.preview(ORG) if r['email'] == 'andrew@family.test')
            with patch('services.family_guardian_service.add_guardian_to_household',
                       return_value={'kind': 'invited', 'invite_sent': True,
                                     'member': None}) as add:
                out = svc.invite(ORG, 'staff-1', [key])
        add.assert_called_once_with(ORG, 'hh-l', 'staff-1',
                                    {'first_name': 'Andrew', 'last_name': 'Larson',
                                     'email': 'andrew@family.test'})
        assert out['counts'] == {'invited': 1}

    def test_another_orgs_key_writes_nothing(self):
        """A key for a student outside the caller's org is not in the
        caller's preview, so nothing is written."""
        with school(), patch('services.family_guardian_service.add_guardian_to_household') as add:
            out = svc.invite(ORG, 'staff-1', ['hh-other-org|dad@other.test'])
        add.assert_not_called()
        assert out['results'] == [{'key': 'hh-other-org|dad@other.test', 'status': 'not_found'}]

    def test_a_row_that_cannot_be_invited_is_skipped_not_sent(self):
        with school():
            key = next(r['key'] for r in svc.preview(ORG) if r['email'] == 'sam@elsewhere.test')
            with patch('services.family_guardian_service.add_guardian_to_household') as add:
                out = svc.invite(ORG, 'staff-1', [key])
        add.assert_not_called()
        assert out['counts'] == {'skipped': 1}

    def test_no_keys_is_a_400(self):
        assert svc.invite(ORG, 'staff-1', [])['status'] == 400


def _role_client(role, org_role=None):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{
        'role': role, 'org_role': org_role, 'org_roles': [org_role] if org_role else None}])
    return client


@contextmanager
def caller(role='org_admin', org_role=None):
    with patch('database.get_supabase_admin_client', return_value=_role_client(role, org_role)), \
         patch('services.sis_service.resolve_org_id', return_value=ORG):
        yield


@pytest.mark.unit
class TestRoutes:
    """d11e5168: ADMIN_ROLES only."""

    def test_an_org_admin_gets_the_preview(self, client, auth_headers, mock_verify_token):
        with caller(), patch.object(svc, 'preview', return_value=[{'key': 'k'}]) as run:
            resp = client.get('/api/sis/second-parent-invites', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['candidates'] == [{'key': 'k'}]
        run.assert_called_once_with(ORG)

    @pytest.mark.parametrize('role,org_role', [
        ('org_managed', 'advisor'), ('org_managed', 'parent'), ('student', None),
    ])
    def test_non_admins_are_refused_and_nothing_is_written(
            self, client, auth_headers, mock_verify_token, role, org_role):
        with caller(role=role, org_role=org_role), \
             patch.object(svc, 'preview') as run, patch.object(svc, 'invite') as send:
            get = client.get('/api/sis/second-parent-invites', headers=auth_headers)
            post = client.post('/api/sis/second-parent-invites', headers=auth_headers,
                               json={'keys': ['k']})
        assert get.status_code == 403 and post.status_code == 403
        run.assert_not_called()
        send.assert_not_called()
