"""
Admin Class Reviews — holistic review of student class submissions.

When a student earns >=1000 approved subject XP on a class quest and submits
it for final review, the class shows up here. Admins approve to award a
transcript credit or reject with notes so the student can keep building.

Endpoints:
- GET  /api/admin/class-reviews                  - list submissions (filterable)
- GET  /api/admin/class-reviews/<quest_id>       - detail (student, tasks, xp)
- POST /api/admin/class-reviews/<quest_id>/send             - approve or send back, and email the student
- POST /api/admin/class-reviews/<quest_id>/send-preview     - the same email, to the reviewer
- GET  /api/admin/class-reviews/<quest_id>/email-recipients
- POST /api/admin/class-reviews/<quest_id>/tasks/<completion_id>/accept
- POST /api/admin/class-reviews/<quest_id>/tasks/<completion_id>/return
- POST /api/admin/class-reviews/<quest_id>/tasks/<completion_id>/ai-review

Each task is judged on its own, as in the credit queue, with the same AI
review; services/class_task_review_service.py holds what a decision does.
Deciding a task contacts nobody. Send is the only step that reaches the
student: one email the reviewer drafted from every task's feedback.
"""

from flask import Blueprint, request
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.api_response_v1 import success_response, error_response
from utils.school_subjects import get_display_name
from utils.logger import get_logger
from utils.storage_urls import sign_in_place

logger = get_logger(__name__)

bp = Blueprint('admin_class_reviews', __name__, url_prefix='/api/admin/class-reviews')


def _student_display_name(u):
    if not u:
        return 'Unknown'
    return (u.get('display_name')
            or f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
            or u.get('email') or 'Unknown')


@bp.route('', methods=['GET'])
@require_admin
def list_class_reviews(user_id: str):
    """List class submissions. Filterable by status (default: submitted_for_review)."""
    try:
        # admin client justified: @require_admin; platform-wide read of all students' class quests + user profiles for the review queue
        supabase = get_supabase_admin_client()
        status_filter = request.args.get('status', 'submitted_for_review')

        query = supabase.table('quests') \
            .select('id, title, transcript_subject, class_review_status, class_review_submitted_at, class_review_notes, created_by, created_at') \
            .eq('quest_type', 'class')

        if status_filter and status_filter != 'all':
            query = query.eq('class_review_status', status_filter)

        quests = query.order('class_review_submitted_at', desc=True).limit(200).execute()

        rows = quests.data or []
        student_ids = list({q['created_by'] for q in rows if q.get('created_by')})
        students_map = {}
        if student_ids:
            students = supabase.table('users') \
                .select('id, display_name, first_name, last_name, email, avatar_url') \
                .in_('id', student_ids) \
                .execute()
            students_map = {s['id']: s for s in (students.data or [])}

        items = []
        for q in rows:
            student = students_map.get(q.get('created_by'), {})
            items.append({
                'quest_id': q['id'],
                'title': q['title'],
                'transcript_subject': q.get('transcript_subject'),
                'transcript_subject_display': get_display_name(q.get('transcript_subject') or ''),
                'review_status': q.get('class_review_status'),
                'submitted_at': q.get('class_review_submitted_at'),
                'review_notes': q.get('class_review_notes'),
                'student_id': q.get('created_by'),
                'student_name': _student_display_name(student),
                'student_avatar': student.get('avatar_url'),
            })

        # Private-bucket photos: one batch for the whole review queue.
        sign_in_place(items, ['student_avatar'])
        return success_response(data={'items': items, 'total': len(items)})

    except Exception as e:
        logger.error(f"list_class_reviews failed: {e}", exc_info=True)
        return error_response(code='FETCH_ERROR', message='Failed to list class reviews', status=500)


