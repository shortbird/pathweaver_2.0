"""The SIS Bounty Management block: a school's staff manage the school's
bounties, and only while the school runs the block."""

from unittest.mock import Mock, patch

import pytest

from services.base_service import ValidationError

ORG = 'org-apogee'
POSTER = 'coach-a'
OTHER_COACH = 'coach-b'


def _service(user_row, superadmin=False):
    from services.bounty_service import BountyService
    service = BountyService()
    service.repository = Mock()
    service.wallet_repository = Mock()
    service.repository.get_user_roles_row.return_value = user_row
    service.is_superadmin = Mock(return_value=superadmin)
    return service


def _bounty(**extra):
    return {'id': 'b1', 'poster_id': POSTER, 'organization_id': ORG, **extra}


def _coach(org=ORG, role='advisor'):
    return {'id': OTHER_COACH, 'role': 'org_managed', 'org_role': role,
            'org_roles': [role], 'organization_id': org}


@pytest.fixture
def block_on():
    with patch('modules.enabled.module_enabled', return_value=True) as m:
        yield m


@pytest.fixture
def block_off():
    with patch('modules.enabled.module_enabled', return_value=False) as m:
        yield m


class TestCanManage:
    def test_the_poster_always_can(self, block_off):
        assert _service(None).can_manage(POSTER, _bounty())

    def test_another_coach_at_the_school_can_when_the_block_is_on(self, block_on):
        assert _service(_coach()).can_manage(OTHER_COACH, _bounty())
        block_on.assert_called_once_with(ORG, 'bounty_management')

    def test_another_coach_cannot_when_the_block_is_off(self, block_off):
        assert not _service(_coach()).can_manage(OTHER_COACH, _bounty())

    def test_staff_of_another_school_cannot(self, block_on):
        assert not _service(_coach(org='elsewhere')).can_manage(OTHER_COACH, _bounty())

    def test_a_student_at_the_school_cannot(self, block_on):
        student = {'id': 's1', 'role': 'org_managed', 'org_role': 'student',
                   'org_roles': ['student'], 'organization_id': ORG}
        assert not _service(student).can_manage('s1', _bounty())

    def test_a_bounty_with_no_school_stays_the_posters(self, block_on):
        assert not _service(_coach()).can_manage(OTHER_COACH, _bounty(organization_id=None))


class TestReviewUsesTheSameRule:
    def test_another_coach_may_review_with_the_block_on(self, block_on):
        service = _service(_coach())
        service.repository.get_claim.return_value = {
            'id': 'c1', 'bounty_id': 'b1', 'status': 'submitted', 'student_id': 's1'}
        service.repository.get_bounty_by_id.return_value = _bounty()
        service.repository.update_claim_status.return_value = {'status': 'revision_requested'}
        service.review_submission('c1', OTHER_COACH, 'revision_requested', 'More photos')
        service.repository.create_review.assert_called_once()

    def test_and_may_not_with_it_off(self, block_off):
        service = _service(_coach())
        service.repository.get_claim.return_value = {
            'id': 'c1', 'bounty_id': 'b1', 'status': 'submitted', 'student_id': 's1'}
        service.repository.get_bounty_by_id.return_value = _bounty()
        with pytest.raises(ValidationError, match="poster"):
            service.review_submission('c1', OTHER_COACH, 'approved')
        service.repository.create_review.assert_not_called()


class TestDetailTellsThePageWhoReviews:
    def test_a_manager_gets_claims_and_can_manage(self, block_on):
        service = _service(_coach())
        service.get_bounty_for_viewer = Mock(return_value=_bounty())
        service._enrich_bounties_with_claims = Mock(side_effect=lambda bs: [{**b, 'claims': []} for b in bs])
        out = service.get_bounty_detail('b1', OTHER_COACH)
        assert out['can_manage'] is True and out['claims'] == []

    def test_anyone_else_gets_the_bare_bounty(self, block_off):
        service = _service(_coach())
        service.get_bounty_for_viewer = Mock(return_value=_bounty())
        out = service.get_bounty_detail('b1', OTHER_COACH)
        assert 'can_manage' not in out and 'claims' not in out


def test_an_organization_bounty_belongs_to_the_posters_school():
    """The web form never sent organization_id, so a "My Organization" bounty
    was stored with none and nobody could see it."""
    from services.bounty_service import BountyService
    service = BountyService()
    service.repository = Mock()
    service.wallet_repository = Mock()
    poster = Mock()
    poster.data = [{'first_name': 'Dave', 'last_name': 'N', 'role': 'org_managed',
                    'organization_id': ORG}]
    service.repository.client.table.return_value.select.return_value \
        .eq.return_value.execute.return_value = poster
    service.repository.create_bounty.side_effect = lambda data: {**data, 'id': 'b1'}
    service.create_bounty(POSTER, {
        'title': 'Clean the supply room', 'description': 'Daily chore',
        'deliverables': ['Photo of the clean room'],
        'rewards': [{'type': 'custom', 'text': 'Rent one library book'}],
        'visibility': 'organization', 'repeatable': True, 'requires_evidence': False,
    })
    saved = service.repository.create_bounty.call_args[0][0]
    assert saved['organization_id'] == ORG
    assert saved['repeatable'] is True
    assert saved['requires_evidence'] is False


class TestProofIsTheBountysChoice:
    """Apogee Cache Valley: "daily chores like cleaning up don't necessarily
    need a picture every day." requires_evidence off lets a step be ticked
    with nothing attached; on (every bounty before this) still demands proof."""

    def _service(self, requires_evidence):
        service = _service(None)
        service.repository.get_claim.return_value = {
            'id': 'c1', 'student_id': 's1', 'status': 'claimed', 'evidence': {}}
        service.repository.get_bounty_by_id.return_value = _bounty(
            deliverables=[{'id': 'd1', 'text': 'Tidy the shelf'}],
            requires_evidence=requires_evidence)
        service.repository.update_claim_evidence.side_effect = lambda cid, ev: {'id': cid, 'evidence': ev}
        service._sign_claim_evidence = lambda claim: claim
        return service

    def test_a_chore_without_proof_is_ticked_with_nothing_attached(self):
        out = self._service(False).toggle_deliverable('c1', 's1', 'b1', 'd1', True, None)
        assert out['evidence']['completed_deliverables'] == ['d1']
        assert out['evidence']['deliverable_evidence'] == {'d1': []}

    def test_a_bounty_that_asks_for_proof_still_refuses_none(self):
        with pytest.raises(ValidationError, match='evidence'):
            self._service(True).toggle_deliverable('c1', 's1', 'b1', 'd1', True, [])

    def test_a_bounty_with_no_setting_asks_for_proof(self):
        service = self._service(True)
        del service.repository.get_bounty_by_id.return_value['requires_evidence']
        with pytest.raises(ValidationError, match='evidence'):
            service.toggle_deliverable('c1', 's1', 'b1', 'd1', True, None)
