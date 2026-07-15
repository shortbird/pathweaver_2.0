"""
Unit tests for family-level class-registration gates (sis_parent_service):
registration holds. These guard the iCreate legacy-migration policy —
yellow/discrepancy families must not sign up for classes.

(The date-staggered tier gate was removed 2026-07: access to registration is
controlled by who has the registration link, not by dates.)
"""

from unittest.mock import patch

import pytest

from services import sis_parent_service as parent


def _household(row, waitlist_entry=None):
    return (
        patch('services.sis_parent_service._student_household', return_value=row),
        patch('services.sis_enrollment_waitlist_service.waiting_entry',
              return_value=waitlist_entry),
    )


@pytest.mark.unit
class TestFamilyGate:
    def test_hold_blocks(self):
        hh, wl = _household({'registration_hold': True})
        with hh, wl:
            gate = parent._family_gate('org1', 'stu1')
        assert gate['registration_hold'] is True
        assert 'hold' in gate['error']

    def test_clear_when_no_hold(self):
        hh, wl = _household({'registration_hold': False})
        with hh, wl:
            assert parent._family_gate('org1', 'stu1') is None

    def test_no_household_is_not_gated(self):
        hh, wl = _household(None)
        with hh, wl:
            assert parent._family_gate('org1', 'stu1') is None

    def test_enrollment_waitlisted_student_is_gated(self):
        hh, wl = _household({'registration_hold': False},
                            waitlist_entry={'id': 'w1', 'status': 'waiting'})
        with hh, wl:
            gate = parent._family_gate('org1', 'stu1')
        assert gate['enrollment_waitlisted'] is True
        assert 'enrollment waitlist' in gate['error']


_MINE = [{'student_id': 'stu1', 'org_id': 'org1', 'household_id': 'h1', 'name': 'Stu One'}]
_GATE = {'error': "Your family's registration is on hold — please contact the school "
                  'to resolve it before signing up for classes.',
         'registration_hold': True}


@pytest.mark.unit
class TestGateEnforcement:
    def test_add_class_returns_the_gate(self):
        with patch('services.sis_parent_service.registerable_students', return_value=_MINE), \
             patch('services.sis_parent_service._changes_locked', return_value=False), \
             patch('services.sis_parent_service._family_gate', return_value=_GATE) as gate:
            result = parent.add_class('g1', 'org1', 'stu1', 'class1')
        assert result == _GATE
        gate.assert_called_once_with('org1', 'stu1')

    def test_add_item_returns_the_gate(self):
        reg = {'id': 'reg1', 'status': 'draft', 'guardian_user_id': 'g1', 'student_user_id': 'stu1'}
        with patch('services.sis_parent_service.regs.get_registration', return_value=reg), \
             patch('services.sis_parent_service._family_gate', return_value=_GATE):
            result = parent.add_item('g1', 'org1', 'reg1', 'class1')
        assert result == _GATE

    def test_add_course_checks_the_gate(self):
        with patch('services.sis_parent_service.registerable_students', return_value=_MINE), \
             patch('services.sis_parent_service._changes_locked', return_value=False), \
             patch('services.sis_parent_service._family_gate', return_value=None) as gate, \
             patch('services.sis_parent_service._optio_courses_enabled', return_value=False):
            parent.add_course('g1', 'org1', 'stu1', 'course1')
        gate.assert_called_once_with('org1', 'stu1')

    def test_ungated_add_class_proceeds_to_catalog(self):
        with patch('services.sis_parent_service.registerable_students', return_value=_MINE), \
             patch('services.sis_parent_service._changes_locked', return_value=False), \
             patch('services.sis_parent_service._family_gate', return_value=None), \
             patch('services.sis_parent_service.catalog.list_classes', return_value=[]):
            result = parent.add_class('g1', 'org1', 'stu1', 'class1')
        assert result == {'error': 'This class is not open for registration'}
