"""Admin tools: find similar, clone to Optio, fix course enrollments.

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


@bp.route('/quests/similar', methods=['GET'])
@require_advisor
def search_similar_quests(user_id):
    """
    Search for similar quests for autocomplete during quest creation.
    Respects organization visibility policies.

    Query Parameters:
    - search: Search term (quest title, minimum 3 characters)
    - limit: Maximum results (default: 10, max: 20)

    Returns:
    {
        "success": true,
        "quests": [...],
        "total": N
    }
    """
    try:
        search_term = request.args.get('search', '').strip()
        limit = min(int(request.args.get('limit', 10)), 20)

        # Require minimum 3 characters
        if len(search_term) < 3:
            return jsonify({
                'success': True,
                'quests': [],
                'message': 'Search term must be at least 3 characters'
            })

        # Use repository to search with organization awareness
        quest_repo = QuestRepository()

        quests = quest_repo.search_similar_quests(
            user_id=user_id,
            search_term=search_term,
            limit=limit
        )

        return jsonify({
            'success': True,
            'quests': quests,
            'total': len(quests)
        })

    except Exception as e:
        logger.error(f"Error searching similar quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to search similar quests'
        }), 500


@bp.route('/quests/<quest_id>/clone-to-optio', methods=['POST'])
@require_admin
def clone_quest_to_optio(user_id, quest_id):
    """
    Clone a quest into an Optio universal quest with AI enhancement.
    Superadmin only.

    Creates a new quest with:
    - organization_id = NULL (Optio universal)
    - is_active = False (draft)
    - is_public = False (private until reviewed)
    - quest_type = 'optio'
    - AI-enhanced title, description, and big_idea
    """
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()

    try:
        # Verify user is superadmin
        user = supabase.table('users').select('role').eq('id', user_id).execute()
        user_role = user.data[0].get('role') if user.data else None

        if user_role != 'superadmin':
            return jsonify({'success': False, 'error': 'Only superadmin can clone quests to Optio'}), 403

        # Fetch source quest
        source_quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not source_quest.data:
            return jsonify({'success': False, 'error': 'Source quest not found'}), 404

        # Use AI service to enhance the quest
        from services.quest_ai_service import QuestAIService
        ai_service = QuestAIService()
        ai_result = ai_service.clone_quest_to_optio(source_quest.data)

        if not ai_result.get('success'):
            return jsonify({
                'success': False,
                'error': ai_result.get('error', 'AI enhancement failed')
            }), 500

        enhanced_quest = ai_result['quest']

        # Auto-fetch header image using existing search_quest_image
        image_url = search_quest_image(
            enhanced_quest['title'],
            enhanced_quest.get('description', '')
        )
        logger.info(f"Auto-fetched image for cloned quest '{enhanced_quest['title']}': {image_url}")

        # Build metadata for tracking
        metadata = {
            'cloned_from': quest_id,
            'cloned_at': datetime.utcnow().isoformat(),
            'original_organization_id': source_quest.data.get('organization_id')
        }

        # Create new quest
        new_quest_data = {
            'title': enhanced_quest['title'],
            'description': enhanced_quest['description'],
            'big_idea': enhanced_quest['big_idea'],
            'topics': enhanced_quest.get('topics', []),
            'organization_id': None,  # Optio universal
            'is_active': False,  # Draft
            'is_public': False,  # Private until reviewed
            'quest_type': 'optio',
            'is_v3': True,
            'header_image_url': image_url,
            'image_url': image_url,
            'created_by': user_id,
            'created_at': datetime.utcnow().isoformat(),
            'metadata': metadata
        }

        quest_result = supabase.table('quests').insert(new_quest_data).execute()

        if not quest_result.data:
            return jsonify({'success': False, 'error': 'Failed to create cloned quest'}), 500

        new_quest = quest_result.data[0]
        logger.info(f"Successfully cloned quest {quest_id[:8]} to Optio as {new_quest['id'][:8]}")

        return jsonify({
            'success': True,
            'quest': new_quest,
            'message': 'Quest cloned successfully. Review and publish when ready.',
            'original_quest_id': quest_id
        })

    except Exception as e:
        logger.error(f"Error cloning quest to Optio: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to clone quest: {str(e)}'
        }), 500


@bp.route('/quests/fix-course-enrollments', methods=['POST'])
@require_admin
def fix_course_quest_enrollments(user_id):
    """
    One-time fix for existing course quest enrollments that are missing preset tasks.

    Finds all active course quest enrollments without tasks and auto-loads preset tasks.
    """
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()

    try:
        # Get all active course quest enrollments
        enrollments = supabase.table('user_quests')\
            .select('id, user_id, quest_id, quests!inner(quest_type, title)')\
            .eq('is_active', True)\
            .eq('quests.quest_type', 'course')\
            .execute()

        if not enrollments.data:
            return jsonify({
                'success': True,
                'message': 'No course quest enrollments found',
                'fixed': 0
            })

        logger.info(f"[FIX_COURSE_ENROLLMENTS] Found {len(enrollments.data)} course quest enrollments")

        fixed_count = 0
        skipped_count = 0
        failed_count = 0
        results = []

        from routes.quest_types import get_course_tasks_for_quest
        from services.subject_classification_service import SubjectClassificationService
        classification_service = SubjectClassificationService(client=supabase)

        # Pre-fetch all existing tasks for all enrollments in a single query to avoid N+1
        enrollment_ids = [enrollment['id'] for enrollment in enrollments.data]
        all_existing_tasks = supabase.table('user_quest_tasks')\
            .select('user_quest_id')\
            .in_('user_quest_id', enrollment_ids)\
            .execute()

        # Build a set of enrollment IDs that have existing tasks
        enrollments_with_tasks = {task['user_quest_id'] for task in all_existing_tasks.data}

        for enrollment in enrollments.data:
            enrollment_id = enrollment['id']
            quest_id = enrollment['quest_id']
            user_id_enrolled = enrollment['user_id']
            quest_title = enrollment['quests']['title']

            try:
                # Check if tasks already exist for this enrollment (using pre-fetched data)
                if enrollment_id in enrollments_with_tasks:
                    skipped_count += 1
                    results.append({
                        'enrollment_id': enrollment_id,
                        'quest_title': quest_title,
                        'user_id': user_id_enrolled[:8],
                        'status': 'skipped',
                        'reason': 'Tasks already exist'
                    })
                    continue

                # Get preset tasks for this course quest
                preset_tasks = get_course_tasks_for_quest(quest_id)

                if not preset_tasks:
                    failed_count += 1
                    results.append({
                        'enrollment_id': enrollment_id,
                        'quest_title': quest_title,
                        'user_id': user_id_enrolled[:8],
                        'status': 'failed',
                        'reason': 'No preset tasks found'
                    })
                    continue

                # Copy preset tasks to user_quest_tasks
                user_tasks_data = []
                for task in preset_tasks:
                    xp_value = task.get('xp_value', 100)

                    # Auto-generate subject distribution if not present
                    subject_distribution = task.get('subject_xp_distribution', {})
                    if not subject_distribution:
                        try:
                            subject_distribution = classification_service.classify_task_subjects(
                                task['title'],
                                task.get('description', ''),
                                task['pillar'],
                                xp_value
                            )
                        except Exception as e:
                            logger.warning(f"[FIX_COURSE_ENROLLMENTS] Failed to classify task, using fallback: {str(e)}")
                            subject_distribution = classification_service._fallback_subject_mapping(
                                task['pillar'],
                                xp_value
                            )

                    task_data = {
                        'user_id': user_id_enrolled,
                        'quest_id': quest_id,
                        'user_quest_id': enrollment_id,
                        'title': task['title'],
                        'description': task.get('description', ''),
                        'pillar': task['pillar'],
                        'xp_value': xp_value,
                        'order_index': task.get('order_index', 0),
                        'is_required': task.get('is_required', False),
                        'is_manual': False,
                        'approval_status': 'approved',
                        'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                        'subject_xp_distribution': subject_distribution
                    }
                    user_tasks_data.append(task_data)

                # Bulk insert tasks
                if user_tasks_data:
                    supabase.table('user_quest_tasks').insert(user_tasks_data).execute()

                    # Mark personalization as completed
                    supabase.table('user_quests')\
                        .update({'personalization_completed': True})\
                        .eq('id', enrollment_id)\
                        .execute()

                    fixed_count += 1
                    results.append({
                        'enrollment_id': enrollment_id,
                        'quest_title': quest_title,
                        'user_id': user_id_enrolled[:8],
                        'status': 'fixed',
                        'tasks_added': len(user_tasks_data)
                    })
                    logger.info(f"[FIX_COURSE_ENROLLMENTS] Fixed enrollment {enrollment_id[:8]} - added {len(user_tasks_data)} tasks")

            except Exception as e:
                failed_count += 1
                logger.error(f"[FIX_COURSE_ENROLLMENTS] Error fixing enrollment {enrollment_id[:8]}: {str(e)}")
                results.append({
                    'enrollment_id': enrollment_id,
                    'quest_title': quest_title,
                    'user_id': user_id_enrolled[:8],
                    'status': 'failed',
                    'error': str(e)
                })

        return jsonify({
            'success': True,
            'message': f'Fixed {fixed_count} enrollments, skipped {skipped_count}, failed {failed_count}',
            'fixed': fixed_count,
            'skipped': skipped_count,
            'failed': failed_count,
            'total_checked': len(enrollments.data),
            'results': results
        })

    except Exception as e:
        logger.error(f"[FIX_COURSE_ENROLLMENTS] Error: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to fix course enrollments: {str(e)}'
        }), 500