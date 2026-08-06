"""
Tests for waiving a family's registration fee.

iCreate, 2026-08-05: "How do we waive the registration fee? I'd like to unlock
Katrine Myers family and not have her pay the fee." Three things have to happen
for that sentence to be true — the family is marked prepaid, their open
registration finishes at $0, and the fee hold comes off — so the test asserts
all three, plus the one thing that must NOT happen: a hold the school placed for
some other reason is left alone.
"""

from unittest.mock import Mock, patch

import pytest

ORG = 'org-1'
FEE_REASON = 'Registration fee due — finish it from your registration page.'

HOUSEHOLD = {
    'id': 'hh-1', 'organization_id': ORG, 'name': 'The Myers Family',
    'primary_contact_user_id': 'g-1',
    'registration_hold': True, 'registration_hold_reason': FEE_REASON,
}
MEMBERS = [{'user_id': 'g-1', 'is_primary_guardian': True, 'relationship': 'guardian'},
           {'user_id': 's-1', 'is_primary_guardian': False, 'relationship': 'student'}]
USERS = [{'id': 'g-1', 'email': 'Katrine@Example.com'}]
REG = {'id': 'reg-1', 'organization_id': ORG, 'parent_user_id': 'g-1',
       'status': 'fee', 'fee_cents': 5000, 'fee_deferred': False}


def _admin_with(responses):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'update', 'delete', 'insert',
                    'in_', 'order', 'upsert'):
        getattr(table, chained).return_value = table
    table.execute.side_effect = [Mock(data=d) for d in responses] + [Mock(data=[])] * 10
    return client, table


def _waive(responses):
    """Run the waiver against a scripted admin client. `finish_registration` is
    the funnel step the route injects (a service must not import routes)."""
    from services import sis_service
    client, table = _admin_with(responses)
    finish = Mock(return_value={'success': True})
    with patch('services.sis_service.get_supabase_admin_client', return_value=client):
        result = sis_service.waive_registration_fee(ORG, 'hh-1', actor_id='admin-1',
                                                    finish_registration=finish)
    return result, table, finish


@pytest.mark.unit
class TestWaiveRegistrationFee:
    def test_marks_prepaid_finishes_the_registration_and_lifts_the_hold(self):
        result, table, finish = _waive([[HOUSEHOLD], MEMBERS, USERS, [], [REG], [], []])
        assert result['waived'] is True
        assert result['waived_cents'] == 5000
        assert result['registration_completed'] is True
        assert result['hold_cleared'] is True

        # 1. A prepaid directive on the guardian's email, lower-cased so the
        #    funnel's own lookup matches it.
        directives = table.upsert.call_args[0][0]
        assert directives[0]['email'] == 'katrine@example.com'
        assert directives[0]['fee_prepaid'] is True

        # 2. The open registration is zeroed and finished.
        assert any(c[0][0].get('fee_cents') == 0 for c in table.update.call_args_list)
        finish.assert_called_once()

        # 3. The hold is gone.
        assert any(c[0][0].get('registration_hold') is False
                   for c in table.update.call_args_list)

    def test_leaves_a_hold_placed_for_another_reason_alone(self):
        """A hold the office set on purpose ("paperwork missing") is somebody's
        decision. Waiving a fee must not quietly undo it."""
        household = {**HOUSEHOLD, 'registration_hold_reason': 'Paperwork missing'}
        result, table, _ = _waive([[household], MEMBERS, USERS, [], [REG], [], []])
        assert result['hold_cleared'] is False
        assert not any(c[0][0].get('registration_hold') is False
                       for c in table.update.call_args_list)

    def test_family_with_no_registration_still_gets_the_directive(self):
        """Waiving before they register is the useful case: they never see a bill."""
        result, table, finish = _waive([[HOUSEHOLD], MEMBERS, USERS, [], [], []])
        assert result['waived'] is True
        assert result['waived_cents'] == 0
        assert result['registration_completed'] is False
        finish.assert_not_called()
        assert table.upsert.call_args[0][0][0]['fee_prepaid'] is True

    def test_rejects_a_household_from_another_org(self):
        from services import sis_service
        client, _ = _admin_with([[{**HOUSEHOLD, 'organization_id': 'org-2'}]])
        with patch('services.sis_service.get_supabase_admin_client', return_value=client):
            result = sis_service.waive_registration_fee(ORG, 'hh-1')
        assert result['error'] == 'Family not found'

    def test_already_completed_registration_is_not_reopened(self):
        completed = {**REG, 'status': 'completed'}
        result, _, finish = _waive([[HOUSEHOLD], MEMBERS, USERS, [], [completed], []])
        assert result['registration_completed'] is False
        finish.assert_not_called()
