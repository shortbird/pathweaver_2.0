"""The nightly conversation review.

What must stay true:

  * only threads with a student in them are read, and not a parent's thread
    with their own child, nor the superadmin's
  * a thread already reviewed through its latest message is not read again
  * a flagged thread becomes a pending report with no reporter, and the
    superadmins are told; a thread flagged in the last week is not reported
    twice
  * a model failure skips the thread and never files anything
  * the transcript names roles and marks photos, and never leaks the whole
    message store: it is the last fifty messages, oldest first
"""

from unittest.mock import Mock, patch

from services import conversation_review_service as cr
from services.conversation_review_service import ReviewVerdict


def _judging(answer):
    from services.base_ai_service import AIJsonResult
    svc = cr.ConversationReviewService.__new__(cr.ConversationReviewService)
    svc.generate_json_multimodal = Mock(return_value=AIJsonResult(data=answer, model_name='gemini-test'))
    return svc


def test_a_flagged_answer_carries_its_risk_and_reasons():
    out = _judging({'verdict': 'flagged', 'risk': 'high', 'reasons': ['secrecy', 'gifts']}).judge('t')
    assert out.verdict == 'flagged' and out.risk == 'high' and out.reasons == ['secrecy', 'gifts']
    assert out.model == 'gemini-test' and not out.failed


def test_an_unusable_answer_or_an_exception_is_a_failure_not_a_verdict():
    assert _judging({'verdict': 'maybe'}).judge('t').failed
    svc = cr.ConversationReviewService.__new__(cr.ConversationReviewService)
    svc.generate_json_multimodal = Mock(side_effect=RuntimeError('503'))
    assert svc.judge('t').failed


def test_the_transcript_names_roles_and_marks_photos():
    msgs = [
        {'sender_id': 't', 'message_content': 'great work today', 'created_at': '2026-09-15T10:00:00Z',
         'attachments': []},
        {'sender_id': 'k', 'message_content': '', 'created_at': '2026-09-15T10:01:00Z',
         'attachments': [{'url': 'u', 'type': 'image'}]},
    ]
    text = cr._transcript(msgs, {'t': 'advisor', 'k': 'student'}, {'t': 'Lee', 'k': 'Sam'})
    assert text.splitlines() == [
        '[2026-09-15T10:00] advisor (Lee): great work today',
        '[2026-09-15T10:01] student (Sam): [photo]',
    ]


def _repo(threads, messages, *, reviewed=False, flagged_recently=False, parent=False):
    repo = Mock()
    repo.dm_threads_since.return_value = [t for t in threads if t['kind'] == 'dm']
    repo.group_threads_since.return_value = [t for t in threads if t['kind'] == 'group']
    repo.roles_for.return_value = {'t': 'advisor', 'k': 'student', 'p': 'parent', 'sa': 'superadmin',
                                   'k2': 'student'}
    repo.names_for.return_value = {'t': 'Lee', 'k': 'Sam', 'k2': 'Ana'}
    repo.is_parent_of.return_value = parent
    repo.reviewed_through.return_value = reviewed
    repo.flagged_recently.return_value = flagged_recently
    repo.messages.return_value = messages
    repo.record.return_value = 'rv1'
    repo.file_report.return_value = 'rep1'
    return repo


def _dm(a, b, id='c1'):
    return {'kind': 'dm', 'id': id, 'participant_ids': [a, b], 'last_message_at': '2026-09-15T10:01:00Z'}


def _run(repo, verdict):
    svc = Mock()
    svc.judge.return_value = verdict
    with patch('repositories.conversation_review_repository.ConversationReviewRepository', return_value=repo), \
         patch.object(cr, 'ConversationReviewService', return_value=svc), \
         patch('repositories.user_repository.UserRepository') as users, \
         patch('services.notification_service.NotificationService') as notify:
        users.return_value.find_by_role.return_value = [{'id': 'sa1'}]
        out = cr.review_recent(hours=24, limit=50)
    return out, svc, notify.return_value


MSGS = [{'id': 'm1', 'sender_id': 't', 'message_content': 'our secret', 'created_at': 'x', 'attachments': []}]


