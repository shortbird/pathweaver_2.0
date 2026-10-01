"""
Google Meet notes forwarded by email land on the CRM file of the people in the
meeting (services/meet_notes_import_service.py).

The rules worth holding: the import address is gated by its token and by
DKIM; staff and superadmins never get a note; a parent's call lands on the
child it names, not on the siblings; the name fallback only runs when the
calendar found nobody and only keeps a unique match; and a re-delivered email
does not attach twice.
"""
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest

from services import meet_notes_import_service as svc

DOC = 'https://docs.google.com/document/d/19a8dw4PGUfS1ylOF1Og5QaGgzgg7HNWBDdhMfLSCNsc'

TEXT = """Notes from “Tanner <> Pat”

These notes have been sent to invited guests in your organization.

Open meeting notes

The content was auto-generated on September 30, 2026, 12:26 PM MDT and may
contain errors.

Quick Notes

Reading progress

Pat finished chapter 8.

Suggested next steps

[Pat Lee] Read book: Read the next book.

Meeting records Document Notes by Gemini

Is the content of this email helpful?
"""

HTML = (f'<a href="{DOC}/edit?usp=meet_tnfm_email&amp;tab=t.7qqgdlnf3kls">Open meeting notes</a>'
        '<div>Notes from “Tanner &lt;&gt; Pat”</div>')

PAT = {'id': 'pat', 'email': 'pat@example.com', 'first_name': 'Pat', 'last_name': 'Lee',
       'role': 'student', 'org_role': None}
SAM = {'id': 'sam', 'email': 'sam@example.com', 'first_name': 'Sam', 'last_name': 'Lee',
       'role': 'student', 'org_role': None}
MOM = {'id': 'mom', 'email': 'mom@example.com', 'first_name': 'Jo', 'last_name': 'Lee',
       'role': 'parent', 'org_role': None}
STAFF = {'id': 'staff', 'email': 'tanner@optioeducation.com', 'first_name': 'Tanner',
         'last_name': 'Bowman', 'role': 'student', 'org_role': None}
OWNER = {'id': 'owner', 'email': 'owner@example.com', 'first_name': 'Tanner',
         'last_name': 'Bowman', 'role': 'superadmin', 'org_role': None}


class FakeRepo:
    def __init__(self, users, leads=None):
        self.users = users
        self.leads = leads or []
        self.notes = []
        self.lead_notes = []

    def users_by_emails(self, emails):
        return [u for u in self.users if u['email'] in emails]

    def users_by_full_name(self, first, last):
        return [u for u in self.users
                if u['first_name'].lower() == first.lower() and u['last_name'].lower() == last.lower()]

    def users_by_ids(self, ids):
        return [u for u in self.users if u['id'] in ids]

    def lead_for_email(self, email):
        return next((lead for lead in self.leads if lead['email'] == email), None)

    def user_id_for_email(self, email):
        return next((u['id'] for u in self.users if u['email'] == email), None)

    def has_doc_note(self, user_id, doc_url):
        return any(n['user_id'] == user_id and n['doc']['doc_url'] == doc_url for n in self.notes)

    def has_lead_doc_note(self, lead_id, doc_url):
        return any(n['lead_id'] == lead_id for n in self.lead_notes)

    def add_note(self, user_id, author_id, body, met_on=None, doc=None):
        self.notes.append({'user_id': user_id, 'author_id': author_id, 'body': body,
                           'met_on': met_on, 'doc': doc})

    def add_lead_note(self, lead_id, author_id, body, met_on=None, doc=None):
        self.lead_notes.append({'lead_id': lead_id, 'body': body})


@pytest.fixture
def config():
    with patch.object(svc.Config, 'INBOUND_EMAIL_WEBHOOK_SECRET', 'secret'), \
         patch.object(svc.Config, 'INBOUND_EMAIL_DOMAIN', 'reply.example.com'), \
         patch.object(svc.Config, 'SUPERADMIN_EMAIL', 'owner@example.com'), \
         patch.object(svc.Config, 'ADMIN_EMAIL', 'tanner@optioeducation.com'):
        yield


def _run(repo, guests, children=None, **overrides):
    fields = dict(to_header=svc.import_address(), envelope_to='', from_header='Gemini <gemini-notes@google.com>',
                  subject='Notes: “Tanner <> Pat” Sep 30, 2026', text=TEXT, html=HTML,
                  dkim='{@google.com : pass}')
    fields.update(overrides)
    with patch.object(svc, '_repo', return_value=repo), \
         patch.object(svc, 'guest_emails', return_value=guests), \
         patch('utils.class_membership.links_of_parent',
               side_effect=lambda pid: (children or {}).get(pid, {})):
        return svc.handle_inbound(**fields)


@pytest.mark.unit
class TestParse:
    def test_reads_title_time_doc_tab_and_summary(self):
        parsed = svc.parse_notes_email('Notes: x', TEXT, HTML)
        assert parsed['title'] == 'Tanner <> Pat'
        assert parsed['generated_at'] == datetime(2026, 9, 30, 12, 26, tzinfo=ZoneInfo('America/Denver'))
        assert parsed['doc_url'] == f'{DOC}/edit?tab=t.7qqgdlnf3kls'
        assert parsed['summary'].startswith('Quick Notes')
        assert 'Pat finished chapter 8.' in parsed['summary']
        assert 'Meeting records' not in parsed['summary']

    def test_a_hand_forwarded_copy_parses_the_same(self):
        forwarded = '---------- Forwarded message ---------\nFrom: Gemini\n\n' + TEXT
        parsed = svc.parse_notes_email('Fwd: Notes: x', forwarded, HTML)
        assert parsed['title'] == 'Tanner <> Pat'

    def test_other_mail_is_not_notes(self):
        assert svc.parse_notes_email('Hello', 'Just a note', '<p>hi</p>') is None

    def test_names_need_two_words(self):
        assert svc.names_in('Tanner Bowman (Pat Lee)', '[Sam] x\n[Jo Lee] y') == ['Pat Lee', 'Jo Lee']


