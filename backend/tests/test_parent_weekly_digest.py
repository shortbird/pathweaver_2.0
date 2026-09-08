"""The weekly parent digest.

Dallin Bird (Gryffin), 2026-09-07: "I don't think the parents are regularly
logging in to check how their kid is doing."

These tests pin the four things that decide whether a school dares leave this
switched on:

  - it is OFF unless a school turned it on, and it fires in the school's own
    hour, not the server's;
  - "late" means what the teacher's screen means, so an email never contradicts
    the grid a family was just shown;
  - private work stays private — a confidential completion is not forwarded to a
    mailbox, and no evidence URL is ever printed in the message;
  - one send per parent per week, because the cron ticks six times inside the
    send hour.
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

import app  # noqa: F401 — import graph ordering
from repositories.parent_digest_repository import ParentDigestRepository
from services import parent_digest_links
from services import parent_weekly_digest_service as digest


# ── A supabase stand-in that answers by table name ───────────────────────────

class _Query:
    """Every filter returns self; execute returns the canned rows.

    Filters are ignored on purpose. These tests feed one small, consistent
    fixture and assert on the RULES the service applies to it, not on PostgREST.
    """

    def __init__(self, rows):
        self._rows = rows

    def __getattr__(self, name):
        if name == 'not_':
            return self
        def chained(*args, **kwargs):
            return self
        return chained

    def execute(self):
        return SimpleNamespace(data=list(self._rows))


class FakeDB:
    def __init__(self, tables):
        self.tables = tables

    def table(self, name):
        return _Query(self.tables.get(name, []))


def fake_repo(tables):
    """The real repository over canned rows: the SQL shape is not what these
    tests are about, but the repository's own mapping IS on the path."""
    return ParentDigestRepository(client=FakeDB(tables))


# ── Settings and the send window ─────────────────────────────────────────────

class TestSettings:
    def test_absent_means_off(self):
        assert digest.digest_settings({'feature_flags': {}})['enabled'] is False

    def test_off_is_the_default_for_a_school_that_never_touched_it(self):
        org = {'feature_flags': {'sis_settings': {'add_drop_deadline': '2026-09-08'}}}
        assert digest.digest_settings(org)['enabled'] is False

    def test_a_hand_written_boolean_still_reads_as_enabled(self):
        org = {'feature_flags': {'sis_settings': {'parent_weekly_digest': True}}}
        conf = digest.digest_settings(org)
        assert conf == {'enabled': True, 'day': 'sunday', 'hour': 17}

    def test_a_nonsense_day_or_hour_falls_back_rather_than_skipping_the_school(self):
        org = {'feature_flags': {'sis_settings': {
            'parent_weekly_digest': {'enabled': True, 'day': 'caturday', 'hour': 99}}}}
        conf = digest.digest_settings(org)
        assert (conf['day'], conf['hour']) == ('sunday', 17)


class TestSendWindow:
    """The hour belongs to the school, not to the server."""

    ORG = {'timezone': 'America/Denver', 'feature_flags': {'sis_settings': {
        'parent_weekly_digest': {'enabled': True, 'day': 'sunday', 'hour': 17}}}}

    def test_fires_at_5pm_in_the_schools_timezone(self):
        # 2026-09-13 23:30 UTC is Sunday 17:30 in Denver (MDT).
        assert digest.in_send_window(self.ORG, datetime(2026, 9, 13, 23, 30, tzinfo=timezone.utc))

    def test_does_not_fire_at_5pm_utc(self):
        # Sunday 17:00 UTC is Sunday 11:00 in Denver.
        assert not digest.in_send_window(self.ORG, datetime(2026, 9, 13, 17, 0, tzinfo=timezone.utc))

    def test_the_local_day_is_what_counts(self):
        # Monday 00:30 UTC is still SUNDAY 18:30 in Denver -- but the hour has
        # passed, so this tick does not send.
        assert not digest.in_send_window(self.ORG, datetime(2026, 9, 14, 0, 30, tzinfo=timezone.utc))

    def test_every_tick_inside_the_hour_is_a_chance_to_send(self):
        base = datetime(2026, 9, 13, 23, 0, tzinfo=timezone.utc)
        assert all(digest.in_send_window(self.ORG, base + timedelta(minutes=m))
                   for m in (0, 10, 20, 30, 40, 50))

    def test_an_unknown_timezone_string_does_not_crash_the_school(self):
        org = dict(self.ORG, timezone='Mars/Olympus')
        assert digest.in_send_window(org, datetime(2026, 9, 13, 23, 30, tzinfo=timezone.utc))