@bp.route('/<quest_id>', methods=['GET'])
@require_admin
def get_class_review_detail(user_id: str, quest_id: str):
    """Full detail: quest, student, contributing tasks (with approved subject XP)."""
    try:
        # admin client justified: @require_admin; reads the submitting student's quest, profile, completions, and evidence blocks (cross-user)
        supabase = get_supabase_admin_client()
        quest = supabase.table('quests') \
            .select('id, title, big_idea, description, quest_type, transcript_subject, class_review_status, class_review_submitted_at, class_review_notes, created_by, created_at') \
            .eq('id', quest_id) \
            .eq('quest_type', 'class') \
            .single() \
            .execute()
        if not quest.data:
            return error_response(code='NOT_FOUND', message='Class not found', status=404)
        q = quest.data
        subject = q.get('transcript_subject')

        # Student
        student_id = q.get('created_by')
        student_data = {}
        if student_id:
            s = supabase.table('users').select('id, display_name, first_name, last_name, email, avatar_url, total_xp').eq('id', student_id).single().execute()
            student_data = s.data or {}
            student_data['display_name'] = _student_display_name(student_data)
            sign_in_place([student_data], ['avatar_url'])

        # All completed tasks on this class quest. Per-task credit review is
        # skipped inside a class (completions keep diploma_status='none'), so we
        # must NOT filter by diploma_status — that's what made the class look
        # empty. Matches how class progress counts XP.
        completions = supabase.table('quest_task_completions') \
            .select('id, user_quest_task_id, diploma_status, finalized_at, credit_requested_at, completed_at') \
            .eq('quest_id', quest_id) \
            .eq('user_id', student_id) \
            .execute()
        task_ids = [c['user_quest_task_id'] for c in (completions.data or []) if c.get('user_quest_task_id')]
        tasks_map = {}
        if task_ids:
            tasks = supabase.table('user_quest_tasks') \
                .select('id, title, description, success_criteria, pillar, xp_value, diploma_subjects, subject_xp_distribution') \
                .in_('id', task_ids) \
                .execute()
            tasks_map = {t['id']: t for t in (tasks.data or [])}

        # Evidence per task: documents -> ordered blocks, grouped by task.
        evidence_by_task = {}
        if task_ids:
            docs = supabase.table('user_task_evidence_documents') \
                .select('id, task_id') \
                .eq('user_id', student_id) \
                .in_('task_id', task_ids) \
                .execute()
            doc_to_task = {d['id']: d['task_id'] for d in (docs.data or [])}
            if doc_to_task:
                blocks = supabase.table('evidence_document_blocks') \
                    .select('id, document_id, block_type, content, order_index') \
                    .in_('document_id', list(doc_to_task.keys())) \
                    .order('order_index') \
                    .execute()
                for b in (blocks.data or []):
                    tid = doc_to_task.get(b['document_id'])
                    if tid:
                        evidence_by_task.setdefault(tid, []).append(b)

        # One review round per task per submission; opening the class opens
        # any that are missing and queues their AI reviews.
        from services.class_task_review_service import ClassTaskReviewService, state_of
        latest_rounds = ClassTaskReviewService(client=supabase).ensure_rounds(
            q, completions.data or [])
        from services.credit_ai_review import store as ai_store
        from routes.credit_dashboard.ai_review import serialize_review
        ai_by_completion = ai_store.latest_for_completions(
            supabase, [c['id'] for c in (completions.data or [])])

        from routes.tasks.xp_helpers import get_subject_xp_distribution
        total_xp = 0
        approved_xp = 0
        counts = {'accepted': 0, 'returned': 0, 'pending': 0, 'not_submitted': 0}
        task_rows = []
        for c in (completions.data or []):
            t = tasks_map.get(c.get('user_quest_task_id'), {})
            xp_value = t.get('xp_value', 0)
            dist = get_subject_xp_distribution(t, xp_value) if t else {}
            subject_xp = int(dist.get(subject, 0))
            latest = latest_rounds.get(c['id'])
            state = state_of(latest)
            counts[state] = counts.get(state, 0) + 1
            total_xp += subject_xp
            # A task sent back is out of the total until it is accepted.
            if state != 'returned':
                approved_xp += subject_xp
            ai_row = ai_by_completion.get(c['id'])
            ai = serialize_review(ai_row)
            if ai_row:
                ai['round_id'] = ai_row.get('round_id')
            task_rows.append({
                'completion_id': c['id'],
                'task_id': t.get('id'),
                'title': t.get('title'),
                'description': t.get('description'),
                'success_criteria': t.get('success_criteria'),
                'xp_value': xp_value,
                'subject_xp_attributed': subject_xp,
                'finalized_at': c.get('finalized_at'),
                'completed_at': c.get('completed_at'),
                'evidence_blocks': evidence_by_task.get(t.get('id'), []),
                'review': {
                    'state': state,
                    'round_id': (latest or {}).get('id'),
                    'feedback': (latest or {}).get('reviewer_feedback'),
                    'reviewed_at': (latest or {}).get('reviewed_at'),
                },
                'ai': ai,
            })

        # Evidence lives in the private quest-evidence bucket, so the stored
        # public URLs 400. Sign every block in one batch, through the canonical
        # helper that also reaches content.items (Jake Bingham's class review,
        # 2026-09-30, showed no images at all).
        from services.portfolio_service import PortfolioService
        PortfolioService().sign_evidence_blocks_on(task_rows, key='evidence_blocks')

        return success_response(data={
            'quest': {
                'id': q['id'],
                'title': q['title'],
                'description': q.get('big_idea') or q.get('description'),
                'transcript_subject': subject,
                'transcript_subject_display': get_display_name(subject or ''),
                'review_status': q.get('class_review_status'),
                'submitted_at': q.get('class_review_submitted_at'),
                'review_notes': q.get('class_review_notes'),
                'created_at': q.get('created_at'),
            },
            'student': student_data,
            'tasks': task_rows,
            'approved_subject_xp': approved_xp,
            'total_subject_xp': total_xp,
            'task_review_counts': counts,
            # Approve needs every task accepted and the target met.
            'can_approve': (
                q.get('class_review_status') == 'submitted_for_review'
                and bool(task_rows)
                and counts['accepted'] == len(task_rows)
                and approved_xp >= 1000
            ),
            'target_xp': 1000,
            # A class awards a fixed half transcript credit once the 1000 XP
            # target is met (matches CLASS_CREDIT_VALUE in transcript_generator).
            'credits_earned': 0.5 if approved_xp >= 1000 else 0,
        })

    except Exception as e:
        logger.error(f"get_class_review_detail failed: {e}", exc_info=True)
        return error_response(code='FETCH_ERROR', message='Failed to load class detail', status=500)


