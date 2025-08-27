"""
Quest V3 API endpoints.
Handles quest listing, enrollment, and detail views.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_client, get_supabase_admin_client
from utils.auth.decorators import require_auth
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
        
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 12))
        search = request.args.get('search', '')
        pillar_filter = request.args.get('pillar', '')
        
        # Calculate offset
        offset = (page - 1) * per_page
        
        # Build query
        query = supabase.table('quests')\
            .select('*, quest_tasks(*)', count='exact')\
            .eq('is_active', True)\
            .order('created_at', desc=True)
        
        # Apply search filter if provided
        if search:
            query = query.ilike('title', f'%{search}%')
        
        # Apply pagination
        query = query.range(offset, offset + per_page - 1)
        
        result = query.execute()
        
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
            
            # Add user enrollment data if authenticated
            if user_id:
                enrollment = supabase.table('user_quests')\
                    .select('*')\
                    .eq('user_id', user_id)\
                    .eq('quest_id', quest['id'])\
                    .eq('is_active', True)\
                    .execute()
                
                if enrollment.data:
                    quest['user_enrollment'] = enrollment.data[0]
            
            # Apply pillar filter if specified
            if not pillar_filter or pillar_filter in pillar_xp:
                quests.append(quest)
        
        return jsonify({
            'success': True,
            'quests': quests,
            'total': result.count,
            'page': page,
            'per_page': per_page,
            'total_pages': (result.count + per_page - 1) // per_page
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
        
        if not quest.data:
            return jsonify({
                'success': False,
                'error': 'Quest not found'
            }), 404
        
        quest_data = quest.data
        
        # Sort tasks by order
        if quest_data.get('quest_tasks'):
            quest_data['quest_tasks'].sort(key=lambda x: x.get('task_order', 0))
        
        # Check if user is enrolled
        user_quest = supabase.table('user_quests')\
            .select('*, user_quest_tasks(*)')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()
        
        if user_quest.data:
            quest_data['user_enrollment'] = user_quest.data[0]
            
            # Calculate progress
            total_tasks = len(quest_data.get('quest_tasks', []))
            completed_tasks = len(user_quest.data[0].get('user_quest_tasks', []))
            quest_data['progress'] = {
                'completed_tasks': completed_tasks,
                'total_tasks': total_tasks,
                'percentage': (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
            }
            
            # Mark completed tasks
            completed_task_ids = {t['quest_task_id'] for t in user_quest.data[0].get('user_quest_tasks', [])}
            for task in quest_data.get('quest_tasks', []):
                task['is_completed'] = task['id'] in completed_task_ids
        else:
            quest_data['user_enrollment'] = None
            quest_data['progress'] = {
                'completed_tasks': 0,
                'total_tasks': len(quest_data.get('quest_tasks', [])),
                'percentage': 0
            }
        
        # Check for active collaboration
        collab = supabase.table('quest_collaborations')\
            .select('*')\
            .eq('quest_id', quest_id)\
            .in_('status', ['pending', 'accepted'])\
            .or_(f'requester_id.eq.{user_id},partner_id.eq.{user_id}')\
            .execute()
        
        quest_data['collaboration'] = collab.data[0] if collab.data else None
        
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

@bp.route('/<quest_id>/enroll', methods=['POST'])
@require_auth
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
        
        # Check if already enrolled
        existing = supabase.table('user_quests')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()
        
        if existing.data:
            return jsonify({
                'success': False,
                'error': 'Already enrolled in this quest'
            }), 400
        
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
    Get all completed quests for the current user.
    Used for diploma page and achievement display.
    """
    try:
        supabase = get_supabase_client()
        
        # Get user's completed quests
        completed_quests = supabase.table('user_quests')\
            .select('*, quests(*, quest_tasks(*)), user_quest_tasks(*, quest_tasks(*))')\
            .eq('user_id', user_id)\
            .not_('completed_at', 'is', 'null')\
            .order('completed_at', desc=True)\
            .execute()
        
        if not completed_quests.data:
            return jsonify({
                'success': True,
                'quests': [],
                'message': 'No completed quests yet'
            })
        
        # Process completed quests with evidence
        achievements = []
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
                'total_xp_earned': sum(t['xp_awarded'] for t in cq.get('user_quest_tasks', []))
            }
            
            achievements.append(achievement)
        
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

@bp.route('/<quest_id>/cancel', methods=['POST'])
@require_auth
def cancel_quest(user_id: str, quest_id: str):
    """
    Cancel an active quest enrollment.
    Deletes the user's progress and any submitted evidence.
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
        
        # Delete any task completions
        supabase.table('user_quest_tasks')\
            .delete()\
            .eq('user_quest_id', user_quest_id)\
            .execute()
        
        # Delete any learning logs
        supabase.table('learning_logs')\
            .delete()\
            .eq('user_quest_id', user_quest_id)\
            .execute()
        
        # Delete the enrollment itself
        result = supabase.table('user_quests')\
            .delete()\
            .eq('id', user_quest_id)\
            .execute()
        
        # Delete operation successful if no exception was raised
        return jsonify({
            'success': True,
            'message': 'Quest cancelled successfully'
        })
            
    except Exception as e:
        print(f"Error cancelling quest: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500