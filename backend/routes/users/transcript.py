"""User transcript routes"""

from flask import Blueprint, jsonify
from database import get_user_client
from utils.auth.decorators import require_auth
from middleware.error_handler import NotFoundError
from datetime import datetime
from .helpers import calculate_user_xp, get_user_level, SKILL_CATEGORIES

transcript_bp = Blueprint('transcript', __name__)

@transcript_bp.route('/transcript', methods=['GET'])
@require_auth
def get_transcript(user_id):
    """Get user's learning transcript with all completed quests and achievements"""
    # Use user client with RLS enforcement
    supabase = get_user_client()
    
    try:
        # Fetch user data
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()
        
        if not user.data:
            raise NotFoundError('User', user_id)
        
        # Get all completed quests
        completed_quests = get_all_completed_quests(supabase, user_id)
        
        # Calculate XP totals and breakdown
        total_xp, skill_breakdown = calculate_user_xp(supabase, user_id)
        
        # Get user level info
        level_info = get_user_level(total_xp)
        
        # Group quests by category for transcript
        quests_by_category = group_quests_by_category(completed_quests)
        
        # Calculate statistics
        statistics = calculate_transcript_statistics(completed_quests, skill_breakdown)
        
        # Get achievements/badges (if implemented)
        achievements = get_user_achievements(supabase, user_id)
        
        # Build transcript data
        transcript_data = {
            'user': {
                'id': user.data['id'],
                'name': f"{user.data.get('first_name', '')} {user.data.get('last_name', '')}",
                'email': user.data.get('email'),
                'joined_date': user.data.get('created_at'),
                'subscription_tier': user.data.get('subscription_tier', 'explorer')
            },
            'summary': {
                'total_xp': total_xp,
                'level': level_info,
                'total_quests_completed': len(completed_quests),
                'learning_hours': statistics.get('estimated_hours', 0),
                'strongest_skill': statistics.get('strongest_skill'),
                'completion_rate': statistics.get('completion_rate', 0)
            },
            'skill_breakdown': format_transcript_skills(skill_breakdown),
            'quests_by_category': quests_by_category,
            'achievements': achievements,
            'generated_at': datetime.utcnow().isoformat() + 'Z'
        }
        
        return jsonify(transcript_data), 200
        
    except NotFoundError:
        raise
    except Exception as e:
        print(f"Error generating transcript: {str(e)}")
        return jsonify({'error': 'Failed to generate transcript'}), 500

def get_all_completed_quests(supabase, user_id: str) -> list:
    """Get all completed quests for transcript"""
    try:
        # Get all completed quests with details
        completed = supabase.table('user_quests')\
            .select('*, quests(*, quest_skill_xp(*), quest_xp_awards(*))')\
            .eq('user_id', user_id)\
            .eq('status', 'completed')\
            .order('completed_at', desc=False)\
            .execute()
    except:
        # Fallback without skill XP
        try:
            completed = supabase.table('user_quests')\
                .select('*, quests(*)')\
                .eq('user_id', user_id)\
                .eq('status', 'completed')\
                .order('completed_at', desc=False)\
                .execute()
        except Exception as e:
            print(f"Error fetching completed quests for transcript: {str(e)}")
            return []
    
    if not completed.data:
        return []
    
    # Format quest data for transcript
    formatted_quests = []
    for quest_record in completed.data:
        quest = quest_record.get('quests', {})
        if quest:
            formatted_quest = {
                'id': quest.get('id'),
                'title': quest.get('title'),
                'description': quest.get('description'),
                'category': quest.get('category', 'general'),
                'difficulty': quest.get('difficulty'),
                'completed_at': quest_record.get('completed_at'),
                'xp_earned': calculate_transcript_xp(quest),
                'skills_developed': extract_skills_developed(quest)
            }
            formatted_quests.append(formatted_quest)
    
    return formatted_quests

def group_quests_by_category(quests: list) -> dict:
    """Group quests by category for organized display"""
    grouped = {}
    
    for quest in quests:
        category = quest.get('category', 'general')
        if category not in grouped:
            grouped[category] = {
                'category': category,
                'count': 0,
                'quests': [],
                'total_xp': 0
            }
        
        grouped[category]['count'] += 1
        grouped[category]['quests'].append(quest)
        grouped[category]['total_xp'] += quest.get('xp_earned', {}).get('total', 0)
    
    return grouped

