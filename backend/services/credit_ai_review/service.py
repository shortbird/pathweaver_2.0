"""One AI credit review, start to finish.

    claim -> consent -> load evidence -> ask -> check the answer -> store

The order matters in one place: the consent check comes before anything is
downloaded. A parent who switched AI off for their child did not consent to that
child's photographs being pulled out of storage so a staff tool could think about
them, and "we fetched it but did not send it" is not a distinction that means
anything to them.

Everything else here is bookkeeping around the four modules that do the work --
evidence_loader, prompt, normalize, store -- plus the guarantee that whatever
happens, the row reaches a terminal state and any file uploaded to the model's
file store is deleted.
"""

from __future__ import annotations

import gc
from typing import Any, Dict, List, Optional

from app_config import Config
from services.base_ai_service import (
    AICreditsExhaustedError,
    AIParsingError,
    AIServiceOverloadedError,
    BaseAIService,
)
from utils.error_reporting import report_error
from utils.logger import get_logger

from services.credit_ai_review import evidence_loader, prompt as prompt_mod, store
from services.credit_ai_review.normalize import normalize_review, skipped_review
from services.credit_ai_review.schema import RESPONSE_SCHEMA

logger = get_logger(__name__)

# Near-deterministic: this reads evidence against a checklist rather than writing
# prose, and two reviewers running it on the same submission should not get two
# different verdicts. The output ceiling is generous because the stock presets
# cap at 1024 tokens, which truncates a five-criterion answer mid-JSON and throws
# the whole (expensive, multimodal) call away as unparseable.
GENERATION_CONFIG = {
    'temperature': 0.2,
    'top_p': 0.8,
    'max_output_tokens': 8192,
}


