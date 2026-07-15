"""
Unit tests for the enrollment-level age-group waitlist (Marika Connole feedback
2026-07-15): students in a gated age band are waitlisted at REGISTRATION (not
per class), can't pick classes until released, and a fully-waitlisted family's
registration fee defers to the first release.
"""

from unittest.mock import MagicMock, patch

import pytest

from services import sis_enrollment_waitlist_service as ewl


def _chain(*datasets):
    """Supabase query-builder stand-in: chained methods return the same mock;
    successive .execute() calls pop the given datasets."""
    m = MagicMock()
    for meth in ('select', 'insert', 'update', 'upsert', 'delete',
                 'eq', 'in_', 'is_', 'limit', 'order'):
        getattr(m, meth).return_value = m
    m.execute.side_effect = [MagicMock(data=d) for d in datasets]
    return m


def _client(tables):
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]
    return client


_GATES_FLAGS = [{'organization_id': 'org1', 'feature_flags': {'sis_settings': {
    'first_day_of_school': '2026-08-15',
    'enrollment_age_gates': [
        {'min_age': 5, 'max_age': 9, 'mode': 'waitlist'},
        {'min_age': 12, 'max_age': None, 'mode': 'open'},  # non-waitlist: ignored
    ],
}}}]


@pytest.mark.unit
class TestGateMatching:
    def test_only_waitlist_mode_gates_gate(self):
        orgs = _chain(_GATES_FLAGS)
        with patch('services.sis_enrollment_waitlist_service._admin',
                   return_value=_client({'organizations': orgs})):
            gates = ewl.gates_for_org('org1')
        assert gates == [{'min_age': 5, 'max_age': 9, 'mode': 'waitlist'}]

    def test_age_judged_on_first_day_of_school(self):
        # DOB 2017-09-01: 8 today-ish is irrelevant — on 2026-08-15 they are
        # still 8 (birthday 9/1), inside the 5-9 band.
        orgs = _chain(_GATES_FLAGS, _GATES_FLAGS)  # gates_for_org + first_day lookups
        with patch('services.sis_enrollment_waitlist_service._admin',
                   return_value=_client({'organizations': orgs})):
            gate = ewl.matching_gate('org1', '2017-09-01')
        assert gate is not None and gate['age'] == 8

    def test_unknown_dob_never_gates(self):
        orgs = _chain(_GATES_FLAGS, _GATES_FLAGS)
        with patch('services.sis_enrollment_waitlist_service._admin',
                   return_value=_client({'organizations': orgs})):
            assert ewl.matching_gate('org1', None) is None

    def test_age_outside_every_band_is_open(self):
        orgs = _chain(_GATES_FLAGS, _GATES_FLAGS)
        with patch('services.sis_enrollment_waitlist_service._admin',
                   return_value=_client({'organizations': orgs})):
            # 15-year-old: outside 5-9; the 12+ band is mode 'open' so ignored.
            assert ewl.matching_gate('org1', '2011-01-01') is None


_WAITING = {'id': 'w1', 'organization_id': 'org1', 'student_user_id': 'stu1',
            'guardian_user_id': 'g1', 'household_id': 'h1', 'status': 'waiting',
            'band_min_age': 5, 'band_max_age': 9, 'age_snapshot': 7,
            'created_at': '2026-07-15T10:00:00Z'}


@pytest.mark.unit
class TestWaitingEntry:
    def test_position_is_queue_order_within_band(self):
        table = _chain(
            [_WAITING],                                       # the student's row
            [{'id': 'w0', 'created_at': '2026-07-14'},        # band queue
             {'id': 'w1', 'created_at': '2026-07-15'}],
        )
        with patch('services.sis_enrollment_waitlist_service._admin',
                   return_value=_client({ewl.TABLE: table})):
            entry = ewl.waiting_entry('org1', 'stu1')
        assert entry['position'] == 2

    def test_no_row_means_not_waitlisted(self):
        table = _chain([])
        with patch('services.sis_enrollment_waitlist_service._admin',
                   return_value=_client({ewl.TABLE: table})):
            assert ewl.waiting_entry('org1', 'stu1') is None


@pytest.mark.unit
class TestRelease:
    def _tables(self, *, reg_rows):
        return {
            ewl.TABLE: _chain([_WAITING], []),  # select entry, update released
            'icreate_registrations': _chain(reg_rows, []),  # select deferred reg, reopen update
            'households': _chain([]),           # hold update
            'users': _chain([{'email': 'mom@example.com', 'first_name': 'Mo'}],
                            [{'first_name': 'Kid', 'last_name': 'One'}]),
            'organizations': _chain([{'name': 'iCreate'}]),
        }

    def test_release_reopens_deferred_fee_and_holds_household(self):
        reg = {'id': 'reg1', 'status': 'completed', 'fee_cents': 7500, 'fee_deferred': True}
        tables = self._tables(reg_rows=[reg])
        sent = MagicMock(return_value=True)
        with patch('services.sis_enrollment_waitlist_service._admin',
                   return_value=_client(tables)), \
             patch('services.email_service.email_service.send_email', sent):
            result = ewl.release('org1', 'w1', released_by='staff1')
        assert result == {'released': True, 'fee_due_cents': 7500, 'emailed': True}
        # entry released
        assert tables[ewl.TABLE].update.call_args[0][0]['status'] == 'released'
        # registration reopened at the fee step, deferral consumed
        reopened = tables['icreate_registrations'].update.call_args[0][0]
        assert reopened['status'] == 'fee' and reopened['fee_deferred'] is False
        # household held until the fee is settled
        hold = tables['households'].update.call_args[0][0]
        assert hold['registration_hold'] is True
        assert hold['registration_hold_reason'] == ewl.FEE_HOLD_REASON
        # the guardian's email mentions the fee
        assert '75.00' in sent.call_args[0][2]

    def test_release_without_deferral_just_emails_the_builder_link(self):
        tables = self._tables(reg_rows=[])  # no deferred registration
        sent = MagicMock(return_value=True)
        with patch('services.sis_enrollment_waitlist_service._admin',
                   return_value=_client(tables)), \
             patch('services.email_service.email_service.send_email', sent):
            result = ewl.release('org1', 'w1', released_by='staff1')
        assert result == {'released': True, 'fee_due_cents': 0, 'emailed': True}
        tables['households'].update.assert_not_called()
        assert 'schedule-builder' in sent.call_args[0][2]

    def test_already_released_errors(self):
        table = _chain([{**_WAITING, 'status': 'released'}])
        with patch('services.sis_enrollment_waitlist_service._admin',
                   return_value=_client({ewl.TABLE: table})):
            result = ewl.release('org1', 'w1', released_by='staff1')
        assert result == {'error': 'This student was already released'}

    def test_release_band_releases_each_waiting_entry(self):
        with patch('services.sis_enrollment_waitlist_service._admin') as admin, \
             patch('services.sis_enrollment_waitlist_service._release_entry',
                   return_value={'released': True}) as rel:
            band_q = _chain([_WAITING, {**_WAITING, 'id': 'w2', 'student_user_id': 'stu2'}])
            admin.return_value = _client({ewl.TABLE: band_q})
            result = ewl.release_band('org1', 5, 9, released_by='staff1')
        assert result == {'released': 2}
        assert rel.call_count == 2
