"""
The last mile of a ticket: fixed -> resolved when the commit is live, and one
mail to the reporter.

What these hold down:

  * a `fixed` ticket resolves only when its commit is in the deployed history
    AND the reporter's surface is live (mobile waits for the OTA report);
  * SHA matching tolerates abbreviation on either side but refuses anything
    under twelve characters;
  * the reporter mail goes to exactly the tickets it should -- never Sentry,
    never without an address, never when a superadmin turned it off, and not
    until somebody has written a resolution -- and each ticket is mailed once,
    in ONE mail per person per sweep however many tickets they are owed;
  * a failed send is retried next sweep, not stamped as sent;
  * the nag lists fixed tickets older than a day and nothing younger;
  * the cron dispatches the sweep every tick and asks for the nag once a day.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import pytest

from services import ticket_finalize_service as svc


def _ticket(**over):
    base = {
        'id': 't1', 'title': 'Roster export drops the phone column', 'type': 'bug',
        'status': 'fixed', 'source': 'web', 'user_email': 'office@school.org',
        'fix_commit': 'a' * 40, 'resolution': 'The phone column is back.',
        'verification': 'Export a roster.', 'notify_reporter': True,
        'resolved_at': None, 'deployed_at': None, 'reporter_notified_at': None,
        'created_at': '2026-09-17T10:00:00+00:00', 'updated_at': '2026-09-17T10:00:00+00:00',
    }
    base.update(over)
    return base


@pytest.fixture
def repo():
    r = Mock()
    r.list_fixed.return_value = []
    r.list_awaiting_reporter_notice.return_value = []
    r.update_fields.side_effect = lambda tid, changes: {'id': tid, **changes}
    with patch.object(svc, '_repo', return_value=r):
        yield r


@pytest.mark.unit
class TestCommitMatching:

    def test_full_sha_matches_itself(self):
        assert svc.commit_is_live('a' * 40, ['b' * 40, 'a' * 40])

    def test_abbreviated_ticket_sha_matches_a_full_deployed_sha(self):
        assert svc.commit_is_live('a' * 12, ['a' * 40])

    def test_abbreviated_deployed_sha_matches_a_full_ticket_sha(self):
        assert svc.commit_is_live('a' * 40, ['a' * 12])

    def test_too_short_is_refused_not_guessed(self):
        assert not svc.commit_is_live('a' * 7, ['a' * 40])
        assert not svc.commit_is_live('', ['a' * 40])
        assert not svc.commit_is_live(None, ['a' * 40])

    def test_case_and_whitespace_do_not_matter(self):
        assert svc.commit_is_live('  ' + 'A' * 40 + ' ', ['a' * 40])

    def test_garbage_in_the_deployed_list_is_ignored(self):
        assert svc._normalise_shas(['zz' * 20, 42, None, 'a' * 40, 'b' * 11]) == ['a' * 40]


@pytest.mark.unit
class TestApplyDeploy:

    def test_resolves_a_web_ticket_whose_commit_is_live(self, repo):
        repo.list_fixed.return_value = [_ticket()]
        out = svc.apply_deploy('head' * 10, ['c' * 40, 'a' * 40], ['web'])
        assert out['resolved'] == ['t1']
        changes = repo.update_fields.call_args[0][1]
        assert changes['status'] == 'resolved'
        assert changes['resolved_at'] and changes['deployed_at'] == changes['resolved_at']

    def test_leaves_a_ticket_whose_commit_is_not_in_the_history(self, repo):
        repo.list_fixed.return_value = [_ticket(fix_commit='b' * 40)]
        out = svc.apply_deploy('h' * 40, ['a' * 40], ['web'])
        assert out['resolved'] == []
        assert out['waiting'][0]['id'] == 't1'
        repo.update_fields.assert_not_called()

    def test_a_mobile_ticket_waits_for_the_ota_report(self, repo):
        repo.list_fixed.return_value = [_ticket(source='mobile')]
        web = svc.apply_deploy('h' * 40, ['a' * 40], ['web'])
        assert web['resolved'] == [] and 'mobile not deployed yet' in web['waiting'][0]['reason']
        repo.update_fields.assert_not_called()
        ota = svc.apply_deploy('h' * 40, ['a' * 40], ['mobile'])
        assert ota['resolved'] == ['t1']

    def test_every_other_source_resolves_on_the_web_report(self, repo):
        repo.list_fixed.return_value = [
            _ticket(id='w', source='web'), _ticket(id='p', source='perch'),
            _ticket(id='h', source='hq'), _ticket(id='s', source='sentry'),
        ]
        out = svc.apply_deploy('h' * 40, ['a' * 40], ['web'])
        assert sorted(out['resolved']) == ['h', 'p', 's', 'w']

    def test_unknown_surfaces_are_ignored_and_reported(self, repo):
        repo.list_fixed.return_value = [_ticket()]
        out = svc.apply_deploy('h' * 40, ['a' * 40], ['backend', 'web', 'lunar'])
        assert out['surfaces'] == ['web']
        assert out['resolved'] == ['t1']

    def test_a_fixed_ticket_with_no_usable_commit_is_named_not_resolved(self, repo):
        repo.list_fixed.return_value = [_ticket(id='x', fix_commit=None), _ticket(id='y', fix_commit='abc')]
        out = svc.apply_deploy('h' * 40, ['a' * 40], ['web'])
        assert sorted(out['no_fix_commit']) == ['x', 'y']
        repo.update_fields.assert_not_called()


@pytest.mark.unit
class TestWhyNotNotify:

    def test_a_normal_resolved_ticket_is_mailed(self):
        assert svc.why_not_notify(_ticket(status='resolved')) is None

    def test_sentry_never(self):
        assert svc.why_not_notify(_ticket(source='sentry')) == 'sentry'

    def test_no_address_never(self):
        assert svc.why_not_notify(_ticket(user_email=None)) == 'no reporter email'
        assert svc.why_not_notify(_ticket(user_email='   ')) == 'no reporter email'
        assert svc.why_not_notify(_ticket(user_email='not-an-address')) == 'no reporter email'

    def test_superadmin_opt_out(self):
        assert svc.why_not_notify(_ticket(notify_reporter=False)) == 'notify_reporter off'

    def test_nothing_written_yet_is_pending_not_skipped(self):
        assert svc.why_not_notify(_ticket(resolution='')) == 'no resolution written'


@pytest.mark.unit
class TestNotifyResolvedReporters:

    def _email(self, ok=True):
        m = Mock()
        m.send_tickets_resolved_email.return_value = ok
        return m

    def test_one_person_owed_several_tickets_gets_one_mail(self, repo):
        """Eight of Molly's tickets close in one release: Molly gets one email
        listing eight things, not eight emails."""
        repo.list_awaiting_reporter_notice.return_value = [
            _ticket(id='b', status='resolved', created_at='2026-09-15T12:00:00+00:00'),
            _ticket(id='a', status='resolved', created_at='2026-09-15T09:00:00+00:00'),
            _ticket(id='c', status='resolved', user_email='Office@School.org',
                    created_at='2026-09-16T09:00:00+00:00'),
        ]
        email = self._email()
        with patch('services.email_service.email_service', email):
            out = svc.notify_resolved_reporters()
        assert out['emails'] == 1
        assert sorted(out['sent']) == ['a', 'b', 'c']
        email.send_tickets_resolved_email.assert_called_once()
        address, tickets = email.send_tickets_resolved_email.call_args[0]
        # One address, case-folded; oldest ticket first inside the mail.
        assert address == 'office@school.org'
        assert [t['id'] for t in tickets] == ['a', 'b', 'c']
        stamped = {c[0][0]: c[0][1] for c in repo.update_fields.call_args_list}
        assert set(stamped) == {'a', 'b', 'c'}
        assert all('reporter_notified_at' in v for v in stamped.values())

    def test_different_people_get_different_mails(self, repo):
        repo.list_awaiting_reporter_notice.return_value = [
            _ticket(id='m', status='resolved', user_email='molly@school.org'),
            _ticket(id='k', status='resolved', user_email='katrine@school.org'),
        ]
        email = self._email()
        with patch('services.email_service.email_service', email):
            out = svc.notify_resolved_reporters()
        assert out['emails'] == 2 and sorted(out['sent']) == ['k', 'm']
        addresses = sorted(c[0][0] for c in email.send_tickets_resolved_email.call_args_list)
        assert addresses == ['katrine@school.org', 'molly@school.org']

    def test_a_ticket_that_must_not_be_mailed_is_switched_off_not_stamped_sent(self, repo):
        repo.list_awaiting_reporter_notice.return_value = [_ticket(id='s', source='sentry', status='resolved')]
        email = self._email()
        with patch('services.email_service.email_service', email):
            out = svc.notify_resolved_reporters()
        assert out['sent'] == [] and out['skipped'] == [{'id': 's', 'reason': 'sentry'}]
        email.send_tickets_resolved_email.assert_not_called()
        # The flag comes off so the sweep stops rereading it; the stamp stays
        # null because nothing was sent.
        assert repo.update_fields.call_args[0][1] == {'notify_reporter': False}

    def test_a_ticket_with_no_resolution_waits_and_does_not_hold_up_the_rest(self, repo):
        repo.list_awaiting_reporter_notice.return_value = [
            _ticket(id='p', status='resolved', resolution=None),
            _ticket(id='ok', status='resolved'),
        ]
        email = self._email()
        with patch('services.email_service.email_service', email):
            out = svc.notify_resolved_reporters()
        assert out['pending'] == ['p'] and out['sent'] == ['ok']
        _, tickets = email.send_tickets_resolved_email.call_args[0]
        assert [t['id'] for t in tickets] == ['ok']

    def test_a_failed_send_leaves_the_whole_group_for_the_next_sweep(self, repo):
        repo.list_awaiting_reporter_notice.return_value = [_ticket(id='f1', status='resolved'),
                                                          _ticket(id='f2', status='resolved')]
        with patch('services.email_service.email_service', self._email(ok=False)):
            out = svc.notify_resolved_reporters()
        assert sorted(out['failed']) == ['f1', 'f2'] and out['sent'] == []
        repo.update_fields.assert_not_called()

    def test_one_raising_send_does_not_stop_the_others(self, repo):
        repo.list_awaiting_reporter_notice.return_value = [
            _ticket(id='boom', status='resolved', user_email='a@x.org'),
            _ticket(id='ok', status='resolved', user_email='b@x.org'),
        ]
        email = Mock()
        email.send_tickets_resolved_email.side_effect = [RuntimeError('smtp'), True]
        with patch('services.email_service.email_service', email):
            out = svc.notify_resolved_reporters()
        assert out['failed'] == ['boom'] and out['sent'] == ['ok']


@pytest.mark.unit
class TestFixedButNotLive:

    def test_lists_only_tickets_older_than_a_day_oldest_first(self, repo):
        now = datetime(2026, 9, 18, 12, 0, tzinfo=timezone.utc)
        repo.list_fixed.return_value = [
            _ticket(id='young', updated_at=(now - timedelta(hours=3)).isoformat()),
            _ticket(id='old', updated_at=(now - timedelta(hours=30)).isoformat()),
            _ticket(id='older', title='Older', updated_at=(now - timedelta(days=3)).isoformat()),
        ]
        stale = svc.fixed_but_not_live_report(now=now)
        assert [t['id'] for t in stale] == ['older', 'old']
        assert stale[0]['hours'] == 72 and stale[0]['fix_commit'] == 'a' * 12
        assert stale[0]['title'] == 'Older'

    def test_nag_sends_nothing_when_nothing_is_stale(self, repo):
        email = Mock()
        with patch('services.email_service.email_service', email):
            out = svc.send_fixed_but_not_live_nag()
        assert out == {'stale': 0, 'sent': False}
        email.send_tickets_fixed_not_live_email.assert_not_called()

    def test_nag_mails_the_stale_list(self, repo):
        old = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        repo.list_fixed.return_value = [_ticket(updated_at=old)]
        email = Mock()
        email.send_tickets_fixed_not_live_email.return_value = True
        from app_config import Config
        with patch('services.email_service.email_service', email), \
             patch.object(Config, 'DEPLOYED_COMMIT', 'f' * 40):
            out = svc.send_fixed_but_not_live_nag()
        assert out == {'stale': 1, 'sent': True}
        kwargs = email.send_tickets_fixed_not_live_email.call_args.kwargs
        assert kwargs['live_commit'] == 'f' * 40
        assert kwargs['console_url'].endswith('/admin/tickets')


@pytest.mark.unit
class TestCronDispatch:

    def _dispatch(self, monkeypatch, when):
        from datetime import datetime as _dt
        import jobs.cron_dispatch as dispatch

        monkeypatch.setenv('BACKEND_URL', 'https://api.example.com')
        monkeypatch.setenv('CRON_SECRET', 'sekret')
        posted = []
        monkeypatch.setattr(dispatch, '_run',
                            lambda name, url, secret, failures, **kw: posted.append((name, url, kw.get('body'))))

        class _Clock(_dt):
            @classmethod
            def now(cls, tz=None):
                return when
        monkeypatch.setattr(dispatch, 'datetime', _Clock)
        monkeypatch.setattr(dispatch, 'daily_cron_jobs', lambda: [])
        with pytest.raises(SystemExit) as exit_:
            dispatch.main()
        assert exit_.value.code == 0
        return [p for p in posted if p[0] == 'ticket-deploy-sweep']

    def test_sweeps_every_tick_without_the_nag(self, monkeypatch):
        posted = self._dispatch(monkeypatch, datetime(2026, 9, 18, 3, 25, tzinfo=timezone.utc))
        assert posted == [('ticket-deploy-sweep',
                           'https://api.example.com/api/bug-reports/internal/deploy-sweep', None)]

    def test_asks_for_the_nag_once_a_day(self, monkeypatch):
        posted = self._dispatch(monkeypatch, datetime(2026, 9, 18, 14, 4, tzinfo=timezone.utc))
        assert posted[0][2] == {'nag': True}


@pytest.mark.unit
class TestReporterMailCopy:
    """The mail is the reporter's; a SHA or a file name in it is a defect."""

    def _send(self, tickets, to='office@school.org'):
        from services.email_service import email_service
        with patch.object(email_service, 'send_email', return_value=True) as send:
            assert email_service.send_tickets_resolved_email(to, tickets) is True
        return send.call_args.kwargs

    def test_one_ticket_carries_resolution_and_verification_and_replies_to_a_person(self):
        from app_config import Config
        kw = self._send([_ticket(status='resolved')])
        assert kw['to_email'] == 'office@school.org'
        assert kw['subject'] == 'Fixed: Roster export drops the phone column'
        assert 'The phone column is back.' in kw['html_body'] and 'Export a roster.' in kw['html_body']
        assert 'The phone column is back.' in kw['text_body']
        assert kw['reply_to'] == Config.ADMIN_EMAIL
        assert 'a' * 40 not in kw['html_body'] and 'a' * 12 not in kw['text_body']

    def test_several_tickets_become_one_mail_with_a_section_each(self):
        kw = self._send([
            _ticket(id='1', title='Announcements stuck on loading', resolution='The tab loads now.',
                    verification='Open the inbox.'),
            _ticket(id='2', type='feature', title='Drag quests to reorder', resolution='Quests drag by a handle.',
                    verification='Open Curriculum.'),
            _ticket(id='3', type='question', title='Why does the waitlist say 14?',
                    resolution='The number is the live place in line now.', verification=''),
        ])
        assert kw['subject'] == '3 things you told us about, done'
        assert 'You told us about 3 things.' in kw['text_body']
        for piece in ('Announcements stuck on loading', 'The tab loads now.', 'Open the inbox.',
                      'Drag quests to reorder', 'Quests drag by a handle.',
                      'Why does the waitlist say 14?', 'The number is the live place in line now.'):
            assert piece in kw['html_body'] and piece in kw['text_body']
        # Each section is labelled by what kind of thing it was.
        assert 'Fixed · your report' in kw['html_body']
        assert 'Now live · your request' in kw['html_body']
        assert 'Answered · your question' in kw['html_body']
        assert kw['custom_args']['ticket_ids'] == '1,2,3'

    def test_a_mobile_ticket_says_to_reopen_the_app_once(self):
        kw = self._send([_ticket(id='1', source='mobile'), _ticket(id='2', source='mobile')])
        assert kw['text_body'].count('close the app fully') == 1

    def test_a_question_alone_reads_as_an_answer(self):
        kw = self._send([_ticket(type='question', title='How do I add a second parent?')])
        assert kw['subject'] == 'Answered: How do I add a second parent?'

    def test_escapes_what_the_ticket_carries(self):
        kw = self._send([_ticket(title='<img onerror=x>', resolution='a < b & c')])
        assert '<img' not in kw['html_body'] and '&lt;img' in kw['html_body']
        assert 'a &lt; b &amp; c' in kw['html_body']

    def test_no_address_or_nothing_to_say_sends_nothing(self):
        from services.email_service import email_service
        with patch.object(email_service, 'send_email') as send:
            assert email_service.send_tickets_resolved_email('', [_ticket()]) is False
            assert email_service.send_tickets_resolved_email('x@y.org', []) is False
            assert email_service.send_tickets_resolved_email('x@y.org', [_ticket(resolution='')]) is False
        send.assert_not_called()
