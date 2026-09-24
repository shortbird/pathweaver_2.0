"""
Meeting notes from a Google Doc on a CRM person's file.

The link is always kept; the doc's text is copied onto the note so the file
still reads after the doc moves. When the backend cannot read the doc the note
saves anyway and the response says who to share it with.
"""
from unittest.mock import MagicMock, patch

import pytest

from services import google_docs_service as gdocs
from services.google_docs_service import DocFetch
from tests.test_crm_person_notes import PERSON, _call, _world

DOC_URL = 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit'
DOC_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'


@pytest.fixture
def world():
    w = _world()
    with patch('routes.admin.crm._db', return_value=w), \
         patch('routes.admin.crm._audit'):
        yield w


def _read_ok(url):
    return DocFetch(title='Pat Lee intro call', text='Talked about fall enrollment.')


def _read_denied(url):
    return DocFetch(error='Optio cannot open this doc. Share it with reader@x.iam, then Refresh.')


@pytest.mark.unit
class TestNoteWithDoc:
    def test_doc_text_and_title_are_copied_onto_the_note(self, app, world):
        with patch.object(gdocs, 'fetch_doc', _read_ok):
            body, status = _call(app, 'add_person_note', PERSON, method='POST',
                                 json={'body': '', 'doc_url': DOC_URL,
                                       'met_on': '2026-09-23'})
        assert status == 201
        note = body['note']
        assert note['body'] == 'Pat Lee intro call'
        assert note['doc_url'] == DOC_URL
        assert note['doc_text'] == 'Talked about fall enrollment.'
        assert note['doc_fetched_at']
        assert body['doc_warning'] is None

    def test_typed_body_wins_over_the_doc_title(self, app, world):
        with patch.object(gdocs, 'fetch_doc', _read_ok):
            body, _ = _call(app, 'add_person_note', PERSON, method='POST',
                            json={'body': 'Wants two kids in Tue/Thu.', 'doc_url': DOC_URL})
        assert body['note']['body'] == 'Wants two kids in Tue/Thu.'

    def test_unreadable_doc_still_saves_the_link(self, app, world):
        with patch.object(gdocs, 'fetch_doc', _read_denied):
            body, status = _call(app, 'add_person_note', PERSON, method='POST',
                                 json={'doc_url': DOC_URL})
        assert status == 201
        assert body['note']['doc_url'] == DOC_URL
        assert body['note']['doc_text'] is None
        assert body['note']['body'] == 'Meeting notes'
        assert 'reader@x.iam' in body['doc_warning']

    def test_non_google_link_is_refused_without_fetching(self, app, world):
        fetch = MagicMock()
        with patch.object(gdocs, 'fetch_doc', fetch):
            _, status = _call(app, 'add_person_note', PERSON, method='POST',
                              json={'doc_url': 'http://169.254.169.254/latest/meta-data'})
        assert status == 400
        fetch.assert_not_called()
        assert world.data['crm_person_notes'] == []

    def test_refresh_replaces_the_copy_and_a_failed_refresh_keeps_it(self, app, world):
        with patch.object(gdocs, 'fetch_doc', _read_ok):
            note, _ = _call(app, 'add_person_note', PERSON, method='POST',
                            json={'doc_url': DOC_URL})
        note_id = note['note']['id']

        with patch.object(gdocs, 'fetch_doc',
                          lambda url: DocFetch(title='Pat Lee intro call', text='Updated.')):
            body, status = _call(app, 'refresh_person_note_doc', note_id, method='POST')
        assert status == 200 and body['note']['doc_text'] == 'Updated.'

        with patch.object(gdocs, 'fetch_doc', _read_denied):
            body, _ = _call(app, 'refresh_person_note_doc', note_id, method='POST')
        assert body['doc_warning']
        assert world.data['crm_person_notes'][0]['doc_text'] == 'Updated.'

    def test_edit_keeps_the_doc_unless_the_link_changes(self, app, world):
        with patch.object(gdocs, 'fetch_doc', _read_ok):
            note, _ = _call(app, 'add_person_note', PERSON, method='POST',
                            json={'doc_url': DOC_URL})
        note_id = note['note']['id']
        fetch = MagicMock()
        with patch.object(gdocs, 'fetch_doc', fetch):
            body, status = _call(app, 'update_person_note', note_id, method='PUT',
                                 json={'body': 'Renamed', 'doc_url': DOC_URL})
        assert status == 200
        fetch.assert_not_called()
        assert body['note']['doc_text'] == 'Talked about fall enrollment.'

        body, _ = _call(app, 'update_person_note', note_id, method='PUT',
                        json={'body': 'Renamed', 'doc_url': ''})
        assert body['note']['doc_url'] is None and body['note']['doc_text'] is None

    def test_lead_note_carries_the_doc_in_its_detail(self, app, world):
        world.data['crm_leads'].append({'id': 'lead-y', 'email': 'y@example.com'})
        with patch.object(gdocs, 'fetch_doc', _read_ok):
            body, status = _call(app, 'add_lead_note', 'lead-y', method='POST',
                                 json={'doc_url': DOC_URL})
        assert status == 201
        detail = body['note']['detail']
        assert detail['doc_url'] == DOC_URL
        assert detail['doc_text'] == 'Talked about fall enrollment.'
        assert detail['body'] == 'Pat Lee intro call'

    def test_new_routes_are_superadmin_only(self, client):
        import inspect
        from routes.admin import crm
        for name in ('refresh_person_note_doc', 'google_docs_reader',
                     'refresh_lead_note_doc', 'delete_lead_note'):
            assert '@require_superadmin' in inspect.getsource(getattr(crm, name)), name
        assert client.post('/api/admin/crm/person-notes/n1/doc/refresh', json={}).status_code == 401
        assert client.get('/api/admin/crm/google-docs').status_code == 401
        assert client.post('/api/admin/crm/leads/l1/notes/n1/doc/refresh', json={}).status_code == 401
        assert client.delete('/api/admin/crm/leads/l1/notes/n1').status_code == 401


