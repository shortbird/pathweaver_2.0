"""
Secure documents: letting the person a document belongs to actually see it.

iCreate, 2026-08-18. The office uploaded 19 teacher contracts, filed each one
against the right teacher, and told every teacher to sign. Not one of them
could: an uploaded document is private unless somebody says otherwise, and the
"Private / Shared with them" toggle sat one click away per row with nothing
connecting it to signing. The signature item on each teacher's checklist reads
its pool from sis_onboarding_service.office_documents, which requires
shared_with_owner -- so all 19 saw "your document is not here yet" and the
backend refused their signatures.

Two ways out, both under test here:
  * decide it on the way in (shared_with_owner on the upload), so the next
    batch is never in this state;
  * decide it for a selection afterwards (PATCH /api/sis/secure-documents), so
    the batch already sitting there is one action rather than nineteen.

And in both cases the person is told, because sharing used to be silent -- the
office ticked a box and the teacher found out by logging in and looking.
"""

from contextlib import contextmanager
from io import BytesIO
from unittest.mock import Mock, patch

import pytest

from routes.sis import secure_documents as docs

MINIMAL_PDF = b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'


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


class _Spy:
    """Admin client for the sharing routes.

    Reads are answered per table -- documents for sis_secure_documents, roles
    for users -- and every update is recorded with the ids it was scoped to, so
    a test can assert on WHICH rows were changed and not merely that something
    was.
    """

    def __init__(self, documents=None, users=None):
        self.documents = documents or []
        self.users = users or []
        self.updates = []          # [(fields, ids)]
        self.uploaded_paths = []
        self.inserted = None

        bucket = Mock()
        bucket.upload.side_effect = lambda path, **kw: self.uploaded_paths.append(path)
        bucket.remove.side_effect = lambda paths: None
        self.storage = Mock()
        self.storage.from_.return_value = bucket

    def table(self, name):
        t = Mock()
        state = {'ids': None, 'fields': None}
        rows = self.users if name == 'users' else self.documents

        def _in(col, values):
            if col == 'id':
                state['ids'] = list(values)
            return t

        def _update(fields):
            state['fields'] = fields
            return t

        def _insert(inserted):
            self.inserted = inserted
            t.execute.return_value = Mock(data=inserted)
            return t

        def _execute():
            if state['fields'] is not None:
                self.updates.append((state['fields'], state['ids']))
                return Mock(data=[])
            selected = rows
            if state['ids'] is not None:
                selected = [r for r in rows if r.get('id') in state['ids']]
            return Mock(data=selected)

        for chained in ('select', 'eq', 'limit', 'order', 'not_', 'is_'):
            getattr(t, chained).return_value = t
        t.in_.side_effect = _in
        t.update.side_effect = _update
        t.insert.side_effect = _insert
        t.execute.side_effect = _execute
        return t


@contextmanager
def _hr_admin(spy, org='org-1'):
    with patch('database.get_supabase_admin_client',
               return_value=_admin_client_for_role('org_admin')), \
         patch('routes.sis.secure_documents.get_supabase_admin_client',
               return_value=spy), \
         patch('services.sis_secure_docs_service.get_supabase_admin_client',
               return_value=spy), \
         patch('services.sis_service.resolve_org_id', return_value=org), \
         patch('routes.sis.secure_documents.sis_notifications.notify') as notify:
        yield notify


def _doc(doc_id, owner='staff-1', title=None, shared=False):
    return {'id': doc_id, 'organization_id': 'org-1', 'owner_user_id': owner,
            'filename': f'{doc_id}.pdf', 'title': title or f'Contract {doc_id}',
            'shared_with_owner': shared}


def _bulk(client, auth_headers, spy, ids, share=True):
    with _hr_admin(spy) as notify:
        resp = client.patch('/api/sis/secure-documents', headers=auth_headers,
                            json={'organization_id': 'org-1', 'document_ids': ids,
                                  'shared_with_owner': share})
    return resp, notify


