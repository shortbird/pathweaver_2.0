"""
Unit tests for BountyRepository.

Tests bounty CRUD, claims, reviews, and filtering.
Written BEFORE implementation (TDD).
"""

import pytest
import uuid
from unittest.mock import Mock
from datetime import datetime, timezone, timedelta

from repositories.base_repository import NotFoundError, DatabaseError, ValidationError


def _make_repo():
    from repositories.bounty_repository import BountyRepository
    repo = BountyRepository()
    mock_client = Mock()
    repo._client = mock_client
    return repo, mock_client


@pytest.mark.unit
class TestBountyRepositoryInit:

    def test_initialization(self):
        from repositories.bounty_repository import BountyRepository
        repo = BountyRepository()
        assert repo.table_name == 'bounties'


@pytest.mark.unit
@pytest.mark.critical
class TestBountyCRUD:

    def test_create_bounty(self):
        repo, mock = _make_repo()
        bounty_id = str(uuid.uuid4())
        poster_id = str(uuid.uuid4())

        mock_resp = Mock()
        mock_resp.data = [{
            'id': bounty_id,
            'poster_id': poster_id,
            'title': 'Read 5 Books',
            'status': 'draft',
            'pillar': 'communication',
            'bounty_type': 'open',
            'xp_reward': 100,
        }]
        mock.table.return_value.insert.return_value.execute.return_value = mock_resp

        bounty = repo.create_bounty({
            'poster_id': poster_id,
            'title': 'Read 5 Books',
            'description': 'Read 5 books this month',
            'requirements': 'Submit a photo of each book',
            'pillar': 'communication',
            'bounty_type': 'open',
            'xp_reward': 100,
            'max_participants': 10,
            'deadline': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        })

        assert bounty['title'] == 'Read 5 Books'
        assert bounty['status'] == 'draft'

    def test_get_bounty_by_id(self):
        repo, mock = _make_repo()
        bounty_id = str(uuid.uuid4())

        mock_resp = Mock()
        mock_resp.data = [{'id': bounty_id, 'title': 'Test Bounty'}]
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_resp

        bounty = repo.get_bounty_by_id(bounty_id)
        assert bounty is not None
        assert bounty['id'] == bounty_id

    def test_get_bounty_not_found(self):
        repo, mock = _make_repo()

        mock_resp = Mock()
        mock_resp.data = []
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_resp

        bounty = repo.get_bounty_by_id(str(uuid.uuid4()))
        assert bounty is None

    def test_list_active_bounties(self):
        repo, mock = _make_repo()

        mock_resp = Mock()
        mock_resp.data = [
            {'id': str(uuid.uuid4()), 'title': 'Bounty 1', 'status': 'active'},
            {'id': str(uuid.uuid4()), 'title': 'Bounty 2', 'status': 'active'},
        ]
        mock.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = mock_resp

        bounties = repo.list_active_bounties()
        assert len(bounties) == 2

    def test_list_bounties_by_pillar(self):
        repo, mock = _make_repo()

        mock_resp = Mock()
        mock_resp.data = [{'id': str(uuid.uuid4()), 'pillar': 'stem'}]
        mock.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value = mock_resp

        bounties = repo.list_active_bounties(pillar='stem')
        assert len(bounties) == 1

    def test_get_poster_bounties(self):
        repo, mock = _make_repo()
        poster_id = str(uuid.uuid4())

        mock_resp = Mock()
        mock_resp.data = [{'id': str(uuid.uuid4()), 'poster_id': poster_id}]
        mock.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = mock_resp

        bounties = repo.get_poster_bounties(poster_id)
        assert len(bounties) == 1

    def test_update_bounty_status(self):
        repo, mock = _make_repo()
        bounty_id = str(uuid.uuid4())

        mock_resp = Mock()
        mock_resp.data = [{'id': bounty_id, 'status': 'active'}]
        mock.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_resp

        bounty = repo.update_bounty_status(bounty_id, 'active')
        assert bounty['status'] == 'active'

    def test_update_bounty_status_not_found(self):
        repo, mock = _make_repo()

        mock_resp = Mock()
        mock_resp.data = []
        mock.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_resp

        with pytest.raises(NotFoundError):
            repo.update_bounty_status(str(uuid.uuid4()), 'active')


