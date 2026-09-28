"""A teacher's own checklist uploads on My Documents.

Ticket 21e770cc (iCreate, SIS /library?tab=documents&docs=mine): "Cassea let
me know her secure docs aren't all showing here. I can see them in the school
secure docs though."

The school's cabinet (GET /api/sis/secure-documents) merges checklist
attachments into the secure store's rows; the teacher's own view read only the
store, so her I-9, W-4, ID, background check and quest proof -- all uploaded
through her tasks -- showed for the office and not for her. My Documents now
lists her own checklist uploads, and opening one re-checks that the assignment
behind the id is hers. Another person's checklist document is never listed and
never signed.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

ORG = 'org-1'
ME = 'test-user-123'      # the caller (see conftest.mock_verify_token)
OTHER = 'teacher-2'

SECURE_DOC = {
    'id': 'doc-1', 'filename': 'Contract.pdf', 'title': 'Contract', 'category': 'Contract',
    'note': None, 'size_bytes': 1000, 'created_at': '2026-09-01T00:00:00Z',
    'shared_with_owner': True, 'uploaded_by_owner': False,
    'organization_id': ORG, 'owner_user_id': ME, 'storage_path': f'{ORG}/c.pdf',
}


def _assignment(aid, user_id, key, filename, path, org=ORG):
    return {
        'id': aid, 'organization_id': org, 'user_id': user_id, 'audience': 'staff',
        'items': [{'key': key, 'title': key.upper(), 'documents': [
            {'path': path, 'filename': filename, 'uploaded_at': '2026-09-20 10:00:00+00'},
        ]}],
    }


ASSIGNMENTS = [
    _assignment('a-mine', ME, 'i9', 'I-9.pdf', f'{ORG}/{ME}/i9.pdf'),
    _assignment('a-other', OTHER, 'i9', 'Their I-9.pdf', f'{ORG}/{OTHER}/i9.pdf'),
]


class _Query:
    """Filtering stand-in for one table: eq / in_ / range, like PostgREST."""

    def __init__(self, rows, log=None):
        self.rows, self.filters, self.rng, self.log = rows, [], None, log

    def select(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def eq(self, field, value):
        if self.log is not None:
            self.log.append((field, value))
        self.filters.append(lambda r: r.get(field) == value)
        return self

    def in_(self, field, values):
        values = set(values)
        self.filters.append(lambda r: r.get(field) in values)
        return self

    def limit(self, n):
        self.rng = (0, n - 1)
        return self

    def range(self, a, b):
        self.rng = (a, b)
        return self

    def execute(self):
        hit = [r for r in self.rows if all(f(r) for f in self.filters)]
        if self.rng:
            hit = hit[self.rng[0]:self.rng[1] + 1]
        return Mock(data=[json.loads(json.dumps(r)) for r in hit])


def _db_client(secure_docs, assignments, log=None):
    tables = {'sis_secure_documents': secure_docs, 'sis_onboarding_assignments': assignments}
    client = Mock()
    client.table.side_effect = lambda n: _Query(tables.get(n, []), log if n == 'sis_onboarding_assignments' else None)
    client.storage.from_.return_value.create_signed_url.side_effect = (
        lambda path, _ttl: {'signedURL': f'https://signed.example/{path}'})
    return client


def _role_client():
    client = Mock()
    t = Mock()
    client.table.return_value = t
    for chained in ('select', 'eq', 'limit', 'in_', 'is_', 'neq', 'order'):
        getattr(t, chained).return_value = t
    t.execute.return_value = Mock(data=[{
        'role': 'org_managed', 'org_role': 'advisor', 'org_roles': ['advisor'],
    }])
    return client


@contextmanager
def _as_teacher(db_client):
    with patch('database.get_supabase_admin_client', return_value=_role_client()), \
         patch('routes.sis.staff_portal.get_supabase_admin_client', return_value=db_client), \
         patch('routes.sis.portal_views.get_supabase_admin_client', return_value=db_client), \
         patch('services.sis_secure_docs_service._admin', return_value=db_client), \
         patch('services.sis_onboarding_service._admin', return_value=db_client), \
         patch('services.sis_service.resolve_org_id', return_value=ORG), \
         patch('services.sis_service.caller_is_admin', return_value=False), \
         patch('services.sis_service.caller_sees_hr', return_value=False):
        yield


@pytest.mark.unit
class TestMyDocumentsListsOwnChecklistUploads:
    def test_own_checklist_documents_are_listed(self, client, auth_headers, mock_verify_token):
        """Ticket 21e770cc: "Cassea let me know her secure docs aren't all
        showing here." Her own checklist upload now appears, among the things
        she sent in."""
        log = []
        db = _db_client([SECURE_DOC], ASSIGNMENTS, log)
        with _as_teacher(db):
            resp = client.get(f'/api/sis/teacher/my-documents?organization_id={ORG}',
                              headers=auth_headers)
        assert resp.status_code == 200
        docs = json.loads(resp.data)['documents']
        checklist = [d for d in docs if d.get('source') == 'checklist']
        assert [d['id'] for d in checklist] == ['checklist:a-mine:i9:0']
        mine = checklist[0]
        # The fields MyDocumentsPanel renders and sorts into "You sent".
        assert mine['uploaded_by_owner'] is True
        assert mine['title'] == 'I-9.pdf'
        assert mine['category'] == 'I9'
        assert mine['created_at']
        # The bucket path stays on the server; the page opens by id.
        assert 'storage_path' not in mine
        # The read itself is scoped to the caller's own assignments.
        assert ('user_id', ME) in log

    def test_another_teachers_checklist_documents_are_not_listed(
            self, client, auth_headers, mock_verify_token):
        """Ticket 21e770cc, refused case: the fix must not turn My Documents
        into the office's cabinet -- nobody else's I-9 appears here."""
        db = _db_client([], ASSIGNMENTS)
        with _as_teacher(db):
            resp = client.get(f'/api/sis/teacher/my-documents?organization_id={ORG}',
                              headers=auth_headers)
        docs = json.loads(resp.data)['documents']
        assert all('a-other' not in d['id'] for d in docs)
        assert all(d.get('owner_user_id', ME) == ME for d in docs)

    def test_linked_store_document_is_not_listed(self, client, auth_headers, mock_verify_token):
        """An item the office linked to a secure-store document has no upload
        path; that document's own sharing flag decides whether the teacher sees
        it (a background check the office never shared must stay hidden)."""
        linked = {
            'id': 'a-linked', 'organization_id': ORG, 'user_id': ME, 'audience': 'staff',
            'items': [{'key': 'bg', 'title': 'Background check', 'documents': [
                {'secure_document_id': 'doc-hidden', 'filename': 'Background.pdf'}]}],
        }
        db = _db_client([], [linked])
        with _as_teacher(db):
            resp = client.get(f'/api/sis/teacher/my-documents?organization_id={ORG}',
                              headers=auth_headers)
        assert json.loads(resp.data)['documents'] == []

    def test_secure_documents_are_still_listed(self, client, auth_headers, mock_verify_token):
        """Ticket 21e770cc, default path: what the office shared with her is
        still there, alongside the checklist uploads."""
        db = _db_client([SECURE_DOC], ASSIGNMENTS)
        with _as_teacher(db):
            resp = client.get(f'/api/sis/teacher/my-documents?organization_id={ORG}',
                              headers=auth_headers)
        ids = [d['id'] for d in json.loads(resp.data)['documents']]
        assert 'doc-1' in ids
        assert 'checklist:a-mine:i9:0' in ids


@pytest.mark.unit
class TestOpeningAChecklistDocument:
    def test_owner_can_open_their_checklist_document(self, client, auth_headers, mock_verify_token):
        """Ticket 21e770cc: a listed document that cannot be opened is no fix."""
        db = _db_client([], ASSIGNMENTS)
        with _as_teacher(db):
            resp = client.get(
                f'/api/sis/teacher/my-documents/checklist:a-mine:i9:0/url?organization_id={ORG}',
                headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['url'] == f'https://signed.example/{ORG}/{ME}/i9.pdf'
        db.storage.from_.assert_called_with('staff-documents')

    def test_another_persons_checklist_document_is_refused(
            self, client, auth_headers, mock_verify_token):
        """Ticket 21e770cc, refused case: guessing another teacher's checklist
        id signs nothing."""
        db = _db_client([], ASSIGNMENTS)
        with _as_teacher(db):
            resp = client.get(
                f'/api/sis/teacher/my-documents/checklist:a-other:i9:0/url?organization_id={ORG}',
                headers=auth_headers)
        assert resp.status_code == 404
        db.storage.from_.return_value.create_signed_url.assert_not_called()

    def test_another_orgs_assignment_is_refused(self, client, auth_headers, mock_verify_token):
        db = _db_client([], [_assignment('a-far', ME, 'i9', 'x.pdf', 'org-2/x/i9.pdf', org='org-2')])
        with _as_teacher(db):
            resp = client.get(
                f'/api/sis/teacher/my-documents/checklist:a-far:i9:0/url?organization_id={ORG}',
                headers=auth_headers)
        assert resp.status_code == 404
        db.storage.from_.return_value.create_signed_url.assert_not_called()

    @pytest.mark.parametrize('doc_id', [
        'checklist:a-mine:i9:7', 'checklist:a-mine:nope:0', 'checklist:a-mine', 'checklist:a-mine:i9:x',
    ])
    def test_malformed_or_missing_ids_are_not_found(
            self, client, auth_headers, mock_verify_token, doc_id):
        db = _db_client([], ASSIGNMENTS)
        with _as_teacher(db):
            resp = client.get(
                f'/api/sis/teacher/my-documents/{doc_id}/url?organization_id={ORG}',
                headers=auth_headers)
        assert resp.status_code == 404
