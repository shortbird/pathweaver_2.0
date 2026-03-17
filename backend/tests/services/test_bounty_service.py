"""
Unit tests for BountyService.

Tests bounty lifecycle: creation, claiming, submission, review, XP rewards,
capacity checks, and moderation. Written TDD.
"""

import pytest
import uuid
from unittest.mock import Mock, patch
from datetime import datetime, timezone, timedelta

from services.base_service import ValidationError
from repositories.base_repository import NotFoundError


def _make_service():
    from services.bounty_service import BountyService
    service = BountyService()
    service.repository = Mock()
    service.yeti_repository = Mock()
    return service


def _valid_bounty_data():
    return {
        'title': 'Read 5 Books',
        'description': 'Read 5 books this month and write reflections',
        'requirements': 'Submit a photo of each book with a 2-sentence reflection',
        'pillar': 'communication',
        'bounty_type': 'open',
        'xp_reward': 100,
        'max_participants': 10,
        'deadline': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
    }


@pytest.mark.unit
@pytest.mark.critical
class TestCreateBounty:

    def test_create_bounty_success(self):
        service = _make_service()
        poster_id = str(uuid.uuid4())
        data = _valid_bounty_data()

        service.repository.create_bounty.return_value = {
            'id': str(uuid.uuid4()),
            'poster_id': poster_id,
            'title': data['title'],
            'status': 'pending_review',
        }

        bounty = service.create_bounty(poster_id, data)

        assert bounty['status'] == 'pending_review'
        service.repository.create_bounty.assert_called_once()

    def test_create_bounty_invalid_pillar(self):
        service = _make_service()
        data = _valid_bounty_data()
        data['pillar'] = 'cooking'

        with pytest.raises(ValidationError, match="pillar"):
            service.create_bounty(str(uuid.uuid4()), data)

    def test_create_bounty_invalid_type(self):
        service = _make_service()
        data = _valid_bounty_data()
        data['bounty_type'] = 'invalid'

        with pytest.raises(ValidationError, match="bounty type"):
            service.create_bounty(str(uuid.uuid4()), data)

    def test_create_bounty_xp_too_low(self):
        service = _make_service()
        data = _valid_bounty_data()
        data['xp_reward'] = 10

        with pytest.raises(ValidationError, match="XP reward"):
            service.create_bounty(str(uuid.uuid4()), data)

    def test_create_bounty_xp_too_high(self):
        service = _make_service()
        data = _valid_bounty_data()
        data['xp_reward'] = 1000

        with pytest.raises(ValidationError, match="XP reward"):
            service.create_bounty(str(uuid.uuid4()), data)

    def test_create_bounty_missing_title(self):
        service = _make_service()
        data = _valid_bounty_data()
        del data['title']

        with pytest.raises(ValidationError):
            service.create_bounty(str(uuid.uuid4()), data)


@pytest.mark.unit
@pytest.mark.critical
class TestClaimBounty:

    def test_claim_success(self):
        service = _make_service()
        bounty_id = str(uuid.uuid4())
        student_id = str(uuid.uuid4())

        service.repository.get_bounty_by_id.return_value = {
            'id': bounty_id,
            'status': 'active',
            'max_participants': 10,
        }
        service.repository.count_bounty_claims.return_value = 3
        service.repository.create_claim.return_value = {
            'id': str(uuid.uuid4()),
            'status': 'claimed',
        }

        claim = service.claim_bounty(bounty_id, student_id)
        assert claim['status'] == 'claimed'

    def test_claim_inactive_bounty(self):
        service = _make_service()
        service.repository.get_bounty_by_id.return_value = {
            'id': str(uuid.uuid4()),
            'status': 'expired',
        }

        with pytest.raises(ValidationError, match="not active"):
            service.claim_bounty(str(uuid.uuid4()), str(uuid.uuid4()))

    def test_claim_bounty_full(self):
        service = _make_service()
        service.repository.get_bounty_by_id.return_value = {
            'id': str(uuid.uuid4()),
            'status': 'active',
            'max_participants': 5,
        }
        service.repository.count_bounty_claims.return_value = 5

        with pytest.raises(ValidationError, match="maximum"):
            service.claim_bounty(str(uuid.uuid4()), str(uuid.uuid4()))

    def test_claim_bounty_not_found(self):
        service = _make_service()
        service.repository.get_bounty_by_id.return_value = None

        with pytest.raises(NotFoundError):
            service.claim_bounty(str(uuid.uuid4()), str(uuid.uuid4()))


