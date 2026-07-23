"""
Admin Class Reviews — holistic review of student class submissions.

When a student earns >=1000 approved subject XP on a class quest and submits
it for final review, the class shows up here. Admins approve to award a
transcript credit or reject with notes so the student can keep building.

Endpoints:
- GET  /api/admin/class-reviews                  - list submissions (filterable)
- GET  /api/admin/class-reviews/<quest_id>       - detail (student, tasks, xp)
- POST /api/admin/class-reviews/<quest_id>/approve
- POST /api/admin/class-reviews/<quest_id>/reject
"""

from flask import Blueprint, request
from datetime import datetime, timezone
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.api_response_v1 import success_response, error_response
from utils.school_subjects import get_display_name
from utils.logger import get_logger

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

        return success_response(data={'items': items, 'total': len(items)})

    except Exception as e:
        logger.error(f"list_class_reviews failed: {e}", exc_info=True)
        return error_response(code='FETCH_ERROR', message='Failed to list class reviews', status=500)


@bp.route('/<quest_id>', methods=['GET'])
@require_admin
def get_class_review_detail(user_id: str, quest_id: str):
    """Full detail: quest, student, contributing tasks (with approved subject XP)."""
    try:
        supabase = get_supabase_admin_client()
        quest = supabase.table('quests') \
            .select('id, title, big_idea, description, transcript_subject, class_review_status, class_review_submitted_at, class_review_notes, created_by, created_at') \
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
                .select('id, title, description, pillar, xp_value, diploma_subjects, subject_xp_distribution') \
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

        from routes.tasks.xp_helpers import get_subject_xp_distribution
        approved_xp = 0
        task_rows = []
        for c in (completions.data or []):
            t = tasks_map.get(c.get('user_quest_task_id'), {})
            xp_value = t.get('xp_value', 0)
            dist = get_subject_xp_distribution(t, xp_value) if t else {}
            subject_xp = int(dist.get(subject, 0))
            approved_xp += subject_xp
            task_rows.append({
                'completion_id': c['id'],
                'task_id': t.get('id'),
                'title': t.get('title'),
                'description': t.get('description'),
                'xp_value': xp_value,
                'subject_xp_attributed': subject_xp,
                'finalized_at': c.get('finalized_at'),
                'completed_at': c.get('completed_at'),
                'evidence_blocks': evidence_by_task.get(t.get('id'), []),
            })

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
            'target_xp': 1000,
            # A class awards a fixed half transcript credit once the 1000 XP
            # target is met (matches CLASS_CREDIT_VALUE in transcript_generator).
            'credits_earned': 0.5 if approved_xp >= 1000 else 0,
        })

    except Exception as e:
        logger.error(f"get_class_review_detail failed: {e}", exc_info=True)
        return error_response(code='FETCH_ERROR', message='Failed to load class detail', status=500)


@bp.route('/<quest_id>/approve', methods=['POST'])
@require_admin
def approve_class_review(user_id: str, quest_id: str):
    """Approve a class submission — awards the transcript credit."""
    try:
        supabase = get_supabase_admin_client()
        data = request.get_json() or {}
        notes = (data.get('notes') or '').strip() or None

        quest = supabase.table('quests') \
            .select('id, quest_type, class_review_status') \
            .eq('id', quest_id).single().execute()
        if not quest.data:
            return error_response(code='NOT_FOUND', message='Class not found', status=404)
        if quest.data.get('quest_type') != 'class':
            return error_response(code='NOT_A_CLASS', message='Quest is not a class', status=400)
        if quest.data.get('class_review_status') != 'submitted_for_review':
            return error_response(code='NOT_PENDING', message='Class is not pending review', status=409)

        supabase.table('quests').update({
            'class_review_status': 'credit_awarded',
            'class_review_notes': notes,
        }).eq('id', quest_id).execute()

        # Congratulate the student + parents with the evidence portfolio PDF
        # attached. Runs in a background thread (asset fetching is slow) and
        # never blocks or fails the approval itself.
        try:
            from services.class_credit_pdf_service import notify_class_credit_awarded_async
            notify_class_credit_awarded_async(quest_id)
        except Exception as e:
            logger.error(f"Failed to queue credit award email for {quest_id[:8]}: {e}", exc_info=True)

        logger.info(f"Admin {user_id[:8]} approved class {quest_id[:8]}")
        return success_response(data={'quest_id': quest_id, 'review_status': 'credit_awarded'})

    except Exception as e:
        logger.error(f"approve_class_review failed: {e}", exc_info=True)
        return error_response(code='APPROVE_FAILED', message='Failed to approve class', status=500)


@bp.route('/<quest_id>/reject', methods=['POST'])
@require_admin
def reject_class_review(user_id: str, quest_id: str):
    """Reject a class submission with notes; student can keep building and resubmit."""
    try:
        supabase = get_supabase_admin_client()
        data = request.get_json() or {}
        notes = (data.get('notes') or '').strip()
        if not notes:
            return error_response(code='NOTES_REQUIRED', message='Rejection notes are required', status=400)

        quest = supabase.table('quests') \
            .select('id, quest_type, class_review_status') \
            .eq('id', quest_id).single().execute()
        if not quest.data:
            return error_response(code='NOT_FOUND', message='Class not found', status=404)
        if quest.data.get('quest_type') != 'class':
            return error_response(code='NOT_A_CLASS', message='Quest is not a class', status=400)
        if quest.data.get('class_review_status') != 'submitted_for_review':
            return error_response(code='NOT_PENDING', message='Class is not pending review', status=409)

        supabase.table('quests').update({
            'class_review_status': 'rejected',
            'class_review_notes': notes,
        }).eq('id', quest_id).execute()

        logger.info(f"Admin {user_id[:8]} rejected class {quest_id[:8]}")
        return success_response(data={'quest_id': quest_id, 'review_status': 'rejected'})

    except Exception as e:
        logger.error(f"reject_class_review failed: {e}", exc_info=True)
        return error_response(code='REJECT_FAILED', message='Failed to reject class', status=500)