@bp.route('/<quest_id>/send', methods=['POST'])
@require_admin
def send_class_review(user_id: str, quest_id: str):
    """Finish the review: approve or send the class back, and send the
    student the reviewer's email. Nothing reaches the student before this."""
    try:
        # admin client justified: @require_admin; writes the review outcome onto the student's quest and task rows (cross-user write)
        supabase = get_supabase_admin_client()
        data = request.get_json() or {}
        from services.class_task_review_service import ClassTaskReviewService
        result = ClassTaskReviewService(client=supabase).finish(
            quest_id=quest_id, outcome=data.get('outcome'),
            subject=data.get('subject'), body=data.get('body'), reviewer_id=user_id)
        if 'error' in result:
            code, message, status = result['error']
            return error_response(code=code, message=message, status=status)
        return success_response(data={'quest_id': quest_id, **{k: v for k, v in result.items() if k != 'ok'}})
    except Exception as e:
        logger.error(f"send_class_review failed: {e}", exc_info=True)
        return error_response(code='SEND_FAILED', message='Failed to finish the class review', status=500)


@bp.route('/<quest_id>/send-preview', methods=['POST'])
@require_admin
def send_class_review_preview(user_id: str, quest_id: str):
    """Send draft to me: the student's email, delivered to the reviewer."""
    try:
        # admin client justified: @require_admin; reads the reviewer's own address and the student's class to build the preview
        supabase = get_supabase_admin_client()
        data = request.get_json() or {}
        from services.class_task_review_service import ClassTaskReviewService
        result = ClassTaskReviewService(client=supabase).send_preview(
            quest_id=quest_id, outcome=data.get('outcome'),
            subject=data.get('subject'), body=data.get('body'), reviewer_id=user_id)
        if 'error' in result:
            code, message, status = result['error']
            return error_response(code=code, message=message, status=status)
        return success_response(data={k: v for k, v in result.items() if k != 'ok'})
    except Exception as e:
        logger.error(f"send_class_review_preview failed: {e}", exc_info=True)
        return error_response(code='SEND_FAILED', message='Failed to send the preview', status=500)


