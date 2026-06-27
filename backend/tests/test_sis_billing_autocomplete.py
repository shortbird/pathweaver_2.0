"""
Unit tests for the billing -> enrollment bridge: when an invoice is paid in full,
the linked registration is auto-completed (the student is enrolled). Covers
_maybe_autocomplete_registration's guard conditions. Registration service is mocked.
"""

from unittest.mock import patch

import pytest

from services import sis_billing_service as billing


@pytest.mark.unit
class TestAutoCompleteOnPayment:
    def test_paid_invoice_with_registration_auto_completes(self):
        invoice = {'status': 'paid', 'registration_id': 'reg-1'}
        with patch('services.sis_registration_service.get_registration',
                   return_value={'id': 'reg-1', 'status': 'submitted'}) as get_reg, \
             patch('services.sis_registration_service.complete',
                   return_value={'registration': {'id': 'reg-1'}}) as complete:
            result = billing._maybe_autocomplete_registration('org-1', invoice, 'actor-1')
        get_reg.assert_called_once_with('org-1', 'reg-1')
        complete.assert_called_once_with('org-1', 'reg-1', completed_by='actor-1')
        assert result is not None

    def test_unpaid_invoice_is_noop(self):
        invoice = {'status': 'partial', 'registration_id': 'reg-1'}
        with patch('services.sis_registration_service.complete') as complete:
            assert billing._maybe_autocomplete_registration('org-1', invoice, 'a') is None
        complete.assert_not_called()

    def test_invoice_without_registration_is_noop(self):
        invoice = {'status': 'paid', 'registration_id': None}
        with patch('services.sis_registration_service.complete') as complete:
            assert billing._maybe_autocomplete_registration('org-1', invoice, 'a') is None
        complete.assert_not_called()

    def test_already_completed_registration_is_noop(self):
        invoice = {'status': 'paid', 'registration_id': 'reg-1'}
        with patch('services.sis_registration_service.get_registration',
                   return_value={'id': 'reg-1', 'status': 'completed'}), \
             patch('services.sis_registration_service.complete') as complete:
            assert billing._maybe_autocomplete_registration('org-1', invoice, 'a') is None
        complete.assert_not_called()

    def test_complete_failure_is_swallowed(self):
        invoice = {'status': 'paid', 'registration_id': 'reg-1'}
        with patch('services.sis_registration_service.get_registration',
                   return_value={'id': 'reg-1', 'status': 'submitted'}), \
             patch('services.sis_registration_service.complete',
                   side_effect=RuntimeError('boom')):
            # must not raise — a recorded payment should never be rolled back by enrollment
            assert billing._maybe_autocomplete_registration('org-1', invoice, 'a') is None
