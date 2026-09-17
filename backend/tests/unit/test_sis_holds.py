"""
One family hold (services/sis_holds.py, M2 2026-09-17).

households.registration_hold_code names the kind of hold; the reason is what
the family reads and is never compared. A directive staged by email is applied
to the household once, when the funnel attaches it.
"""

from unittest.mock import MagicMock, patch

import pytest

from services import sis_holds as holds


def _client():
    client = MagicMock()
    tables = {}

    def table(name):
        if name not in tables:
            t = MagicMock()
            for meth in ('select', 'insert', 'update', 'upsert', 'eq', 'in_', 'limit', 'order'):
                getattr(t, meth).return_value = t
            t.execute.return_value = MagicMock(data=[])
            tables[name] = t
        return tables[name]
    client.table.side_effect = table
    client.tables = tables
    return client


@pytest.mark.unit
class TestHoldFields:
    def test_a_hold_with_no_code_is_manual(self):
        assert holds.hold_fields(True, None, 'Paperwork missing') == {
            'registration_hold': True, 'registration_hold_code': 'manual',
            'registration_hold_reason': 'Paperwork missing'}

    def test_the_unpaid_fee_hold_carries_its_sentence_by_default(self):
        out = holds.hold_fields(True, holds.UNPAID_FEE)
        assert out['registration_hold_code'] == 'unpaid_fee'
        assert out['registration_hold_reason'] == holds.FEE_HOLD_REASON

    def test_an_unknown_code_is_manual(self):
        assert holds.hold_fields(True, 'mystery')['registration_hold_code'] == 'manual'

    def test_clearing_wipes_code_and_reason(self):
        assert holds.hold_fields(False, 'manual', 'x') == {
            'registration_hold': False, 'registration_hold_code': None, 'registration_hold_reason': None}


@pytest.mark.unit
class TestIsHeldFor:
    def test_judges_by_code(self):
        assert holds.is_held_for({'registration_hold': True, 'registration_hold_code': 'unpaid_fee',
                                  'registration_hold_reason': 'edited by staff'}, 'unpaid_fee')
        assert not holds.is_held_for({'registration_hold': True, 'registration_hold_code': 'manual',
                                      'registration_hold_reason': holds.FEE_HOLD_REASON}, 'unpaid_fee')

    def test_a_row_from_before_the_column_is_judged_by_its_sentence_once(self):
        assert holds.is_held_for({'registration_hold': True, 'registration_hold_code': None,
                                  'registration_hold_reason': holds.FEE_HOLD_REASON}, 'unpaid_fee')
        assert not holds.is_held_for({'registration_hold': True, 'registration_hold_code': None,
                                      'registration_hold_reason': 'Paperwork missing'}, 'unpaid_fee')

    def test_not_held_is_never_held_for(self):
        assert not holds.is_held_for({'registration_hold': False, 'registration_hold_code': 'manual'}, 'manual')
        assert not holds.is_held_for(None, 'manual')


@pytest.mark.unit
class TestPayload:
    def test_carries_flag_code_and_text_only_while_held(self):
        assert holds.hold_payload({'registration_hold': True, 'registration_hold_code': 'manual',
                                   'registration_hold_reason': 'Call the office'}) == {
            'registration_hold': True, 'registration_hold_code': 'manual',
            'registration_hold_reason': 'Call the office'}
        assert holds.hold_payload({'registration_hold': False, 'registration_hold_code': 'manual',
                                   'registration_hold_reason': 'stale'}) == {
            'registration_hold': False, 'registration_hold_code': None, 'registration_hold_reason': None}
        assert holds.hold_payload(None)['registration_hold'] is False


