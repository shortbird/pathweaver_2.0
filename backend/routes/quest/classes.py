"""
Class-quest endpoints — supports the "Start a Class" mobile feature.

A "class" is a quest with quest_type='class' and a transcript_subject. The
student earns 1000 XP toward that subject (computed from approved
quest_task_completions on this quest) to claim a transcript credit, then
submits the class for a holistic Optio review.

Endpoints:
- POST /api/quests/class-task-suggestions   - AI task suggestions (pre-create preview)
- GET  /api/quests/<id>/class-progress       - subject XP progress + review status
- POST /api/quests/<id>/submit-class-for-review - submit at >=1000 approved XP
"""

from flask import Blueprint, request
from datetime import datetime, timezone
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.api_response_v1 import success_response, error_response
from utils.school_subjects import SCHOOL_SUBJECTS, get_display_name
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('quest_classes', __name__, url_prefix='/api/quests')

CLASS_TARGET_XP = 1000


@bp.route('/class-task-suggestions', methods=['POST'])
@require_auth
def class_task_suggestions(user_id: str):
    """
    Generate AI task suggestions for a class — preview only, no DB writes.

    Body:
        title: class title (e.g. "Soccer Conditioning")
        description: passion-project description
        transcript_subject: one of SCHOOL_SUBJECTS
        count: optional, default 8

    Returns:
        { success: true, suggestions: [...] }
    """
    try:
        data = request.get_json() or {}
        title = (data.get('title') or '').strip()
        description = (data.get('description') or '').strip()
        transcript_subject = (data.get('transcript_subject') or '').strip()
        count = int(data.get('count') or 8)
        if count < 4:
            count = 4
        if count > 12:
            count = 12

        if not title:
            return error_response(code='TITLE_REQUIRED', message='title is required', status=400)
        if transcript_subject not in SCHOOL_SUBJECTS:
            return error_response(code='INVALID_SUBJECT', message='Invalid transcript_subject', status=400)

        from services.sample_task_generator import generate_sample_tasks
        suggestions = generate_sample_tasks(
            quest_title=title,
            quest_description=description or title,
            count=count,
            transcript_subject=transcript_subject,
        )

        return success_response(data={'suggestions': suggestions})

    except Exception as e:
        logger.error(f"class-task-suggestions failed: {e}", exc_info=True)
        return error_response(
            code='AI_GENERATION_FAILED',
            message='Could not generate task suggestions. Try again in a moment.',
            status=500,
        )


def _compute_class_progress(supabase, quest_id: str, user_id: str, transcript_subject: str) -> dict:
    """Sum subject XP attributed to this class quest for this student.

    Class progress counts ANY completed task on the class quest, regardless of
    per-task diploma_status. The holistic review at 1000 XP is what actually
    validates the work — per-task credit review is unnecessary inside a class.
    """
    completions = supabase.table('quest_task_completions') \
        .select('id, user_quest_task_id, diploma_status') \
        .eq('user_id', user_id) \
        .eq('quest_id', quest_id) \
        .execute()

    task_ids = [c['user_quest_task_id'] for c in (completions.data or []) if c.get('user_quest_task_id')]
    if not task_ids:
        return {'approved_xp': 0, 'pending_xp': 0}

    tasks = supabase.table('user_quest_tasks') \
        .select('id, xp_value, diploma_subjects, subject_xp_distribution') \
        .in_('id', task_ids) \
        .execute()

    from routes.tasks.xp_helpers import get_subject_xp_distribution
    approved_xp = 0
    for t in (tasks.data or []):
        dist = get_subject_xp_distribution(t, t.get('xp_value', 0))
        approved_xp += int(dist.get(transcript_subject, 0))

    return {'approved_xp': approved_xp, 'pending_xp': 0}


@bp.route('/my-classes', methods=['GET'])
@require_auth
def list_my_classes(user_id: str):
    """List the student's credit-classes (quest_type='class'), INCLUDING completed /
    credit-awarded ones.

    The /my-classes page can't source these from the dashboard's active_quests:
    that list filters out completed enrollments (shared rule in
    utils/quest_status), and a credit-awarded class is complete without a
    completed_at — so credit-awarded classes (e.g. POE, where attendance awards
    credit immediately) would silently disappear. This endpoint is enrollment-
    based like the old behavior but does NOT drop completed classes.
    """
    try:
        supabase = get_supabase_admin_client()
        enrollments = supabase.table('user_quests') \
            .select('quest_id, quests(id, title, transcript_subject, class_review_status, quest_type, is_active, header_image_url, image_url, metadata)') \
            .eq('user_id', user_id) \
            .execute().data or []

        seen = set()
        classes = []
        for e in enrollments:
            q = e.get('quests') or {}
            qid = q.get('id')
            if not qid or qid in seen:
                continue
            if q.get('quest_type') != 'class' or not q.get('is_active'):
                continue
            seen.add(qid)

            subject = q.get('transcript_subject')
            progress = _compute_class_progress(supabase, qid, user_id, subject) if subject else {'approved_xp': 0}
            approved_xp = progress['approved_xp']
            credits_earned = approved_xp // CLASS_TARGET_XP
            classes.append({
                'quest_id': qid,
                'title': q.get('title'),
                'transcript_subject': subject,
                'transcript_subject_display': get_display_name(subject or ''),
                'header_image_url': q.get('header_image_url'),
                'image_url': q.get('image_url'),
                'header_style': (q.get('metadata') or {}).get('header_style'),
                'review_status': q.get('class_review_status'),
                'target_xp': CLASS_TARGET_XP,
                'approved_xp': approved_xp,
                'credits_earned': credits_earned,
                'xp_toward_next_credit': approved_xp - (credits_earned * CLASS_TARGET_XP),
            })

        return success_response(data={'classes': classes})

    except Exception as e:
        logger.error(f"list_my_classes failed: {e}", exc_info=True)
        return error_response(code='FETCH_ERROR', message='Failed to load classes', status=500)


