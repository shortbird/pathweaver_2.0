"""Bulk generation + fix-images background operations.

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


@bp.route('/bulk', methods=['POST'])
@require_role('superadmin')
def bulk_generate(user_id):
    """
    Generate multiple courses from a list of topics.

    For each topic:
    1. Generates outline (3 alternatives), auto-selects first
    2. Creates draft course with slug
    3. Queues a background job for lessons, tasks, showcase, and optional publish

    Jobs are processed sequentially in a background thread with a delay between them.

    Request body:
    {
        "topics": ["Board Games", "Cooking", "Photography"],
        "auto_publish": true,
        "delay_seconds": 5
    }

    Returns:
    {
        "success": true,
        "courses": [
            {"topic": "Board Games", "course_id": "uuid", "job_id": "uuid", "title": "..."},
            ...
        ],
        "errors": [
            {"topic": "Bad Topic", "error": "..."}
        ]
    }
    """
    try:
        data = request.get_json()
        topics = data.get('topics', [])
        auto_publish = data.get('auto_publish', True)
        delay_seconds = data.get('delay_seconds', 5)

        if not topics:
            return jsonify({
                'success': False,
                'error': 'topics list is required'
            }), 400

        if len(topics) > 50:
            return jsonify({
                'success': False,
                'error': 'Maximum 50 topics per batch'
            }), 400

        delay_seconds = max(0, min(60, delay_seconds))

        organization_id = get_organization_id(user_id)
        service = CourseGenerationService(user_id, organization_id)
        job_service = CourseGenerationJobService()

        courses = []
        errors = []

        for topic in topics:
            topic = topic.strip()
            if not topic:
                continue

            try:
                # Generate outline
                result = service.generate_outline(topic)
                alternatives = result.get('alternatives', [])

                if not alternatives:
                    errors.append({'topic': topic, 'error': 'No outlines generated'})
                    continue

                # Auto-select first alternative
                outline = alternatives[0]

                # Save draft course (includes slug generation)
                course_id = service.save_draft_course(outline)

                # Create background job
                job_id = job_service.create_job(
                    course_id=course_id,
                    user_id=user_id,
                    organization_id=organization_id,
                    auto_publish=auto_publish
                )

                courses.append({
                    'topic': topic,
                    'course_id': course_id,
                    'job_id': job_id,
                    'title': outline.get('title', topic)
                })

                logger.info(f"Bulk: created course {course_id} and job {job_id} for topic '{topic}'")

            except Exception as e:
                logger.error(f"Bulk: failed for topic '{topic}': {str(e)}")
                errors.append({'topic': topic, 'error': str(e)})

        # Start background thread to process all jobs sequentially
        if courses:
            from flask import current_app
            app = current_app._get_current_object()
            job_ids = [c['job_id'] for c in courses]

            def process_bulk_jobs(jids, flask_app, delay):
                with flask_app.app_context():
                    svc = CourseGenerationJobService()
                    for i, jid in enumerate(jids):
                        try:
                            logger.info(f"Bulk: processing job {i+1}/{len(jids)}: {jid}")
                            svc.process_job(jid)
                        except Exception as e:
                            logger.error(f"Bulk: job {jid} failed: {str(e)}")

                        # Delay between jobs (skip after last)
                        if i < len(jids) - 1 and delay > 0:
                            time.sleep(delay)

                    logger.info(f"Bulk: all {len(jids)} jobs processed")

            thread = threading.Thread(
                target=process_bulk_jobs,
                args=(job_ids, app, delay_seconds)
            )
            thread.daemon = True
            thread.start()

        return jsonify({
            'success': True,
            'courses': courses,
            'errors': errors
        }), 200

    except Exception as e:
        logger.error(f"Bulk generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/fix-images', methods=['POST'])
@require_role('superadmin')
def fix_images(user_id):
    """
    Fix missing or duplicate images on existing courses.

    Backfills cover images for courses and project images for quests.
    Ensures no two projects in the same course share the same image.

    Request body:
    {
        "course_ids": [],        // optional, defaults to all published courses
        "fix_duplicates": true   // replace duplicate images within courses
    }

    Returns:
    {
        "success": true,
        "message": "Image fix started in background",
        "courses_to_fix": 10
    }
    """
    try:
        data = request.get_json() or {}
        course_ids = data.get('course_ids', [])
        fix_duplicates = data.get('fix_duplicates', True)

        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        admin_client = get_supabase_admin_client()

        # Get courses to process
        if course_ids:
            courses_q = admin_client.table('courses').select(
                'id, title, description, cover_image_url'
            ).in_('id', course_ids).execute()
        else:
            courses_q = admin_client.table('courses').select(
                'id, title, description, cover_image_url'
            ).eq('status', 'published').execute()

        if not courses_q.data:
            return jsonify({'success': True, 'message': 'No courses found', 'courses_to_fix': 0}), 200

        all_courses = courses_q.data

        # Get all course-quest mappings with image info
        c_ids = [c['id'] for c in all_courses]
        cq_q = admin_client.table('course_quests').select(
            'course_id, quest_id, quests(id, title, description, image_url)'
        ).in_('course_id', c_ids).execute()

        # Group projects by course
        course_projects = {}
        for row in (cq_q.data or []):
            cid = row['course_id']
            if cid not in course_projects:
                course_projects[cid] = []
            course_projects[cid].append(row)

        # Filter to courses needing work
        courses_to_fix = []
        for course in all_courses:
            cid = course['id']
            projs = course_projects.get(cid, [])
            needs_fix = False

            # Check if course missing cover image
            if not course.get('cover_image_url'):
                needs_fix = True

            # Check for missing project images
            for p in projs:
                quest = p.get('quests', {})
                if not quest.get('image_url'):
                    needs_fix = True
                    break

            # Check for duplicate project images within the course
            if fix_duplicates and not needs_fix:
                urls = [p.get('quests', {}).get('image_url') for p in projs if p.get('quests', {}).get('image_url')]
                if len(urls) != len(set(urls)):
                    needs_fix = True

            if needs_fix:
                courses_to_fix.append({
                    'course': course,
                    'projects': projs
                })

        if not courses_to_fix:
            return jsonify({'success': True, 'message': 'All courses already have unique images', 'courses_to_fix': 0}), 200

        # Reset and start progress tracking
        _fix_images_progress['running'] = True
        _fix_images_progress['total'] = len(courses_to_fix)
        _fix_images_progress['completed'] = 0
        _fix_images_progress['errors'] = 0
        _fix_images_progress['logs'] = []

        # Run in background thread
        from flask import current_app
        app = current_app._get_current_object()

        def process_fix_images(courses_data, flask_app, do_fix_dupes, progress):
            with flask_app.app_context():
                from services.image_service import search_quest_image

                # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
                client = get_supabase_admin_client()

                def log(msg, level='info'):
                    progress['logs'].append({'message': msg, 'level': level})
                    if level == 'error':
                        logger.error(f"Fix-images: {msg}")
                    else:
                        logger.info(f"Fix-images: {msg}")

                for i, item in enumerate(courses_data):
                    course = item['course']
                    projs = item['projects']
                    cid = course['id']
                    course_title = course.get('title', cid)

                    log(f"[{i+1}/{progress['total']}] Processing: {course_title}")

                    try:
                        # Determine which projects already have good (non-duplicate) images
                        url_counts = {}
                        for p in projs:
                            url = p.get('quests', {}).get('image_url')
                            if url:
                                url_counts[url] = url_counts.get(url, 0) + 1

                        # Build existing_urls (only non-duplicate ones)
                        existing_urls = set()
                        for url, count in url_counts.items():
                            if not do_fix_dupes or count == 1:
                                existing_urls.add(url)

                        # Build list of projects needing images
                        projects_needing_images = []
                        for p in projs:
                            quest = p.get('quests', {})
                            url = quest.get('image_url')
                            if not url or (do_fix_dupes and url_counts.get(url, 0) > 1):
                                projects_needing_images.append({
                                    'quest_id': p['quest_id'],
                                    'title': quest.get('title', ''),
                                    'description': quest.get('description')
                                })

                        needs_cover = not course.get('cover_image_url')

                        if not needs_cover and not projects_needing_images:
                            log(f"  Skipped (nothing to fix)")
                            progress['completed'] += 1
                            continue

                        # Fetch cover image if missing
                        if needs_cover:
                            cover_url = search_quest_image(
                                course['title'],
                                course.get('description'),
                                per_page=5,
                                exclude_urls=existing_urls
                            )
                            if cover_url:
                                client.table('courses').update({
                                    'cover_image_url': cover_url
                                }).eq('id', cid).execute()
                                existing_urls.add(cover_url)
                                log(f"  Set cover image")

                        # Fetch project images one by one to maintain uniqueness
                        imgs_set = 0
                        for proj in projects_needing_images:
                            try:
                                url = search_quest_image(
                                    proj['title'],
                                    proj.get('description'),
                                    per_page=15,
                                    exclude_urls=existing_urls
                                )
                                if url:
                                    client.table('quests').update({
                                        'image_url': url,
                                        'header_image_url': url
                                    }).eq('id', proj['quest_id']).execute()
                                    existing_urls.add(url)
                                    imgs_set += 1
                            except Exception as e:
                                log(f"  Failed for project '{proj['title']}': {e}", 'warning')

                        log(f"  Done: {imgs_set}/{len(projects_needing_images)} project images set")
                        progress['completed'] += 1

                    except Exception as e:
                        progress['errors'] += 1
                        log(f"  Failed: {e}", 'error')

                log(f"Complete: {progress['completed']}/{progress['total']} courses, {progress['errors']} errors")
                progress['running'] = False

        thread = threading.Thread(
            target=process_fix_images,
            args=(courses_to_fix, app, fix_duplicates, _fix_images_progress)
        )
        thread.daemon = True
        thread.start()

        return jsonify({
            'success': True,
            'message': f'Image fix started in background for {len(courses_to_fix)} courses',
            'courses_to_fix': len(courses_to_fix)
        }), 200

    except Exception as e:
        logger.error(f"Fix images error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/fix-images/status', methods=['GET'])
@require_role('superadmin')
def fix_images_status(user_id):
    """Get progress of the running fix-images background job."""
    return jsonify({
        'success': True,
        'running': _fix_images_progress['running'],
        'total': _fix_images_progress['total'],
        'completed': _fix_images_progress['completed'],
        'errors': _fix_images_progress['errors'],
        'logs': _fix_images_progress['logs'][-50:]  # Last 50 entries
    }), 200


@bp.route('/bulk/status', methods=['GET'])
@require_role('superadmin')
def bulk_status(user_id):
    """
    Get status of all recent generation jobs for the current user.

    Returns summary counts and per-job details.

    Returns:
    {
        "success": true,
        "summary": {
            "total": 10,
            "pending": 2,
            "running": 1,
            "completed": 6,
            "failed": 1
        },
        "jobs": [...]
    }
    """
    try:
        job_service = CourseGenerationJobService()
        jobs = job_service.get_user_jobs(user_id, limit=100)

        summary = {
            'total': len(jobs),
            'pending': 0,
            'running': 0,
            'completed': 0,
            'failed': 0
        }

        running_statuses = {
            'generating_lessons', 'generating_tasks',
            'generating_showcase', 'generating_images', 'finalizing'
        }

        for job in jobs:
            status = job.get('status', '')
            if status == 'pending':
                summary['pending'] += 1
            elif status in running_statuses:
                summary['running'] += 1
            elif status == 'completed':
                summary['completed'] += 1
            elif status == 'failed':
                summary['failed'] += 1

        return jsonify({
            'success': True,
            'summary': summary,
            'jobs': jobs
        }), 200

    except Exception as e:
        logger.error(f"Bulk status error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
