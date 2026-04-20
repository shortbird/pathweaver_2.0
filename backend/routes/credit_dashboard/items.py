"""
Credit Dashboard - Item listing, detail, stats, and student context endpoints.

Endpoints:
- GET  /api/credit-dashboard/items                       - Dashboard items (filtered by role)
- GET  /api/credit-dashboard/items/<completion_id>        - Full detail for one item
- GET  /api/credit-dashboard/stats                        - Aggregate counts
- GET  /api/credit-dashboard/student-context/<student_id> - Student diploma context
"""

from flask import request
# Use per-request admin client (not singleton): the credit dashboard does
# many chained .execute() calls in one handler, and a shared httpx pool
# will periodically surface WinError 10035 on Windows local dev when a
# keepalive socket goes stale. The per-request factory caches a fresh
# client in Flask's g context for the duration of one request. (Singleton
# is reserved for background tasks per its docstring.)
from database import get_supabase_admin_client
from utils.auth.decorators import require_role
from utils.api_response_v1 import success_response, error_response
from utils.roles import get_effective_role

from utils.logger import get_logger

logger = get_logger(__name__)

from . import bp


def resolve_user_name(user_data):
    """Resolve a display name from user data, falling back to first/last name or email."""
    if not user_data:
        return 'Unknown'
    return (
        user_data.get('display_name')
        or f"{user_data.get('first_name', '')} {user_data.get('last_name', '')}".strip()
        or user_data.get('email')
        or 'Unknown'
    )