@pytest.mark.unit
class TestGates:
    def test_wrong_token_is_ignored(self, config):
        repo = FakeRepo([PAT, OWNER])
        result = _run(repo, ['pat@example.com'], to_header='notes+' + 'a' * 24 + '@reply.example.com')
        assert result['status'] == 'ignored'
        assert repo.notes == []

    def test_failed_dkim_is_ignored(self, config):
        repo = FakeRepo([PAT, OWNER])
        result = _run(repo, ['pat@example.com'], dkim='{@google.com : fail}')
        assert result['status'] == 'ignored'
        assert repo.notes == []

    def test_a_stranger_cannot_send_notes(self, config):
        repo = FakeRepo([PAT, OWNER])
        result = _run(repo, ['pat@example.com'], from_header='x@evil.com', dkim='{@evil.com : pass}')
        assert result['detail'] == 'sender'
        assert repo.notes == []

    def test_the_owner_can_forward_by_hand(self, config):
        repo = FakeRepo([PAT, OWNER])
        result = _run(repo, ['pat@example.com'], from_header='owner@example.com',
                      dkim='{@example.com : pass}')
        assert result['status'] == 'attached'

    def test_the_address_is_recognised_for_routing(self, config):
        assert svc.is_import_address(None, f'Notes <{svc.import_address()}>')
        assert not svc.is_import_address('reply+abcdefghijklmnopqrstuv@reply.example.com')


@pytest.mark.unit
class TestMatching:
    def test_guest_gets_the_note_with_the_summary_and_link(self, config):
        repo = FakeRepo([PAT, OWNER])
        result = _run(repo, ['pat@example.com'])
        assert result['status'] == 'attached'
        [note] = repo.notes
        assert note['user_id'] == 'pat'
        assert note['author_id'] == 'owner'
        assert note['met_on'] == '2026-09-30'
        assert note['body'] == 'Meet notes: Tanner <> Pat (Sep 30, 2026)'
        assert note['doc']['doc_url'] == f'{DOC}/edit?tab=t.7qqgdlnf3kls'
        assert 'Pat finished chapter 8.' in note['doc']['doc_text']

    def test_staff_and_superadmins_never_get_a_note(self, config):
        repo = FakeRepo([PAT, STAFF, OWNER])
        _run(repo, ['pat@example.com', 'tanner@optioeducation.com', 'owner@example.com'])
        assert [n['user_id'] for n in repo.notes] == ['pat']

    def test_a_parent_call_lands_on_the_named_child_only(self, config):
        repo = FakeRepo([MOM, PAT, SAM, OWNER])
        _run(repo, ['mom@example.com'], children={'mom': {'pat': {}, 'sam': {}}})
        assert sorted(n['user_id'] for n in repo.notes) == ['mom', 'pat']

    def test_a_guest_with_no_account_but_a_lead_gets_a_lead_note(self, config):
        repo = FakeRepo([OWNER], leads=[{'id': 'lead-1', 'email': 'new@example.com'}])
        result = _run(repo, ['new@example.com'])
        assert result['status'] == 'attached'
        assert [n['lead_id'] for n in repo.lead_notes] == ['lead-1']

    def test_names_are_the_fallback_when_the_calendar_finds_nobody(self, config):
        repo = FakeRepo([PAT, OWNER])
        _run(repo, [])
        assert [n['user_id'] for n in repo.notes] == ['pat']

    def test_an_ambiguous_name_matches_nobody(self, config):
        twin = {**PAT, 'id': 'pat-2', 'email': 'pat2@example.com'}
        repo = FakeRepo([PAT, twin, OWNER])
        result = _run(repo, [])
        assert result['status'] == 'unmatched'
        assert repo.notes == []

    def test_a_redelivered_email_does_not_attach_twice(self, config):
        repo = FakeRepo([PAT, OWNER])
        _run(repo, ['pat@example.com'])
        _run(repo, ['pat@example.com'])
        assert len(repo.notes) == 1


@pytest.mark.unit
class TestRoute:
    def test_the_webhook_hands_the_import_address_to_the_notes_import(self, app, config):
        client = app.test_client()
        with patch('routes.inbound_email.Config.INBOUND_EMAIL_WEBHOOK_SECRET', 'secret'), \
             patch.object(svc, 'handle_inbound', return_value={'status': 'attached'}) as handled:
            resp = client.post('/api/email/inbound?key=secret', data={
                'to': svc.import_address(), 'from': 'gemini-notes@google.com',
                'subject': 'Notes', 'text': TEXT, 'html': HTML,
                'dkim': '{@google.com : pass}', 'envelope': '{}'})
        assert resp.status_code == 200
        assert resp.get_json() == {'status': 'attached'}
        handled.assert_called_once()
