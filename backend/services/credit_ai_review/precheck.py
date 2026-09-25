"""The student's precheck: the reviewer's AI, asked before anything is submitted.

A student about to press Request Credit sees roughly what the AI review would
say about the work as it stands, then chooses to submit or keep working. It is
the same prompt, the same schema and the same refusals in normalize.py -- a
precheck that judged by a different standard than the review would teach
students the wrong standard.

Three things make it different from the review, each on purpose:

**It stores nothing.** No round exists yet, and the student has decided
nothing. The review that runs on the real submission is the one a reviewer
reads; this answer lives in one HTTP response.

**It answers inside a request.** The review runs on a thread because a video
can take two minutes to process. This one has a student waiting and gunicorn
killing the worker at 120 seconds, so it gets a tighter budget: no File API
uploads (a large video is named as unread rather than processed), a shorter
evidence deadline and one model attempt. A slower, better answer is still
coming -- from the real review, after they submit.

**The student sees a projection, never the review.** A likelihood, the
checklist, the note written to them, and what could not be read. Not the
confidence figure, not the reviewer summary, not the concerns, and not the XP
opinion: those are working notes for whoever decides, for the reasons in
tests/unit/test_credit_ai_review_privacy.py. ``student_view`` is the whitelist,
and a test holds it.
"""

from __future__ import annotations

import threading
from dataclasses import replace
from typing import Any, Dict, List, Optional

from app_config import Config
from services.base_ai_service import (
    AICreditsExhaustedError,
    AIParsingError,
    AIServiceOverloadedError,
)
from utils.logger import get_logger

from services.credit_ai_review import evidence_loader, prompt as prompt_mod

logger = get_logger(__name__)

#: Statuses a student may still request credit from. Mirrors request-credit.
PRECHECKABLE_STATUSES = ('none', 'grow_this')

#: Seconds for reading the evidence, then for the model's one attempt. Together
#: they stay well inside gunicorn's 120-second worker timeout.
EVIDENCE_SECONDS = 25.0
MODEL_TIMEOUT = 60

#: Concurrent prechecks per process. Each holds a submission's evidence bytes
#: in memory on a 512MB container, like a review does. Acquired with a short
#: wait; a student who cannot get a slot is told the check is busy and can
#: still submit.
_SLOTS = threading.BoundedSemaphore(max(1, int(Config.CREDIT_AI_REVIEW_MAX_INPROC)))
SLOT_WAIT_SECONDS = 5

LIKELIHOOD = {
    'approve': 'likely',
    'grow_this': 'needs_work',
    'needs_human': 'uncertain',
}


class PrecheckUnavailable(Exception):
    """The check could not produce an answer. ``code`` says why, for the UI."""

    def __init__(self, code: str, message: str = ''):
        super().__init__(message or code)
        self.code = code


def enabled() -> bool:
    return bool(Config.CREDIT_AI_REVIEW_ENABLED)


def run_precheck(*, student_id: str, task_id: str, admin) -> Dict[str, Any]:
    """Judge the student's current evidence for this task. Returns student_view.

    Raises LookupError when there is no completion to check, ValueError when
    the task is not in a state credit can be requested from, and
    PrecheckUnavailable for everything that means "no answer this time" --
    AI turned off for this student, busy, nothing readable, the model failing.
    """
    if not enabled():
        raise PrecheckUnavailable('disabled')

    context = build_context(admin, student_id=student_id, task_id=task_id)

    # Consent before a byte of evidence is read, as the review does. Strict:
    # "we could not tell whether the parent allows AI" means no.
    from utils.ai_access import check_ai_access
    has_access, _, _ = check_ai_access(student_id, strict=True)
    if not has_access:
        raise PrecheckUnavailable('ai_disabled')

    if not _SLOTS.acquire(timeout=SLOT_WAIT_SECONDS):
        raise PrecheckUnavailable('busy')
    try:
        return _run(context, admin)
    finally:
        _SLOTS.release()


