"""
Unit tests for the OEA Diploma Plan API routes (/api/oea) and the manages-student
ownership check.

Covers: pathway listing, auth gating, pathway selection happy path, validation,
invalid-pathway mapping, and the _verify_manages_student authorization helper
(superadmin / owner / non-owner / missing student).
"""

import json
from contextlib import contextmanager
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
    table.limit.return_value = table
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

    def test_connected_parent_via_approved_link_allowed(self):
        # Not a managed dependent, but an approved parent_student_link exists.
        fake = _client_with_executes([
            [{'role': 'parent'}],
            [{'id': 'stu-1', 'managed_by_parent_id': 'someone-else'}],
            [{'id': 'link-1'}],
        ])
        with patch('routes.oea.get_supabase_admin_client', return_value=fake):
            _verify_manages_student('test-user-123', 'stu-1')

    def test_non_owner_denied(self):
        # Neither a managed dependent nor an approved link (empty link result).
        fake = _client_with_executes([
            [{'role': 'parent'}],
            [{'id': 'stu-1', 'managed_by_parent_id': 'someone-else'}],
            [],
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

    def test_self_allowed_when_opted_in(self):
        # A student reading their own record (allow_self) needs no user lookup.
        fake = _client_with_executes([])
        with patch('routes.oea.get_supabase_admin_client', return_value=fake):
            _verify_manages_student('stu-1', 'stu-1', allow_self=True)
        fake.table.assert_not_called()

    def test_self_denied_without_opt_in(self):
        # Writes never pass allow_self: the student is not their own parent,
        # not a managed dependent, and has no self-link.
        fake = _client_with_executes([
            [{'role': 'student'}],
            [{'id': 'stu-1', 'managed_by_parent_id': 'parent-9'}],
            [],
        ])
        with patch('routes.oea.get_supabase_admin_client', return_value=fake):
            with pytest.raises(AuthorizationError):
                _verify_manages_student('stu-1', 'stu-1')


@contextmanager
def _authenticated_as(user_id):
    """Authenticate the request as user_id (a real UUID, so validate_uuid_param
    on self-targeting routes passes), bypassing the non-UUID mock_verify_token."""
    with patch('utils.auth.token_utils.verify_token', return_value=user_id), \
         patch('utils.session_manager.session_manager.verify_access_token',
               return_value={'user_id': user_id}), \
         patch('utils.session_manager.session_manager.verify_acting_as_token', return_value=None), \
         patch('utils.session_manager.session_manager.verify_masquerade_token', return_value=None):
        yield


@pytest.mark.unit
class TestOrgLogoHeader:
    """OEA course quests use the school's logo as the quest header image."""

    def test_returns_org_logo_when_set(self):
        from repositories.oea_repository import OEARepository
        fake = _client_with_executes([[{'branding_config': {'logo_url': 'data:image/png;base64,AAA'}}]])
        assert OEARepository(client=fake)._org_logo_url('org-1') == 'data:image/png;base64,AAA'

    def test_none_when_branding_empty(self):
        from repositories.oea_repository import OEARepository
        fake = _client_with_executes([[{'branding_config': {}}]])
        assert OEARepository(client=fake)._org_logo_url('org-1') is None

    def test_none_without_org(self):
        from repositories.oea_repository import OEARepository
        # No org -> no lookup, no header image (default gradient kept).
        assert OEARepository(client=Mock())._org_logo_url(None) is None


@pytest.mark.unit
class TestIsOeaStudent:
    """OEA membership: program_key 'opened-academy' OR org slug 'oea'."""

    def test_true_by_program_key(self):
        from routes.oea import _is_oea_student
        fake = _client_with_executes([[{'program_key': 'opened-academy', 'organization_id': None}]])
        with patch('routes.oea.get_supabase_admin_client', return_value=fake):
            assert _is_oea_student('stu-1') is True

    def test_true_by_org_slug(self):
        from routes.oea import _is_oea_student
        fake = _client_with_executes([
            [{'program_key': None, 'organization_id': 'org-oea'}],
            [{'slug': 'oea'}],
        ])
        with patch('routes.oea.get_supabase_admin_client', return_value=fake):
            assert _is_oea_student('stu-1') is True

    def test_false_for_other_org(self):
        from routes.oea import _is_oea_student
        fake = _client_with_executes([
            [{'program_key': None, 'organization_id': 'org-x'}],
            [{'slug': 'someschool'}],
        ])
        with patch('routes.oea.get_supabase_admin_client', return_value=fake):
            assert _is_oea_student('stu-1') is False

    def test_false_for_platform_student(self):
        from routes.oea import _is_oea_student
        fake = _client_with_executes([[{'program_key': None, 'organization_id': None}]])
        with patch('routes.oea.get_supabase_admin_client', return_value=fake):
            assert _is_oea_student('stu-1') is False


@pytest.mark.unit
class TestStudentSelfRead:
    """A student may read their own diploma; the read endpoints opt into allow_self."""

    STU = '33333333-3333-4333-8333-333333333333'

    def test_student_reads_own_credits(self, client, auth_headers):
        mock_repo = Mock()
        mock_repo.get_enrollment.return_value = {'id': 'enr-1', 'pathway_key': 'traditional'}
        mock_repo.get_credits.return_value = []
        mock_repo.get_evidence_counts.return_value = {}
        with _authenticated_as(self.STU), \
             patch('routes.oea.OEARepository', return_value=mock_repo), \
             patch('routes.oea._is_oea_student', return_value=True), \
             patch('routes.oea.get_supabase_admin_client', return_value=Mock()):
            resp = client.get(f'/api/oea/students/{self.STU}/credits', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['success'] is True

    def test_student_write_to_self_denied(self, client, auth_headers):
        # Adding a credit is a write — allow_self is not passed, so self is denied.
        fake = _client_with_executes([
            [{'role': 'student'}],
            [{'id': self.STU, 'managed_by_parent_id': 'parent-9'}],
            [],
        ])
        with _authenticated_as(self.STU), \
             patch('routes.oea.get_supabase_admin_client', return_value=fake):
            resp = client.post(f'/api/oea/students/{self.STU}/credits', headers=auth_headers,
                               json={'requirement_key': 'math', 'course_name': 'Algebra'})
        assert resp.status_code == 403


@pytest.mark.unit
class TestCredits:

    STU = '11111111-1111-4111-8111-111111111111'
    CID = '22222222-2222-4222-8222-222222222222'

    def test_get_credits_returns_progress_and_gpa(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_enrollment.return_value = {'id': 'e1', 'pathway_key': 'open_balanced'}
        mock_repo.get_credits.return_value = [
            {'id': 'c1', 'requirement_key': 'math', 'credits': 3, 'status': 'complete', 'letter_grade': 'A', 'is_weighted': False},
        ]
        mock_repo.get_evidence_counts.return_value = {}
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea._is_oea_student', return_value=True), \
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
        mock_repo.add_credit.return_value = {'id': 'c1', 'student_id': 'stu', 'requirement_key': 'math', 'course_name': 'Algebra I'}
        mock_repo.create_course_quest.return_value = 'quest-1'
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
        # A student quest is auto-created and linked to the new credit.
        assert json.loads(resp.data)['credit']['quest_id'] == 'quest-1'
        mock_repo.create_course_quest.assert_called_once()

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
        mock_repo.get_credit.return_value = {'id': self.CID, 'student_id': self.STU, 'quest_id': 'q-1'}
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
        # Completing the credit marks the linked quest done so it drops off the
        # student's current quests.
        mock_repo.set_course_quest_completed.assert_called_once_with(self.STU, 'q-1', completed=True)

    def test_revert_to_in_progress_reopens_quest(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_credit.return_value = {'id': self.CID, 'student_id': self.STU, 'quest_id': 'q-1'}
        mock_repo.update_credit.return_value = {'id': self.CID, 'status': 'in_progress', 'letter_grade': None}
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.patch(f'/api/oea/credits/{self.CID}', headers=auth_headers,
                                json={'status': 'in_progress'})
        assert resp.status_code == 200
        mock_repo.set_course_quest_completed.assert_called_once_with(self.STU, 'q-1', completed=False)

    def test_rename_only_does_not_touch_quest(self, client, auth_headers, mock_verify_token):
        # No status change -> the linked quest is left alone.
        mock_repo = Mock()
        mock_repo.get_credit.return_value = {'id': self.CID, 'student_id': self.STU, 'quest_id': 'q-1'}
        mock_repo.update_credit.return_value = {'id': self.CID, 'course_name': 'Algebra II'}
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.patch(f'/api/oea/credits/{self.CID}', headers=auth_headers,
                                json={'course_name': 'Algebra II'})
        assert resp.status_code == 200
        mock_repo.set_course_quest_completed.assert_not_called()

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

    def test_credits_include_evidence_count(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_enrollment.return_value = {'id': 'e1', 'pathway_key': 'open_balanced'}
        mock_repo.get_credits.return_value = [{'id': 'c1', 'requirement_key': 'math', 'credits': 3, 'status': 'in_progress', 'letter_grade': None, 'is_weighted': False}]
        mock_repo.get_evidence_counts.return_value = {'c1': 2}
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea._is_oea_student', return_value=True), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.get(f'/api/oea/students/{self.STU}/credits', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['credits'][0]['evidence_count'] == 2


@pytest.mark.unit
class TestCreditEvidence:

    CID = '22222222-2222-4222-8222-222222222222'
    EID = '33333333-3333-4333-8333-333333333333'

    def test_add_text_evidence(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_credit.return_value = {'id': self.CID, 'student_id': 'stu'}
        mock_repo.add_credit_evidence.return_value = {'id': self.EID, 'block_type': 'text'}
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.post(f'/api/oea/credits/{self.CID}/evidence', headers=auth_headers,
                               json={'block_type': 'text', 'content': {'text': 'Final essay'}})
        assert resp.status_code == 201
        kwargs = mock_repo.add_credit_evidence.call_args.kwargs
        assert kwargs['block_type'] == 'text'
        assert kwargs['student_id'] == 'stu'

    def test_add_link_requires_url(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_credit.return_value = {'id': self.CID, 'student_id': 'stu'}
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.post(f'/api/oea/credits/{self.CID}/evidence', headers=auth_headers,
                               json={'block_type': 'link', 'content': {}})
        assert resp.status_code == 400

    def test_add_rejects_bad_type(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_credit.return_value = {'id': self.CID, 'student_id': 'stu'}
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.post(f'/api/oea/credits/{self.CID}/evidence', headers=auth_headers,
                               json={'block_type': 'video', 'content': {'url': 'x'}})
        assert resp.status_code == 400

    def test_list_evidence_ownership_denied(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_credit.return_value = {'id': self.CID, 'student_id': 'other-kid'}
        with patch('routes.oea.OEARepository', return_value=mock_repo), \
             patch('routes.oea._verify_manages_student',
                   side_effect=AuthorizationError('nope')):
            resp = client.get(f'/api/oea/credits/{self.CID}/evidence', headers=auth_headers)
        assert resp.status_code == 403

    def test_delete_evidence(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_evidence.return_value = {'id': self.EID, 'student_id': 'stu'}
        mock_repo.delete_credit_evidence.return_value = True
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.delete(f'/api/oea/evidence/{self.EID}', headers=auth_headers)
        assert resp.status_code == 200
        mock_repo.delete_credit_evidence.assert_called_once()

    def test_delete_missing_evidence_404(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_evidence.return_value = None
        with patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.delete(f'/api/oea/evidence/{self.EID}', headers=auth_headers)
        assert resp.status_code == 404


@pytest.mark.unit
class TestCourseQuest:

    CID = '22222222-2222-4222-8222-222222222222'

    def test_ensure_creates_quest_when_missing(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_credit.return_value = {
            'id': self.CID, 'student_id': 'stu', 'course_name': 'Algebra I',
            'requirement_key': 'math', 'quest_id': None,
        }
        mock_repo.get_enrollment.return_value = {'id': 'e1', 'pathway_key': 'open_balanced'}
        mock_repo.create_course_quest.return_value = 'quest-9'
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.post(f'/api/oea/credits/{self.CID}/quest', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['quest_id'] == 'quest-9'
        mock_repo.create_course_quest.assert_called_once()
        mock_repo.update_credit.assert_called_once()

    def test_ensure_returns_existing_quest(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_credit.return_value = {
            'id': self.CID, 'student_id': 'stu', 'course_name': 'Algebra I',
            'requirement_key': 'math', 'quest_id': 'already-here',
        }
        with patch('routes.oea._verify_manages_student', return_value=None), \
             patch('routes.oea.OEARepository', return_value=mock_repo):
            resp = client.post(f'/api/oea/credits/{self.CID}/quest', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['quest_id'] == 'already-here'
        mock_repo.create_course_quest.assert_not_called()

    def test_ensure_ownership_denied(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.get_credit.return_value = {'id': self.CID, 'student_id': 'other', 'quest_id': None}
        with patch('routes.oea.OEARepository', return_value=mock_repo), \
             patch('routes.oea._verify_manages_student', side_effect=AuthorizationError('nope')):
            resp = client.post(f'/api/oea/credits/{self.CID}/quest', headers=auth_headers)
        assert resp.status_code == 403
