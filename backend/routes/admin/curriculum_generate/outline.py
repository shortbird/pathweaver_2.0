"""Stage 1 + state: outline generation, select, regenerate, read state.

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



# =============================================================================
# STAGE 1: OUTLINE GENERATION
# =============================================================================

@bp.route('/outline', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def generate_outline(user_id):
    """
    Generate course outline alternatives for a topic.

    Request body:
    {
        "topic": "Board Games"
    }

    Returns:
    {
        "success": true,
        "alternatives": [
            {
                "title": "Build a Playable Board Game from Scratch",
                "description": "...",
                "projects": [...],
                "categories": [...]
            },
            ...
        ]
    }
    """
    try:
        data = request.get_json()
        topic = data.get('topic', '').strip()

        if not topic:
            return jsonify({
                'success': False,
                'error': 'Topic is required'
            }), 400

        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        result = service.generate_outline(topic)

        return jsonify({
            'success': True,
            'topic': topic,
            **result
        }), 200

    except AIGenerationError as e:
        logger.error(f"AI generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'AI generation failed: {str(e)}'
        }), 500

    except Exception as e:
        logger.error(f"Outline generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/outline/select', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def select_outline(user_id):
    """
    Select an outline and create a draft course.

    Request body:
    {
        "outline": {
            "title": "...",
            "description": "...",
            "projects": [...],
            "categories": [...]
        }
    }

    Returns:
    {
        "success": true,
        "course_id": "uuid"
    }
    """
    try:
        data = request.get_json()
        outline = data.get('outline')

        if not outline:
            return jsonify({
                'success': False,
                'error': 'Outline is required'
            }), 400

        if not outline.get('title'):
            return jsonify({
                'success': False,
                'error': 'Outline must have a title'
            }), 400

        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        course_id = service.save_draft_course(outline)

        return jsonify({
            'success': True,
            'course_id': course_id
        }), 200

    except Exception as e:
        logger.error(f"Select outline error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# =============================================================================
# STATE RETRIEVAL
# =============================================================================

@bp.route('/<course_id>', methods=['GET'])
@require_role('superadmin', 'org_admin', 'advisor')
def get_generation_state(user_id, course_id):
    """
    Get the current state of a course in generation.

    Returns:
    {
        "success": true,
        "course": {...},
        "projects": [
            {
                "id": "...",
                "title": "...",
                "lessons": [
                    {
                        "id": "...",
                        "title": "...",
                        "tasks": [...]
                    }
                ]
            }
        ],
        "current_stage": 2
    }
    """
    try:
        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        state = service.get_course_generation_state(course_id)

        return jsonify({
            'success': True,
            **state
        }), 200

    except Exception as e:
        logger.error(f"Get generation state error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# =============================================================================
# STAGE 2: LESSON GENERATION
# =============================================================================

@bp.route('/<course_id>/regenerate-outline', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def regenerate_outline(user_id, course_id):
    """
    Regenerate outline alternatives for an existing draft course.

    Request body:
    {
        "topic": "Board Games",
        "previous_outlines": [...]  // Optional: outlines to avoid
    }

    Returns:
    {
        "success": true,
        "alternatives": [...]
    }
    """
    try:
        data = request.get_json()
        topic = data.get('topic', '').strip()
        previous_outlines = data.get('previous_outlines', [])

        if not topic:
            # Get topic from existing course title
            # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
            supabase = get_supabase_admin_client()
            course = supabase.table('courses').select('title').eq('id', course_id).execute()
            if course.data:
                topic = course.data[0]['title']
            else:
                return jsonify({
                    'success': False,
                    'error': 'Topic is required'
                }), 400

        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        result = service.regenerate_outline(topic, previous_outlines)

        return jsonify({
            'success': True,
            **result
        }), 200

    except Exception as e:
        logger.error(f"Regenerate outline error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


