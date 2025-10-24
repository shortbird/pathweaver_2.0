"""
Quest V3 API endpoints.
Handles quest listing, enrollment, and detail views.
"""

from flask import Blueprint, request, jsonify
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

        # Apply search filter if provided
        if search:
            query = query.ilike('title', f'%{search}%')

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
        supabase = get_supabase_client()

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

            # Get user's personalized tasks
            user_tasks = supabase.table('user_quest_tasks')\
                .select('*')\
                .eq('user_quest_id', enrollment_to_use['id'])\
                .eq('approval_status', 'approved')\
                .order('order_index')\
                .execute()

            # Get task completions
            task_completions = supabase.table('quest_task_completions')\
                .select('user_quest_task_id')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            completed_task_ids = {t['user_quest_task_id'] for t in task_completions.data} if task_completions.data else set()

            # Debug: Check raw pillar values from database
            logger.info(f"[QUEST_DETAIL] Raw tasks from DB for quest {quest_id}:")
            for i, task in enumerate(user_tasks.data or []):
                print(f"  Task {i}: '{task.get('title')}' - pillar='{task.get('pillar')}'")

            # Mark tasks as completed and map field names for frontend compatibility
            quest_tasks = user_tasks.data or []
            for task in quest_tasks:
                task['is_completed'] = task['id'] in completed_task_ids
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
        # Use repository pattern with user context for RLS
        quest_repo = QuestRepository(user_id=user_id)

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

        return jsonify({
            'success': True,
            'message': f'Successfully enrolled in "{quest.get("title")}"',
            'enrollment': enrollment
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
        supabase = get_supabase_client()
        
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
        # Use user client - fetching user-specific quest data
        supabase = get_user_client(user_id)

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
        # Use user client - user-specific quest enrollment operation
        supabase = get_user_client(user_id)

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
        
        # Mark the quest as inactive (ended) but keep all data
        # Note: There's no ended_at column in the database, just use is_active flag
        result = supabase.table('user_quests')\
            .update({
                'is_active': False
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