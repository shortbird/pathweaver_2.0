"""
Public Routes
API endpoints that do not require authentication.
Used for public course pages, discovery, and marketing.
"""

import re
from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('public', __name__, url_prefix='/api/public')


def generate_slug(title: str) -> str:
    """Generate a URL-friendly slug from a title."""
    if not title:
        return None
    # Convert to lowercase
    slug = title.lower()
    # Replace spaces and special characters with hyphens
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    # Remove leading/trailing hyphens
    slug = slug.strip('-')
    # Collapse multiple hyphens
    slug = re.sub(r'-+', '-', slug)
    return slug


def ensure_unique_slug(client, base_slug: str, course_id: str = None) -> str:
    """Ensure a slug is unique, appending a number if needed."""
    slug = base_slug
    counter = 1

    while True:
        # Check if slug exists
        query = client.table('courses').select('id').eq('slug', slug)
        if course_id:
            query = query.neq('id', course_id)  # Exclude current course when updating

        result = query.execute()

        if not result.data:
            return slug

        # Slug exists, try with counter
        slug = f"{base_slug}-{counter}"
        counter += 1

        if counter > 100:  # Safety limit
            import uuid
            return f"{base_slug}-{str(uuid.uuid4())[:8]}"


@bp.route('/courses', methods=['GET'])
def list_public_courses():
    """
    List all publicly available courses.

    Query params:
        - limit: Maximum number of courses to return (default: 50)
        - offset: Number of courses to skip (default: 0)

    Returns only courses with status='published' AND visibility='public'.
    No authentication required.
    """
    try:
        client = get_supabase_admin_client()

        limit = min(int(request.args.get('limit', 50)), 100)  # Cap at 100
        offset = int(request.args.get('offset', 0))

        # Query only public, published courses
        result = client.table('courses').select(
            'id, title, description, slug, cover_image_url, '
            'learning_outcomes, educational_value, '
            'parent_guidance, created_at'
        ).eq('visibility', 'public').eq('status', 'published').order(
            'created_at', desc=True
        ).range(offset, offset + limit - 1).execute()

        courses = result.data if result.data else []

        # Auto-generate slugs for courses missing them
        for course in courses:
            if not course.get('slug') and course.get('title'):
                base_slug = generate_slug(course['title'])
                if base_slug:
                    unique_slug = ensure_unique_slug(client, base_slug, course['id'])
                    # Update course with generated slug
                    client.table('courses').update({'slug': unique_slug}).eq('id', course['id']).execute()
                    course['slug'] = unique_slug
                    logger.info(f"Auto-generated slug '{unique_slug}' for course '{course['title']}'")

        # Get quest counts for each course
        if courses:
            course_ids = [c['id'] for c in courses]
            quest_counts = client.table('course_quests').select(
                'course_id, is_published'
            ).in_('course_id', course_ids).execute()

            count_map = {}
            for cq in (quest_counts.data or []):
                if cq.get('is_published') is False:
                    continue  # Skip unpublished quests
                cid = cq['course_id']
                count_map[cid] = count_map.get(cid, 0) + 1

            for course in courses:
                course['quest_count'] = count_map.get(course['id'], 0)

        return jsonify({
            'success': True,
            'courses': courses,
            'count': len(courses)
        }), 200

    except Exception as e:
        logger.error(f"Error listing public courses: {str(e)}")
        return jsonify({'error': 'Failed to load courses'}), 500


@bp.route('/courses/<slug>', methods=['GET'])
def get_public_course_by_slug(slug: str):
    """
    Get a single public course by its slug.

    Path params:
        slug: URL-friendly course identifier

    Returns course details including quests (projects) if the course
    is both published AND public. No authentication required.
    """
    try:
        client = get_supabase_admin_client()

        # Get course by slug (must be public and published)
        course_result = client.table('courses').select(
            'id, title, description, slug, cover_image_url, intro_content, '
            'learning_outcomes, educational_value, '
            'parent_guidance, visibility, status, created_at, organization_id'
        ).eq('slug', slug).execute()

        if not course_result.data:
            return jsonify({'error': 'Course not found'}), 404

        course = course_result.data[0]

        # Verify course is public and published
        if course.get('visibility') != 'public' or course.get('status') != 'published':
            return jsonify({'error': 'Course not found'}), 404

        # Get quests (projects) for this course - only published ones
        quests_result = client.table('course_quests').select(
            'id, sequence_order, custom_title, is_required, is_published, xp_threshold, '
            'quests(id, title, description, quest_type, header_image_url)'
        ).eq('course_id', course['id']).eq('is_published', True).order('sequence_order').execute()

        # Format quests for public display
        quests = []
        for item in (quests_result.data or []):
            quest_data = item.get('quests', {}) or {}
            quests.append({
                'id': quest_data.get('id') or item.get('quest_id'),
                'title': item.get('custom_title') or quest_data.get('title'),
                'description': quest_data.get('description'),
                'header_image_url': quest_data.get('header_image_url'),
                'sequence_order': item.get('sequence_order', 0),
                'is_required': item.get('is_required', False),
                'xp_threshold': item.get('xp_threshold', 0)
            })

        course['quests'] = quests
        course['quest_count'] = len(quests)

        # Get organization name if course belongs to an org
        if course.get('organization_id'):
            org_result = client.table('organizations').select('name').eq(
                'id', course['organization_id']
            ).execute()
            if org_result.data:
                course['organization_name'] = org_result.data[0].get('name')

        # Remove internal fields before returning
        course.pop('organization_id', None)

        return jsonify({
            'success': True,
            'course': course
        }), 200

    except Exception as e:
        logger.error(f"Error getting public course by slug '{slug}': {str(e)}")
        return jsonify({'error': 'Failed to load course'}), 500