class CreditAIReviewService(BaseAIService):
    """Reads a credit submission and proposes a verdict. Awards nothing."""

    def __init__(self, admin=None):
        super().__init__()
        self._admin = admin

    @property
    def admin(self):
        if self._admin is None:
            # admin client justified: background worker with no request user;
            # reads one submission and writes only its own credit_ai_reviews row.
            from database import get_supabase_admin_client
            self._admin = get_supabase_admin_client()
        return self._admin

    # ── entry point ──────────────────────────────────────────────────────────

    def run(self, review_id: str) -> Dict[str, Any]:
        """Claim and run one queued review. Returns a small status dict.

        Never raises: this runs on a background thread where an exception is a
        row stuck in 'running' forever and a submission nobody reads.
        """
        token = store.claim(self.admin, review_id)
        if not token:
            # Somebody else has it. Ordinary, not an error.
            return {'status': 'not_claimed', 'review_id': review_id}

        row = store.get(self.admin, review_id) or {}
        attempts = int(row.get('attempts') or 0) + 1

        try:
            return self._run_claimed(review_id, token, row, attempts)
        except Exception as e:  # noqa: BLE001
            report_error(e, 'AI credit review failed',
                         review_id=review_id,
                         completion_id=row.get('completion_id'),
                         round_id=row.get('round_id'))
            store.store_failure(self.admin, review_id, token,
                                error=str(e), retryable=False, attempts=attempts)
            return {'status': 'failed', 'review_id': review_id, 'error': str(e)}
        finally:
            # Evidence bytes are the biggest thing this process holds, and two
            # reviews can run at once on a 512MB container.
            gc.collect()

    def _run_claimed(self, review_id: str, token: str, row: Dict[str, Any],
                     attempts: int) -> Dict[str, Any]:
        context = self._load_context(row)
        if context is None:
            store.store_skipped(self.admin, review_id, token,
                                reason='completion_not_pending',
                                detail='The submission is no longer waiting for review.')
            return {'status': 'skipped', 'reason': 'completion_not_pending'}

        # Consent first, before a single byte of the student's work is read.
        denial = self._consent_denial(context['student_id'])
        if denial:
            code = (denial or {}).get('code') or 'AI_DISABLED'
            logger.info(f'AI credit review skipped for {review_id[:8]}: {code}')
            store.store_skipped(
                self.admin, review_id, token,
                reason='ai_disabled_for_student',
                detail=denial.get('message'),
                review=skipped_review(
                    reason='ai_disabled_for_student',
                    detail='AI review is turned off for this student.'))
            return {'status': 'skipped', 'reason': 'ai_disabled_for_student'}

        load = evidence_loader.load_evidence(context['snapshot'], admin=self.admin)
        try:
            return self._review_with(review_id, token, context, load, attempts)
        finally:
            evidence_loader.release(load)

    def _review_with(self, review_id: str, token: str, context: Dict[str, Any],
                     load: evidence_loader.LoadResult, attempts: int) -> Dict[str, Any]:
        criteria, criteria_source = prompt_mod.criteria_for(context['task'])

        if not load.anything_readable:
            # Nothing to look at. Asking anyway would produce a verdict formed
            # from the task description alone, which is a guess wearing a
            # checklist -- and it would cost a multimodal call to produce.
            store.store_skipped(
                self.admin, review_id, token,
                reason='no_readable_evidence',
                detail='None of the submitted evidence could be read.',
                review=skipped_review(reason='no_readable_evidence', load=load,
                                      criteria_source=criteria_source))
            return {'status': 'skipped', 'reason': 'no_readable_evidence'}

        text = prompt_mod.build_prompt(
            quest=context['quest'], task=context['task'],
            criteria=criteria, criteria_source=criteria_source,
            requested_xp=context['requested_xp'], subjects=context['subjects'],
            load=load, resubmission=context.get('resubmission'))
        parts = prompt_mod.build_parts(text, load)

        try:
            result = self.generate_json_multimodal(
                parts,
                generation_config=GENERATION_CONFIG,
                response_schema=RESPONSE_SCHEMA,
                timeout=Config.CREDIT_AI_REVIEW_TIMEOUT,
            )
        except AICreditsExhaustedError as e:
            # Account-wide and permanent until somebody tops up billing. Retrying
            # burns the budget on a call that cannot succeed.
            store.store_failure(self.admin, review_id, token, error=str(e),
                                retryable=False, attempts=attempts)
            return {'status': 'failed', 'reason': 'credits_exhausted'}
        except (AIServiceOverloadedError, AIParsingError) as e:
            store.store_failure(self.admin, review_id, token, error=str(e),
                                retryable=True, attempts=attempts)
            return {'status': 'retry', 'reason': type(e).__name__}

        review = normalize_review(
            result.data,
            criteria=criteria, criteria_source=criteria_source, load=load,
            requested_xp=context['requested_xp'],
            resubmission=context.get('resubmission'),
            model=result.model_name,
            extra_flags=result.notes)

        usage = {
            'model': result.model_name,
            'input_tokens': result.input_tokens,
            'output_tokens': result.output_tokens,
            'elapsed_ms': result.elapsed_ms,
            'attempts': result.attempts,
            'schema_used': result.schema_used,
            **load.stats(),
        }
        store.store_complete(self.admin, review_id, token, review=review,
                             model=result.model_name,
                             prompt_version=prompt_mod.PROMPT_VERSION, usage=usage)

        logger.info(
            f'AI credit review {review_id[:8]} complete: {review["recommendation"]} '
            f'({review["confidence"]:.0%}), {load.stats()["read"]}/{load.stats()["items"]} '
            f'pieces read, {result.input_tokens or 0} in / {result.output_tokens or 0} out '
            f'tokens on {result.model_name}')
        return {'status': 'complete', 'recommendation': review['recommendation']}

    # ── context ──────────────────────────────────────────────────────────────

    def _consent_denial(self, student_id: Optional[str]) -> Optional[Dict[str, Any]]:
        """The student's AI toggles, checked strictly.

        strict=True because nobody is waiting: an unknown answer costs a retry,
        while guessing "allowed" costs a child's evidence leaving the platform
        against their parent's setting.
        """
        if not student_id:
            return None
        from utils.ai_access import check_ai_access
        has_access, denial, _ = check_ai_access(student_id, strict=True)
        return None if has_access else (denial or {})

    def _load_context(self, row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Everything the prompt needs, and nothing that identifies the student.

        ``student_id`` is carried for the consent check alone. It never reaches
        prompt.build_prompt, and tests assert as much.
        """
        completion_id = row.get('completion_id')
        round_id = row.get('round_id')
        if not completion_id or not round_id:
            return None

        completions = self.admin.table('quest_task_completions').select(
            'id, user_id, quest_id, user_quest_task_id, diploma_status, revision_number'
        ).eq('id', completion_id).limit(1).execute().data
        if not completions:
            return None
        completion = completions[0]

        if completion.get('diploma_status') not in store.REVIEWABLE_STATUSES:
            return None

        rounds = self.admin.table('diploma_review_rounds').select(
            'id, round_number, evidence_snapshot, subject_suggestion, '
            'reviewer_action, reviewer_feedback, org_reviewer_action, org_reviewer_feedback'
        ).eq('completion_id', completion_id).order('round_number').execute().data or []

        this_round = next((r for r in rounds if r['id'] == round_id), None)
        if this_round is None:
            return None

        task: Dict[str, Any] = {}
        if completion.get('user_quest_task_id'):
            tasks = self.admin.table('user_quest_tasks').select(
                'id, title, description, success_criteria, pillar, xp_value, '
                'diploma_subjects, subject_xp_distribution'
            ).eq('id', completion['user_quest_task_id']).limit(1).execute().data
            task = tasks[0] if tasks else {}

        quest: Dict[str, Any] = {}
        if completion.get('quest_id'):
            quests = self.admin.table('quests').select(
                'id, title, description').eq('id', completion['quest_id']).limit(1).execute().data
            quest = quests[0] if quests else {}

        from utils.subject_xp import get_subject_xp_distribution
        requested_xp = int(task.get('xp_value') or 0)
        subjects = get_subject_xp_distribution(task, requested_xp) if task else {}

        snapshot = this_round.get('evidence_snapshot') or []
        if not isinstance(snapshot, list):
            snapshot = []

        return {
            'completion': completion,
            'student_id': completion.get('user_id'),
            'round': this_round,
            'task': task,
            'quest': quest,
            'requested_xp': requested_xp,
            'subjects': subjects,
            'snapshot': snapshot,
            'resubmission': _resubmission_context(this_round, rounds),
        }


def _resubmission_context(this_round: Dict[str, Any],
                          rounds: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """What changed since the last time a human looked at this.

    Diffed on what each piece of evidence IS -- its storage path, its link, a
    hash of its text -- not on block ids. A resubmission rewrites the block rows
    (evidence_documents.py deletes and reinserts them to dodge a uniqueness
    constraint), so every id changes even when the student changed nothing.
    """
    round_number = this_round.get('round_number') or 1
    if round_number <= 1:
        return None

    prior_rounds = [r for r in rounds
                    if (r.get('round_number') or 0) < round_number]
    if not prior_rounds:
        return None

    previous = prior_rounds[-1]
    prior_notes = []
    for r in prior_rounds:
        action = r.get('reviewer_action') or r.get('org_reviewer_action')
        feedback = r.get('reviewer_feedback') or r.get('org_reviewer_feedback')
        if action or feedback:
            prior_notes.append({
                'round_number': r.get('round_number'),
                'action': action,
                'feedback': feedback,
            })

    added, changed, removed = _diff_snapshots(
        previous.get('evidence_snapshot') or [],
        this_round.get('evidence_snapshot') or [])

    return {
        'round_number': round_number,
        'prior': prior_notes,
        'added': added,
        'changed': changed,
        'removed': removed,
    }


def _diff_snapshots(before: Any, after: Any):
    """(added block numbers, changed block numbers, count of removed pieces).

    "Added" is a block whose every piece is new. "Changed" is a block that kept
    something and gained something -- a student who added a photo to the
    reflection they already wrote. Told apart because the two deserve different
    reads: a changed block is where the previous feedback was probably answered.
    """
    from utils.evidence_labels import block_items

    def by_block(snapshot: Any):
        out = {}
        if not isinstance(snapshot, list):
            return out
        for index, block in enumerate(snapshot, start=1):
            if not isinstance(block, dict):
                continue
            out[index] = {evidence_loader.item_fingerprint(item)
                          for item in block_items(block.get('content'))}
        return out

    old_blocks = by_block(before)
    new_blocks = by_block(after)
    old_all = set().union(*old_blocks.values()) if old_blocks else set()
    new_all = set().union(*new_blocks.values()) if new_blocks else set()

    added, changed = [], []
    for index, prints in new_blocks.items():
        fresh = prints - old_all
        if not fresh:
            continue
        (added if fresh == prints else changed).append(index)

    removed = sorted(old_all - new_all)
    return sorted(added), sorted(changed), removed
