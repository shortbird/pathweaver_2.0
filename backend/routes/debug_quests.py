from flask import Blueprint, jsonify
from database import get_supabase_admin_client

bp = Blueprint('debug_quests', __name__)

@bp.route('/check-quest-xp', methods=['GET'])
def check_quest_xp():
    """Check which quests have XP awards defined"""
    try:
        supabase = get_supabase_admin_client()
        
        # Get all quests
        all_quests = supabase.table('quests').select('id, title').execute()
        
        result = {
            'total_quests': len(all_quests.data) if all_quests.data else 0,
            'quests_with_xp': [],
            'quests_without_xp': []
        }
        
        if all_quests.data:
            for quest in all_quests.data:
                quest_id = quest['id']
                quest_title = quest['title']
                
                # Check if quest has XP awards
                xp_awards = supabase.table('quest_skill_xp').select('*').eq('quest_id', quest_id).execute()
                
                if xp_awards.data:
                    total_xp = sum(award['xp_amount'] for award in xp_awards.data)
                    result['quests_with_xp'].append({
                        'id': quest_id,
                        'title': quest_title,
                        'xp_awards': xp_awards.data,
                        'total_xp': total_xp
                    })
                else:
                    result['quests_without_xp'].append({
                        'id': quest_id,
                        'title': quest_title
                    })
        
        result['quests_with_xp_count'] = len(result['quests_with_xp'])
        result['quests_without_xp_count'] = len(result['quests_without_xp'])
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/add-missing-xp', methods=['POST'])
def add_missing_xp():
    """Add XP awards to quests that don't have them"""
    try:
        supabase = get_supabase_admin_client()
        
        # Get all quests without XP
        all_quests = supabase.table('quests').select('*').execute()
        
        quests_fixed = []
        
        if all_quests.data:
            for quest in all_quests.data:
                quest_id = quest['id']
                
                # Check if quest has XP awards
                existing_xp = supabase.table('quest_skill_xp').select('id').eq('quest_id', quest_id).execute()
                
                if not existing_xp.data:
                    # Add default XP based on difficulty and estimated hours
                    difficulty = quest.get('difficulty_level', 'intermediate')
                    hours = quest.get('estimated_hours', 2)
                    effort = quest.get('effort_level', 'moderate')
                    
                    # Base XP calculation
                    base_xp = {
                        'beginner': 75,
                        'intermediate': 150,
                        'advanced': 250
                    }.get(difficulty, 150)
                    
                    # Adjust for effort level
                    if effort == 'light':
                        base_xp = int(base_xp * 0.7)
                    elif effort == 'intensive':
                        base_xp = int(base_xp * 1.3)
                    
                    # Adjust for hours
                    if hours >= 8:
                        base_xp = int(base_xp * 1.5)
                    elif hours >= 4:
                        base_xp = int(base_xp * 1.2)
                    
                    # Distribute XP based on quest focus
                    # Look at core_skills to determine distribution
                    core_skills = quest.get('core_skills', [])
                    
                    distribution = {}
                    
                    # Map skills to categories
                    if any(skill in ['reading', 'writing', 'speaking', 'digital_media'] for skill in core_skills):
                        distribution['reading_writing'] = 0.3
                    
                    if any(skill in ['critical_thinking', 'creative_thinking', 'research', 'systems_thinking', 'decision_making'] for skill in core_skills):
                        distribution['thinking_skills'] = 0.3
                    
                    if any(skill in ['emotional_skills', 'grit', 'learning_reflection', 'time_management'] for skill in core_skills):
                        distribution['personal_growth'] = 0.25
                    
                    if any(skill in ['money_skills', 'health_fitness', 'home_skills', 'citizenship'] for skill in core_skills):
                        distribution['life_skills'] = 0.25
                    
                    if any(skill in ['building', 'art', 'coding', 'tech_skills'] for skill in core_skills):
                        distribution['making_creating'] = 0.3
                    
                    if any(skill in ['cultural_awareness', 'history', 'environment', 'ethics_philosophy', 'scientific_method'] for skill in core_skills):
                        distribution['world_understanding'] = 0.25
                    
                    # If no specific distribution, use a default
                    if not distribution:
                        distribution = {
                            'thinking_skills': 0.4,
                            'personal_growth': 0.3,
                            'life_skills': 0.3
                        }
                    
                    # Normalize distribution to sum to 1
                    total_weight = sum(distribution.values())
                    if total_weight > 0:
                        distribution = {k: v/total_weight for k, v in distribution.items()}
                    
                    # Add XP awards
                    for category, weight in distribution.items():
                        xp_amount = max(25, int(base_xp * weight))  # Minimum 25 XP
                        
                        supabase.table('quest_skill_xp').insert({
                            'quest_id': quest_id,
                            'skill_category': category,
                            'xp_amount': xp_amount
                        }).execute()
                    
                    quests_fixed.append({
                        'id': quest_id,
                        'title': quest['title'],
                        'xp_distribution': {k: int(base_xp * v) for k, v in distribution.items()},
                        'total_xp': base_xp
                    })
        
        return jsonify({
            'message': f'Added XP to {len(quests_fixed)} quests',
            'quests_fixed': quests_fixed
        }), 200
        
    except Exception as e:
        import traceback
        print(f"Error adding XP: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500