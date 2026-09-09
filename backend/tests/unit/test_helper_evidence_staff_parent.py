"""Guard: a staff member who is also a parent may upload their own child's evidence.

At a co-op school the staff enrol their own children. The advisor teaching third
period is also somebody's mother, and her claim on THOSE students is
`users.managed_by_parent_id`, not a row in advisor_student_assignments.

`resolve_helper_role` used to be an if/elif on the platform role alone:

    if user_role in ('advisor', 'org_admin', 'superadmin'): verify_advisor_access(...)
    elif user_role == 'parent':                             verify_parent_access(...)

so anyone holding a staff role was only ever measured against advisor
assignments. Their own children came back "You do not have access to this
student's data" — the check never asked the question that would have said yes.
6 staff across 2 orgs were locked out of 15 children's evidence (Perch dcc5f65c).

The read side never had the bug, which is what made it so confusing to report:
`@require_relationship_to(allow=('advisor', 'parent'))` tries each relationship
in turn, so she could SEE her children's tasks on the very screen whose upload
button refused her. These tests pin the write side to the same rule.
"""

from unittest.mock import patch

import pytest

from middleware.error_handler import AuthorizationError, NotFoundError
from routes import helper_evidence


ADVISOR_MOM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
HER_KID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
TAUGHT_STUDENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
STRANGER_KID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'


def _resolve(role, *, advisor_of=(), parent_of=(), student=HER_KID):
    """Run resolve_helper_role with the two claim lookups stubbed."""
    with patch.object(helper_evidence, 'UserRepository') as user_repo, \
         patch.object(helper_evidence, 'has_advisor_claim',
                      side_effect=lambda _c, s: s in advisor_of) as adv, \
         patch.object(helper_evidence, 'has_parent_claim',
                      side_effect=lambda _c, s: s in parent_of) as par:
        user_repo.return_value.find_by_id.return_value = {
            'id': ADVISOR_MOM, 'role': role, 'org_role': None,
        }
        result = helper_evidence.resolve_helper_role(ADVISOR_MOM, student)
    return result, adv, par


def test_advisor_uploading_for_her_own_child_is_a_parent():
    """The bug. Staff role, no advisor assignment, but she is the child's mother."""
    role, _adv, par = _resolve('advisor', advisor_of=(), parent_of=(HER_KID,))
    assert role == 'parent'
    par.assert_called_once_with(ADVISOR_MOM, HER_KID)


def test_org_admin_uploading_for_her_own_child_is_a_parent():
    role, _adv, _par = _resolve('org_admin', advisor_of=(), parent_of=(HER_KID,))
    assert role == 'parent'


def test_advisor_claim_wins_for_a_student_she_actually_teaches():
    """Not a regression of the old behaviour — the advisor path still comes first.

    It matters which one answers: the return value becomes `uploaded_by_role`,
    and only a 'parent' block may be removed by its uploader afterwards.
    """
    role, adv, par = _resolve('advisor', advisor_of=(TAUGHT_STUDENT,),
                              parent_of=(), student=TAUGHT_STUDENT)
    assert role == 'advisor'
    adv.assert_called_once_with(ADVISOR_MOM, TAUGHT_STUDENT)
    par.assert_not_called()


def test_advisor_with_neither_claim_is_still_refused():
    """The fix widens who passes, not what passes for a relationship."""
    with pytest.raises(AuthorizationError, match="do not have access"):
        _resolve('advisor', advisor_of=(), parent_of=(), student=STRANGER_KID)


def test_plain_parent_still_needs_the_parent_claim():
    role, adv, _par = _resolve('parent', advisor_of=(), parent_of=(HER_KID,))
    assert role == 'parent'
    # A parent account is never measured against advisor assignments.
    adv.assert_not_called()


def test_plain_parent_without_a_claim_is_refused():
    with pytest.raises(AuthorizationError, match="do not have access"):
        _resolve('parent', advisor_of=(), parent_of=(), student=STRANGER_KID)


def test_a_student_may_not_upload_as_a_helper():
    with pytest.raises(AuthorizationError, match="Only advisors and parents"):
        _resolve('student', advisor_of=(), parent_of=(HER_KID,))


def test_superadmin_keeps_universal_access():
    """Both deleted verify_* helpers granted this; the resolver must not drop it."""
    role, adv, par = _resolve('superadmin', advisor_of=(), parent_of=())
    assert role == 'advisor'
    adv.assert_not_called()
    par.assert_not_called()


def test_org_managed_staff_resolve_through_org_role():
    """iCreate staff are role='org_managed' with the real role in org_role.

    The resolver must read the effective role, or every org teacher falls
    through to "Only advisors and parents can upload evidence for students".
    """
    with patch.object(helper_evidence, 'UserRepository') as user_repo, \
         patch.object(helper_evidence, 'has_advisor_claim', return_value=False), \
         patch.object(helper_evidence, 'has_parent_claim', return_value=True):
        user_repo.return_value.find_by_id.return_value = {
            'id': ADVISOR_MOM, 'role': 'org_managed', 'org_role': 'advisor',
        }
        assert helper_evidence.resolve_helper_role(ADVISOR_MOM, HER_KID) == 'parent'


def test_unknown_caller_is_not_found():
    with patch.object(helper_evidence, 'UserRepository') as user_repo:
        user_repo.return_value.find_by_id.return_value = None
        with pytest.raises(NotFoundError):
            helper_evidence.resolve_helper_role(ADVISOR_MOM, HER_KID)
