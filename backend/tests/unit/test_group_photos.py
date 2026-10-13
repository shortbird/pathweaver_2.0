"""Group photos: one capture, tagged to several students, into each journal,
with a note to their parents.

Ticket 85949de5 (Apogee Cache Valley, 2026-10-13): "a Photos page where a
coach takes or uploads a picture, taps every student in it, saves; each tagged
student's parents get an email; the photo also goes into each tagged student's
journal; works for group photos not tied to a lesson."

Pinned here:
  - the migration that lets a staff capture be written at all
    ('advisor_captured' was never in the CHECK: 0 such rows in prod);
  - services/group_photo_service: one row per student, one shared object,
    the same-school refusal, the parent notes (one email per parent, no photo);
  - deleting one student's copy keeps the file the others still show;
  - the SIS route gates, and Treehouse's capture on the shared code;
  - the photos kind of the signed unsubscribe link.
"""

import re
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

import pytest

from services import group_photo_service as gps
from services.group_photo_service import GroupPhotoError, GroupPhotoService, evidence_block
from utils.storage_urls import public_object_url

REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATION = REPO_ROOT / 'supabase' / 'migrations' / '20261013231000_group_photos.sql'

ORG = 'org-1'
OTHER_ORG = 'org-2'
COACH = 'coach-1'
ADA, BEN, CAL = 'stu-ada', 'stu-ben', 'stu-cal'
MOM, DAD, GRAN = 'par-mom', 'par-dad', 'par-gran'

# The canonical pointer, built the way the app builds it (its host is config).
PHOTO = public_object_url('quest-evidence', 'events/coach-1/a.jpg')
SIGNED = 'https://x.supabase.co/storage/v1/object/sign/quest-evidence/events/coach-1/a.jpg?token=abc'


def _user(uid, org=ORG, role='student', first='Ada', email=None, last='Kid'):
    return {'id': uid, 'first_name': first, 'last_name': last, 'organization_id': org,
            'role': 'org_managed' if org else role, 'org_role': role if org else None,
            'org_roles': [role] if org else [], 'email': email, 'display_name': None,
            'managed_by_parent_id': None}


def _parent(uid, first, email):
    # Platform parents carry no organization_id.
    return {'id': uid, 'first_name': first, 'last_name': 'Kid', 'organization_id': None,
            'role': 'parent', 'org_role': None, 'org_roles': [], 'email': email,
            'display_name': None, 'managed_by_parent_id': None}


class FakeRepo:
    def __init__(self, users=(), muted=(), referenced=False):
        self._users = {u['id']: u for u in users}
        self.muted = set(muted)
        self.referenced = referenced
        self.events = []
        self.blocks = []

    def users(self, ids):
        return [self._users[i] for i in dict.fromkeys(ids) if i in self._users]

    def org_name(self, org_id):
        return 'Apogee Cache Valley'

    def disabled_for(self, ids, notification_type):
        assert notification_type == gps.EMAIL_PREFERENCE
        return {i for i in ids if i in self.muted}

    def task_belongs_to(self, task_id, user_id):
        return task_id == 'task-ada' and user_id == ADA

    def insert_event(self, row):
        row = {**row, 'id': f'ev-{len(self.events)}'}
        self.events.append(row)
        return row

    def insert_blocks(self, rows):
        self.blocks.extend(rows)


def _people():
    return [
        _user(ADA, first='Ada'), _user(BEN, first='Ben'), _user(CAL, first='Cal'),
        _user(COACH, role='advisor', first='David', email='david@school.org'),
        _parent(MOM, 'Mia', 'mia+kids@gmail.com'), _parent(DAD, 'Dan', 'dan@example.com'),
        _parent(GRAN, 'Gwen', 'gwen@example.com'),
    ]


@pytest.fixture
def inline(monkeypatch):
    """Run the background send inline so the test sees what it sends."""
    monkeypatch.setattr(gps, 'run_in_background', lambda fn: fn())


@pytest.fixture
def senders():
    notifier = MagicMock()
    with patch('services.notification_service.NotificationService', return_value=notifier), \
         patch('services.email_service.email_service') as mailer:
        yield notifier, mailer


# -- the migration -----------------------------------------------------------

