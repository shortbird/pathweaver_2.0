"""
Tests for class parent visibility (is_visible_to_parents toggle).

When is_visible_to_parents is False:
- Staff views (audience='staff') see the class.
- Family/public views (audience='family') filter out the class.
"""

import pytest
from unittest.mock import patch, MagicMock
from services import sis_catalog_service as catalog


class TestClassParentVisibility:
    VISIBLE_CLASS = {
        'id': 'class-1',
        'organization_id': 'org-123',
        'name': 'Public Microschool',
        'is_visible_to_parents': True,
        'registration_status': 'open',
    }

    HIDDEN_CLASS = {
        'id': 'class-2',
        'organization_id': 'org-123',
        'name': 'Internal Teacher Placement Class',
        'is_visible_to_parents': False,
        'registration_status': 'open',
    }

    @patch('services.sis_catalog_service._classes_repo')
    def test_list_classes_staff_audience_sees_all(self, mock_repo_fn):
        mock_repo = MagicMock()
        mock_repo.list_for_org.return_value = [self.VISIBLE_CLASS, self.HIDDEN_CLASS]
        mock_repo.enrollment_counts_for_classes.return_value = {}
        mock_repo.waitlist_breakdown_for_classes.return_value = {}
        mock_repo.meetings_for_classes.return_value = []
        mock_repo_fn.return_value = mock_repo

        with patch('services.sis_catalog_service._instructors_by_id', return_value={}):
            classes = catalog.list_classes('org-123', audience='staff')

        assert len(classes) == 2
        assert {c['id'] for c in classes} == {'class-1', 'class-2'}

    @patch('services.sis_catalog_service._classes_repo')
    def test_list_classes_family_audience_filters_hidden(self, mock_repo_fn):
        mock_repo = MagicMock()
        mock_repo.list_for_org.return_value = [self.VISIBLE_CLASS, self.HIDDEN_CLASS]
        mock_repo.enrollment_counts_for_classes.return_value = {}
        mock_repo.waitlist_breakdown_for_classes.return_value = {}
        mock_repo.meetings_for_classes.return_value = []
        mock_repo_fn.return_value = mock_repo

        with patch('services.sis_catalog_service._instructors_by_id', return_value={}):
            classes = catalog.list_classes('org-123', audience='family')

        assert len(classes) == 1
        assert classes[0]['id'] == 'class-1'

    @patch('services.sis_catalog_service._classes_repo')
    def test_get_class_detail_family_audience_blocks_hidden(self, mock_repo_fn):
        mock_repo = MagicMock()
        mock_repo.find_by_id.return_value = dict(self.HIDDEN_CLASS)
        mock_repo_fn.return_value = mock_repo

        detail = catalog.get_class_detail('org-123', 'class-2', audience='family')
        assert detail is None

        mock_repo.find_by_id.return_value = dict(self.HIDDEN_CLASS)
        mock_repo.active_enrollment_count.return_value = 0
        mock_repo.list_meetings.return_value = []
        mock_repo.list_prerequisites.return_value = []

        with patch('services.sis_catalog_service._instructors_by_id', return_value={}):
            detail_staff = catalog.get_class_detail('org-123', 'class-2', audience='staff')
        assert detail_staff is not None
        assert detail_staff['id'] == 'class-2'
