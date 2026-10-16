"""A teacher adds a student's work to a task, and may mark it done.

Ticket 77637c3a (Apogee Cache Valley, 2026-10-15): "Is there a way for my
teachers to track student progress on quests and upload photos of their work
from their accounts instead of the students? ... our chromebooks do not have
the ability to take pictures and one kiosk for 30 kids is going to be
challenging." Tanner's decisions the same day:

- Any staff member of the student's school may do it, the Students page's own
  rule (routes/sis/student_work.py), so no advisor assignment is needed.
- The photo is task evidence, written exactly as /api/evidence/helper/* writes
  a parent's or advisor's upload: a helper block on the student's evidence
  document plus one journal entry.
- "Mark this task done" completes the task for the student: XP is awarded and
  the completion counts as already reviewed, because a teacher has seen the
  work. It is stamped verified (the Verifications queue reads
  subject_verified_at) and accepted in the Submissions inbox
  (sis_submission_reviews), so it waits in neither.

Nothing here decides who may call it; the route is the gate.
"""

from typing import Any, Dict, List, Optional

from repositories.helper_evidence_repository import HelperEvidenceRepository
from utils.logger import get_logger
from utils.timestamps import now_iso

logger = get_logger(__name__)

#: Files in one capture, the Photos page's limit.
MAX_FILES = 10
#: The feedback thread's limit, which a note is no longer than.
MAX_NOTE = 4000
#: What the Verifications history shows for a completion a teacher made.
VERIFIED_NOTE = 'Completed by a teacher'


class CaptureError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def _upload(admin, student_id: str, task_id: str, files) -> List[Dict[str, Any]]:
    """Store each file under the student's own evidence path. Answers the
    blocks to write, in the order the files came."""
    from services.media_upload_service import MediaUploadService
    service = MediaUploadService(admin)
    blocks = []
    for f in files:
        result = service.upload_evidence_file(
            f, user_id=student_id, context_type='task_evidence', context_id=task_id,
            security_scan=True,
        )
        if not result.success:
            raise CaptureError(result.error_message or 'Could not upload that file', 400)
        kind = 'video' if (result.media_type == 'video'
                           or (result.content_type or '').startswith('video')) else 'image'
        if kind == 'image':
            content = {'url': result.file_url, 'caption': '', 'alt_text': result.filename or ''}
        else:
            content = {'url': result.file_url, 'filename': result.filename or '', 'caption': ''}
        blocks.append({'block_type': kind, 'content': content})
    return blocks


def _complete(admin, staff_id: str, org_id: str, student_id: str, task: Dict[str, Any],
              evidence_text: Optional[str], evidence_url: Optional[str]) -> Dict[str, Any]:
    """Complete the task for the student, verified and accepted. Answers
    {completion_id, xp_awarded, xp_award_pending, quest_auto_ended}."""
    from repositories.sis_submission_repository import SisSubmissionRepository
    from repositories.task_repository import TaskCompletionRepository
    from services.class_quest_completion import end_if_class_quest_complete
    from services.xp_service import XPService

    task_id, quest_id = task['id'], task['quest_id']
    now = now_iso()
    completion = TaskCompletionRepository(client=admin).create_completion({
        'user_id': student_id,
        'quest_id': quest_id,
        'task_id': task_id,
        'user_quest_task_id': task_id,
        'evidence_text': evidence_text,
        'evidence_url': evidence_url,
        'is_confidential': False,
        # The teacher pressed the button; NULL would say the student did.
        'completed_by_user_id': staff_id,
        'diploma_status': 'none',
        'revision_number': 1,
        # A teacher saw the work, so it is born reviewed.
        'subject_verified_at': now,
        'verified_by_advisor_id': staff_id,
        'verification_notes': VERIFIED_NOTE,
    })

    xp = task.get('xp_value') or 0
    pillar = task.get('pillar') or 'stem'
    pending = False
    if xp and not XPService().award_xp(student_id, pillar, xp, f'task_completion:{task_id}'):
        pending = True
        logger.error(f'Staff completion of task {task_id}: XP award failed')
        try:
            HelperEvidenceRepository(admin).record_xp_failure({
                'user_id': student_id, 'task_id': task_id, 'pillar': pillar,
                'xp_amount': xp, 'reason': 'Staff capture: award_xp returned False',
            })
        except Exception as e:  # noqa: BLE001 -- the completion already stands
            logger.error(f'Could not record the failed XP award for {task_id}: {e}')

    try:
        SisSubmissionRepository(admin).save_reviews([{
            'organization_id': org_id,
            'completion_id': completion['id'],
            'reviewed_by': staff_id,
            'action': 'accepted',
            'reviewed_at': now,
        }])
    except Exception as e:  # noqa: BLE001 -- it shows in the inbox; nothing is lost
        logger.warning(f'Staff completion {completion["id"]} not marked accepted: {e}')

    auto_ended = False
    try:
        auto_ended = bool(end_if_class_quest_complete(admin, student_id, quest_id))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Class quest end check failed for {student_id[:8]}/{quest_id[:8]}: {e}')

    return {'completion_id': completion['id'], 'xp_awarded': 0 if pending else xp,
            'xp_award_pending': pending, 'quest_auto_ended': auto_ended}