@bp.route('/items', methods=['GET'])
@require_role('accreditor', 'superadmin', 'org_admin')
def get_dashboard_items(user_id: str):
    """Get credit review items filtered by role and query params."""
    try:
        admin_supabase = get_supabase_admin_client()

        # Determine user's role for scoping
        user_result = admin_supabase.table('users') \
            .select('role, org_role, org_roles, organization_id') \
            .eq('id', user_id) \
            .single() \
            .execute()

        user_data = user_result.data or {}
        effective_role = get_effective_role(user_data)

        # Parse query params
        status_filter = request.args.get('status')
        accreditor_status_filter = request.args.get('accreditor_status')
        student_id_filter = request.args.get('student_id')
        subject_filter = request.args.get('subject')
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 50)), 100)

        # Determine which student IDs to scope to
        student_ids = None

        if effective_role == 'org_admin':
            # Org admins see only students in their organization
            org_id = user_data.get('organization_id')
            if org_id:
                org_students = admin_supabase.table('users') \
                    .select('id') \
                    .eq('organization_id', org_id) \
                    .execute()
                student_ids = [s['id'] for s in (org_students.data or [])]
            if not student_ids:
                return success_response(data={'items': [], 'total': 0, 'page': page, 'per_page': per_page})
            # No default status filter -- org_admin sees all actionable items from their org
        elif effective_role == 'advisor':
            # Advisors see only their assigned students
            assignments = admin_supabase.table('advisor_student_assignments') \
                .select('student_id') \
                .eq('advisor_id', user_id) \
                .eq('is_active', True) \
                .execute()
            student_ids = [a['student_id'] for a in (assignments.data or [])]
            if not student_ids:
                return success_response(data={'items': [], 'total': 0, 'page': page, 'per_page': per_page})
        elif effective_role == 'accreditor':
            # Accreditors see all students but only approved+ items
            if not status_filter:
                status_filter = 'approved'

        # Build query
        query = admin_supabase.table('quest_task_completions') \
            .select('id, user_id, quest_id, diploma_status, accreditor_status, revision_number, user_quest_task_id, credit_requested_at, merged_into, finalized_at, credit_reviewer_id', count='exact')

        # Apply filters
        if status_filter:
            query = query.eq('diploma_status', status_filter)
        else:
            # Default: show actionable items (not none/draft/merged)
            query = query.in_('diploma_status', ['pending_review', 'pending_org_approval', 'pending_optio_approval', 'approved', 'grow_this', 'finalized'])

        if accreditor_status_filter:
            query = query.eq('accreditor_status', accreditor_status_filter)

        if student_ids is not None:
            query = query.in_('user_id', student_ids)

        if student_id_filter:
            query = query.eq('user_id', student_id_filter)

        if date_from:
            query = query.gte('credit_requested_at', date_from)
        if date_to:
            query = query.lte('credit_requested_at', date_to)

        # Pagination
        offset = (page - 1) * per_page
        query = query.order('credit_requested_at', desc=True) \
            .range(offset, offset + per_page - 1)

        completions = query.execute()

        if not completions.data:
            return success_response(data={'items': [], 'total': completions.count or 0, 'page': page, 'per_page': per_page})

        # Enrich with student, task, quest data
        c_student_ids = list(set(c['user_id'] for c in completions.data))
        task_ids = list(set(c['user_quest_task_id'] for c in completions.data if c.get('user_quest_task_id')))
        quest_ids = list(set(c['quest_id'] for c in completions.data if c.get('quest_id')))

        # Batch fetch students
        students_map = {}
        if c_student_ids:
            students = admin_supabase.table('users') \
                .select('id, display_name, first_name, last_name, email, avatar_url, organization_id') \
                .in_('id', c_student_ids) \
                .execute()
            students_map = {s['id']: s for s in (students.data or [])}

        # Batch fetch tasks
        tasks_map = {}
        if task_ids:
            tasks = admin_supabase.table('user_quest_tasks') \
                .select('id, title, pillar, xp_value, diploma_subjects, subject_xp_distribution') \
                .in_('id', task_ids) \
                .execute()
            tasks_map = {t['id']: t for t in (tasks.data or [])}

        # Batch fetch quests
        quests_map = {}
        if quest_ids:
            quests = admin_supabase.table('quests') \
                .select('id, title') \
                .in_('id', quest_ids) \
                .execute()
            quests_map = {q['id']: q for q in (quests.data or [])}

        # Batch fetch evidence block counts
        evidence_counts = {}
        if task_ids:
            from collections import Counter
            all_docs = admin_supabase.table('user_task_evidence_documents') \
                .select('id, task_id, user_id') \
                .in_('task_id', task_ids) \
                .execute()
            doc_map = {}
            for d in (all_docs.data or []):
                doc_map[(d['task_id'], d['user_id'])] = d['id']
            doc_ids = list(doc_map.values())
            block_counts = Counter()
            if doc_ids:
                all_blocks = admin_supabase.table('evidence_document_blocks') \
                    .select('document_id') \
                    .in_('document_id', doc_ids) \
                    .execute()
                block_counts = Counter(b['document_id'] for b in (all_blocks.data or []))
            for c in completions.data:
                tid = c.get('user_quest_task_id')
                uid = c.get('user_id')
                doc_id = doc_map.get((tid, uid))
                if doc_id:
                    evidence_counts[c['id']] = block_counts.get(doc_id, 0)

        # Build response items
        from routes.tasks import get_subject_xp_distribution
        items = []
        for c in completions.data:
            student = students_map.get(c['user_id'], {})
            task = tasks_map.get(c.get('user_quest_task_id'), {})
            quest = quests_map.get(c.get('quest_id'), {})
            xp_value = task.get('xp_value', 0)
            subjects = get_subject_xp_distribution(task, xp_value) if task else {}

            items.append({
                'completion_id': c['id'],
                'student_id': c['user_id'],
                'student_name': resolve_user_name(student),
                'student_avatar': student.get('avatar_url'),
                'task_id': c.get('user_quest_task_id'),
                'task_title': task.get('title', 'Unknown Task'),
                'quest_title': quest.get('title', 'Unknown Quest'),
                'pillar': task.get('pillar'),
                'xp_value': xp_value,
                'suggested_subjects': subjects,
                'diploma_status': c.get('diploma_status'),
                'accreditor_status': c.get('accreditor_status', 'not_reviewed'),
                'revision_number': c.get('revision_number', 1),
                'submitted_at': c.get('credit_requested_at'),
                'finalized_at': c.get('finalized_at'),
                'merged_into': c.get('merged_into'),
                'evidence_block_count': evidence_counts.get(c['id'], 0),
                'is_org_student': bool(student.get('organization_id'))
            })

        return success_response(data={
            'items': items,
            'total': completions.count or len(items),
            'page': page,
            'per_page': per_page
        })

    except Exception as e:
        logger.error(f"Error fetching dashboard items: {str(e)}")
        return error_response(code='FETCH_ERROR', message='Failed to fetch dashboard items', status=500)


