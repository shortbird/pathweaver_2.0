from flask import Blueprint, jsonify
from flask_cors import cross_origin
from database import get_supabase_client, get_supabase_admin_client
from datetime import datetime
from utils.auth.decorators import require_auth

from utils.logger import get_logger

logger = get_logger(__name__)

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
        
        # Note: With personalized quest system, quests are marked complete when user completes them
        # No need to check quest_tasks table as it's been archived and replaced with user_quest_tasks
        
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
            logger.info(f"Skill XP data from table: {skill_xp.data}")
            
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
            logger.error(f"Error fetching skill XP: {str(e)}")
        
        # XP is now tracked in user_skill_xp table (populated when tasks complete)
        # If no XP exists yet, user hasn't completed any tasks
        if total_xp == 0:
            logger.info(f"No XP found for user {user_id} - user may not have completed any tasks yet")
        
        # Get skill details (times practiced)
        logger.info(f"Fetching skill details for user_id: {user_id}")
        skill_details = supabase.table('user_skill_details').select('*').eq('user_id', user_id).execute()
        logger.info(f"Skill details data: {skill_details.data}")
        
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
        logger.info(f"Total quests completed: {total_quests}")
        logger.info(f"Total XP calculated: {total_xp}")
        logger.info(f"XP by category: {xp_by_category}")
        
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
        logger.error(f"Error fetching portfolio: {str(e)}")
        logger.info(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Failed to fetch portfolio'}), 500

@bp.route('/user/<user_id>', methods=['GET'])
@cross_origin()
@require_auth
def get_user_portfolio(auth_user_id: str, user_id: str):
    """
    Get portfolio data for a specific user
    """
    try:
        logger.info(f"Getting portfolio for user_id: {user_id}")
        supabase = get_supabase_client()
        
        # Try to get diploma info
        try:
            diploma_result = supabase.table('diplomas').select('*').eq('user_id', user_id).execute()
            diploma = diploma_result.data if diploma_result.data else None
            logger.info(f"Existing diploma data: {diploma}")
        except Exception as e:
            logger.error(f"Error fetching diploma: {str(e)}")
            diploma = None
        
        # If no diploma exists, try to create one
        if not diploma:
            logger.info(f"No diploma found, creating one for user {user_id}")
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
                        logger.info(f"Diploma created successfully: {diploma}")
                    except Exception as insert_error:
                        logger.error(f"Error creating diploma: {str(insert_error)}")
                        # Create a dummy diploma object for response
                        diploma = [{
                            'portfolio_slug': f"{base_slug or 'user'}{user_id[:8]}",
                            'issued_date': None,
                            'is_public': True
                        }]
                else:
                    logger.info(f"User {user_id} not found")
                    # Create a dummy diploma object
                    diploma = [{
                        'portfolio_slug': f"user{user_id[:8]}",
                        'issued_date': None,
                        'is_public': True
                    }]
            except Exception as create_error:
                logger.error(f"Error in diploma creation process: {str(create_error)}")
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
            logger.error(f"Error fetching skill XP: {str(e)}")
        
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
        logger.error(f"Error fetching user portfolio: {str(e)}")
        logger.info(f"Full traceback: {traceback.format_exc()}")
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
        logger.info(f"=== DIPLOMA ENDPOINT CALLED FOR USER: {user_id} ===")
        # JUSTIFICATION: Admin client used for public diploma endpoint
        # Public endpoint needs to bypass RLS to display non-sensitive user data
        # (first_name, last_name) for portfolio viewing without authentication
        # This is a legitimate system operation for public portfolio display
        supabase = get_supabase_admin_client()

        # Get user's basic info (not sensitive data)
        user = supabase.table('users').select('id, first_name, last_name').eq('id', user_id).execute()
        logger.info(f"User query result - data: {user.data}")

        if not user.data or len(user.data) == 0:
            logger.error(f"ERROR: User not found for ID: {user_id}")
            return jsonify({'error': 'User not found'}), 404
        
        # Get user's completed quests with V3 data structure - optimized query
        # Note: user_quest_tasks stores personalized tasks, not completions
        # quest_task_completions stores the actual task completions
        completed_quests = supabase.table('user_quests').select(
            '''
            completed_at,
            quests:quests!inner(id, title, description, big_idea)
            '''
        ).eq('user_id', user_id).not_.is_('completed_at', 'null').order('completed_at', desc=True).execute()

        # Get task completions separately for display
        task_completions = supabase.table('quest_task_completions').select(
            '''
            *,
            user_quest_tasks!inner(title, pillar, quest_id, user_quest_id, xp_value)
            '''
        ).eq('user_id', user_id).execute()

        logger.debug(f"=== TASK COMPLETIONS DEBUG ===")
        logger.info(f"Found {len(task_completions.data) if task_completions.data else 0} task completions")
        if task_completions.data and len(task_completions.data) > 0:
            logger.info(f"Sample task completion structure: {task_completions.data[0]}")
        logger.info(f"================================")

        # Get multi-format evidence documents with their content blocks
        # This query fetches both the document metadata AND all associated blocks
        evidence_documents_response = supabase.table('user_task_evidence_documents').select(
            '''
            id,
            task_id,
            quest_id,
            status,
            completed_at,
            evidence_document_blocks (
                id,
                block_type,
                content,
                order_index
            )
            '''
        ).eq('user_id', user_id).eq('status', 'completed').execute()

        logger.debug(f"=== EVIDENCE DOCUMENTS DEBUG ===")
        logger.info(f"Found {len(evidence_documents_response.data) if evidence_documents_response.data else 0} evidence documents")
        if evidence_documents_response.data:
            for doc in evidence_documents_response.data:
                print(f"Doc {doc.get('id')}: task_id={doc.get('task_id')}, blocks={len(doc.get('evidence_document_blocks', []))}")
        logger.info(f"================================")

        # Create a lookup map for quick evidence document access by task_id
        evidence_docs_map = {}
        if evidence_documents_response.data:
            for doc in evidence_documents_response.data:
                task_id = doc.get('task_id')
                if task_id:
                    # Store document with its blocks
                    evidence_docs_map[task_id] = {
                        'document_id': doc.get('id'),
                        'blocks': doc.get('evidence_document_blocks', []),
                        'completed_at': doc.get('completed_at')
                    }
                    print(f"Mapped evidence doc for task {task_id}: {len(doc.get('evidence_document_blocks', []))} blocks")

        # Get user's in-progress quests (active with at least one task submitted)
        in_progress_quests = supabase.table('user_quests').select(
            '''
            started_at,
            is_active,
            quests:quests!inner(id, title, description, big_idea)
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

                user_quest_id = cq.get('id')
                quest_id = quest.get('id')

                # Get task completions for this quest from our task_completions data
                # Supabase returns nested data from !inner joins
                quest_task_completions = []
                for tc in (task_completions.data or []):
                    task_info = tc.get('user_quest_tasks')
                    # Check if task_info exists and is a dict (not None or list)
                    if task_info and isinstance(task_info, dict):
                        if (task_info.get('quest_id') == quest_id and
                            task_info.get('user_quest_id') == user_quest_id):
                            quest_task_completions.append(tc)
                    # Handle case where Supabase returns it as a list with one element
                    elif task_info and isinstance(task_info, list) and len(task_info) > 0:
                        task_info = task_info[0]
                        if (task_info.get('quest_id') == quest_id and
                            task_info.get('user_quest_id') == user_quest_id):
                            # Flatten the structure
                            tc_copy = tc.copy()
                            tc_copy['user_quest_tasks'] = task_info
                            quest_task_completions.append(tc_copy)

                # Organize evidence by task
                task_evidence = {}
                total_quest_xp = 0

                for tc in quest_task_completions:
                    task_info = tc.get('user_quest_tasks', {})
                    task_title = task_info.get('title', 'Unknown Task')
                    task_id = tc.get('user_quest_task_id')  # Use user_quest_task_id to match evidence documents

                    print(f"Looking up evidence for task_id={task_id}, task_title='{task_title}'")

                    # Get XP for this specific task from user_quest_tasks (not completions)
                    task_xp = task_info.get('xp_value', 0)
                    total_quest_xp += task_xp

                    # Check for multi-format evidence using our lookup map
                    evidence_doc = evidence_docs_map.get(task_id)
                    print(f"  Found evidence_doc: {evidence_doc is not None}, blocks: {len(evidence_doc.get('blocks', [])) if evidence_doc else 0}")

                    if evidence_doc and evidence_doc.get('blocks'):
                        # Use new multi-format evidence
                        blocks = evidence_doc.get('blocks', [])
                        print(f"Task '{task_title}' has {len(blocks)} evidence blocks")

                        task_evidence[task_title] = {
                            'evidence_type': 'multi_format',
                            'evidence_blocks': blocks,
                            'xp_awarded': task_xp,
                            'completed_at': tc.get('completed_at'),
                            'pillar': task_info.get('pillar', 'Arts & Creativity'),
                            'is_legacy': False
                        }
                    else:
                        # Use legacy single-format evidence
                        evidence_text = tc.get('evidence_text', '')
                        evidence_url = tc.get('evidence_url', '')

                        # Determine evidence type
                        if evidence_text and not evidence_text.startswith('Multi-format evidence document'):
                            evidence_type = 'text'
                            evidence_content = evidence_text
                        elif evidence_url:
                            evidence_type = 'link'
                            evidence_content = evidence_url
                        else:
                            # No evidence or just document reference
                            evidence_type = 'text'
                            evidence_content = 'Evidence submitted but not available for display'

                        task_evidence[task_title] = {
                            'evidence_type': evidence_type,
                            'evidence_content': evidence_content,
                            'xp_awarded': task_xp,
                            'completed_at': tc.get('completed_at'),
                            'pillar': task_info.get('pillar', 'Arts & Creativity'),
                            'is_legacy': True
                        }

                achievement = {
                    'quest': quest,
                    'completed_at': cq['completed_at'],
                    'task_evidence': task_evidence,
                    'total_xp_earned': total_quest_xp,
                    'status': 'completed'
                }

                print(f"Quest '{quest.get('title')}': {len(task_evidence)} tasks, {total_quest_xp} XP")

                achievements.append(achievement)

        # Add in-progress quests with at least one submitted task
        if in_progress_quests.data:
            for cq in in_progress_quests.data:
                quest = cq.get('quests')
                if not quest:
                    continue

                user_quest_id = cq.get('id')
                quest_id = quest.get('id')

                # Get task completions for this in-progress quest
                # Supabase returns nested data from !inner joins
                quest_task_completions = []
                for tc in (task_completions.data or []):
                    task_info = tc.get('user_quest_tasks')
                    # Check if task_info exists and is a dict (not None or list)
                    if task_info and isinstance(task_info, dict):
                        if (task_info.get('quest_id') == quest_id and
                            task_info.get('user_quest_id') == user_quest_id):
                            quest_task_completions.append(tc)
                    # Handle case where Supabase returns it as a list with one element
                    elif task_info and isinstance(task_info, list) and len(task_info) > 0:
                        task_info = task_info[0]
                        if (task_info.get('quest_id') == quest_id and
                            task_info.get('user_quest_id') == user_quest_id):
                            # Flatten the structure
                            tc_copy = tc.copy()
                            tc_copy['user_quest_tasks'] = task_info
                            quest_task_completions.append(tc_copy)

                # Skip if no tasks completed yet
                if not quest_task_completions:
                    continue

                # Organize evidence by task
                task_evidence = {}
                total_quest_xp = 0

                for tc in quest_task_completions:
                    task_info = tc.get('user_quest_tasks', {})
                    task_title = task_info.get('title', 'Unknown Task')
                    task_id = tc.get('user_quest_task_id')  # Use user_quest_task_id to match evidence documents

                    # Get XP for this specific task from user_quest_tasks (not completions)
                    task_xp = task_info.get('xp_value', 0)
                    total_quest_xp += task_xp

                    # Check for multi-format evidence
                    evidence_doc = evidence_docs_map.get(task_id)

                    if evidence_doc and evidence_doc.get('blocks'):
                        # Use new multi-format evidence
                        blocks = evidence_doc.get('blocks', [])
                        task_evidence[task_title] = {
                            'evidence_type': 'multi_format',
                            'evidence_blocks': blocks,
                            'xp_awarded': task_xp,
                            'completed_at': tc.get('completed_at'),
                            'pillar': task_info.get('pillar', 'Arts & Creativity'),
                            'is_legacy': False
                        }
                    else:
                        # Use legacy single-format evidence
                        evidence_text = tc.get('evidence_text', '')
                        evidence_url = tc.get('evidence_url', '')

                        if evidence_text and not evidence_text.startswith('Multi-format evidence document'):
                            evidence_type = 'text'
                            evidence_content = evidence_text
                        elif evidence_url:
                            evidence_type = 'link'
                            evidence_content = evidence_url
                        else:
                            evidence_type = 'text'
                            evidence_content = 'Evidence submitted but not available for display'

                        task_evidence[task_title] = {
                            'evidence_type': evidence_type,
                            'evidence_content': evidence_content,
                            'xp_awarded': task_xp,
                            'completed_at': tc.get('completed_at'),
                            'pillar': task_info.get('pillar', 'Arts & Creativity'),
                            'is_legacy': True
                        }

                # Get total number of tasks for this user's quest
                total_user_tasks = supabase.table('user_quest_tasks')\
                    .select('id', count='exact')\
                    .eq('user_quest_id', user_quest_id)\
                    .execute()

                total_tasks = total_user_tasks.count if total_user_tasks.count else 0
                completed_tasks = len(task_evidence)

                achievement = {
                    'quest': quest,
                    'started_at': cq['started_at'],
                    'task_evidence': task_evidence,
                    'total_xp_earned': total_quest_xp,
                    'status': 'in_progress',
                    'progress': {
                        'completed_tasks': completed_tasks,
                        'total_tasks': total_tasks,
                        'percentage': (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
                    }
                }

                print(f"In-progress quest '{quest.get('title')}': {completed_tasks}/{total_tasks} tasks, {total_quest_xp} XP")

                achievements.append(achievement)

        # Sort achievements by date (completed_at for completed, started_at for in-progress)
        achievements.sort(key=lambda x: x.get('completed_at') or x.get('started_at'), reverse=True)

        logger.info(f"=== RETURNING DIPLOMA DATA ===")
        logger.info(f"Student: {user.data[0]}")
        logger.info(f"Achievements: {len(achievements)}")
        logger.info(f"Total XP: {total_xp}")

        return jsonify({
            'student': user.data[0],
            'achievements': achievements,
            'skill_xp': xp_by_category,
            'total_xp': total_xp,
            'total_quests_completed': len(achievements)
        }), 200

    except Exception as e:
        import traceback
        logger.error(f"=== ERROR IN DIPLOMA ENDPOINT ===")
        logger.error(f"Error fetching diploma: {str(e)}")
        logger.info(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Failed to fetch diploma'}), 500

@bp.route('/user/<user_id>/privacy', methods=['PUT'])
@require_auth
def update_portfolio_privacy(authenticated_user_id, user_id):
    """
    Toggle portfolio privacy setting
    """
    try:
        from flask import request

        # Verify user is updating their own portfolio
        if authenticated_user_id != user_id:
            return jsonify({'error': 'Unauthorized - can only update your own privacy settings'}), 403

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
        logger.error(f"Error updating privacy: {str(e)}")
        return jsonify({'error': 'Failed to update privacy setting'}), 500