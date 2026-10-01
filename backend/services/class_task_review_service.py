"""Per-task review inside a class: accept or send back each task, with the same
AI review a regular credit request gets.

A class is reviewed as a whole (routes/admin/class_reviews.py), but a reviewer
still judges it task by task, exactly as in the credit queue. What differs is
what a decision does:

  accept     marks the task good. No subject XP moves and diploma_status stays
             'none': the class's fixed half credit is the only award, and a
             finalized completion would also show as individually credited XP
             on Courses and Credits -- the same work counted twice.
  send back  records the feedback and drops the task's XP out of the
             reviewer's accepted total. The class can only be approved once
             every task is accepted.

Deciding a task tells the student nothing. The reviewer's feedback on every
task is gathered into one email draft on the class review page, and only
Send (finish()) contacts the student: it applies the class decision, puts each
task's feedback on the task, and sends that one email.

State lives in diploma_review_rounds, one round per class submission. A round
is opened for every task when the class is submitted, and again for a task that
was sent back once the student resubmits the class. An accepted task keeps its
round across resubmissions: the reviewer already judged that work.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from repositories.class_task_review_repository import ClassTaskReviewRepository
from utils.logger import get_logger

logger = get_logger(__name__)

ACCEPTED = 'approved'
RETURNED = 'grow_this'
UNDER_REVIEW = 'submitted_for_review'
APPROVE = 'approve'
SEND_BACK = 'send_back'


def _ts(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _latest_by_completion(rounds: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    latest: Dict[str, Dict[str, Any]] = {}
    for r in rounds:
        cur = latest.get(r['completion_id'])
        if cur is None or (r.get('round_number') or 0) >= (cur.get('round_number') or 0):
            latest[r['completion_id']] = r
    return latest


def _needs_new_round(latest: Optional[Dict[str, Any]], quest: Dict[str, Any]) -> bool:
    """No round yet, or sent back before the class's current submission."""
    if latest is None:
        return True
    if latest.get('reviewer_action') != RETURNED:
        return False
    reviewed = _ts(latest.get('reviewed_at'))
    submitted = _ts(quest.get('class_review_submitted_at'))
    return bool(reviewed and submitted and reviewed < submitted)


def state_of(latest: Optional[Dict[str, Any]]) -> str:
    if latest is None:
        return 'not_submitted'
    action = latest.get('reviewer_action')
    if action == ACCEPTED:
        return 'accepted'
    if action == RETURNED:
        return 'returned'
    return 'pending'