def _run(context: Dict[str, Any], admin) -> Dict[str, Any]:
    from services.credit_ai_review.service import CreditAIReviewService

    budget = replace(evidence_loader.Budget.from_config(),
                     max_seconds=EVIDENCE_SECONDS, max_file_api_uploads=0)
    load = evidence_loader.load_evidence(
        context['snapshot'], budget=budget, admin=admin, file_api_enabled=False)
    try:
        if not load.anything_readable:
            raise PrecheckUnavailable('no_readable_evidence')

        criteria, criteria_source = prompt_mod.criteria_for(context['task'])
        try:
            review, result = CreditAIReviewService(admin=admin).ask(
                context, load, criteria, criteria_source,
                timeout=MODEL_TIMEOUT, max_retries=0)
        except AICreditsExhaustedError as e:
            logger.warning(f'Credit precheck: AI credits exhausted: {e}')
            raise PrecheckUnavailable('ai_unavailable') from e
        except (AIServiceOverloadedError, AIParsingError) as e:
            logger.info(f'Credit precheck got no usable answer: {type(e).__name__}')
            raise PrecheckUnavailable('ai_unavailable') from e

        logger.info(
            f'Credit precheck: {review["recommendation"]} on '
            f'{load.stats()["read"]}/{load.stats()["items"]} pieces, '
            f'{result.input_tokens or 0} in / {result.output_tokens or 0} out tokens')
        return student_view(review)
    finally:
        evidence_loader.release(load)


def build_context(admin, *, student_id: str, task_id: str) -> Dict[str, Any]:
    """What the review's _load_context builds, from the live evidence instead
    of a submitted snapshot. Like it, carries nothing that names the student
    into the prompt."""
    from repositories.credit_submission_repository import CreditSubmissionRepository

    repo = CreditSubmissionRepository(client=admin)
    completion = repo.completion_for_task(student_id, task_id)
    if completion is None:
        raise LookupError('no completion')
    if completion.get('diploma_status') not in PRECHECKABLE_STATUSES:
        raise ValueError(completion.get('diploma_status') or 'unknown')

    task = repo.task(task_id)
    if not task:
        raise LookupError('no task')
    quest = repo.quest(completion['quest_id']) if completion.get('quest_id') else {}

    from utils.subject_xp import get_subject_xp_distribution
    requested_xp = int(task.get('xp_value') or 0)
    subjects = get_subject_xp_distribution(task, requested_xp)

    snapshot = repo.evidence_blocks(student_id, task_id)

    resubmission = None
    if completion.get('diploma_status') == 'grow_this':
        resubmission = _resubmission(repo.review_rounds(completion['id']), snapshot)

    return {
        'task': task,
        'quest': quest,
        'requested_xp': requested_xp,
        'subjects': subjects,
        'snapshot': snapshot,
        'resubmission': resubmission,
    }


def _resubmission(rounds: List[Dict[str, Any]],
                  snapshot: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The round this would become, diffed against the ones before it."""
    from services.credit_ai_review.service import _resubmission_context

    if not rounds:
        return None
    next_round = {
        'id': None,
        'round_number': max(int(r.get('round_number') or 0) for r in rounds) + 1,
        'evidence_snapshot': snapshot,
    }
    return _resubmission_context(next_round, rounds)


def student_view(review: Dict[str, Any]) -> Dict[str, Any]:
    """The whitelist of what a student is shown. Nothing else leaves.

    The note is the grow_this draft, written to the student, and only when the
    work looks short: showing the "celebrate" draft before a human has
    approved anything would read as the approval itself.
    """
    recommendation = review.get('recommendation')
    feedback = review.get('feedback') or {}
    return {
        'likelihood': LIKELIHOOD.get(recommendation or '', 'uncertain'),
        'criteria': [
            {'criterion': c.get('criterion'), 'verdict': c.get('verdict')}
            for c in (review.get('criteria') or [])
        ],
        'suggestion': feedback.get('grow_this') if recommendation != 'approve' else None,
        'unread': [
            {'label': e.get('label'), 'reason': e.get('skip_reason')}
            for e in (review.get('evidence') or [])
            if e.get('status') == 'skipped'
        ],
        'criteria_source': review.get('criteria_source'),
    }
