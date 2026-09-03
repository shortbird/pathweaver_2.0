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
from utils.auth.org_scope import caller_can_access_user
from utils.api_response_v1 import success_response, error_response
from utils.roles import get_effective_roles

from utils.logger import get_logger
from utils.storage_urls import sign_in_place

logger = get_logger(__name__)

from . import bp

# Returned by _scoped_student_ids for a caller who reviews across every org.
# Distinct from None, which used to mean the same thing implicitly and was also
# what an unrecognized role fell through to -- see the docstring below.
UNRESTRICTED = object()

# Roles that review their whole organization's queue. Coordinators sit with
# org admins: the coordinator restriction is financial, not scope-based.
ORG_WIDE_ROLES = ('org_admin', 'campus_coordinator')


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


def _org_student_ids(admin, org_id):
    """Every user id in an org. Empty list when the org is missing."""
    if not org_id:
        return []
    rows = admin.table('users').select('id').eq('organization_id', org_id).execute()
    return [s['id'] for s in (rows.data or [])]


def _scoped_student_ids(admin, user_id, user_data, org_id_filter):
    """Which students this caller may review: a list of ids, or UNRESTRICTED.

    Two bugs are closed here, and both handlers below share the fix:

    1. Role resolution used the singular effective role, which is only the FIRST
       of an account's org roles. A teacher who is also a parent resolves to
       'parent' and matched no branch (the same mistake as Sentry OPTIO-WEB-7/8).
    2. Falling through every branch left the scope unset, and unset meant "no
       filter" -- every org's submissions. That is unreachable behind the
       current decorator, where only superadmin falls through and is meant to
       see everything, but it made the safety of this query depend on a
       decorator two hundred lines away. An unrecognized role now scopes to
       nothing instead of to everything.
    """
    roles = get_effective_roles(user_data)
    if 'superadmin' in roles:
        # Scoped when previewing one org (embedded in org management), else the
        # platform-wide review queue.
        return _org_student_ids(admin, org_id_filter) if org_id_filter else UNRESTRICTED
    if any(r in ORG_WIDE_ROLES for r in roles):
        # org_id param is ignored on purpose: they can never widen their scope.
        return _org_student_ids(admin, user_data.get('organization_id'))
    if 'advisor' in roles:
        rows = admin.table('advisor_student_assignments') \
            .select('student_id').eq('advisor_id', user_id) \
            .eq('is_active', True).execute()
        return [a['student_id'] for a in (rows.data or [])]
    return []


@bp.route('/items', methods=['GET'])
@require_role('superadmin', 'org_admin')
def get_dashboard_items(user_id: str):
    """Get credit review items filtered by role and query params."""
    try:
        # admin client justified: dashboard handler runs cross-org queries (org+student scoping enforced by @require_role and per-row checks below); RLS would block these reads.
        admin_supabase = get_supabase_admin_client()

        # Determine user's role for scoping
        user_result = admin_supabase.table('users') \
            .select('role, org_role, org_roles, organization_id') \
            .eq('id', user_id) \
            .single() \
            .execute()

        user_data = user_result.data or {}

        # Parse query params
        status_filter = request.args.get('status')
        student_id_filter = request.args.get('student_id')
        subject_filter = request.args.get('subject')
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        org_id_filter = request.args.get('org_id')
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 50)), 100)

        # Determine which student IDs to scope to
        scope = _scoped_student_ids(admin_supabase, user_id, user_data, org_id_filter)
        student_ids = None if scope is UNRESTRICTED else scope
        if student_ids is not None and not student_ids:
            return success_response(data={'items': [], 'total': 0, 'page': page, 'per_page': per_page})

        # Build query
        query = admin_supabase.table('quest_task_completions') \
            .select('id, user_id, quest_id, diploma_status, revision_number, user_quest_task_id, credit_requested_at, merged_into, finalized_at, credit_reviewer_id, org_reviewer_id', count='exact')

        # Apply filters
        if status_filter:
            query = query.eq('diploma_status', status_filter)
        else:
            # Default: show actionable items (not none/draft/merged)
            query = query.in_('diploma_status', ['pending_review', 'pending_org_approval', 'grow_this', 'finalized'])

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
                'revision_number': c.get('revision_number', 1),
                'submitted_at': c.get('credit_requested_at'),
                'finalized_at': c.get('finalized_at'),
                'merged_into': c.get('merged_into'),
                'evidence_block_count': evidence_counts.get(c['id'], 0),
                'is_org_student': bool(student.get('organization_id'))
            })

        # Private-bucket photos: one batch for the whole review queue.
        sign_in_place(items, ['student_avatar'])

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
@require_role('superadmin', 'org_admin')
def get_dashboard_item_detail(user_id: str, completion_id: str):
    """Get full detail for a credit review item including evidence and review history."""
    try:
        # admin client justified: dashboard handler runs cross-org queries (org+student scoping enforced by @require_role and per-row checks below); RLS would block these reads.
        admin_supabase = get_supabase_admin_client()

        # Get completion
        completion = admin_supabase.table('quest_task_completions') \
            .select('id, user_id, quest_id, diploma_status, revision_number, user_quest_task_id, credit_requested_at, merged_into, finalized_at, credit_reviewer_id, org_reviewer_id') \
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
                .select('id, title, description, success_criteria, pillar, xp_value, diploma_subjects, subject_xp_distribution') \
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

        # Verify a non-superadmin caller only views their own org's students.
        #
        # This check silently did nothing. It selected `role, organization_id`
        # without org_role/org_roles, so get_effective_role saw role
        # 'org_managed' with nothing to resolve it to and fell through to its
        # 'student' default -- meaning `caller_eff == 'org_admin'` was False for
        # every org admin alive, and the org comparison was never reached. Any
        # org admin could open any completion in any other organization.
        #
        # Stated the other way round now: superadmin reviews across orgs,
        # everyone else must share the student's org. A future role added to the
        # decorator is then denied by default rather than admitted silently.
        if student.data:
            caller = admin_supabase.table('users') \
                .select('role, org_role, org_roles, organization_id') \
                .eq('id', user_id) \
                .single() \
                .execute()
            caller_data = caller.data or {}
            if 'superadmin' not in get_effective_roles(caller_data):
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
                # Serve signed, never public: `quest-evidence` is private, so
                # the stored URLs are durable pointers, not fetchable links.
                from services.portfolio_service import PortfolioService
                PortfolioService().sign_evidence_blocks(evidence_blocks_data)

        # Get diploma review rounds
        rounds = admin_supabase.table('diploma_review_rounds') \
            .select('*') \
            .eq('completion_id', completion_id) \
            .order('round_number') \
            .execute()

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
        sign_in_place([student_data], ['avatar_url'])

        return success_response(data={
            'completion': completion_data,
            'task': task_data,
            'quest': quest_data,
            'student': student_data,
            'evidence_blocks': evidence_blocks_data,
            'review_rounds': rounds.data or [],
            'suggested_subjects': subjects,
            'student_subject_xp': student_subject_xp.data or [],
            'is_org_student': bool(student_data.get('organization_id'))
        })

    except Exception as e:
        logger.error(f"Error fetching dashboard item detail: {str(e)}")
        return error_response(code='FETCH_ERROR', message='Failed to fetch item detail', status=500)


