"""Stage 3: task generation, regenerate, save.

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


@bp.route('/<course_id>/tasks', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def generate_tasks(user_id, course_id):
    """
    Generate task suggestions for all lessons in a course.

    Returns:
    {
        "success": true,
        "tasks": {
            "lesson_id_1": [...],
            "lesson_id_2": [...]
        }
    }
    """
    try:
        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        tasks = service.generate_tasks(course_id)

        return jsonify({
            'success': True,
            'tasks': tasks
        }), 200

    except AIGenerationError as e:
        logger.error(f"AI task generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'AI generation failed: {str(e)}'
        }), 500

    except Exception as e:
        logger.error(f"Task generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<course_id>/tasks/<lesson_id>', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def generate_tasks_for_lesson(user_id, course_id, lesson_id):
    """
    Generate tasks for a specific lesson.

    Request body (optional):
    {
        "quest_id": "uuid"  // Required for linking tasks
    }

    Returns:
    {
        "success": true,
        "tasks": [...]
    }
    """
    try:
        data = request.get_json() or {}
        quest_id = data.get('quest_id')

        # If quest_id not provided, look it up from lesson
        if not quest_id:
            # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
            supabase = get_supabase_admin_client()
            lesson = supabase.table('curriculum_lessons').select('quest_id').eq('id', lesson_id).execute()
            if lesson.data:
                quest_id = lesson.data[0]['quest_id']
            else:
                return jsonify({
                    'success': False,
                    'error': 'Lesson not found'
                }), 404

        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        tasks = service.generate_tasks_for_lesson(course_id, quest_id, lesson_id)

        return jsonify({
            'success': True,
            'tasks': tasks
        }), 200

    except Exception as e:
        logger.error(f"Lesson task generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# =============================================================================
# STAGE 4: FINALIZATION
# =============================================================================

@bp.route('/<course_id>/regenerate-tasks/<lesson_id>', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def regenerate_tasks(user_id, course_id, lesson_id):
    """
    Regenerate task alternatives for a lesson.

    Request body (optional):
    {
        "quest_id": "uuid",
        "previous_tasks": [...]  // Current tasks to avoid
    }

    Returns:
    {
        "success": true,
        "alternatives": [
            {
                "approach": "Description",
                "tasks": [...]
            }
        ]
    }
    """
    try:
        data = request.get_json() or {}
        quest_id = data.get('quest_id')
        previous_tasks = data.get('previous_tasks', [])

        # Look up quest_id if not provided
        if not quest_id:
            # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
            supabase = get_supabase_admin_client()
            lesson = supabase.table('curriculum_lessons').select('quest_id').eq('id', lesson_id).execute()
            if lesson.data:
                quest_id = lesson.data[0]['quest_id']
            else:
                return jsonify({
                    'success': False,
                    'error': 'Lesson not found'
                }), 404

        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        result = service.regenerate_tasks(course_id, quest_id, lesson_id, previous_tasks)

        return jsonify({
            'success': True,
            **result
        }), 200

    except Exception as e:
        logger.error(f"Regenerate tasks error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# =============================================================================
# DATA MANAGEMENT
# =============================================================================

@bp.route('/<course_id>/task', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def save_task(user_id, course_id):
    """
    Save a task and link to lesson.

    Request body:
    {
        "quest_id": "uuid",
        "lesson_id": "uuid",
        "task": {
            "title": "...",
            "description": "...",
            "pillar": "creativity",
            "xp_value": 25
        }
    }

    Returns:
    {
        "success": true,
        "task_id": "uuid"
    }
    """
    try:
        data = request.get_json()
        quest_id = data.get('quest_id')
        lesson_id = data.get('lesson_id')
        task = data.get('task')

        if not quest_id or not lesson_id or not task:
            return jsonify({
                'success': False,
                'error': 'quest_id, lesson_id, and task are required'
            }), 400

        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        task_id = service.save_task(quest_id, lesson_id, task)

        return jsonify({
            'success': True,
            'task_id': task_id
        }), 200

    except Exception as e:
        logger.error(f"Save task error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


