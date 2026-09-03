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
    service.wallet_repository = Mock()
    # create_bounty looks the poster up through repository.client to decide
    # whether to stamp an "Optio" sponsor badge. An empty result keeps that
    # branch inert; a bare Mock makes `poster.data[0]` blow up instead.
    empty = Mock()
    empty.data = []
    service.repository.client.table.return_value.select.return_value \
        .eq.return_value.execute.return_value = empty
    return service


def _valid_bounty_data():
    return {
        'title': 'Read 5 Books',
        'description': 'Read 5 books this month and write reflections',
        'requirements': 'Submit a photo of each book with a 2-sentence reflection',
        'pillar': 'communication',
        'bounty_type': 'open',
        # Rewards are a list now; the flat xp_reward/pillar pair is derived from
        # it (xp_reward becomes the SUM, pillar the first xp reward's pillar),
        # and this list is where XP-range and pillar validation happen.
        'rewards': [{'type': 'xp', 'value': 100, 'pillar': 'communication'}],
        'max_participants': 10,
        'deadline': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        # Required since bounties gained deliverables; without it every
        # create_bounty call fails on "At least one deliverable is required"
        # before reaching the field being tested.
        'deliverables': [{'text': 'Submit a short write-up'}],
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
        data['rewards'] = [{'type': 'xp', 'value': 100, 'pillar': 'cooking'}]

        with pytest.raises(ValidationError, match="pillar"):
            service.create_bounty(str(uuid.uuid4()), data)

    def test_create_bounty_invalid_type(self):
        """An unknown bounty_type is rejected as a readable 400, not passed
        through to die on the Postgres CHECK as an opaque 500."""
        service = _make_service()
        data = _valid_bounty_data()
        data['bounty_type'] = 'invalid'

        with pytest.raises(ValidationError, match="bounty type"):
            service.create_bounty(str(uuid.uuid4()), data)

    def test_create_bounty_past_deadline_rejected(self):
        service = _make_service()
        data = _valid_bounty_data()
        data['deadline'] = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()

        with pytest.raises(ValidationError, match="future"):
            service.create_bounty(str(uuid.uuid4()), data)

    def test_create_bounty_total_xp_capped(self):
        """Per-reward XP is capped at 200, but the stored xp_reward is the SUM —
        which the DB CHECKs at 500. The service must reject the total, or three
        200-XP rewards become a Postgres error."""
        service = _make_service()
        data = _valid_bounty_data()
        data['rewards'] = [{'type': 'xp', 'value': 200, 'pillar': 'stem'}] * 3

        with pytest.raises(ValidationError, match="Total XP"):
            service.create_bounty(str(uuid.uuid4()), data)

    def test_create_bounty_xp_too_low(self):
        service = _make_service()
        data = _valid_bounty_data()
        data['rewards'] = [{'type': 'xp', 'value': 10, 'pillar': 'stem'}]

        with pytest.raises(ValidationError, match="XP reward"):
            service.create_bounty(str(uuid.uuid4()), data)

    def test_create_bounty_xp_too_high(self):
        service = _make_service()
        data = _valid_bounty_data()
        data['rewards'] = [{'type': 'xp', 'value': 1000, 'pillar': 'stem'}]

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
        service.repository.get_claim_by_bounty_and_student.return_value = None
        service.repository.count_bounty_claims.return_value = 3
        service.repository.create_claim.return_value = {
            'id': str(uuid.uuid4()),
            'status': 'claimed',
        }

        claim = service.claim_bounty(bounty_id, student_id)
        assert claim['status'] == 'claimed'

    def test_claim_already_claimed(self):
        service = _make_service()
        service.repository.get_bounty_by_id.return_value = {
            'id': str(uuid.uuid4()), 'status': 'active', 'max_participants': 0,
        }
        service.repository.get_claim_by_bounty_and_student.return_value = {
            'id': str(uuid.uuid4()), 'status': 'claimed',
        }

        with pytest.raises(ValidationError, match="already claimed"):
            service.claim_bounty(str(uuid.uuid4()), str(uuid.uuid4()))

    def test_claim_reopens_rejected_claim(self):
        """A rejected claim is no longer a dead end: re-claiming re-opens it
        instead of tripping the (bounty_id, student_id) unique constraint."""
        service = _make_service()
        existing_id = str(uuid.uuid4())
        service.repository.get_bounty_by_id.return_value = {
            'id': str(uuid.uuid4()), 'status': 'active', 'max_participants': 0,
        }
        service.repository.get_claim_by_bounty_and_student.return_value = {
            'id': existing_id, 'status': 'rejected',
        }
        service.repository.update_claim_status.return_value = {
            'id': existing_id, 'status': 'claimed',
        }

        claim = service.claim_bounty(str(uuid.uuid4()), str(uuid.uuid4()))
        assert claim['status'] == 'claimed'
        service.repository.update_claim_status.assert_called_once_with(existing_id, 'claimed')
        service.repository.create_claim.assert_not_called()

    def test_claim_past_deadline_rejected(self):
        service = _make_service()
        service.repository.get_bounty_by_id.return_value = {
            'id': str(uuid.uuid4()), 'status': 'active', 'max_participants': 0,
            'deadline': (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        }

        with pytest.raises(ValidationError, match="deadline"):
            service.claim_bounty(str(uuid.uuid4()), str(uuid.uuid4()))

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
        service.repository.get_claim_by_bounty_and_student.return_value = None
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
class TestTurnInBounty:
    """turn_in_bounty is the submission path (the old submit_evidence service
    method had no route and was removed)."""

    def test_turn_in_success(self):
        service = _make_service()
        claim_id = str(uuid.uuid4())
        student_id = str(uuid.uuid4())
        bounty_id = str(uuid.uuid4())
        d_id = str(uuid.uuid4())

        service.repository.get_claim.return_value = {
            'id': claim_id,
            'student_id': student_id,
            'status': 'claimed',
            'evidence': {'completed_deliverables': [d_id]},
        }
        service.repository.get_bounty_by_id.return_value = {
            'id': bounty_id,
            'poster_id': str(uuid.uuid4()),
            'title': 'Read 5 Books',
            'deliverables': [{'id': d_id, 'text': 'Write-up'}],
        }
        service.repository.submit_evidence.return_value = {'status': 'submitted'}

        result = service.turn_in_bounty(claim_id, student_id, bounty_id)
        assert result['status'] == 'submitted'

    def test_turn_in_wrong_student(self):
        service = _make_service()
        service.repository.get_claim.return_value = {
            'id': str(uuid.uuid4()),
            'student_id': str(uuid.uuid4()),
            'status': 'claimed',
        }

        with pytest.raises(ValidationError, match="own claims"):
            service.turn_in_bounty(str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4()))

    def test_turn_in_incomplete_deliverables(self):
        service = _make_service()
        student_id = str(uuid.uuid4())
        service.repository.get_claim.return_value = {
            'id': str(uuid.uuid4()),
            'student_id': student_id,
            'status': 'claimed',
            'evidence': {'completed_deliverables': []},
        }
        service.repository.get_bounty_by_id.return_value = {
            'id': str(uuid.uuid4()),
            'deliverables': [{'id': str(uuid.uuid4()), 'text': 'Write-up'}],
        }

        with pytest.raises(ValidationError, match="completed"):
            service.turn_in_bounty(str(uuid.uuid4()), student_id, str(uuid.uuid4()))


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
            'poster_id': reviewer_id,   # reviewer owns the bounty
            'pillar': 'stem',
            'xp_reward': 100,
        }

        # Patch the lazy import of XPService inside _award_bounty_xp
        mock_xp_inst = Mock()
        with patch.dict('sys.modules', {}):
            with patch('services.xp_service.XPService', return_value=mock_xp_inst):
                result = service.review_submission(claim_id, reviewer_id, 'approved', 'Great work!')

        assert result['status'] == 'approved'
        # The student's feedback is attached to the returned claim
        assert result['latest_review']['decision'] == 'approved'
        # The wallet is credited by XPService.award_xp, NOT here — crediting in
        # both places paid every bounty out twice in spendable coin.
        service.wallet_repository.add.assert_not_called()

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
        reviewer_id = str(uuid.uuid4())
        service.repository.get_bounty_by_id.return_value = {
            'id': str(uuid.uuid4()),
            'poster_id': reviewer_id,
            'pillar': 'stem',
            'xp_reward': 100,
        }

        result = service.review_submission(claim_id, reviewer_id, 'rejected', 'Try again')
        assert result['status'] == 'rejected'
        service.wallet_repository.add.assert_not_called()

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

    def test_reject_deactivates(self):
        """Rejection must take the bounty down. Bounties are created
        status='active', so writing only moderation_status left a rejected
        bounty live on every board."""
        service = _make_service()
        bounty_id = str(uuid.uuid4())

        service.repository.update_moderation_status.return_value = {
            'id': bounty_id,
            'moderation_status': 'rejected',
        }
        service.repository.update_bounty_status.return_value = {
            'id': bounty_id,
            'status': 'rejected',
            'moderation_status': 'rejected',
        }

        result = service.moderate_bounty(bounty_id, 'rejected', 'Not appropriate')
        service.repository.update_bounty_status.assert_called_once_with(bounty_id, 'rejected')
        assert result['status'] == 'rejected'

    def test_invalid_moderation_status(self):
        service = _make_service()

        with pytest.raises(ValidationError, match="moderation status"):
            service.moderate_bounty(str(uuid.uuid4()), 'pending')
