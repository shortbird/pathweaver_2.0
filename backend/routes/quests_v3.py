"""
Quest V3 API endpoints.
Handles quest listing, enrollment, and detail views.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_client, get_supabase_admin_client
from utils.auth.decorators import require_auth, require_paid_tier
from utils.source_utils import get_quest_header_image
from utils.user_sync import ensure_user_exists, get_user_name
from services.quest_optimization import quest_optimization_service
from datetime import datetime
from typing import Dict, Any, List, Optional

bp = Blueprint('quests_v3', __name__, url_prefix='/api/v3/quests')

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
                print(f"Auth check failed: {e}")
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
        query = supabase.table('quests')\
            .select('*, quest_tasks(*)', count='exact')\
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
        
        # Process quest data to include task counts and total XP
        quests = []
        for quest in result.data:
            # Calculate total XP and task breakdown
            total_xp = 0
            pillar_xp = {}
            task_count = len(quest.get('quest_tasks', []))
            
            for task in quest.get('quest_tasks', []):
                total_xp += task['xp_amount']
                pillar = task['pillar']
                if pillar not in pillar_xp:
                    pillar_xp[pillar] = 0
                pillar_xp[pillar] += task['xp_amount']
            
            # Add calculated fields
            quest['total_xp'] = total_xp
            quest['task_count'] = task_count
            quest['pillar_breakdown'] = pillar_xp
            
            # Add source header image if no custom header exists
            if not quest.get('header_image_url') and quest.get('source'):
                source_header = get_quest_header_image(quest)
                if source_header:
                    quest['header_image_url'] = source_header

            # Add quest to list (user enrollment data will be added in batch)
            quests.append(quest)

        # OPTIMIZATION: Add user enrollment data using batch queries instead of N+1
        if user_id and quests:
            print(f"[OPTIMIZATION] Using batch queries for {len(quests)} quests instead of {len(quests) * 2} individual queries")
            quests = quest_optimization_service.enrich_quests_with_user_data(quests, user_id)
        
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
        print(f"Error listing quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch quests'
        }), 500

@bp.route('/<quest_id>', methods=['GET'])
@require_auth
def get_quest_detail(user_id: str, quest_id: str):
    """
    Get detailed information about a specific quest.
    Includes user's progress if enrolled.
    """
    try:
        supabase = get_supabase_client()
        
        # Get quest with tasks
        quest = supabase.table('quests')\
            .select('*, quest_tasks(*)')\
            .eq('id', quest_id)\
            .single()\
            .execute()
        
        print(f"[QUEST DETAIL] Quest query response: {quest.data}")
        
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
        
        # Sort tasks by order
        if quest_data.get('quest_tasks'):
            print(f"[QUEST DETAIL] Found {len(quest_data['quest_tasks'])} tasks for quest")
            quest_data['quest_tasks'].sort(key=lambda x: x.get('order_index', 0))
        else:
            print(f"[QUEST DETAIL] No quest_tasks found in quest data")
        
        # Check if user is actively enrolled
        print(f"[QUEST DETAIL] Checking enrollment for user {user_id[:8]} on quest {quest_id[:8]}")
        
        # First check all enrollments for debugging
        all_enrollments = supabase.table('user_quests')\
            .select('*, user_quest_tasks(*)')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()
        
        enrollments_data = all_enrollments.data or []
        print(f"[QUEST DETAIL] All enrollments found: {len(enrollments_data)}")
        for enrollment in enrollments_data:
            print(f"[QUEST DETAIL] Enrollment: id={enrollment.get('id')}, is_active={enrollment.get('is_active')}, completed_at={enrollment.get('completed_at')}")
        
        # Now filter for active enrollments
        user_quest = supabase.table('user_quests')\
            .select('*, user_quest_tasks(*)')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()
        
        if user_quest.data:
            print(f"[QUEST DETAIL] Found active enrollment: {user_quest.data[0]}")
        else:
            print(f"[QUEST DETAIL] No active enrollment found")
        
        # Use all enrollments to find active and completed ones (more robust than the filtered query)
        active_enrollment = None
        completed_enrollment = None
        
        for enrollment in enrollments_data:
            # Check if completed
            if enrollment.get('completed_at'):
                completed_enrollment = enrollment
            # Consider enrollment active if:
            # 1. Not completed AND 
            # 2. is_active is True or None (not explicitly False)
            elif not enrollment.get('completed_at'):
                is_active = enrollment.get('is_active')
                if is_active is not False:  # True or None are both considered active
                    active_enrollment = enrollment
        
        # Prioritize completed enrollment for display
        if completed_enrollment:
            print(f"[QUEST DETAIL] Using completed enrollment: {completed_enrollment}")
            quest_data['completed_enrollment'] = completed_enrollment
            quest_data['user_enrollment'] = None  # Clear active enrollment
            
            # Add progress information for completed quest (always 100%)
            total_tasks = len(quest_data.get('quest_tasks', []))
            completed_tasks_result = supabase.table('user_quest_tasks')\
                .select('quest_task_id')\
                .eq('user_quest_id', completed_enrollment['id'])\
                .execute()
            
            completed_task_count = len(completed_tasks_result.data) if completed_tasks_result.data else 0
            
            quest_data['progress'] = {
                'completed_tasks': completed_task_count,
                'total_tasks': total_tasks,
                'percentage': 100  # Always 100% for completed quests
            }
            
            # Mark all tasks as completed for completed quest
            completed_task_ids = {t['quest_task_id'] for t in completed_tasks_result.data} if completed_tasks_result.data else set()
            for task in quest_data.get('quest_tasks', []):
                task['is_completed'] = task['id'] in completed_task_ids
                
        elif active_enrollment:
            print(f"[QUEST DETAIL] Using active enrollment: {active_enrollment}")
            quest_data['user_enrollment'] = active_enrollment
            
            # Calculate progress
            total_tasks = len(quest_data.get('quest_tasks', []))
            user_quest_tasks = active_enrollment.get('user_quest_tasks', [])
            # Ensure user_quest_tasks is a list (sometimes it's an int from count queries)
            if isinstance(user_quest_tasks, int):
                completed_tasks = user_quest_tasks
            else:
                completed_tasks = len(user_quest_tasks) if user_quest_tasks else 0
            quest_data['progress'] = {
                'completed_tasks': completed_tasks,
                'total_tasks': total_tasks,
                'percentage': (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
            }
            
            # Mark completed tasks
            if isinstance(user_quest_tasks, list):
                completed_task_ids = {t['quest_task_id'] for t in user_quest_tasks}
            else:
                # If user_quest_tasks is an integer, we need to query the actual task IDs
                task_completions = supabase.table('user_quest_tasks')\
                    .select('quest_task_id')\
                    .eq('user_quest_id', active_enrollment['id'])\
                    .execute()
                completed_task_ids = {t['quest_task_id'] for t in (task_completions.data or [])}
            
            for task in quest_data.get('quest_tasks', []):
                task['is_completed'] = task['id'] in completed_task_ids
        else:
            print(f"[QUEST DETAIL] No active or completed enrollment found")
            quest_data['user_enrollment'] = None
            quest_data['completed_enrollment'] = None
            quest_data['progress'] = {
                'completed_tasks': 0,
                'total_tasks': len(quest_data.get('quest_tasks', [])),
                'percentage': 0
            }
        
        # Check for active collaboration (with error handling)
        try:
            collab = supabase.table('quest_collaborations')\
                .select('*')\
                .eq('quest_id', quest_id)\
                .in_('status', ['pending', 'accepted'])\
                .or_(f'requester_id.eq.{user_id},partner_id.eq.{user_id}')\
                .execute()
            
            if collab.data:
                collaboration_data = collab.data[0]
                
                # Fetch user names for collaboration
                collaborator_names = []
                
                print(f"[QUEST DETAIL] Found collaboration: requester={collaboration_data['requester_id'][:8]}, partner={collaboration_data['partner_id'][:8]}, current_user={user_id[:8]}")
                
                # Get requester name if not current user (with error handling)
                if collaboration_data['requester_id'] != user_id:
                    try:
                        ensure_user_exists(collaboration_data['requester_id'])
                        first_name, last_name = get_user_name(collaboration_data['requester_id'])
                        name = f"{first_name} {last_name}"
                        collaborator_names.append(name)
                        print(f"[QUEST DETAIL] Added requester name: {name}")
                    except Exception as e:
                        print(f"[QUEST DETAIL] Error getting requester name: {e}")
                        collaborator_names.append("Collaborator")
                
                # Get partner name if not current user (with error handling)
                if collaboration_data['partner_id'] != user_id:
                    try:
                        ensure_user_exists(collaboration_data['partner_id'])
                        first_name, last_name = get_user_name(collaboration_data['partner_id'])
                        name = f"{first_name} {last_name}"
                        collaborator_names.append(name)
                        print(f"[QUEST DETAIL] Added partner name: {name}")
                    except Exception as e:
                        print(f"[QUEST DETAIL] Error getting partner name: {e}")
                        collaborator_names.append("Collaborator")
                
                print(f"[QUEST DETAIL] Final collaborator_names: {collaborator_names}")
                collaboration_data['collaborator_names'] = collaborator_names
                quest_data['collaboration'] = collaboration_data
            else:
                quest_data['collaboration'] = None
        except Exception as collab_error:
            print(f"[QUEST DETAIL] Error fetching collaboration data: {collab_error}")
            quest_data['collaboration'] = None
        
        return jsonify({
            'success': True,
            'quest': quest_data
        })
        
    except Exception as e:
        print(f"Error getting quest detail: {str(e)}")
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
        print(f"Error checking enrollment status: {str(e)}")
        return jsonify({
            'error': 'Failed to check enrollment status'
        }), 500

@bp.route('/<quest_id>/enroll', methods=['POST'])
@require_auth
@require_paid_tier
def enroll_in_quest(user_id: str, quest_id: str):
    """
    Enroll a user in a quest.
    Creates a user_quests record to track progress.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Check if quest exists and is active
        quest = supabase.table('quests')\
            .select('id, title, is_active')\
            .eq('id', quest_id)\
            .single()\
            .execute()
        
        if not quest.data:
            return jsonify({
                'success': False,
                'error': 'Quest not found'
            }), 404
        
        if not quest.data.get('is_active'):
            return jsonify({
                'success': False,
                'error': 'Quest is not active'
            }), 400
        
        # Check if already enrolled (active enrollment only)
        existing = supabase.table('user_quests')\
            .select('id, is_active, completed_at')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()
        
        # Check if there's an active enrollment
        if existing.data:
            for enrollment in existing.data:
                if enrollment.get('is_active') and not enrollment.get('completed_at'):
                    return jsonify({
                        'success': False,
                        'error': 'Already enrolled in this quest'
                    }), 400
            
            # If there's an inactive enrollment, we can reactivate it
            if existing.data:
                # Reactivate the most recent enrollment
                enrollment_id = existing.data[0]['id']
                updated = supabase.table('user_quests')\
                    .update({
                        'is_active': True,
                        'started_at': datetime.utcnow().isoformat(),
                        'completed_at': None
                    })\
                    .eq('id', enrollment_id)\
                    .execute()
                
                return jsonify({
                    'success': True,
                    'message': 'Re-enrolled in quest successfully',
                    'enrollment': updated.data[0] if updated.data else None
                }), 200
        
        # Create enrollment
        enrollment = supabase.table('user_quests')\
            .insert({
                'user_id': user_id,
                'quest_id': quest_id,
                'started_at': datetime.utcnow().isoformat(),
                'is_active': True
            })\
            .execute()
        
        if not enrollment.data:
            return jsonify({
                'success': False,
                'error': 'Failed to enroll in quest'
            }), 500
        
        return jsonify({
            'success': True,
            'message': f'Successfully enrolled in "{quest.data["title"]}"',
            'enrollment': enrollment.data[0]
        })
        
    except Exception as e:
        print(f"Error enrolling in quest: {str(e)}")
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
        user_quests = supabase.table('user_quests')\
            .select('*, quests(*, quest_tasks(*)), user_quest_tasks(*)')\
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
            
            # Calculate progress
            total_tasks = len(quest.get('quest_tasks', []))
            completed_tasks = len(uq.get('user_quest_tasks', []))
            
            quest['enrollment_id'] = uq['id']
            quest['started_at'] = uq['started_at']
            quest['progress'] = {
                'completed_tasks': completed_tasks,
                'total_tasks': total_tasks,
                'percentage': (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
            }
            
            # Calculate XP earned
            xp_earned = sum(task['xp_awarded'] for task in uq.get('user_quest_tasks', []))
            quest['xp_earned'] = xp_earned
            
            active_quests.append(quest)
        
        return jsonify({
            'success': True,
            'quests': active_quests,
            'total': len(active_quests)
        })
        
    except Exception as e:
        print(f"Error getting user active quests: {str(e)}")
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
    Now includes quests with submitted tasks even if not fully completed.
    """
    try:
        supabase = get_supabase_client()

        # Get user's completed quests
        completed_quests = supabase.table('user_quests')\
            .select('*, quests(*, quest_tasks(*)), user_quest_tasks(*, quest_tasks(*))')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
            .order('completed_at', desc=True)\
            .execute()

        # Get user's in-progress quests (active with at least one task submitted)
        in_progress_quests = supabase.table('user_quests')\
            .select('*, quests(*, quest_tasks(*)), user_quest_tasks(*, quest_tasks(*))')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .is_('completed_at', 'null')\
            .order('started_at', desc=True)\
            .execute()

        # Process completed quests with evidence
        achievements = []

        # Add completed quests
        if completed_quests.data:
            for cq in completed_quests.data:
                quest = cq.get('quests')
                if not quest:
                    continue

                # Organize evidence by task
                task_evidence = {}
                for task_completion in cq.get('user_quest_tasks', []):
                    task_data = task_completion.get('quest_tasks')
                    if task_data:
                        task_evidence[task_data['title']] = {
                            'evidence_type': task_completion['evidence_type'],
                            'evidence_content': task_completion['evidence_content'],
                            'xp_awarded': task_completion['xp_awarded'],
                            'completed_at': task_completion['completed_at'],
                            'pillar': task_data['pillar']
                        }

                achievement = {
                    'quest': quest,
                    'completed_at': cq['completed_at'],
                    'task_evidence': task_evidence,
                    'total_xp_earned': sum(t['xp_awarded'] for t in cq.get('user_quest_tasks', [])),
                    'status': 'completed'
                }

                achievements.append(achievement)

        # Add in-progress quests with at least one submitted task
        if in_progress_quests.data:
            for cq in in_progress_quests.data:
                quest = cq.get('quests')
                if not quest or not cq.get('user_quest_tasks'):
                    continue  # Skip quests with no submitted tasks

                # Organize evidence by task
                task_evidence = {}
                for task_completion in cq.get('user_quest_tasks', []):
                    task_data = task_completion.get('quest_tasks')
                    if task_data:
                        task_evidence[task_data['title']] = {
                            'evidence_type': task_completion['evidence_type'],
                            'evidence_content': task_completion['evidence_content'],
                            'xp_awarded': task_completion['xp_awarded'],
                            'completed_at': task_completion['completed_at'],
                            'pillar': task_data['pillar']
                        }

                # Calculate progress
                total_tasks = len(quest.get('quest_tasks', []))
                completed_tasks = len(task_evidence)

                achievement = {
                    'quest': quest,
                    'started_at': cq['started_at'],
                    'task_evidence': task_evidence,
                    'total_xp_earned': sum(t['xp_awarded'] for t in cq.get('user_quest_tasks', [])),
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
        print(f"Error getting completed quests: {str(e)}")
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
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Check if user is enrolled in this quest
        enrollment = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .execute()
        
        if not enrollment.data:
            return jsonify({
                'success': False,
                'error': 'Not enrolled in this quest'
            }), 404
        
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
            .select('xp_awarded')\
            .eq('user_quest_id', user_quest_id)\
            .execute()
        
        total_xp = sum(task.get('xp_awarded', 0) for task in completed_tasks.data)
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
        print(f"Error ending quest: {str(e)}")
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
        print(f"Error fetching public quest sources: {str(e)}")
        return jsonify({'error': 'Failed to fetch quest sources'}), 500