@pytest.mark.unit
class TestWrites:
    def test_clear_hold_if_lifts_only_its_kind(self):
        client = _client()
        with patch.object(holds, '_admin', return_value=client):
            assert holds.clear_hold_if({'id': 'hh', 'registration_hold': True,
                                        'registration_hold_code': 'manual'}, 'unpaid_fee') is False
            client.tables.get('households') is None or client.tables['households'].update.assert_not_called()
            assert holds.clear_hold_if({'id': 'hh', 'registration_hold': True,
                                        'registration_hold_code': 'unpaid_fee'}, 'unpaid_fee') is True
        written = client.tables['households'].update.call_args[0][0]
        assert written['registration_hold'] is False and written['registration_hold_code'] is None

    def test_clear_hold_for_guardian_walks_the_households(self):
        client = _client()
        client.tables  # noqa: B018
        hh = client.table('households')
        hh.execute.return_value = MagicMock(data=[
            {'id': 'a', 'registration_hold': True, 'registration_hold_code': 'unpaid_fee'},
            {'id': 'b', 'registration_hold': True, 'registration_hold_code': 'manual'},
        ])
        with patch.object(holds, '_admin', return_value=client):
            assert holds.clear_hold_for_guardian('org', 'g1', 'unpaid_fee') == 1

    def test_stage_directive_upserts_one_row_per_email(self):
        client = _client()
        with patch.object(holds, '_admin', return_value=client):
            holds.stage_directive('org', ' Katrine@Example.com ', registration_hold=True,
                                  hold_reason='Legacy form: yellow', fee_prepaid=False)
        row = client.tables['sis_family_directives'].upsert.call_args[0][0]
        assert row['email'] == 'katrine@example.com'
        assert row['registration_hold'] is True and row['hold_reason'] == 'Legacy form: yellow'
        assert client.tables['sis_family_directives'].upsert.call_args[1] == {'on_conflict': 'organization_id,email'}


@pytest.mark.unit
class TestApplyDirectives:
    def test_applies_the_hold_once_and_stamps_the_directive(self):
        client = _client()
        directive = {'id': 'd1', 'registration_hold': True, 'hold_reason': 'Legacy form: yellow', 'applied_at': None}
        with patch.object(holds, '_admin', return_value=client):
            out = holds.apply_directives('hh-1', directive)
        assert out['registration_hold'] is True and out['registration_hold_code'] == 'manual'
        assert client.tables['households'].update.call_args[0][0]['registration_hold_reason'] == 'Legacy form: yellow'
        stamped = client.tables['sis_family_directives'].update.call_args[0][0]
        assert stamped['matched_household_id'] == 'hh-1' and stamped['applied_at']

    def test_an_applied_directive_is_left_alone(self):
        """A re-registration must not put a cleared hold back."""
        client = _client()
        with patch.object(holds, '_admin', return_value=client):
            assert holds.apply_directives('hh-1', {'id': 'd1', 'registration_hold': True,
                                                   'applied_at': '2026-09-01T00:00:00+00:00'}) == {}
        assert 'households' not in client.tables

    def test_no_directive_means_no_hold(self):
        assert holds.apply_directives('hh-1', None)['registration_hold'] is False


@pytest.mark.unit
class TestGate:
    def test_a_held_family_is_blocked_with_the_hold_payload(self):
        with patch.object(holds, 'student_household', return_value={
                'id': 'hh', 'registration_hold': True, 'registration_hold_code': 'unpaid_fee',
                'registration_hold_reason': holds.FEE_HOLD_REASON}), \
             patch('services.sis_enrollment_waitlist_service.waiting_entry', return_value=None):
            gate = holds.family_gate('org', 'stu')
        assert gate['registration_hold'] is True
        assert gate['registration_hold_code'] == 'unpaid_fee'
        assert gate['registration_hold_reason'] == holds.FEE_HOLD_REASON
        assert 'hold' in gate['error']

    def test_the_enrollment_waitlist_gates_after_the_hold(self):
        with patch.object(holds, 'student_household', return_value=None), \
             patch('services.sis_enrollment_waitlist_service.waiting_entry', return_value={'id': 'w'}):
            assert holds.family_gate('org', 'stu')['enrollment_waitlisted'] is True
        with patch.object(holds, 'student_household', return_value=None), \
             patch('services.sis_enrollment_waitlist_service.waiting_entry', return_value=None):
            assert holds.family_gate('org', 'stu') is None
