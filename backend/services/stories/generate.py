"""One story, start to finish, on a background thread.

    claim -> gates -> tier -> load -> image safety -> draft -> text safety
          -> assemble -> (auto: publish | review: park)

The gates run before a byte of evidence is read, in this order, and each has
its own reason so the grader can say why:

    source_not_finalized   the submission is not finalized / the quest not complete
    merged                 the completion was merged into a newer one
    confidential           the student marked it confidential
    org_student_phase2     org students wait for the org opt-in (Phase 2)
    ai_disabled            the family switched AI off for this student

The AI-consent gate sits before the load for the same reason it does in the
credit reviewer: a parent who switched AI off did not agree to their child's
photographs being pulled out of storage so a model could look at them.

Copied from credit_ai_review/trigger.py: a bounded semaphore, a daemon thread
that carries the app context, and a cron sweep that requeues anything a dead
worker left claiming to be `generating`. `run` never raises.
"""

from __future__ import annotations

import gc
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from app_config import Config
from utils.error_reporting import report_error
from utils.logger import get_logger
from utils.timestamps import now_iso

from services.stories import anonymize, drafter as drafter_mod, publish, safety
from services.stories.consent_service import scope_of, tier_for
from services.stories.source import StorySource, scrubber_for
from services.stories.source_completion import SourceNotFound
from services.stories.source_quest import QuestNotComplete

logger = get_logger(__name__)

#: Same ceiling as the credit reviewer, and the same reason: each story holds
#: its evidence bytes in memory on a 512MB container.
_SLOTS = threading.BoundedSemaphore(max(1, int(Config.CREDIT_AI_REVIEW_MAX_INPROC)))

#: A worker abandoned this long ago is dead. Longer than the reviewer's window:
#: a story makes up to three model calls (safety, draft, text) plus the copies.
STALE_MINUTES = 30
MAX_ATTEMPTS = 2