# ── What counts as late ──────────────────────────────────────────────────────

NOW = datetime(2026, 9, 8, 20, 0, tzinfo=timezone.utc)
STUDENT = 'student-1'


def _late_db(tasks, completions, user_quest=None, due='2026-09-01T23:59:59+00:00',
             publish_at=None):
    return fake_repo({
        'class_quests': [{'class_id': 'c1', 'quest_id': 'q1',
                          'due_date': due, 'publish_at': publish_at}],
        'quests': [{'id': 'q1', 'title': 'Bridge Building'}],
        'user_quests': [user_quest] if user_quest else [],
        'user_quest_tasks': tasks,
        'quest_task_completions': completions,
    })


class TestLateWork:
    enrollments = {STUDENT: ['c1']}
    class_names = {'c1': 'Algebra'}

    def _run(self, repo):
        return digest._late_work(repo, self.enrollments, self.class_names, NOW)

    def test_a_quest_nobody_started_is_late(self):
        out = self._run(_late_db(tasks=[], completions=[]))
        assert [i['title'] for i in out[STUDENT]] == ['Bridge Building']
        assert out[STUDENT][0]['started'] is False
        assert out[STUDENT][0]['class_name'] == 'Algebra'
        # Whole days only: due 2026-09-01 23:59, now 2026-09-08 20:00.
        assert out[STUDENT][0]['days_late'] == 6

    def test_every_task_turned_in_is_NOT_late_even_with_completed_at_null(self):
        """The rule the teacher's grid uses (utils/quest_completion).

        A student who finished everything and dismissed the celebration modal
        leaves completed_at NULL forever. Reading that literally is what turns
        an honest digest into an email that calls finished work late.
        """
        db = _late_db(
            user_quest={'id': 'uq1', 'user_id': STUDENT, 'quest_id': 'q1', 'completed_at': None},
            tasks=[{'id': 't1', 'user_quest_id': 'uq1'}, {'id': 't2', 'user_quest_id': 'uq1'}],
            completions=[{'task_id': 't1'}, {'task_id': 't2'}])
        assert self._run(db) == {}

    def test_a_half_finished_quest_is_still_late(self):
        db = _late_db(
            user_quest={'id': 'uq1', 'user_id': STUDENT, 'quest_id': 'q1', 'completed_at': None},
            tasks=[{'id': 't1', 'user_quest_id': 'uq1'}, {'id': 't2', 'user_quest_id': 'uq1'}],
            completions=[{'task_id': 't1'}])
        out = self._run(db)
        assert out[STUDENT][0]['started'] is True

    def test_a_quest_marked_complete_is_not_late(self):
        db = _late_db(
            user_quest={'id': 'uq1', 'user_id': STUDENT, 'quest_id': 'q1',
                        'completed_at': '2026-09-02T10:00:00+00:00'},
            tasks=[{'id': 't1', 'user_quest_id': 'uq1'}], completions=[])
        assert self._run(db) == {}

    def test_work_not_yet_due_is_not_late(self):
        db = _late_db(tasks=[], completions=[], due='2026-09-30T23:59:59+00:00')
        assert self._run(db) == {}

    def test_an_unpublished_quest_is_never_late(self):
        """Scheduled for later means the student has not been given it yet."""
        db = _late_db(tasks=[], completions=[], publish_at='2026-09-20T08:00:00+00:00')
        assert self._run(db) == {}

    def test_the_two_timestamp_shapes_compare_as_times_not_strings(self):
        """PostgREST returns both "...Z" and "...+00:00"; sorted as text, every
        "+00:00" sorts before every "Z". That comparison decides who is late."""
        db = _late_db(tasks=[], completions=[], due='2026-09-30T23:59:59Z')
        assert self._run(db) == {}


# ── The week, and what stays private ─────────────────────────────────────────

