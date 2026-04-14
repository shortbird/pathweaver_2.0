"""Admin quest list + task templates read.

Split from routes/admin/quest_management.py on 2026-04-14 (Q1).
"""

"""
Admin Quest Management Routes

Handles CRUD operations for quests including creation, editing, deletion,
and quest validation functionality.

REPOSITORY MIGRATION: PARTIALLY COMPLETE
- Uses QuestRepository for search and bulk operations
- Image management uses service layer (correct pattern)
- Complex CRUD operations remain in routes for readability
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from repositories import (
    UserRepository,
    QuestRepository,
    EvidenceRepository,
    ParentRepository,
    TutorRepository,
    AnalyticsRepository
)
from utils.auth.decorators import require_admin, require_advisor, get_advisor_assigned_students
from utils.pillar_utils import is_valid_pillar
from utils.pillar_utils import normalize_pillar_name
from utils.school_subjects import validate_school_subjects, normalize_subject_key
from services.image_service import search_quest_image
from services.api_usage_tracker import pexels_tracker
from datetime import datetime, timedelta
import json
import uuid

from utils.logger import get_logger

logger = get_logger(__name__)



from routes.admin.quest_management import bp


@bp.route('/quests', methods=['GET'])
@require_advisor
def get_admin_quests(user_id):
    """
    Get quests for admin/advisor management.
    Admins see all quests.
    Advisors see only their own quests.

    Query Parameters:
    - page: Page number (default: 1)
    - per_page: Items per page (default: 1000, max: 10000)
    - quest_type: Filter by quest type ('optio', 'course', or omit for all)
    - is_active: Filter by active status ('true', 'false', or omit for all)
    - is_public: Filter by public status ('true', 'false', or omit for all)
    """
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()

    try:
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 1000)), 2000)  # Default to 1000, max 2000
        offset = (page - 1) * per_page

        # Get filter parameters
        quest_type = request.args.get('quest_type')  # 'optio', 'course', or None for all
        is_active = request.args.get('is_active')  # 'true', 'false', or None for all
        is_public = request.args.get('is_public')  # 'true', 'false', or None for all

        # Get user role
        user = supabase.table('users').select('role').eq('id', user_id).execute()
        user_role = user.data[0].get('role') if user.data else 'advisor'

        # Build query based on role
        # Select only needed columns to avoid PostgREST payload limits
        query = supabase.table('quests').select(
            'id, title, description, big_idea, image_url, header_image_url, '
            'is_active, is_public, quest_type, created_by, created_at, '
            'organization_id, topic_primary, topics',
            count='exact'
        )

        # Advisors see only their own quests
        if user_role == 'advisor':
            query = query.eq('created_by', user_id)

        # Apply filters
        if quest_type:
            query = query.eq('quest_type', quest_type)

        if is_active is not None:
            active_bool = is_active.lower() == 'true'
            query = query.eq('is_active', active_bool)

        if is_public is not None:
            public_bool = is_public.lower() == 'true'
            query = query.eq('is_public', public_bool)

        # Get quests with pagination
        # Note: In V3 personalized system, quests don't have quest_tasks (that table is archived)
        # Task counts would need to be calculated from user_quest_tasks if needed
        quests = query\
            .order('created_at', desc=True)\
            .range(offset, offset + per_page - 1)\
            .execute()

        # Get course connections for all quests
        quest_ids = [q['id'] for q in quests.data]
        course_connections = {}
        if quest_ids:
            # Fetch in batches to avoid PostgREST URL length limits with large in_() lists
            batch_size = 200
            all_course_links = []
            for i in range(0, len(quest_ids), batch_size):
                batch = quest_ids[i:i + batch_size]
                batch_result = supabase.table('course_quests')\
                    .select('quest_id, course_id')\
                    .in_('quest_id', batch)\
                    .execute()
                all_course_links.extend(batch_result.data or [])

            # Batch fetch course titles
            course_ids_set = {link['course_id'] for link in all_course_links}
            course_titles = {}
            if course_ids_set:
                courses_result = supabase.table('courses')\
                    .select('id, title')\
                    .in_('id', list(course_ids_set))\
                    .execute()
                course_titles = {c['id']: c['title'] for c in (courses_result.data or [])}

            for link in all_course_links:
                quest_id = link.get('quest_id')
                course_id = link.get('course_id')
                if quest_id not in course_connections:
                    course_connections[quest_id] = []
                course_connections[quest_id].append({
                    'course_id': course_id,
                    'course_title': course_titles.get(course_id, 'Unknown')
                })

        # Batch fetch creator info separately to keep main query lightweight
        creator_ids = set()
        for quest in quests.data:
            if quest.get('created_by'):
                creator_ids.add(quest['created_by'])

        creator_lookup = {}
        if creator_ids:
            creator_ids_list = list(creator_ids)
            for i in range(0, len(creator_ids_list), batch_size):
                batch = creator_ids_list[i:i + batch_size]
                creators = supabase.table('users')\
                    .select('id, display_name, first_name, last_name, email')\
                    .in_('id', batch)\
                    .execute()
                for c in (creators.data or []):
                    creator_lookup[c['id']] = c

        processed_quests = []
        for quest in quests.data:
            # Flatten creator data for easier frontend access
            creator = creator_lookup.get(quest.get('created_by'))
            if creator:
                quest['creator_name'] = creator.get('display_name') or f"{creator.get('first_name', '')} {creator.get('last_name', '')}".strip() or creator.get('email', 'Unknown User')
            else:
                quest['creator_name'] = None

            # Add course connection info
            quest['connected_courses'] = course_connections.get(quest['id'], [])
            quest['is_project'] = len(quest['connected_courses']) > 0

            processed_quests.append(quest)

        return jsonify({
            'success': True,
            'quests': processed_quests,
            'total': quests.count,
            'page': page,
            'per_page': per_page,
            'total_pages': (quests.count + per_page - 1) // per_page
        })

    except Exception as e:
        logger.error(f"Error getting admin quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve quests'
        }), 500

@bp.route('/quests/<quest_id>/task-templates', methods=['GET'])
@require_admin
def get_quest_task_templates(user_id, quest_id):
    """
    Get reusable task templates for a quest.
    Returns tasks created by other students that can be copied.
    Optionally filters out tasks already assigned to a specific student.
    """
    from flask import request
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()

    try:
        # Get target_user_id from query params (student we're adding tasks for)
        target_user_id = request.args.get('target_user_id')

        # Get existing task titles for this student if target_user_id provided
        existing_titles = set()
        if target_user_id:
            existing_tasks = supabase.table('user_quest_tasks')\
                .select('title')\
                .eq('user_id', target_user_id)\
                .eq('quest_id', quest_id)\
                .execute()
            existing_titles = {t['title'].strip().lower() for t in existing_tasks.data if t.get('title')}

        # Get all tasks for this quest from user_quest_tasks
        # Group by title to find commonly used tasks
        tasks = supabase.table('user_quest_tasks')\
            .select('*')\
            .eq('quest_id', quest_id)\
            .execute()

        if not tasks.data:
            return jsonify({
                'success': True,
                'templates': [],
                'message': 'No task templates available yet for this quest'
            })

        # Aggregate tasks by similarity (using title as primary key)
        template_map = {}
        for task in tasks.data:
            title = task.get('title', '').strip().lower()
            if not title:
                continue

            # Skip tasks already assigned to this student
            if title in existing_titles:
                continue

            if title not in template_map:
                subject_xp_dist = task.get('subject_xp_distribution', {})
                total_xp = sum(subject_xp_dist.values()) if subject_xp_dist else task.get('xp_value', 100)

                template_map[title] = {
                    'id': task['id'],  # Use first occurrence ID as template
                    'title': task.get('title'),
                    'description': task.get('description', ''),
                    'pillar': task.get('pillar'),
                    'subject_xp_distribution': subject_xp_dist or {"Electives": total_xp},
                    'xp_value': int(total_xp),
                    'usage_count': 0,
                    'created_at': task.get('created_at')
                }

            template_map[title]['usage_count'] += 1

        # Convert to list and sort by usage count (most popular first)
        templates = sorted(
            template_map.values(),
            key=lambda x: (x['usage_count'], x['created_at']),
            reverse=True
        )

        return jsonify({
            'success': True,
            'templates': templates,
            'total': len(templates)
        })

    except Exception as e:
        logger.error(f"Error getting task templates: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve task templates'
        }), 500

