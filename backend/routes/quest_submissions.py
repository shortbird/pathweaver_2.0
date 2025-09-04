"""
Quest submission endpoints for student-created custom quests
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_client
from utils.auth.decorators import require_auth, require_admin
from datetime import datetime
import uuid

quest_submissions_bp = Blueprint('quest_submissions', __name__)

@quest_submissions_bp.route('/api/v3/quests/submissions', methods=['POST'])
@require_auth
def submit_quest(user_id):
    """Submit a custom quest for admin approval"""
    try:
        data = request.json
        supabase = get_supabase_client()
        
        # Validate required fields
        if not data.get('title') or not data.get('description'):
            return jsonify({'error': 'Title and description are required'}), 400
        
        # Create submission (XP is now per task, not per quest)
        submission_data = {
            'user_id': user_id,
            'title': data['title'],
            'description': data['description'],
            'suggested_tasks': data.get('suggested_tasks'),
            'make_public': data.get('make_public', False),
            'status': 'pending'
        }
        
        result = supabase.table('quest_submissions').insert(submission_data).execute()
        
        if not result.data:
            return jsonify({'error': 'Failed to submit quest'}), 500
        
        return jsonify({
            'success': True,
            'message': 'Quest submission received. An admin will review your request.',
            'submission_id': result.data[0]['id']
        }), 201
        
    except Exception as e:
        print(f"Error submitting quest: {e}")
        return jsonify({'error': str(e)}), 500

@quest_submissions_bp.route('/api/v3/quests/submissions/<user_id>', methods=['GET'])
@require_auth
def get_user_submissions(user_id, requesting_user_id):
    """Get all quest submissions for a user"""
    try:
        # Users can only view their own submissions
        if user_id != requesting_user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        supabase = get_supabase_client()
        
        result = supabase.table('quest_submissions')\
            .select('*')\
            .eq('user_id', user_id)\
            .order('created_at', desc=True)\
            .execute()
        
        return jsonify({
            'success': True,
            'submissions': result.data
        }), 200
        
    except Exception as e:
        print(f"Error fetching user submissions: {e}")
        return jsonify({'error': str(e)}), 500

@quest_submissions_bp.route('/api/v3/admin/submissions', methods=['GET'])
@require_admin
def get_all_submissions(admin_id):
    """Get all quest submissions (admin only)"""
    try:
        supabase = get_supabase_client()
        
        # Get filter parameters
        status = request.args.get('status', 'pending')
        
        query = supabase.table('quest_submissions')\
            .select('*, users!inner(username, first_name, last_name)')
        
        if status != 'all':
            query = query.eq('status', status)
        
        result = query.order('created_at', desc=True).execute()
        
        return jsonify({
            'success': True,
            'submissions': result.data
        }), 200
        
    except Exception as e:
        print(f"Error fetching submissions: {e}")
        return jsonify({'error': str(e)}), 500

@quest_submissions_bp.route('/api/v3/admin/submissions/<submission_id>/approve', methods=['PUT'])
@require_admin
def approve_submission(submission_id, admin_id):
    """Approve a quest submission and create the quest"""
    try:
        data = request.json
        supabase = get_supabase_client()
        
        # Get the submission
        submission_result = supabase.table('quest_submissions')\
            .select('*')\
            .eq('id', submission_id)\
            .single()\
            .execute()
        
        if not submission_result.data:
            return jsonify({'error': 'Submission not found'}), 404
        
        submission = submission_result.data
        
        if submission['status'] != 'pending':
            return jsonify({'error': 'Submission already processed'}), 400
        
        # Create the quest (XP is now calculated from tasks)
        quest_data = {
            'title': data.get('title', submission['title']),
            'description': data.get('description', submission['description']),
            'is_active': True,
            'is_v3': True,
            'is_custom': True,
            'submitted_by': submission['user_id'],
            'submission_id': submission_id,
            'source': 'custom'
        }
        
        # If not making public, set it as user-specific
        if not submission['make_public']:
            quest_data['assigned_users'] = [submission['user_id']]
        
        quest_result = supabase.table('quests').insert(quest_data).execute()
        
        if not quest_result.data:
            return jsonify({'error': 'Failed to create quest'}), 500
        
        quest_id = quest_result.data[0]['id']
        
        # Add tasks if provided (now with pillar and XP per task)
        tasks = data.get('tasks', submission.get('suggested_tasks', []))
        if tasks:
            task_data = []
            for i, task in enumerate(tasks):
                if task.get('title'):  # Only add tasks with titles
                    task_data.append({
                        'quest_id': quest_id,
                        'title': task['title'],
                        'description': task.get('description', ''),
                        'pillar': task.get('pillar', 'creativity'),  # Each task has its own pillar
                        'xp_value': task.get('xp', 50),  # Each task has its own XP value
                        'order_index': i,
                        'is_required': True
                    })
            
            if task_data:
                supabase.table('quest_tasks').insert(task_data).execute()
        
        # Update submission status
        supabase.table('quest_submissions').update({
            'status': 'approved',
            'reviewed_at': datetime.utcnow().isoformat(),
            'reviewed_by': admin_id,
            'approved_quest_id': quest_id
        }).eq('id', submission_id).execute()
        
        return jsonify({
            'success': True,
            'message': 'Quest approved and created successfully',
            'quest_id': quest_id
        }), 200
        
    except Exception as e:
        print(f"Error approving submission: {e}")
        return jsonify({'error': str(e)}), 500

@quest_submissions_bp.route('/api/v3/admin/submissions/<submission_id>/reject', methods=['PUT'])
@require_admin
def reject_submission(submission_id, admin_id):
    """Reject a quest submission"""
    try:
        data = request.json
        supabase = get_supabase_client()
        
        # Update submission status
        result = supabase.table('quest_submissions').update({
            'status': 'rejected',
            'reviewed_at': datetime.utcnow().isoformat(),
            'reviewed_by': admin_id,
            'rejection_reason': data.get('reason', 'Does not meet requirements')
        }).eq('id', submission_id).execute()
        
        if not result.data:
            return jsonify({'error': 'Submission not found'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Quest submission rejected'
        }), 200
        
    except Exception as e:
        print(f"Error rejecting submission: {e}")
        return jsonify({'error': str(e)}), 500