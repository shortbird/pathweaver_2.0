"""
Quest V3 API endpoints.
Handles quest listing, enrollment, and detail views.
"""

from flask import Blueprint, request, jsonify, g
from database import get_supabase_client, get_supabase_admin_client, get_user_client
from backend.repositories import (
    UserRepository,
    QuestRepository,
    BadgeRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
from utils.auth.decorators import require_auth
from utils.source_utils import get_quest_header_image
from utils.user_sync import ensure_user_exists, get_user_name
from services.quest_optimization import quest_optimization_service
from utils.pillar_utils import get_pillar_name
from utils.pillar_mapping import normalize_pillar_name
from repositories.quest_repository import QuestRepository, QuestTaskRepository
from repositories.base_repository import NotFoundError, DatabaseError
from datetime import datetime
from typing import Dict, Any, List, Optional

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('quests', __name__, url_prefix='/api/quests')

@bp.route('', methods=['GET'])
def list_quests():
    """
    List all active quests with their tasks.
    Public endpoint - no auth required.
    Includes user enrollment data if authenticated.
    """
    try:
        # Check if user is authenticated
        auth_header = request.headers.get('Authorization')
        user_id = None
        if auth_header and auth_header.startswith('Bearer '):
            try:
                from utils.auth.token_utils import verify_token
                token = auth_header.split(' ')[1]
                user_id = verify_token(token)
            except Exception as e:
                logger.error(f"Auth check failed: {e}")
                pass  # Continue without auth
        supabase = get_supabase_client()
        
        # Get pagination parameters with sanitization
        from utils.validation.sanitizers import sanitize_search_input, sanitize_integer
        
        page = sanitize_integer(request.args.get('page', 1), default=1, min_val=1)
        per_page = sanitize_integer(request.args.get('per_page', 12), default=12, min_val=1, max_val=100)
        search = sanitize_search_input(request.args.get('search', ''))
        pillar_filter = sanitize_search_input(request.args.get('pillar', ''), max_length=50)
        subject_filter = sanitize_search_input(request.args.get('subject', ''), max_length=50)

        # Log search parameter for debugging
        if search:
            logger.info(f"[SEARCH DEBUG] Search term received: '{search}'")
        
        # Calculate offset
        offset = (page - 1) * per_page
        
        # Build base query with joins for filtering
        # First, we need to filter quests based on their tasks
        filtered_quest_ids = None

        # Use optimized filtering service
        filtered_quest_ids = quest_optimization_service.get_quest_filtering_optimization(
            pillar_filter, subject_filter
        )

        # Handle empty filter results
        if filtered_quest_ids is not None and len(filtered_quest_ids) == 0:
            return jsonify({
                'success': True,
                'quests': [],
                'total': 0,
                'page': page,
                'per_page': per_page,
                'total_pages': 0,
                'has_more': False
            })

        # Build main quest query
        # Note: In V3 personalized system, quests don't have quest_tasks
        # Users get personalized tasks when they enroll
        query = supabase.table('quests')\
            .select('*', count='exact')\
            .eq('is_active', True)

        # Apply visibility filter
        if user_id:
            # Authenticated user: show public quests + their own private quests
            query = query.or_(
                f'is_public.eq.true,'
                f'created_by.eq.{user_id}'
            )
        else:
            # Anonymous user: only show public quests
            query = query.eq('is_public', True)

        # Apply quest ID filter if we have filters applied
        if filtered_quest_ids is not None:
            quest_ids_list = list(filtered_quest_ids)
            if quest_ids_list:
                query = query.in_('id', quest_ids_list)
            else:
                # No matching quests - return empty
                return jsonify({
                    'success': True,
                    'quests': [],
                    'total': 0,
                    'page': page,
                    'per_page': per_page,
                    'total_pages': 0,
                    'has_more': False
                })

        # Apply search filter if provided (search in both title and description)
        if search:
            logger.info(f"[SEARCH DEBUG] Applying search filter: '{search}'")
            # Use proper Supabase filter syntax with or_
            query = query.or_(f'title.ilike.%{search}%,description.ilike.%{search}%')
            logger.info(f"[SEARCH DEBUG] Query after filter applied")

        # Apply ordering
        query = query.order('created_at', desc=True)
        
        # Apply pagination with error handling
        try:
            query = query.range(offset, offset + per_page - 1)
            result = query.execute()
        except Exception as e:
            # Handle 416 "Requested Range Not Satisfiable" errors
            if "416" in str(e) or "Requested Range Not Satisfiable" in str(e):
                # Return empty results when offset exceeds total count
                return jsonify({
                    'success': True,
                    'quests': [],
                    'total': 0,
                    'page': page,
                    'per_page': per_page,
                    'total_pages': 0,
                    'has_more': False
                })
            else:
                # Re-raise other exceptions
                raise e
        
        # Process quest data
        quests = []
        for quest in result.data:
            # In V3 personalized system, XP/tasks are user-specific
            # We'll show placeholders here and populate with actual data
            # when user enrolls
            quest['total_xp'] = 0  # Will be calculated when user personalizes
            quest['task_count'] = 0  # Will be set during personalization
            # DON'T initialize pillar_breakdown here - it will be set by optimization service
            # for enrolled quests only. Unenrolled quests won't have pillar_breakdown since
            # tasks are personalized and don't exist until enrollment.

            # Add source header image if no custom header exists
            if not quest.get('header_image_url') and quest.get('source'):
                source_header = get_quest_header_image(quest)
                if source_header:
                    quest['header_image_url'] = source_header

            # Add quest to list (user enrollment data will be added in batch)
            quests.append(quest)

        # OPTIMIZATION: Add user enrollment data using batch queries instead of N+1
        if user_id and quests:
            logger.info(f"[OPTIMIZATION] Using batch queries for {len(quests)} quests instead of {len(quests) * 2} individual queries")
            quests = quest_optimization_service.enrich_quests_with_user_data(quests, user_id)

        # DEBUG: Log all quests to verify pillar_breakdown is in response
        if quests:
            for idx, q in enumerate(quests[:5]):  # Log first 5 quests
                print(f"[API RESPONSE] Quest {idx}: id={q.get('id', 'no-id')[:8]}, title={q.get('title', 'No title')[:30]}, pillar_breakdown={q.get('pillar_breakdown', {})}, has_enrollment={bool(q.get('user_enrollment') or q.get('completed_enrollment'))}")

        # Calculate if there are more pages
        total_pages = (result.count + per_page - 1) // per_page if result.count else 0
        has_more = page < total_pages

        return jsonify({
            'success': True,
            'quests': quests,
            'total': result.count,
            'page': page,
            'per_page': per_page,
            'total_pages': total_pages,
            'has_more': has_more
        })
        
    except Exception as e:
        logger.error(f"Error listing quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch quests'
        }), 500

