"""
Completed quests routes

REPOSITORY MIGRATION: MIGRATION CANDIDATE
- Multiple direct database calls with complex queries (joins, pagination, aggregations)
- Should use QuestRepository for quest queries
- Helper function calculate_quest_xp needs migration to use TaskCompletionRepository
- Complex pagination logic - may benefit from repository abstraction
"""

from flask import Blueprint, jsonify, request
from database import get_user_client
from repositories import (
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
from middleware.error_handler import ValidationError

from utils.logger import get_logger

logger = get_logger(__name__)

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
            .not_.is_('completed_at', 'null')\
            .execute()
        
        total_count = count_result.count if count_result else 0
        
        # Get paginated completed quests with details
        # Note: XP is calculated from quest_task_completions and user_quest_tasks tables
        completed = supabase.table('user_quests')\
            .select('*, quests(*)')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
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
                        'xp_earned': calculate_quest_xp(quest, user_id),
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
        logger.error(f"Error fetching completed quests: {str(e)}")
        return jsonify({'error': 'Failed to fetch completed quests'}), 500

def calculate_quest_xp(quest: dict, user_id: str = None) -> dict:
    """Calculate total XP earned from a quest by aggregating completed task XP"""
    xp_breakdown = {}
    total_xp = 0

    if not quest.get('id') or not user_id:
        return {'total': 0, 'breakdown': {}}

    try:
        supabase = get_user_client()
        quest_id = quest.get('id')

        # Get all completed tasks for this quest
        completed_tasks = supabase.table('quest_task_completions')\
            .select('task_id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if completed_tasks.data:
            # Get task details to find pillar assignments and XP values
            task_ids = [task['task_id'] for task in completed_tasks.data]

            if task_ids:
                tasks = supabase.table('user_quest_tasks')\
                    .select('id, pillar, xp_value')\
                    .in_('id', task_ids)\
                    .eq('user_id', user_id)\
                    .execute()

                # Create a map of task_id to pillar and xp
                task_info_map = {}
                if tasks.data:
                    for task in tasks.data:
                        task_info_map[task['id']] = {
                            'pillar': task.get('pillar', 'stem'),
                            'xp_value': task.get('xp_value', 0)
                        }

                # Aggregate XP by pillar from user_quest_tasks.xp_value
                for completion in completed_tasks.data:
                    task_id = completion.get('task_id')
                    task_info = task_info_map.get(task_id, {'pillar': 'stem', 'xp_value': 0})
                    xp = task_info['xp_value'] or 0
                    pillar = task_info['pillar']

                    # Use NEW simplified pillar names (stem, wellness, communication, civics, art)
                    xp_breakdown[pillar] = xp_breakdown.get(pillar, 0) + xp
                    total_xp += xp

    except Exception as e:
        logger.error(f"Error calculating quest XP: {str(e)}")
        # Return empty breakdown on error
        return {'total': 0, 'breakdown': {}}

    return {
        'total': total_xp,
        'breakdown': xp_breakdown
    }