class TestWeekWork:
    def _db(self, completions):
        return fake_repo({
            'quest_task_completions': completions,
            'user_quest_tasks': [{'id': 't1', 'title': 'Build the arch', 'pillar': 'stem_logic',
                                  'xp_value': 50}],
            'quests': [{'id': 'q1', 'title': 'Bridge Building'}],
        })

    def _run(self, completions):
        return digest._week_work(self._db(completions), [STUDENT], NOW - timedelta(days=7))

    def test_a_finished_task_lands_with_its_quest_and_xp(self):
        out = self._run([{'id': 'c1', 'user_id': STUDENT, 'task_id': 't1', 'quest_id': 'q1',
                          'evidence_url': None, 'evidence_text': 'I did it',
                          'completed_at': '2026-09-05T12:00:00+00:00', 'is_confidential': False}])
        assert out[STUDENT]['tasks'][0]['title'] == 'Build the arch'
        assert out[STUDENT]['tasks'][0]['quest'] == 'Bridge Building'
        assert out[STUDENT]['xp'] == 50
        assert out[STUDENT]['evidence']['reflections'] == 1

    def test_confidential_work_is_never_forwarded_to_a_mailbox(self):
        """A student, or an observer acting for them, marked this private."""
        out = self._run([{'id': 'c1', 'user_id': STUDENT, 'task_id': 't1', 'quest_id': 'q1',
                          'evidence_url': 'https://x/photo.jpg', 'evidence_text': 'private',
                          'completed_at': '2026-09-05T12:00:00+00:00', 'is_confidential': True}])
        assert out[STUDENT]['tasks'] == []
        assert out[STUDENT]['evidence']['photos'] == 0


class TestBlockEvidence:
    """Evidence is a multi-format DOCUMENT now, not a URL on the completion row.

    Every one of the 123 Gryffin completions in the week of 2026-09-08 was this
    shape: no evidence_url, and an evidence_text placeholder. Counting the row
    alone reported 123 "written notes" and hid 32 photos — the exact thing the
    email sends a parent to the app to look at.
    """

    PLACEHOLDER = 'Multi-format evidence document (Document ID: doc-1)'

    def _run(self, docs, blocks, completion_text=PLACEHOLDER):
        repo = fake_repo({
            'quest_task_completions': [{
                'id': 'c1', 'user_id': STUDENT, 'task_id': 't1', 'quest_id': 'q1',
                'evidence_url': None, 'evidence_text': completion_text,
                'completed_at': '2026-09-05T12:00:00+00:00', 'is_confidential': False}],
            'user_quest_tasks': [{'id': 't1', 'title': 'Build the arch', 'pillar': None,
                                  'xp_value': 50}],
            'quests': [{'id': 'q1', 'title': 'Bridge Building'}],
            'user_task_evidence_documents': docs,
            'evidence_document_blocks': blocks,
        })
        return digest._week_work(repo, [STUDENT], NOW - timedelta(days=7))[STUDENT]['evidence']

    def test_blocks_are_counted_by_type(self):
        out = self._run(
            docs=[{'id': 'doc-1', 'user_id': STUDENT, 'task_id': 't1', 'is_confidential': False}],
            blocks=[{'document_id': 'doc-1', 'block_type': 'image', 'is_private': False},
                    {'document_id': 'doc-1', 'block_type': 'image', 'is_private': False},
                    {'document_id': 'doc-1', 'block_type': 'text', 'is_private': False},
                    {'document_id': 'doc-1', 'block_type': 'link', 'is_private': False}])
        assert (out['photos'], out['reflections'], out['links']) == (2, 1, 1)

    def test_the_placeholder_is_not_a_written_note(self):
        out = self._run(docs=[], blocks=[])
        assert out['reflections'] == 0

    def test_a_private_block_is_not_counted(self):
        out = self._run(
            docs=[{'id': 'doc-1', 'user_id': STUDENT, 'task_id': 't1', 'is_confidential': False}],
            blocks=[{'document_id': 'doc-1', 'block_type': 'image', 'is_private': True}])
        assert out['photos'] == 0

    def test_a_confidential_document_is_not_counted(self):
        out = self._run(
            docs=[{'id': 'doc-1', 'user_id': STUDENT, 'task_id': 't1', 'is_confidential': True}],
            blocks=[{'document_id': 'doc-1', 'block_type': 'image', 'is_private': False}])
        assert out['photos'] == 0

    def test_a_real_note_on_the_row_still_counts(self):
        out = self._run(docs=[], blocks=[], completion_text='What I learned today')
        assert out['reflections'] == 1


class TestEvidenceCounting:
    def _count(self, url=None, text=None):
        counts = {'photos': 0, 'videos': 0, 'files': 0, 'links': 0, 'reflections': 0}
        digest._classify_evidence(url, text, counts)
        return counts

    def test_photos_videos_and_notes_are_counted_separately(self):
        assert self._count(url='https://x/y/IMG_1.HEIC')['photos'] == 1
        assert self._count(url='https://x/y/clip.mov?token=abc')['videos'] == 1
        assert self._count(text='  ')['reflections'] == 0
        assert self._count(text='what I learned')['reflections'] == 1

    def test_an_external_link_is_not_a_photo(self):
        assert self._count(url='https://youtube.com/watch?v=1')['links'] == 1


# ── The email ────────────────────────────────────────────────────────────────