# Using repository pattern for database access
@bp.route('/<quest_id>', methods=['GET'])
@require_auth
def get_quest_detail(user_id: str, quest_id: str):
    """
    Get detailed information about a specific quest.
    Includes user's progress if enrolled.
    Uses user-specific tasks if enrolled, otherwise shows quest template.
    """
    try:
        # Use admin client for all queries since we're accessing user-specific data
        # User authentication is already enforced by @require_auth decorator
        supabase = get_supabase_admin_client()

        # Get quest basic info (without tasks - they're user-specific now)
        quest = supabase.table('quests')\
            .select('*')\
            .eq('id', quest_id)\
            .single()\
            .execute()

        logger.info(f"[QUEST DETAIL] Quest query response: {quest.data}")

        if not quest.data:
            return jsonify({
                'success': False,
                'error': 'Quest not found'
            }), 404

        quest_data = quest.data

        # Add source header image if no custom header exists
        if not quest_data.get('header_image_url') and quest_data.get('source'):
            source_header = get_quest_header_image(quest_data)
            if source_header:
                quest_data['header_image_url'] = source_header

        # Check if user is enrolled and get their personalized tasks
        logger.info(f"[QUEST DETAIL] Checking enrollment for user {user_id[:8]} on quest {quest_id[:8]}")

        # Get all enrollments for this user and quest
        # Using admin client since user_id is already authenticated via @require_auth
        all_enrollments = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        enrollments_data = all_enrollments.data or []
        logger.info(f"[QUEST DETAIL] All enrollments found: {len(enrollments_data)}")
        for enrollment in enrollments_data:
            print(f"[QUEST DETAIL] Enrollment: id={enrollment.get('id')}, is_active={enrollment.get('is_active')}, completed_at={enrollment.get('completed_at')}, personalization_completed={enrollment.get('personalization_completed')}")
        
        # Find active or completed enrollment
        active_enrollment = None
        completed_enrollment = None

        for enrollment in enrollments_data:
            # Check if completed
            if enrollment.get('completed_at'):
                completed_enrollment = enrollment
            # Consider enrollment active if not completed and is_active is true
            elif not enrollment.get('completed_at'):
                is_active = enrollment.get('is_active')
                if is_active is not False:  # True or None are both considered active
                    active_enrollment = enrollment

        # Get user-specific tasks if enrolled (regardless of personalization_completed status)
        if active_enrollment or completed_enrollment:
            enrollment_to_use = completed_enrollment or active_enrollment
            logger.info(f"[QUEST_DETAIL] Using enrollment ID: {enrollment_to_use['id'][:8]}, user_id: {user_id[:8]}, quest_id: {quest_id[:8]}")

            # Debug: Check ALL tasks for this user and quest (ignoring user_quest_id)
            all_user_tasks_debug = supabase.table('user_quest_tasks')\
                .select('id, user_quest_id, title')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()
            logger.info(f"[QUEST_DETAIL] DEBUG: Found {len(all_user_tasks_debug.data or [])} tasks for user+quest combo (any enrollment)")
            for task in (all_user_tasks_debug.data or [])[:3]:  # Log first 3
                logger.info(f"[QUEST_DETAIL] DEBUG Task: title={task['title'][:30]}, user_quest_id={task['user_quest_id'][:8]}")

            # Get user's personalized tasks
            user_tasks = supabase.table('user_quest_tasks')\
                .select('*')\
                .eq('user_quest_id', enrollment_to_use['id'])\
                .eq('approval_status', 'approved')\
                .order('order_index')\
                .execute()

            logger.info(f"[QUEST_DETAIL] Found {len(user_tasks.data or [])} approved tasks for user_quest_id {enrollment_to_use['id'][:8]}")

            # Get task completions with evidence (only columns that exist in table)
            task_completions = supabase.table('quest_task_completions')\
                .select('user_quest_task_id, evidence_text, evidence_url, completed_at')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            completed_task_ids = {t['user_quest_task_id'] for t in task_completions.data} if task_completions.data else set()

            # DEBUG: Log completion data
            logger.info(f"[QUEST_DETAIL] Task completions for user {user_id[:8]} on quest {quest_id[:8]}:")
            logger.info(f"[QUEST_DETAIL] Found {len(task_completions.data or [])} completion records")
            for comp in (task_completions.data or [])[:5]:  # Log first 5
                logger.info(f"[QUEST_DETAIL]   Completion: user_quest_task_id={comp['user_quest_task_id'][:8]}, completed_at={comp.get('completed_at')}")
            logger.info(f"[QUEST_DETAIL] Completed task IDs set: {[id[:8] for id in list(completed_task_ids)[:5]]}")

            # Create a mapping of task_id to completion data for easy lookup
            completion_data_map = {t['user_quest_task_id']: t for t in task_completions.data} if task_completions.data else {}

            # Debug: Check raw pillar values from database
            logger.info(f"[QUEST_DETAIL] Raw tasks from DB for quest {quest_id}:")
            for i, task in enumerate(user_tasks.data or []):
                print(f"  Task {i}: '{task.get('title')}' - pillar='{task.get('pillar')}'")

            # Mark tasks as completed and map field names for frontend compatibility
            quest_tasks = user_tasks.data or []
            for task in quest_tasks:
                task_is_completed = task['id'] in completed_task_ids
                task['is_completed'] = task_is_completed
                # DEBUG: Log each task's completion status
                logger.info(f"[QUEST_DETAIL] Task '{task.get('title')[:30]}': id={task['id'][:8]}, is_completed={task_is_completed}, in_completed_set={task['id'] in completed_task_ids}")

                # Add evidence data if task is completed
                if task['id'] in completion_data_map:
                    completion = completion_data_map[task['id']]
                    task['evidence_text'] = completion.get('evidence_text')
                    task['evidence_url'] = completion.get('evidence_url')
                    task['completed_at'] = completion.get('completed_at')
                    # Note: evidence_type and evidence_blocks are not in quest_task_completions table
                    # They may be stored in evidence_document_blocks table separately

                # Map xp_value to xp_amount for frontend compatibility
                if 'xp_value' in task:
                    task['xp_amount'] = task['xp_value']
                # Map diploma_subjects to school_subjects for frontend compatibility
                if 'diploma_subjects' in task:
                    task['school_subjects'] = task['diploma_subjects']
                # Normalize pillar to new key format for frontend
                # Frontend expects lowercase keys like 'stem', 'art', etc.
                if 'pillar' in task:
                    original_pillar = task['pillar']
                    # Normalize pillar to new single-word key (handles legacy values)
                    try:
                        pillar_key = normalize_pillar_name(task['pillar'])
                    except ValueError:
                        pillar_key = 'art'  # Default fallback
                    print(f"[QUEST_DETAIL] Task '{task.get('title')}': DB pillar='{original_pillar}' -> sending key='{pillar_key}' to frontend")
                    task['pillar'] = pillar_key  # Send key, not display name

            quest_data['quest_tasks'] = quest_tasks

            # Calculate progress
            total_tasks = len(quest_tasks)
            completed_count = len(completed_task_ids)

            if completed_enrollment:
                logger.info(f"[QUEST DETAIL] Using completed enrollment")
                quest_data['completed_enrollment'] = completed_enrollment
                quest_data['user_enrollment'] = None
                quest_data['progress'] = {
                    'completed_tasks': completed_count,
                    'total_tasks': total_tasks,
                    'percentage': 100
                }
            elif active_enrollment:
                logger.info(f"[QUEST DETAIL] Using active enrollment")
                quest_data['user_enrollment'] = active_enrollment
                quest_data['progress'] = {
                    'completed_tasks': completed_count,
                    'total_tasks': total_tasks,
                    'percentage': (completed_count / total_tasks * 100) if total_tasks > 0 else 0
                }
        else:
            # Not enrolled - show empty quest (personalization required)
            logger.info(f"[QUEST DETAIL] User not enrolled or personalization not completed")
            quest_data['quest_tasks'] = []
            quest_data['user_enrollment'] = None
            quest_data['completed_enrollment'] = None
            quest_data['progress'] = None

        # Add quest type-specific data for non-enrolled users
        # Import helper functions here to avoid circular import
        from routes.quest_types import get_sample_tasks_for_quest, get_course_tasks_for_quest

        quest_type = quest_data.get('quest_type', 'optio')

        if not (active_enrollment or completed_enrollment):
            # User not enrolled - show sample/preset tasks based on quest type
            if quest_type == 'optio':
                # Optio quest - show sample tasks as inspiration
                sample_tasks = get_sample_tasks_for_quest(quest_id, randomize=True)
                quest_data['sample_tasks'] = sample_tasks
                quest_data['preset_tasks'] = []
                logger.info(f"[QUEST DETAIL] Added {len(sample_tasks)} sample tasks for Optio quest")
            elif quest_type == 'course':
                # Course quest - show preset tasks
                preset_tasks = get_course_tasks_for_quest(quest_id)
                quest_data['preset_tasks'] = preset_tasks
                quest_data['sample_tasks'] = []
                logger.info(f"[QUEST DETAIL] Added {len(preset_tasks)} preset tasks for Course quest")
        else:
            # User is enrolled - no need for sample/preset tasks
            quest_data['sample_tasks'] = []
            quest_data['preset_tasks'] = []

        # Note: Quest-level collaboration has been replaced by task-level collaboration
        # Task collaboration status is handled at the task level in the frontend

        return jsonify({
            'success': True,
            'quest': quest_data
        })
        
    except Exception as e:
        logger.error(f"Error getting quest detail: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch quest details'
        }), 500

