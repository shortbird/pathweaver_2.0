"""
Teacher acceptance: a school may hold a task's XP, and keep the work off the
student's portfolio, until a teacher accepts it in SIS Submissions.

Ticket 536a3018, Jackie Hill (Arete Academy org admin): "Can you also make it
so the evidence submissions are not on their portfolios until I approve it?
And also have the xp not be awarded until it's approved?"

The switch is feature_flags.sis_settings.require_teacher_acceptance. Only a
stored True turns it on, so every school that has not turned it on behaves
exactly as before. Platform students (no organization) are never held.

How a hold works (quest_task_completions.xp_held_at, migration
20261016120000_task_xp_held_for_acceptance.sql):

  - At completion the row is created as always, award_xp is skipped, and
    xp_held_at is stamped. The student is told the XP comes when a teacher
    accepts the work.
  - Accept in Submissions (single or bulk) claims the hold with one
    conditional UPDATE (xp_held_at IS NOT NULL -> NULL, xp_released_at = now)
    and only the request that won the claim awards the XP. A repeat accept
    finds nothing to claim, so the XP is awarded once.
  - Grow This on held work leaves it held. Grow This or an un-review after an
    accept takes the XP back and holds the row again -- but only for a row an
    accept released (xp_released_at set). Work completed or accepted before
    the school turned this on was never held, has no xp_released_at, and is
    never touched: the settings card promises exactly that.

Every read of xp_held_at here tolerates a database without the column (it
returns "nothing held"), and a hold that cannot be written falls back to
awarding the XP as before. Until the migration is applied the feature is
inert rather than broken, and no XP is ever skipped without a marker that an
accept can find later.

Bloomy sync (services/bloomy_sync_service.py) awards on its own path and is
exempt on purpose: Bloomy already assessed the work.
"""

from typing import Any, Dict, Optional, Set

from repositories.completion_hold_repository import CompletionHoldRepository
from utils.logger import get_logger
from utils.timestamps import now_iso as _now

logger = get_logger(__name__)

#: feature_flags.sis_settings key. Off unless a school turns it on.
REQUIRE_TEACHER_ACCEPTANCE_KEY = 'require_teacher_acceptance'

#: What the student is told when their XP waits on a teacher. The web and
#: mobile apps carry the same sentence.
PENDING_REVIEW_MESSAGE = 'Sent to your teacher. You get the XP when they accept it.'

#: The default pillar of the task completion route, used when a task row has
#: none (routes/tasks/completion.py).
DEFAULT_PILLAR = 'stem'


# ── the setting ──────────────────────────────────────────────────────────────

def with_pending_review(payload: Dict[str, Any], pending: bool) -> Dict[str, Any]:
    """A task-completion response, told that its XP waits for a teacher when
    it does. Both evidence completion paths answer with it."""
    if pending:
        payload.update({'message': PENDING_REVIEW_MESSAGE, 'xp_pending_review': True})
    return payload


def requires_teacher_acceptance(flags: Optional[Dict[str, Any]]) -> bool:
    """Is the school's switch on? Only a stored True counts."""
    sis = (flags or {}).get('sis_settings') if isinstance(flags, dict) else None
    return isinstance(sis, dict) and sis.get(REQUIRE_TEACHER_ACCEPTANCE_KEY) is True


def org_requires_acceptance(org_id: Optional[str]) -> bool:
    """The switch for one org. False for no org or a failed read, and False
    while the school's Submissions module is off: held work needs a screen
    where a teacher can accept it, or its XP would never arrive."""
    if not org_id:
        return False
    from modules.enabled import module_enabled_for_row, org_flags
    flags = org_flags(org_id)
    return (requires_teacher_acceptance(flags)
            and module_enabled_for_row({'feature_flags': flags}, 'submissions'))


def student_org_id(client, user_id: str) -> Optional[str]:
    """The student's organization, or None for a platform student."""
    try:
        return CompletionHoldRepository(client).organization_of(user_id)
    except Exception as e:  # noqa: BLE001 -- a failed read means "not held", the old behaviour
        logger.warning(f'Could not read organization for {str(user_id)[:8]}: {e}')
        return None


def student_requires_acceptance(client, user_id: str) -> bool:
    """Must this student's task XP wait for a teacher?"""
    return org_requires_acceptance(student_org_id(client, user_id))


# ── awarding (one code path for completion and accept) ───────────────────────

