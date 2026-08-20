"""The teacher-portal preview on My Documents.

iCreate, 2026-08-19: the office filed a contract for each of nineteen teachers,
shared them, then walked the staff list with "View portal" to check each one had
landed. Every teacher's My Documents showed the same file — the ADMIN's own
background check — because this endpoint ignored ?teacher_id= and answered with
the caller's own documents whatever the rest of the previewed portal was showing.

So: the read follows the preview, and the ONE tier allowed to follow it is HR
(org_admin / superadmin). A campus coordinator gets a 403 rather than a quiet
fallback to their own documents — this store holds contracts and background
checks, and "here are yours instead" is the bug, not the safe answer.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

ORG = 'org-1'
ADMIN = 'test-user-123'   # the caller (see conftest.mock_verify_token)
TEACHER = 'teach-1'

TEACHER_DOC = {
    'id': 'doc-1', 'filename': 'Teacher Employee Agreement - Ana Rogers.pdf',
    'title': 'Teacher Employee Agreement - Ana Rogers.pdf', 'category': 'Contract',
    'note': None, 'size_bytes': 108796, 'created_at': '2026-08-18T05:15:41Z',
    'shared_with_owner': True, 'uploaded_by_owner': False,
    'organization_id': ORG, 'owner_user_id': TEACHER,
    'storage_path': f'{ORG}/abc.pdf',
}


def _portal_client(docs, target_org=ORG):
    """A stand-in for the admin client, dispatching by table.

    `users` answers the preview's org check; `sis_secure_documents` records the
    owner filter it was asked for, which is the whole assertion here.
    """
    calls = {'owner': None}

    def _table(name):
        t = Mock()
        for chained in ('select', 'limit', 'order', 'in_'):
            getattr(t, chained).return_value = t

        def _eq(field, value):
            if field == 'owner_user_id':
                calls['owner'] = value
            return t
        t.eq.side_effect = _eq
        t.execute.return_value = Mock(
            data=[{'id': TEACHER, 'organization_id': target_org}] if name == 'users' else docs)
        return t

    client = Mock()
    client.table.side_effect = _table
    client.storage.from_.return_value.create_signed_url.return_value = {
        'signedURL': 'https://signed.example/doc'}
    return client, calls


def _role_client(role='org_managed', org_role='org_admin'):
    """What @require_role reads: the caller's own role row."""
    client = Mock()
    t = Mock()
    client.table.return_value = t
    for chained in ('select', 'eq', 'limit', 'in_', 'is_', 'neq', 'order'):
        getattr(t, chained).return_value = t
    t.execute.return_value = Mock(data=[{
        'role': role, 'org_role': org_role, 'org_roles': [org_role],
    }])
    return client


@contextmanager
def _as(client_mock, *, is_admin=True, sees_hr=True, org_role='org_admin'):
    with patch('database.get_supabase_admin_client', return_value=_role_client(org_role=org_role)), \
         patch('routes.sis.staff_portal.get_supabase_admin_client', return_value=client_mock), \
         patch('services.sis_service.resolve_org_id', return_value=ORG), \
         patch('services.sis_service.caller_is_admin', return_value=is_admin), \
         patch('services.sis_service.caller_sees_hr', return_value=sees_hr):
        yield


@pytest.mark.unit
class TestMyDocumentsPreview:
    def test_hr_admin_preview_reads_the_teachers_documents(
            self, client, auth_headers, mock_verify_token):
        admin_client, calls = _portal_client([TEACHER_DOC])
        with _as(admin_client):
            resp = client.get(
                f'/api/sis/teacher/my-documents?organization_id={ORG}&teacher_id={TEACHER}',
                headers=auth_headers)
        assert resp.status_code == 200
        body = json.loads(resp.data)
        # The teacher's contract, not the admin's own filing cabinet.
        assert calls['owner'] == TEACHER
        assert body['previewing'] is True
        assert body['documents'][0]['id'] == 'doc-1'

    def test_without_preview_it_is_still_the_callers_own(
            self, client, auth_headers, mock_verify_token):
        admin_client, calls = _portal_client([])
        with _as(admin_client):
            resp = client.get(f'/api/sis/teacher/my-documents?organization_id={ORG}',
                              headers=auth_headers)
        assert resp.status_code == 200
        assert calls['owner'] == ADMIN
        assert json.loads(resp.data)['previewing'] is False

    def test_campus_coordinator_is_refused_rather_than_shown_their_own(
            self, client, auth_headers, mock_verify_token):
        """The coordinator tier does not see employment paperwork (HR_ROLES),
        and must not be handed their own documents under a teacher's name."""
        admin_client, calls = _portal_client([TEACHER_DOC])
        with _as(admin_client, is_admin=True, sees_hr=False):
            resp = client.get(
                f'/api/sis/teacher/my-documents?organization_id={ORG}&teacher_id={TEACHER}',
                headers=auth_headers)
        assert resp.status_code == 403
        assert calls['owner'] is None  # nothing was read at all

    def test_teacher_cannot_spoof_the_preview(self, client, auth_headers, mock_verify_token):
        admin_client, calls = _portal_client([])
        with _as(admin_client, is_admin=False, sees_hr=False):
            resp = client.get(
                f'/api/sis/teacher/my-documents?organization_id={ORG}&teacher_id={TEACHER}',
                headers=auth_headers)
        assert resp.status_code == 200
        assert calls['owner'] == ADMIN

    def test_preview_of_another_org_falls_back_to_the_caller(
            self, client, auth_headers, mock_verify_token):
        admin_client, calls = _portal_client([], target_org='org-OTHER')
        with _as(admin_client):
            resp = client.get(
                f'/api/sis/teacher/my-documents?organization_id={ORG}&teacher_id={TEACHER}',
                headers=auth_headers)
        assert resp.status_code == 200
        assert calls['owner'] == ADMIN


@pytest.mark.unit
class TestMyDocumentUrlPreview:
    """Opening the file follows the same rule as listing it — otherwise the
    office can see a contract's name in the preview and not open it."""

    def test_hr_admin_opens_the_teachers_document(self, client, auth_headers, mock_verify_token):
        admin_client, _ = _portal_client([TEACHER_DOC])
        with _as(admin_client):
            resp = client.get(
                f'/api/sis/teacher/my-documents/doc-1/url?organization_id={ORG}'
                f'&teacher_id={TEACHER}', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['url'] == 'https://signed.example/doc'

    def test_without_preview_someone_elses_document_is_not_found(
            self, client, auth_headers, mock_verify_token):
        admin_client, _ = _portal_client([TEACHER_DOC])
        with _as(admin_client):
            resp = client.get(
                f'/api/sis/teacher/my-documents/doc-1/url?organization_id={ORG}',
                headers=auth_headers)
        assert resp.status_code == 404

    def test_campus_coordinator_preview_is_refused(self, client, auth_headers, mock_verify_token):
        admin_client, _ = _portal_client([TEACHER_DOC])
        with _as(admin_client, is_admin=True, sees_hr=False):
            resp = client.get(
                f'/api/sis/teacher/my-documents/doc-1/url?organization_id={ORG}'
                f'&teacher_id={TEACHER}', headers=auth_headers)
        assert resp.status_code == 403