class Refused(Exception):
    """A gate said no. `code` is what the row's blockers will say."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def enabled() -> bool:
    return bool(Config.STORIES_ENABLED)


# ── threads ──────────────────────────────────────────────────────────────────

def kick_background(story_ids: List[str], admin=None) -> bool:
    """Draft these stories on a daemon thread. False if there was no slot.

    False is not a failure: the rows stay `generating` and unclaimed, and the
    cron sweep picks them up.
    """
    ids = [s for s in (story_ids or []) if s]
    if not ids or not enabled():
        return False
    if not _SLOTS.acquire(blocking=False):
        logger.info(f'Stories: no worker slot, leaving {len(ids)} for the sweep')
        return False

    app = None
    try:
        from flask import current_app
        app = current_app._get_current_object()  # type: ignore[attr-defined]
    except (RuntimeError, AttributeError):
        app = None

    thread = threading.Thread(target=_run_batch, args=(ids, app, admin),
                              name='story-draft', daemon=True)
    thread.start()
    return True


def _run_batch(story_ids: List[str], app, admin) -> None:
    try:
        if app is not None:
            with app.app_context():
                _run_each(story_ids, admin)
        else:
            _run_each(story_ids, admin)
    finally:
        _SLOTS.release()


def _run_each(story_ids: List[str], admin) -> None:
    for story_id in story_ids:
        try:
            run(story_id, admin=admin)
        except Exception as e:  # noqa: BLE001
            logger.error(f'Story {str(story_id)[:8]} raised: {e}')


# ── the run ──────────────────────────────────────────────────────────────────

def _repos(admin=None):
    from repositories.story_asset_repository import StoryAssetRepository
    from repositories.story_repository import StoryRepository
    return StoryRepository(client=admin), StoryAssetRepository(client=admin)


def run(story_id: str, *, admin=None) -> Dict[str, Any]:
    """Claim and draft one story. Never raises."""
    story_repo, asset_repo = _repos(admin)
    token = str(uuid.uuid4())
    if not story_repo.claim_generating(story_id, token, now_iso()):
        return {'status': 'not_claimed', 'story_id': story_id}

    row = story_repo.get(story_id) or {}
    attempts = int(row.get('attempts') or 0) + 1
    try:
        return _run_claimed(row, token, attempts, story_repo=story_repo,
                            asset_repo=asset_repo, admin=admin)
    except Refused as r:
        story_repo.finish(story_id, token, {
            'status': 'failed', 'attempts': attempts, 'claim_token': None,
            'error': r.message[:500],
            'blockers': [{'code': r.code, 'field': 'source', 'message': r.message}],
        })
        logger.info(f'Story {story_id[:8]} refused: {r.code}')
        return {'status': 'failed', 'reason': r.code}
    except Exception as e:  # noqa: BLE001
        report_error(e, 'Story generation failed', story_id=story_id,
                     source_type=row.get('source_type'))
        story_repo.finish(story_id, token, {
            'status': 'failed', 'attempts': attempts, 'claim_token': None,
            'error': str(e)[:500],
        })
        return {'status': 'failed', 'error': str(e)}
    finally:
        gc.collect()


def _gate(row: Dict[str, Any], *, source_repo) -> Dict[str, Any]:
    """The cheap checks, before anything is downloaded. Returns the student row."""
    source_type, source_id = row.get('source_type'), row.get('source_id')
    if source_type == 'credit_submission':
        completion = source_repo.completion(source_id)
        if not completion:
            raise Refused('source_not_found', 'The submission no longer exists.')
        if completion.get('diploma_status') != 'finalized':
            raise Refused('source_not_finalized', 'The submission is not finalized.')
        if completion.get('merged_into'):
            raise Refused('merged', 'The submission was merged into a newer one.')
        if completion.get('is_confidential'):
            raise Refused('confidential', 'The student marked this submission confidential.')
        student_id = completion.get('user_id')
    elif source_type == 'quest':
        from services.stories import source_quest
        user_quest = source_repo.user_quest(source_id)
        if not user_quest:
            raise Refused('source_not_found', 'The quest enrolment no longer exists.')
        completions, tasks = source_quest.finalized_completions(source_repo, source_id)
        if not source_quest.is_complete(user_quest, tasks, completions) or not completions:
            raise Refused('source_not_finalized', 'The quest is not complete.')
        if any(c.get('is_confidential') for c in completions):
            raise Refused('confidential', 'A submission in this quest is confidential.')
        student_id = user_quest.get('user_id')
    else:
        raise Refused('unsupported_source', f'Cannot draft a story from {source_type}.')

    student = source_repo.student(student_id) if student_id else None
    if not student:
        raise Refused('source_not_found', 'The student no longer exists.')
    if student.get('organization_id'):
        raise Refused('org_student_phase2',
                      'Org students are not included until the org opt-in exists.')

    from utils.ai_access import check_ai_access
    has_access, denial, _ = check_ai_access(student_id, strict=True)
    if not has_access:
        raise Refused('ai_disabled', (denial or {}).get('message') or
                      'AI features are off for this student.')
    return student


def _load(row: Dict[str, Any], *, admin) -> StorySource:
    from services.stories import source_completion, source_quest
    try:
        if row.get('source_type') == 'quest':
            return source_quest.load(row['source_id'], admin=admin)
        return source_completion.load(row['source_id'], admin=admin)
    except SourceNotFound as e:
        raise Refused('source_not_found', str(e)) from e
    except QuestNotComplete as e:
        raise Refused('source_not_finalized', str(e)) from e


def _run_claimed(row: Dict[str, Any], token: str, attempts: int, *,
                 story_repo, asset_repo, admin) -> Dict[str, Any]:
    from repositories.promotional_consent_repository import PromotionalConsentRepository
    from repositories.story_source_repository import StorySourceRepository

    story_id = row['id']
    source_repo = StorySourceRepository(client=admin)
    student = _gate(row, source_repo=source_repo)

    consent = PromotionalConsentRepository(client=admin).active_for_student(student['id'])
    tier = tier_for(consent)
    scope = scope_of(consent)

    source = _load(row, admin=admin)
    try:
        scrubber = scrubber_for(source.student)
        label = anonymize.student_label(
            tier, scope, source.student.first_name, source.student.grade_band,
            anonymize.age_at(source.student.date_of_birth))

        candidates = source.image_candidates
        verdicts = safety.check_images(candidates, tier=tier, scope=scope, scrubber=scrubber)
        safe_ids = {v.index for v in verdicts if v.safe}
        safe_images = [c for c in candidates if c.index in safe_ids]

        draft = drafter_mod.StoryDrafter().draft(
            source, student_label=label, safe_images=safe_images, tier=tier)
        assembled = drafter_mod.assemble(
            source, draft, student_label=label, tier=tier, verdicts=verdicts,
            scrubber=scrubber, slug_exists=story_repo.slug_exists, story_id=story_id)
    finally:
        source.release_images()

    fields = assembled['story']
    checked, text_report = safety.check_text(
        {k: fields.get(k) for k in ('title', 'dek', 'body', 'activity_label', 'receipt')},
        scrubber)
    fields.update(checked)

    safety_record = {
        'images': [v.safety_record() for v in verdicts],
        'text': text_report,
        'tier': tier,
        'checked_at': now_iso(),
    }
    asset_repo.replace_for_story(story_id, assembled['assets'])

    update = {
        **fields,
        'consent_id': (consent or {}).get('id'),
        'tier': tier,
        'safety': safety_record,
        'status': 'review',
        'blockers': [],
        'error': None,
        'attempts': attempts,
        'claim_token': None,
    }
    if not story_repo.finish(story_id, token, update):
        logger.warning(f'Story {story_id[:8]} was re-claimed while drafting; discarding')
        return {'status': 'lost_claim'}

    if row.get('mode') == 'auto':
        outcome = publish.auto_publish(story_id, admin=admin)
        return {'status': outcome.get('status'), 'blockers': outcome.get('blockers')}

    # Review mode: compute the blockers so the editor sees them, publish nothing.
    story = story_repo.get(story_id) or {**row, **update}
    story, assets = publish.apply_verdicts(story, asset_repo.for_story(story_id),
                                           asset_repo=asset_repo, story_repo=story_repo)
    found = publish.blockers(story, assets)
    story_repo.patch(story_id, {'blockers': found})
    return {'status': 'review', 'blockers': found}


# ── the sweep ────────────────────────────────────────────────────────────────

def requeue_stale(admin=None, *, stale_minutes: int = STALE_MINUTES) -> int:
    """Rows claiming to be generating for too long go back to the queue once."""
    story_repo, _ = _repos(admin)
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=stale_minutes)).isoformat()
    requeued = 0
    for row in story_repo.generating_since_before(cutoff):
        attempts = int(row.get('attempts') or 0) + 1
        if attempts >= MAX_ATTEMPTS:
            story_repo.release_if_generating(row['id'], {
                'status': 'failed', 'attempts': attempts, 'claim_token': None,
                'error': 'Abandoned mid-draft too many times.',
            })
        else:
            story_repo.release_if_generating(row['id'], {
                'attempts': attempts, 'claim_token': None, 'started_at': None,
            })
        requeued += 1
    if requeued:
        logger.warning(f'Requeued {requeued} abandoned story draft(s)')
    return requeued


def sweep(admin=None) -> Dict[str, Any]:
    """One cron tick: requeue the abandoned, kick the unclaimed. Returns fast."""
    if not enabled():
        return {'disabled': True}
    story_repo, _ = _repos(admin)
    requeued = requeue_stale(admin)
    picked = story_repo.unclaimed_generating_ids()
    started = kick_background(picked, admin=admin) if picked else False
    return {'requeued_stale': requeued, 'picked': len(picked), 'started': started}
