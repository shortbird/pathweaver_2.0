"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- Multiple direct database calls for dashboard data aggregation
- Uses helper functions from users/helpers.py for XP calculations
- Could create DashboardRepository with methods:
  - get_user_subject_xp(user_id)
  - get_dashboard_summary(user_id)
  - get_user_progress_stats(user_id)
- Complex aggregation queries suitable for repository abstraction

User dashboard routes
"""

from flask import Blueprint, jsonify
from datetime import datetime, timezone
from database import get_supabase_admin_client
from repositories import (
    UserRepository,
    QuestRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
from utils.auth.decorators import require_auth
from middleware.error_handler import NotFoundError
from .helpers import calculate_user_xp, get_user_level, format_skill_data, SKILL_CATEGORIES, calculate_subject_xp_from_tasks

from utils.logger import get_logger

logger = get_logger(__name__)

dashboard_bp = Blueprint('dashboard', __name__)


def get_enrolled_courses(supabase, user_id: str) -> tuple:
    """
    Get user's enrolled courses with progress data and quest details.
    Returns (courses_list, course_quest_ids) where course_quest_ids is a set of
    all quest IDs that belong to enrolled courses (for exclusion from standalone quests).
    """
    try:
        logger.info(f"Fetching enrolled courses for user {user_id[:8]}...")

        # Fetch active course enrollments with course details
        enrollments = supabase.table('course_enrollments')\
            .select('*, courses(*)')\
            .eq('user_id', user_id)\
            .eq('status', 'active')\
            .execute()

        logger.info(f"Found {len(enrollments.data or [])} active enrollments")

        if not enrollments.data:
            return [], set()

        courses_with_progress = []
        all_course_quest_ids = set()

        for enrollment in enrollments.data:
            course = enrollment.get('courses', {})
            if not course:
                continue

            course_id = course.get('id')

            # Get quests in this course with quest details
            course_quests = supabase.table('course_quests')\
                .select('quest_id, sequence_order, quests(id, title, description, image_url, header_image_url)')\
                .eq('course_id', course_id)\
                .order('sequence_order')\
                .execute()

            quest_ids = [cq['quest_id'] for cq in (course_quests.data or [])]
            all_course_quest_ids.update(quest_ids)

            # Get user's enrollment status for each quest
            user_quest_enrollments = {}
            if quest_ids:
                uq_response = supabase.table('user_quests')\
                    .select('id, quest_id, is_active, completed_at')\
                    .eq('user_id', user_id)\
                    .in_('quest_id', quest_ids)\
                    .execute()

                for uq in (uq_response.data or []):
                    user_quest_enrollments[uq['quest_id']] = uq

            # Batch fetch all tasks and completions upfront to avoid N+1 queries
            user_quest_ids = [uq['id'] for uq in user_quest_enrollments.values() if uq.get('id')]

            # Build task count lookup: user_quest_id -> count of approved tasks
            task_counts = {}
            task_id_to_user_quest = {}  # Map task_id -> user_quest_id for completions lookup

            if user_quest_ids:
                # Fetch all tasks for all user quests in one query
                all_tasks_response = supabase.table('user_quest_tasks')\
                    .select('id, user_quest_id')\
                    .in_('user_quest_id', user_quest_ids)\
                    .eq('approval_status', 'approved')\
                    .execute()

                # Build lookup maps
                for task in (all_tasks_response.data or []):
                    uq_id = task['user_quest_id']
                    task_counts[uq_id] = task_counts.get(uq_id, 0) + 1
                    task_id_to_user_quest[task['id']] = uq_id

                # Fetch all completions for all tasks in one query
                all_task_ids = list(task_id_to_user_quest.keys())
                completion_counts = {}

                if all_task_ids:
                    completions_response = supabase.table('quest_task_completions')\
                        .select('user_quest_task_id')\
                        .eq('user_id', user_id)\
                        .in_('user_quest_task_id', all_task_ids)\
                        .execute()

                    # Count completions per user_quest_id
                    for completion in (completions_response.data or []):
                        task_id = completion['user_quest_task_id']
                        uq_id = task_id_to_user_quest.get(task_id)
                        if uq_id:
                            completion_counts[uq_id] = completion_counts.get(uq_id, 0) + 1

            # Build quest details with progress
            quests_with_progress = []
            completed_count = 0
            total_count = len(quest_ids)

            for cq in (course_quests.data or []):
                quest_id = cq['quest_id']
                quest_info = cq.get('quests', {}) or {}
                user_quest = user_quest_enrollments.get(quest_id, {})

                # Determine quest completion status
                is_completed = user_quest.get('completed_at') and not user_quest.get('is_active')
                is_enrolled = bool(user_quest.get('id'))

                if is_completed:
                    completed_count += 1

                # Get task progress from preloaded data
                completed_tasks = 0
                total_tasks = 0

                if user_quest.get('id'):
                    uq_id = user_quest['id']
                    total_tasks = task_counts.get(uq_id, 0)
                    completed_tasks = completion_counts.get(uq_id, 0)

                quests_with_progress.append({
                    'id': quest_id,
                    'title': quest_info.get('title', 'Untitled Quest'),
                    'description': quest_info.get('description'),
                    'image_url': quest_info.get('image_url'),
                    'header_image_url': quest_info.get('header_image_url'),
                    'sequence_order': cq.get('sequence_order', 0),
                    'is_enrolled': is_enrolled,
                    'is_completed': is_completed,
                    'progress': {
                        'completed_tasks': completed_tasks,
                        'total_tasks': total_tasks,
                        'percentage': round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0
                    }
                })

            courses_with_progress.append({
                'id': course_id,
                'title': course.get('title'),
                'description': course.get('description'),
                'cover_image_url': course.get('cover_image_url'),
                'status': enrollment.get('status'),
                'enrolled_at': enrollment.get('enrolled_at'),
                'current_quest_id': enrollment.get('current_quest_id'),
                'progress': {
                    'completed_quests': completed_count,
                    'total_quests': total_count,
                    'percentage': round((completed_count / total_count * 100), 1) if total_count > 0 else 0
                },
                'quests': quests_with_progress,
                'quest_ids': quest_ids
            })
            logger.info(f"Course '{course.get('title')}' has {len(quests_with_progress)} quests, quest_ids to exclude: {quest_ids[:3]}...")

        logger.info(f"Total course quest IDs to exclude: {len(all_course_quest_ids)}")
        return courses_with_progress, all_course_quest_ids

    except Exception as e:
        logger.error(f"Error fetching enrolled courses: {str(e)}")
        return [], set()


@dashboard_bp.route('/subject-xp', methods=['GET'])
@require_auth
def get_user_subject_xp(user_id):
    """Get user's XP by school subject for diploma credits"""
    # Admin client: Auth verified by decorator (ADR-002, Rule 3)
    supabase = get_supabase_admin_client()

    try:
        # Fetch subject XP data
        response = supabase.table('user_subject_xp')\
            .select('school_subject, xp_amount')\
            .eq('user_id', user_id)\
            .execute()

        subject_xp = response.data or []

        # If no subject XP in table, calculate from COMPLETED tasks' diploma_subjects
        # This handles org students whose subject XP isn't synced
        # IMPORTANT: Only count tasks that have been marked as done (in quest_task_completions)
        if not subject_xp:
            # Get completed tasks (those actually marked as done with evidence)
            completed_tasks = supabase.table('quest_task_completions')\
                .select('user_quest_task_id, user_quest_tasks(xp_value, diploma_subjects)')\
                .eq('user_id', user_id)\
                .execute()

            if completed_tasks.data:
                logger.info(f"Calculating subject XP from {len(completed_tasks.data)} completed tasks for user {user_id}")
                # Use helper function for proper subject name normalization
                subject_xp_map = calculate_subject_xp_from_tasks(completed_tasks.data)

                # Convert to expected format
                subject_xp = [
                    {'school_subject': subject, 'xp_amount': xp}
                    for subject, xp in subject_xp_map.items()
                ]

        return jsonify({
            'success': True,
            'subject_xp': subject_xp
        })

    except Exception as e:
        logger.error(f"Error fetching subject XP: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch subject XP',
            'subject_xp': []
        }), 500