class TestMigration:
    def test_staff_captures_are_allowed_by_the_check(self):
        """Every staff capture failed at the insert: the CHECK never allowed
        'advisor_captured', and prod held none on 2026-10-13."""
        sql = MIGRATION.read_text()
        check = sql[sql.index('learning_events_source_type_check\n  CHECK'):]
        for value in ('realtime', 'retroactive', 'parent_captured', 'task_evidence',
                      'advisor_captured'):
            assert f"'{value}'::text" in check[:400]

    def test_every_source_type_the_backend_writes_is_allowed(self):
        """The bug was a value written in code and missing from the CHECK.
        Any new literal added to an insert must join the migration too."""
        allowed = set(re.findall(r"'(\w+)'::text", MIGRATION.read_text()))
        written = set()
        for path in (REPO_ROOT / 'backend').rglob('*.py'):
            if 'tests' in path.parts or 'venv' in path.parts or 'scripts' in path.parts:
                continue
            text = path.read_text(encoding='utf-8', errors='ignore')
            # Only modules that write the journal; curriculum uploads and
            # stories have unrelated source_type fields of their own.
            if "'learning_events'" not in text:
                continue
            written |= set(re.findall(r"'source_type':\s*'(\w+)'", text))
            # helper_evidence.py: source_type = 'parent_captured' if ... else 'advisor_captured'
            for pair in re.findall(r"source_type = '(\w+)' if .* else '(\w+)'", text):
                written |= set(pair)
        assert written, 'the scan found no source_type writes; the pattern is stale'
        assert written <= allowed, f'not allowed by the CHECK: {written - allowed}'

    def test_the_new_notification_type_is_in_the_check(self):
        assert "'child_photo_added'" in MIGRATION.read_text()
        # ...and keeps every type prod allowed before.
        assert "'school_notice'" in MIGRATION.read_text()

    def test_the_new_type_pushes(self):
        from services.notification_service import (
            MOBILE_PUSH_NOTIFICATION_TYPES, WEB_PUSH_NOTIFICATION_TYPES, resolve_type_filter,
        )
        assert gps.NOTIFICATION_TYPE in MOBILE_PUSH_NOTIFICATION_TYPES
        assert gps.NOTIFICATION_TYPE in WEB_PUSH_NOTIFICATION_TYPES
        assert gps.NOTIFICATION_TYPE in resolve_type_filter('school')


# -- the capture ---------------------------------------------------------------

class TestCreateCapture:
    def test_every_tagged_student_gets_a_journal_row_pointing_at_one_object(self):
        repo = FakeRepo(_people())
        out = GroupPhotoService(repo).create_capture(
            ORG, COACH, [ADA, BEN, CAL], description='Science fair',
            media=[{'type': 'image', 'file_url': SIGNED, 'file_name': 'a.jpg', 'file_size': 10}])
        assert [c['student_id'] for c in out['created']] == [ADA, BEN, CAL]
        assert {e['user_id'] for e in repo.events} == {ADA, BEN, CAL}
        assert all(e['source_type'] == 'advisor_captured' and e['captured_by_user_id'] == COACH
                   and e['description'] == 'Science fair' for e in repo.events)
        # One object, and the signed twin the client posted is never stored.
        assert {b['file_url'] for b in repo.blocks} == {PHOTO}
        assert {b['content']['url'] for b in repo.blocks} == {PHOTO}
        assert len(repo.blocks) == 3

    def test_a_student_from_another_school_refuses_the_whole_capture(self):
        people = _people() + [_user('stu-out', org=OTHER_ORG, first='Out')]
        repo = FakeRepo(people)
        with pytest.raises(GroupPhotoError) as err:
            GroupPhotoService(repo).create_capture(ORG, COACH, [ADA, 'stu-out'], description='x')
        assert err.value.status == 403
        assert repo.events == [] and repo.blocks == []

    def test_a_parent_id_cannot_be_tagged_as_a_student(self):
        repo = FakeRepo(_people() + [_user('par-org', role='parent', first='Pat')])
        with pytest.raises(GroupPhotoError):
            GroupPhotoService(repo).create_capture(ORG, COACH, ['par-org'], description='x')
        assert repo.events == []

    def test_treehouse_mode_skips_outsiders_as_it_always_did(self):
        repo = FakeRepo(_people() + [_user('stu-out', org=OTHER_ORG)])
        out = GroupPhotoService(repo).create_capture(
            ORG, COACH, [ADA, 'stu-out'], description='', media=[{'file_url': PHOTO}],
            default_description='Captured by facilitator', refuse_outsiders=False)
        assert [c['student_id'] for c in out['created']] == [ADA]
        assert repo.events[0]['description'] == 'Captured by facilitator'

    def test_a_task_is_attached_only_to_the_student_who_owns_it(self):
        repo = FakeRepo(_people())
        GroupPhotoService(repo).create_capture(ORG, COACH, [ADA, BEN], description='x',
                                               attached_task_id='task-ada')
        assert [e.get('attached_task_id') for e in repo.events] == ['task-ada', None]

    @pytest.mark.parametrize('ids,desc,media,message', [
        ([], 'x', [], 'Tag at least one student'),
        ([ADA], '', [], 'Add a caption or a photo'),
    ])
    def test_empty_captures_are_refused(self, ids, desc, media, message):
        with pytest.raises(GroupPhotoError, match=message):
            GroupPhotoService(FakeRepo(_people())).create_capture(ORG, COACH, ids, description=desc, media=media)

    def test_links_pass_through_and_videos_keep_their_type(self):
        link = evidence_block('e', 0, {'type': 'link', 'url': 'https://example.com', 'title': 't'})
        assert link['content']['url'] == 'https://example.com'
        video = evidence_block('e', 1, {'type': 'video', 'file_url': SIGNED})
        assert video['block_type'] == 'video' and video['file_url'] == PHOTO


