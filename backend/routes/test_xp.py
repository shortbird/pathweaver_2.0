from flask import Blueprint, jsonify, request
from database import get_supabase_client, get_supabase_admin_client
from utils.auth_utils import require_auth

bp = Blueprint('test_xp', __name__)

@bp.route('/check/<user_id>', methods=['GET'])
def check_xp_status(user_id):
    """Debug endpoint to check XP status for a user"""
    try:
        supabase = get_supabase_admin_client()
        
        result = {
            'user_id': user_id,
            'checks': {}
        }
        
        # 1. Check completed quests
        completed_quests = supabase.table('user_quests').select('quest_id, completed_at').eq('user_id', user_id).eq('status', 'completed').execute()
        result['checks']['completed_quests'] = {
            'count': len(completed_quests.data) if completed_quests.data else 0,
            'quest_ids': [q['quest_id'] for q in completed_quests.data] if completed_quests.data else []
        }
        
        # 2. Check if those quests have XP awards
        quest_xp_awards = {}
        if completed_quests.data:
            for quest in completed_quests.data:
                quest_id = quest['quest_id']
                xp_awards = supabase.table('quest_skill_xp').select('*').eq('quest_id', quest_id).execute()
                if xp_awards.data:
                    quest_xp_awards[quest_id] = xp_awards.data
                else:
                    # Check old system
                    old_xp = supabase.table('quest_xp_awards').select('*').eq('quest_id', quest_id).execute()
                    if old_xp.data:
                        quest_xp_awards[quest_id] = [{'type': 'old_system', 'awards': old_xp.data}]
        
        result['checks']['quest_xp_awards'] = quest_xp_awards
        
        # 3. Check user's skill XP
        user_skill_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).execute()
        result['checks']['user_skill_xp'] = user_skill_xp.data if user_skill_xp.data else []
        
        # 4. Calculate what XP should be
        expected_xp = {
            'reading_writing': 0,
            'thinking_skills': 0,
            'personal_growth': 0,
            'life_skills': 0,
            'making_creating': 0,
            'world_understanding': 0
        }
        
        for quest_id, awards in quest_xp_awards.items():
            if isinstance(awards, list) and len(awards) > 0:
                if awards[0].get('type') != 'old_system':
                    for award in awards:
                        if 'skill_category' in award and 'xp_amount' in award:
                            expected_xp[award['skill_category']] = expected_xp.get(award['skill_category'], 0) + award['xp_amount']
        
        result['checks']['expected_xp'] = expected_xp
        
        # 5. Check for discrepancies
        actual_xp = {}
        for skill_data in user_skill_xp.data if user_skill_xp.data else []:
            actual_xp[skill_data['skill_category']] = skill_data['total_xp']
        
        discrepancies = {}
        for category in expected_xp:
            expected = expected_xp[category]
            actual = actual_xp.get(category, 0)
            if expected != actual:
                discrepancies[category] = {
                    'expected': expected,
                    'actual': actual,
                    'difference': expected - actual
                }
        
        result['checks']['discrepancies'] = discrepancies
        result['checks']['total_actual_xp'] = sum(actual_xp.values())
        result['checks']['total_expected_xp'] = sum(expected_xp.values())
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/fix/<user_id>', methods=['POST'])
def fix_user_xp(user_id):
    """Fix XP for a user by recalculating from completed quests"""
    try:
        supabase = get_supabase_admin_client()
        
        # Reset all skill XP for the user
        skill_categories = [
            'reading_writing', 'thinking_skills', 'personal_growth',
            'life_skills', 'making_creating', 'world_understanding'
        ]
        
        for category in skill_categories:
            existing = supabase.table('user_skill_xp').select('id').eq('user_id', user_id).eq('skill_category', category).execute()
            if existing.data:
                supabase.table('user_skill_xp').update({'total_xp': 0}).eq('user_id', user_id).eq('skill_category', category).execute()
            else:
                supabase.table('user_skill_xp').insert({
                    'user_id': user_id,
                    'skill_category': category,
                    'total_xp': 0
                }).execute()
        
        # Get all completed quests with quest details
        completed_quests = supabase.table('user_quests').select('quest_id, quests(*)').eq('user_id', user_id).eq('status', 'completed').execute()
        
        total_xp_awarded = 0
        xp_by_category = {cat: 0 for cat in skill_categories}
        quests_without_xp = []
        quests_with_xp = []
        
        if completed_quests.data:
            for quest_record in completed_quests.data:
                quest_id = quest_record['quest_id']
                quest_data = quest_record.get('quests', {})
                
                # Get XP awards for this quest
                xp_awards = supabase.table('quest_skill_xp').select('*').eq('quest_id', quest_id).execute()
                
                if xp_awards.data:
                    quests_with_xp.append(quest_id)
                    for award in xp_awards.data:
                        category = award['skill_category']
                        amount = award['xp_amount']
                        xp_by_category[category] += amount
                        total_xp_awarded += amount
                else:
                    quests_without_xp.append({
                        'quest_id': quest_id,
                        'title': quest_data.get('title', 'Unknown'),
                        'difficulty': quest_data.get('difficulty_level', 'intermediate'),
                        'hours': quest_data.get('estimated_hours', 2)
                    })
        
        # For quests without XP, add default XP based on difficulty
        for quest_info in quests_without_xp:
            # Default XP based on difficulty and hours
            base_xp = {
                'beginner': 50,
                'intermediate': 100,
                'advanced': 200
            }.get(quest_info['difficulty'], 100)
            
            # Adjust based on hours
            if quest_info['hours'] > 4:
                base_xp = int(base_xp * 1.5)
            
            # Distribute XP across relevant categories
            # Default distribution for quests without specific XP awards
            default_distribution = {
                'thinking_skills': 0.3,
                'personal_growth': 0.3,
                'life_skills': 0.2,
                'making_creating': 0.2
            }
            
            # Add XP awards for this quest
            for category, percentage in default_distribution.items():
                xp_amount = int(base_xp * percentage)
                if xp_amount > 0:
                    # Insert into quest_skill_xp table
                    supabase.table('quest_skill_xp').insert({
                        'quest_id': quest_info['quest_id'],
                        'skill_category': category,
                        'xp_amount': xp_amount
                    }).execute()
                    
                    xp_by_category[category] += xp_amount
                    total_xp_awarded += xp_amount
        
        # Update user's skill XP
        for category, total in xp_by_category.items():
            if total > 0:
                existing = supabase.table('user_skill_xp').select('id').eq('user_id', user_id).eq('skill_category', category).execute()
                if existing.data:
                    supabase.table('user_skill_xp').update({
                        'total_xp': total
                    }).eq('user_id', user_id).eq('skill_category', category).execute()
                else:
                    supabase.table('user_skill_xp').insert({
                        'user_id': user_id,
                        'skill_category': category,
                        'total_xp': total
                    }).execute()
        
        # Also update skill details for practiced skills
        for category, total in xp_by_category.items():
            if total > 0:
                # Check if skill detail exists
                existing_detail = supabase.table('user_skill_details').select('id').eq('user_id', user_id).eq('skill_name', category).execute()
                if existing_detail.data:
                    # Update times practiced
                    supabase.table('user_skill_details').update({
                        'times_practiced': len(completed_quests.data) if completed_quests.data else 1
                    }).eq('user_id', user_id).eq('skill_name', category).execute()
                else:
                    # Insert new skill detail
                    supabase.table('user_skill_details').insert({
                        'user_id': user_id,
                        'skill_name': category,
                        'times_practiced': len(completed_quests.data) if completed_quests.data else 1
                    }).execute()
        
        return jsonify({
            'message': 'XP recalculated and fixed successfully',
            'total_xp_awarded': total_xp_awarded,
            'xp_by_category': xp_by_category,
            'quests_with_xp': len(quests_with_xp),
            'quests_fixed': len(quests_without_xp),
            'fixed_quests': quests_without_xp
        }), 200
        
    except Exception as e:
        import traceback
        print(f"Error fixing XP: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500