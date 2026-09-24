"""
CRM person notes: notes about any Optio user, not only leads.

A person's file returns their own notes plus the notes on any CRM lead that is
the same person (linked by user_id, or by email before the lead was ever
linked). Notes are superadmin-only, and they go with the person when the
account is erased.
"""
from unittest.mock import patch

import pytest

from tests.crm_fakes import make_world

ADMIN = 'admin-1'
PERSON = 'user-1'


def _world():
    world = make_world()
    world.data['users'] = [
        {'id': PERSON, 'email': 'pat@example.com', 'first_name': 'Pat',
         'last_name': 'Lee', 'role': 'parent', 'organization_id': None},
        {'id': 'user-2', 'email': 'sam@example.com', 'first_name': 'Sam',
         'last_name': 'Ng', 'role': 'student', 'organization_id': None},
    ]
    world.data['crm_person_notes'] = []
    return world


def _call(app, view, *args, json=None, method='GET'):
    from routes.admin import crm
    with app.test_request_context(json=json, method=method):
        resp = getattr(crm, view).__wrapped__(ADMIN, *args)
    if isinstance(resp, tuple):
        return resp[0].get_json(), resp[1]
    return resp.get_json(), 200


@pytest.fixture
def world():
    w = _world()
    with patch('routes.admin.crm._db', return_value=w), \
         patch('routes.admin.crm._audit'):
        yield w


@pytest.mark.unit
class TestPersonNotes:
    def test_add_note_to_a_user_who_is_not_a_lead(self, app, world):
        body, status = _call(app, 'add_person_note', PERSON, method='POST',
                             json={'body': '  Met about fall enrollment.  ',
                                   'met_on': '2026-09-20'})
        assert status == 201
        assert body['note']['body'] == 'Met about fall enrollment.'
        assert body['note']['met_on'] == '2026-09-20'
        assert body['note']['author_id'] == ADMIN

        person, status = _call(app, 'get_person', PERSON)
        assert status == 200
        assert [n['body'] for n in person['notes']] == ['Met about fall enrollment.']
        assert person['leads'] == []

    def test_notes_stay_with_their_person(self, app, world):
        _call(app, 'add_person_note', PERSON, method='POST', json={'body': 'Pat'})
        _call(app, 'add_person_note', 'user-2', method='POST', json={'body': 'Sam'})
        person, _ = _call(app, 'get_person', PERSON)
        assert [n['body'] for n in person['notes']] == ['Pat']

    def test_empty_body_is_refused(self, app, world):
        _, status = _call(app, 'add_person_note', PERSON, method='POST',
                          json={'body': '   '})
        assert status == 400
        assert world.data['crm_person_notes'] == []

    def test_bad_meeting_date_is_refused(self, app, world):
        _, status = _call(app, 'add_person_note', PERSON, method='POST',
                          json={'body': 'x', 'met_on': '9/20/2026'})
        assert status == 400

    def test_unknown_user_404s(self, app, world):
        _, status = _call(app, 'add_person_note', 'nobody', method='POST',
                          json={'body': 'x'})
        assert status == 404
        _, status = _call(app, 'get_person', 'nobody')
        assert status == 404

    def test_edit_and_delete(self, app, world):
        note, _ = _call(app, 'add_person_note', PERSON, method='POST',
                        json={'body': 'first draft'})
        note_id = note['note']['id']
        body, status = _call(app, 'update_person_note', note_id, method='PUT',
                             json={'body': 'final', 'met_on': ''})
        assert status == 200
        assert body['note']['body'] == 'final'
        assert body['note']['met_on'] is None

        _, status = _call(app, 'delete_person_note', note_id, method='DELETE')
        assert status == 200
        assert world.data['crm_person_notes'] == []
        _, status = _call(app, 'delete_person_note', note_id, method='DELETE')
        assert status == 404

    def test_file_includes_notes_from_the_same_person_as_a_lead(self, app, world):
        # One lead linked by user_id, one only by email (never linked).
        world.data['crm_leads'] += [
            {'id': 'lead-a', 'email': 'other@example.com', 'user_id': PERSON,
             'status': 'converted', 'lead_source': 'demo', 'created_at': '2026-08-01'},
            {'id': 'lead-b', 'email': 'pat@example.com', 'user_id': None,
             'status': 'active', 'lead_source': 'families', 'created_at': '2026-08-02'},
            {'id': 'lead-c', 'email': 'stranger@example.com', 'user_id': None,
             'status': 'active', 'lead_source': 'demo', 'created_at': '2026-08-03'},
        ]
        world.data['crm_events'] += [
            {'id': 'ev-1', 'lead_id': 'lead-a', 'event_type': 'note',
             'detail': {'body': 'demo call'}, 'created_at': '2026-08-01T10:00:00Z'},
            {'id': 'ev-2', 'lead_id': 'lead-b', 'event_type': 'moved',
             'detail': {}, 'created_at': '2026-08-02T10:00:00Z'},
            {'id': 'ev-3', 'lead_id': 'lead-c', 'event_type': 'note',
             'detail': {'body': 'not Pat'}, 'created_at': '2026-08-03T10:00:00Z'},
        ]
        person, _ = _call(app, 'get_person', PERSON)
        leads = {lead['id']: lead for lead in person['leads']}
        assert set(leads) == {'lead-a', 'lead-b'}
        assert [n['detail']['body'] for n in leads['lead-a']['notes']] == ['demo call']
        assert leads['lead-b']['notes'] == []