@pytest.mark.unit
@pytest.mark.critical
class TestBountyClaims:

    def test_create_claim(self):
        repo, mock = _make_repo()
        bounty_id = str(uuid.uuid4())
        student_id = str(uuid.uuid4())

        mock_resp = Mock()
        mock_resp.data = [{
            'id': str(uuid.uuid4()),
            'bounty_id': bounty_id,
            'student_id': student_id,
            'status': 'claimed',
        }]
        mock.table.return_value.insert.return_value.execute.return_value = mock_resp

        claim = repo.create_claim(bounty_id, student_id)
        assert claim['status'] == 'claimed'

    def test_get_claim(self):
        repo, mock = _make_repo()
        claim_id = str(uuid.uuid4())

        mock_resp = Mock()
        mock_resp.data = [{'id': claim_id, 'status': 'claimed'}]
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_resp

        claim = repo.get_claim(claim_id)
        assert claim is not None

    def test_get_student_claims(self):
        repo, mock = _make_repo()
        student_id = str(uuid.uuid4())

        mock_resp = Mock()
        mock_resp.data = [
            {'id': str(uuid.uuid4()), 'student_id': student_id, 'status': 'claimed'},
            {'id': str(uuid.uuid4()), 'student_id': student_id, 'status': 'submitted'},
        ]
        mock.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = mock_resp

        claims = repo.get_student_claims(student_id)
        assert len(claims) == 2

    def test_submit_evidence(self):
        repo, mock = _make_repo()
        claim_id = str(uuid.uuid4())
        evidence = {'text': 'I read 5 books', 'media_urls': ['https://example.com/photo.jpg']}

        mock_resp = Mock()
        mock_resp.data = [{
            'id': claim_id,
            'status': 'submitted',
            'evidence': evidence,
        }]
        mock.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_resp

        claim = repo.submit_evidence(claim_id, evidence)
        assert claim['status'] == 'submitted'

    def test_update_claim_status(self):
        repo, mock = _make_repo()
        claim_id = str(uuid.uuid4())

        mock_resp = Mock()
        mock_resp.data = [{'id': claim_id, 'status': 'approved'}]
        mock.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_resp

        claim = repo.update_claim_status(claim_id, 'approved')
        assert claim['status'] == 'approved'

    def test_count_bounty_claims(self):
        repo, mock = _make_repo()
        bounty_id = str(uuid.uuid4())

        mock_resp = Mock()
        mock_resp.count = 5
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_resp

        count = repo.count_bounty_claims(bounty_id)
        assert count == 5


@pytest.mark.unit
class TestBountyReviews:

    def test_create_review(self):
        repo, mock = _make_repo()
        claim_id = str(uuid.uuid4())
        reviewer_id = str(uuid.uuid4())

        mock_resp = Mock()
        mock_resp.data = [{
            'id': str(uuid.uuid4()),
            'claim_id': claim_id,
            'reviewer_id': reviewer_id,
            'decision': 'approved',
            'feedback': 'Great work!',
        }]
        mock.table.return_value.insert.return_value.execute.return_value = mock_resp

        review = repo.create_review(claim_id, reviewer_id, 'approved', 'Great work!')
        assert review['decision'] == 'approved'

    def test_get_claim_reviews(self):
        repo, mock = _make_repo()
        claim_id = str(uuid.uuid4())

        mock_resp = Mock()
        mock_resp.data = [
            {'id': str(uuid.uuid4()), 'decision': 'revision_requested'},
            {'id': str(uuid.uuid4()), 'decision': 'approved'},
        ]
        mock.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = mock_resp

        reviews = repo.get_claim_reviews(claim_id)
        assert len(reviews) == 2