@bp.route('/items/<completion_id>', methods=['GET'])
@require_role('accreditor', 'superadmin', 'org_admin')
def get_dashboard_item_detail(user_id: str, completion_id: str):
    """Get full detail for a credit review item including evidence and review history."""
    try:
        admin_supabase = get_supabase_admin_client()

        # Get completion
        completion = admin_supabase.table('quest_task_completions') \
            .select('id, user_id, quest_id, diploma_status, accreditor_status, revision_number, user_quest_task_id, credit_requested_at, merged_into, finalized_at, credit_reviewer_id') \
            .eq('id', completion_id) \
            .single() \
            .execute()

        if not completion.data:
            return error_response(code='NOT_FOUND', message='Completion not found', status=404)

        completion_data = completion.data
        student_id = completion_data['user_id']

        # Get task data
        task_data = {}
        if completion_data.get('user_quest_task_id'):
            task_result = admin_supabase.table('user_quest_tasks') \
                .select('id, title, description, pillar, xp_value, diploma_subjects, subject_xp_distribution') \
                .eq('id', completion_data['user_quest_task_id']) \
                .single() \
                .execute()
            task_data = task_result.data or {}

        # Get quest
        quest_data = {}
        if completion_data.get('quest_id'):
            quest_result = admin_supabase.table('quests') \
                .select('id, title') \
                .eq('id', completion_data['quest_id']) \
                .single() \
                .execute()
            quest_data = quest_result.data or {}

        # Get student info
        student = admin_supabase.table('users') \
            .select('id, display_name, first_name, last_name, email, avatar_url, organization_id') \
            .eq('id', student_id) \
            .single() \
            .execute()

        # Verify org_admin can only view their own org's students
        if student.data:
            caller = admin_supabase.table('users') \
                .select('role, organization_id') \
                .eq('id', user_id) \
                .single() \
                .execute()
            caller_data = caller.data or {}
            caller_eff = get_effective_role(caller_data)
            if caller_eff == 'org_admin':
                caller_org = caller_data.get('organization_id')
                student_org = student.data.get('organization_id')
                if not caller_org or caller_org != student_org:
                    return error_response(code='FORBIDDEN', message='Not authorized to view this student', status=403)

        # Get evidence blocks
        evidence_blocks_data = []
        task_id_for_evidence = completion_data.get('user_quest_task_id', '')
        if task_id_for_evidence:
            doc_result = admin_supabase.table('user_task_evidence_documents') \
                .select('id') \
                .eq('task_id', task_id_for_evidence) \
                .eq('user_id', student_id) \
                .limit(1) \
                .execute()
            if doc_result.data:
                blocks_result = admin_supabase.table('evidence_document_blocks') \
                    .select('*') \
                    .eq('document_id', doc_result.data[0]['id']) \
                    .order('order_index') \
                    .execute()
                evidence_blocks_data = blocks_result.data or []

        # Get diploma review rounds
        rounds = admin_supabase.table('diploma_review_rounds') \
            .select('*') \
            .eq('completion_id', completion_id) \
            .order('round_number') \
            .execute()

        # Get accreditor reviews (table may not exist yet)
        try:
            accreditor_reviews = admin_supabase.table('accreditor_reviews') \
                .select('*, users!reviewer_id(display_name)') \
                .eq('completion_id', completion_id) \
                .order('created_at') \
                .execute()
        except Exception:
            accreditor_reviews = type('obj', (object,), {'data': []})()

        # Get subject XP distribution
        from routes.tasks import get_subject_xp_distribution
        xp_value = task_data.get('xp_value', 0)
        subjects = get_subject_xp_distribution(task_data, xp_value) if task_data else {}

        # Get student's current subject XP for context
        student_subject_xp = admin_supabase.table('user_subject_xp') \
            .select('school_subject, xp_amount, pending_xp') \
            .eq('user_id', student_id) \
            .execute()

        # Inject resolved display_name into student data
        student_data = student.data or {}
        student_data['display_name'] = resolve_user_name(student_data)

        return success_response(data={
            'completion': completion_data,
            'task': task_data,
            'quest': quest_data,
            'student': student_data,
            'evidence_blocks': evidence_blocks_data,
            'review_rounds': rounds.data or [],
            'accreditor_reviews': accreditor_reviews.data or [],
            'suggested_subjects': subjects,
            'student_subject_xp': student_subject_xp.data or [],
            'is_org_student': bool(student_data.get('organization_id'))
        })

    except Exception as e:
        logger.error(f"Error fetching dashboard item detail: {str(e)}")
        return error_response(code='FETCH_ERROR', message='Failed to fetch item detail', status=500)