def capture(admin, *, staff_id: str, org_id: str, student_id: str, task_id: str,
            files=None, note: str = '', mark_done: bool = False) -> Dict[str, Any]:
    """Attach photos and/or a note to a student's task, and optionally mark it
    done. The caller has checked that the staff member and the student share a
    school."""
    from repositories import EvidenceDocumentRepository

    files = [f for f in (files or []) if f and getattr(f, 'filename', '')]
    note = (note or '').strip()
    if len(files) > MAX_FILES:
        raise CaptureError(f'Add at most {MAX_FILES} photos at a time.')
    if len(note) > MAX_NOTE:
        raise CaptureError('The note is too long.')
    if not files and not note:
        raise CaptureError('Add a photo or a note.')

    reads = HelperEvidenceRepository(admin)
    task = reads.task_for_student(task_id, student_id)
    if not task:
        raise CaptureError('Task not found', 404)

    enrolled = reads.enrollments(student_id, task['quest_id'])
    if not any(e.get('is_active') is not False and not e.get('completed_at') for e in enrolled):
        raise CaptureError('The student is not working on that quest right now.', 409)

    done = reads.completion_for(student_id, task_id)
    if mark_done and not done and task.get('approval_status') not in (None, 'approved'):
        raise CaptureError('This task is waiting for approval and cannot be marked done yet.', 409)

    blocks = _upload(admin, student_id, task_id, files)
    if note:
        blocks.append({'block_type': 'text', 'content': {'text': note}})

    repo = EvidenceDocumentRepository()
    repo._client = admin
    document_id = repo.get_or_create_document(student_id, task_id, task['quest_id'])
    order = repo.get_next_block_order_index(document_id)
    for offset, b in enumerate(blocks):
        repo.create_helper_block(
            document_id=document_id, block_type=b['block_type'], content=b['content'],
            order_index=order + offset, uploaded_by_user_id=staff_id,
            uploaded_by_role='advisor', is_private=False,
        )

    # One journal entry for the capture, as the helper batch route writes.
    try:
        reads.create_learning_event(
            student_id, staff_id, 'advisor', task['quest_id'], task_id,
            task['title'], blocks[0]['block_type'], blocks[0]['content'])
    except Exception as e:  # noqa: BLE001 -- the evidence stands; the journal is extra
        logger.warning(f'Staff capture journal entry failed for task {task_id}: {e}')

    out: Dict[str, Any] = {'blocks_added': len(blocks), 'completed': bool(done),
                           'already_done': bool(done)}
    if mark_done and not done:
        first_file = next((b['content']['url'] for b in blocks if b['block_type'] != 'text'), None)
        out.update(_complete(admin, staff_id, org_id, student_id, task,
                             evidence_text=note or None, evidence_url=first_file))
        out['completed'] = True
    logger.info(f'Staff {staff_id[:8]} captured {len(blocks)} block(s) for {student_id[:8]} '
                f'task {task_id[:8]} (mark_done={mark_done})')
    return out
