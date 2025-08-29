"""Completed quests routes"""

from flask import Blueprint, jsonify, request
from database import get_user_client
from utils.auth.decorators import require_auth
from middleware.error_handler import ValidationError

completed_quests_bp = Blueprint('completed_quests', __name__)

@completed_quests_bp.route('/completed-quests', methods=['GET'])
@require_auth
def get_completed_quests(user_id):
    """Get paginated list of user's completed quests"""
    
    # Get pagination parameters
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    
    # Validate pagination parameters
    if page < 1:
        raise ValidationError('Page must be greater than 0')
    if per_page < 1 or per_page > 100:
        raise ValidationError('Per page must be between 1 and 100')
    
    offset = (page - 1) * per_page
    
    # Use user client with RLS enforcement
    supabase = get_user_client()
    
    try:
        # Get total count
        count_result = supabase.table('user_quests')\
            .select('id', count='exact')\
            .eq('user_id', user_id)\
            .eq('status', 'completed')\
            .execute()
        
        total_count = count_result.count if count_result else 0
        
        # Get paginated completed quests with details
        try:
            completed = supabase.table('user_quests')\
                .select('*, quests(*, quest_skill_xp(*), quest_xp_awards(*))')\
                .eq('user_id', user_id)\
                .eq('status', 'completed')\
                .order('completed_at', desc=True)\
                .range(offset, offset + per_page - 1)\
                .execute()
        except:
            # Fallback without skill XP
            completed = supabase.table('user_quests')\
                .select('*, quests(*)')\
                .eq('user_id', user_id)\
                .eq('status', 'completed')\
                .order('completed_at', desc=True)\
                .range(offset, offset + per_page - 1)\
                .execute()
        
        # Format quest data
        formatted_quests = []
        if completed.data:
            for quest_record in completed.data:
                quest = quest_record.get('quests', {})
                if quest:
                    formatted_quest = {
                        'id': quest.get('id'),
                        'title': quest.get('title'),
                        'description': quest.get('description'),
                        'difficulty': quest.get('difficulty'),
                        'category': quest.get('category'),
                        'completed_at': quest_record.get('completed_at'),
                        'xp_earned': calculate_quest_xp(quest),
                        'submission': {
                            'content': quest_record.get('submission_content'),
                            'submitted_at': quest_record.get('submitted_at'),
                            'feedback': quest_record.get('admin_feedback')
                        } if quest_record.get('submission_content') else None
                    }
                    formatted_quests.append(formatted_quest)
        
        # Build response with pagination info
        response = {
            'quests': formatted_quests,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total_count,
                'total_pages': (total_count + per_page - 1) // per_page if total_count > 0 else 0,
                'has_next': offset + per_page < total_count,
                'has_prev': page > 1
            }
        }
        
        return jsonify(response), 200
        
    except ValidationError:
        raise
    except Exception as e:
        print(f"Error fetching completed quests: {str(e)}")
        return jsonify({'error': 'Failed to fetch completed quests'}), 500

def calculate_quest_xp(quest: dict) -> dict:
    """Calculate total XP earned from a quest"""
    xp_breakdown = {}
    total_xp = 0
    
    # Try skill-based XP first
    if 'quest_skill_xp' in quest and quest['quest_skill_xp']:
        for award in quest['quest_skill_xp']:
            category = award.get('skill_category')
            amount = award.get('xp_amount', 0)
            if category:
                xp_breakdown[category] = amount
                total_xp += amount
    
    # Fallback to subject-based XP
    elif 'quest_xp_awards' in quest and quest['quest_xp_awards']:
        from .helpers import SUBJECT_TO_SKILL_MAP
        for award in quest['quest_xp_awards']:
            subject = award.get('subject')
            amount = award.get('xp_amount', 0)
            if subject:
                skill_cat = SUBJECT_TO_SKILL_MAP.get(subject, 'thinking_skills')
                xp_breakdown[skill_cat] = xp_breakdown.get(skill_cat, 0) + amount
                total_xp += amount
    
    # If no XP data found, estimate based on difficulty
    if total_xp == 0:
        difficulty = quest.get('difficulty', 'beginner')
        difficulty_xp = {
            'beginner': 10,
            'intermediate': 25,
            'advanced': 50
        }
        total_xp = difficulty_xp.get(difficulty, 10)
        xp_breakdown['general'] = total_xp
    
    return {
        'total': total_xp,
        'breakdown': xp_breakdown
    }