@bp.route('/stats', methods=['GET'])
@require_role('superadmin', 'org_admin')
def get_dashboard_stats(user_id: str):
    """Get aggregate counts for dashboard overview."""
    try:
        # admin client justified: dashboard handler runs cross-org queries (org+student scoping enforced by @require_role and per-row checks below); RLS would block these reads.
        admin_supabase = get_supabase_admin_client()

        # Check role for scoping
        user_result = admin_supabase.table('users') \
            .select('role, org_role, org_roles, organization_id') \
            .eq('id', user_id) \
            .single() \
            .execute()
        user_data = user_result.data or {}

        org_id_filter = request.args.get('org_id')
        scope = _scoped_student_ids(admin_supabase, user_id, user_data, org_id_filter)
        student_ids = None if scope is UNRESTRICTED else scope
        if student_ids is not None and not student_ids:
            return success_response(data={
                'pending_org_approval': 0,
                'pending_review': 0,
                'finalized': 0,
                'merged_this_week': 0
            })

        # Count by status
        def count_status(diploma_status=None):
            q = admin_supabase.table('quest_task_completions') \
                .select('id', count='exact')
            if diploma_status:
                q = q.eq('diploma_status', diploma_status)
            if student_ids is not None:
                q = q.in_('user_id', student_ids)
            result = q.execute()
            return result.count or 0

        stats = {
            'pending_org_approval': count_status(diploma_status='pending_org_approval'),
            'pending_review': count_status(diploma_status='pending_review'),
            'finalized': count_status(diploma_status='finalized'),
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
@require_role('superadmin', 'org_admin')
def get_student_context(user_id: str, student_id: str):
    """Get student's diploma progress and pending items for context panel."""
    try:
        # admin client justified: dashboard handler runs cross-org queries (org+student scoping enforced by @require_role and per-row checks below); RLS would block these reads.
        admin_supabase = get_supabase_admin_client()

        # Student info
        student = admin_supabase.table('users') \
            .select('id, display_name, first_name, last_name, email, avatar_url, total_xp') \
            .eq('id', student_id) \
            .single() \
            .execute()

        if not student.data:
            return error_response(code='NOT_FOUND', message='Student not found', status=404)

        # IDOR-H11 fix: org_admins may only view their own org's students
        # (mirror get_dashboard_item_detail). Superadmin exempt.
        if not caller_can_access_user(admin_supabase, user_id, student_id):
            return error_response(code='FORBIDDEN', message='Not authorized to view this student', status=403)

        # Inject resolved display_name
        student.data['display_name'] = resolve_user_name(student.data)

        # Subject XP breakdown
        subject_xp = admin_supabase.table('user_subject_xp') \
            .select('school_subject, xp_amount, pending_xp') \
            .eq('user_id', student_id) \
            .execute()

        # Pending completions for this student
        pending_items = admin_supabase.table('quest_task_completions') \
            .select('id, diploma_status, user_quest_task_id') \
            .eq('user_id', student_id) \
            .in_('diploma_status', ['pending_org_approval', 'pending_review', 'grow_this']) \
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
                'diploma_status': p['diploma_status']
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

        sign_in_place([student.data], ['avatar_url'])
        return success_response(data={
            'student': student.data,
            'subject_xp': subject_xp.data or [],
            'pending_items': pending_list,
            'recent_merges': recent_merges_data
        })

    except Exception as e:
        logger.error(f"Error fetching student context: {str(e)}")
        return error_response(code='FETCH_ERROR', message='Failed to fetch student context', status=500)
