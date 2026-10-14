"""The People page's "A family" wizard path: one request, a whole family.

It adds no new way to make a person -- it runs the family record's own
"Add a parent" and "Add a child" doors in order. What these pin is the part
that is its own: everything refusable is refused before the household exists,
the first parent is the primary contact, a failed first parent takes the empty
household back, and the setup emails go out only when asked.
"""

from datetime import datetime, timedelta
from unittest.mock import Mock, patch

import pytest

from services import sis_family_create_service as svc

ORG = 'org-1'


def _dob(years_ago):
    return (datetime.utcnow() - timedelta(days=int(years_ago * 365.25))).strftime('%Y-%m-%d')


MUM = {'first_name': 'Shelby', 'last_name': 'Watson', 'email': 'shelby@example.com'}
DAD = {'first_name': 'Tom', 'last_name': 'Watson', 'email': 'tom@example.com'}
KID = {'first_name': 'Reece', 'last_name': 'Watson', 'date_of_birth': _dob(9)}
TEEN = {'first_name': 'Ava', 'last_name': 'Watson', 'date_of_birth': _dob(15),
        'email': 'ava@example.com'}


def _run(data, *, existing=None, has_family=None, guardian_results=None, child_result=None):
    """create_family with its collaborators stubbed. Returns (result, mocks)."""
    users = Mock()
    users.find_by_email.side_effect = lambda e: (existing or {}).get(e)
    households = Mock()
    households.create.return_value = {'id': 'hh-new'}
    guardian_results = list(guardian_results or [
        {'kind': 'invited', 'user_id': 'mum-1', 'invite_sent': True},
        {'kind': 'invited', 'user_id': 'dad-1', 'invite_sent': True},
    ])
    with patch('repositories.user_repository.UserRepository', return_value=users), \
         patch('repositories.household_repository.HouseholdRepository', return_value=households), \
         patch('services.sis_attach_service.household_for_guardian',
               side_effect=lambda org, uid: (has_family or {}).get(uid)), \
         patch('services.family_guardian_service.add_guardian_to_household',
               side_effect=guardian_results) as add_guardian, \
         patch('services.family_student_service.add_child_to_household',
               return_value=child_result or {'kind': 'dependent', 'invite_sent': False}) as add_child, \
         patch.object(svc, '_admin', return_value=Mock()):
        result = svc.create_family(ORG, 'admin-1', data)
    return result, {'households': households, 'add_guardian': add_guardian,
                    'add_child': add_child}


@pytest.mark.unit
class TestCreateFamily:
    def test_makes_the_household_then_parents_then_children(self):
        result, m = _run({'guardians': [MUM, DAD], 'children': [KID]})
        assert result['household'] == {'id': 'hh-new', 'name': 'Watson Family'}
        assert [g['name'] for g in result['guardians']] == ['Shelby Watson', 'Tom Watson']
        assert result['children'][0]['name'] == 'Reece Watson'
        assert result['problems'] == []
        m['households'].create.assert_called_once_with(ORG, {'name': 'Watson Family'})

    def test_the_first_parent_is_the_primary_contact(self):
        _, m = _run({'guardians': [MUM, DAD], 'children': []})
        first, second = m['add_guardian'].call_args_list
        assert first.args[3]['is_primary'] is True
        assert second.args[3]['is_primary'] is False
        m['households'].update.assert_called_once_with('hh-new', {'primary_contact_user_id': 'mum-1'})

    def test_a_typed_family_name_wins_over_the_parents_last_name(self):
        result, m = _run({'name': 'The Watson-Lees', 'guardians': [MUM], 'children': []})
        assert result['household']['name'] == 'The Watson-Lees'

    def test_emails_follow_the_switch(self):
        _, m = _run({'guardians': [MUM], 'children': [KID], 'send_emails': False})
        assert m['add_guardian'].call_args.args[3]['send_email'] is False
        assert m['add_child'].call_args.args[3]['send_email'] is False

    def test_a_new_family_never_asks_about_duplicates(self):
        _, m = _run({'guardians': [MUM], 'children': [KID]})
        assert m['add_child'].call_args.args[3]['confirm_duplicate'] is True

    def test_a_child_under_13_carries_no_email(self):
        _, m = _run({'guardians': [MUM], 'children': [{**KID, 'email': 'kid@example.com'}]})
        assert m['add_child'].call_args.args[3]['email'] == ''

    def test_a_failed_first_parent_takes_the_empty_household_back(self):
        result, m = _run({'guardians': [MUM], 'children': [KID]},
                         guardian_results=[{'error': 'Could not create the account.', 'status': 400}])
        assert result == {'error': 'Could not create the account.', 'status': 400}
        m['households'].delete.assert_called_once_with('hh-new')
        m['add_child'].assert_not_called()

    def test_a_failed_child_is_reported_and_the_family_stays(self):
        result, m = _run({'guardians': [MUM], 'children': [KID]},
                         child_result={'error': 'Could not create the account.', 'status': 400})
        assert result['problems'] == [{'name': 'Reece Watson', 'error': 'Could not create the account.'}]
        m['households'].delete.assert_not_called()


