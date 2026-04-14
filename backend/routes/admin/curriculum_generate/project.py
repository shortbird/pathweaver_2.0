"""Project CRUD within a draft course.

Split from routes/admin/curriculum_generate.py on 2026-04-14 (Q1).
"""

"""
Admin Course Generation Routes
==============================

Multi-stage AI course generation wizard endpoints.
Creates hands-on, action-oriented courses through a 4-stage process.

Stages:
1. Outline - Generate course title and project outlines (3 alternatives)
2. Lessons - Generate lessons for each project
3. Tasks - Generate task suggestions for each lesson
4. Finalize - Publish the course

Endpoints:
- POST /api/admin/curriculum/generate/outline - Stage 1: Generate outline alternatives
- POST /api/admin/curriculum/generate/outline/select - Select outline and create draft
- GET /api/admin/curriculum/generate/<id> - Get current generation state
- POST /api/admin/curriculum/generate/<id>/lessons - Stage 2: Generate all lessons
- POST /api/admin/curriculum/generate/<id>/tasks - Stage 3: Generate all tasks
- POST /api/admin/curriculum/generate/<id>/finalize - Stage 4: Publish course
- POST /api/admin/curriculum/generate/<id>/regenerate-outline - Regenerate outline alternatives
- POST /api/admin/curriculum/generate/<id>/regenerate-lesson/<lesson_id> - Regenerate lesson
- POST /api/admin/curriculum/generate/<id>/regenerate-tasks/<lesson_id> - Regenerate tasks
- DELETE /api/admin/curriculum/generate/<id> - Delete draft course
"""

import threading
import time

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_role
from services.course_generation_service import CourseGenerationService
from services.course_generation_job_service import CourseGenerationJobService
from services.base_ai_service import AIGenerationError

from utils.logger import get_logger

logger = get_logger(__name__)

# Progress tracker for fix-images background job
_fix_images_progress = {
    'running': False,
    'total': 0,
    'completed': 0,
    'errors': 0,
    'logs': []
}



from routes.admin.curriculum_generate import bp


@bp.route('/<course_id>/project', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def add_project(user_id, course_id):
    """
    Add a new project to the course.

    Request body:
    {
        "title": "Project Title",
        "description": "Description",
        "order": 5  // Optional, appends to end if not provided
    }

    Returns:
    {
        "success": true,
        "quest_id": "uuid"
    }
    """
    try:
        data = request.get_json()
        title = data.get('title', 'New Project')
        description = data.get('description', '')
        order = data.get('order')

        organization_id = get_organization_id(user_id)
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()

        # Get course categories for topics
        course = supabase.table('courses').select('*').eq('id', course_id).execute()
        if not course.data:
            return jsonify({
                'success': False,
                'error': 'Course not found'
            }), 404

        # Calculate order if not provided
        if order is None:
            existing = supabase.table('course_quests').select(
                'sequence_order'
            ).eq('course_id', course_id).order('sequence_order', desc=True).limit(1).execute()
            order = (existing.data[0]['sequence_order'] + 1) if existing.data else 1

        # Create quest
        quest_data = {
            'title': title,
            'description': description,
            'big_idea': description,
            'quest_type': 'optio',
            'is_active': False,
            'is_public': False,
            'created_by': user_id,
            'organization_id': organization_id,
            'topic_primary': 'Academic',
            'topics': []
        }

        quest_result = supabase.table('quests').insert(quest_data).execute()

        if not quest_result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to create project'
            }), 500

        quest_id = quest_result.data[0]['id']

        # Link to course
        supabase.table('course_quests').insert({
            'course_id': course_id,
            'quest_id': quest_id,
            'sequence_order': order,
            'is_required': True,
            'is_published': False,
            'xp_threshold': 500
        }).execute()

        return jsonify({
            'success': True,
            'quest_id': quest_id
        }), 200

    except Exception as e:
        logger.error(f"Add project error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<course_id>/project/<quest_id>', methods=['PUT'])
@require_role('superadmin', 'org_admin', 'advisor')
def update_project(user_id, course_id, quest_id):
    """
    Update a project's details.

    Request body:
    {
        "title": "New Title",
        "description": "New description"
    }

    Returns:
    {
        "success": true
    }
    """
    try:
        data = request.get_json()
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()

        update_data = {}
        if 'title' in data:
            update_data['title'] = data['title']
        if 'description' in data:
            update_data['description'] = data['description']
            update_data['big_idea'] = data['description']

        if update_data:
            supabase.table('quests').update(update_data).eq('id', quest_id).execute()

        return jsonify({
            'success': True
        }), 200

    except Exception as e:
        logger.error(f"Update project error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<course_id>/project/<quest_id>', methods=['DELETE'])
@require_role('superadmin', 'org_admin', 'advisor')
def delete_project(user_id, course_id, quest_id):
    """
    Delete a project and all its lessons/tasks.

    Returns:
    {
        "success": true
    }
    """
    try:
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()

        # Get lessons
        lessons = supabase.table('curriculum_lessons').select('id').eq('quest_id', quest_id).execute()
        lesson_ids = [l['id'] for l in lessons.data]

        # Delete task links and tasks
        for lesson_id in lesson_ids:
            task_links = supabase.table('curriculum_lesson_tasks').select('task_id').eq('lesson_id', lesson_id).execute()
            task_ids = [t['task_id'] for t in task_links.data]

            supabase.table('curriculum_lesson_tasks').delete().eq('lesson_id', lesson_id).execute()

            for task_id in task_ids:
                supabase.table('user_quest_tasks').delete().eq('id', task_id).execute()

        # Delete lessons
        supabase.table('curriculum_lessons').delete().eq('quest_id', quest_id).execute()

        # Unlink from course
        supabase.table('course_quests').delete().eq('course_id', course_id).eq('quest_id', quest_id).execute()

        # Delete quest
        supabase.table('quests').delete().eq('id', quest_id).execute()

        return jsonify({
            'success': True
        }), 200

    except Exception as e:
        logger.error(f"Delete project error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# =============================================================================
# BACKGROUND JOB QUEUE ENDPOINTS
# =============================================================================

