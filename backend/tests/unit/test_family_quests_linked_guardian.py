"""A guardian by link gets the family quests, the same as a guardian by role.

Horizon's director (role org_admin, no parent role anywhere, three approved
parent_student_links) was sent to /family by the web -- userHasFamily()
counts links -- and refused by /api/family/quests, which asked only about
the role columns (Sentry OPTIO-WEB issue 7738367034, ticket 9d5a6b40,
2026-09-17). The family every route here reads is derived from those same
links, so a linked guardian can only ever see their own family.
"""

from unittest.mock import patch

import pytest

from middleware.error_handler import AuthorizationError
from routes import family_quests


def _refuse(_user_id):
    raise AuthorizationError('Only parent accounts can manage dependent profiles')


def test_a_parent_by_role_passes_without_a_link_lookup():
    with patch.object(family_quests, 'verify_parent_role', return_value=True), \
         patch('utils.class_membership.children_of_parent') as links:
        family_quests.verify_family_access('parent-1')
    links.assert_not_called()


def test_a_guardian_by_link_passes():
    with patch.object(family_quests, 'verify_parent_role', side_effect=_refuse), \
         patch('utils.class_membership.children_of_parent', return_value={'child-1', 'child-2'}):
        family_quests.verify_family_access('director-1')


def test_neither_role_nor_link_is_refused_as_before():
    with patch.object(family_quests, 'verify_parent_role', side_effect=_refuse), \
         patch('utils.class_membership.children_of_parent', return_value=set()):
        with pytest.raises(AuthorizationError):
            family_quests.verify_family_access('nobody-1')


def test_every_gate_in_the_module_uses_the_shared_definition():
    """A route that still calls verify_parent_role directly would refuse the
    linked guardian on that one action while the rest of the page works."""
    import inspect
    source = inspect.getsource(family_quests)
    body = source.split('def verify_family_access', 1)[1]
    after_helper = body.split('@bp.route', 1)[1]
    assert 'verify_parent_role(' not in after_helper
    assert after_helper.count('verify_family_access(user_id)') >= 6
