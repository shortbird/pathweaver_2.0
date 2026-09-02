"""A class page answers to every role its caller holds, not to org_roles[0].

Sentry OPTIO-WEB-F: the head of Teen Entrepreneurship opened a class in her own
organization and got "Access denied". She is
org_roles = ['advisor', 'observer', 'org_admin']; get_effective_role returns
org_roles[0], so the whole request judged her an advisor, and
can_user_access_class asked whether an advisor was assigned to that specific
class. She is the org admin. Nothing in the stack ever looked.

The same shape has now produced three bugs -- OPTIO-BACKEND-6P (a campus
coordinator locked out of her own children's accounts), OPTIO-WEB-3/E (an
assistant teacher 403'd off the class she teaches), and this one -- so what is
pinned here is the rule rather than the one endpoint: authorize on the full
role list, and never on whichever role happens to sort first.
"""

from unittest.mock import Mock, patch

import pytest

from repositories.class_repository import ClassRepository
from routes.classes._caller import get_caller, is_staff, is_superadmin


ORG = 'd7df4378-d149-45cf-969b-ec510d0ac0e0'
OTHER_ORG = '11111111-1111-4111-8111-111111111111'
CLASS = '66666666-6666-4666-8666-666666666666'
HEAD_OF_SCHOOL = '365a8a59-b7ea-4dac-b0fd-414a7374cb35'
STUDENT = '99999999-9999-4999-8999-999999999999'

CLASS_ROW = {'id': CLASS, 'organization_id': ORG, 'name': 'Venture Lab'}


def _repo(*, is_advisor=False, is_enrolled=False):
    repo = ClassRepository.__new__(ClassRepository)
    repo.find_by_id = Mock(return_value=CLASS_ROW)
    repo.is_class_advisor = Mock(return_value=is_advisor)
    repo.is_enrolled_student = Mock(return_value=is_enrolled)
    return repo


@pytest.mark.unit
class TestAnAccountIsJudgedOnEveryRoleItHolds:
    def test_an_org_admin_listed_first_as_an_advisor_reaches_her_own_class(self):
        """The reported bug, exactly: advisor sorts first, org_admin is real."""
        repo = _repo(is_advisor=False)
        assert repo.can_user_access_class(
            CLASS, HEAD_OF_SCHOOL, ['advisor', 'observer', 'org_admin'], ORG) is True

    def test_a_campus_coordinator_reaches_her_campus_classes(self):
        """Coordinators run the campus; the restriction on them is financial,
        not scope-based (utils/sis_roles.py)."""
        repo = _repo()
        assert repo.can_user_access_class(
            CLASS, HEAD_OF_SCHOOL, ['campus_coordinator'], ORG) is True

    def test_an_org_admin_of_a_DIFFERENT_org_is_still_refused(self):
        """Widening the role check must not widen the org check."""
        repo = _repo()
        assert repo.can_user_access_class(
            CLASS, HEAD_OF_SCHOOL, ['org_admin'], OTHER_ORG) is False

    def test_a_teacher_who_is_also_a_learner_keeps_the_student_branch(self):
        """The reason a most-capable-role ranking would not have worked: an
        account holding 'advisor' first must still reach a class it is
        ENROLLED in, which only the student branch answers."""
        repo = _repo(is_advisor=False, is_enrolled=True)
        assert repo.can_user_access_class(
            CLASS, STUDENT, ['advisor', 'student'], OTHER_ORG) is True

    def test_a_plain_student_of_another_org_is_refused(self):
        repo = _repo(is_advisor=False, is_enrolled=False)
        assert repo.can_user_access_class(
            CLASS, STUDENT, ['student'], OTHER_ORG) is False

    def test_one_role_as_a_bare_string_still_works(self):
        """The signature accepts either shape, so no call site can silently
        keep the old one-role-wins behaviour by passing a string."""
        repo = _repo()
        assert repo.can_user_access_class(CLASS, HEAD_OF_SCHOOL, 'org_admin', ORG) is True
        assert repo.can_user_access_class(CLASS, HEAD_OF_SCHOOL, 'superadmin', None) is True

    def test_no_roles_at_all_is_refused_not_crashed(self):
        repo = _repo()
        assert repo.can_user_access_class(CLASS, HEAD_OF_SCHOOL, None, ORG) is False
        assert repo.can_user_access_class(CLASS, HEAD_OF_SCHOOL, [], ORG) is False

    def test_managing_a_class_asks_the_same_question(self):
        repo = _repo()
        assert repo.can_user_manage_class(
            CLASS, HEAD_OF_SCHOOL, ['advisor', 'observer', 'org_admin'], ORG) is True


@pytest.mark.unit
class TestTheCallerHelper:
    """One helper for the whole classes module. It replaced five copies of a
    `get_user_info` that each dropped org_roles on the floor."""

    def _caller_with(self, row):
        client = Mock()
        (client.table.return_value.select.return_value.eq.return_value
         .execute.return_value) = Mock(data=[row] if row else [])
        with patch('routes.classes._caller.get_supabase_admin_client',
                   return_value=client):
            return get_caller(HEAD_OF_SCHOOL), client

    def test_it_selects_org_roles(self):
        """The column the old helpers never asked for. A gate that checks a
        column its query omits is a gate that never fires."""
        _, client = self._caller_with(
            {'id': HEAD_OF_SCHOOL, 'role': 'org_managed', 'org_role': 'advisor',
             'org_roles': ['advisor', 'org_admin'], 'organization_id': ORG})
        selected = client.table.return_value.select.call_args.args[0]
        assert 'org_roles' in selected

    def test_it_returns_every_role(self):
        (roles, org_id, row), _ = self._caller_with(
            {'id': HEAD_OF_SCHOOL, 'role': 'org_managed', 'org_role': 'advisor',
             'org_roles': ['advisor', 'observer', 'org_admin'], 'organization_id': ORG})
        assert set(roles) == {'advisor', 'observer', 'org_admin'}
        assert org_id == ORG
        assert row['id'] == HEAD_OF_SCHOOL

    def test_a_missing_user_is_no_roles_not_a_crash(self):
        (roles, org_id, row), _ = self._caller_with(None)
        assert roles == [] and org_id is None and row is None
        assert not is_superadmin(roles) and not is_staff(roles)

    def test_staff_and_superadmin_read_the_whole_list(self):
        assert is_superadmin(['advisor', 'superadmin']) is True
        assert is_staff(['student', 'advisor']) is True
        assert is_staff(['student', 'parent']) is False
        assert is_staff(None) is False