class TestSisCapture:
    def test_the_console_save_writes_and_counts_families(self, inline, senders):
        repo = FakeRepo(_people())
        with patch('utils.class_membership.guardians_by_student',
                   return_value={ADA: {MOM, DAD}, BEN: {MOM, DAD}, CAL: {GRAN}}):
            out = GroupPhotoService(repo).capture(ORG, COACH, {
                'student_ids': [ADA, BEN, CAL], 'caption': 'Field trip',
                'event_date': '2026-10-13',
                'media': [{'type': 'image', 'file_url': PHOTO, 'file_name': 'a.jpg'}]})
        assert out['count'] == 3
        # Ada and Ben are siblings: one family. Cal's grandmother: another.
        assert out['families_notified'] == 2
        assert out['parents_notified'] == 3
        assert {e['event_date'] for e in repo.events} == {'2026-10-13'}

    def test_media_must_be_an_uploaded_object(self):
        with pytest.raises(GroupPhotoError, match='Upload the photo first'):
            GroupPhotoService(FakeRepo(_people())).capture(ORG, COACH, {
                'student_ids': [ADA], 'media': [{'type': 'image', 'file_url': 'https://evil.example/x.jpg'}]})

    def test_documents_are_not_photos(self):
        with pytest.raises(GroupPhotoError):
            GroupPhotoService(FakeRepo(_people())).capture(ORG, COACH, {
                'student_ids': [ADA], 'media': [{'type': 'document', 'file_url': PHOTO}]})

    @pytest.mark.parametrize('value', ['not-a-date', '2999-01-01'])
    def test_a_bad_or_future_date_is_refused(self, value):
        with pytest.raises(GroupPhotoError):
            GroupPhotoService(FakeRepo(_people())).capture(ORG, COACH, {
                'student_ids': [ADA], 'caption': 'x', 'event_date': value})

    def test_no_date_means_the_column_default(self, inline, senders):
        repo = FakeRepo(_people())
        with patch('utils.class_membership.guardians_by_student', return_value={}):
            GroupPhotoService(repo).capture(ORG, COACH, {'student_ids': [ADA], 'caption': 'x'})
        assert 'event_date' not in repo.events[0]


# -- parent notes ---------------------------------------------------------------