@bp.route('/stats', methods=['GET'])
@require_role('accreditor', 'superadmin', 'org_admin')
def get_dashboard_stats(user_id: str):
    """Get aggregate counts for dashboard overview."""
    try:
        admin_supabase = get_supabase_admin_client()

        # Check role for scoping
        user_result = admin_supabase.table('users') \
            .select('role, org_role, org_roles, organization_id') \
            .eq('id', user_id) \
            .single() \
            .execute()
        user_data = user_result.data or {}
        effective_role = get_effective_role(user_data)

        student_ids = None
        if effective_role == 'org_admin':
            org_id = user_data.get('organization_id')
            if org_id:
                org_students = admin_supabase.table('users') \
                    .select('id') \
                    .eq('organization_id', org_id) \
                    .execute()
                student_ids = [s['id'] for s in (org_students.data or [])]
            if not student_ids:
                return success_response(data={
                    'pending_org_approval': 0, 'pending_advisor': 0,
                    'pending_accreditor': 0, 'confirmed': 0,
                    'flagged': 0, 'merged_this_week': 0
                })
        elif effective_role == 'advisor':
            assignments = admin_supabase.table('advisor_student_assignments') \
                .select('student_id') \
                .eq('advisor_id', user_id) \
                .eq('is_active', True) \
                .execute()
            student_ids = [a['student_id'] for a in (assignments.data or [])]
            if not student_ids:
                return success_response(data={
                    'pending_org_approval': 0, 'pending_advisor': 0,
                    'pending_accreditor': 0, 'confirmed': 0,
                    'flagged': 0, 'merged_this_week': 0
                })

        # Count by status
        def count_status(diploma_status=None, accreditor_status=None):
            q = admin_supabase.table('quest_task_completions') \
                .select('id', count='exact')
            if diploma_status:
                q = q.eq('diploma_status', diploma_status)
            if accreditor_status:
                q = q.eq('accreditor_status', accreditor_status)
            if student_ids is not None:
                q = q.in_('user_id', student_ids)
            result = q.execute()
            return result.count or 0

        stats = {
            'pending_org_approval': count_status(diploma_status='pending_org_approval'),
            'pending_optio_approval': count_status(diploma_status='pending_optio_approval'),
            'pending_advisor': count_status(diploma_status='pending_review'),
            'pending_accreditor': count_status(accreditor_status='pending_accreditor'),
            'confirmed': count_status(accreditor_status='confirmed'),
            'flagged': count_status(accreditor_status='flagged'),
            'merged_this_week': 0
        }

        # Count merges this week (table may not exist yet)
        try:
            from datetime import datetime, timedelta
            week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
            merge_q = admin_supabase.table('task_merges') \
                .select('id', count='exact') \
                .gte('created_at', week_ago)
            if student_ids is not None:
                merge_q = merge_q.in_('student_id', student_ids)
            merge_result = merge_q.execute()
            stats['merged_this_week'] = merge_result.count or 0
        except Exception:
            logger.debug("intentional swallow", exc_info=True)

        return success_response(data=stats)

    except Exception as e:
        logger.error(f"Error fetching dashboard stats: {str(e)}")
        return error_response(code='FETCH_ERROR', message='Failed to fetch stats', status=500)


