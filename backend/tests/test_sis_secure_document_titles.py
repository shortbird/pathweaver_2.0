"""
Secure documents: naming them, renaming them, and filing one upload against
several people at once.

Both from iCreate, 2026-08-11:
  - "Can we have a way for teachers to NAME the file and also a way for us to
     rename them file? It's easier if they name it something in the
     standardized manner first, but if they [don't], then we can."
  - "Can we do have a drop down to attach it to a person so we can upload a
     document for multiple people?"

The multi-attach design under test: one row and one blob PER PERSON, not one
shared blob. Everything downstream of a document is per-person — sharing is
toggled for one teacher at a time and DELETE removes the blob — so a shared
blob would mean deleting one person's copy blanks the file for everyone else.
"""

from contextlib import contextmanager
from io import BytesIO
from unittest.mock import Mock, patch

import pytest

from routes.sis import secure_documents as docs


def _admin_client_for_role(role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(
        data=[{'role': role, 'org_role': None, 'org_roles': None}]
    )
    return client


class _StoreSpy:
    """Stands in for the admin client the route uses: records blob uploads and
    the metadata rows inserted, so a test can assert on both halves."""

    def __init__(self, existing_doc=None):
        self.uploaded_paths = []
        self.removed_paths = []
        self.inserted = None
        self.updated = None
        self._existing = existing_doc

        bucket = Mock()
        bucket.upload.side_effect = lambda path, **kw: self.uploaded_paths.append(path)
        bucket.remove.side_effect = lambda paths: self.removed_paths.extend(paths)
        self.storage = Mock()
        self.storage.from_.return_value = bucket

    def table(self, _name):
        t = Mock()
        for chained in ('select', 'eq', 'limit', 'order'):
            getattr(t, chained).return_value = t

        def _insert(rows):
            self.inserted = rows
            t.execute.return_value = Mock(data=rows)
            return t

        def _update(fields):
            self.updated = fields
            t.execute.return_value = Mock(data=[{**(self._existing or {}), **fields}])
            return t

        t.insert.side_effect = _insert
        t.update.side_effect = _update
        t.execute.return_value = Mock(data=[self._existing] if self._existing else [])
        return t


@contextmanager
def _hr_admin(store, org='org-1'):
    """An HR-gated caller reaching the handler, with storage and DB stubbed."""
    with patch('database.get_supabase_admin_client',
               return_value=_admin_client_for_role('org_admin')), \
         patch('routes.sis.secure_documents.get_supabase_admin_client',
               return_value=store), \
         patch('services.sis_secure_docs_service.get_supabase_admin_client',
               return_value=store), \
         patch('services.sis_service.resolve_org_id', return_value=org):
        yield


# A minimal but genuine PDF. The upload path identifies files by their magic
# bytes rather than trusting the extension, so a placeholder like b'pdf-bytes'
# named .pdf is correctly refused — see
# sis_secure_docs_service.resolve_content_type. These tests are about titles, so
# they need a file that gets past that gate.
MINIMAL_PDF = b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'


def _upload(client, auth_headers, store, **fields):
    data = {'file': (BytesIO(MINIMAL_PDF), 'IMG_4021.pdf'), 'organization_id': 'org-1'}
    data.update(fields)
    with _hr_admin(store):
        return client.post('/api/sis/secure-documents/upload',
                           headers=auth_headers, data=data,
                           content_type='multipart/form-data')


@pytest.mark.unit
class TestNamingAFileOnUpload:

    def test_the_uploader_name_becomes_the_title(self, client, auth_headers, mock_verify_token):
        store = _StoreSpy()
        resp = _upload(client, auth_headers, store, title='Smith - Contract 2026')
        assert resp.status_code == 201
        assert store.inserted[0]['title'] == 'Smith - Contract 2026'

    def test_the_filename_is_kept_as_provenance_even_when_renamed(
            self, client, auth_headers, mock_verify_token):
        """Renaming must not erase what the file actually arrived as — the
        office matches paper against the system by it."""
        store = _StoreSpy()
        _upload(client, auth_headers, store, title='Smith - Contract 2026')
        assert store.inserted[0]['filename'] == 'IMG_4021.pdf'

    def test_no_name_given_falls_back_to_the_filename(
            self, client, auth_headers, mock_verify_token):
        store = _StoreSpy()
        _upload(client, auth_headers, store)
        assert store.inserted[0]['title'] == 'IMG_4021.pdf'

    def test_a_whitespace_name_falls_back_rather_than_saving_blank(
            self, client, auth_headers, mock_verify_token):
        store = _StoreSpy()
        _upload(client, auth_headers, store, title='   ')
        assert store.inserted[0]['title'] == 'IMG_4021.pdf'

    def test_an_absurdly_long_name_is_capped_not_rejected(
            self, client, auth_headers, mock_verify_token):
        """A pasted paragraph shouldn't cost the office the upload."""
        store = _StoreSpy()
        resp = _upload(client, auth_headers, store, title='x' * 900)
        assert resp.status_code == 201
        assert len(store.inserted[0]['title']) == docs._MAX_TITLE_LEN


@pytest.mark.unit
class TestFilingOneUploadAgainstSeveralPeople:

    def test_each_person_gets_their_own_row(self, client, auth_headers, mock_verify_token):
        store = _StoreSpy()
        resp = _upload(client, auth_headers, store,
                       owner_user_id=['staff-1', 'staff-2'], student_user_id='stu-1')
        assert resp.status_code == 201
        assert len(store.inserted) == 3
        assert [r['owner_user_id'] for r in store.inserted] == ['staff-1', 'staff-2', None]
        assert [r['student_user_id'] for r in store.inserted] == [None, None, 'stu-1']

    def test_each_row_gets_its_own_blob(self, client, auth_headers, mock_verify_token):
        """The deletion trap: sharing one storage path between rows would mean
        one person's delete blanks the file for everyone else."""
        store = _StoreSpy()
        _upload(client, auth_headers, store, owner_user_id=['staff-1', 'staff-2'])
        paths = [r['storage_path'] for r in store.inserted]
        assert len(set(paths)) == 2
        assert sorted(store.uploaded_paths) == sorted(paths)

    def test_the_shared_details_are_identical_across_the_copies(
            self, client, auth_headers, mock_verify_token):
        store = _StoreSpy()
        _upload(client, auth_headers, store, title='Staff Handbook',
                category='Policy', owner_user_id=['staff-1', 'staff-2'])
        assert {r['title'] for r in store.inserted} == {'Staff Handbook'}
        assert {r['category'] for r in store.inserted} == {'Policy'}

    def test_the_same_person_twice_is_filed_once(self, client, auth_headers, mock_verify_token):
        store = _StoreSpy()
        _upload(client, auth_headers, store, owner_user_id=['staff-1', 'staff-1'])
        assert len(store.inserted) == 1

    def test_one_person_still_works_exactly_as_before(
            self, client, auth_headers, mock_verify_token):
        """The single-value form predates multi-attach and must not have moved."""
        store = _StoreSpy()
        resp = _upload(client, auth_headers, store, owner_user_id='staff-1')
        assert len(store.inserted) == 1
        assert store.inserted[0]['owner_user_id'] == 'staff-1'
        assert resp.get_json()['document']['owner_user_id'] == 'staff-1'

    def test_attaching_to_nobody_is_still_allowed(self, client, auth_headers, mock_verify_token):
        store = _StoreSpy()
        resp = _upload(client, auth_headers, store)
        assert resp.status_code == 201
        assert len(store.inserted) == 1
        assert store.inserted[0]['owner_user_id'] is None

    def test_a_runaway_selection_is_refused_before_anything_is_uploaded(
            self, client, auth_headers, mock_verify_token):
        store = _StoreSpy()
        resp = _upload(client, auth_headers, store,
                       owner_user_id=[f'staff-{i}' for i in range(docs._MAX_ATTACH_PEOPLE + 1)])
        assert resp.status_code == 400
        assert store.uploaded_paths == []

    def test_a_failed_insert_leaves_no_orphan_blobs(self, client, auth_headers, mock_verify_token):
        store = _StoreSpy()

        def _explode(_name):
            t = Mock()
            t.insert.side_effect = RuntimeError('db down')
            return t

        with patch.object(_StoreSpy, 'table', _explode):
            resp = _upload(client, auth_headers, store, owner_user_id=['a', 'b', 'c'])
        assert resp.status_code == 500
        assert sorted(store.removed_paths) == sorted(store.uploaded_paths)
        assert len(store.removed_paths) == 3


@pytest.mark.unit
class TestRenamingLater:

    DOC = {'id': 'd1', 'organization_id': 'org-1', 'filename': 'IMG_4021.pdf',
           'title': 'IMG_4021.pdf', 'owner_user_id': 'staff-1'}

    def _patch(self, client, auth_headers, store, body):
        with _hr_admin(store):
            return client.patch('/api/sis/secure-documents/d1', headers=auth_headers,
                                json={'organization_id': 'org-1', **body})

    def test_the_office_can_rename_a_document(self, client, auth_headers, mock_verify_token):
        store = _StoreSpy(existing_doc=self.DOC)
        resp = self._patch(client, auth_headers, store, {'title': 'Smith - Contract 2026'})
        assert resp.status_code == 200
        assert store.updated == {'title': 'Smith - Contract 2026'}

    def test_clearing_the_name_falls_back_to_the_filename(
            self, client, auth_headers, mock_verify_token):
        """A blank title would leave an unnameable row in the list."""
        store = _StoreSpy(existing_doc=self.DOC)
        self._patch(client, auth_headers, store, {'title': '  '})
        assert store.updated == {'title': 'IMG_4021.pdf'}

    def test_renaming_never_touches_the_stored_blob(
            self, client, auth_headers, mock_verify_token):
        """The storage path is a uuid and never contained the name, so a rename
        is metadata only — no object move, no re-signing of open URLs."""
        store = _StoreSpy(existing_doc=self.DOC)
        self._patch(client, auth_headers, store, {'title': 'Renamed'})
        assert store.uploaded_paths == []
        assert store.removed_paths == []
        assert 'storage_path' not in store.updated