def test_a_flagged_thread_is_reported_with_no_reporter_and_the_superadmins_hear():
    repo = _repo([_dm('t', 'k')], MSGS)
    out, svc, notify = _run(repo, ReviewVerdict('flagged', 'high', ['secrecy'], 'm'))
    assert out == {'reviewed': 1, 'flagged': 1, 'skipped': 0, 'failed': 0}
    assert 'advisor (Lee): our secret' in svc.judge.call_args.args[0]
    rep = repo.file_report.call_args.kwargs
    assert rep['target_type'] == 'conversation' and rep['target_id'] == 'c1'
    assert rep['notes'].startswith('Nightly review, risk high: secrecy')
    rec = repo.record.call_args.kwargs
    assert rec['verdict'] == 'flagged' and rec['reported'] is True and rec['window_end'] == '2026-09-15T10:01:00Z'
    n = notify.create_notification.call_args.kwargs
    assert n['user_id'] == 'sa1' and n['notification_type'] == 'system_alert' and 'high' in n['title']


def test_a_clear_thread_is_recorded_and_nothing_is_filed():
    repo = _repo([_dm('t', 'k')], MSGS)
    out, _, notify = _run(repo, ReviewVerdict('clear'))
    assert out['reviewed'] == 1 and out['flagged'] == 0
    repo.file_report.assert_not_called()
    notify.create_notification.assert_not_called()


def test_threads_the_send_screen_leaves_alone_are_skipped():
    # adult-adult, parent-own-child, superadmin-student, and an adult room
    threads = [_dm('t', 'p', 'a'), _dm('p', 'k', 'b'), _dm('sa', 'k', 'c'),
               {'kind': 'group', 'id': 'g', 'name': 'Staff', 'audience': 'staff',
                'participant_ids': [], 'last_message_at': 'x'}]
    repo = _repo(threads, MSGS, parent=True)
    out, svc, _ = _run(repo, ReviewVerdict('clear'))
    assert out['skipped'] == 4 and out['reviewed'] == 0
    svc.judge.assert_not_called()


def test_a_student_room_and_a_friend_thread_are_read():
    threads = [_dm('k', 'k2', 'f'),
               {'kind': 'group', 'id': 'g', 'name': 'Period 3', 'audience': 'student',
                'participant_ids': [], 'last_message_at': 'x'}]
    repo = _repo(threads, MSGS)
    out, _, _ = _run(repo, ReviewVerdict('clear'))
    assert out['reviewed'] == 2


def test_a_thread_already_reviewed_through_its_latest_message_is_not_read_again():
    repo = _repo([_dm('t', 'k')], MSGS, reviewed=True)
    out, svc, _ = _run(repo, ReviewVerdict('clear'))
    assert out['skipped'] == 1
    svc.judge.assert_not_called()


def test_a_thread_flagged_this_week_is_recorded_but_not_reported_twice():
    repo = _repo([_dm('t', 'k')], MSGS, flagged_recently=True)
    out, _, notify = _run(repo, ReviewVerdict('flagged', 'medium', ['x'], 'm'))
    assert out['flagged'] == 0 and out['reviewed'] == 1
    repo.file_report.assert_not_called()
    assert repo.record.call_args.kwargs['reported'] is False
    notify.create_notification.assert_not_called()


def test_a_model_failure_skips_the_thread_and_files_nothing():
    repo = _repo([_dm('t', 'k')], MSGS)
    out, _, _ = _run(repo, ReviewVerdict('clear', failed=True))
    assert out == {'reviewed': 0, 'flagged': 0, 'skipped': 0, 'failed': 1}
    repo.record.assert_not_called()


def test_the_switch_turns_the_review_off():
    with patch.object(cr.Config, 'CONVERSATION_REVIEW_ENABLED', False), \
         patch('repositories.conversation_review_repository.ConversationReviewRepository') as repo:
        out = cr.review_recent()
    assert out['disabled'] is True
    repo.assert_not_called()


def test_the_cron_dispatcher_runs_the_review_nightly_before_the_digest():
    import inspect
    from jobs import cron_dispatch
    src = inspect.getsource(cron_dispatch)
    at = src.index('conversation-review')
    assert 'now.hour == 10' in src[at - 200:at]
    assert src.index('conversation-review') < src.index('moderation-daily-digest')