@pytest.mark.unit
class TestSharingASelectionAtOnce:

    def test_the_whole_selection_is_shared_in_one_action(
            self, client, auth_headers, mock_verify_token):
        """The 19-contract case: one request, every row flipped."""
        spy = _Spy(documents=[_doc(f'd{i}', owner=f'staff-{i}') for i in range(19)])
        resp, _ = _bulk(client, auth_headers, spy, [f'd{i}' for i in range(19)])
        assert resp.status_code == 200
        assert resp.get_json()['updated'] == 19
        fields, ids = spy.updates[0]
        assert fields == {'shared_with_owner': True}
        assert len(ids) == 19

    def test_a_document_attached_to_nobody_is_skipped_not_fatal(
            self, client, auth_headers, mock_verify_token):
        """One stray unattached file in the selection must not cost the rest."""
        spy = _Spy(documents=[_doc('d1'), _doc('d2', owner=None), _doc('d3', owner='staff-3')])
        resp, _ = _bulk(client, auth_headers, spy, ['d1', 'd2', 'd3'])
        body = resp.get_json()
        assert (body['updated'], body['skipped']) == (2, 1)
        assert spy.updates[0][1] == ['d1', 'd3']

    def test_a_selection_with_nobody_attached_is_refused(
            self, client, auth_headers, mock_verify_token):
        spy = _Spy(documents=[_doc('d1', owner=None)])
        resp, _ = _bulk(client, auth_headers, spy, ['d1'])
        assert resp.status_code == 400
        assert spy.updates == []

    def test_documents_from_another_school_are_not_touched(
            self, client, auth_headers, mock_verify_token):
        """Org scoping is the filter on the read, so a foreign id finds nothing
        rather than being shared into the wrong school."""
        spy = _Spy(documents=[_doc('d1')])
        resp, _ = _bulk(client, auth_headers, spy, ['d1', 'other-org-doc'])
        assert resp.get_json()['updated'] == 1
        assert spy.updates[0][1] == ['d1']

    def test_an_empty_selection_is_refused(self, client, auth_headers, mock_verify_token):
        spy = _Spy(documents=[_doc('d1')])
        resp, _ = _bulk(client, auth_headers, spy, [])
        assert resp.status_code == 400
        assert spy.updates == []

    def test_a_runaway_selection_is_refused_before_any_write(
            self, client, auth_headers, mock_verify_token):
        spy = _Spy(documents=[_doc('d1')])
        resp, _ = _bulk(client, auth_headers, spy,
                        [f'd{i}' for i in range(docs._MAX_BULK_SHARE + 1)])
        assert resp.status_code == 400
        assert spy.updates == []

    def test_sharing_can_be_taken_back(self, client, auth_headers, mock_verify_token):
        spy = _Spy(documents=[_doc('d1', shared=True)])
        resp, _ = _bulk(client, auth_headers, spy, ['d1'], share=False)
        assert resp.status_code == 200
        assert spy.updates[0][0] == {'shared_with_owner': False}


