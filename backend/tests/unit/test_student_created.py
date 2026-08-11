"""Unit tests for the Student-created quest badge annotation."""

import pytest
from unittest.mock import Mock, patch

from utils.student_created import annotate_student_created


def _users_response(rows):
    admin = Mock()
    admin.table.return_value.select.return_value.in_.return_value.execute.return_value = Mock(data=rows)
    return admin


@pytest.mark.unit
class TestAnnotateStudentCreated:

    def test_student_creators_and_metadata_flag(self):
        quests = [
            {'id': 'q1', 'created_by': 'u-student'},
            {'id': 'q2', 'created_by': 'u-org-student'},
            {'id': 'q3', 'created_by': 'u-admin'},
            # Manual flag wins even though the creator is not a student
            # (e.g. staff entered the quest on a student's behalf).
            {'id': 'q4', 'created_by': 'u-admin', 'metadata': {'student_created': True}},
            {'id': 'q5', 'created_by': None},
        ]
        users = [
            {'id': 'u-student', 'role': 'student', 'org_role': None},
            {'id': 'u-org-student', 'role': 'org_managed', 'org_role': 'student'},
            {'id': 'u-admin', 'role': 'superadmin', 'org_role': None},
        ]
        with patch('utils.student_created.get_supabase_admin_client',
                   return_value=_users_response(users)):
            annotate_student_created(quests)

        assert [q['student_created'] for q in quests] == [True, True, False, True, False]

    def test_org_admin_creator_is_not_student(self):
        quests = [{'id': 'q1', 'created_by': 'u-oa'}]
        users = [{'id': 'u-oa', 'role': 'org_managed', 'org_role': 'org_admin'}]
        with patch('utils.student_created.get_supabase_admin_client',
                   return_value=_users_response(users)):
            annotate_student_created(quests)
        assert quests[0]['student_created'] is False

    def test_lookup_failure_degrades_to_metadata_only(self):
        quests = [
            {'id': 'q1', 'created_by': 'u-student'},
            {'id': 'q2', 'metadata': {'student_created': True}},
        ]
        with patch('utils.student_created.get_supabase_admin_client',
                   side_effect=RuntimeError('db down')):
            annotate_student_created(quests)
        assert quests[0]['student_created'] is False
        assert quests[1]['student_created'] is True

    def test_no_creator_ids_skips_lookup(self):
        quests = [{'id': 'q1'}]
        with patch('utils.student_created.get_supabase_admin_client') as mock_client:
            annotate_student_created(quests)
        mock_client.assert_not_called()
        assert quests[0]['student_created'] is False