def _lead_with_notes(world):
    world.data['crm_leads'].append({'id': 'lead-y', 'email': 'y@example.com'})
    world.data['crm_events'] += [
        {'id': 'ev-note', 'lead_id': 'lead-y', 'event_type': 'note',
         'detail': {'body': 'Intro', 'doc_url': DOC_URL, 'doc_text': 'old'},
         'created_at': '2026-09-24T10:00:00Z'},
        {'id': 'ev-moved', 'lead_id': 'lead-y', 'event_type': 'moved',
         'detail': {}, 'created_at': '2026-09-24T09:00:00Z'},
    ]


@pytest.mark.unit
class TestLeadNoteActions:
    def test_delete_removes_only_that_note(self, app, world):
        _lead_with_notes(world)
        _, status = _call(app, 'delete_lead_note', 'lead-y', 'ev-note', method='DELETE')
        assert status == 200
        assert [e['id'] for e in world.data['crm_events']] == ['ev-moved']

    def test_delete_refuses_other_events_and_other_leads(self, app, world):
        _lead_with_notes(world)
        _, status = _call(app, 'delete_lead_note', 'lead-y', 'ev-moved', method='DELETE')
        assert status == 404
        _, status = _call(app, 'delete_lead_note', 'someone-else', 'ev-note', method='DELETE')
        assert status == 404
        assert len(world.data['crm_events']) == 2

    def test_refresh_rereads_the_doc_and_keeps_the_body(self, app, world):
        _lead_with_notes(world)
        with patch.object(gdocs, 'fetch_doc', _read_ok):
            body, status = _call(app, 'refresh_lead_note_doc', 'lead-y', 'ev-note', method='POST')
        assert status == 200
        detail = body['note']['detail']
        assert detail['body'] == 'Intro'
        assert detail['doc_text'] == 'Talked about fall enrollment.'
        assert detail['doc_title'] == 'Pat Lee intro call'

    def test_failed_refresh_keeps_the_last_copy(self, app, world):
        _lead_with_notes(world)
        with patch.object(gdocs, 'fetch_doc', _read_denied):
            body, _ = _call(app, 'refresh_lead_note_doc', 'lead-y', 'ev-note', method='POST')
        assert body['doc_warning']
        assert world.data['crm_events'][0]['detail']['doc_text'] == 'old'

    def test_timeline_items_carry_the_event_id(self, app, world):
        _lead_with_notes(world)
        body, _ = _call(app, 'get_lead', 'lead-y')
        notes = [t for t in body['timeline'] if t['type'] == 'note']
        assert notes[0]['id'] == 'ev-note'


