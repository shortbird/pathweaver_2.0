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

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from services.course_generation_service import CourseGenerationService
from services.base_ai_service import AIGenerationError

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_curriculum_generate', __name__, url_prefix='/api/admin/curriculum/generate')


def get_organization_id(user_id: str) -> str:
    """Get organization ID for user. Returns None for superadmin (platform-level courses)."""
    supabase = get_supabase_admin_client()
    user = supabase.table('users').select('organization_id, role').eq('id', user_id).execute()

    if not user.data:
        raise Exception("User not found")

    # Superadmin creates platform-level courses (no organization)
    if user.data[0].get('role') == 'superadmin':
        return None

    # For org users, return their organization
    if user.data[0].get('organization_id'):
        return user.data[0]['organization_id']

    # Platform users without org - return None for platform-level content
    return None


# =============================================================================
# STAGE 1: OUTLINE GENERATION
# =============================================================================

@bp.route('/outline', methods=['POST'])
@require_admin
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
@require_admin
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
@require_admin
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

@bp.route('/<course_id>/lessons', methods=['POST'])
@require_admin
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
@require_admin
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
@require_admin
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
@require_admin
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

@bp.route('/<course_id>/tasks', methods=['POST'])
@require_admin
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
@require_admin
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

@bp.route('/<course_id>/finalize', methods=['POST'])
@require_admin
def finalize_course(user_id, course_id):
    """
    Finalize and publish the course.

    Returns:
    {
        "success": true,
        "course_id": "uuid",
        "projects_count": 5,
        "course": {...}
    }
    """
    try:
        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        result = service.finalize_course(course_id)

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Finalize course error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# =============================================================================
# REGENERATION ENDPOINTS
# =============================================================================

@bp.route('/<course_id>/regenerate-outline', methods=['POST'])
@require_admin
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


@bp.route('/<course_id>/regenerate-lesson/<lesson_id>', methods=['POST'])
@require_admin
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


@bp.route('/<course_id>/regenerate-tasks/<lesson_id>', methods=['POST'])
@require_admin
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

@bp.route('/<course_id>/lesson', methods=['POST'])
@require_admin
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


@bp.route('/<course_id>/task', methods=['POST'])
@require_admin
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