@bp.route('/<quest_id>/enrollment-status', methods=['GET'])
@require_auth
def check_enrollment_status(user_id: str, quest_id: str):
    """
    Check if user is enrolled in a specific quest.
    Returns enrollment details if enrolled.
    """
    try:
        supabase = get_supabase_client()
        
        # Check for any enrollment
        enrollment = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()
        
        if not enrollment.data:
            return jsonify({
                'enrolled': False,
                'status': 'not_enrolled'
            })
        
        # Check for active enrollment
        for enr in enrollment.data:
            if enr.get('is_active') and not enr.get('completed_at'):
                return jsonify({
                    'enrolled': True,
                    'status': 'active',
                    'enrollment': enr
                })
            elif enr.get('completed_at'):
                return jsonify({
                    'enrolled': True,
                    'status': 'completed',
                    'enrollment': enr
                })
        
        # Has enrollment but it's inactive
        return jsonify({
            'enrolled': True,
            'status': 'inactive',
            'enrollment': enrollment.data[0]
        })
        
    except Exception as e:
        logger.error(f"Error checking enrollment status: {str(e)}")
        return jsonify({
            'error': 'Failed to check enrollment status'
        }), 500

@bp.route('/<quest_id>/enroll', methods=['POST'])
@require_auth
def enroll_in_quest(user_id: str, quest_id: str):
    """
    Enroll a user in a quest.
    Creates a user_quests record to track progress.
    """
    try:
        # Use admin client for reading quest data (public info, no RLS restrictions)
        quest_repo = QuestRepository()

        # Check if quest exists and is active using repository
        quest = quest_repo.find_by_id(quest_id)

        if not quest:
            return jsonify({
                'success': False,
                'error': 'Quest not found'
            }), 404

        if not quest.get('is_active'):
            return jsonify({
                'success': False,
                'error': 'Quest is not active'
            }), 400

        # Check if already enrolled using repository client
        existing = quest_repo.client.table('user_quests')\
            .select('id, is_active, completed_at, personalization_completed')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        # Check if there's an active (in-progress) enrollment
        if existing.data:
            for enrollment in existing.data:
                # If there's an active enrollment that's NOT completed, return it (allow personalization)
                if enrollment.get('is_active') and not enrollment.get('completed_at'):
                    return jsonify({
                        'success': True,
                        'message': f'Already enrolled in "{quest.get("title")}"',
                        'enrollment': enrollment,
                        'already_enrolled': True
                    })

            # If there are only completed enrollments, allow creating a new enrollment
            # (We'll create a new record below rather than reactivating to preserve history)

        # Create enrollment using repository
        enrollment = quest_repo.enroll_user(user_id, quest_id)

        # Check quest type and handle accordingly
        quest_type = quest.get('quest_type', 'optio')
        skip_wizard = False

        if quest_type == 'course':
            # Course quest - auto-copy preset tasks to user_quest_tasks
            logger.info(f"[COURSE_ENROLL] Course quest detected - auto-copying preset tasks for user {user_id[:8]}, quest {quest_id[:8]}")

            try:
                from routes.quest_types import get_course_tasks_for_quest

                preset_tasks = get_course_tasks_for_quest(quest_id)
                logger.info(f"[COURSE_ENROLL] Found {len(preset_tasks)} preset tasks")

                if preset_tasks:
                    # Initialize classification service for auto-generating subject distributions
                    from services.subject_classification_service import SubjectClassificationService
                    classification_service = SubjectClassificationService(client=get_supabase_admin_client())

                    # Copy all preset tasks to user_quest_tasks
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
                                logger.info(f"[COURSE_ENROLL] Auto-classified task '{task['title'][:30]}': {subject_distribution}")
                            except Exception as e:
                                logger.warning(f"[COURSE_ENROLL] Failed to classify task, using fallback: {str(e)}")
                                subject_distribution = classification_service._fallback_subject_mapping(
                                    task['pillar'],
                                    xp_value
                                )

                        task_data = {
                            'user_id': user_id,
                            'quest_id': quest_id,
                            'user_quest_id': enrollment['id'],
                            'title': task['title'],
                            'description': task.get('description', ''),
                            'pillar': task['pillar'],
                            'xp_value': xp_value,
                            'order_index': task.get('order_index', 0),
                            'is_required': task.get('is_required', True),
                            'is_manual': False,
                            'approval_status': 'approved',
                            'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                            'subject_xp_distribution': subject_distribution
                        }
                        user_tasks_data.append(task_data)
                        logger.info(f"[COURSE_ENROLL] Prepared task: {task['title'][:30]}")

                    # Bulk insert tasks using admin client (system operation)
                    # RLS policies require admin privileges for auto-copying preset tasks
                    if user_tasks_data:
                        logger.info(f"[COURSE_ENROLL] Inserting {len(user_tasks_data)} tasks into user_quest_tasks")
                        admin_client = get_supabase_admin_client()
                        insert_result = admin_client.table('user_quest_tasks').insert(user_tasks_data).execute()
                        logger.info(f"[COURSE_ENROLL] Successfully inserted {len(insert_result.data)} tasks")

                    # Mark personalization as completed (no wizard needed)
                    logger.info(f"[COURSE_ENROLL] Marking personalization as completed for enrollment {enrollment['id'][:8]}")
                    admin_client = get_supabase_admin_client()
                    admin_client.table('user_quests')\
                        .update({'personalization_completed': True})\
                        .eq('id', enrollment['id'])\
                        .execute()
                    logger.info(f"[COURSE_ENROLL] Personalization marked complete")
                else:
                    logger.warning(f"[COURSE_ENROLL] No preset tasks found for course quest {quest_id[:8]}")

                skip_wizard = True

            except Exception as task_error:
                logger.error(f"[COURSE_ENROLL] ERROR copying tasks: {str(task_error)}", exc_info=True)
                # Don't fail the enrollment, but log the error
                # User will still be enrolled but without tasks

        return jsonify({
            'success': True,
            'message': f'Successfully enrolled in "{quest.get("title")}"',
            'enrollment': enrollment,
            'skip_wizard': skip_wizard,  # Tell frontend to skip personalization wizard
            'quest_type': quest_type
        })

    except NotFoundError as e:
        logger.error(f"Quest not found: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except DatabaseError as e:
        logger.error(f"Database error enrolling in quest {quest_id} for user {user_id}: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to enroll in quest'
        }), 500
    except Exception as e:
        logger.error(f"Unexpected error enrolling in quest {quest_id} for user {user_id}: {str(e)}", exc_info=True)
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Failed to enroll in quest'
        }), 500