@bp.route('/<quest_id>/class-progress', methods=['GET'])
@require_auth
def get_class_progress(user_id: str, quest_id: str):
    """Return subject-XP progress for a class quest."""
    try:
        supabase = get_supabase_admin_client()
        quest = supabase.table('quests') \
            .select('id, title, quest_type, transcript_subject, class_review_status, class_review_submitted_at, class_review_notes, created_by') \
            .eq('id', quest_id) \
            .single() \
            .execute()
        if not quest.data:
            return error_response(code='NOT_FOUND', message='Quest not found', status=404)

        q = quest.data
        if q.get('quest_type') != 'class':
            return error_response(code='NOT_A_CLASS', message='Quest is not a class', status=400)

        # Authz: owner or admin
        if q.get('created_by') != user_id:
            caller = supabase.table('users').select('role').eq('id', user_id).single().execute()
            if not caller.data or caller.data.get('role') != 'superadmin':
                return error_response(code='FORBIDDEN', message='Not your class', status=403)

        subject = q.get('transcript_subject')
        if not subject:
            return error_response(code='MISSING_SUBJECT', message='Class has no transcript_subject', status=500)

        progress = _compute_class_progress(supabase, quest_id, q['created_by'] or user_id, subject)
        approved_xp = progress['approved_xp']
        credits_earned = approved_xp // CLASS_TARGET_XP
        xp_toward_next = approved_xp - (credits_earned * CLASS_TARGET_XP)

        return success_response(data={
            'quest_id': quest_id,
            'transcript_subject': subject,
            'transcript_subject_display': get_display_name(subject),
            'target_xp': CLASS_TARGET_XP,
            'approved_xp': approved_xp,
            'pending_xp': progress['pending_xp'],
            'credits_earned': credits_earned,
            'xp_toward_next_credit': xp_toward_next,
            'percent': min(100, int((xp_toward_next if credits_earned else approved_xp) / CLASS_TARGET_XP * 100)) if not credits_earned else min(100, int(xp_toward_next / CLASS_TARGET_XP * 100)),
            'review_status': q.get('class_review_status'),
            'review_submitted_at': q.get('class_review_submitted_at'),
            'review_notes': q.get('class_review_notes'),
            'can_submit_for_review': approved_xp >= CLASS_TARGET_XP and q.get('class_review_status') in (None, 'rejected'),
        })

    except Exception as e:
        logger.error(f"class-progress failed for {quest_id}: {e}", exc_info=True)
        return error_response(code='FETCH_ERROR', message='Failed to load class progress', status=500)


@bp.route('/<quest_id>/submit-class-for-review', methods=['POST'])
@require_auth
def submit_class_for_review(user_id: str, quest_id: str):
    """
    Student submits a class for holistic Optio review at >=1000 approved subject XP.

    Sets class_review_status='submitted_for_review' on the quest.
    Per-task credit reviews already occurred via the existing pipeline; this
    is the milestone submission that asks Optio to issue a transcript line.
    """
    try:
        supabase = get_supabase_admin_client()
        quest = supabase.table('quests') \
            .select('id, quest_type, transcript_subject, class_review_status, created_by') \
            .eq('id', quest_id) \
            .single() \
            .execute()
        if not quest.data:
            return error_response(code='NOT_FOUND', message='Quest not found', status=404)
        q = quest.data
        if q.get('quest_type') != 'class':
            return error_response(code='NOT_A_CLASS', message='Quest is not a class', status=400)
        if q.get('created_by') != user_id:
            return error_response(code='FORBIDDEN', message='Not your class', status=403)
        if q.get('class_review_status') == 'submitted_for_review':
            return error_response(code='ALREADY_SUBMITTED', message='Already awaiting review', status=409)

        subject = q.get('transcript_subject')
        progress = _compute_class_progress(supabase, quest_id, user_id, subject)
        if progress['approved_xp'] < CLASS_TARGET_XP:
            return error_response(
                code='INSUFFICIENT_XP',
                message=f'Need {CLASS_TARGET_XP} approved XP; you have {progress["approved_xp"]}',
                status=400,
            )

        supabase.table('quests').update({
            'class_review_status': 'submitted_for_review',
            'class_review_submitted_at': datetime.now(timezone.utc).isoformat(),
            'class_review_notes': None,
        }).eq('id', quest_id).execute()

        logger.info(f"User {user_id[:8]} submitted class {quest_id[:8]} ({subject}) for review")
        return success_response(data={'quest_id': quest_id, 'review_status': 'submitted_for_review'})

    except Exception as e:
        logger.error(f"submit-class-for-review failed: {e}", exc_info=True)
        return error_response(code='SUBMIT_FAILED', message='Failed to submit class', status=500)
