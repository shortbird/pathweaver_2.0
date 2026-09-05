"""
A teacher raising a hand from the room.

iCreate, 2026-08-25 (9d0618f8): "it would be super helpful to have a Campus
Coordinator 'call button'? ... this button would send a notification to any
campus coordinator role when a teacher needed help in the class. Just not sure
how this could show up for the campus coordinator that they would notice it?"

It shows up as a notification — the surface that already rings their bell and
pushes to their phone. What is worth pinning down is WHO gets called: every
coordinator, every admin (a school may have no coordinator on shift, and a call
that reaches nobody is worse than no button), and never the caller themselves.
"""

from unittest.mock import patch

import pytest

from services import sis_service


ORG = 'org-1'

STAFF = [
    {'id': 'molly', 'roles': ['org_admin']},
    {'id': 'katrine', 'roles': ['campus_coordinator']},
    {'id': 'both', 'roles': ['campus_coordinator', 'advisor']},
    {'id': 'ana', 'roles': ['advisor']},
    {'id': 'nobody', 'roles': []},
]


def _front_office(staff=STAFF):
    with patch.object(sis_service, 'list_org_staff', return_value=staff):
        return sis_service.front_office_ids(ORG)


@pytest.mark.unit
class TestWhoGetsCalled:
    def test_coordinators_are_called(self):
        assert 'katrine' in _front_office()

    def test_admins_are_called_too(self):
        """A school may have no coordinator on shift."""
        assert 'molly' in _front_office()

    def test_a_plain_teacher_is_not(self):
        """The point is to reach the office, not the staffroom."""
        assert 'ana' not in _front_office()
        assert 'nobody' not in _front_office()

    def test_somebody_holding_both_roles_is_called_once(self):
        assert _front_office().count('both') == 1

    def test_a_school_with_no_office_returns_nobody_rather_than_everybody(self):
        """The caller reads an empty list as "tell the office directly" — it must
        never fall back to notifying the whole staff."""
        assert _front_office([{'id': 'ana', 'roles': ['advisor']}]) == []