class TestNotifyParents:
    def _run(self, repo, guardians, created=None, caption='Field trip', media=None):
        created = created or [{'student_id': ADA, 'event_id': 'ev-a'},
                              {'student_id': BEN, 'event_id': 'ev-b'}]
        media = [{'type': 'image', 'file_url': PHOTO}] if media is None else media
        with patch('utils.class_membership.guardians_by_student', return_value=guardians):
            return GroupPhotoService(repo).notify_parents(ORG, COACH, created, caption, media)

    def test_one_email_per_parent_naming_both_children_and_no_photo(self, inline, senders):
        notifier, mailer = senders
        self._run(FakeRepo(_people()), {ADA: {MOM}, BEN: {MOM}})
        assert mailer.send_child_photo_email.call_count == 1
        kw = mailer.send_child_photo_email.call_args.kwargs
        assert kw['to_email'] == 'mia+kids@gmail.com'
        assert kw['coach_name'] == 'David'
        assert kw['org_name'] == 'Apogee Cache Valley'
        assert [c['name'] for c in kw['children']] == ['Ada', 'Ben']
        assert kw['children'][0]['url'].endswith(f'/parent/child/{ADA}/journal')
        assert 'kind=photos' in kw['unsubscribe_url']
        assert 'attachments' not in kw
        # The bell: one row per child, each linking to that child's journal.
        links = sorted(c.kwargs['link'] for c in notifier.create_notification.call_args_list)
        assert links == [f'/parent/child/{ADA}/journal', f'/parent/child/{BEN}/journal']
        assert {c.kwargs['notification_type'] for c in notifier.create_notification.call_args_list} == \
            {'child_photo_added'}
        assert {c.kwargs['user_id'] for c in notifier.create_notification.call_args_list} == {MOM}

    def test_two_parents_get_one_email_each(self, inline, senders):
        _notifier, mailer = senders
        out = self._run(FakeRepo(_people()), {ADA: {MOM, DAD}})
        assert sorted(c.kwargs['to_email'] for c in mailer.send_child_photo_email.call_args_list) == \
            ['dan@example.com', 'mia+kids@gmail.com']
        assert out == {'families_notified': 1, 'parents_notified': 2}

    def test_one_inbox_gets_one_copy(self, inline, senders):
        """Plus-aliases of one Gmail inbox are one mailbox
        (announcement_email_service's rule)."""
        _notifier, mailer = senders
        people = _people() + [_parent('par-mom2', 'Mia', 'm.i.a@gmail.com')]
        people[4]['email'] = 'mia+one@gmail.com'
        self._run(FakeRepo(people), {ADA: {MOM}, BEN: {'par-mom2'}})
        assert mailer.send_child_photo_email.call_count == 1
        assert [c['name'] for c in mailer.send_child_photo_email.call_args.kwargs['children']] == ['Ada', 'Ben']

    def test_a_parent_who_stopped_photo_emails_still_gets_the_bell(self, inline, senders):
        notifier, mailer = senders
        self._run(FakeRepo(_people(), muted={MOM}), {ADA: {MOM}})
        mailer.send_child_photo_email.assert_not_called()
        assert notifier.create_notification.call_count == 1

    def test_no_email_to_a_placeholder_address(self, inline, senders):
        _notifier, mailer = senders
        people = _people()
        people[4]['email'] = 'x@optio-internal-placeholder.local'
        self._run(FakeRepo(people), {ADA: {MOM}})
        mailer.send_child_photo_email.assert_not_called()

    def test_students_are_never_sent_anything(self, inline, senders):
        """A 'guardian' row that is a student of the school (a bad link, or a
        tagged sibling) is skipped."""
        notifier, mailer = senders
        out = self._run(FakeRepo(_people()), {ADA: {BEN}, BEN: {CAL}})
        notifier.create_notification.assert_not_called()
        mailer.send_child_photo_email.assert_not_called()
        assert out == {'families_notified': 0, 'parents_notified': 0}

    def test_no_guardians_no_notes(self, inline, senders):
        notifier, mailer = senders
        assert self._run(FakeRepo(_people()), {}) == {'families_notified': 0, 'parents_notified': 0}
        notifier.create_notification.assert_not_called()

    def test_one_failed_email_does_not_stop_the_rest(self, inline, senders):
        _notifier, mailer = senders
        mailer.send_child_photo_email.side_effect = [Exception('sendgrid'), True]
        self._run(FakeRepo(_people()), {ADA: {MOM, DAD}})
        assert mailer.send_child_photo_email.call_count == 2

    def test_the_counts_come_back_before_anything_is_sent(self, senders, monkeypatch):
        queued = []
        monkeypatch.setattr(gps, 'run_in_background', queued.append)
        notifier, mailer = senders
        out = self._run(FakeRepo(_people()), {ADA: {MOM}})
        assert out['parents_notified'] == 1 and len(queued) == 1
        mailer.send_child_photo_email.assert_not_called()