@dashboard_bp.route('/dashboard', methods=['GET'])
@require_auth
def get_dashboard(user_id):
    """Get user dashboard data including active quests, enrolled courses, and XP stats"""
    # Admin client: Auth verified by decorator (ADR-002, Rule 3)
    supabase = get_supabase_admin_client()

    try:
        # Fetch user data
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()

        if not user.data:
            raise NotFoundError('User', user_id)

        # Get enrolled courses first
        enrolled_courses, _ = get_enrolled_courses(supabase, user_id)

        # Get ALL quest IDs that are part of ANY course (not just enrolled courses)
        # These should never appear as standalone quests on the dashboard
        all_course_quests = supabase.table('course_quests')\
            .select('quest_id')\
            .execute()
        all_course_quest_ids = {cq['quest_id'] for cq in (all_course_quests.data or [])}

        logger.info(f"Excluding {len(all_course_quest_ids)} course-linked quests from standalone list")

        # Get active quests (excluding quests that are part of ANY course)
        active_quests = get_active_quests(supabase, user_id, exclude_quest_ids=all_course_quest_ids)

        # Get completed quests count and recent completions
        # IMPORTANT: A quest is truly completed only if is_active=False AND completed_at is set
        # (Active quests may have completed_at from previous completion, but they're not "completed" anymore)
        completed_quests_response = supabase.table('user_quests')\
            .select('id, quest_id, completed_at, quests(id, title, description, image_url, header_image_url)', count='exact')\
            .eq('user_id', user_id)\
            .eq('is_active', False)\
            .not_.is_('completed_at', 'null')\
            .order('completed_at', desc=True)\
            .limit(5)\
            .execute()

        completed_quests_count = completed_quests_response.count or 0
        recent_completed_quests = completed_quests_response.data or []

        # Get total completed tasks count
        completed_tasks_response = supabase.table('quest_task_completions')\
            .select('*', count='exact')\
            .eq('user_id', user_id)\
            .execute()
        completed_tasks_count = completed_tasks_response.count if completed_tasks_response.count is not None else len(completed_tasks_response.data or [])

        # Calculate XP stats (needed for ConstellationPage and other features)
        total_xp, skill_breakdown = calculate_user_xp(supabase, user_id)

        # Get user level info
        level_info = get_user_level(total_xp)

        # Format skill data for frontend
        skill_data = format_skill_data(skill_breakdown)

        # Build simplified dashboard response
        dashboard_data = {
            'user': user.data,
            'stats': {
                'total_xp': total_xp,
                'level': level_info,
                'completed_quests_count': completed_quests_count,
                'completed_tasks_count': completed_tasks_count
            },
            'xp_by_category': skill_breakdown,
            'skill_xp_data': skill_data,
            'active_quests': active_quests,
            'enrolled_courses': enrolled_courses,
            'recent_completed_quests': recent_completed_quests
        }

        return jsonify(dashboard_data), 200

    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Dashboard error: {str(e)}")
        return jsonify({'error': 'Failed to load dashboard'}), 500


