from flask import Blueprint, request, jsonify
from database import get_supabase_client, get_user_client, get_supabase_admin_client
from utils.auth.decorators import require_auth
from datetime import datetime
from cache import cache, cached

bp = Blueprint('quests', __name__)

@bp.route('', methods=['GET'])
def get_quests():
    """
    Legacy endpoint - redirects to V3.
    Kept for backward compatibility but uses new schema.
    """
    # Public endpoint - quests are visible to all users
    supabase = get_supabase_client()
    
    try:
        from utils.validation.sanitizers import sanitize_search_input, sanitize_integer
        
        page = sanitize_integer(request.args.get('page', 1), default=1, min_val=1)
        per_page = sanitize_integer(request.args.get('per_page', 20), default=20, min_val=1, max_val=100)
        search = sanitize_search_input(request.args.get('search', ''))
        
        # Calculate offset
        offset = (page - 1) * per_page
        
        # Use the new schema - get quests with their tasks
        query = supabase.table('quests').select('*, quest_tasks(*)', count='exact')
        
        if search:
            query = query.ilike('title', f'%{search}%')
        
        # Apply pagination
        query = query.range(offset, offset + per_page - 1)
        
        result = query.execute()
        
        # Format response for backward compatibility
        quests = []
        for quest in result.data:
            # Calculate total XP from tasks
            total_xp = sum(task.get('xp_amount', 0) for task in quest.get('quest_tasks', []))
            
            # Format quest for frontend - include both old and new fields
            formatted_quest = {
                'id': quest['id'],
                'title': quest['title'],
                'description': quest.get('big_idea', ''),  # Map big_idea to description for old frontend
                'big_idea': quest.get('big_idea', ''),  # Include original field for V3 editor
                'quest_tasks': quest.get('quest_tasks', []),  # Include tasks for V3 editor
                'total_xp': total_xp,
                'task_count': len(quest.get('quest_tasks', [])),
                'is_active': quest.get('is_active', True),
                'created_at': quest.get('created_at'),
                'header_image_url': quest.get('header_image_url'),
                # Add empty fields that old frontend might expect
                'difficulty_level': 'medium',
                'effort_level': 'moderate',
                'estimated_hours': 2,
                'core_skills': []
            }
            quests.append(formatted_quest)
        
        return jsonify({
            'quests': quests,
            'page': page,
            'per_page': per_page,
            'total': result.count if hasattr(result, 'count') else len(quests)
        }), 200
        
    except Exception as e:
        print(f"Error fetching quests: {str(e)}")
        return jsonify({'error': 'Failed to fetch quests', 'details': str(e)}), 500

@bp.route('/<quest_id>', methods=['GET'])
def get_quest(quest_id):
    """Legacy endpoint - redirects to V3."""
    # Public endpoint - quest details are visible to all users
    supabase = get_supabase_client()
    
    try:
        # Get quest with tasks
        result = supabase.table('quests').select('*, quest_tasks(*)').eq('id', quest_id).single().execute()
        
        if not result.data:
            return jsonify({'error': 'Quest not found'}), 404
        
        quest = result.data
        
        # Calculate total XP from tasks
        total_xp = sum(task.get('xp_amount', 0) for task in quest.get('quest_tasks', []))
        
        # Format for old frontend
        formatted_quest = {
            'id': quest['id'],
            'title': quest['title'],
            'description': quest.get('big_idea', ''),
            'total_xp': total_xp,
            'task_count': len(quest.get('quest_tasks', [])),
            'quest_tasks': quest.get('quest_tasks', []),
            'is_active': quest.get('is_active', True),
            'header_image_url': quest.get('header_image_url'),
            # Add fields old frontend might expect
            'difficulty_level': 'medium',
            'effort_level': 'moderate',
            'estimated_hours': 2,
            'core_skills': [],
            'accepted_evidence_types': ['text', 'link', 'image', 'video']
        }
        
        return jsonify(formatted_quest), 200
        
    except Exception as e:
        print(f"Error fetching quest {quest_id}: {str(e)}")
        return jsonify({'error': 'Failed to fetch quest', 'details': str(e)}), 500

@bp.route('/user', methods=['GET'])
@require_auth
def get_user_quests(user_id):
    """Get quests for the authenticated user."""
    supabase = get_supabase_client()
    
    try:
        # Get user's enrolled quests from new schema
        # Include both active and completed for comprehensive view
        user_quests = supabase.table('user_quests').select('*, quests(*, quest_tasks(*))').eq('user_id', user_id).execute()
        
        if not user_quests.data:
            return jsonify([]), 200
        
        # Format for response
        formatted_quests = []
        for uq in user_quests.data:
            if uq.get('quests'):
                quest = uq['quests']
                total_xp = sum(task.get('xp_amount', 0) for task in quest.get('quest_tasks', []))
                
                # Determine actual status based on both is_active and completed_at
                if uq.get('completed_at'):
                    status = 'completed'
                elif uq.get('is_active'):
                    status = 'in_progress'
                else:
                    status = 'inactive'  # Dropped or paused
                
                formatted_quests.append({
                    'id': uq['id'],
                    'quest_id': quest['id'],
                    'quest': {
                        'id': quest['id'],
                        'title': quest['title'],
                        'description': quest.get('big_idea', ''),
                        'total_xp': total_xp
                    },
                    'started_at': uq.get('started_at'),
                    'completed_at': uq.get('completed_at'),
                    'is_active': uq.get('is_active', False),
                    'status': status
                })
        
        return jsonify(formatted_quests), 200
        
    except Exception as e:
        print(f"Error fetching user quests: {str(e)}")
        return jsonify({'error': 'Failed to fetch user quests', 'details': str(e)}), 500

@bp.route('/<quest_id>/enroll', methods=['POST'])
@require_auth
def enroll_in_quest(user_id, quest_id):
    """Enroll user in a quest."""
    from database import get_supabase_admin_client
    supabase = get_supabase_admin_client()
    
    try:
        # Check if already enrolled (active enrollment only)
        existing = supabase.table('user_quests')\
            .select('id, is_active, completed_at')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()
        
        if existing.data:
            # Check for active enrollment
            for enrollment in existing.data:
                if enrollment.get('is_active') and not enrollment.get('completed_at'):
                    return jsonify({'error': 'Already enrolled in this quest'}), 400
            
            # Reactivate inactive enrollment if exists
            if existing.data:
                enrollment_id = existing.data[0]['id']
                updated = supabase.table('user_quests')\
                    .update({
                        'is_active': True,
                        'started_at': datetime.utcnow().isoformat()
                    })\
                    .eq('id', enrollment_id)\
                    .execute()
                
                return jsonify({
                    'message': 'Re-enrolled in quest successfully',
                    'enrollment': updated.data[0] if updated.data else None
                }), 200
        
        # Create enrollment
        enrollment = supabase.table('user_quests').insert({
            'user_id': user_id,
            'quest_id': quest_id,
            'started_at': datetime.utcnow().isoformat(),
            'is_active': True
        }).execute()
        
        if not enrollment.data:
            return jsonify({'error': 'Failed to enroll in quest'}), 500
        
        return jsonify({
            'success': True,
            'message': 'Successfully enrolled in quest',
            'enrollment': enrollment.data[0]
        }), 200
        
    except Exception as e:
        print(f"Error enrolling in quest: {str(e)}")
        return jsonify({'error': 'Failed to enroll', 'details': str(e)}), 500

# Remove or comment out old submission endpoints since they're no longer valid
# The submission functionality is now handled by the tasks.py file