class TestPhotoEmail:
    def test_the_email_names_coach_child_school_and_links_to_the_app(self):
        from services.email_service import EmailService
        svc = EmailService.__new__(EmailService)
        with patch.object(EmailService, 'send_email', return_value=True) as send:
            svc.send_child_photo_email(
                to_email='mia@example.com', parent_name='Mia', coach_name='David',
                org_name='Apogee Cache Valley', kind='photo', caption='Bridge <build>',
                children=[{'name': 'Ada', 'url': 'https://app.optioeducation.com/parent/child/a/journal'}],
                unsubscribe_url='https://api.optioeducation.com/api/parent-digest/unsubscribe?token=t&kind=photos')
        kw = send.call_args.kwargs
        assert kw['subject'] == 'David added a new photo of Ada at Apogee Cache Valley'
        assert 'attachments' not in kw or not kw['attachments']
        assert 'https://app.optioeducation.com/parent/child/a/journal' in kw['html_body']
        assert 'Bridge &lt;build&gt;' in kw['html_body']
        assert '<img' not in kw['html_body']
        assert kw['contains_student_records'] is True
        assert kw['headers']['List-Unsubscribe-Post'] == 'List-Unsubscribe=One-Click'

    def test_two_children_in_one_subject(self):
        from services.email_service import EmailService
        svc = EmailService.__new__(EmailService)
        with patch.object(EmailService, 'send_email', return_value=True) as send:
            svc.send_child_photo_email(
                to_email='m@example.com', parent_name='Mia', coach_name='David', org_name='ACV',
                kind='photo', caption='', children=[{'name': 'Ada', 'url': 'u1'}, {'name': 'Ben', 'url': 'u2'}])
        assert send.call_args.kwargs['subject'] == 'David added a new photo of Ada and Ben at ACV'
        assert send.call_args.kwargs['headers'] is None


# -- delete safety --------------------------------------------------------------

class TestDeleteKeepsSharedObjects:
    def _remove(self, referenced):
        from services.learning_events_service import LearningEventsService
        supabase = MagicMock()
        with patch('repositories.group_photo_repository.GroupPhotoRepository.object_referenced_elsewhere',
                   side_effect=referenced if callable(referenced) else (lambda urls, eid: referenced)):
            LearningEventsService.remove_unshared_files(supabase, 'ev-a', [{'file_url': PHOTO, 'content': {}}])
        return supabase.storage.from_.return_value.remove

    def test_a_photo_another_journal_shows_is_kept(self):
        self._remove(True).assert_not_called()

    def test_a_photo_nobody_else_shows_is_removed(self):
        self._remove(False).assert_called_once_with(['events/coach-1/a.jpg'])

    def test_a_failed_check_keeps_the_file(self):
        def boom(urls, eid):
            raise RuntimeError('db down')
        self._remove(boom).assert_not_called()

    def test_the_check_excludes_the_event_being_deleted_and_reads_task_evidence(self):
        from repositories.group_photo_repository import GroupPhotoRepository
        client = MagicMock()
        q = client.table.return_value.select.return_value
        q.eq.return_value.neq.return_value.limit.return_value.execute.return_value.data = []
        q.eq.return_value.limit.return_value.execute.return_value.data = [{'id': 'doc-block'}]
        assert GroupPhotoRepository(client=client).object_referenced_elsewhere([PHOTO], 'ev-a') is True
        q.eq.return_value.neq.assert_called_with('learning_event_id', 'ev-a')
        tables = [c.args[0] for c in client.table.call_args_list]
        assert tables == ['learning_event_evidence_blocks', 'evidence_document_blocks']

    def test_the_service_delete_runs_through_the_check(self):
        """delete_learning_event: the shared file stays, the row still goes."""
        from services.learning_events_service import LearningEventsService
        supabase = MagicMock()
        table = supabase.table.return_value
        table.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{'id': 'ev-a'}]
        table.select.return_value.eq.return_value.execute.return_value.data = [
            {'file_url': PHOTO, 'content': {}}]
        with patch('services.learning_events_service.get_supabase_admin_client', return_value=supabase), \
             patch('repositories.group_photo_repository.GroupPhotoRepository.object_referenced_elsewhere',
                   return_value=True):
            out = LearningEventsService.delete_learning_event('ev-a', ADA)
        assert out['success'] is True
        supabase.storage.from_.return_value.remove.assert_not_called()
        table.delete.assert_called()