class ClassTaskReviewService:

    def __init__(self, client=None):
        self.repo = ClassTaskReviewRepository(client=client)
        self.client = self.repo.client

    # -- rounds --------------------------------------------------------------

    def ensure_rounds(self, quest: Dict[str, Any],
                      completions: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Dict[str, Any]]:
        """Open a review round for every task that needs one, queue its AI
        review, and return the latest round per completion.

        Idempotent: a class opened twice gets its rounds once. Only a class
        under review opens rounds -- a draft class has nothing to judge yet.
        """
        student_id = quest.get('created_by')
        if completions is None:
            completions = self.repo.completions(quest['id'], student_id) if student_id else []
        ids = [c['id'] for c in completions]
        latest = _latest_by_completion(self.repo.rounds(ids))

        if quest.get('class_review_status') != UNDER_REVIEW:
            return latest

        opened: List[Dict[str, Any]] = []
        submitted_at = quest.get('class_review_submitted_at') or datetime.now(timezone.utc).isoformat()
        for c in completions:
            prev = latest.get(c['id'])
            if not _needs_new_round(prev, quest):
                continue
            snapshot = (self.repo.evidence_snapshot(student_id, c['user_quest_task_id'])
                        if c.get('user_quest_task_id') else [])
            row = self.repo.insert_round({
                'completion_id': c['id'],
                'round_number': (prev.get('round_number') or 0) + 1 if prev else 1,
                'evidence_snapshot': snapshot,
                # Deliberately empty: subject_suggestion is what a regular
                # request moved into pending subject XP, and a class task
                # never moves any.
                'subject_suggestion': None,
                'submitted_at': submitted_at,
            })
            if row:
                latest[c['id']] = row
                opened.append(row)

        self._queue_ai(latest, opened)
        return latest

    def _queue_ai(self, latest: Dict[str, Dict[str, Any]], opened: List[Dict[str, Any]]) -> None:
        """Queue the AI for every open round that has no review yet. Best
        effort: the reviewer can always press Run AI review."""
        try:
            from services.credit_ai_review import store, trigger
            if not trigger.enabled():
                return
            open_rounds = [r for r in latest.values() if not r.get('reviewer_action')]
            if not open_rounds:
                return
            missing = set(store.missing_for_rounds(self.client, [r['id'] for r in open_rounds]))
            queued = []
            for r in open_rounds:
                if r['id'] in missing:
                    row = store.queue_review(self.client, round_id=r['id'],
                                             completion_id=r['completion_id'])
                    if row and row.get('status') == 'queued' and row.get('id'):
                        queued.append(row['id'])
            # A class is a dozen tasks at once. One kick per task would take
            # the process's few worker slots on the first two and leave the
            # rest for the sweep; batches share the slots instead.
            from app_config import Config
            slots = max(1, int(Config.CREDIT_AI_REVIEW_MAX_INPROC))
            for i in range(slots):
                batch = queued[i::slots]
                if batch:
                    trigger.kick_background(batch)
            if opened:
                logger.info(f'Class review: opened {len(opened)} task round(s)')
        except Exception as e:  # noqa: BLE001
            logger.warning(f'Class review: could not queue AI reviews: {e}')

    # -- decisions -----------------------------------------------------------

    def decide(self, *, quest_id: str, completion_id: str, action: str,
               feedback: Optional[str], reviewer_id: str,
               ai_feedback_used: Optional[str] = None) -> Dict[str, Any]:
        """Accept or send back one class task. Returns {'ok': True, ...} or
        {'error': (code, message, status)}."""
        if action not in (ACCEPTED, RETURNED):
            return {'error': ('INVALID_ACTION', 'Unknown decision', 400)}
        feedback = (feedback or '').strip() or None
        if action == RETURNED and not feedback:
            return {'error': ('FEEDBACK_REQUIRED',
                              'Feedback is required when you send a task back', 400)}

        quest = self.repo.quest(quest_id)
        if not quest or quest.get('quest_type') != 'class':
            return {'error': ('NOT_FOUND', 'Class not found', 404)}
        if quest.get('class_review_status') != UNDER_REVIEW:
            return {'error': ('NOT_PENDING', 'Class is not pending review', 409)}

        completion = self.repo.completion(completion_id)
        if (not completion or completion.get('quest_id') != quest_id
                or completion.get('user_id') != quest.get('created_by')):
            return {'error': ('NOT_FOUND', 'Task not found on this class', 404)}

        latest = self.ensure_rounds(quest, [completion]).get(completion_id)
        if not latest:
            return {'error': ('NO_ROUND', 'Could not open a review for this task', 500)}

        now = datetime.now(timezone.utc).isoformat()
        self.repo.decide_round(latest['id'], {
            'reviewer_id': reviewer_id,
            'reviewer_action': action,
            'reviewer_feedback': feedback,
            'reviewed_at': now,
        })

        if ai_feedback_used in ('celebrate', 'grow_this'):
            try:
                from services.credit_ai_review import store
                store.mark_reviewer_outcome(self.client, round_id=latest['id'],
                                            accepted_feedback=ai_feedback_used)
            except Exception as e:  # noqa: BLE001
                logger.warning(f'Class review: could not record AI outcome: {e}')

        return {'ok': True, 'round_id': latest['id'],
                'state': state_of({'reviewer_action': action})}

    # -- finishing -----------------------------------------------------------

    def finish(self, *, quest_id: str, outcome: str, subject: str, body: str,
               reviewer_id: str) -> Dict[str, Any]:
        """The reviewer pressed Send: decide the class, put each task's
        feedback on the task, and send the one email. The first moment the
        student hears anything about this review."""
        if outcome not in (APPROVE, SEND_BACK):
            return {'error': ('INVALID_OUTCOME', 'Choose approve or send back', 400)}
        subject = (subject or '').strip()
        body = (body or '').strip()
        if not subject or not body:
            return {'error': ('EMAIL_REQUIRED', 'The email needs a subject and a message', 400)}

        quest = self.repo.quest(quest_id)
        if not quest or quest.get('quest_type') != 'class':
            return {'error': ('NOT_FOUND', 'Class not found', 404)}
        if quest.get('class_review_status') != UNDER_REVIEW:
            return {'error': ('NOT_PENDING', 'Class is not pending review', 409)}

        completions = self.repo.completions(quest_id, quest.get('created_by'))
        latest = self.ensure_rounds(quest, completions)
        states = {c['id']: state_of(latest.get(c['id'])) for c in completions}
        if outcome == APPROVE:
            undecided = sum(1 for st in states.values() if st != 'accepted')
            if not completions or undecided:
                return {'error': ('TASKS_NOT_ACCEPTED',
                                  f'Accept every task before you approve the class ({undecided} not accepted)',
                                  409)}

        now = datetime.now(timezone.utc).isoformat()
        for c in completions:
            r = latest.get(c['id']) or {}
            if c.get('user_quest_task_id') and r.get('reviewer_action') and r.get('reviewer_feedback'):
                self.repo.set_task_feedback(c['user_quest_task_id'], r['reviewer_feedback'], now)

        status = 'credit_awarded' if outcome == APPROVE else 'rejected'
        # The email body is also what the student's class page shows as the
        # review notes.
        self.repo.set_quest_review(quest_id, status, body)

        from services import class_credit_pdf_service as mail
        if outcome == APPROVE:
            # The portfolio build fetches every asset; never block the page on it.
            mail.send_class_review_email_async(quest_id, subject, body)
            sent: Optional[bool] = None
        else:
            sent = mail.send_class_review_email(quest_id, subject, body, attach_portfolio=False)

        self._notify(quest, outcome)
        logger.info(f'Class review: {reviewer_id[:8]} finished {quest_id[:8]} as {status}, email sent={sent}')
        return {'ok': True, 'review_status': status, 'email_sent': sent}

    def send_preview(self, *, quest_id: str, outcome: str, subject: str, body: str,
                     reviewer_id: str) -> Dict[str, Any]:
        """Send the draft to the reviewer exactly as the student would get
        it -- same subject, same body, the portfolio when approving. Changes
        nothing and contacts no one else."""
        if outcome not in (APPROVE, SEND_BACK):
            return {'error': ('INVALID_OUTCOME', 'Choose approve or send back', 400)}
        subject = (subject or '').strip()
        body = (body or '').strip()
        if not subject or not body:
            return {'error': ('EMAIL_REQUIRED', 'The email needs a subject and a message', 400)}
        quest = self.repo.quest(quest_id)
        if not quest or quest.get('quest_type') != 'class':
            return {'error': ('NOT_FOUND', 'Class not found', 404)}
        to_email = self.repo.user_email(reviewer_id)
        if not to_email:
            return {'error': ('NO_EMAIL', 'Your account has no email address', 400)}

        from services import class_credit_pdf_service as mail
        if outcome == APPROVE:
            mail.send_class_review_email_async(quest_id, subject, body, to_override=to_email)
            sent: Optional[bool] = None
        else:
            sent = mail.send_class_review_email(quest_id, subject, body, attach_portfolio=False,
                                                to_override=to_email)
        return {'ok': True, 'to': to_email, 'email_sent': sent}

    def _notify(self, quest: Dict[str, Any], outcome: str) -> None:
        try:
            from services.notification_service import NotificationService
            title = quest.get('title') or 'your class'
            if outcome == APPROVE:
                kind, heading = 'diploma_credit_approved', 'Class credit awarded'
                message = f'Optio approved {title}. Check your email for the details.'
            else:
                kind, heading = 'diploma_credit_grow_this', 'Grow This: Optio Feedback'
                message = f'Optio reviewed {title} and has feedback. Check your email, then resubmit the class.'
            NotificationService().create_notification(
                user_id=quest['created_by'], notification_type=kind, title=heading,
                message=message, link=f'/quests/{quest["id"]}',
                metadata={'class_quest_id': quest['id']},
            )
        except Exception as e:  # noqa: BLE001
            logger.warning(f'Class review: could not notify the student: {e}')