@bp.route('/my-active', methods=['GET'])
@require_auth
def get_user_active_quests(user_id: str):
    """
    Get all active quests for the current user.
    Includes progress information.
    """
    try:
        # Use admin client - user authentication enforced by @require_auth
        supabase = get_supabase_admin_client()
        
        # Get user's active quests with progress
        # Note: In V3 personalized system, quest_tasks table is archived
        # Each user has personalized tasks in user_quest_tasks table
        user_quests = supabase.table('user_quests')\
            .select('*, quests(*)')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .is_('completed_at', 'null')\
            .order('started_at', desc=True)\
            .execute()

        if not user_quests.data:
            return jsonify({
                'success': True,
                'quests': [],
                'message': 'No active quests'
            })

        # Process each quest to add progress info
        active_quests = []
        for uq in user_quests.data:
            quest = uq.get('quests')
            if not quest:
                continue

            user_quest_id = uq['id']

            # Get user's personalized tasks for this quest
            user_tasks = supabase.table('user_quest_tasks')\
                .select('id, xp_value')\
                .eq('user_quest_id', user_quest_id)\
                .eq('approval_status', 'approved')\
                .execute()

            # Get completed tasks for this quest
            completed_tasks_response = supabase.table('quest_task_completions')\
                .select('task_id')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest['id'])\
                .execute()

            completed_task_ids = {t['task_id'] for t in (completed_tasks_response.data or [])}
            total_tasks = len(user_tasks.data) if user_tasks.data else 0
            completed_count = len(completed_task_ids)

            quest['enrollment_id'] = uq['id']
            quest['started_at'] = uq['started_at']
            quest['progress'] = {
                'completed_tasks': completed_count,
                'total_tasks': total_tasks,
                'percentage': (completed_count / total_tasks * 100) if total_tasks > 0 else 0
            }

            # Calculate XP earned from completed tasks
            xp_earned = sum(
                task['xp_value'] for task in (user_tasks.data or [])
                if task['id'] in completed_task_ids
            )
            quest['xp_earned'] = xp_earned
            
            active_quests.append(quest)
        
        return jsonify({
            'success': True,
            'quests': active_quests,
            'total': len(active_quests)
        })
        
    except Exception as e:
        logger.error(f"Error getting user active quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch active quests'
        }), 500

