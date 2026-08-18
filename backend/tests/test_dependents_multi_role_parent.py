"""
A staff member who is also a parent must reach her own children's accounts.

Sentry OPTIO-BACKEND-6P, 2026-08-18, mid-orientation: iCreate's campus
coordinator tapped "enroll my children" in the family quest and was told "Only
parent accounts can manage dependent profiles". She is a parent — her roles are
['campus_coordinator', 'parent'] — but the check read the single `org_role`
column, which happens to carry the staff role.

This is the same shape as the bug the training catalog already fixed (_roles_of
in routes/sis/staff_training.py): at a small school the staff are parents too,
and any check that reads one role column will eventually pick the wrong one.
"""

from unittest.mock import Mock, patch

import pytest

import routes.dependents as dependents
from middleware.error_handler import AuthorizationError


def _client_returning(user_row):
    client = Mock()
    query = Mock()
    query.select.return_value = query
    query.eq.return_value = query
    query.execute.return_value = Mock(data=[user_row] if user_row else [])
    client.table.return_value = query
    return client


def _verify(user_row):
    with patch.object(dependents, 'get_supabase_admin_client',
                      return_value=_client_returning(user_row)):
        return dependents.verify_parent_role('user-1')


def test_coordinator_who_is_also_a_parent_is_allowed():
    """The exact account from the incident."""
    assert _verify({
        'role': 'org_managed',
        'org_role': 'campus_coordinator',
        'org_roles': ['campus_coordinator', 'parent'],
    }) is True


def test_advisor_who_is_also_a_parent_is_allowed():
    """Same shape, the commoner case — 4 iCreate accounts are parent+advisor."""
    assert _verify({
        'role': 'org_managed',
        'org_role': 'advisor',
        'org_roles': ['advisor', 'parent'],
    }) is True


def test_plain_org_parent_still_allowed():
    assert _verify({'role': 'org_managed', 'org_role': 'parent',
                    'org_roles': ['parent']}) is True


def test_platform_parent_still_allowed():
    assert _verify({'role': 'parent', 'org_role': None, 'org_roles': None}) is True


def test_superadmin_still_allowed():
    assert _verify({'role': 'superadmin', 'org_role': None, 'org_roles': None}) is True


def test_staff_who_is_not_a_parent_is_still_refused():
    """The check must not have been widened into 'any staff member'."""
    with pytest.raises(AuthorizationError):
        _verify({'role': 'org_managed', 'org_role': 'campus_coordinator',
                 'org_roles': ['campus_coordinator']})


def test_student_is_still_refused():
    with pytest.raises(AuthorizationError):
        _verify({'role': 'org_managed', 'org_role': 'student',
                 'org_roles': ['student']})
