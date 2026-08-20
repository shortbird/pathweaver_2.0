"""Which of somebody's documents their checklist is actually asking them to sign.

iCreate, 2026-08-19. The staff onboarding template carries "Review & Sign Your
Contract" with no document attached — the description says the contract will be
uploaded to the portal — so the item signs against a POOL: everything the office
has shared with that person. Once the school also shared each person's
background check, the pool held two documents; the item offered both, and for
the people whose check was shared and whose contract was not it offered the
background check AS the contract. Molly, reading her own checklist: "it assigned
the background check to be the contract."

So a document now carries `requires_signature` — the office ticking "they must
sign this" — and the pool prefers those. The rule under test has two halves:
flagged documents win, and when somebody has none flagged the answer depends on
whether their school uses the tick at all. A school that never touches it keeps
today's whole shared pool (nobody is to fall into "your document is not here
yet" by deploying — that was 2026-08-18); a school that uses it means what it
says when it says nothing, which is what stops the person with no contract being
offered her background check instead.
"""

from contextlib import contextmanager
from io import BytesIO
from unittest.mock import Mock, patch

import pytest

from services import sis_onboarding_service as onboarding

MINIMAL_PDF = b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'

CONTRACT = {'id': 'contract-1', 'title': 'Teacher Employee Agreement - Ana Rogers.pdf',
            'filename': 'contract.pdf', 'requires_signature': True}
BACKGROUND_CHECK = {'id': 'bci-1', 'title': 'ABR BCI.jpg', 'filename': 'bci.jpg',
                    'requires_signature': False}


def _pool_client(rows, org_uses_the_tick):
    """Admin client for the pool read.

    Two reads go through it: this person's shared documents, and (only when none
    of theirs is flagged) the one-row question "has this school ever ticked
    anything?". The second is told apart by its .eq('requires_signature', True).
    """
    client = Mock()

    def _table(_name):
        t = Mock()
        state = {'org_question': False}

        def _eq(field, value):
            if field == 'requires_signature' and value is True:
                state['org_question'] = True
            return t
        t.eq.side_effect = _eq
        for chained in ('select', 'limit', 'order', 'in_'):
            getattr(t, chained).return_value = t
        t.execute.side_effect = lambda: Mock(
            data=([{'id': 'any'}] if org_uses_the_tick else []) if state['org_question']
            else rows)
        return t

    client.table.side_effect = _table
    return client


def _pool(rows, document_id=None, org_uses_the_tick=False):
    with patch('services.sis_onboarding_service._admin',
               return_value=_pool_client(rows, org_uses_the_tick)):
        return onboarding.office_documents('org-1', 'staff-1', document_id)


@pytest.mark.unit
class TestWhatTheItemOffersToSign:

    def test_the_contract_wins_over_the_background_check(self):
        """Both are shared with her; only one is a thing anybody signs."""
        titles = [d['title'] for d in _pool([CONTRACT, BACKGROUND_CHECK])]
        assert titles == ['Teacher Employee Agreement - Ana Rogers.pdf']

    def test_a_background_check_alone_is_not_offered_as_the_contract(self):
        """The report itself. The office never had a contract for her, so the
        only document filed against her was her own background check — and the
        item asked her to sign it. Her school ticks contracts for everybody
        else, so her silence means she has nothing to sign."""
        assert _pool([BACKGROUND_CHECK], org_uses_the_tick=True) == []

    def test_a_school_that_never_ticks_keeps_its_whole_pool(self):
        """The upgrade guarantee. Nobody is to open their checklist after a
        deploy and read "your document is not here yet" — that failure is what
        2026-08-18 was, and it refuses signatures outright."""
        unflagged = [{**CONTRACT, 'requires_signature': False}, BACKGROUND_CHECK]
        assert len(_pool(unflagged, org_uses_the_tick=False)) == 2

    def test_several_flagged_documents_are_all_offered(self):
        """A contract and an addendum, both to sign, both shown."""
        addendum = {'id': 'addendum-1', 'title': 'Pay addendum', 'filename': 'a.pdf',
                    'requires_signature': True}
        assert len(_pool([CONTRACT, addendum, BACKGROUND_CHECK])) == 2

    def test_an_item_naming_its_own_document_is_unaffected(self):
        """A send-for-signature item names the exact document it was sent for;
        the flag must not second-guess that."""
        sent = {'id': 'sent-1', 'title': 'Handbook', 'filename': 'h.pdf',
                'requires_signature': False}
        assert _pool([sent], document_id='sent-1') == [
            {'id': 'sent-1', 'title': 'Handbook'}]

    def test_a_document_with_no_title_falls_back_to_its_filename(self):
        rows = [{'id': 'd1', 'title': None, 'filename': 'contract.pdf',
                 'requires_signature': True}]
        assert _pool(rows)[0]['title'] == 'contract.pdf'


