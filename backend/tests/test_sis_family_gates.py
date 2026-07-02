"""
Unit tests for family-level class-registration gates (sis_parent_service):
registration holds and staggered tier opening dates. These guard the iCreate
legacy-migration policy — yellow/discrepancy families must not sign up for
classes, and tiers open on their configured dates.
"""

from datetime import date, timedelta
from unittest.mock import patch

import pytest

from services import sis_parent_service as parent

TOMORROW = str(date.today() + timedelta(days=1))
YESTERDAY = str(date.today() - timedelta(days=1))


def _settings(dates):
    return patch('services.sis_parent_service._sis_settings',
                 return_value={'registration_tier_dates': dates} if dates is not None else {})


@pytest.mark.unit
class TestTierOpensOn:
    def test_no_config_means_always_open(self):
        with _settings(None):
            assert parent._tier_opens_on('org1', 1) is None

    def test_future_tier_date_blocks(self):
        with _settings({'1': TOMORROW}):
            assert parent._tier_opens_on('org1', 1) == TOMORROW

    def test_past_tier_date_is_open(self):
        with _settings({'1': YESTERDAY}):
            assert parent._tier_opens_on('org1', 1) is None

    def test_untiered_family_uses_default_date(self):
        with _settings({'1': YESTERDAY, 'default': TOMORROW}):
            assert parent._tier_opens_on('org1', None) == TOMORROW

    def test_tier_without_configured_date_falls_back_to_default(self):
        with _settings({'1': YESTERDAY, 'default': TOMORROW}):
            assert parent._tier_opens_on('org1', 2) == TOMORROW

    def test_unparseable_date_fails_open(self):
        with _settings({'1': 'soon'}):
            assert parent._tier_opens_on('org1', 1) is None


def _household(row):
    return patch('services.sis_parent_service._student_household', return_value=row)


@pytest.mark.unit
class TestFamilyGate:
    def test_hold_blocks(self):
        with _household({'registration_hold': True, 'registration_tier': None}), \
             _settings(None):
            gate = parent._family_gate('org1', 'stu1')
        assert gate['registration_hold'] is True
        assert 'hold' in gate['error']

    def test_tier_window_blocks_until_open_date(self):
        with _household({'registration_hold': False, 'registration_tier': 2}), \
             _settings({'2': TOMORROW}):
            gate = parent._family_gate('org1', 'stu1')
        assert gate['registration_opens_on'] == TOMORROW
        assert 'opens for your family' in gate['error']

    def test_clear_when_window_open(self):
        with _household({'registration_hold': False, 'registration_tier': 1}), \
             _settings({'1': YESTERDAY}):
            assert parent._family_gate('org1', 'stu1') is None

    def test_no_household_and_no_default_is_not_gated(self):
        with _household(None), _settings({'1': TOMORROW}):
            assert parent._family_gate('org1', 'stu1') is None

    def test_no_household_still_waits_for_default_date(self):
        with _household(None), _settings({'default': TOMORROW}):
            gate = parent._family_gate('org1', 'stu1')
        assert gate['registration_opens_on'] == TOMORROW

    def test_check_tier_false_skips_tier_but_not_hold(self):
        with _household({'registration_hold': False, 'registration_tier': 3}), \
             _settings({'3': TOMORROW}):
            assert parent._family_gate('org1', 'stu1', check_tier=False) is None
        with _household({'registration_hold': True}), _settings(None):
            assert parent._family_gate('org1', 'stu1', check_tier=False)['registration_hold'] is True


_MINE = [{'student_id': 'stu1', 'org_id': 'org1', 'household_id': 'h1', 'name': 'Stu One'}]
_GATE = {'error': 'Class registration opens for your family on August 4, 2026.',
         'registration_opens_on': '2026-08-04'}


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

    def test_add_course_checks_hold_only(self):
        with patch('services.sis_parent_service.registerable_students', return_value=_MINE), \
             patch('services.sis_parent_service._changes_locked', return_value=False), \
             patch('services.sis_parent_service._family_gate', return_value=None) as gate, \
             patch('services.sis_parent_service._optio_courses_enabled', return_value=False):
            parent.add_course('g1', 'org1', 'stu1', 'course1')
        gate.assert_called_once_with('org1', 'stu1', check_tier=False)

    def test_ungated_add_class_proceeds_to_catalog(self):
        with patch('services.sis_parent_service.registerable_students', return_value=_MINE), \
             patch('services.sis_parent_service._changes_locked', return_value=False), \
             patch('services.sis_parent_service._family_gate', return_value=None), \
             patch('services.sis_parent_service.catalog.list_classes', return_value=[]):
            result = parent.add_class('g1', 'org1', 'stu1', 'class1')
        assert result == {'error': 'This class is not open for registration'}
