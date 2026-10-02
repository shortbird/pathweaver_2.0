"""Moving one quest's credit from one diploma subject to another.

Kristine Waechtler (Optio Academy), 2026-10-02: her daughter's Archery quest
earned Electives credit and belongs in PE. Nothing let anyone fix that short of
editing five tables by hand, because by the time anyone asks, a subject has
been written in several places:

  diploma_review_rounds.approved_subjects   what a reviewer approved, per
                                            completion. Courses and Credits
                                            and the transcript read it.
  diploma_review_rounds.subject_suggestion  what a pending request put into
                                            pending_xp. The approval takes it
                                            back out by this split
                                            (utils.subject_xp.pending_subjects_for_completion).
  user_quest_tasks.subject_xp_distribution  the task's own split, and the
  user_quest_tasks.diploma_subjects         default an approval credits; the
                                            column defaults to ['Electives'].
  user_subject_xp.xp_amount / pending_xp    the totals the diploma tracker
                                            and the transcript read.
  quests.transcript_subject                 an own-curriculum course's subject.

move_quest_subject_credit rewrites all of them for one student and one quest.
It moves only the from_subject share: an interdisciplinary task keeps its
other subjects as they are. It is idempotent -- the records it renames are
also how it knows what is left to move, so a second run finds nothing -- and
it never creates credit: user_subject_xp is moved by what the old subject
actually held, so a ledger already short of what the records say is clamped
(and logged, and recorded on the audit row) instead of going negative.

Order of writes: the records first, the ledger last. A run that dies between
the two leaves the ledger unmoved while the records say the move happened,
and a re-run will not see it (scripts/repair_pending_subject_xp.py is the
reconciler for that shape). The other order would double-move on a re-run,
which is worse: inflated credit looks correct.

No Flask here: a superadmin script calls this directly for bulk fixes.

    from utils.admin_client import admin_client
    from services.subject_credit_move_service import move_quest_subject_credit
    result = move_quest_subject_credit(admin_client(), student_id, quest_id,
                                       'electives', 'pe', actor_id, reason='...',
                                       dry_run=True)

The family request and the Optio decision around it are the second half of
this module (create_move_request ... decline_move_request).
"""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from repositories.subject_credit_move_repository import SubjectCreditMoveRepository
from utils.class_credits import is_own_curriculum
from utils.logger import get_logger
from utils.school_subjects import SCHOOL_SUBJECTS, get_display_name, normalize_subject_key
from utils.subject_xp import SUBJECT_NORMALIZATION, get_subject_xp_distribution
from utils.timestamps import now_iso

logger = get_logger(__name__)

PENDING_STATUSES = ('pending_review', 'pending_org_approval')
MAX_TEXT = 1000


