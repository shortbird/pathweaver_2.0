from flask import Blueprint, jsonify
from flask_cors import cross_origin
from database import get_supabase_client
from datetime import datetime
from utils.auth.decorators import require_auth, require_paid_tier

bp = Blueprint('portfolio', __name__)

@bp.route('/public/<portfolio_slug>', methods=['GET'])
@cross_origin()
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
        # Get completed quests - include both explicitly completed and those with all tasks done
        completed_quests = supabase.table('user_quests').select(
            '''
            *,
            quests!inner(*)
            '''
        ).eq('user_id', user_id).not_.is_('completed_at', 'null').execute()
        
        # Also check for quests that have all tasks completed but no completed_at
        # This is a workaround for the database trigger issue
        all_user_quests = supabase.table('user_quests').select(
            '''
            *,
            quests!inner(*)
            '''
        ).eq('user_id', user_id).is_('completed_at', 'null').execute()
        
        if all_user_quests.data:
            for user_quest in all_user_quests.data:
                user_quest_id = user_quest['id']
                quest_id = user_quest['quest_id']
                
                # Get all tasks for this quest
                all_tasks = supabase.table('quest_tasks')\
                    .select('id')\
                    .eq('quest_id', quest_id)\
                    .execute()
                
                if all_tasks.data:
                    # Get completed tasks for this user quest
                    completed_tasks = supabase.table('user_quest_tasks')\
                        .select('quest_task_id, completed_at')\
                        .eq('user_quest_id', user_quest_id)\
                        .execute()
                    
                    all_task_ids = {t['id'] for t in all_tasks.data}
                    completed_task_ids = {t['quest_task_id'] for t in completed_tasks.data}
                    
                    # If all tasks are completed, include this quest
                    if all_task_ids and all_task_ids == completed_task_ids:
                        # Add a virtual completed_at based on last task completion
                        if completed_tasks.data:
                            latest_completion = max(t['completed_at'] for t in completed_tasks.data if t.get('completed_at'))
                            user_quest['completed_at'] = latest_completion
                        else:
                            user_quest['completed_at'] = datetime.utcnow().isoformat()
                        
                        # Add to completed quests list
                        if not completed_quests.data:
                            completed_quests.data = []
                        completed_quests.data.append(user_quest)
        
        # Calculate XP by skill category (same approach as dashboard)
        xp_by_category = {}
        skill_xp_data = []
        total_xp = 0
        
        # Initialize all skill categories with 0
        skill_categories = ['creativity', 'critical_thinking', 'practical_skills',
                          'communication', 'cultural_literacy']
        for cat in skill_categories:
            xp_by_category[cat] = 0
            
        # Try to get from user_skill_xp table first
        try:
            skill_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).execute()
            print(f"Skill XP data from table: {skill_xp.data}")
            
            if skill_xp.data:
                for record in skill_xp.data:
                    # Handle both old (skill_category/total_xp) and new (pillar/xp_amount) column names
                    category = record.get('pillar', record.get('skill_category'))
                    xp = record.get('xp_amount', record.get('total_xp', 0))
                    if category:
                        xp_by_category[category] = xp
                        total_xp += xp
                        skill_xp_data.append({
                            'skill_category': category,  # Keep consistent output format
                            'total_xp': xp
                        })
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
                # Handle None or non-list core_skills
                if core_skills and isinstance(core_skills, list):
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
        import traceback
        print(f"Error fetching portfolio: {str(e)}")
        print(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Failed to fetch portfolio'}), 500

@bp.route('/user/<user_id>', methods=['GET'])
@cross_origin()
@require_auth
@require_paid_tier
def get_user_portfolio(auth_user_id: str, user_id: str):
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
            # Don't try to initialize skill categories in portfolio view
            # This is a public read-only endpoint
            # Skill categories should be initialized during user registration
            
            # Get skill XP
            skill_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).execute()
            skill_xp_data = skill_xp.data if skill_xp.data else []
        except Exception as e:
            print(f"Error fetching skill XP: {str(e)}")
        
        # Get completed quests count
        total_quests = 0
        try:
            # In V3 schema, completed quests have completed_at not null
            completed_quests = supabase.table('user_quests').select('id').eq('user_id', user_id).not_.is_('completed_at', 'null').execute()
            total_quests = len(completed_quests.data) if completed_quests.data else 0
        except:
            pass
        
        # Calculate total XP (V3 uses xp_amount, old uses total_xp)
        total_xp = 0
        if skill_xp_data:
            for s in skill_xp_data:
                # Handle both column name formats
                xp = s.get('xp_amount', s.get('total_xp', 0))
                total_xp += xp
        
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

