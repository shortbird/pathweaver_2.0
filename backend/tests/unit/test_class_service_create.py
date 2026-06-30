"""
Unit tests for ClassService.create_class with the SIS scheduling/catalog fields.

Covers the "Add Class" admin form: days of week, start time, duration, capacity
(max students), optional supply fee, image, and age range — plus validation.

The repository is mocked so these are pure business-logic tests (no DB).
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from services.class_service import ClassService
from services.base_service import ValidationError


ORG_ID = 'org-1111'
CREATED_BY = 'user-2222'


def _service_with_mock_repo():
    """ClassService whose repo echoes the inserted data back with an id."""
    service = ClassService()
    service.class_repo = MagicMock()
    service.class_repo.create_class.side_effect = lambda data: {'id': 'cls-1', **data}
    return service


def _inserted_data(service):
    """The data dict the service passed to repo.create_class()."""
    return service.class_repo.create_class.call_args[0][0]


class TestCreateClassFields:
    def test_creates_with_all_scheduling_fields(self):
        service = _service_with_mock_repo()

        result = service.create_class(
            org_id=ORG_ID,
            name='  Robotics  ',
            description='  Build robots  ',
            xp_threshold=100,
            created_by=CREATED_BY,
            days_of_week=['mon', 'wed', 'fri'],
            start_time='09:00',
            duration_minutes=60,
            max_students=12,
            supply_fee=25.50,
            image_url='https://cdn/x.png',
            age_min=8,
            age_max=12,
        )

        data = _inserted_data(service)
        assert data['organization_id'] == ORG_ID
        assert data['name'] == 'Robotics'           # stripped
        assert data['description'] == 'Build robots'  # stripped
        assert data['days_of_week'] == ['mon', 'wed', 'fri']
        assert data['start_time'] == '09:00'
        assert data['duration_minutes'] == 60
        assert data['max_students'] == 12
        assert data['supply_fee'] == 25.50
        assert data['image_url'] == 'https://cdn/x.png'
        assert data['age_min'] == 8
        assert data['age_max'] == 12
        assert data['status'] == 'active'
        assert result['id'] == 'cls-1'

    def test_minimal_class_defaults_days_to_empty_and_omits_optionals(self):
        service = _service_with_mock_repo()

        service.create_class(
            org_id=ORG_ID,
            name='Art',
            description=None,
            xp_threshold=100,
            created_by=CREATED_BY,
        )

        data = _inserted_data(service)
        assert data['days_of_week'] == []
        # Optional fields are omitted entirely when not provided
        for key in ('start_time', 'duration_minutes', 'max_students', 'supply_fee', 'image_url', 'age_min', 'age_max'):
            assert key not in data

    def test_days_are_lowercased_and_deduped(self):
        service = _service_with_mock_repo()

        service.create_class(
            org_id=ORG_ID, name='X', description=None, xp_threshold=100,
            created_by=CREATED_BY, days_of_week=['Mon', 'MON', 'tue'],
        )

        assert _inserted_data(service)['days_of_week'] == ['mon', 'tue']


class TestCreateClassValidation:
    def _ok(self, **overrides):
        base = dict(org_id=ORG_ID, name='X', description=None, xp_threshold=100, created_by=CREATED_BY)
        base.update(overrides)
        return base

    def test_invalid_day_raises(self):
        service = _service_with_mock_repo()
        with pytest.raises(ValidationError):
            service.create_class(**self._ok(days_of_week=['funday']))

    def test_nonpositive_duration_raises(self):
        service = _service_with_mock_repo()
        with pytest.raises(ValidationError):
            service.create_class(**self._ok(duration_minutes=0))

    def test_nonpositive_max_students_raises(self):
        service = _service_with_mock_repo()
        with pytest.raises(ValidationError):
            service.create_class(**self._ok(max_students=0))

    def test_negative_supply_fee_raises(self):
        service = _service_with_mock_repo()
        with pytest.raises(ValidationError):
            service.create_class(**self._ok(supply_fee=-5))

    def test_age_min_greater_than_max_raises(self):
        service = _service_with_mock_repo()
        with pytest.raises(ValidationError):
            service.create_class(**self._ok(age_min=12, age_max=8))

    def test_missing_name_raises(self):
        service = _service_with_mock_repo()
        with pytest.raises(ValidationError):
            service.create_class(**self._ok(name='   '))
