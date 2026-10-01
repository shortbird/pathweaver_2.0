"""Per-task review inside a class (services/class_task_review_service.py).

The rules that matter: a decision never touches diploma_status or subject XP
(the class's half credit is the only award), a task sent back needs feedback,
and a task sent back gets a fresh round only once the class is resubmitted.
"""

from unittest.mock import MagicMock, patch

import pytest

from services import class_task_review_service as svc

QUEST_ID = 'q-1'
STUDENT = 'stu-1'


class FakeRepo:
    def __init__(self, quest, completions, rounds=None):
        self._quest = quest
        self._completions = completions
        self._rounds = list(rounds or [])
        self.inserted = []
        self.decided = []
        self.feedback = []
        self.client = MagicMock()

    def quest(self, quest_id):
        return self._quest if quest_id == self._quest['id'] else None

    def completions(self, quest_id, student_id):
        return self._completions

    def completion(self, completion_id):
        return next((c for c in self._completions if c['id'] == completion_id), None)

    def rounds(self, ids):
        return [r for r in self._rounds if r['completion_id'] in ids]

    def evidence_snapshot(self, student_id, task_id):
        return [{'id': f'b-{task_id}', 'block_type': 'text'}]

    def task_title(self, task_id):
        return 'Write a plan'

    def insert_round(self, row):
        row = {**row, 'id': f"r-{row['completion_id']}-{row['round_number']}"}
        self._rounds.append(row)
        self.inserted.append(row)
        return row

    def decide_round(self, round_id, update):
        self.decided.append((round_id, update))
        for r in self._rounds:
            if r['id'] == round_id:
                r.update(update)

    def set_task_feedback(self, task_id, feedback, at):
        self.feedback.append((task_id, feedback))


def _quest(status='submitted_for_review', submitted='2026-09-30T12:00:00+00:00'):
    return {'id': QUEST_ID, 'title': 'Entrepreneurship', 'quest_type': 'class',
            'class_review_status': status, 'class_review_submitted_at': submitted,
            'created_by': STUDENT}


def _completion(cid='c-1', task='t-1'):
    return {'id': cid, 'user_id': STUDENT, 'quest_id': QUEST_ID,
            'user_quest_task_id': task, 'diploma_status': 'none'}


def _service(repo):
    service = svc.ClassTaskReviewService.__new__(svc.ClassTaskReviewService)
    service.repo = repo
    service.client = repo.client
    return service


@pytest.fixture(autouse=True)
def no_ai():
    with patch('services.credit_ai_review.trigger.enabled', return_value=False):
        yield


class TestNeedsNewRound:
    def test_a_task_with_no_round_needs_one(self):
        assert svc._needs_new_round(None, _quest())

    def test_an_open_or_accepted_round_is_kept(self):
        assert not svc._needs_new_round({'reviewer_action': None}, _quest())
        assert not svc._needs_new_round({'reviewer_action': 'approved',
                                         'reviewed_at': '2026-09-01T00:00:00+00:00'}, _quest())

    def test_a_task_sent_back_reopens_only_after_the_class_is_resubmitted(self):
        returned = {'reviewer_action': 'grow_this', 'reviewed_at': '2026-09-30T13:00:00+00:00'}
        assert not svc._needs_new_round(returned, _quest(submitted='2026-09-30T12:00:00+00:00'))
        assert svc._needs_new_round(returned, _quest(submitted='2026-10-02T09:00:00Z'))


class TestEnsureRounds:
    def test_opens_one_round_per_task_without_subject_suggestion(self):
        repo = FakeRepo(_quest(), [_completion('c-1', 't-1'), _completion('c-2', 't-2')])
        latest = _service(repo).ensure_rounds(repo.quest(QUEST_ID))
        assert set(latest) == {'c-1', 'c-2'}
        assert all(r['subject_suggestion'] is None for r in repo.inserted)
        assert repo.inserted[0]['evidence_snapshot'] == [{'id': 'b-t-1', 'block_type': 'text'}]

    def test_is_idempotent(self):
        repo = FakeRepo(_quest(), [_completion()])
        service = _service(repo)
        service.ensure_rounds(repo.quest(QUEST_ID))
        service.ensure_rounds(repo.quest(QUEST_ID))
        assert len(repo.inserted) == 1

    def test_a_class_not_under_review_opens_nothing(self):
        repo = FakeRepo(_quest(status=None), [_completion()])
        _service(repo).ensure_rounds(repo.quest(QUEST_ID))
        assert repo.inserted == []