def _child(name='Tarien', tasks=1, late=0, evidence=None, moments=()):
    return {
        'student_id': 'student-1',
        'name': name,
        'tasks': [{'title': f'Task {i}', 'quest': 'Bridge Building', 'pillar': 'STEM & Logic',
                   'xp': 50} for i in range(tasks)],
        'xp': 50 * tasks,
        'evidence': evidence or {'photos': 0, 'videos': 0, 'files': 0, 'links': 0,
                                 'reflections': 0},
        'moments': list(moments),
        'late': [{'title': f'Late quest {i}', 'class_name': 'Algebra', 'days_late': 3,
                  'started': False} for i in range(late)],
    }


def _render(children):
    from services.email_service import EmailService
    service = EmailService()
    with patch.object(service, 'send_email', return_value=True) as send:
        service.send_parent_weekly_digest(
            to_email='parent@example.com', parent_name='Katie', org_name='Gryffin',
            children=children, unsubscribe_url='https://api.example.com/stop?token=t')
    return send.call_args.kwargs


class TestDigestEmail:
    def test_the_subject_leads_with_the_week_not_the_late_work(self):
        assert _render([_child(tasks=6, late=4)])['subject'] == \
            "Tarien's week at Gryffin: 6 tasks finished"

    def test_a_quiet_week_says_so_without_a_count(self):
        out = _render([_child(tasks=0)])
        assert out['subject'] == "Tarien's week at Gryffin"
        assert 'did not log any work' in out['html_body']

    def test_several_children_are_one_email(self):
        out = _render([_child(name='Tarien'), _child(name='Lucy')])
        assert out['subject'] == 'This week at Gryffin: Tarien and Lucy'
        assert 'Tarien' in out['html_body'] and 'Lucy' in out['html_body']

    def test_evidence_is_counted_and_never_linked(self):
        """Media lives in private buckets behind expiring signed URLs. A live
        one in a forwarded email is a minor's work handed to a stranger."""
        out = _render([_child(evidence={'photos': 4, 'videos': 1, 'files': 0, 'links': 0,
                                        'reflections': 2})])
        assert '4 photos, 1 video and 2 written notes' in out['html_body']
        assert '/storage/v1/object/' not in out['html_body']

    def test_the_late_block_caps_and_counts_the_rest(self):
        out = _render([_child(tasks=2, late=9)])
        assert 'Still to finish' in out['html_body']
        assert 'and 4 more' in out['html_body']

    def test_no_late_work_means_no_late_block(self):
        assert 'Still to finish' not in _render([_child(tasks=3)])['html_body']

    def test_it_carries_the_app_badges_and_one_click_unsubscribe(self):
        out = _render([_child()])
        assert 'apps.apple.com' in out['html_body'] and 'play.google.com' in out['html_body']
        assert out['headers']['List-Unsubscribe-Post'] == 'List-Unsubscribe=One-Click'

    def test_it_is_flagged_as_a_student_record_so_support_is_never_copied(self):
        assert _render([_child()])['contains_student_records'] is True

    def test_a_child_name_cannot_inject_markup(self):
        out = _render([_child(name='<script>x</script>')])
        assert '<script>' not in out['html_body']


# ── One send per parent per week ─────────────────────────────────────────────

class TestSweep:
    ORG_ON = {'id': 'org-1', 'name': 'Gryffin', 'timezone': 'America/Denver',
              'feature_flags': {'sis_settings': {
                  'parent_weekly_digest': {'enabled': True, 'day': 'sunday', 'hour': 17}}}}
    ORG_OFF = {'id': 'org-2', 'name': 'Quiet School', 'timezone': 'America/Denver',
               'feature_flags': {}}
    IN_WINDOW = datetime(2026, 9, 13, 23, 30, tzinfo=timezone.utc)

    def _sweep(self, orgs, now, **kwargs):
        repo = fake_repo({'organizations': orgs})
        with patch.object(digest, '_repo', return_value=repo), \
             patch.object(digest, '_sweep_org', return_value={'sent': 1}) as swept:
            result = digest.run_sweep(now=now, **kwargs)
        return result, swept

    def test_a_school_that_never_opted_in_is_never_swept(self):
        _, swept = self._sweep([self.ORG_OFF], self.IN_WINDOW)
        swept.assert_not_called()

    def test_an_opted_in_school_sends_inside_its_window(self):
        result, swept = self._sweep([self.ORG_ON], self.IN_WINDOW)
        assert result['sent'] == 1
        swept.assert_called_once()

    def test_nothing_happens_outside_the_window(self):
        _, swept = self._sweep([self.ORG_ON], datetime(2026, 9, 10, 23, 30, tzinfo=timezone.utc))
        swept.assert_not_called()

    def test_force_ignores_the_window(self):
        _, swept = self._sweep([self.ORG_ON], datetime(2026, 9, 10, 23, 30, tzinfo=timezone.utc),
                               force=True)
        swept.assert_called_once()

    def test_one_school_failing_does_not_stop_the_others(self):
        repo = fake_repo({'organizations': [self.ORG_ON, dict(self.ORG_ON, id='org-3')]})
        with patch.object(digest, '_repo', return_value=repo), \
             patch.object(digest, '_sweep_org', side_effect=[RuntimeError('boom'), {'sent': 2}]):
            result = digest.run_sweep(now=self.IN_WINDOW)
        assert result['sent'] == 2
        assert any('error' in r for r in result['results'])