# ── The office's side: saying which document that is ─────────────────────────

def _admin_client_for_role(role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(
        data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


class _Spy:
    """Admin client for the secure-document routes; records every update with
    the ids it was scoped to. Mirrors test_sis_secure_document_sharing._Spy."""

    def __init__(self, documents=None, users=None):
        self.documents = documents or []
        self.users = users or []
        self.updates = []          # [(fields, ids)]
        self.inserted = None
        bucket = Mock()
        bucket.upload.side_effect = lambda path, **kw: None
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
         patch('routes.sis.secure_documents.get_supabase_admin_client', return_value=spy), \
         patch('services.sis_secure_docs_service.get_supabase_admin_client', return_value=spy), \
         patch('services.sis_service.resolve_org_id', return_value=org), \
         patch('routes.sis.secure_documents.sis_notifications.notify') as notify:
        yield notify


def _doc(doc_id, owner='staff-1', shared=False, sign=False):
    return {'id': doc_id, 'organization_id': 'org-1', 'owner_user_id': owner,
            'filename': f'{doc_id}.pdf', 'title': f'Contract {doc_id}',
            'shared_with_owner': shared, 'requires_signature': sign}


@pytest.mark.unit
class TestTickingItOnTheWayIn:

    def _upload(self, client, auth_headers, spy, **fields):
        data = {'file': (BytesIO(MINIMAL_PDF), 'contract.pdf'), 'organization_id': 'org-1'}
        data.update(fields)
        with _hr_admin(spy) as notify:
            resp = client.post('/api/sis/secure-documents/upload', headers=auth_headers,
                               data=data, content_type='multipart/form-data')
        return resp, notify

    def test_a_contract_can_be_marked_for_signature_as_it_is_filed(
            self, client, auth_headers, mock_verify_token):
        spy = _Spy(users=[{'id': 'staff-1', 'org_role': 'advisor'}])
        resp, _ = self._upload(client, auth_headers, spy,
                               owner_user_id='staff-1', requires_signature='true')
        assert resp.status_code == 201
        assert spy.inserted[0]['requires_signature'] is True

    def test_asking_for_a_signature_hands_the_document_over(
            self, client, auth_headers, mock_verify_token):
        """You cannot sign what you cannot open, so the share is implied — and
        the owner is told, exactly as a plain share tells them."""
        spy = _Spy(users=[{'id': 'staff-1', 'org_role': 'advisor'}])
        _, notify = self._upload(client, auth_headers, spy,
                                 owner_user_id='staff-1', requires_signature='true')
        assert spy.inserted[0]['shared_with_owner'] is True
        assert notify.call_args.args[0] == 'staff-1'

    def test_a_shared_document_is_not_a_signature_request_by_default(
            self, client, auth_headers, mock_verify_token):
        """The background-check case: they may read it, nobody signs it."""
        spy = _Spy(users=[{'id': 'staff-1', 'org_role': 'advisor'}])
        self._upload(client, auth_headers, spy,
                     owner_user_id='staff-1', shared_with_owner='true')
        assert spy.inserted[0]['requires_signature'] is False

    def test_the_string_false_does_not_tick_the_box(
            self, client, auth_headers, mock_verify_token):
        """FormData sends strings; bool('false') is True."""
        spy = _Spy(users=[{'id': 'staff-1', 'org_role': 'advisor'}])
        self._upload(client, auth_headers, spy,
                     owner_user_id='staff-1', requires_signature='false')
        assert spy.inserted[0]['requires_signature'] is False


@pytest.mark.unit
class TestTickingItAfterwards:

    def test_one_row_can_be_marked_and_is_shared_with_it(
            self, client, auth_headers, mock_verify_token):
        spy = _Spy(documents=[_doc('d1')], users=[{'id': 'staff-1', 'org_role': 'advisor'}])
        with _hr_admin(spy):
            resp = client.patch('/api/sis/secure-documents/d1', headers=auth_headers,
                                json={'organization_id': 'org-1', 'requires_signature': True})
        assert resp.status_code == 200
        assert spy.updates[0][0] == {'requires_signature': True, 'shared_with_owner': True}

    def test_a_selection_is_marked_in_one_action(self, client, auth_headers, mock_verify_token):
        """The 23-contract case: the office says which file is the contract for
        everyone at once, rather than twenty-three row toggles."""
        spy = _Spy(documents=[_doc(f'd{i}', owner=f'staff-{i}', shared=True)
                              for i in range(23)])
        with _hr_admin(spy):
            resp = client.patch('/api/sis/secure-documents', headers=auth_headers,
                                json={'organization_id': 'org-1',
                                      'document_ids': [f'd{i}' for i in range(23)],
                                      'requires_signature': True})
        assert resp.status_code == 200
        assert resp.get_json()['updated'] == 23
        fields, ids = spy.updates[0]
        assert fields == {'shared_with_owner': True, 'requires_signature': True}
        assert len(ids) == 23

    def test_marking_documents_people_already_hold_says_nothing(
            self, client, auth_headers, mock_verify_token):
        """Correcting the office's own filing must not tell twenty-three
        teachers a second time that a document is ready for them."""
        spy = _Spy(documents=[_doc('d1', shared=True), _doc('d2', owner='staff-2', shared=True)],
                   users=[{'id': 'staff-1', 'org_role': 'advisor'},
                          {'id': 'staff-2', 'org_role': 'advisor'}])
        with _hr_admin(spy) as notify:
            client.patch('/api/sis/secure-documents', headers=auth_headers,
                         json={'organization_id': 'org-1', 'document_ids': ['d1', 'd2'],
                               'requires_signature': True})
        notify.assert_not_called()

    def test_marking_a_private_document_tells_its_owner(
            self, client, auth_headers, mock_verify_token):
        """It is being handed over for the first time, which IS news."""
        spy = _Spy(documents=[_doc('d1', shared=False)],
                   users=[{'id': 'staff-1', 'org_role': 'advisor'}])
        with _hr_admin(spy) as notify:
            client.patch('/api/sis/secure-documents', headers=auth_headers,
                         json={'organization_id': 'org-1', 'document_ids': ['d1'],
                               'requires_signature': True})
        assert notify.call_args.args[0] == 'staff-1'

    def test_the_ask_can_be_taken_back_without_hiding_the_document(
            self, client, auth_headers, mock_verify_token):
        """Un-ticking is not un-sharing: they keep their copy, nobody is waiting
        on their signature."""
        spy = _Spy(documents=[_doc('d1', shared=True, sign=True)])
        with _hr_admin(spy):
            client.patch('/api/sis/secure-documents', headers=auth_headers,
                         json={'organization_id': 'org-1', 'document_ids': ['d1'],
                               'requires_signature': False})
        assert spy.updates[0][0] == {'requires_signature': False}

    def test_a_document_attached_to_nobody_cannot_be_asked_for(
            self, client, auth_headers, mock_verify_token):
        spy = _Spy(documents=[_doc('d1', owner=None)])
        with _hr_admin(spy):
            resp = client.patch('/api/sis/secure-documents/d1', headers=auth_headers,
                                json={'organization_id': 'org-1', 'requires_signature': True})
        assert resp.status_code == 400
        assert spy.updates == []

    def test_a_bulk_call_that_says_nothing_is_still_refused(
            self, client, auth_headers, mock_verify_token):
        spy = _Spy(documents=[_doc('d1')])
        with _hr_admin(spy):
            resp = client.patch('/api/sis/secure-documents', headers=auth_headers,
                                json={'organization_id': 'org-1', 'document_ids': ['d1']})
        assert resp.status_code == 400
        assert spy.updates == []