@pytest.mark.unit
class TestTheOwnerIsTold:

    def test_each_owner_hears_about_their_own_document(
            self, client, auth_headers, mock_verify_token):
        spy = _Spy(documents=[_doc('d1', owner='staff-1', title='Contract - Karin'),
                              _doc('d2', owner='staff-2', title='Contract - Lisa')],
                   users=[{'id': 'staff-1', 'org_role': 'advisor'},
                          {'id': 'staff-2', 'org_role': 'advisor'}])
        _, notify = _bulk(client, auth_headers, spy, ['d1', 'd2'])
        told = {c.args[0]: c.args[2] for c in notify.call_args_list}
        assert set(told) == {'staff-1', 'staff-2'}
        assert 'Contract - Karin' in told['staff-1']
        assert 'Contract - Lisa' in told['staff-2']

    def test_staff_are_pointed_at_my_documents(self, client, auth_headers, mock_verify_token):
        spy = _Spy(documents=[_doc('d1', owner='staff-1')],
                   users=[{'id': 'staff-1', 'org_role': 'advisor'}])
        _, notify = _bulk(client, auth_headers, spy, ['d1'])
        assert notify.call_args.kwargs['link'] == '/my-documents'

    def test_parents_are_pointed_at_the_family_portal(
            self, client, auth_headers, mock_verify_token):
        """A parent has no SIS console, so /my-documents would be a dead end."""
        spy = _Spy(documents=[_doc('d1', owner='parent-1')],
                   users=[{'id': 'parent-1', 'org_role': 'parent'}])
        _, notify = _bulk(client, auth_headers, spy, ['d1'])
        assert notify.call_args.kwargs['link'] == '/family/portal'

    def test_taking_sharing_away_says_nothing(self, client, auth_headers, mock_verify_token):
        """"A document is ready for you" about a document just hidden from them."""
        spy = _Spy(documents=[_doc('d1', shared=True)],
                   users=[{'id': 'staff-1', 'org_role': 'advisor'}])
        _, notify = _bulk(client, auth_headers, spy, ['d1'], share=False)
        notify.assert_not_called()

    def test_renaming_a_shared_document_does_not_re_announce_it(
            self, client, auth_headers, mock_verify_token):
        """Only the transition into shared is news."""
        spy = _Spy(documents=[_doc('d1', shared=True)],
                   users=[{'id': 'staff-1', 'org_role': 'advisor'}])
        with _hr_admin(spy) as notify:
            client.patch('/api/sis/secure-documents/d1', headers=auth_headers,
                         json={'organization_id': 'org-1', 'title': 'Contract 2026'})
        notify.assert_not_called()

    def test_sharing_one_document_from_the_row_toggle_tells_them(
            self, client, auth_headers, mock_verify_token):
        spy = _Spy(documents=[_doc('d1', shared=False)],
                   users=[{'id': 'staff-1', 'org_role': 'advisor'}])
        with _hr_admin(spy) as notify:
            client.patch('/api/sis/secure-documents/d1', headers=auth_headers,
                         json={'organization_id': 'org-1', 'shared_with_owner': True})
        assert notify.call_args.args[0] == 'staff-1'


@pytest.mark.unit
class TestDecidingItOnTheWayIn:

    def _upload(self, client, auth_headers, spy, **fields):
        data = {'file': (BytesIO(MINIMAL_PDF), 'contract.pdf'), 'organization_id': 'org-1'}
        data.update(fields)
        with _hr_admin(spy) as notify:
            resp = client.post('/api/sis/secure-documents/upload', headers=auth_headers,
                               data=data, content_type='multipart/form-data')
        return resp, notify

    def test_an_upload_can_be_shared_as_it_is_filed(
            self, client, auth_headers, mock_verify_token):
        spy = _Spy(users=[{'id': 'staff-1', 'org_role': 'advisor'}])
        resp, _ = self._upload(client, auth_headers, spy,
                               owner_user_id='staff-1', shared_with_owner='true')
        assert resp.status_code == 201
        assert spy.inserted[0]['shared_with_owner'] is True

    def test_the_owner_is_told_about_a_document_shared_on_upload(
            self, client, auth_headers, mock_verify_token):
        spy = _Spy(users=[{'id': 'staff-1', 'org_role': 'advisor'}])
        _, notify = self._upload(client, auth_headers, spy,
                                 owner_user_id='staff-1', shared_with_owner='true')
        assert notify.call_args.args[0] == 'staff-1'

    def test_an_upload_is_still_private_by_default(
            self, client, auth_headers, mock_verify_token):
        """The store holds background checks. Silence means private, always."""
        spy = _Spy(users=[{'id': 'staff-1', 'org_role': 'advisor'}])
        _, notify = self._upload(client, auth_headers, spy, owner_user_id='staff-1')
        assert spy.inserted[0]['shared_with_owner'] is False
        notify.assert_not_called()