@bp.route('/completed', methods=['GET'])
@require_auth
def get_user_completed_quests(user_id: str):
    """
    Get all completed and in-progress quests for the current user.
    Used for diploma page and achievement display.
    Optimized to fetch all data in bulk to prevent N+1 queries.
    """
    try:
        # Use admin client - user authentication already enforced by @require_auth
        # Queries are explicitly filtered by user_id
        supabase = get_supabase_admin_client()

        # Fetch ALL user data in parallel using just 3 queries
        # Query 1: Get all user quests (completed + in-progress)
        user_quests_response = supabase.table('user_quests')\
            .select('*, quests(*)')\
            .eq('user_id', user_id)\
            .order('completed_at', desc=True)\
            .execute()

        # Query 2: Get ALL task completions for this user with task details
        quest_task_completions = supabase.table('quest_task_completions')\
            .select('*, user_quest_tasks!inner(title, pillar, quest_id, user_quest_id, xp_value)')\
            .eq('user_id', user_id)\
            .execute()

        # Query 3: Get ALL evidence documents with blocks for this user
        evidence_documents_response = supabase.table('user_task_evidence_documents')\
            .select('*, evidence_document_blocks(*)')\
            .eq('user_id', user_id)\
            .execute()

        # Map evidence documents by task_id for quick lookup
        evidence_docs_by_task = {}
        if evidence_documents_response.data:
            for doc in evidence_documents_response.data:
                task_id = doc.get('task_id')
                if task_id:
                    evidence_docs_by_task[task_id] = doc

        # Separate completed and in-progress quests from the fetched data
        completed_quests = [q for q in (user_quests_response.data or []) if q.get('completed_at')]
        in_progress_quests = [q for q in (user_quests_response.data or []) if not q.get('completed_at') and q.get('is_active')]

        # Get task counts for all user quests in one query (for progress calculation)
        all_user_quest_ids = [q['id'] for q in (user_quests_response.data or [])]
        task_counts_by_quest = {}
        if all_user_quest_ids:
            # Fetch all user quest tasks to count them by user_quest_id
            all_tasks_response = supabase.table('user_quest_tasks')\
                .select('id, user_quest_id')\
                .in_('user_quest_id', all_user_quest_ids)\
                .execute()

            # Count tasks per quest
            for task in (all_tasks_response.data or []):
                uq_id = task.get('user_quest_id')
                if uq_id:
                    task_counts_by_quest[uq_id] = task_counts_by_quest.get(uq_id, 0) + 1

        # Process quests with evidence
        achievements = []

        # Add completed quests
        for cq in completed_quests:
                quest = cq.get('quests')
                if not quest:
                    continue

                user_quest_id = cq.get('id')
                quest_id = quest.get('id')

                # Get task completions for this quest
                quest_completions = [
                    tc for tc in (quest_task_completions.data or [])
                    if tc.get('user_quest_tasks', {}).get('quest_id') == quest_id
                    and tc.get('user_quest_tasks', {}).get('user_quest_id') == user_quest_id
                ]

                # Organize evidence by task
                task_evidence = {}
                total_xp = 0

                for tc in quest_completions:
                    task_info = tc.get('user_quest_tasks', {})
                    task_title = task_info.get('title', 'Unknown Task')
                    user_quest_task_id = tc.get('user_quest_task_id')

                    # Get XP from user_quest_tasks
                    task_xp = task_info.get('xp_value', 0)
                    total_xp += task_xp

                    # Check for multi-format evidence document
                    evidence_doc = evidence_docs_by_task.get(user_quest_task_id)

                    if evidence_doc and evidence_doc.get('evidence_document_blocks'):
                        # Multi-format evidence
                        task_evidence[task_title] = {
                            'evidence_type': 'multi_format',
                            'evidence_blocks': evidence_doc.get('evidence_document_blocks', []),
                            'evidence_content': '',  # Not used for multi-format
                            'xp_awarded': task_xp,
                            'completed_at': tc.get('completed_at'),
                            'pillar': task_info.get('pillar', 'Arts & Creativity')
                        }
                    else:
                        # Legacy single-format evidence
                        evidence_content = tc.get('evidence_text', '') or tc.get('evidence_url', '')
                        task_evidence[task_title] = {
                            'evidence_type': 'text' if tc.get('evidence_text') else 'link',
                            'evidence_content': evidence_content,
                            'xp_awarded': task_xp,
                            'completed_at': tc.get('completed_at'),
                            'pillar': task_info.get('pillar', 'Arts & Creativity')
                        }

                achievement = {
                    'quest': quest,
                    'completed_at': cq['completed_at'],
                    'task_evidence': task_evidence,
                    'total_xp_earned': total_xp,
                    'status': 'completed'
                }

                achievements.append(achievement)

        # Add in-progress quests with at least one submitted task
        for cq in in_progress_quests:
                quest = cq.get('quests')
                if not quest:
                    continue

                user_quest_id = cq.get('id')
                quest_id = quest.get('id')

                # Get task completions for this quest
                quest_completions = [
                    tc for tc in (quest_task_completions.data or [])
                    if tc.get('user_quest_tasks', {}).get('quest_id') == quest_id
                    and tc.get('user_quest_tasks', {}).get('user_quest_id') == user_quest_id
                ]

                # Skip if no tasks completed yet
                if not quest_completions:
                    continue

                # Organize evidence by task
                task_evidence = {}
                total_xp = 0

                for tc in quest_completions:
                    task_info = tc.get('user_quest_tasks', {})
                    task_title = task_info.get('title', 'Unknown Task')
                    user_quest_task_id = tc.get('user_quest_task_id')

                    # Get XP from user_quest_tasks
                    task_xp = task_info.get('xp_value', 0)
                    total_xp += task_xp

                    # Check for multi-format evidence document
                    evidence_doc = evidence_docs_by_task.get(user_quest_task_id)

                    if evidence_doc and evidence_doc.get('evidence_document_blocks'):
                        # Multi-format evidence
                        task_evidence[task_title] = {
                            'evidence_type': 'multi_format',
                            'evidence_blocks': evidence_doc.get('evidence_document_blocks', []),
                            'evidence_content': '',  # Not used for multi-format
                            'xp_awarded': task_xp,
                            'completed_at': tc.get('completed_at'),
                            'pillar': task_info.get('pillar', 'Arts & Creativity')
                        }
                    else:
                        # Legacy single-format evidence
                        evidence_content = tc.get('evidence_text', '') or tc.get('evidence_url', '')
                        task_evidence[task_title] = {
                            'evidence_type': 'text' if tc.get('evidence_text') else 'link',
                            'evidence_content': evidence_content,
                            'xp_awarded': task_xp,
                            'completed_at': tc.get('completed_at'),
                            'pillar': task_info.get('pillar', 'Arts & Creativity')
                        }

                # Use pre-fetched task count
                total_tasks = task_counts_by_quest.get(user_quest_id, 0)
                completed_tasks = len(task_evidence)

                achievement = {
                    'quest': quest,
                    'started_at': cq['started_at'],
                    'task_evidence': task_evidence,
                    'total_xp_earned': total_xp,
                    'status': 'in_progress',
                    'progress': {
                        'completed_tasks': completed_tasks,
                        'total_tasks': total_tasks,
                        'percentage': (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
                    }
                }

                achievements.append(achievement)

        # Sort achievements by date (completed_at for completed, started_at for in-progress)
        achievements.sort(key=lambda x: x.get('completed_at') or x.get('started_at'), reverse=True)

        return jsonify({
            'success': True,
            'achievements': achievements,
            'total': len(achievements)
        })

    except Exception as e:
        logger.error(f"Error getting completed quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch completed quests'
        }), 500