class SubjectMoveError(ValueError):
    """A move or request the service refuses. `code` is the API error code."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


@dataclass
class SubjectMoveResult:
    student_id: str
    quest_id: str
    from_subject: str
    to_subject: str
    dry_run: bool = False
    finalized_xp: int = 0
    pending_xp: int = 0
    finalized_completions: List[str] = field(default_factory=list)
    pending_completions: List[str] = field(default_factory=list)
    tasks_updated: List[str] = field(default_factory=list)
    transcript_subject_changed: bool = False
    transcript_subject_skipped: Optional[str] = None
    clamped: Dict[str, int] = field(default_factory=dict)
    audit_written: bool = False

    @property
    def total_xp(self) -> int:
        return self.finalized_xp + self.pending_xp

    @property
    def changed_anything(self) -> bool:
        return bool(self.finalized_completions or self.pending_completions
                    or self.tasks_updated or self.transcript_subject_changed)

    def to_dict(self) -> Dict[str, Any]:
        out = asdict(self)
        out['total_xp'] = self.total_xp
        return out


# --------------------------------------------------------------------------
# Subject keys
# --------------------------------------------------------------------------

def canonical_subject(key: Any) -> Any:
    """A subject key in its canonical form ('Electives' -> 'electives').

    Prod holds both forms: thousands of diploma_subjects rows carry display
    names ("Language Arts", "PE", "Career & Technical Education"). A key no
    rule recognises ('construction_technology') is returned unchanged, so a
    rewrite never drops it.
    """
    if not isinstance(key, str):
        return key
    return normalize_subject_key(key) or SUBJECT_NORMALIZATION.get(key) or key


def _valid_subject(value: Any, field_name: str) -> str:
    key = canonical_subject((value or '').strip()) if isinstance(value, str) else None
    if key not in SCHOOL_SUBJECTS:
        raise SubjectMoveError('INVALID_SUBJECT', f'{field_name} is not a diploma subject.')
    return key


def _amount(value: Any) -> int:
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return 0


def rename_subject(split: Any, from_subject: str, to_subject: str) -> Tuple[Any, int, bool]:
    """Rename from_subject to to_subject in one split, merging into to_subject.

    Handles both shapes the columns hold: a dict of subject -> amount, and a
    list of subjects (diploma_subjects' legacy form). Keys are matched and
    written in canonical form. Returns (new_split, amount_moved, changed);
    when from_subject is not in the split it comes back untouched with
    changed False, so a record is only ever rewritten by a real move.
    For a list the amount is 0 -- a list carries no amounts.
    """
    if isinstance(split, dict):
        if not any(canonical_subject(k) == from_subject for k in split):
            return split, 0, False
        merged: Dict[str, Any] = {}
        moved = 0
        for key, value in split.items():
            canon = canonical_subject(key)
            if canon == from_subject:
                moved += _amount(value)
                canon = to_subject
            if canon in merged and isinstance(merged[canon], (int, float)) and isinstance(value, (int, float)):
                merged[canon] = merged[canon] + value
            else:
                merged[canon] = value
        return merged, moved, True
    if isinstance(split, list):
        if not any(canonical_subject(k) == from_subject for k in split):
            return split, 0, False
        out: List[Any] = []
        for key in split:
            canon = canonical_subject(key)
            if canon == from_subject:
                canon = to_subject
            if canon not in out:
                out.append(canon)
        return out, 0, True
    return split, 0, False


# --------------------------------------------------------------------------
# The move
# --------------------------------------------------------------------------

def move_quest_subject_credit(db, student_id: str, quest_id: str, from_subject: str,
                              to_subject: str, actor_id: Optional[str], reason: Optional[str] = None,
                              *, request_id: Optional[str] = None,
                              dry_run: bool = False) -> SubjectMoveResult:
    """Move this student's credit on this quest from from_subject to to_subject.

    Args:
        db: a Supabase client that can write these tables (the service role).
        student_id: whose credit.
        quest_id: the quest whose share moves. Other quests are untouched.
        from_subject, to_subject: subject keys; display names are accepted.
        actor_id: who made the move, for the audit row (a reviewer, or the
            superadmin running a script). None is allowed for a script.
        reason: free text for the audit row.
        request_id: the family request this move answers, if any.
        dry_run: compute and return what would move, write nothing.

    Raises:
        SubjectMoveError: bad subjects, the same subject twice, or no quest.
    """
    from_key = _valid_subject(from_subject, 'from_subject')
    to_key = _valid_subject(to_subject, 'to_subject')
    if from_key == to_key:
        raise SubjectMoveError('SAME_SUBJECT', 'Pick a different subject to move the credit to.')

    repo = SubjectCreditMoveRepository(client=db)
    quest = repo.quest(quest_id)
    if not quest:
        raise SubjectMoveError('QUEST_NOT_FOUND', 'That quest was not found.', status=404)

    result = SubjectMoveResult(student_id=student_id, quest_id=quest_id,
                               from_subject=from_key, to_subject=to_key, dry_run=dry_run)

    completions = repo.completions(student_id, quest_id)
    rounds = repo.rounds([c['id'] for c in completions])
    latest_round: Dict[str, Dict[str, Any]] = {}
    latest_approved: Dict[str, Dict[str, Any]] = {}
    for r in rounds:  # newest first
        latest_round.setdefault(r['completion_id'], r)
        if r.get('reviewer_action') == 'approved' and isinstance(r.get('approved_subjects'), dict):
            latest_approved.setdefault(r['completion_id'], r)
    tasks = {t['id']: t for t in repo.tasks(student_id, quest_id)}

    round_writes: List[Tuple[str, Dict[str, Any]]] = []
    for c in completions:
        status = c.get('diploma_status')
        task = tasks.get(c.get('user_quest_task_id')) or {}
        if status == 'finalized':
            approved = latest_approved.get(c['id'])
            if approved:
                new, moved, changed = rename_subject(approved['approved_subjects'], from_key, to_key)
                if changed:
                    round_writes.append((approved['id'], {'approved_subjects': new}))
            else:
                # No approved split on record (older approvals): the task's own
                # split is what Courses and Credits shows and what was paid.
                _, moved, changed = rename_subject(task.get('subject_xp_distribution') or {}, from_key, to_key)
            if changed and moved > 0:
                result.finalized_xp += moved
                result.finalized_completions.append(c['id'])
        elif status in PENDING_STATUSES:
            latest = latest_round.get(c['id'])
            if latest and isinstance(latest.get('subject_suggestion'), dict) and latest['subject_suggestion']:
                new, moved, changed = rename_subject(latest['subject_suggestion'], from_key, to_key)
                if changed:
                    round_writes.append((latest['id'], {'subject_suggestion': new}))
            else:
                # Same fallback the approval uses to take pending back out.
                split = get_subject_xp_distribution(task, int(task.get('xp_value') or 0)) if task else {}
                _, moved, changed = rename_subject(split, from_key, to_key)
            if changed and moved > 0:
                result.pending_xp += moved
                result.pending_completions.append(c['id'])

    task_writes: List[Tuple[str, Dict[str, Any]]] = []
    for task_id, task in tasks.items():
        update: Dict[str, Any] = {}
        new_split, _, split_changed = rename_subject(task.get('subject_xp_distribution'), from_key, to_key)
        if split_changed:
            update['subject_xp_distribution'] = new_split
        new_subjects, _, subjects_changed = rename_subject(task.get('diploma_subjects'), from_key, to_key)
        if subjects_changed:
            update['diploma_subjects'] = new_subjects
        if update:
            task_writes.append((task_id, update))
            result.tasks_updated.append(task_id)

    change_transcript = False
    if is_own_curriculum(quest) and canonical_subject(quest.get('transcript_subject')) == from_key:
        if quest.get('created_by') != student_id:
            result.transcript_subject_skipped = 'not_this_students_quest'
        elif repo.other_enrollment_count(quest_id, student_id):
            result.transcript_subject_skipped = 'other_students_enrolled'
        else:
            change_transcript = True
            result.transcript_subject_changed = True

    if dry_run or not result.changed_anything:
        return result

    # Records first, ledger last (see the module note).
    for task_id, update in task_writes:
        repo.update_task(task_id, update)
    for round_id, update in round_writes:
        repo.update_round(round_id, update)
    if change_transcript:
        repo.set_transcript_subject(quest_id, to_key)

    _move_ledger(repo, result)

    result.audit_written = _write_audit(repo, result, actor_id, reason, request_id)
    logger.info(
        f'Subject credit moved for {student_id[:8]} on quest {quest_id[:8]}: '
        f'{from_key} -> {to_key}, {result.finalized_xp} XP earned, {result.pending_xp} XP pending'
        + (f', clamped {result.clamped}' if result.clamped else ''))
    return result


def _move_ledger(repo: SubjectCreditMoveRepository, result: SubjectMoveResult) -> None:
    """Move earned and pending XP in user_subject_xp. Never below zero, and
    never more into the new subject than came out of the old one."""
    if not result.finalized_xp and not result.pending_xp:
        return
    rows: Dict[str, Dict[str, Any]] = {}
    for r in repo.subject_rows(result.student_id):
        rows.setdefault(canonical_subject(r.get('school_subject')), r)

    source = rows.get(result.from_subject)
    have_xp = int((source or {}).get('xp_amount') or 0)
    have_pending = int((source or {}).get('pending_xp') or 0)
    take_xp = min(have_xp, result.finalized_xp)
    take_pending = min(have_pending, result.pending_xp)
    if take_xp < result.finalized_xp:
        result.clamped['xp_amount'] = result.finalized_xp - take_xp
    if take_pending < result.pending_xp:
        result.clamped['pending_xp'] = result.pending_xp - take_pending
    if result.clamped:
        logger.warning(
            f'Subject credit move for {result.student_id[:8]} on quest {result.quest_id[:8]}: '
            f'{result.from_subject} held less than the records say (short {result.clamped}); '
            f'moved only what it held')

    if not take_xp and not take_pending:
        return
    if source:
        repo.update_subject_row(source['id'], have_xp - take_xp, have_pending - take_pending)
    target = rows.get(result.to_subject)
    if target:
        repo.update_subject_row(
            target['id'],
            int(target.get('xp_amount') or 0) + take_xp,
            int(target.get('pending_xp') or 0) + take_pending)
    else:
        repo.insert_subject_row(result.student_id, result.to_subject, take_xp, take_pending)


def _write_audit(repo: SubjectCreditMoveRepository, result: SubjectMoveResult,
                 actor_id: Optional[str], reason: Optional[str], request_id: Optional[str]) -> bool:
    """The move already happened; a failed audit row is logged loudly, not raised."""
    try:
        repo.insert_move({
            'student_id': result.student_id,
            'quest_id': result.quest_id,
            'from_subject': result.from_subject,
            'to_subject': result.to_subject,
            'finalized_xp': result.finalized_xp,
            'pending_xp': result.pending_xp,
            'clamped': result.clamped,
            'details': {
                'finalized_completions': result.finalized_completions,
                'pending_completions': result.pending_completions,
                'tasks_updated': result.tasks_updated,
                'transcript_subject_changed': result.transcript_subject_changed,
                'transcript_subject_skipped': result.transcript_subject_skipped,
            },
            'request_id': request_id,
            'moved_by': actor_id,
            'reason': (reason or '').strip()[:MAX_TEXT] or None,
        })
        return True
    except Exception as e:  # noqa: BLE001 -- the move is done; say so loudly
        logger.error(f'Subject credit move audit insert failed for {result.student_id[:8]} '
                     f'quest {result.quest_id[:8]}: {e}')
        return False


# --------------------------------------------------------------------------
# Family requests, Optio decisions
# --------------------------------------------------------------------------

def _is_uuid(value: Any) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (TypeError, ValueError):
        return False


def _clean_text(value: Any, label: str) -> Optional[str]:
    text = (value or '').strip() if isinstance(value, str) else ''
    if len(text) > MAX_TEXT:
        raise SubjectMoveError('TEXT_TOO_LONG', f'Keep the {label} under {MAX_TEXT} characters.')
    return text or None


def _request_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'quest_id': row['quest_id'],
        'from_subject': row['from_subject'],
        'from_subject_name': get_display_name(row['from_subject']),
        'to_subject': row['to_subject'],
        'to_subject_name': get_display_name(row['to_subject']),
        'xp': row.get('xp_snapshot') or 0,
        'reason': row.get('reason'),
        'status': row.get('status'),
        'created_at': row.get('created_at'),
    }


def pending_requests_for_student(db, student_id: str) -> List[Dict[str, Any]]:
    """What Courses and Credits shows as "Move requested". Never fails the page."""
    try:
        rows = SubjectCreditMoveRepository(client=db).pending_for_student(student_id)
    except Exception as e:  # noqa: BLE001 -- e.g. the table is not there yet
        logger.warning(f'Could not read subject move requests for {student_id[:8]}: {e}')
        return []
    return [_request_payload(r) for r in rows]


def create_move_request(db, student_id: str, quest_id: str, from_subject: str, to_subject: str,
                        requested_by: str, reason: Optional[str] = None) -> Dict[str, Any]:
    """A family asks Optio to move this quest's credit. Returns the request."""
    if not quest_id or not isinstance(quest_id, str) or not _is_uuid(quest_id):
        raise SubjectMoveError('QUEST_REQUIRED', 'Pick the quest to move.')
    reason = _clean_text(reason, 'reason')
    preview = move_quest_subject_credit(db, student_id, quest_id, from_subject, to_subject,
                                        requested_by, dry_run=True)
    if not preview.total_xp and not preview.transcript_subject_changed:
        raise SubjectMoveError(
            'NOTHING_TO_MOVE',
            f'This quest has no {get_display_name(preview.from_subject)} credit to move.')

    repo = SubjectCreditMoveRepository(client=db)
    if repo.pending_for_quest(student_id, quest_id, preview.from_subject):
        raise SubjectMoveError('ALREADY_REQUESTED',
                               'A move for this quest is already waiting for Optio.', status=409)
    try:
        row = repo.insert_request({
            'student_id': student_id,
            'quest_id': quest_id,
            'from_subject': preview.from_subject,
            'to_subject': preview.to_subject,
            'xp_snapshot': preview.total_xp,
            'requested_by': requested_by,
            'reason': reason,
            'status': 'pending',
        })
    except Exception as e:
        if '23505' in str(e) or 'duplicate key' in str(e):
            raise SubjectMoveError('ALREADY_REQUESTED',
                                   'A move for this quest is already waiting for Optio.', status=409) from e
        raise
    return _request_payload(row)


def cancel_move_request(db, request_id: str, student_id: str, actor_id: str) -> Dict[str, Any]:
    """The family takes back a request Optio has not decided yet."""
    repo = SubjectCreditMoveRepository(client=db)
    row = repo.request(request_id) if _is_uuid(request_id) else None
    # Someone else's request reads as not found: no hint that it exists.
    if not row or row['student_id'] != student_id:
        raise SubjectMoveError('NOT_FOUND', 'That request was not found.', status=404)
    if row['status'] != 'pending':
        raise SubjectMoveError('ALREADY_DECIDED', 'Optio has already decided this request.', status=409)
    updated = repo.decide(request_id, 'pending', {
        'status': 'cancelled', 'decided_by': actor_id, 'decided_at': now_iso(),
    })
    if not updated:
        raise SubjectMoveError('ALREADY_DECIDED', 'Optio has already decided this request.', status=409)
    return _request_payload(updated)


def _name(user: Optional[Dict[str, Any]]) -> Optional[str]:
    if not user:
        return None
    full = f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip()
    return full or user.get('display_name') or user.get('email')


def list_requests(db, status: str = 'pending') -> List[Dict[str, Any]]:
    """The reviewer's queue: oldest first, with names to read it by."""
    if status not in ('pending', 'approved', 'declined', 'cancelled'):
        raise SubjectMoveError('INVALID_STATUS', 'Unknown status.')
    repo = SubjectCreditMoveRepository(client=db)
    rows = repo.requests_with_status(status)
    people = repo.users(list({uid for r in rows for uid in (r['student_id'], r.get('requested_by')) if uid}))
    titles = repo.quest_titles(list({r['quest_id'] for r in rows}))
    out = []
    for r in rows:
        item = _request_payload(r)
        item.update({
            'student_id': r['student_id'],
            'student_name': _name(people.get(r['student_id'])) or 'Student',
            'requested_by_name': _name(people.get(r.get('requested_by') or '')),
            'quest_title': titles.get(r['quest_id']) or 'Quest',
            'decision_note': r.get('decision_note'),
            'decided_at': r.get('decided_at'),
        })
        out.append(item)
    return out


def _load_pending(repo: SubjectCreditMoveRepository, request_id: str) -> Dict[str, Any]:
    row = repo.request(request_id) if _is_uuid(request_id) else None
    if not row:
        raise SubjectMoveError('NOT_FOUND', 'That request was not found.', status=404)
    if row['status'] != 'pending':
        raise SubjectMoveError('ALREADY_DECIDED', f'This request is already {row["status"]}.', status=409)
    return row


def _notify(row: Dict[str, Any], title: str, message: str, notification_type: str) -> None:
    """Tell whoever asked. Never fails the decision."""
    try:
        from services.notification_service import NotificationService
        NotificationService().create_notification(
            user_id=row.get('requested_by') or row['student_id'],
            notification_type=notification_type,
            title=title,
            message=message,
            link='/courses-and-credits',
            metadata={'subject_move_request_id': row['id'], 'student_id': row['student_id'],
                      'quest_id': row['quest_id']},
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not notify about subject move request {row["id"][:8]}: {e}')


def approve_move_request(db, request_id: str, reviewer_id: str,
                         note: Optional[str] = None) -> Dict[str, Any]:
    """Optio approves: claim the request, run the move, tell the family."""
    note = _clean_text(note, 'note')
    repo = SubjectCreditMoveRepository(client=db)
    row = _load_pending(repo, request_id)
    claimed = repo.decide(request_id, 'pending', {
        'status': 'approved', 'decided_by': reviewer_id, 'decided_at': now_iso(), 'decision_note': note,
    })
    if not claimed:
        raise SubjectMoveError('ALREADY_DECIDED', 'This request was decided a moment ago.', status=409)
    try:
        result = move_quest_subject_credit(
            db, row['student_id'], row['quest_id'], row['from_subject'], row['to_subject'],
            reviewer_id, reason=row.get('reason') or note, request_id=request_id)
    except Exception:
        # Put it back in the queue so it can be tried again.
        repo.decide(request_id, 'approved', {
            'status': 'pending', 'decided_by': None, 'decided_at': None, 'decision_note': None,
        })
        raise

    titles = repo.quest_titles([row['quest_id']])
    quest_title = titles.get(row['quest_id']) or 'the quest'
    to_name = get_display_name(row['to_subject'])
    _notify(row, f'Credit moved to {to_name}',
            f'Optio moved the {get_display_name(row["from_subject"])} credit from "{quest_title}" '
            f'to {to_name}.', 'diploma_credit_approved')
    return {'request': _request_payload(claimed), 'move': result.to_dict()}


def decline_move_request(db, request_id: str, reviewer_id: str, note: Optional[str]) -> Dict[str, Any]:
    """Optio declines, and says why."""
    note = _clean_text(note, 'note')
    if not note:
        raise SubjectMoveError('NOTE_REQUIRED', 'Say why, so the family knows.')
    repo = SubjectCreditMoveRepository(client=db)
    row = _load_pending(repo, request_id)
    updated = repo.decide(request_id, 'pending', {
        'status': 'declined', 'decided_by': reviewer_id, 'decided_at': now_iso(), 'decision_note': note,
    })
    if not updated:
        raise SubjectMoveError('ALREADY_DECIDED', 'This request was decided a moment ago.', status=409)
    titles = repo.quest_titles([row['quest_id']])
    quest_title = titles.get(row['quest_id']) or 'the quest'
    _notify(row, 'Credit move not approved',
            f'Optio kept the credit from "{quest_title}" in {get_display_name(row["from_subject"])}. {note}',
            'system_alert')
    return {'request': _request_payload(updated)}