# -- recent captures ------------------------------------------------------------

class TestRecent:
    def test_one_entry_per_capture_with_every_student(self):
        repo = FakeRepo(_people())
        repo.recent_staff_captures = lambda ids, limit: [
            {'id': 'e1', 'user_id': ADA, 'captured_by_user_id': COACH, 'description': 'Trip',
             'event_date': '2026-10-13', 'created_at': '2026-10-13T15:00:01Z'},
            {'id': 'e2', 'user_id': BEN, 'captured_by_user_id': COACH, 'description': 'Trip',
             'event_date': '2026-10-13', 'created_at': '2026-10-13T15:00:00Z'},
            {'id': 'e3', 'user_id': CAL, 'captured_by_user_id': COACH, 'description': 'Lunch',
             'event_date': '2026-10-12', 'created_at': '2026-10-12T15:00:00Z'},
        ]
        repo.blocks_for = lambda ids: [
            {'learning_event_id': 'e1', 'block_type': 'image', 'file_url': PHOTO},
            {'learning_event_id': 'e2', 'block_type': 'image', 'file_url': PHOTO},
        ]
        with patch('utils.storage_urls.sign_stored_urls', return_value={PHOTO: SIGNED}):
            out = GroupPhotoService(repo).recent(ORG, [ADA, BEN, CAL])
        assert len(out) == 2
        assert [s['name'] for s in out[0]['students']] == ['Ada Kid', 'Ben Kid']
        assert out[0]['media'] == [{'type': 'image', 'url': SIGNED}]
        assert out[0]['captured_by_name'] == 'David'
        assert out[1]['caption'] == 'Lunch' and out[1]['media'] == []


# -- routes ---------------------------------------------------------------------

def _role_client(row):
    users = Mock()
    users.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [row]
    return users


class TestRoutes:
    def test_one_owner_per_rule(self, app):
        m = app.url_map.bind('localhost')
        assert m.match('/api/sis/photos', method='GET')[0] == 'sis_photos.photos_home'
        assert m.match('/api/sis/photos', method='POST')[0] == 'sis_photos.photos_capture'
        assert m.match('/api/sis/photos/upload', method='POST')[0] == 'sis_photos.photos_upload'

    def _post(self, app, auth_headers_for, role_row, enabled=True):
        client = app.test_client()
        with patch('database.get_supabase_admin_client', return_value=_role_client(role_row)), \
             patch('modules.gate.check_module', return_value=None), \
             patch('services.sis_service.resolve_org_id', return_value=ORG), \
             patch('routes.sis.photos.module_enabled', return_value=enabled) as mod, \
             patch('routes.sis.photos.GroupPhotoService') as svc:
            svc.return_value.capture.return_value = {'count': 1, 'created': [],
                                                     'families_notified': 1, 'parents_notified': 1}
            resp = client.post('/api/sis/photos', json={'student_ids': [ADA], 'caption': 'x'},
                               headers=auth_headers_for(COACH))
        return resp, svc, mod

    def test_an_advisor_coach_may_save(self, app, auth_headers_for):
        resp, svc, mod = self._post(app, auth_headers_for,
                                    {'role': 'org_managed', 'org_role': 'advisor', 'org_roles': ['advisor']})
        assert resp.status_code == 201
        assert resp.get_json()['families_notified'] == 1
        svc.return_value.capture.assert_called_once()
        assert svc.return_value.capture.call_args.args[:2] == (ORG, COACH)
        mod.assert_called_with(ORG, 'group_photos')

    def test_module_off_is_a_404_and_writes_nothing(self, app, auth_headers_for):
        resp, svc, _ = self._post(app, auth_headers_for,
                                  {'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin']},
                                  enabled=False)
        assert resp.status_code == 404
        svc.return_value.capture.assert_not_called()

    @pytest.mark.parametrize('role', ['student', 'parent'])
    def test_students_and_parents_are_refused(self, app, auth_headers_for, role):
        row = ({'role': 'parent', 'org_role': None, 'org_roles': []} if role == 'parent'
               else {'role': 'org_managed', 'org_role': 'student', 'org_roles': ['student']})
        resp, svc, _ = self._post(app, auth_headers_for, row)
        assert resp.status_code == 403
        svc.return_value.capture.assert_not_called()

    def test_an_outsider_refusal_is_the_services_403(self, app, auth_headers_for):
        client = app.test_client()
        with patch('database.get_supabase_admin_client', return_value=_role_client(
                {'role': 'org_managed', 'org_role': 'advisor', 'org_roles': ['advisor']})), \
             patch('modules.gate.check_module', return_value=None), \
             patch('services.sis_service.resolve_org_id', return_value=ORG), \
             patch('routes.sis.photos.module_enabled', return_value=True), \
             patch('services.group_photo_service.GroupPhotoRepository',
                   return_value=FakeRepo(_people() + [_user('stu-out', org=OTHER_ORG)])):
            resp = client.post('/api/sis/photos', json={'student_ids': [ADA, 'stu-out'], 'caption': 'x'},
                               headers=auth_headers_for(COACH))
        assert resp.status_code == 403


