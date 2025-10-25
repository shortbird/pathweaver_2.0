"""
Khan Academy Sync API Endpoints

Admin-only endpoints for syncing Khan Academy courses to Optio course quests.
"""
from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from services.khan_academy_scraper_service import khan_academy_scraper
from services.image_service import search_quest_image
from datetime import datetime
import json
import os
import time

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('khan_academy_sync', __name__, url_prefix='/api/admin/khan-academy')


@bp.route('/courses', methods=['GET'])
@require_admin
def get_available_courses(user_id):
    """
    Get list of predefined Khan Academy courses available for sync.

    Returns:
        List of course objects with title and URL
    """
    try:
        # Load course URLs from JSON file
        courses_file = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            'data',
            'khan_academy_course_urls.json'
        )

        if not os.path.exists(courses_file):
            logger.error(f"Khan Academy courses file not found: {courses_file}")
            return jsonify({
                'success': False,
                'error': 'Course list not found'
            }), 404

        with open(courses_file, 'r') as f:
            courses_data = json.load(f)

        # Flatten the courses by category
        all_courses = []
        for category, courses in courses_data.items():
            for course in courses:
                all_courses.append({
                    'title': course['title'],
                    'url': course['url'],
                    'category': category.title()
                })

        return jsonify({
            'success': True,
            'courses': all_courses,
            'total': len(all_courses)
        })

    except Exception as e:
        logger.error(f"Error getting available courses: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to load course list: {str(e)}'
        }), 500


@bp.route('/sync', methods=['POST'])
@require_admin
def sync_course(user_id):
    """
    Sync a single Khan Academy course to Optio.

    Request body:
    {
        "course_url": "https://www.khanacademy.org/math/algebra",
        "subject_area": "Math"  // optional
    }

    Returns:
        Created quest with tasks
    """
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        course_url = data.get('course_url')
        subject_area = data.get('subject_area', 'Math')

        if not course_url:
            return jsonify({
                'success': False,
                'error': 'course_url is required'
            }), 400

        logger.info(f"Starting KA sync for: {course_url}")

        # Scrape course data
        course_data = khan_academy_scraper.scrape_course(course_url, subject_area)

        if not course_data:
            return jsonify({
                'success': False,
                'error': 'Failed to scrape course data. Course may not exist or structure may have changed.'
            }), 400

        # Check if course already exists
        existing_quest = supabase.table('quests')\
            .select('id, title')\
            .eq('title', course_data['title'])\
            .eq('quest_type', 'course')\
            .maybe_single()\
            .execute()

        if existing_quest.data:
            return jsonify({
                'success': False,
                'error': f"Course quest '{course_data['title']}' already exists. Delete it first if you want to re-sync.",
                'existing_quest_id': existing_quest.data['id']
            }), 409

        # Auto-fetch image from Pexels
        image_url = search_quest_image(course_data['title'], course_data['description'])
        logger.info(f"Fetched image for '{course_data['title']}': {image_url}")

        # Create quest record
        quest_data = {
            'title': course_data['title'],
            'description': course_data['description'],
            'big_idea': course_data['description'],
            'quest_type': 'course',
            'source': 'khan_academy',
            'is_active': True,
            'header_image_url': image_url,
            'image_url': image_url,
            'created_at': datetime.utcnow().isoformat()
        }

        quest_result = supabase.table('quests').insert(quest_data).execute()

        if not quest_result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to create quest'
            }), 500

        quest_id = quest_result.data[0]['id']
        logger.info(f"Created quest {quest_id}: {course_data['title']}")

        # Create course tasks from units
        tasks_data = []
        for unit in course_data['units']:
            task_data = {
                'quest_id': quest_id,
                'title': unit['title'],
                'description': unit['description'],
                'pillar': unit['pillar'],
                'xp_value': unit['xp_value'],
                'order_index': unit['order_index'],
                'is_required': unit.get('is_required', True),
                'diploma_subjects': unit['diploma_subjects'],
                'subject_xp_distribution': {subj: unit['xp_value'] for subj in unit['diploma_subjects']},
                'created_at': datetime.utcnow().isoformat()
            }
            tasks_data.append(task_data)

        # Insert all tasks
        if tasks_data:
            tasks_result = supabase.table('course_quest_tasks').insert(tasks_data).execute()

            if not tasks_result.data:
                # Rollback quest creation
                supabase.table('quests').delete().eq('id', quest_id).execute()
                return jsonify({
                    'success': False,
                    'error': 'Failed to create course tasks'
                }), 500

            logger.info(f"Created {len(tasks_result.data)} tasks for quest {quest_id}")

        return jsonify({
            'success': True,
            'message': f"Successfully synced Khan Academy course: {course_data['title']}",
            'quest_id': quest_id,
            'quest_title': course_data['title'],
            'tasks_created': len(tasks_data),
            'image_url': image_url,
            'quest': quest_result.data[0]
        })

    except Exception as e:
        logger.error(f"Error syncing KA course: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to sync course: {str(e)}'
        }), 500


