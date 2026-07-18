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


_NO_PRIORITY_FLAGS = [{'feature_flags': {'sis_settings': {}}}]  # no cutoff -> plain FIFO


@pytest.mark.unit
class TestWaitingEntry:
    def test_position_is_queue_order_within_band(self):
        table = _chain(
            [_WAITING],                                       # the student's row
            [{'id': 'w0', 'created_at': '2026-07-14'},        # band queue
             {'id': 'w1', 'created_at': '2026-07-15'}],
        )
        orgs = _chain(_NO_PRIORITY_FLAGS)  # _order_waiting reads the priority cutoff
        with patch('services.sis_enrollment_waitlist_service._admin',
                   return_value=_client({ewl.TABLE: table, 'organizations': orgs})):
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


_CUTOFF = ewl._parse_ts('2026-07-18T00:00:00+00:00')


@pytest.mark.unit
class TestPriorityOrdering:
    """Frozen prefix (rows before the cutoff never move) + sibling priority
    (post-cutoff rows with an accepted sibling jump ahead of post-cutoff rows
    without one)."""

    def test_no_cutoff_is_plain_fifo(self):
        rows = [{'id': 'b', 'created_at': '2026-07-16', 'household_id': 'h2'},
                {'id': 'a', 'created_at': '2026-07-15', 'household_id': 'h1'}]
        with patch.object(ewl, '_priority_since', return_value=None):
            ordered = ewl._order_waiting('org1', rows)
        assert [r['id'] for r in ordered] == ['a', 'b']

    def test_frozen_prefix_then_sibling_priority(self):
        rows = [
            {'id': 'pre1', 'created_at': '2026-07-10T00:00:00+00:00', 'household_id': 'hp1'},
            {'id': 'pre2', 'created_at': '2026-07-11T00:00:00+00:00', 'household_id': 'hp2'},
            # newReg registered BEFORE newSib but has no accepted sibling.
            {'id': 'newReg', 'created_at': '2026-07-19T00:00:00+00:00', 'household_id': 'hn1'},
            {'id': 'newSib', 'created_at': '2026-07-20T00:00:00+00:00', 'household_id': 'hn2'},
        ]
        with patch.object(ewl, '_priority_since', return_value=_CUTOFF), \
             patch.object(ewl, '_priority_households', return_value={'hn2'}):
            ordered = ewl._order_waiting('org1', rows)
        # frozen prefix keeps its order; then the sibling-priority kid jumps the
        # earlier-but-non-priority newcomer.
        assert [r['id'] for r in ordered] == ['pre1', 'pre2', 'newSib', 'newReg']

    def test_pre_cutoff_sibling_is_frozen_not_promoted(self):
        rows = [
            {'id': 'pre_plain', 'created_at': '2026-07-10T00:00:00+00:00', 'household_id': 'hp1'},
            {'id': 'pre_sib', 'created_at': '2026-07-12T00:00:00+00:00', 'household_id': 'hsib'},
            {'id': 'new_plain', 'created_at': '2026-07-19T00:00:00+00:00', 'household_id': 'hn1'},
        ]
        # hsib has an accepted sibling, but it's pre-cutoff so it stays put.
        with patch.object(ewl, '_priority_since', return_value=_CUTOFF), \
             patch.object(ewl, '_priority_households', return_value={'hsib'}):
            ordered = ewl._order_waiting('org1', rows)
        assert [r['id'] for r in ordered] == ['pre_plain', 'pre_sib', 'new_plain']


@pytest.mark.unit
class TestPriorityHouseholds:
    def test_household_with_unblocked_sibling_gets_priority(self):
        members = _chain([
            {'household_id': 'h1', 'user_id': 'stuA'},   # waiting kid (blocked)
            {'household_id': 'h1', 'user_id': 'stuB'},   # older sibling, no row
            {'household_id': 'h2', 'user_id': 'stuC'},   # waiting kid, no sibling
        ])
        # stuA and stuC are blocked (waiting/rejected); stuB is not.
        blocked = _chain([{'student_user_id': 'stuA'}, {'student_user_id': 'stuC'}])
        with patch('services.sis_enrollment_waitlist_service._admin',
                   return_value=_client({'household_members': members, ewl.TABLE: blocked})):
            result = ewl._priority_households('org1', {'h1', 'h2'})
        assert result == {'h1'}


@pytest.mark.unit
class TestReject:
    _REG = {'id': 'reg1', 'fee_cents': 12500, 'refunded_cents': 0,
            'kids': [{}, {}, {}], 'stripe_payment_ref': 'pi_1'}

    def _tables(self, reg):
        return {
            ewl.TABLE: _chain([_WAITING], []),          # select entry, update rejected
            'icreate_registrations': _chain([reg], []),  # select reg, update refunded_cents
            'organizations': _chain(
                [{'feature_flags': {'icreate_registration': {'stripe_secret_key': 'sk'}}}],
                [{'name': 'iCreate'}]),                  # stripe secret, then email org name
            'users': _chain([{'email': 'mom@example.com', 'first_name': 'Mo'}],
                            [{'first_name': 'Kid', 'last_name': 'One'}]),
        }

    def test_reject_refunds_proportional_share_via_stripe(self):
        tables = self._tables(dict(self._REG))
        fake_stripe = MagicMock()
        fake_stripe.Refund.create.return_value = MagicMock(id='re_1')
        with patch.dict('sys.modules', {'stripe': fake_stripe}), \
             patch('services.sis_enrollment_waitlist_service._admin',
                   return_value=_client(tables)), \
             patch('services.email_service.email_service.send_email', return_value=True):
            result = ewl.reject('org1', 'w1', rejected_by='staff1')
        # 12500 / 3 kids = 4167 (rounded)
        assert result['rejected'] is True
        assert result['refund_cents'] == 4167
        assert result.get('refund_error') is None
        fake_stripe.Refund.create.assert_called_once_with(
            payment_intent='pi_1', amount=4167, api_key='sk')
        # entry flipped to rejected, refund recorded on the entry
        upd = tables[ewl.TABLE].update.call_args[0][0]
        assert upd['status'] == 'rejected' and upd['refund_cents'] == 4167
        assert upd['stripe_refund_id'] == 're_1'
        # cumulative refund tracked on the registration
        assert tables['icreate_registrations'].update.call_args[0][0]['refunded_cents'] == 4167

    def test_reject_never_over_refunds(self):
        # Two of three kids already refunded (8334); a third can only get 12500-8334.
        reg = {**self._REG, 'refunded_cents': 8334}
        tables = self._tables(reg)
        fake_stripe = MagicMock()
        fake_stripe.Refund.create.return_value = MagicMock(id='re_2')
        with patch.dict('sys.modules', {'stripe': fake_stripe}), \
             patch('services.sis_enrollment_waitlist_service._admin',
                   return_value=_client(tables)), \
             patch('services.email_service.email_service.send_email', return_value=True):
            result = ewl.reject('org1', 'w1', rejected_by='staff1')
        assert result['refund_cents'] == 12500 - 8334  # capped at remaining
        assert tables['icreate_registrations'].update.call_args[0][0]['refunded_cents'] == 12500

    def test_reject_refused_when_not_waiting(self):
        table = _chain([{**_WAITING, 'status': 'released'}])
        with patch('services.sis_enrollment_waitlist_service._admin',
                   return_value=_client({ewl.TABLE: table})):
            result = ewl.reject('org1', 'w1', rejected_by='staff1')
        assert result == {'error': 'This student is no longer waiting'}