class TestTreehouseCaptureStillWorks:
    def test_the_capture_tab_writes_one_row_per_student(self, app, auth_headers_for):
        repo = FakeRepo(_people() + [_user('stu-out', org=OTHER_ORG)])
        client = app.test_client()
        ctx = {'user': {'id': COACH}, 'org_id': ORG, 'is_member': True,
               'is_facilitator': True, 'is_superadmin': False}
        with patch('routes.treehouse._context', return_value=ctx), \
             patch('services.group_photo_service.GroupPhotoRepository', return_value=repo):
            resp = client.post('/api/treehouse/capture', headers=auth_headers_for(COACH), json={
                'student_ids': [ADA, BEN, 'stu-out'], 'description': None,
                'media': [{'type': 'image', 'file_url': SIGNED, 'file_name': 'a.jpg', 'file_size': 1}]})
        assert resp.status_code == 201
        body = resp.get_json()
        assert body['count'] == 2
        assert [c['student_id'] for c in body['created']] == [ADA, BEN]
        assert {e['description'] for e in repo.events} == {'Captured by facilitator'}
        assert {b['file_url'] for b in repo.blocks} == {PHOTO}

    def test_a_non_facilitator_is_refused(self, app, auth_headers_for):
        client = app.test_client()
        ctx = {'user': {'id': COACH}, 'org_id': ORG, 'is_member': True,
               'is_facilitator': False, 'is_superadmin': False}
        with patch('routes.treehouse._context', return_value=ctx), \
             patch('services.group_photo_service.GroupPhotoRepository') as repo:
            resp = client.post('/api/treehouse/capture', headers=auth_headers_for(COACH),
                               json={'student_ids': [ADA], 'description': 'x'})
        assert resp.status_code == 403
        repo.assert_not_called()


# -- unsubscribe ----------------------------------------------------------------

class TestPhotoUnsubscribe:
    USER = '11111111-1111-4111-8111-111111111111'

    def test_a_photos_token_cannot_stop_the_digest_or_the_other_way(self):
        from services import parent_digest_links as links
        photos = links.make_token(self.USER, 'photos')
        assert links.user_id_from_token(photos, 'photos') == self.USER
        assert links.user_id_from_token(photos, 'digest') is None
        assert links.user_id_from_token(links.make_token(self.USER), 'photos') is None
        assert links.unsubscribe_url(self.USER, 'photos').endswith('&kind=photos')
        # The digest's links are unchanged.
        assert 'kind=' not in links.unsubscribe_url(self.USER)

    def test_one_click_turns_off_photo_emails_only(self, app):
        from services import parent_digest_links as links
        repo = MagicMock()
        with patch('routes.parent_digest._repo', return_value=repo):
            resp = app.test_client().post(
                f'/api/parent-digest/unsubscribe?token={links.make_token(self.USER, "photos")}&kind=photos',
                data={'List-Unsubscribe': 'One-Click'})
        assert resp.status_code == 200
        repo.set_preference.assert_called_once_with(self.USER, 'child_photo_email', False)

    def test_the_digest_unsubscribe_still_writes_the_digest_type(self, app):
        from services import parent_digest_links as links
        repo = MagicMock()
        with patch('routes.parent_digest._repo', return_value=repo):
            resp = app.test_client().post(
                f'/api/parent-digest/unsubscribe?token={links.make_token(self.USER)}',
                data={'List-Unsubscribe': 'One-Click'})
        assert resp.status_code == 200
        repo.set_preference.assert_called_once_with(self.USER, 'parent_weekly_digest', False)