@bp.route('/<quest_id>/end', methods=['POST'])
@require_auth
def end_quest(user_id: str, quest_id: str):
    """
    End an active quest enrollment.
    Keeps all progress, submitted tasks, and XP earned.
    Simply marks the quest as inactive.

    Note: This endpoint can be called even if the quest is already completed
    (from auto-completion when all tasks are done). We handle both cases gracefully.
    """
    try:
        # Use admin client - @require_auth already validated user
        # Using admin client avoids RLS issues with JWT tokens
        supabase = get_supabase_admin_client()

        # Check if user is enrolled in this quest (allow both active and completed)
        # Quest might already be auto-completed when last task was submitted
        enrollment = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not enrollment.data:
            return jsonify({
                'success': False,
                'error': 'Not enrolled in this quest'
            }), 404

        # Get the most recent enrollment (in case of multiple)
        current_enrollment = enrollment.data[0]

        # Check if already marked as inactive and completed
        if not current_enrollment.get('is_active') and current_enrollment.get('completed_at'):
            # Quest is already fully completed - return success with stats
            user_quest_id = current_enrollment['id']

            # Get task completion stats
            completed_tasks = supabase.table('user_quest_tasks')\
                .select('xp_value')\
                .eq('user_quest_id', user_quest_id)\
                .execute()

            total_xp = sum(task.get('xp_value', 0) for task in (completed_tasks.data or []))
            task_count = len(completed_tasks.data or [])

            return jsonify({
                'success': True,
                'message': f'Quest already completed! You finished {task_count} tasks and earned {total_xp} XP.',
                'already_completed': True,
                'stats': {
                    'tasks_completed': task_count,
                    'xp_earned': total_xp
                }
            })

        # If not already inactive, mark it as such

        user_quest_id = enrollment.data[0]['id']

        # Mark the quest as inactive (ended) and set completed_at timestamp
        from datetime import datetime
        result = supabase.table('user_quests')\
            .update({
                'is_active': False,
                'completed_at': datetime.utcnow().isoformat(),
                'last_set_down_at': datetime.utcnow().isoformat()
            })\
            .eq('id', user_quest_id)\
            .execute()
        
        # Get task completion stats for the response
        completed_tasks = supabase.table('user_quest_tasks')\
            .select('xp_value')\
            .eq('user_quest_id', user_quest_id)\
            .execute()

        total_xp = sum(task.get('xp_value', 0) for task in completed_tasks.data)
        task_count = len(completed_tasks.data)
        
        return jsonify({
            'success': True,
            'message': f'Quest ended successfully. You completed {task_count} tasks and earned {total_xp} XP.',
            'stats': {
                'tasks_completed': task_count,
                'xp_earned': total_xp
            }
        })
            
    except Exception as e:
        logger.error(f"Error ending quest: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/create', methods=['POST'])
@require_auth
def create_user_quest(user_id: str):
    """
    Allow ANY authenticated user to create their own quest.
    User-created quests are private by default (visible only to creator).
    Admins can later toggle is_public to make them available in the public quest library.
    """
    try:
        from services.image_service import search_quest_image

        supabase = get_supabase_admin_client()
        data = request.json

        # Validate required fields
        if not data.get('title'):
            return jsonify({'success': False, 'error': 'Title is required'}), 400

        if not data.get('description') and not data.get('big_idea'):
            return jsonify({'success': False, 'error': 'Description is required'}), 400

        # Auto-fetch image if not provided
        image_url = data.get('header_image_url')
        if not image_url:
            # Try to fetch image based on quest title and description
            quest_desc = data.get('big_idea', '').strip() or data.get('description', '').strip()
            image_url = search_quest_image(data['title'].strip(), quest_desc)
            logger.info(f"Auto-fetched image for quest '{data['title']}': {image_url}")

        # Create quest record (private by default, inactive until admin approves)
        quest_data = {
            'title': data['title'].strip(),
            'big_idea': data.get('big_idea', '').strip() or data.get('description', '').strip(),
            'description': data.get('big_idea', '').strip() or data.get('description', '').strip(),
            'is_v3': True,
            'is_active': True,  # Active so user can use it immediately
            'is_public': False,  # Private by default - only visible to creator
            'quest_type': 'optio',  # User-created Optio quest
            'header_image_url': image_url,
            'image_url': image_url,
            'material_link': data.get('material_link', '').strip() if data.get('material_link') else None,
            'created_by': user_id,  # Track who created the quest
            'created_at': datetime.utcnow().isoformat()
        }

        # Insert quest
        quest_result = supabase.table('quests').insert(quest_data).execute()

        if not quest_result.data:
            return jsonify({'success': False, 'error': 'Failed to create quest'}), 500

        quest_id = quest_result.data[0]['id']
        logger.info(f"User {user_id[:8]} created private quest {quest_id}: {quest_data['title']}")

        # Auto-enroll the user using repository pattern for proper error handling
        enrollment = None
        try:
            quest_repo = QuestRepository()
            enrollment = quest_repo.enroll_user(user_id, quest_id)
            logger.info(f"Successfully auto-enrolled user {user_id[:8]} in quest {quest_id[:8]}, enrollment_id: {enrollment['id'][:8]}")

            # VERIFY enrollment was actually created
            verification = quest_repo.get_user_enrollment(user_id, quest_id)
            if not verification:
                raise DatabaseError("Enrollment verification failed - record not found after creation")

        except Exception as enrollment_error:
            # CRITICAL: If enrollment fails, rollback quest creation
            logger.error(f"CRITICAL: Failed to enroll user {user_id[:8]} in quest {quest_id[:8]}: {enrollment_error}", exc_info=True)

            try:
                # SAFETY CHECK: Only delete if no enrollments exist
                enrollment_check = supabase.table('user_quests')\
                    .select('id')\
                    .eq('quest_id', quest_id)\
                    .execute()

                if not enrollment_check.data or len(enrollment_check.data) == 0:
                    # Safe to delete - truly failed enrollment
                    supabase.table('quests').delete().eq('id', quest_id).execute()
                    logger.warning(f"Rolled back quest creation {quest_id[:8]} - enrollment failed with no records created")
                else:
                    # Enrollment may have succeeded despite error - don't delete
                    logger.error(f"Enrollment verification failed but {len(enrollment_check.data)} enrollment(s) exist - preserving quest {quest_id[:8]}")
                    # Return success since enrollment actually exists
                    return jsonify({
                        'success': True,
                        'message': 'Quest created and enrolled successfully (verified after error)',
                        'quest_id': quest_id,
                        'quest': quest_result.data[0],
                        'enrollment': {
                            'enrolled': True,
                            'enrollment_id': enrollment_check.data[0]['id'],
                            'is_active': enrollment_check.data[0].get('is_active', True)
                        }
                    })

            except Exception as rollback_error:
                logger.error(f"Failed to check/rollback quest {quest_id[:8]}: {rollback_error}")

            return jsonify({
                'success': False,
                'error': 'Failed to enroll in your quest. Please try enrolling manually from your quest library.',
                'quest_id': quest_id
            }), 500

        return jsonify({
            'success': True,
            'message': 'Quest created successfully! It\'s now available in your quest library.',
            'quest_id': quest_id,
            'quest': quest_result.data[0],
            'enrollment': {
                'enrolled': True,
                'enrollment_id': enrollment['id'] if enrollment else None,
                'is_active': enrollment.get('is_active', False) if enrollment else False
            }
        })

    except Exception as e:
        logger.error(f"Error creating user quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to create quest: {str(e)}'
        }), 500