@bp.route('/<quest_id>/email-recipients', methods=['GET'])
@require_admin
def class_review_email_recipients(user_id: str, quest_id: str):
    """Who Send will email: the student, cc their parents."""
    try:
        from services.class_credit_pdf_service import class_review_recipients
        return success_response(data=class_review_recipients(quest_id))
    except Exception as e:
        logger.error(f"class_review_email_recipients failed: {e}", exc_info=True)
        return error_response(code='FETCH_ERROR', message='Failed to load recipients', status=500)


def _decide_task(user_id, quest_id, completion_id, action):
    # admin client justified: @require_admin; writes the review round and task feedback on the student's class task (cross-user write)
    supabase = get_supabase_admin_client()
    data = request.get_json() or {}
    from services.class_task_review_service import ClassTaskReviewService
    result = ClassTaskReviewService(client=supabase).decide(
        quest_id=quest_id, completion_id=completion_id, action=action,
        feedback=data.get('feedback'), reviewer_id=user_id,
        ai_feedback_used=(data.get('ai_accepted') or {}).get('feedback')
        if isinstance(data.get('ai_accepted'), dict) else None)
    if 'error' in result:
        code, message, status = result['error']
        return error_response(code=code, message=message, status=status)
    logger.info(f"Admin {user_id[:8]} {action} class task {completion_id[:8]} on {quest_id[:8]}")
    return success_response(data={'completion_id': completion_id, 'state': result['state']})


@bp.route('/<quest_id>/tasks/<completion_id>/accept', methods=['POST'])
@require_admin
def accept_class_task(user_id: str, quest_id: str, completion_id: str):
    """Accept one task of a class under review. Moves no subject XP."""
    try:
        from services.class_task_review_service import ACCEPTED
        return _decide_task(user_id, quest_id, completion_id, ACCEPTED)
    except Exception as e:
        logger.error(f"accept_class_task failed: {e}", exc_info=True)
        return error_response(code='DECISION_FAILED', message='Failed to accept task', status=500)


@bp.route('/<quest_id>/tasks/<completion_id>/return', methods=['POST'])
@require_admin
def return_class_task(user_id: str, quest_id: str, completion_id: str):
    """Send one task of a class back with feedback (required)."""
    try:
        from services.class_task_review_service import RETURNED
        return _decide_task(user_id, quest_id, completion_id, RETURNED)
    except Exception as e:
        logger.error(f"return_class_task failed: {e}", exc_info=True)
        return error_response(code='DECISION_FAILED', message='Failed to send task back', status=500)


@bp.route('/<quest_id>/tasks/<completion_id>/ai-review', methods=['POST'])
@require_admin
def rerun_class_task_ai_review(user_id: str, quest_id: str, completion_id: str):
    """Run (or re-run) the AI review of one class task's current round."""
    try:
        from services.credit_ai_review import store, trigger
        from routes.credit_dashboard.ai_review import serialize_review
        from services.class_task_review_service import ClassTaskReviewService
        if not trigger.enabled():
            return error_response(code='AI_REVIEW_DISABLED',
                                  message='AI credit review is turned off.', status=503)
        # admin client justified: @require_admin; credit_ai_reviews is service-role only and the write is pinned to one class task
        supabase = get_supabase_admin_client()
        service = ClassTaskReviewService(client=supabase)
        quest = service.repo.quest(quest_id)
        completion = service.repo.completion(completion_id)
        if (not quest or not completion or completion.get('quest_id') != quest_id
                or completion.get('user_id') != quest.get('created_by')):
            return error_response(code='NOT_FOUND', message='Task not found on this class', status=404)
        latest = service.ensure_rounds(quest, [completion]).get(completion_id)
        if not latest:
            return error_response(code='NOT_FOUND', message='This task has no review round yet.', status=404)
        try:
            row = trigger.queue_and_kick(round_id=latest['id'], completion_id=completion_id,
                                         requested_by=user_id, force=True, admin=supabase)
        except store.AlreadyRunning:
            return error_response(code='AI_REVIEW_RUNNING',
                                  message='An AI review of this task is already running.', status=409)
        return success_response(data={'ai': serialize_review(row)}, status=202)
    except Exception as e:
        logger.error(f"rerun_class_task_ai_review failed: {e}", exc_info=True)
        return error_response(code='AI_REVIEW_FAILED', message='Failed to start the AI review', status=500)
