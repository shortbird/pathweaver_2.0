"""
Tests for bounty visibility rules — who sees and who can claim a bounty.

Regression coverage for the family-visibility gap where students linked via
parent_student_links (13+ kids) could not see their parent's family bounties:
the board filter only matched managed_by_parent_id (dependents) and observer
links, while creation targeting (_get_posters_student_ids) included parent
links. The two sides must stay symmetric.
"""

from unittest.mock import Mock, patch

import pytest

from services.bounty_service import BountyService


POSTER = 'parent-1'
STUDENT = 'student-1'


def _bounty(**over):
    b = {
        'id': 'bounty-1',
        'poster_id': POSTER,
        'title': 'Clean the garage',
        'visibility': 'family',
        'allowed_student_ids': None,
        'organization_id': None,
        'status': 'active',
        'cohort_class_id': None,
    }
    b.update(over)
    return b


def _service_with(user_row, parent_links=None, observer_links=None, bounties=None):
    """BountyService with a mocked repository. Table queries are routed by
    table name so each relationship source can be scripted independently."""
    service = BountyService.__new__(BountyService)
    service.repository = Mock()
    service.wallet_repository = Mock()
    service.repository.list_active_bounties.return_value = bounties or []

    def table_router(name):
        table = Mock()
        for chained in ('select', 'eq', 'in_', 'order', 'single'):
            getattr(table, chained).return_value = table
        if name == 'users':
            table.execute.return_value = Mock(data=[user_row] if user_row else [])
        elif name == 'parent_student_links':
            table.execute.return_value = Mock(data=parent_links or [])
        elif name == 'observer_student_links':
            table.execute.return_value = Mock(data=observer_links or [])
        elif name == 'organizations':
            table.execute.return_value = Mock(data={'feature_flags': {}})
        else:
            table.execute.return_value = Mock(data=[])
        return table

    service.repository.client.table.side_effect = table_router
    return service


@pytest.mark.unit
class TestFamilyVisibilityOnBoard:
    def test_dependent_sees_managing_parents_family_bounty(self):
        service = _service_with(
            user_row={'id': STUDENT, 'role': 'org_managed',
                      'organization_id': None, 'managed_by_parent_id': POSTER},
            bounties=[_bounty()],
        )
        visible = service.list_bounties(STUDENT)
        assert [b['id'] for b in visible] == ['bounty-1']

    def test_parent_linked_student_sees_family_bounty(self):
        """The regression: a 13+ kid linked via parent_student_links (not
        managed_by_parent_id) must see their parent's family bounty."""
        service = _service_with(
            user_row={'id': STUDENT, 'role': 'student',
                      'organization_id': None, 'managed_by_parent_id': None},
            parent_links=[{'parent_user_id': POSTER}],
            bounties=[_bounty()],
        )
        visible = service.list_bounties(STUDENT)
        assert [b['id'] for b in visible] == ['bounty-1']

    def test_observer_linked_student_sees_family_bounty(self):
        service = _service_with(
            user_row={'id': STUDENT, 'role': 'student',
                      'organization_id': None, 'managed_by_parent_id': None},
            observer_links=[{'observer_id': POSTER}],
            bounties=[_bounty()],
        )
        visible = service.list_bounties(STUDENT)
        assert [b['id'] for b in visible] == ['bounty-1']

    def test_unrelated_student_cannot_see_family_bounty(self):
        service = _service_with(
            user_row={'id': STUDENT, 'role': 'student',
                      'organization_id': None, 'managed_by_parent_id': None},
            bounties=[_bounty()],
        )
        assert service.list_bounties(STUDENT) == []

    def test_allowed_student_ids_restricts_within_family(self):
        service = _service_with(
            user_row={'id': STUDENT, 'role': 'student',
                      'organization_id': None, 'managed_by_parent_id': None},
            parent_links=[{'parent_user_id': POSTER}],
            bounties=[_bounty(allowed_student_ids=['someone-else'])],
        )
        assert service.list_bounties(STUDENT) == []

    def test_allowed_student_ids_includes_this_student(self):
        service = _service_with(
            user_row={'id': STUDENT, 'role': 'student',
                      'organization_id': None, 'managed_by_parent_id': None},
            parent_links=[{'parent_user_id': POSTER}],
            bounties=[_bounty(allowed_student_ids=[STUDENT])],
        )
        visible = service.list_bounties(STUDENT)
        assert [b['id'] for b in visible] == ['bounty-1']

    def test_public_bounty_visible_to_everyone(self):
        service = _service_with(
            user_row={'id': STUDENT, 'role': 'student',
                      'organization_id': None, 'managed_by_parent_id': None},
            bounties=[_bounty(visibility='public')],
        )
        visible = service.list_bounties(STUDENT)
        assert [b['id'] for b in visible] == ['bounty-1']

    def test_org_bounty_only_visible_to_same_org(self):
        org_bounty = _bounty(visibility='organization', organization_id='org-1')
        same_org = _service_with(
            user_row={'id': STUDENT, 'role': 'org_managed',
                      'organization_id': 'org-1', 'managed_by_parent_id': None},
            bounties=[org_bounty],
        )
        other_org = _service_with(
            user_row={'id': STUDENT, 'role': 'org_managed',
                      'organization_id': 'org-2', 'managed_by_parent_id': None},
            bounties=[org_bounty],
        )
        assert [b['id'] for b in same_org.list_bounties(STUDENT)] == ['bounty-1']
        assert other_org.list_bounties(STUDENT) == []


@pytest.mark.unit
class TestClaimVisibilityEnforcement:
    """Claiming goes through the same access rules — a direct link to a
    family bounty must not let an unrelated student claim it."""

    def _claim(self, service, bounty):
        service.repository.get_bounty_by_id.return_value = bounty
        service.repository.count_bounty_claims.return_value = 0
        service.repository.create_claim.return_value = {'id': 'claim-1'}
        from repositories.base_repository import NotFoundError
        try:
            service.claim_bounty(bounty['id'], STUDENT)
            return True
        except NotFoundError:
            return False

    def test_unrelated_student_cannot_claim_family_bounty(self):
        service = _service_with(
            user_row={'id': STUDENT, 'role': 'student',
                      'organization_id': None, 'managed_by_parent_id': None},
        )
        assert self._claim(service, _bounty()) is False

    def test_parent_linked_student_can_claim_family_bounty(self):
        service = _service_with(
            user_row={'id': STUDENT, 'role': 'student',
                      'organization_id': None, 'managed_by_parent_id': None},
            parent_links=[{'parent_user_id': POSTER}],
        )
        assert self._claim(service, _bounty()) is True

    def test_anyone_can_claim_public_bounty(self):
        service = _service_with(
            user_row={'id': STUDENT, 'role': 'student',
                      'organization_id': None, 'managed_by_parent_id': None},
        )
        assert self._claim(service, _bounty(visibility='public')) is True

    def test_allowed_student_ids_enforced_on_claim(self):
        service = _service_with(
            user_row={'id': STUDENT, 'role': 'student',
                      'organization_id': None, 'managed_by_parent_id': None},
            parent_links=[{'parent_user_id': POSTER}],
        )
        assert self._claim(service, _bounty(allowed_student_ids=['someone-else'])) is False
        assert self._claim(service, _bounty(allowed_student_ids=[STUDENT])) is True

    def test_cross_org_student_cannot_claim_org_bounty(self):
        service = _service_with(
            user_row={'id': STUDENT, 'role': 'org_managed',
                      'organization_id': 'org-2', 'managed_by_parent_id': None},
        )
        bounty = _bounty(visibility='organization', organization_id='org-1')
        assert self._claim(service, bounty) is False
