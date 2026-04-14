"""Stage 2: lesson generation, regenerate, save.

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


@bp.route('/<course_id>/lessons', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def generate_lessons(user_id, course_id):
    """
    Generate lessons for all projects in a course.

    Returns:
    {
        "success": true,
        "lessons": {
            "project_id_1": [...],
            "project_id_2": [...]
        }
    }
    """
    try:
        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        lessons = service.generate_lessons(course_id)

        return jsonify({
            'success': True,
            'lessons': lessons
        }), 200

    except AIGenerationError as e:
        logger.error(f"AI lesson generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'AI generation failed: {str(e)}'
        }), 500

    except Exception as e:
        logger.error(f"Lesson generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<course_id>/lessons/<quest_id>', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def generate_lessons_for_project(user_id, course_id, quest_id):
    """
    Generate lessons for a specific project.

    Returns:
    {
        "success": true,
        "lessons": [...]
    }
    """
    try:
        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        lessons = service.generate_lessons_for_project(course_id, quest_id)

        return jsonify({
            'success': True,
            'lessons': lessons
        }), 200

    except Exception as e:
        logger.error(f"Project lesson generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# =============================================================================
# LESSON CONTENT GENERATION (for Plan Mode courses)
# =============================================================================

@bp.route('/<course_id>/lesson-content', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def generate_lesson_content_all(user_id, course_id):
    """
    Generate content (steps) for all lessons with empty content.

    Used for courses created by Plan Mode where lessons have titles
    but empty steps/content.

    Returns:
    {
        "success": true,
        "content": {
            "lesson_id_1": { "steps": [...], "scaffolding": {...} },
            "lesson_id_2": { "steps": [...], "scaffolding": {...} }
        },
        "generated_count": 5
    }
    """
    try:
        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        content = service.generate_content_for_empty_lessons(course_id)

        return jsonify({
            'success': True,
            'content': content,
            'generated_count': len(content)
        }), 200

    except AIGenerationError as e:
        logger.error(f"AI content generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'AI generation failed: {str(e)}'
        }), 500

    except Exception as e:
        logger.error(f"Lesson content generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<course_id>/lesson-content/<lesson_id>', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def generate_lesson_content_single(user_id, course_id, lesson_id):
    """
    Generate content (steps) for a single lesson with empty content.

    Returns:
    {
        "success": true,
        "content": { "steps": [...], "scaffolding": {...} }
    }
    """
    try:
        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        content = service.generate_lesson_content(course_id, lesson_id)

        return jsonify({
            'success': True,
            'content': content
        }), 200

    except AIGenerationError as e:
        logger.error(f"AI content generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'AI generation failed: {str(e)}'
        }), 500

    except Exception as e:
        logger.error(f"Lesson content generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# =============================================================================
# STAGE 3: TASK GENERATION
# =============================================================================

@bp.route('/<course_id>/regenerate-lesson/<lesson_id>', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def regenerate_lesson(user_id, course_id, lesson_id):
    """
    Regenerate alternatives for a specific lesson.

    Request body (optional):
    {
        "quest_id": "uuid",
        "previous_content": {...}  // Current lesson to avoid
    }

    Returns:
    {
        "success": true,
        "alternatives": [
            {
                "approach": "Description of this approach",
                "lessons": [...]
            }
        ]
    }
    """
    try:
        data = request.get_json() or {}
        quest_id = data.get('quest_id')
        previous_content = data.get('previous_content')

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

        result = service.regenerate_lesson(course_id, quest_id, lesson_id, previous_content)

        return jsonify({
            'success': True,
            **result
        }), 200

    except Exception as e:
        logger.error(f"Regenerate lesson error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<course_id>/lesson', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def save_lesson(user_id, course_id):
    """
    Save or update a lesson.

    Request body:
    {
        "quest_id": "uuid",
        "lesson": {
            "title": "...",
            "description": "...",
            "steps": [...],
            "scaffolding": {...}
        },
        "order": 1  // Optional
    }

    Returns:
    {
        "success": true,
        "lesson_id": "uuid"
    }
    """
    try:
        data = request.get_json()
        quest_id = data.get('quest_id')
        lesson = data.get('lesson')
        order = data.get('order')

        if not quest_id or not lesson:
            return jsonify({
                'success': False,
                'error': 'quest_id and lesson are required'
            }), 400

        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        lesson_id = service.save_lesson(quest_id, lesson, order)

        return jsonify({
            'success': True,
            'lesson_id': lesson_id
        }), 200

    except Exception as e:
        logger.error(f"Save lesson error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


