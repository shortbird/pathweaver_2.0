"""
Public Routes
API endpoints that do not require authentication.
Used for public course pages, discovery, and marketing.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.slug_utils import generate_slug, ensure_unique_slug

logger = get_logger(__name__)

bp = Blueprint('public', __name__, url_prefix='/api/public')


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
            'parent_guidance, final_deliverable, target_audience, '
            'progress_model, created_at'
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
            'parent_guidance, final_deliverable, target_audience, '
            'progress_model, visibility, status, created_at, organization_id'
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


@bp.route('/transcript/<user_id>', methods=['GET'])
def get_public_transcript(user_id):
    """
    Public transcript endpoint. Only returns data if a transcript
    has been created for the student (transcript_overrides row exists).
    No authentication required.
    """
    try:
        client = get_supabase_admin_client()

        # Check transcript exists
        overrides_result = client.table('transcript_overrides').select('overrides').eq(
            'user_id', user_id
        ).execute()
        if not overrides_result.data:
            return jsonify({'error': 'Transcript not found'}), 404

        overrides = overrides_result.data[0].get('overrides', {})

        # Student info
        user_result = client.table('users').select(
            'id, first_name, last_name, created_at, organization_id, date_of_birth'
        ).eq('id', user_id).execute()
        if not user_result.data:
            return jsonify({'error': 'Student not found'}), 404

        student = user_result.data[0]

        org_name = None
        if student.get('organization_id'):
            org_result = client.table('organizations').select('name').eq(
                'id', student['organization_id']
            ).execute()
            if org_result.data:
                org_name = org_result.data[0].get('name')

        XP_PER_CREDIT = 2000
        SUBJECT_DISPLAY_NAMES = {
            'language_arts': 'Language Arts', 'math': 'Mathematics', 'science': 'Science',
            'social_studies': 'Social Studies', 'financial_literacy': 'Financial Literacy',
            'health': 'Health', 'pe': 'Physical Education', 'fine_arts': 'Fine Arts',
            'cte': 'Career & Technical Education', 'digital_literacy': 'Digital Literacy',
            'electives': 'Electives'
        }

        # Transfer credits
        tc_result = client.table('transfer_credits').select('*').eq(
            'user_id', user_id
        ).order('created_at', desc=False).execute()

        transfer_credits = []
        transfer_xp_by_subject = {}
        for tc in (tc_result.data or []):
            subject_xp = tc.get('subject_xp', {})
            subjects = {}
            for subj, xp in subject_xp.items():
                transfer_xp_by_subject[subj] = transfer_xp_by_subject.get(subj, 0) + xp
                subjects[subj] = {
                    'xp': xp,
                    'credits': round(xp / XP_PER_CREDIT, 2),
                    'display_name': SUBJECT_DISPLAY_NAMES.get(subj, subj)
                }
            transcript_url = tc.get('transcript_url')
            if transcript_url:
                transcript_url = transcript_url.replace(
                    'vvfgxcykxjybtvpfzwyx.supabase.co',
                    'auth.optioeducation.com'
                )
            transfer_credits.append({
                'id': tc['id'],
                'school_name': tc.get('school_name'),
                'subjects': subjects,
                'total_credits': sum(s['credits'] for s in subjects.values()),
                'transcript_url': transcript_url,
                'course_names': tc.get('course_names') or {}
            })

        # Earned subject XP minus transfer
        subject_xp_result = client.table('user_subject_xp').select(
            'school_subject, xp_amount'
        ).eq('user_id', user_id).execute()

        earned_credits = {}
        for row in (subject_xp_result.data or []):
            subject = row['school_subject']
            optio_xp = max(0, row.get('xp_amount', 0) - transfer_xp_by_subject.get(subject, 0))
            if optio_xp > 0:
                earned_credits[subject] = {
                    'xp': optio_xp,
                    'credits': round(optio_xp / XP_PER_CREDIT, 2),
                    'display_name': SUBJECT_DISPLAY_NAMES.get(subject, subject)
                }

        # Planned credits
        planned_result = client.table('planned_credits').select('*').eq(
            'user_id', user_id
        ).order('created_at', desc=False).execute()

        planned_credits = []
        for pc in (planned_result.data or []):
            planned_credits.append({
                'school_subject': pc['school_subject'],
                'display_name': SUBJECT_DISPLAY_NAMES.get(pc['school_subject'], pc['school_subject']),
                'course_name': pc['course_name'],
                'credits': float(pc['credits']),
                'status': pc['status'],
                'source': pc.get('source')
            })

        total_earned = sum(c['credits'] for c in earned_credits.values())
        total_transfer = sum(tc['total_credits'] for tc in transfer_credits)
        total_planned = sum(pc['credits'] for pc in planned_credits if pc['status'] == 'in_progress')

        return jsonify({
            'success': True,
            'data': {
                'student': {
                    'first_name': student.get('first_name'),
                    'last_name': student.get('last_name'),
                    'date_of_birth': student.get('date_of_birth'),
                    'enrolled_date': student.get('created_at'),
                    'organization_name': org_name
                },
                'earned_credits': earned_credits,
                'transfer_credits': transfer_credits,
                'planned_credits': planned_credits,
                'overrides': overrides,
                'totals': {
                    'earned_credits': round(total_earned, 2),
                    'transfer_credits': round(total_transfer, 2),
                    'planned_credits': round(total_planned, 2),
                    'total_completed': round(total_earned + total_transfer, 2)
                }
            }
        }), 200

    except Exception as e:
        logger.error(f"Error getting public transcript for {user_id}: {str(e)}")
        return jsonify({'error': 'Failed to load transcript'}), 500