@bp.route('/diploma/<user_id>', methods=['GET'])
@cross_origin()
def get_public_diploma_by_user_id(user_id):
    """
    Public endpoint to view a student's diploma by user ID.
    This is the route called by the diploma page when viewing /diploma/:userId
    """
    try:
        supabase = get_supabase_client()
        
        # Get user's basic info (not sensitive data)
        user = supabase.table('users').select('id, first_name, last_name').eq('id', user_id).execute()
        
        if not user.data:
            return jsonify({'error': 'User not found'}), 404
        
        # Get user's completed quests with V3 data structure - optimized query
        completed_quests = supabase.table('user_quests').select(
            '''
            completed_at,
            quests:quests!inner(id, title, description, big_idea, quest_tasks(*)),
            user_quest_tasks:user_quest_tasks!inner(completed_at, evidence_type, evidence_content, xp_awarded, quest_tasks(title, pillar))
            '''
        ).eq('user_id', user_id).not_.is_('completed_at', 'null').order('completed_at', desc=True).execute()

        # Also get new multi-format evidence documents for completed tasks
        evidence_documents = supabase.table('user_task_evidence_documents').select(
            '''
            *,
            evidence_document_blocks(*),
            quest_tasks(title, pillar)
            '''
        ).eq('user_id', user_id).eq('status', 'completed').execute()

        # Get user's in-progress quests (active with at least one task submitted)
        in_progress_quests = supabase.table('user_quests').select(
            '''
            started_at,
            is_active,
            quests:quests!inner(id, title, description, big_idea, quest_tasks(*)),
            user_quest_tasks:user_quest_tasks!inner(completed_at, evidence_type, evidence_content, xp_awarded, quest_tasks(title, pillar))
            '''
        ).eq('user_id', user_id).eq('is_active', True).is_('completed_at', 'null').order('started_at', desc=True).execute()

        # Get XP by skill category from user_skill_xp table
        skill_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).execute()

        xp_by_category = {}
        total_xp = 0

        if skill_xp.data:
            for record in skill_xp.data:
                # Handle both old and new column names
                category = record.get('pillar', record.get('skill_category'))
                xp = record.get('xp_amount', record.get('total_xp', 0))
                if category:
                    xp_by_category[category] = xp
                    total_xp += xp

        # Process completed and in-progress quests for achievements format
        achievements = []

        # Add completed quests
        if completed_quests.data:
            for cq in completed_quests.data:
                quest = cq.get('quests')
                if not quest:
                    continue

                # Organize evidence by task - support both old and new format
                task_evidence = {}

                # First, add legacy single-format evidence
                for task_completion in cq.get('user_quest_tasks', []):
                    task_data = task_completion.get('quest_tasks')
                    if task_data:
                        task_evidence[task_data['title']] = {
                            'evidence_type': task_completion.get('evidence_type', 'text'),
                            'evidence_content': task_completion.get('evidence_content', ''),
                            'xp_awarded': task_completion.get('xp_awarded', 0),
                            'completed_at': task_completion.get('completed_at'),
                            'pillar': task_data.get('pillar', 'Arts & Creativity'),
                            'is_legacy': True
                        }

                # Then, overlay with new multi-format evidence if available
                quest_tasks = quest.get('quest_tasks', [])
                for task in quest_tasks:
                    # Find multi-format evidence for this task
                    for doc in evidence_documents.data:
                        doc_task = doc.get('quest_tasks')
                        if doc_task and doc_task['title'] == task['title']:
                            # Replace legacy evidence with multi-format evidence
                            task_evidence[task['title']] = {
                                'evidence_type': 'multi_format',
                                'evidence_blocks': doc.get('evidence_document_blocks', []),
                                'xp_awarded': task_evidence.get(task['title'], {}).get('xp_awarded', 0),
                                'completed_at': doc.get('completed_at'),
                                'pillar': doc_task.get('pillar', 'Arts & Creativity'),
                                'is_legacy': False
                            }

                achievement = {
                    'quest': quest,
                    'completed_at': cq['completed_at'],
                    'task_evidence': task_evidence,
                    'total_xp_earned': sum(t.get('xp_awarded', 0) for t in cq.get('user_quest_tasks', [])),
                    'status': 'completed'
                }

                achievements.append(achievement)

        # Add in-progress quests with at least one submitted task
        if in_progress_quests.data:
            for cq in in_progress_quests.data:
                quest = cq.get('quests')
                if not quest or not cq.get('user_quest_tasks'):
                    continue  # Skip quests with no submitted tasks

                # Organize evidence by task
                task_evidence = {}
                for task_completion in cq.get('user_quest_tasks', []):
                    task_data = task_completion.get('quest_tasks')
                    if task_data:
                        task_evidence[task_data['title']] = {
                            'evidence_type': task_completion.get('evidence_type', 'text'),
                            'evidence_content': task_completion.get('evidence_content', ''),
                            'xp_awarded': task_completion.get('xp_awarded', 0),
                            'completed_at': task_completion.get('completed_at'),
                            'pillar': task_data.get('pillar', 'Arts & Creativity')
                        }

                # Calculate progress
                total_tasks = len(quest.get('quest_tasks', []))
                completed_tasks = len(task_evidence)

                achievement = {
                    'quest': quest,
                    'started_at': cq['started_at'],
                    'task_evidence': task_evidence,
                    'total_xp_earned': sum(t.get('xp_awarded', 0) for t in cq.get('user_quest_tasks', [])),
                    'status': 'in_progress',
                    'progress': {
                        'completed_tasks': completed_tasks,
                        'total_tasks': total_tasks,
                        'percentage': (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
                    }
                }

                achievements.append(achievement)

        # Sort achievements by date (completed_at for completed, started_at for in-progress)
        achievements.sort(key=lambda x: x.get('completed_at') or x.get('started_at'), reverse=True)
        
        return jsonify({
            'student': user.data[0],
            'achievements': achievements,
            'skill_xp': xp_by_category,
            'total_xp': total_xp,
            'total_quests_completed': len(achievements)
        }), 200
        
    except Exception as e:
        import traceback
        print(f"Error fetching diploma: {str(e)}")
        print(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Failed to fetch diploma'}), 500

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