@pytest.mark.unit
class TestAddPerson:
    def test_new_person_becomes_a_manual_lead_in_no_funnel(self, app, world):
        body, status = _call(app, 'create_person', method='POST', json={
            'email': ' New@Example.com ', 'first_name': 'Nia', 'last_name': 'Moss',
            'phone': '555-0100', 'note': 'Met at the co-op fair.',
            'met_on': '2026-09-22'})
        assert status == 201
        assert body['kind'] == 'lead' and body['existing'] is False
        lead = next(l for l in world.data['crm_leads'] if l['id'] == body['id'])
        assert lead['email'] == 'new@example.com'
        assert lead['lead_source'] == 'manual'
        assert (lead['first_name'], lead['phone']) == ('Nia', '555-0100')
        # Adding someone by hand must never start marketing email.
        assert world.data['crm_funnel_memberships'] == []
        notes = [e for e in world.data['crm_events'] if e['lead_id'] == body['id']]
        assert [n['detail']['body'] for n in notes] == ['Met at the co-op fair.']
        assert notes[0]['detail']['met_on'] == '2026-09-22'
        assert notes[0]['detail']['author_id'] == ADMIN

    def test_existing_user_is_opened_not_duplicated(self, app, world):
        body, status = _call(app, 'create_person', method='POST', json={
            'email': 'PAT@example.com', 'note': 'Second meeting.'})
        assert status == 200
        assert body == {'kind': 'user', 'id': PERSON, 'existing': True}
        assert world.data['crm_leads'] == []
        assert [n['body'] for n in world.data['crm_person_notes']] == ['Second meeting.']

    def test_underscore_is_not_a_wildcard(self):
        # Postgres ilike reads `_` as "any one character", so it returns
        # pxt@example.com for p_t@example.com. That row is somebody else.
        from unittest.mock import MagicMock
        from repositories.crm_person_notes_repository import CrmPersonNotesRepository
        client = MagicMock()
        (client.table.return_value.select.return_value.ilike.return_value
         .limit.return_value.execute.return_value.data) = [
            {'id': 'someone-else', 'email': 'pxt@example.com'}]
        repo = CrmPersonNotesRepository(client=client)
        assert repo.user_id_for_email('p_t@example.com') is None
        assert repo.user_id_for_email('PXT@example.com') == 'someone-else'

    def test_existing_lead_is_reused(self, app, world):
        world.data['crm_leads'].append({
            'id': 'lead-x', 'email': 'known@example.com', 'status': 'active',
            'first_name': None, 'last_name': None, 'phone': None,
            'lead_source': 'demo', 'lead_type': 'demo'})
        body, status = _call(app, 'create_person', method='POST', json={
            'email': 'known@example.com', 'first_name': 'Kim'})
        assert status == 200
        assert body == {'kind': 'lead', 'id': 'lead-x', 'existing': True}
        assert len(world.data['crm_leads']) == 1
        assert world.data['crm_leads'][0]['lead_source'] == 'demo'
        assert world.data['crm_leads'][0]['first_name'] == 'Kim'

    def test_email_is_required(self, app, world):
        _, status = _call(app, 'create_person', method='POST',
                          json={'first_name': 'No Email'})
        assert status == 400
        assert world.data['crm_leads'] == []

    def test_lead_note_keeps_its_meeting_date(self, app, world):
        world.data['crm_leads'].append({'id': 'lead-y', 'email': 'y@example.com'})
        body, status = _call(app, 'add_lead_note', 'lead-y', method='POST',
                             json={'body': 'Call', 'met_on': '2026-09-01'})
        assert status == 201
        assert body['note']['detail']['met_on'] == '2026-09-01'


@pytest.mark.unit
class TestGatesAndErasure:
    def test_people_routes_closed_to_anonymous(self, client):
        assert client.get('/api/admin/crm/person-notes').status_code == 401
        assert client.post('/api/admin/crm/people',
                           json={'email': 'x@example.com'}).status_code == 401
        assert client.get(f'/api/admin/crm/people/{PERSON}').status_code == 401
        assert client.post(f'/api/admin/crm/people/{PERSON}/notes',
                           json={'body': 'x'}).status_code == 401
        assert client.put('/api/admin/crm/person-notes/n1',
                          json={'body': 'x'}).status_code == 401
        assert client.delete('/api/admin/crm/person-notes/n1').status_code == 401

    def test_every_people_route_is_superadmin_only(self):
        import inspect
        from routes.admin import crm
        for name in ('create_person', 'recent_person_notes', 'get_person', 'add_person_note',
                     'update_person_note', 'delete_person_note'):
            src = inspect.getsource(getattr(crm, name))
            assert '@require_superadmin' in src, name

    def test_notes_are_erased_with_the_person(self):
        from repositories.user_erasure_repository import OWNED_ROWS
        assert ('crm_person_notes', 'user_id') in OWNED_ROWS
