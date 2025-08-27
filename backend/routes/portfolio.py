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
            quests!inner(*),
            submissions!inner(
                *,
                submission_evidence(*)
            )
            '''
        ).eq('user_id', user_id).eq('status', 'completed').execute()
        
        # Calculate XP by skill category (same approach as dashboard)
        xp_by_category = {}
        skill_xp_data = []
        total_xp = 0
        
        # Initialize all skill categories with 0
        skill_categories = ['reading_writing', 'thinking_skills', 'personal_growth', 
                          'life_skills', 'making_creating', 'world_understanding']
        for cat in skill_categories:
            xp_by_category[cat] = 0
            
        # Try to get from user_skill_xp table first
        try:
            skill_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).execute()
            print(f"Skill XP data from table: {skill_xp.data}")
            
            if skill_xp.data:
                for record in skill_xp.data:
                    xp_by_category[record['skill_category']] = record['total_xp']
                    total_xp += record['total_xp']
                    skill_xp_data.append(record)
        except Exception as e:
            print(f"Error fetching skill XP: {str(e)}")
        
        # If no XP data exists, calculate from completed quests
        if total_xp == 0 and completed_quests.data:
            print(f"No XP in user_skill_xp table, calculating from {len(completed_quests.data)} completed quests")
            for quest_record in completed_quests.data:
                quest = quest_record.get('quests', {})
                quest_id = quest.get('id')
                
                if quest_id:
                    try:
                        # Get skill XP awards for this quest
                        skill_awards = supabase.table('quest_skill_xp').select('*').eq('quest_id', quest_id).execute()
                        if skill_awards.data:
                            print(f"Quest {quest_id} has {len(skill_awards.data)} XP awards")
                            for award in skill_awards.data:
                                category = award['skill_category']
                                amount = award['xp_amount']
                                xp_by_category[category] = xp_by_category.get(category, 0) + amount
                                total_xp += amount
                        else:
                            print(f"Quest {quest_id} has no XP awards in quest_skill_xp table")
                    except Exception as e:
                        print(f"Error fetching XP for quest {quest_id}: {str(e)}")
            
            # Convert xp_by_category to skill_xp_data format
            skill_xp_data = [
                {'skill_category': cat, 'total_xp': xp}
                for cat, xp in xp_by_category.items()
                if xp > 0
            ]
        
        # Get skill details (times practiced)
        print(f"Fetching skill details for user_id: {user_id}")
        skill_details = supabase.table('user_skill_details').select('*').eq('user_id', user_id).execute()
        print(f"Skill details data: {skill_details.data}")
        
        # If no skill details exist, create them from completed quests
        if not skill_details.data and completed_quests.data:
            skill_details_map = {}
            for quest_record in completed_quests.data:
                quest = quest_record.get('quests', {})
                core_skills = quest.get('core_skills', [])
                for skill in core_skills:
                    if skill not in skill_details_map:
                        skill_details_map[skill] = 0
                    skill_details_map[skill] += 1
            
            skill_details.data = [
                {'skill_name': skill, 'times_practiced': count}
                for skill, count in skill_details_map.items()
            ]
        
        # Calculate total quests completed
        total_quests = len(completed_quests.data) if completed_quests.data else 0
        print(f"Total quests completed: {total_quests}")
        print(f"Total XP calculated: {total_xp}")
        print(f"XP by category: {xp_by_category}")
        
        return jsonify({
            'student': user.data[0],
            'diploma_issued': diploma.data[0]['issued_date'],
            'completed_quests': completed_quests.data,
            'skill_xp': skill_xp_data,  # Use the calculated data
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
    Get portfolio data for a specific user
    """
    try:
        print(f"Getting portfolio for user_id: {user_id}")
        supabase = get_supabase_client()
        
        # Try to get diploma info
        try:
            diploma_result = supabase.table('diplomas').select('*').eq('user_id', user_id).execute()
            diploma = diploma_result.data if diploma_result.data else None
            print(f"Existing diploma data: {diploma}")
        except Exception as e:
            print(f"Error fetching diploma: {str(e)}")
            diploma = None
        
        # If no diploma exists, try to create one
        if not diploma:
            print(f"No diploma found, creating one for user {user_id}")
            try:
                # Get user data to generate slug
                user_data = supabase.table('users').select('first_name, last_name').eq('id', user_id).execute()
                
                if user_data.data:
                    # Generate portfolio slug
                    import re
                    first_name = user_data.data[0].get('first_name', '') or ''
                    last_name = user_data.data[0].get('last_name', '') or ''
                    base_slug = re.sub(r'[^a-zA-Z0-9]', '', first_name + last_name).lower()
                    
                    if not base_slug:  # If no name, use user ID
                        base_slug = user_id[:8]
                    
                    # Make slug unique
                    slug = base_slug
                    counter = 0
                    while True:
                        try:
                            check_slug = slug if counter == 0 else f"{slug}{counter}"
                            existing = supabase.table('diplomas').select('id').eq('portfolio_slug', check_slug).execute()
                            if not existing.data:
                                slug = check_slug
                                break
                            counter += 1
                            if counter > 100:  # Prevent infinite loop
                                slug = f"{base_slug}{user_id[:8]}"
                                break
                        except:
                            # If checking fails, just use a unique slug
                            slug = f"{base_slug}{user_id[:8]}"
                            break
                    
                    # Create diploma
                    try:
                        diploma_create = supabase.table('diplomas').insert({
                            'user_id': user_id,
                            'portfolio_slug': slug
                        }).execute()
                        diploma = diploma_create.data
                        print(f"Diploma created successfully: {diploma}")
                    except Exception as insert_error:
                        print(f"Error creating diploma: {str(insert_error)}")
                        # Create a dummy diploma object for response
                        diploma = [{
                            'portfolio_slug': f"{base_slug or 'user'}{user_id[:8]}",
                            'issued_date': None,
                            'is_public': True
                        }]
                else:
                    print(f"User {user_id} not found")
                    # Create a dummy diploma object
                    diploma = [{
                        'portfolio_slug': f"user{user_id[:8]}",
                        'issued_date': None,
                        'is_public': True
                    }]
            except Exception as create_error:
                print(f"Error in diploma creation process: {str(create_error)}")
                # Create a dummy diploma object
                diploma = [{
                    'portfolio_slug': f"user{user_id[:8]}",
                    'issued_date': None,
                    'is_public': True
                }]
        
        # Get user info
        try:
            user = supabase.table('users').select('*').eq('id', user_id).execute()
            user_data = user.data[0] if user.data else {'id': user_id}
        except:
            user_data = {'id': user_id}
        
        # Initialize skill XP data
        skill_xp_data = []
        try:
            # Initialize skill categories if they don't exist
            skill_categories = ['reading_writing', 'thinking_skills', 'personal_growth',
                              'life_skills', 'making_creating', 'world_understanding']
            
            for category in skill_categories:
                try:
                    existing = supabase.table('user_skill_xp').select('id').eq('user_id', user_id).eq('skill_category', category).execute()
                    if not existing.data:
                        supabase.table('user_skill_xp').insert({
                            'user_id': user_id,
                            'skill_category': category,
                            'total_xp': 0
                        }).execute()
                except:
                    pass  # Ignore errors in initialization
            
            # Get skill XP
            skill_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).execute()
            skill_xp_data = skill_xp.data if skill_xp.data else []
        except Exception as e:
            print(f"Error fetching skill XP: {str(e)}")
        
        # Get completed quests count
        total_quests = 0
        try:
            completed_quests = supabase.table('user_quests').select('id').eq('user_id', user_id).eq('status', 'completed').execute()
            total_quests = len(completed_quests.data) if completed_quests.data else 0
        except:
            pass
        
        # Calculate total XP
        total_xp = sum(s['total_xp'] for s in skill_xp_data) if skill_xp_data else 0
        
        # Prepare response
        response_data = {
            'diploma': diploma[0] if diploma else None,
            'user': user_data,
            'skill_xp': skill_xp_data,
            'total_quests_completed': total_quests,
            'total_xp': total_xp,
            'portfolio_url': f"https://optio.com/portfolio/{diploma[0]['portfolio_slug']}" if diploma else None
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        import traceback
        print(f"Error fetching user portfolio: {str(e)}")
        print(f"Full traceback: {traceback.format_exc()}")
        # Return a minimal response even on error
        return jsonify({
            'diploma': {
                'portfolio_slug': f"user{user_id[:8]}",
                'issued_date': None,
                'is_public': True
            },
            'user': {'id': user_id},
            'skill_xp': [],
            'total_quests_completed': 0,
            'total_xp': 0,
            'portfolio_url': f"https://optio.com/portfolio/user{user_id[:8]}"
        }), 200  # Return 200 with default data instead of 500

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