@pytest.mark.unit
@pytest.mark.critical
class TestSubmitEvidence:

    def test_submit_success(self):
        service = _make_service()
        claim_id = str(uuid.uuid4())
        student_id = str(uuid.uuid4())
        evidence = {'text': 'I read 5 books', 'media_urls': []}

        service.repository.get_claim.return_value = {
            'id': claim_id,
            'student_id': student_id,
            'status': 'claimed',
        }
        service.repository.submit_evidence.return_value = {
            'id': claim_id,
            'status': 'submitted',
            'evidence': evidence,
        }

        result = service.submit_evidence(claim_id, student_id, evidence)
        assert result['status'] == 'submitted'

    def test_submit_wrong_student(self):
        service = _make_service()
        service.repository.get_claim.return_value = {
            'id': str(uuid.uuid4()),
            'student_id': str(uuid.uuid4()),
            'status': 'claimed',
        }

        with pytest.raises(ValidationError, match="own claims"):
            service.submit_evidence(str(uuid.uuid4()), str(uuid.uuid4()), {})

    def test_submit_already_approved(self):
        service = _make_service()
        student_id = str(uuid.uuid4())
        service.repository.get_claim.return_value = {
            'id': str(uuid.uuid4()),
            'student_id': student_id,
            'status': 'approved',
        }

        with pytest.raises(ValidationError, match="Cannot submit"):
            service.submit_evidence(str(uuid.uuid4()), student_id, {})

    def test_submit_after_revision_request(self):
        service = _make_service()
        claim_id = str(uuid.uuid4())
        student_id = str(uuid.uuid4())

        service.repository.get_claim.return_value = {
            'id': claim_id,
            'student_id': student_id,
            'status': 'revision_requested',
        }
        service.repository.submit_evidence.return_value = {'status': 'submitted'}

        result = service.submit_evidence(claim_id, student_id, {'text': 'Updated'})
        assert result['status'] == 'submitted'


@pytest.mark.unit
@pytest.mark.critical
class TestReviewSubmission:

    def test_approve_awards_xp(self):
        service = _make_service()
        claim_id = str(uuid.uuid4())
        reviewer_id = str(uuid.uuid4())
        student_id = str(uuid.uuid4())
        bounty_id = str(uuid.uuid4())

        service.repository.get_claim.return_value = {
            'id': claim_id,
            'student_id': student_id,
            'bounty_id': bounty_id,
            'status': 'submitted',
        }
        service.repository.create_review.return_value = {'id': str(uuid.uuid4())}
        service.repository.update_claim_status.return_value = {'id': claim_id, 'status': 'approved'}
        service.repository.get_bounty_by_id.return_value = {
            'id': bounty_id,
            'pillar': 'stem',
            'xp_reward': 100,
        }

        # Patch the lazy import of XPService inside _award_bounty_xp
        mock_xp_inst = Mock()
        with patch.dict('sys.modules', {}):
            with patch('services.xp_service.XPService', return_value=mock_xp_inst):
                result = service.review_submission(claim_id, reviewer_id, 'approved', 'Great work!')

        assert result['status'] == 'approved'
        # Spendable XP should be awarded
        service.yeti_repository.add_spendable_xp.assert_called_once_with(student_id, 100)

    def test_reject_no_xp(self):
        service = _make_service()
        claim_id = str(uuid.uuid4())
        student_id = str(uuid.uuid4())

        service.repository.get_claim.return_value = {
            'id': claim_id,
            'student_id': student_id,
            'bounty_id': str(uuid.uuid4()),
            'status': 'submitted',
        }
        service.repository.create_review.return_value = {'id': str(uuid.uuid4())}
        service.repository.update_claim_status.return_value = {'status': 'rejected'}

        result = service.review_submission(claim_id, str(uuid.uuid4()), 'rejected', 'Try again')
        assert result['status'] == 'rejected'
        service.yeti_repository.add_spendable_xp.assert_not_called()

    def test_review_invalid_decision(self):
        service = _make_service()

        with pytest.raises(ValidationError, match="Invalid decision"):
            service.review_submission(str(uuid.uuid4()), str(uuid.uuid4()), 'maybe')

    def test_review_non_submitted_claim(self):
        service = _make_service()
        service.repository.get_claim.return_value = {
            'id': str(uuid.uuid4()),
            'status': 'claimed',
        }

        with pytest.raises(ValidationError, match="submitted"):
            service.review_submission(str(uuid.uuid4()), str(uuid.uuid4()), 'approved')


@pytest.mark.unit
class TestModerateBounty:

    def test_approve_activates_bounty(self):
        service = _make_service()
        bounty_id = str(uuid.uuid4())

        service.repository.update_moderation_status.return_value = {'moderation_status': 'manually_approved'}
        service.repository.update_bounty_status.return_value = {
            'id': bounty_id,
            'status': 'active',
            'moderation_status': 'manually_approved',
        }

        result = service.moderate_bounty(bounty_id, 'manually_approved', 'Looks good')
        assert result['status'] == 'active'

    def test_reject_does_not_activate(self):
        service = _make_service()
        bounty_id = str(uuid.uuid4())

        service.repository.update_moderation_status.return_value = {
            'id': bounty_id,
            'moderation_status': 'rejected',
        }

        result = service.moderate_bounty(bounty_id, 'rejected', 'Not appropriate')
        service.repository.update_bounty_status.assert_not_called()

    def test_invalid_moderation_status(self):
        service = _make_service()

        with pytest.raises(ValidationError, match="moderation status"):
            service.moderate_bounty(str(uuid.uuid4()), 'pending')
