"""
Unit tests for preferred name formatting across SIS services and routes
(Class Rosters, CLPs, Attendance, and Roster exports).
"""

import pytest
from services import sis_service
from services import sis_clp_service
from services import sis_staff_service
from services import sis_catalog_service
from services import sis_person_service
from services import sis_attendance_service


@pytest.mark.unit
class TestPreferredNameFormatting:
    def test_sis_service_full_name_preferred_name(self):
        user = {
            'first_name': 'Jenner',
            'last_name': 'Roberts',
            'preferred_name': 'Jay',
            'display_name': 'Jenner Roberts',
        }
        assert sis_service._full_name(user) == 'Jay Roberts'

    def test_sis_service_full_name_preferred_name_with_last_name(self):
        user = {
            'first_name': 'Jenner',
            'last_name': 'Roberts',
            'preferred_name': 'Jay Roberts',
            'display_name': 'Jenner Roberts',
        }
        assert sis_service._full_name(user) == 'Jay Roberts'

    def test_sis_service_full_name_no_preferred_name(self):
        user = {
            'first_name': 'Jenner',
            'last_name': 'Roberts',
            'preferred_name': None,
            'display_name': 'Jenner Roberts',
        }
        assert sis_service._full_name(user) == 'Jenner Roberts'

    def test_sis_clp_service_full_name_preferred_name(self):
        user = {
            'first_name': 'Jenner',
            'last_name': 'Roberts',
            'preferred_name': 'Jay',
            'display_name': 'Jenner Roberts',
        }
        assert sis_clp_service._full_name(user) == 'Jay Roberts'

    def test_sis_staff_service_full_name_preferred_name(self):
        user = {
            'first_name': 'Jenner',
            'last_name': 'Roberts',
            'preferred_name': 'Jay',
            'display_name': 'Jenner Roberts',
        }
        assert sis_staff_service._full_name(user) == 'Jay Roberts'

    def test_sis_catalog_service_full_name_preferred_name(self):
        user = {
            'first_name': 'Jenner',
            'last_name': 'Roberts',
            'preferred_name': 'Jay',
            'display_name': 'Jenner Roberts',
        }
        assert sis_catalog_service._full_name(user) == 'Jay Roberts'

    def test_sis_person_service_full_name_preferred_name(self):
        user = {
            'first_name': 'Jenner',
            'last_name': 'Roberts',
            'preferred_name': 'Jay',
            'display_name': 'Jenner Roberts',
        }
        assert sis_person_service._full_name(user) == 'Jay Roberts'

    def test_sis_attendance_service_student_name_preferred_name(self):
        user = {
            'first_name': 'Jenner',
            'last_name': 'Roberts',
            'preferred_name': 'Jay',
            'display_name': 'Jenner Roberts',
        }
        assert sis_attendance_service._student_name(user) == 'Jay Roberts'
