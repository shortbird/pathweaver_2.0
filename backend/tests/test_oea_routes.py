"""
Unit tests for the OEA Diploma Plan API routes (/api/oea) and the manages-student
ownership check.

Covers: pathway listing, auth gating, pathway selection happy path, validation,
invalid-pathway mapping, and the _verify_manages_student authorization helper
(superadmin / owner / non-owner / missing student).
"""

import json
from unittest.mock import Mock, patch

import pytest

from routes.oea import _verify_manages_student
from repositories.base_repository import (
    NotFoundError,
    ValidationError as RepoValidationError,
)
from middleware.error_handler import AuthorizationError


def _client_with_executes(results):
    """Fake Supabase client whose .table(...).select().eq().execute() chain
    returns the queued result rows in order (one Mock(data=...) per execute)."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    table.select.return_value = table
    table.eq.return_value = table
    table.order.return_value = table
    table.execute.side_effect = [Mock(data=d) for d in results]
    return client


@pytest.mark.unit
class TestPathways:

    def test_pathways_requires_auth(self, client):
        resp = client.get('/api/oea/pathways')
        assert resp.status_code == 401

    def test_pathways_lists_three(self, client, auth_headers, mock_verify_token):
        resp = client.get('/api/oea/pathways', headers=auth_headers)
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert data['success'] is True
        assert len(data['pathways']) == 3
        keys = {p['key'] for p in data['pathways']}
        assert keys == {'open_balanced', 'traditional', 'college_bound'}
        for p in data['pathways']:
            assert p['total_credits'] == 24
            assert p['foundation_credits'] + p['elective_credits'] == 24


@pytest.mark.unit
class TestSelectPathway:

    def test_requires_student_id(self, client, auth_headers, mock_verify_token):
        resp = client.post('/api/oea/enrollments', headers=auth_headers,
                           json={'pathway_key': 'open_balanced'})
        assert resp.status_code == 400

    def test_requires_pathway_key(self, client, auth_headers, mock_verify_token):
        resp = client.post('/api/oea/enrollments', headers=auth_headers,
                           json={'student_id': 'stu-1'})
        assert resp.status_code == 400

    def test_happy_path(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.upsert_enrollment.return_value = {
            'id': 'enr-1', 'student_id': 'stu-1', 'pathway_key': 'college_bound',
        }
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.post('/api/oea/enrollments', headers=auth_headers,
                               json={'student_id': 'stu-1', 'pathway_key': 'college_bound'})
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert data['success'] is True
        assert data['enrollment']['pathway_key'] == 'college_bound'
        # Repo called with (student_id, acting parent_id, pathway_key).
        assert mock_repo.upsert_enrollment.call_args[0] == ('stu-1', 'test-user-123', 'college_bound')
        # The full pathway definition is attached for the client.
        assert data['enrollment']['pathway']['total_credits'] == 24

    def test_ownership_denied(self, client, auth_headers, mock_verify_token):
        with patch('routes.oea._verify_manages_student',
                   side_effect=AuthorizationError('You do not manage this student')):
            resp = client.post('/api/oea/enrollments', headers=auth_headers,
                               json={'student_id': 'other-kid', 'pathway_key': 'traditional'})
        assert resp.status_code == 403

    def test_invalid_pathway_is_400(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.upsert_enrollment.side_effect = RepoValidationError('Invalid pathway: bogus')
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.post('/api/oea/enrollments', headers=auth_headers,
                               json={'student_id': 'stu-1', 'pathway_key': 'bogus'})
        assert resp.status_code == 400


@pytest.mark.unit
class TestVerifyManagesStudent:
    """The security-critical ownership gate."""

    def test_superadmin_allowed(self):
        fake = _client_with_executes([[{'role': 'superadmin'}]])
        with patch('routes.oea.get_supabase_admin_client', return_value=fake):
            # Should not raise even though the student is never looked up.
            _verify_manages_student('admin-1', 'any-student')

    def test_owner_allowed(self):
        fake = _client_with_executes([
            [{'role': 'parent'}],
            [{'id': 'stu-1', 'managed_by_parent_id': 'test-user-123'}],
        ])
        with patch('routes.oea.get_supabase_admin_client', return_value=fake):
            _verify_manages_student('test-user-123', 'stu-1')

    def test_non_owner_denied(self):
        fake = _client_with_executes([
            [{'role': 'parent'}],
            [{'id': 'stu-1', 'managed_by_parent_id': 'someone-else'}],
        ])
        with patch('routes.oea.get_supabase_admin_client', return_value=fake):
            with pytest.raises(AuthorizationError):
                _verify_manages_student('test-user-123', 'stu-1')

    def test_missing_student_not_found(self):
        fake = _client_with_executes([
            [{'role': 'parent'}],
            [],
        ])
        with patch('routes.oea.get_supabase_admin_client', return_value=fake):
            with pytest.raises(NotFoundError):
                _verify_manages_student('test-user-123', 'missing')


@pytest.mark.unit
class TestCredits:

    STU = '11111111-1111-4111-8111-111111111111'
    CID = '22222222-2222-4222-8222-222222222222'

    def test_get_credits_returns_progress_and_gpa(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_enrollment.return_value = {'id': 'e1', 'pathway_key': 'open_balanced'}
        mock_repo.get_credits.return_value = [
            {'requirement_key': 'math', 'credits': 3, 'status': 'complete', 'letter_grade': 'A', 'is_weighted': False},
        ]
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.get(f'/api/oea/students/{self.STU}/credits', headers=auth_headers)
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert data['gpa']['unweighted'] == 4.0
        assert data['progress']['foundation_earned'] == 3.0
        assert data['progress']['total_required'] == 24

    def test_add_credit_happy_path(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_enrollment.return_value = {'id': 'e1', 'pathway_key': 'open_balanced'}
        mock_repo.add_credit.return_value = {'id': 'c1', 'requirement_key': 'math', 'course_name': 'Algebra I'}
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.post(f'/api/oea/students/{self.STU}/credits', headers=auth_headers,
                               json={'requirement_key': 'math', 'course_name': 'Algebra I'})
        assert resp.status_code == 201
        # Category + subject derived from the pathway requirement, credits default 1.
        kwargs = mock_repo.add_credit.call_args.kwargs
        assert kwargs['category'] == 'foundation'
        assert kwargs['subject_key'] == 'math'
        assert kwargs['credits'] == 1.0

    def test_add_credit_rejects_unknown_requirement(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_enrollment.return_value = {'id': 'e1', 'pathway_key': 'open_balanced'}
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.post(f'/api/oea/students/{self.STU}/credits', headers=auth_headers,
                               json={'requirement_key': 'world_language', 'course_name': 'Spanish'})
        assert resp.status_code == 400  # world_language isn't in open_balanced

    def test_add_credit_requires_course_name(self, client, auth_headers, mock_verify_token):
        with patch('routes.oea._verify_manages_student', return_value=None):
            resp = client.post(f'/api/oea/students/{self.STU}/credits', headers=auth_headers,
                               json={'requirement_key': 'math'})
        assert resp.status_code == 400

    def test_mark_complete_with_grade(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_credit.return_value = {'id': self.CID, 'student_id': self.STU}
        mock_repo.update_credit.return_value = {'id': self.CID, 'status': 'complete', 'letter_grade': 'A'}
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.patch(f'/api/oea/credits/{self.CID}', headers=auth_headers,
                                json={'status': 'complete', 'letter_grade': 'A', 'is_weighted': True})
        assert resp.status_code == 200
        fields = mock_repo.update_credit.call_args[0][1]
        assert fields['status'] == 'complete'
        assert fields['letter_grade'] == 'A'
        assert fields['is_weighted'] is True
        assert fields['completed_at'] == 'now()'

    def test_patch_rejects_bad_grade(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_credit.return_value = {'id': self.CID, 'student_id': self.STU}
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.patch(f'/api/oea/credits/{self.CID}', headers=auth_headers,
                                json={'letter_grade': 'E'})
        assert resp.status_code == 400

    def test_patch_ownership_denied(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_credit.return_value = {'id': self.CID, 'student_id': 'other-kid'}
        with patch('routes.oea.OEARepository', return_value=mock_repo), \
             patch('routes.oea._verify_manages_student',
                   side_effect=AuthorizationError('You do not manage this student')):
            resp = client.patch(f'/api/oea/credits/{self.CID}', headers=auth_headers,
                                json={'letter_grade': 'A'})
        assert resp.status_code == 403

    def test_delete_credit(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_credit.return_value = {'id': self.CID, 'student_id': self.STU}
        mock_repo.delete_credit.return_value = True
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.delete(f'/api/oea/credits/{self.CID}', headers=auth_headers)
        assert resp.status_code == 200
        mock_repo.delete_credit.assert_called_once()

    def test_delete_missing_credit_404(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_credit.return_value = None
        with patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.delete(f'/api/oea/credits/{self.CID}', headers=auth_headers)
        assert resp.status_code == 404