@pytest.mark.unit
class TestRefusedBeforeAnythingIsWritten:
    @pytest.mark.parametrize('data, words', [
        ({'guardians': [], 'children': [KID]}, 'at least one parent'),
        ({'guardians': [MUM, DAD, {**DAD, 'email': 'x@example.com'}]}, 'at most 2 parents'),
        ({'guardians': [{**MUM, 'last_name': ''}]}, 'first and last name'),
        ({'guardians': [{**MUM, 'email': 'nope'}]}, 'valid email'),
        ({'guardians': [MUM], 'children': [{**KID, 'date_of_birth': ''}]}, 'date of birth'),
        ({'guardians': [MUM], 'children': [{**TEEN, 'email': ''}]}, 'needs their own email'),
        ({'guardians': [MUM, {**DAD, 'email': MUM['email']}]}, 'their own email'),
    ])
    def test_bad_input(self, data, words):
        result, m = _run(data)
        assert words in result['error']
        m['households'].create.assert_not_called()

    def test_a_parent_at_another_school(self):
        result, m = _run({'guardians': [MUM]},
                         existing={MUM['email']: {'id': 'u9', 'organization_id': 'org-other'}})
        # Ticket af8469aa: refused without naming the school, and no longer
        # "email support" -- a platform account is offered Ask to connect.
        assert result['status'] == 409 and result['code'] == 'other_school'
        assert 'another school' in result['error'] and 'org-other' not in result['error']
        m['households'].create.assert_not_called()

    def test_a_parent_who_already_has_a_family_here(self):
        result, m = _run({'guardians': [MUM]},
                         existing={MUM['email']: {'id': 'u9', 'organization_id': ORG,
                                                  'org_role': 'parent'}},
                         has_family={'u9': 'hh-old'})
        assert result['code'] == 'has_family'
        m['households'].create.assert_not_called()

    def test_a_student_email_as_a_parent(self):
        result, _ = _run({'guardians': [MUM]},
                         existing={MUM['email']: {'id': 'u9', 'organization_id': ORG,
                                                  'org_role': 'student'}})
        assert 'belongs to a student' in result['error']

    def test_a_teen_email_that_is_taken(self):
        result, m = _run({'guardians': [MUM], 'children': [TEEN]},
                         existing={TEEN['email']: {'id': 'u8', 'organization_id': None, 'role': 'student'}})
        assert result['status'] == 409
        # A platform account: the office is offered Ask to connect (af8469aa).
        assert result['code'] == 'connectable'
        assert result['connect'] == {'email': TEEN['email'], 'role': 'student', 'household_id': None}
        m['households'].create.assert_not_called()

    def test_an_adult_already_at_this_school_without_a_family_is_fine(self):
        result, _ = _run({'guardians': [MUM]},
                         existing={MUM['email']: {'id': 'u9', 'organization_id': ORG,
                                                  'org_role': 'advisor'}})
        assert 'error' not in result