@bp.route('/student-context/<student_id>', methods=['GET'])
@require_role('accreditor', 'superadmin', 'org_admin')
def get_student_context(user_id: str, student_id: str):
    """Get student's diploma progress and pending items for context panel."""
    try:
        admin_supabase = get_supabase_admin_client()

        # Student info
        student = admin_supabase.table('users') \
            .select('id, display_name, first_name, last_name, email, avatar_url, total_xp') \
            .eq('id', student_id) \
            .single() \
            .execute()

        if not student.data:
            return error_response(code='NOT_FOUND', message='Student not found', status=404)

        # Inject resolved display_name
        student.data['display_name'] = resolve_user_name(student.data)

        # Subject XP breakdown
        subject_xp = admin_supabase.table('user_subject_xp') \
            .select('school_subject, xp_amount, pending_xp') \
            .eq('user_id', student_id) \
            .execute()

        # Pending/approved completions for this student
        pending_items = admin_supabase.table('quest_task_completions') \
            .select('id, diploma_status, accreditor_status, user_quest_task_id') \
            .eq('user_id', student_id) \
            .in_('diploma_status', ['pending_org_approval', 'pending_optio_approval', 'pending_review', 'approved', 'grow_this']) \
            .order('credit_requested_at', desc=True) \
            .limit(20) \
            .execute()

        # Enrich pending items with task titles
        pending_task_ids = [p['user_quest_task_id'] for p in (pending_items.data or []) if p.get('user_quest_task_id')]
        tasks_map = {}
        if pending_task_ids:
            tasks = admin_supabase.table('user_quest_tasks') \
                .select('id, title, xp_value') \
                .in_('id', pending_task_ids) \
                .execute()
            tasks_map = {t['id']: t for t in (tasks.data or [])}

        pending_list = []
        for p in (pending_items.data or []):
            task = tasks_map.get(p.get('user_quest_task_id'), {})
            pending_list.append({
                'completion_id': p['id'],
                'task_title': task.get('title', 'Unknown'),
                'xp_value': task.get('xp_value', 0),
                'diploma_status': p['diploma_status'],
                'accreditor_status': p.get('accreditor_status', 'not_reviewed')
            })

        # Recent merges for this student (table may not exist yet)
        recent_merges_data = []
        try:
            recent_merges = admin_supabase.table('task_merges') \
                .select('id, final_xp, merge_reason, created_at') \
                .eq('student_id', student_id) \
                .order('created_at', desc=True) \
                .limit(5) \
                .execute()
            recent_merges_data = recent_merges.data or []
        except Exception:
            logger.debug("intentional swallow", exc_info=True)

        # Recent flags (table may not exist yet)
        student_flags = []
        try:
            recent_flags = admin_supabase.table('accreditor_reviews') \
                .select('id, completion_id, status, flag_reason, created_at') \
                .eq('status', 'flagged') \
                .order('created_at', desc=True) \
                .limit(5) \
                .execute()
            student_completion_ids = [p['id'] for p in (pending_items.data or [])]
            student_flags = [f for f in (recent_flags.data or []) if f['completion_id'] in student_completion_ids]
        except Exception:
            logger.debug("intentional swallow", exc_info=True)

        return success_response(data={
            'student': student.data,
            'subject_xp': subject_xp.data or [],
            'pending_items': pending_list,
            'recent_merges': recent_merges_data,
            'recent_flags': student_flags
        })

    except Exception as e:
        logger.error(f"Error fetching student context: {str(e)}")
        return error_response(code='FETCH_ERROR', message='Failed to fetch student context', status=500)
