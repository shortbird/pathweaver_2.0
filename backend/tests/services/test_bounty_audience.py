"""
Bounty audience rules (2026-07-28).

Teachers can now claim bounties — training bonuses their school posts. The
audience field is what keeps the two boards apart, and these tests pin the
property that matters: a teacher must not be able to claim a bounty a parent
posted for their own child, and a student must not pick up staff training.
"""

import uuid
from unittest.mock import Mock

import pytest

from services.base_service import ValidationError
from repositories.base_repository import NotFoundError


def _make_service(claimer_role=None, claimer_org_role=None):
    from services.bounty_service import BountyService
    service = BountyService()
    service.repository = Mock()
    service.wallet_repository = Mock()
    # One user-row shape serves both lookups the service makes: the claimer's
    # role, and the poster's name when building sponsor info.
    rows = ([{'role': claimer_role, 'org_role': claimer_org_role,
              'display_name': 'Test User', 'first_name': 'Test', 'last_name': 'User'}]
            if claimer_role is not None else [])
    service.repository.client.table.return_value.select.return_value \
        .eq.return_value.execute.return_value.data = rows
    return service


def _bounty(audience=None, **extra):
    b = {'id': str(uuid.uuid4()), 'status': 'active', 'max_participants': 0}
    if audience is not None:
        b['audience'] = audience
    b.update(extra)
    return b


@pytest.mark.unit
class TestAudienceGate:

    def test_student_can_claim_a_student_bounty(self):
        service = _make_service(claimer_role='student')
        service.repository.get_bounty_by_id.return_value = _bounty('students')
        service.repository.create_claim.return_value = {'id': 'c1', 'status': 'claimed'}

        claim = service.claim_bounty(str(uuid.uuid4()), str(uuid.uuid4()))

        assert claim['status'] == 'claimed'

    def test_teacher_cannot_claim_a_student_bounty(self):
        service = _make_service(claimer_role='advisor')
        service.repository.get_bounty_by_id.return_value = _bounty('students')

        with pytest.raises(NotFoundError):
            service.claim_bounty(str(uuid.uuid4()), str(uuid.uuid4()))
        service.repository.create_claim.assert_not_called()

    def test_teacher_can_claim_a_staff_bounty(self):
        service = _make_service(claimer_role='advisor')
        service.repository.get_bounty_by_id.return_value = _bounty('staff')
        service.repository.create_claim.return_value = {'id': 'c2', 'status': 'claimed'}

        claim = service.claim_bounty(str(uuid.uuid4()), str(uuid.uuid4()))

        assert claim['status'] == 'claimed'

    def test_student_cannot_claim_a_staff_bounty(self):
        service = _make_service(claimer_role='student')
        service.repository.get_bounty_by_id.return_value = _bounty('staff')

        with pytest.raises(NotFoundError):
            service.claim_bounty(str(uuid.uuid4()), str(uuid.uuid4()))
        service.repository.create_claim.assert_not_called()

    def test_org_managed_teacher_is_recognised_by_org_role(self):
        """Org-managed staff carry 'org_managed' in role and the real one in
        org_role — reading only `role` would misfile them as students."""
        service = _make_service(claimer_role='org_managed', claimer_org_role='advisor')
        service.repository.get_bounty_by_id.return_value = _bounty('staff')
        service.repository.create_claim.return_value = {'id': 'c3', 'status': 'claimed'}

        assert service.claim_bounty(str(uuid.uuid4()), str(uuid.uuid4()))['status'] == 'claimed'

    def test_bounty_with_no_audience_behaves_as_a_student_bounty(self):
        """Every bounty that existed before this change has no audience set."""
        service = _make_service(claimer_role='student')
        service.repository.get_bounty_by_id.return_value = _bounty(None)
        service.repository.create_claim.return_value = {'id': 'c4', 'status': 'claimed'}

        assert service.claim_bounty(str(uuid.uuid4()), str(uuid.uuid4()))['status'] == 'claimed'

    def test_unresolvable_claimer_cannot_claim_staff_training(self):
        """Fail closed: if we can't confirm someone is staff, they don't get a
        staff bounty."""
        service = _make_service()  # no user row configured
        service.repository.client.table.return_value.select.return_value \
            .eq.return_value.execute.return_value.data = []
        service.repository.get_bounty_by_id.return_value = _bounty('staff')

        with pytest.raises(NotFoundError):
            service.claim_bounty(str(uuid.uuid4()), str(uuid.uuid4()))


@pytest.mark.unit
class TestStaffBountyCreation:

    def _data(self, **extra):
        d = {
            'title': 'Whole Brain Learning',
            'description': 'Finish the course and try one technique in class',
            'deliverables': ['Watch the videos', 'Write a short reflection'],
            'visibility': 'organization',
            'audience': 'staff',
        }
        d.update(extra)
        return d

    def test_staff_bounty_is_created_with_its_audience(self):
        service = _make_service(claimer_role='org_admin')
        service.repository.create_bounty.return_value = {'id': 'b1', 'title': 'x'}

        service.create_bounty(str(uuid.uuid4()), self._data())

        payload = service.repository.create_bounty.call_args[0][0]
        assert payload['audience'] == 'staff'

    def test_staff_bounty_must_be_organization_visible(self):
        """Public or family visibility would put a school's internal training on
        other schools' boards."""
        service = _make_service()

        with pytest.raises(ValidationError, match='organization'):
            service.create_bounty(str(uuid.uuid4()), self._data(visibility='public'))

    def test_unknown_audience_is_rejected(self):
        service = _make_service()

        with pytest.raises(ValidationError, match='audience'):
            service.create_bounty(str(uuid.uuid4()), self._data(audience='everyone'))

    def test_audience_defaults_to_students(self):
        service = _make_service(claimer_role='org_admin')
        service.repository.create_bounty.return_value = {'id': 'b2', 'title': 'x'}

        data = self._data()
        data.pop('audience')
        data['visibility'] = 'public'
        service.create_bounty(str(uuid.uuid4()), data)

        payload = service.repository.create_bounty.call_args[0][0]
        assert payload['audience'] == 'students'