class TestDecide:
    def test_sending_back_needs_feedback(self):
        repo = FakeRepo(_quest(), [_completion()])
        out = _service(repo).decide(quest_id=QUEST_ID, completion_id='c-1', action='grow_this',
                                    feedback='  ', reviewer_id='admin')
        assert out['error'][0] == 'FEEDBACK_REQUIRED'

    def test_a_class_not_under_review_refuses(self):
        repo = FakeRepo(_quest(status='credit_awarded'), [_completion()])
        out = _service(repo).decide(quest_id=QUEST_ID, completion_id='c-1', action='approved',
                                    feedback=None, reviewer_id='admin')
        assert out['error'][0] == 'NOT_PENDING'

    def test_a_task_from_another_quest_is_not_found(self):
        other = {**_completion('c-9'), 'quest_id': 'other'}
        repo = FakeRepo(_quest(), [_completion(), other])
        out = _service(repo).decide(quest_id=QUEST_ID, completion_id='c-9', action='approved',
                                    feedback=None, reviewer_id='admin')
        assert out['error'][0] == 'NOT_FOUND'

    def test_accept_records_the_round_and_nothing_else(self):
        repo = FakeRepo(_quest(), [_completion()])
        out = _service(repo).decide(quest_id=QUEST_ID, completion_id='c-1', action='approved',
                                    feedback=None, reviewer_id='admin')
        assert out['state'] == 'accepted'
        (_, update), = repo.decided
        assert update['reviewer_action'] == 'approved'
        assert repo.feedback == []
        # No completion or subject-XP write: the repo has no method for one,
        # and the client is never reached directly.
        repo.client.table.assert_not_called()

    def test_send_back_tells_the_student_nothing_yet(self):
        repo = FakeRepo(_quest(), [_completion()])
        with patch('services.notification_service.NotificationService') as notifications:
            out = _service(repo).decide(quest_id=QUEST_ID, completion_id='c-1', action='grow_this',
                                        feedback='Add your survey results.', reviewer_id='admin')
        assert out['state'] == 'returned'
        assert repo.decided[0][1]['reviewer_feedback'] == 'Add your survey results.'
        # The feedback waits for Send: not on the task, no notification.
        assert repo.feedback == []
        notifications.assert_not_called()


class TestFinish:
    def _decided(self, *actions):
        comps = [_completion(f'c-{i}', f't-{i}') for i in range(len(actions))]
        rounds = [{'id': f'r-{i}', 'completion_id': f'c-{i}', 'round_number': 1,
                   'reviewer_action': a, 'reviewer_feedback': f'note {i}' if a else None}
                  for i, a in enumerate(actions)]
        repo = FakeRepo(_quest(), comps, rounds)
        repo.set_quest_review = MagicMock()
        return repo

    def _finish(self, repo, outcome, **kw):
        args = dict(quest_id=QUEST_ID, outcome=outcome, subject='Your class',
                    body='Hi Jake', reviewer_id='admin')
        args.update(kw)
        with patch('services.class_credit_pdf_service.send_class_review_email', return_value=True) as sync, \
             patch('services.class_credit_pdf_service.send_class_review_email_async') as async_, \
             patch('services.notification_service.NotificationService') as notifications:
            out = _service(repo).finish(**args)
        return out, sync, async_, notifications

    def test_approve_needs_every_task_accepted(self):
        repo = self._decided('approved', None)
        out, sync, async_, notifications = self._finish(repo, 'approve')
        assert out['error'][0] == 'TASKS_NOT_ACCEPTED'
        repo.set_quest_review.assert_not_called()
        sync.assert_not_called(); async_.assert_not_called(); notifications.assert_not_called()

    def test_an_empty_email_is_refused(self):
        repo = self._decided('approved')
        out, *_ = self._finish(repo, 'approve', body='  ')
        assert out['error'][0] == 'EMAIL_REQUIRED'

    def test_approve_awards_puts_feedback_on_tasks_and_sends_with_portfolio(self):
        repo = self._decided('approved', 'approved')
        out, sync, async_, notifications = self._finish(repo, 'approve')
        assert out['review_status'] == 'credit_awarded'
        repo.set_quest_review.assert_called_once_with(QUEST_ID, 'credit_awarded', 'Hi Jake')
        assert sorted(repo.feedback) == [('t-0', 'note 0'), ('t-1', 'note 1')]
        async_.assert_called_once_with(QUEST_ID, 'Your class', 'Hi Jake')
        sync.assert_not_called()
        assert notifications.return_value.create_notification.call_count == 1

    def test_send_back_rejects_and_sends_now_without_portfolio(self):
        repo = self._decided('approved', 'grow_this')
        out, sync, async_, _ = self._finish(repo, 'send_back')
        assert out == {'ok': True, 'review_status': 'rejected', 'email_sent': True}
        sync.assert_called_once_with(QUEST_ID, 'Your class', 'Hi Jake', attach_portfolio=False)
        async_.assert_not_called()

    def test_state_of(self):
        assert svc.state_of(None) == 'not_submitted'
        assert svc.state_of({'reviewer_action': None}) == 'pending'
        assert svc.state_of({'reviewer_action': 'approved'}) == 'accepted'
        assert svc.state_of({'reviewer_action': 'grow_this'}) == 'returned'