@bp.route('/sync-batch', methods=['POST'])
@require_admin
def sync_batch_courses(user_id):
    """
    Sync multiple Khan Academy courses in batch.

    Request body:
    {
        "courses": [
            {"url": "https://...", "subject_area": "Math"},
            {"url": "https://...", "subject_area": "Science"}
        ]
    }

    Returns:
        Summary of sync results
    """
    try:
        data = request.json
        courses = data.get('courses', [])

        if not courses:
            return jsonify({
                'success': False,
                'error': 'courses array is required'
            }), 400

        results = []
        successful = 0
        failed = 0

        for course in courses:
            try:
                # Call single sync endpoint logic
                course_url = course.get('url')
                subject_area = course.get('subject_area', 'Math')

                if not course_url:
                    results.append({
                        'url': course_url,
                        'success': False,
                        'error': 'Missing URL'
                    })
                    failed += 1
                    continue

                # Scrape and create
                course_data = khan_academy_scraper.scrape_course(course_url, subject_area)

                if not course_data:
                    results.append({
                        'url': course_url,
                        'success': False,
                        'error': 'Failed to scrape'
                    })
                    failed += 1
                    continue

                # Check for existing quest
                supabase = get_supabase_admin_client()
                existing = supabase.table('quests')\
                    .select('id')\
                    .eq('title', course_data['title'])\
                    .eq('quest_type', 'course')\
                    .maybe_single()\
                    .execute()

                if existing.data:
                    results.append({
                        'url': course_url,
                        'title': course_data['title'],
                        'success': False,
                        'error': 'Already exists'
                    })
                    failed += 1
                    continue

                # Create quest
                image_url = search_quest_image(course_data['title'], course_data['description'])

                quest_data = {
                    'title': course_data['title'],
                    'description': course_data['description'],
                    'big_idea': course_data['description'],
                    'quest_type': 'course',
                    'source': 'khan_academy',
                    'is_active': True,
                    'header_image_url': image_url,
                    'image_url': image_url,
                    'created_at': datetime.utcnow().isoformat()
                }

                quest_result = supabase.table('quests').insert(quest_data).execute()

                if not quest_result.data:
                    results.append({
                        'url': course_url,
                        'title': course_data['title'],
                        'success': False,
                        'error': 'Failed to create quest'
                    })
                    failed += 1
                    continue

                quest_id = quest_result.data[0]['id']

                # Create tasks
                tasks_data = []
                for unit in course_data['units']:
                    task_data = {
                        'quest_id': quest_id,
                        'title': unit['title'],
                        'description': unit['description'],
                        'pillar': unit['pillar'],
                        'xp_value': unit['xp_value'],
                        'order_index': unit['order_index'],
                        'is_required': unit.get('is_required', True),
                        'diploma_subjects': unit['diploma_subjects'],
                        'subject_xp_distribution': {subj: unit['xp_value'] for subj in unit['diploma_subjects']},
                        'created_at': datetime.utcnow().isoformat()
                    }
                    tasks_data.append(task_data)

                if tasks_data:
                    supabase.table('course_quest_tasks').insert(tasks_data).execute()

                results.append({
                    'url': course_url,
                    'title': course_data['title'],
                    'success': True,
                    'quest_id': quest_id,
                    'tasks_created': len(tasks_data)
                })
                successful += 1

                # Rate limiting: 2 second delay between courses
                time.sleep(khan_academy_scraper.get_rate_limit_delay())

            except Exception as e:
                logger.error(f"Error in batch sync for {course.get('url')}: {str(e)}")
                results.append({
                    'url': course.get('url'),
                    'success': False,
                    'error': str(e)
                })
                failed += 1

        return jsonify({
            'success': True,
            'message': f'Batch sync complete: {successful} successful, {failed} failed',
            'total': len(courses),
            'successful': successful,
            'failed': failed,
            'results': results
        })

    except Exception as e:
        logger.error(f"Error in batch sync: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Batch sync failed: {str(e)}'
        }), 500


@bp.route('/sync-status', methods=['GET'])
@require_admin
def get_sync_status(user_id):
    """
    Get list of synced Khan Academy courses.

    Returns:
        List of course quests with sync info
    """
    supabase = get_supabase_admin_client()

    try:
        # Get all Khan Academy course quests
        quests = supabase.table('quests')\
            .select('id, title, description, image_url, created_at, is_active')\
            .eq('source', 'khan_academy')\
            .eq('quest_type', 'course')\
            .order('created_at', desc=True)\
            .execute()

        # Get task counts for each quest
        quest_list = []
        for quest in quests.data:
            tasks = supabase.table('course_quest_tasks')\
                .select('id', count='exact')\
                .eq('quest_id', quest['id'])\
                .execute()

            quest_list.append({
                **quest,
                'tasks_count': tasks.count
            })

        return jsonify({
            'success': True,
            'quests': quest_list,
            'total': len(quest_list)
        })

    except Exception as e:
        logger.error(f"Error getting sync status: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get sync status'
        }), 500