def award_task_completion_xp(xp_service, user_id: str, pillar: str,
                             xp: int, task_id: str) -> bool:
    """Award a task's XP exactly as the completion routes always have.

    The completion routes and the accept both call this, so XP awarded at
    accept is indistinguishable from XP awarded at completion (same pillar,
    amount and audit source).
    """
    return xp_service.award_xp(user_id, pillar, xp, f'task_completion:{task_id}')


def hold_completion(client, completion_id: Optional[str]) -> bool:
    """Stamp xp_held_at on a new completion. False when it could not be
    written; the caller then awards the XP as before, so no XP is ever
    skipped without a marker."""
    if not completion_id:
        return False
    try:
        return CompletionHoldRepository(client).stamp_hold(completion_id, _now())
    except Exception as e:  # noqa: BLE001
        logger.error(f'Could not hold XP on completion {completion_id}: {e}')
        return False


def release_held_xp(client, completion_id: str, xp_service=None) -> int:
    """Accept: award the XP a hold kept back. Returns the XP awarded, 0 when
    the row was not held (never held, or already released).

    The claim is one conditional UPDATE, so two accepts at once cannot both
    award. If the award itself fails the row is held again, and the next
    accept retries it.
    """
    repo = CompletionHoldRepository(client)
    try:
        row = repo.claim_release(completion_id, _now())
    except Exception as e:  # noqa: BLE001 -- no column yet means nothing is held
        logger.warning(f'Could not claim held XP on {completion_id}: {e}')
        return 0
    if not row:
        return 0
    task_id = row.get('user_quest_task_id') or row.get('task_id')
    if not task_id:
        return 0
    task = repo.task(task_id)
    xp = int(task.get('xp_value') or 0)
    if xp <= 0:
        return 0
    if xp_service is None:
        from services.xp_service import XPService
        xp_service = XPService()
    try:
        ok = award_task_completion_xp(xp_service, row['user_id'],
                                      task.get('pillar') or DEFAULT_PILLAR, xp, task_id)
    except Exception as e:  # noqa: BLE001
        logger.error(f'Award failed releasing held XP on {completion_id}: {e}')
        ok = False
    if not ok:
        try:
            repo.restore_hold(completion_id, _now())
        except Exception as e:  # noqa: BLE001
            logger.error(f'Could not re-hold {completion_id} after a failed award: {e}')
        return 0
    return xp


def rehold_released_xp(client, completion_id: str) -> int:
    """Un-review or Grow This after an accept: take back the XP that accept
    gave and hold the row again. Only a row an accept released is touched.
    Returns the XP reversed."""
    repo = CompletionHoldRepository(client)
    try:
        row = repo.claim_rehold(completion_id, _now())
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not re-hold {completion_id}: {e}')
        return 0
    if not row:
        return 0
    task_id = row.get('user_quest_task_id') or row.get('task_id')
    if not task_id:
        return 0
    from utils.xp_reversal import reverse_task_xp
    return reverse_task_xp(client, row['user_id'], task_id, task=repo.task(task_id))


# ── reads: what is held ──────────────────────────────────────────────────────

def held_completions(client, user_id: str) -> Dict[str, Optional[str]]:
    """{completion_id: user_quest_task_id} of this student's held work.
    Bounded by one student. Empty when the column does not exist yet."""
    try:
        rows = CompletionHoldRepository(client).held_for_user(user_id)
    except Exception as e:  # noqa: BLE001
        logger.debug(f'held_completions read skipped for {str(user_id)[:8]}: {e}')
        return {}
    return {r['id']: r.get('user_quest_task_id') for r in rows if r.get('id')}


def is_held(client, completion_id: str) -> bool:
    try:
        return CompletionHoldRepository(client).is_held(completion_id)
    except Exception as e:  # noqa: BLE001
        logger.debug(f'is_held read skipped for {completion_id}: {e}')
        return False


def held_task_ids(held: Dict[str, Optional[str]]) -> Set[str]:
    return {t for t in held.values() if t}


# ── resubmission ─────────────────────────────────────────────────────────────

def reopen_sent_back_review(client, user_id: str, task_id: str) -> bool:
    """A student saved evidence again on work a teacher sent back (Grow
    This): put it back in New so the teacher sees the revision. Only at a
    school with the switch on; elsewhere the review stays as it was. Best
    effort: the save has already happened. Returns True when reopened."""
    repo = CompletionHoldRepository(client)
    try:
        completion_id = repo.completion_id_for_task(user_id, task_id)
        if not completion_id or repo.review_action(completion_id) != 'grow_this':
            return False
        if not student_requires_acceptance(client, user_id):
            return False
        repo.delete_grow_this_review(completion_id)
        return True
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not reopen the review for task {str(task_id)[:8]}: {e}')
        return False