class TestSendOnce:
    """The dispatcher ticks every ~10 minutes; the send hour is 60 minutes long."""

    ORG = TestSweep.ORG_ON
    DIGESTS = [{'organization_id': 'org-1', 'organization_name': 'Gryffin',
                'parent_user_id': 'parent-1', 'parent_email': 'p@example.com',
                'parent_name': 'Katie', 'children': [_child()]}]

    def test_the_second_tick_in_the_hour_sends_nothing(self):
        with patch.object(digest, 'build_org_digests', return_value=self.DIGESTS), \
             patch.object(digest, '_claim', return_value=False), \
             patch.object(digest, 'send_one') as send:
            result = digest._sweep_org(self.ORG, TestSweep.IN_WINDOW, dry_run=False)
        send.assert_not_called()
        assert result['skipped'] == 1

    def test_a_dry_run_sends_nothing_and_hands_back_what_it_would_have_sent(self):
        with patch.object(digest, 'build_org_digests', return_value=self.DIGESTS), \
             patch.object(digest, '_claim') as claim, patch.object(digest, 'send_one') as send:
            result = digest._sweep_org(self.ORG, TestSweep.IN_WINDOW, dry_run=True)
        claim.assert_not_called()
        send.assert_not_called()
        assert result['preview'] == self.DIGESTS

    def test_a_failed_send_gives_up_for_the_week_rather_than_retrying_all_hour(self):
        with patch.object(digest, 'build_org_digests', return_value=self.DIGESTS), \
             patch.object(digest, '_claim', return_value=True), \
             patch.object(digest, 'send_one', return_value=False), \
             patch.object(digest, '_mark_failed') as failed:
            result = digest._sweep_org(self.ORG, TestSweep.IN_WINDOW, dry_run=False)
        assert result['failed'] == 1
        failed.assert_called_once()


# ── Recipients ───────────────────────────────────────────────────────────────

class TestRecipients:
    def test_both_guardian_mechanisms_are_read(self):
        """Under 13 the guardian is users.managed_by_parent_id; 13 and over it is
        an approved parent_student_links row. Reading one and not the other
        silently skips half a school."""
        repo = fake_repo({
            'users': [{'id': 'kid-1', 'managed_by_parent_id': 'mum'}],
            'parent_student_links': [{'student_user_id': 'kid-1', 'parent_user_id': 'dad'}],
        })
        assert set(digest._guardians(repo, ['kid-1'])['kid-1']) == {'mum', 'dad'}

    def test_a_parent_who_opted_out_is_dropped(self):
        repo = fake_repo({'notification_preferences': [
            {'user_id': 'mum', 'enabled': False}, {'user_id': 'dad', 'enabled': True}]})
        assert repo.opted_out(['mum', 'dad'], digest.NOTIFICATION_TYPE) == {'mum'}


# ── Unsubscribe ──────────────────────────────────────────────────────────────

class TestUnsubscribeToken:
    USER = '3f1c2b7a-9d54-4a1e-b0c8-6e2f77a91d33'  # v4: validate_uuid requires it

    def test_a_token_round_trips(self):
        token = parent_digest_links.make_token(self.USER)
        assert parent_digest_links.user_id_from_token(token) == self.USER

    def test_a_forged_signature_is_refused(self):
        assert parent_digest_links.user_id_from_token(f'{self.USER}.deadbeef') is None

    def test_a_bare_user_id_is_not_a_token(self):
        assert parent_digest_links.user_id_from_token(self.USER) is None

    def test_the_signature_is_namespaced_away_from_payment_links(self):
        """A forwarded 'pay this invoice' link must not double as anything else."""
        from services import sis_pay_links
        assert parent_digest_links.make_token(self.USER) != sis_pay_links.make_token(self.USER)