def _resp(status, text='', content_type='text/plain; charset=utf-8', payload=None):
    resp = MagicMock(status_code=status, text=text, headers={'Content-Type': content_type})
    resp.json.return_value = payload or {}
    return resp


@pytest.mark.unit
class TestGoogleDocsReader:
    @pytest.mark.parametrize('url,doc_id', [
        (DOC_URL, DOC_ID),
        (f'https://docs.google.com/document/u/1/d/{DOC_ID}/edit?usp=sharing', DOC_ID),
        (f'https://docs.google.com/document/d/{DOC_ID}', DOC_ID),
        (f'https://docs.google.com.evil.example/document/d/{DOC_ID}', None),
        (f'https://docs.google.com/spreadsheets/d/{DOC_ID}', None),
        ('not a url', None),
    ])
    def test_doc_id_from_url(self, url, doc_id):
        assert gdocs.doc_id_from_url(url) == doc_id

    def test_service_account_path_reads_title_and_text(self):
        get = MagicMock(side_effect=[
            _resp(200, payload={'name': 'Intro call'}),
            _resp(200, text='\ufeffLine one\r\nLine two\r\n'),
        ])
        with patch.object(gdocs, '_access_token', return_value='tok'), \
             patch.object(gdocs.requests, 'get', get):
            result = gdocs.fetch_doc(DOC_URL)
        assert (result.title, result.text, result.error) == ('Intro call', 'Line one\nLine two', None)
        assert all(call.args[0].startswith('https://www.googleapis.com/drive/v3/files/')
                   for call in get.call_args_list)

    def test_private_doc_without_access_names_who_to_share_with(self):
        # Not shared with the service account (Drive answers 404), and the
        # public export redirects to a sign-in page.
        get = MagicMock(side_effect=[_resp(404), _resp(302, content_type='text/html')])
        with patch.object(gdocs, '_access_token', return_value='tok'), \
             patch.object(gdocs, 'reader_email', return_value='reader@x.iam'), \
             patch.object(gdocs.requests, 'get', get):
            result = gdocs.fetch_doc(DOC_URL)
        assert result.text is None
        assert 'reader@x.iam' in result.error
        assert get.call_args_list[-1].kwargs['allow_redirects'] is False

    def test_drive_api_off_is_named_not_blamed_on_sharing(self):
        get = MagicMock(return_value=_resp(
            403, text='{"error": {"status": "PERMISSION_DENIED", "details": [{"reason": "SERVICE_DISABLED"}]}}'))
        with patch.object(gdocs, '_access_token', return_value='tok'), \
             patch.object(gdocs, '_key_info', return_value={'project_id': 'optio-crm-2026'}), \
             patch.object(gdocs.requests, 'get', get):
            result = gdocs.fetch_doc(DOC_URL)
        assert 'Drive API is turned off in the optio-crm-2026' in result.error
        assert 'Share' not in result.error

    def test_public_doc_reads_without_a_service_account(self):
        get = MagicMock(return_value=_resp(200, text='Public notes'))
        with patch.object(gdocs, '_access_token', return_value=None), \
             patch.object(gdocs.requests, 'get', get):
            result = gdocs.fetch_doc(DOC_URL)
        assert result.text == 'Public notes' and result.error is None