class TestRecipients:
    """The class review email goes to the student alone, never cc parents."""

    def test_student_only_never_copies_parents(self):
        from services.class_credit_pdf_service import _student_only
        data = {'student': {'email': 'jake@example.com'},
                'parents': [{'email': 'parent@example.com'}]}
        assert _student_only(data) == ('jake@example.com', [])

    def test_no_student_address_means_no_email_not_a_parent(self):
        from services.class_credit_pdf_service import _student_only
        data = {'student': {'email': None}, 'parents': [{'email': 'parent@example.com'}]}
        assert _student_only(data) == (None, [])


class TestEmailRendering:
    """The reviewer's draft is plain text; **Title** is the only markup."""

    def _render(self, body):
        from services.email_service import email_service
        with patch.object(email_service, 'send_email', return_value=True) as send:
            email_service.send_class_review_email(to_email='jake@example.com', subject='S', body_text=body)
        return send.call_args.kwargs

    def test_bold_titles_and_paragraphs(self):
        kwargs = self._render('Hi Jake,\n\n**Skier survey**\nAdd your results.')
        assert '<strong>Skier survey</strong><br>Add your results.' in kwargs['html_body']
        assert kwargs['text_body'] == 'Hi Jake,\n\nSkier survey\nAdd your results.'

    def test_typed_html_and_jinja_are_escaped(self):
        kwargs = self._render('<script>x</script> {{ config }}')
        assert '<script>' not in kwargs['html_body']
        assert '{{ config }}' in kwargs['html_body']


class TestSendPreview:
    """Send draft to me: the student's email, to the reviewer, changing nothing."""

    def _preview(self, outcome):
        repo = FakeRepo(_quest(), [_completion()])
        repo.user_email = lambda uid: 'tanner@example.com'
        repo.set_quest_review = MagicMock()
        with patch('services.class_credit_pdf_service.send_class_review_email', return_value=True) as sync, \
             patch('services.class_credit_pdf_service.send_class_review_email_async') as async_, \
             patch('services.notification_service.NotificationService') as notifications:
            out = _service(repo).send_preview(quest_id=QUEST_ID, outcome=outcome, subject='S',
                                              body='Hi Jake', reviewer_id='admin')
        return out, repo, sync, async_, notifications

    def test_send_back_preview_goes_to_the_reviewer_only(self):
        out, repo, sync, async_, notifications = self._preview('send_back')
        assert out['to'] == 'tanner@example.com'
        sync.assert_called_once_with(QUEST_ID, 'S', 'Hi Jake', attach_portfolio=False,
                                     to_override='tanner@example.com')
        repo.set_quest_review.assert_not_called()
        assert repo.decided == [] and repo.feedback == []
        notifications.assert_not_called()

    def test_approve_preview_carries_the_portfolio(self):
        out, repo, sync, async_, _ = self._preview('approve')
        async_.assert_called_once_with(QUEST_ID, 'S', 'Hi Jake', to_override='tanner@example.com')
        sync.assert_not_called()
        repo.set_quest_review.assert_not_called()