def calculate_transcript_statistics(quests: list, skill_breakdown: dict) -> dict:
    """Calculate statistics for the transcript"""
    stats = {
        'estimated_hours': 0,
        'strongest_skill': None,
        'completion_rate': 0,
        'average_difficulty': None
    }
    
    if not quests:
        return stats
    
    # Estimate learning hours (rough estimate based on quest difficulty)
    difficulty_hours = {
        'beginner': 0.5,
        'intermediate': 1.5,
        'advanced': 3.0
    }
    
    total_hours = sum(
        difficulty_hours.get(q.get('difficulty', 'beginner'), 1.0) 
        for q in quests
    )
    stats['estimated_hours'] = round(total_hours, 1)
    
    # Find strongest skill
    if skill_breakdown:
        strongest = max(skill_breakdown.items(), key=lambda x: x[1])
        if strongest[1] > 0:
            stats['strongest_skill'] = {
                'category': strongest[0],
                'xp': strongest[1]
            }
    
    # Calculate average difficulty distribution
    difficulty_counts = {}
    for quest in quests:
        diff = quest.get('difficulty', 'beginner')
        difficulty_counts[diff] = difficulty_counts.get(diff, 0) + 1
    
    if difficulty_counts:
        total = sum(difficulty_counts.values())
        stats['difficulty_distribution'] = {
            k: round((v / total) * 100, 1) 
            for k, v in difficulty_counts.items()
        }
    
    return stats

def format_transcript_skills(skill_breakdown: dict) -> list:
    """Format skills for transcript display"""
    skill_display_names = {
        'reading_writing': 'Reading & Writing',
        'thinking_skills': 'Critical Thinking',
        'personal_growth': 'Personal Development',
        'life_skills': 'Life Skills',
        'making_creating': 'Creative Arts',
        'world_understanding': 'Global Awareness'
    }
    
    formatted = []
    total_xp = sum(skill_breakdown.values())
    
    for category in SKILL_CATEGORIES:
        xp = skill_breakdown.get(category, 0)
        formatted.append({
            'category': category,
            'name': skill_display_names.get(category, category),
            'xp': xp,
            'percentage': round((xp / total_xp * 100), 1) if total_xp > 0 else 0,
            'level': get_skill_level(xp)
        })
    
    return sorted(formatted, key=lambda x: x['xp'], reverse=True)

def get_skill_level(xp: int) -> str:
    """Determine skill level based on XP"""
    if xp >= 500:
        return 'Expert'
    elif xp >= 200:
        return 'Advanced'
    elif xp >= 50:
        return 'Intermediate'
    elif xp > 0:
        return 'Beginner'
    else:
        return 'Not Started'

def calculate_transcript_xp(quest: dict) -> dict:
    """Calculate XP for transcript display"""
    total = 0
    breakdown = {}
    
    if 'quest_skill_xp' in quest and quest['quest_skill_xp']:
        for award in quest['quest_skill_xp']:
            amount = award.get('xp_amount', 0)
            total += amount
            category = award.get('skill_category')
            if category:
                breakdown[category] = amount
    elif 'quest_xp_awards' in quest and quest['quest_xp_awards']:
        for award in quest['quest_xp_awards']:
            amount = award.get('xp_amount', 0)
            total += amount
    
    return {'total': total, 'breakdown': breakdown}

def extract_skills_developed(quest: dict) -> list:
    """Extract list of skills developed from quest"""
    skills = []
    
    if 'quest_skill_xp' in quest and quest['quest_skill_xp']:
        for award in quest['quest_skill_xp']:
            category = award.get('skill_category')
            if category:
                skills.append(category)
    
    # Add quest category as a skill if no specific skills found
    if not skills and quest.get('category'):
        skills.append(quest['category'])
    
    return skills

def get_user_achievements(supabase, user_id: str) -> list:
    """Get user achievements/badges (placeholder for future implementation)"""
    achievements = []
    
    try:
        # Check for basic achievements based on completion count
        completed_count = supabase.table('user_quests')\
            .select('id', count='exact')\
            .eq('user_id', user_id)\
            .eq('status', 'completed')\
            .execute()
        
        count = completed_count.count if completed_count else 0
        
        # Award achievements based on milestones
        if count >= 1:
            achievements.append({
                'id': 'first_quest',
                'name': 'First Steps',
                'description': 'Complete your first quest',
                'earned_at': datetime.utcnow().isoformat() + 'Z'
            })
        if count >= 10:
            achievements.append({
                'id': 'quest_10',
                'name': 'Dedicated Learner',
                'description': 'Complete 10 quests',
                'earned_at': datetime.utcnow().isoformat() + 'Z'
            })
        if count >= 50:
            achievements.append({
                'id': 'quest_50',
                'name': 'Knowledge Seeker',
                'description': 'Complete 50 quests',
                'earned_at': datetime.utcnow().isoformat() + 'Z'
            })
        if count >= 100:
            achievements.append({
                'id': 'quest_100',
                'name': 'Quest Master',
                'description': 'Complete 100 quests',
                'earned_at': datetime.utcnow().isoformat() + 'Z'
            })
    except Exception as e:
        print(f"Error fetching achievements: {str(e)}")
    
    return achievements