@bp.route('/sources', methods=['GET'])
def get_quest_sources():
    """
    Public endpoint to get quest sources with their header images.
    Used by frontend to display source-based header images.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get all sources with their header images (only public data)
        response = supabase.table('quest_sources')\
            .select('id, name, header_image_url')\
            .execute()

        sources = response.data if response.data else []

        return jsonify({
            'sources': sources,
            'total': len(sources)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching public quest sources: {str(e)}")
        return jsonify({'error': 'Failed to fetch quest sources'}), 500

@bp.route('/<quest_id>/tasks/reorder', methods=['PUT'])
@require_auth
def reorder_quest_tasks(user_id: str, quest_id: str):
    """
    Reorder tasks for a quest.
    Body: { task_ids: [id1, id2, id3...] }
    """
    try:
        data = request.get_json()
        task_ids = data.get('task_ids', [])

        if not task_ids:
            return jsonify({'error': 'task_ids is required'}), 400

        # Use admin client to bypass RLS for updates
        supabase = get_supabase_admin_client()

        # Verify user is enrolled in this quest
        enrollment = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .maybe_single()\
            .execute()

        if not enrollment.data:
            return jsonify({'error': 'Quest not found or not enrolled'}), 404

        # Update order_index for each task
        for index, task_id in enumerate(task_ids):
            result = supabase.table('user_quest_tasks')\
                .update({'order_index': index})\
                .eq('id', task_id)\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            logger.debug(f"Updated task {task_id} to order_index {index}: {result.data}")

        logger.info(f"User {user_id[:8]} reordered {len(task_ids)} tasks for quest {quest_id}")

        return jsonify({
            'success': True,
            'message': 'Task order updated successfully'
        }), 200

    except Exception as e:
        logger.error(f"Error reordering tasks for quest {quest_id}: {str(e)}", exc_info=True)
        return jsonify({'error': f'Failed to reorder tasks: {str(e)}'}), 500

@bp.route('/<quest_id>/display-mode', methods=['PUT'])
@require_auth
def update_display_mode(quest_id):
    """
    Update the display mode for a quest (timeline or flexible).
    Body: { display_mode: 'timeline' | 'flexible' }
    """
    try:
        from flask import g
        user_id = g.user_id

        data = request.get_json()
        display_mode = data.get('display_mode')

        if display_mode not in ['timeline', 'flexible']:
            return jsonify({'error': 'display_mode must be "timeline" or "flexible"'}), 400

        supabase = get_user_client()

        # Update user_quests table with display mode preference
        result = supabase.table('user_quests')\
            .update({'task_display_mode': display_mode})\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not result.data:
            return jsonify({'error': 'Quest not found or not enrolled'}), 404

        logger.info(f"User {user_id[:8]} set display mode to '{display_mode}' for quest {quest_id}")

        return jsonify({
            'success': True,
            'display_mode': display_mode
        }), 200

    except Exception as e:
        logger.error(f"Error updating display mode for quest {quest_id}: {str(e)}")
        return jsonify({'error': 'Failed to update display mode'}), 500