def get_active_quests(supabase, user_id: str, exclude_quest_ids: set = None) -> list:
    """Get user's active quests with details.

    Args:
        supabase: Supabase client
        user_id: User ID
        exclude_quest_ids: Optional set of quest IDs to exclude (e.g., quests part of enrolled courses)
    """
    try:
        # Get active enrollments with quest details
        # IMPORTANT: Only filter by is_active=True, NOT completed_at
        # Restarted quests have both is_active=True AND a completed_at timestamp from previous completion
        # If is_active=True, the quest is active regardless of completed_at value
        query = supabase.table('user_quests')\
            .select('*, quests(*)')\
            .eq('user_id', user_id)\
            .eq('is_active', True)

        active_quests = query.execute()

        # Filter out quests that are part of enrolled courses (using Python filtering for reliability)
        if exclude_quest_ids and active_quests.data:
            original_count = len(active_quests.data)
            active_quests.data = [q for q in active_quests.data if q.get('quest_id') not in exclude_quest_ids]
            filtered_count = original_count - len(active_quests.data)
            logger.info(f"Excluded {filtered_count} course quests from {original_count} active quests, {len(active_quests.data)} remaining")
        else:
            logger.info(f"Found {len(active_quests.data or [])} active quests (no exclusions)")

        if active_quests.data:
            # Filter out "stale" completed quests that were never properly ended
            # A quest is truly active if:
            # 1. is_active=True AND completed_at IS NULL (in progress)
            # 2. is_active=True AND completed_at IS NOT NULL AND last_picked_up_at > completed_at (explicit restart)
            #
            # To detect restarts: check if last_picked_up_at is AFTER completed_at
            # This allows restarts at any time (not just within 24 hours)
            from datetime import datetime, timezone

            active_only = []
            for quest in active_quests.data:
                completed_at = quest.get('completed_at')
                last_picked_up_at = quest.get('last_picked_up_at')

                # If no completed_at, it's truly active
                if not completed_at:
                    active_only.append(quest)
                    continue

                # If completed_at is set, check if this is a legitimate restart
                # by comparing last_picked_up_at with completed_at
                try:
                    completed_dt = datetime.fromisoformat(completed_at.replace('Z', '+00:00'))

                    # If last_picked_up_at exists and is after completed_at, it's a valid restart
                    if last_picked_up_at:
                        picked_up_dt = datetime.fromisoformat(last_picked_up_at.replace('Z', '+00:00'))
                        if picked_up_dt > completed_dt:
                            # Legitimate restart - user explicitly restarted after completion
                            active_only.append(quest)
                            continue

                    # If we get here, it's a stale completion (completed but never properly ended)
                    logger.info(f"Filtering out stale completed quest {quest.get('id')[:8]} (completed_at set but no restart)")

                except (ValueError, AttributeError) as e:
                    # If date parsing fails, include it to be safe
                    logger.warning(f"Could not parse timestamps for quest {quest.get('id')}: {e}")
                    active_only.append(quest)

            # Debug: Log filtering results
            filtered_count = len(active_quests.data) - len(active_only)
            if filtered_count > 0:
                logger.info(f"Filtered out {filtered_count} stale completed quest(s) from active list")

            # Batch fetch all tasks and completions upfront to avoid N+1 queries
            user_quest_ids = [e.get('id') for e in active_only if e.get('id')]

            # Build task lookup: user_quest_id -> list of tasks
            tasks_by_enrollment = {}
            all_task_ids = []

            if user_quest_ids:
                # Fetch all tasks for all enrollments in one query
                all_tasks_response = supabase.table('user_quest_tasks')\
                    .select('*')\
                    .in_('user_quest_id', user_quest_ids)\
                    .eq('approval_status', 'approved')\
                    .order('order_index')\
                    .execute()

                for task in (all_tasks_response.data or []):
                    uq_id = task.get('user_quest_id')
                    if uq_id not in tasks_by_enrollment:
                        tasks_by_enrollment[uq_id] = []
                    tasks_by_enrollment[uq_id].append(task)
                    all_task_ids.append(task['id'])

            # Fetch all completions in one query
            completed_task_ids_set = set()
            if all_task_ids:
                completions_response = supabase.table('quest_task_completions')\
                    .select('user_quest_task_id')\
                    .eq('user_id', user_id)\
                    .in_('user_quest_task_id', all_task_ids)\
                    .execute()

                completed_task_ids_set = {t['user_quest_task_id'] for t in (completions_response.data or [])}

            # Process each quest using preloaded data
            for enrollment in active_only:
                enrollment_id = enrollment.get('id')
                tasks = tasks_by_enrollment.get(enrollment_id, [])
                task_count = len(tasks)

                # Calculate total XP and pillar breakdown
                total_xp = 0
                pillar_breakdown = {}

                for task in tasks:
                    xp_amount = task.get('xp_value', 0)
                    pillar = task.get('pillar', 'creativity')
                    total_xp += xp_amount
                    if pillar not in pillar_breakdown:
                        pillar_breakdown[pillar] = 0
                    pillar_breakdown[pillar] += xp_amount

                # Add calculated fields to quest data
                quest_info = enrollment.get('quests', {})
                quest_info['total_xp'] = total_xp
                quest_info['task_count'] = task_count
                quest_info['pillar_breakdown'] = pillar_breakdown

                # Count completed tasks and mark completion status using preloaded data
                completed_count = 0
                for task in tasks:
                    is_completed = task['id'] in completed_task_ids_set
                    task['is_completed'] = is_completed
                    if is_completed:
                        completed_count += 1

                enrollment['completed_tasks'] = completed_count
                quest_info['quest_tasks'] = tasks

            return active_only
        
    except Exception as e:
        logger.error(f"Error fetching active quests: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        
        # Try simpler query without nested relations
        try:
            fallback_query = supabase.table('user_quests')\
                .select('*')\
                .eq('user_id', user_id)\
                .eq('is_active', True)

            # Apply same exclusion in fallback
            if exclude_quest_ids:
                fallback_query = fallback_query.not_.in_('quest_id', list(exclude_quest_ids))

            active_quests = fallback_query.execute()

            if active_quests.data:
                # Apply same filtering logic as primary query
                from datetime import datetime, timezone

                active_only = []
                for quest in active_quests.data:
                    completed_at = quest.get('completed_at')
                    last_picked_up_at = quest.get('last_picked_up_at')

                    if not completed_at:
                        active_only.append(quest)
                        continue

                    try:
                        completed_dt = datetime.fromisoformat(completed_at.replace('Z', '+00:00'))

                        if last_picked_up_at:
                            picked_up_dt = datetime.fromisoformat(last_picked_up_at.replace('Z', '+00:00'))
                            if picked_up_dt > completed_dt:
                                active_only.append(quest)
                                continue

                        logger.info(f"Fallback: Filtering out stale completed quest {quest.get('id')[:8]} (completed_at set but no restart)")

                    except (ValueError, AttributeError) as e:
                        logger.warning(f"Fallback: Could not parse timestamps for quest {quest.get('id')}: {e}")
                        active_only.append(quest)

                filtered_count = len(active_quests.data) - len(active_only)
                if filtered_count > 0:
                    logger.info(f"Fallback: Filtered out {filtered_count} stale completed quest(s) from active list")

                # Batch fetch all quest details, tasks, and completions upfront
                quest_ids = [e.get('quest_id') for e in active_only if e.get('quest_id')]
                user_quest_ids = [e.get('id') for e in active_only if e.get('id')]

                # Fetch all quests in one query
                quests_by_id = {}
                if quest_ids:
                    quests_response = supabase.table('quests')\
                        .select('*')\
                        .in_('id', quest_ids)\
                        .execute()
                    for q in (quests_response.data or []):
                        quests_by_id[q['id']] = q

                # Fetch all tasks in one query
                tasks_by_enrollment = {}
                all_task_ids = []
                if user_quest_ids:
                    all_tasks_response = supabase.table('user_quest_tasks')\
                        .select('*')\
                        .in_('user_quest_id', user_quest_ids)\
                        .eq('approval_status', 'approved')\
                        .order('order_index')\
                        .execute()

                    for task in (all_tasks_response.data or []):
                        uq_id = task.get('user_quest_id')
                        if uq_id not in tasks_by_enrollment:
                            tasks_by_enrollment[uq_id] = []
                        tasks_by_enrollment[uq_id].append(task)
                        all_task_ids.append(task['id'])

                # Fetch all completions in one query
                completed_task_ids_set = set()
                if all_task_ids:
                    completions_response = supabase.table('quest_task_completions')\
                        .select('user_quest_task_id')\
                        .eq('user_id', user_id)\
                        .in_('user_quest_task_id', all_task_ids)\
                        .execute()
                    completed_task_ids_set = {t['user_quest_task_id'] for t in (completions_response.data or [])}

                # Process each enrollment using preloaded data
                for enrollment in active_only:
                    enrollment_id = enrollment.get('id')
                    enrollment['quests'] = quests_by_id.get(enrollment.get('quest_id'), {})
                    tasks = tasks_by_enrollment.get(enrollment_id, [])
                    task_count = len(tasks)

                    quest_info = enrollment['quests']
                    total_xp = 0
                    pillar_breakdown = {}

                    for task in tasks:
                        xp_amount = task.get('xp_value', 0)
                        pillar = task.get('pillar', 'creativity')
                        total_xp += xp_amount
                        if pillar not in pillar_breakdown:
                            pillar_breakdown[pillar] = 0
                        pillar_breakdown[pillar] += xp_amount

                    quest_info['total_xp'] = total_xp
                    quest_info['task_count'] = task_count
                    quest_info['pillar_breakdown'] = pillar_breakdown

                    # Count completed tasks and mark completion status
                    completed_count = 0
                    for task in tasks:
                        is_completed = task['id'] in completed_task_ids_set
                        task['is_completed'] = is_completed
                        if is_completed:
                            completed_count += 1

                    enrollment['completed_tasks'] = completed_count
                    quest_info['quest_tasks'] = tasks

                return active_only
                
        except Exception as fallback_error:
            logger.error(f"Fallback query also failed: {str(fallback_error)}")
    
    return []

