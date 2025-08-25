from flask import Blueprint, jsonify
from database import get_supabase_client

bp = Blueprint('portfolio', __name__)

@bp.route('/public/<portfolio_slug>', methods=['GET'])
def get_public_portfolio(portfolio_slug):
    """
    Public endpoint (no auth required) to view a student's portfolio
    Returns: user info, completed quests with evidence, skill XP totals
    """
    try:
        supabase = get_supabase_client()
        
        # Get diploma info
        diploma = supabase.table('diplomas').select('*').eq('portfolio_slug', portfolio_slug).execute()
        
        if not diploma.data or not diploma.data[0]['is_public']:
            return jsonify({'error': 'Portfolio not found or private'}), 404
        
        user_id = diploma.data[0]['user_id']
        
        # Get user's basic info (not sensitive data)
        # Try to select without username first, fallback to with username for backward compatibility
        try:
            user = supabase.table('users').select('first_name, last_name').eq('id', user_id).execute()
        except:
            # If that fails, the username column might still exist
            user = supabase.table('users').select('username, first_name, last_name').eq('id', user_id).execute()
        
        if not user.data:
            return jsonify({'error': 'User not found'}), 404
        
        # Get user's completed quests with details
        completed_quests = supabase.table('user_quests').select(
            '''
            *,
            quests!inner(
                id,
                title,
                description,
                difficulty_level,
                estimated_hours,
                effort_level,
                core_skills,
                optional_challenges
            ),
            submissions!inner(
                *,
                submission_evidence(*)
            )
            '''
        ).eq('user_id', user_id).eq('status', 'completed').execute()
        
        # Get skill XP totals
        skill_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).execute()
        
        # Get skill details (times practiced)
        skill_details = supabase.table('user_skill_details').select('*').eq('user_id', user_id).execute()
        
        # Calculate total quests completed
        total_quests = len(completed_quests.data) if completed_quests.data else 0
        
        # Calculate total XP across all categories
        total_xp = sum(skill['total_xp'] for skill in skill_xp.data) if skill_xp.data else 0
        
        return jsonify({
            'student': user.data[0],
            'diploma_issued': diploma.data[0]['issued_date'],
            'completed_quests': completed_quests.data,
            'skill_xp': skill_xp.data,
            'skill_details': skill_details.data,
            'total_quests_completed': total_quests,
            'total_xp': total_xp,
            'portfolio_url': f"https://optio.com/portfolio/{portfolio_slug}"
        }), 200
        
    except Exception as e:
        print(f"Error fetching portfolio: {str(e)}")
        return jsonify({'error': 'Failed to fetch portfolio'}), 500

@bp.route('/user/<user_id>', methods=['GET'])
def get_user_portfolio(user_id):
    """
    Get portfolio data for a specific user (requires authentication)
    """
    try:
        supabase = get_supabase_client()
        
        # Get diploma info
        diploma = supabase.table('diplomas').select('*').eq('user_id', user_id).execute()
        
        if not diploma.data:
            # Create diploma if it doesn't exist
            user_data = supabase.table('users').select('first_name, last_name').eq('id', user_id).execute()
            if user_data.data:
                # Generate portfolio slug inline
                import re
                first_name = user_data.data[0]['first_name'] or ''
                last_name = user_data.data[0]['last_name'] or ''
                slug = re.sub(r'[^a-zA-Z0-9]', '', first_name + last_name).lower()
                
                # Check for uniqueness
                counter = 0
                while True:
                    check_slug = slug if counter == 0 else f"{slug}{counter}"
                    existing = supabase.table('diplomas').select('id').eq('portfolio_slug', check_slug).execute()
                    if not existing.data:
                        slug = check_slug
                        break
                    counter += 1
                
                # Create diploma
                diploma = supabase.table('diplomas').insert({
                    'user_id': user_id,
                    'portfolio_slug': slug
                }).execute()
                
                if not diploma.data:
                    return jsonify({'error': 'Failed to create diploma'}), 500
            else:
                return jsonify({'error': 'User not found'}), 404
        
        # Get user info
        user = supabase.table('users').select('*').eq('id', user_id).execute()
        
        if not user.data:
            return jsonify({'error': 'User not found'}), 404
        
        # Initialize skill categories if they don't exist
        skill_categories = ['reading_writing', 'thinking_skills', 'personal_growth',
                          'life_skills', 'making_creating', 'world_understanding']
        
        for category in skill_categories:
            existing = supabase.table('user_skill_xp').select('id').eq('user_id', user_id).eq('skill_category', category).execute()
            if not existing.data:
                supabase.table('user_skill_xp').insert({
                    'user_id': user_id,
                    'skill_category': category,
                    'total_xp': 0
                }).execute()
        
        # Get skill XP
        skill_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).execute()
        
        # If no skill XP data, create it from completed quests
        if not skill_xp.data or all(s['total_xp'] == 0 for s in skill_xp.data):
            # Recalculate from completed quests
            completed_quests = supabase.table('user_quests').select('quest_id').eq('user_id', user_id).eq('status', 'completed').execute()
            
            if completed_quests.data:
                xp_totals = {cat: 0 for cat in skill_categories}
                
                for quest in completed_quests.data:
                    quest_xp = supabase.table('quest_skill_xp').select('*').eq('quest_id', quest['quest_id']).execute()
                    if quest_xp.data:
                        for award in quest_xp.data:
                            xp_totals[award['skill_category']] += award['xp_amount']
                            # Update the database
                            supabase.table('user_skill_xp').update({
                                'total_xp': xp_totals[award['skill_category']]
                            }).eq('user_id', user_id).eq('skill_category', award['skill_category']).execute()
                
                # Re-fetch updated data
                skill_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).execute()
        
        # Get completed quests count
        completed_quests = supabase.table('user_quests').select('id').eq('user_id', user_id).eq('status', 'completed').execute()
        
        # Calculate total XP
        total_xp = sum(s['total_xp'] for s in skill_xp.data) if skill_xp.data else 0
        
        return jsonify({
            'diploma': diploma.data[0] if diploma.data else None,
            'user': user.data[0],
            'skill_xp': skill_xp.data if skill_xp.data else [],
            'total_quests_completed': len(completed_quests.data) if completed_quests.data else 0,
            'total_xp': total_xp,
            'portfolio_url': f"https://optio.com/portfolio/{diploma.data[0]['portfolio_slug']}" if diploma.data else None
        }), 200
        
    except Exception as e:
        print(f"Error fetching user portfolio: {str(e)}")
        return jsonify({'error': 'Failed to fetch portfolio'}), 500

@bp.route('/user/<user_id>/privacy', methods=['PUT'])
def update_portfolio_privacy(user_id):
    """
    Toggle portfolio privacy setting
    """
    try:
        from flask import request
        supabase = get_supabase_client()
        
        data = request.json
        is_public = data.get('is_public', True)
        
        # Update diploma privacy
        result = supabase.table('diplomas').update({
            'is_public': is_public
        }).eq('user_id', user_id).execute()
        
        if result.data:
            return jsonify({
                'message': 'Privacy setting updated',
                'is_public': is_public
            }), 200
        else:
            return jsonify({'error': 'Failed to update privacy setting'}), 400
            
    except Exception as e:
        print(f"Error updating privacy: {str(e)}")
        return jsonify({'error': 'Failed to update privacy setting'}), 500