@bp.route('/<course_id>', methods=['DELETE'])
@require_admin
def delete_draft(user_id, course_id):
    """
    Delete a draft course and all associated data.

    Returns:
    {
        "success": true
    }
    """
    try:
        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)

        service.delete_draft_course(course_id)

        return jsonify({
            'success': True
        }), 200

    except Exception as e:
        logger.error(f"Delete draft error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# =============================================================================
# PROJECT MANAGEMENT
# =============================================================================

@bp.route('/<course_id>/project', methods=['POST'])
@require_admin
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
@require_admin
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
@require_admin
def delete_project(user_id, course_id, quest_id):
    """
    Delete a project and all its lessons/tasks.

    Returns:
    {
        "success": true
    }
    """
    try:
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

@bp.route('/<course_id>/queue', methods=['POST'])
@require_admin
def queue_generation(user_id, course_id):
    """
    Queue a course for background generation.

    After outline is approved, this endpoint queues the course for
    automatic lesson and task generation in the background.
    The job starts processing immediately in a background thread.

    Request body:
    {
        "auto_publish": true  // Optional: auto-publish when complete
    }

    Returns:
    {
        "success": true,
        "job_id": "uuid"
    }
    """
    try:
        import threading
        from services.course_generation_job_service import CourseGenerationJobService

        data = request.get_json() or {}
        auto_publish = data.get('auto_publish', False)

        organization_id = get_organization_id(user_id)
        job_service = CourseGenerationJobService()

        job_id = job_service.create_job(
            course_id=course_id,
            user_id=user_id,
            organization_id=organization_id,
            auto_publish=auto_publish
        )

        # Start processing immediately in a background thread
        from flask import current_app
        app = current_app._get_current_object()

        def process_in_background(jid, flask_app):
            with flask_app.app_context():
                try:
                    svc = CourseGenerationJobService()
                    # Process the requested job first
                    svc.process_job(jid)

                    # Then process any other pending jobs in the queue
                    while True:
                        pending = svc.get_pending_jobs(limit=1)
                        if not pending:
                            break
                        next_job_id = pending[0]['id']
                        logger.info(f"Processing next pending job: {next_job_id}")
                        svc.process_job(next_job_id)
                except Exception as e:
                    logger.error(f"Background job {jid} failed: {str(e)}")

        thread = threading.Thread(target=process_in_background, args=(job_id, app))
        thread.daemon = True
        thread.start()

        return jsonify({
            'success': True,
            'job_id': job_id
        }), 200

    except Exception as e:
        logger.error(f"Queue generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@bp.route('/jobs', methods=['GET'])
@require_admin
def get_generation_jobs(user_id):
    """
    Get all generation jobs for the current user.

    Query params:
    - status: 'active' (pending/running), or specific status
    - limit: Max number of jobs (default 20)

    Returns:
    {
        "success": true,
        "jobs": [...]
    }
    """
    try:
        from services.course_generation_job_service import CourseGenerationJobService

        status = request.args.get('status')
        limit = int(request.args.get('limit', 20))

        job_service = CourseGenerationJobService()
        jobs = job_service.get_user_jobs(user_id, status=status, limit=limit)

        return jsonify({
            'success': True,
            'jobs': jobs
        }), 200

    except Exception as e:
        logger.error(f"Get jobs error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/jobs/<job_id>', methods=['GET'])
@require_admin
def get_job_status(user_id, job_id):
    """
    Get detailed status for a specific job including logs.

    Returns:
    {
        "success": true,
        "job": {
            "id": "uuid",
            "course_id": "uuid",
            "course_title": "...",
            "status": "generating_lessons",
            "current_step": "lessons",
            "current_item": "Project Name",
            "items_completed": 3,
            "items_total": 5,
            "logs": [...],
            ...
        }
    }
    """
    try:
        from services.course_generation_job_service import CourseGenerationJobService

        job_service = CourseGenerationJobService()
        job = job_service.get_job_status(job_id)

        if not job:
            return jsonify({
                'success': False,
                'error': 'Job not found'
            }), 404

        # Verify ownership
        supabase = get_supabase_admin_client()
        job_record = supabase.table('course_generation_jobs').select('user_id').eq('id', job_id).execute()

        if job_record.data and job_record.data[0]['user_id'] != user_id:
            return jsonify({
                'success': False,
                'error': 'Not authorized'
            }), 403

        return jsonify({
            'success': True,
            'job': job
        }), 200

    except Exception as e:
        logger.error(f"Get job status error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/jobs/<job_id>/start', methods=['POST'])
@require_admin
def start_job(user_id, job_id):
    """
    Start a pending job that wasn't auto-started.

    Returns:
    {
        "success": true
    }
    """
    try:
        import threading
        from services.course_generation_job_service import CourseGenerationJobService

        job_service = CourseGenerationJobService()

        # Verify job exists and is pending
        job = job_service.get_job_status(job_id)
        if not job:
            return jsonify({
                'success': False,
                'error': 'Job not found'
            }), 404

        if job['status'] != 'pending':
            return jsonify({
                'success': False,
                'error': 'Job is not pending'
            }), 400

        # Start processing in background thread
        from flask import current_app
        app = current_app._get_current_object()

        def process_in_background(jid, flask_app):
            with flask_app.app_context():
                try:
                    svc = CourseGenerationJobService()
                    # Process the requested job first
                    svc.process_job(jid)

                    # Then process any other pending jobs in the queue
                    while True:
                        pending = svc.get_pending_jobs(limit=1)
                        if not pending:
                            break
                        next_job_id = pending[0]['id']
                        logger.info(f"Processing next pending job: {next_job_id}")
                        svc.process_job(next_job_id)
                except Exception as e:
                    logger.error(f"Background job {jid} failed: {str(e)}")

        thread = threading.Thread(target=process_in_background, args=(job_id, app))
        thread.daemon = True
        thread.start()

        return jsonify({
            'success': True
        }), 200

    except Exception as e:
        logger.error(f"Start job error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@bp.route('/jobs/<job_id>/cancel', methods=['POST'])
@require_admin
def cancel_job(user_id, job_id):
    """
    Cancel a pending or running job.

    Returns:
    {
        "success": true
    }
    """
    try:
        from services.course_generation_job_service import CourseGenerationJobService

        job_service = CourseGenerationJobService()
        job_service.cancel_job(job_id, user_id)

        return jsonify({
            'success': True
        }), 200

    except Exception as e:
        logger.error(f"Cancel job error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@bp.route('/jobs/<job_id>/retry', methods=['POST'])
@require_admin
def retry_job(user_id, job_id):
    """
    Retry a failed job by creating a new one.

    Returns:
    {
        "success": true,
        "job_id": "uuid"  // New job ID
    }
    """
    try:
        from services.course_generation_job_service import CourseGenerationJobService

        job_service = CourseGenerationJobService()
        new_job_id = job_service.retry_job(job_id, user_id)

        return jsonify({
            'success': True,
            'job_id': new_job_id
        }), 200

    except Exception as e:
        logger.error(f"Retry job error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@bp.route('/jobs/process', methods=['POST'])
@require_admin
def process_next_job(user_id):
    """
    Process the next pending job.

    This endpoint can be called manually or by a cron job to
    process queued generation jobs.

    Returns:
    {
        "success": true,
        "result": {
            "job_id": "uuid",
            "status": "success" | "failed"
        }
    }
    """
    try:
        from services.course_generation_job_service import CourseGenerationJobService

        job_service = CourseGenerationJobService()
        result = job_service.run_next_job()

        if result is None:
            return jsonify({
                'success': True,
                'result': None,
                'message': 'No pending jobs'
            }), 200

        return jsonify({
            'success': True,
            'result': result
        }), 200

    except Exception as e:
        logger.error(f"Process job error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
