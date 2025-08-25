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
        user = supabase.table('users').select('first_name, last_name').eq('id', user_id).execute()
        
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
            return jsonify({'error': 'Diploma not found'}), 404
        
        # Get user info
        user = supabase.table('users').select('*').eq('id', user_id).execute()
        
        if not user.data:
            return jsonify({'error': 'User not found'}), 404
        
        # Get skill XP
        skill_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).execute()
        
        # Get completed quests count
        completed_quests = supabase.table('user_quests').select('id').eq('user_id', user_id).eq('status', 'completed').execute()
        
        return jsonify({
            'diploma': diploma.data[0],
            'user': user.data[0],
            'skill_xp': skill_xp.data,
            'total_quests_completed': len(completed_quests.data) if completed_quests.data else 0,
            'portfolio_url': f"https://optio.com/portfolio/{diploma.data[0]['portfolio_slug']}"
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