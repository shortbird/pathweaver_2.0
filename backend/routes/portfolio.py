"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE - High Priority
- 812 lines with 30+ direct database calls
- Core feature (public diploma/portfolio pages)
- Complex queries for diploma data aggregation
- Could create DiplomaRepository with methods:
  - get_diploma_by_user_id(user_id)
  - get_diploma_by_slug(slug)
  - get_completed_quests_for_diploma(user_id)
  - get_earned_badges_for_diploma(user_id)
  - get_skill_xp_distribution(user_id)
  - get_evidence_samples(user_id, limit)
- Helper functions (parse_document_id_from_evidence_text, enhance_evidence_display_data)
  could move to utils or service layer
"""

from flask import Blueprint, jsonify
from flask_cors import cross_origin
from database import get_supabase_client, get_supabase_admin_client
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
from datetime import datetime
from utils.auth.decorators import require_auth
from utils.api_response_v1 import success_response, error_response

from utils.logger import get_logger
import re
from typing import Optional, List, Dict, Any

logger = get_logger(__name__)

bp = Blueprint('portfolio', __name__)


# Helper functions for evidence display enhancement
def parse_document_id_from_evidence_text(evidence_text: str) -> Optional[str]:
    """
    Extract document ID from multi-format evidence placeholder string.

    Args:
        evidence_text: Text from quest_task_completions.evidence_text

    Returns:
        Document UUID if found, None otherwise
    """
    if evidence_text and evidence_text.startswith('Multi-format evidence document'):
        match = re.search(r'Document ID: ([\w-]+)', evidence_text)
        if match:
            return match.group(1)
    return None


def fetch_evidence_blocks_by_document_id(
    supabase,
    document_id: str,
    filter_private: bool = True,
    viewer_user_id: str = None
) -> tuple[List[Dict[str, Any]], bool, str]:
    """
    Fetch evidence blocks directly by document ID.
    Used as fallback when task_id matching fails.

    Args:
        supabase: Supabase client
        document_id: UUID of user_task_evidence_documents record
        filter_private: If True, exclude private blocks
        viewer_user_id: User ID of the person viewing (None for public view)

    Returns:
        Tuple of (blocks list, is_confidential boolean, owner_user_id string)
    """
    try:
        query = supabase.table('user_task_evidence_documents').select('''
            id,
            user_id,
            is_confidential,
            evidence_document_blocks!inner (
                id, block_type, content, order_index, is_private
            )
        ''').eq('id', document_id)

        if filter_private:
            query = query.eq('evidence_document_blocks.is_private', False)

        result = query.execute()

        if result.data and len(result.data) > 0:
            doc = result.data[0]
            is_confidential = doc.get('is_confidential', False)
            owner_user_id = doc.get('user_id')

            blocks = doc.get('evidence_document_blocks', [])
            sorted_blocks = sorted(blocks, key=lambda b: b.get('order_index', 0))

            return sorted_blocks, is_confidential, owner_user_id

        logger.warning(f"No evidence blocks found for document ID: {document_id}")
        return [], False, None

    except Exception as e:
        logger.error(f"Error fetching evidence blocks for document {document_id}: {e}")
        return [], False, None

# Using repository pattern for database access
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
            return error_response(
                code='PORTFOLIO_NOT_FOUND',
                message='Portfolio not found or private',
                status=404
            )
        
        user_id = diploma.data[0]['user_id']
        
        # Get user's basic info (not sensitive data)
        # Try to select without username first, fallback to with username for backward compatibility
        try:
            user = supabase.table('users').select('first_name, last_name').eq('id', user_id).execute()
        except:
            # If that fails, the username column might still exist
            user = supabase.table('users').select('username, first_name, last_name').eq('id', user_id).execute()
        
        if not user.data:
            return error_response(
                code='USER_NOT_FOUND',
                message='User not found',
                status=404
            )
        
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
        
        return success_response(
            data={
                'student': user.data[0],
                'diploma_issued': diploma.data[0]['issued_date'],
                'completed_quests': completed_quests.data,
                'skill_xp': skill_xp_data,
                'skill_details': skill_details.data,
                'total_quests_completed': total_quests,
                'total_xp': total_xp,
                'portfolio_url': f"https://optio.com/portfolio/{portfolio_slug}"
            }
        )
        
    except Exception as e:
        import traceback
        logger.error(f"Error fetching portfolio: {str(e)}")
        logger.info(f"Full traceback: {traceback.format_exc()}")
        return error_response(
            code='PORTFOLIO_ERROR',
            message='Failed to fetch portfolio',
            status=500
        )

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
@cross_origin(supports_credentials=True)
def get_public_diploma_by_user_id(user_id):
    """
    Public endpoint to view a student's diploma by user ID.
    This is the route called by the diploma page when viewing /diploma/:userId
    """
    try:
        logger.info(f"=== DIPLOMA ENDPOINT CALLED FOR USER: {user_id} ===")
        # Admin client: Public endpoint bypasses RLS (ADR-002, Rule 2)
        supabase = get_supabase_admin_client()

        # Get user's basic info (not sensitive data)
        user = supabase.table('users').select('id, first_name, last_name').eq('id', user_id).execute()
        logger.info(f"User query result - data: {user.data}")

        if not user.data or len(user.data) == 0:
            logger.error(f"ERROR: User not found for ID: {user_id}")
            return jsonify({'error': 'User not found'}), 404

        # FERPA: Check if portfolio is public or viewer is the owner
        from utils.session_manager import session_manager

        # Get diploma to check is_public
        diploma_check = supabase.table('diplomas').select('is_public').eq('user_id', user_id).execute()
        is_public = diploma_check.data[0]['is_public'] if diploma_check.data else False
        logger.info(f"[FERPA] Diploma check for {user_id}: is_public={is_public}, diploma_data={diploma_check.data}")

        # Try to get authenticated user to check if they're the owner
        # Uses session_manager which handles both cookies and Authorization header
        viewer_user_id = session_manager.get_current_user_id()
        logger.info(f"[FERPA] Viewer check: viewer_user_id={viewer_user_id}")

        # If not public and not the owner, deny access
        if not is_public and viewer_user_id != user_id:
            logger.info(f"[FERPA] Access DENIED: is_public={is_public}, viewer={viewer_user_id}, owner={user_id}")
            return jsonify({'error': 'Portfolio not found or private'}), 404

        logger.info(f"[FERPA] Access GRANTED: is_public={is_public}, viewer={viewer_user_id}, owner={user_id}")

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
        # Note: We filter private blocks AFTER retrieval to avoid excluding entire documents
        evidence_documents_response = supabase.table('user_task_evidence_documents').select(
            '''
            id,
            task_id,
            quest_id,
            user_id,
            status,
            completed_at,
            is_confidential,
            evidence_document_blocks (
                id,
                block_type,
                content,
                order_index,
                is_private
            )
            '''
        ).eq('user_id', user_id).eq('status', 'completed').execute()

        logger.debug(f"=== EVIDENCE DOCUMENTS DEBUG ===")
        logger.info(f"Found {len(evidence_documents_response.data) if evidence_documents_response.data else 0} evidence documents")
        if evidence_documents_response.data:
            for doc in evidence_documents_response.data:
                logger.info(f"Doc {doc.get('id')}: task_id={doc.get('task_id')}, blocks={len(doc.get('evidence_document_blocks', []))}")
        logger.info(f"================================")

        # Create a lookup map for quick evidence document access by task_id
        # Filter out private blocks for public viewing
        evidence_docs_map = {}
        if evidence_documents_response.data:
            for doc in evidence_documents_response.data:
                task_id = doc.get('task_id')
                if task_id:
                    # Filter out private blocks (only show public evidence on diploma)
                    all_blocks = doc.get('evidence_document_blocks', [])
                    public_blocks = [block for block in all_blocks if not block.get('is_private', False)]

                    # Only add document if it has public blocks
                    if public_blocks:
                        evidence_docs_map[task_id] = {
                            'document_id': doc.get('id'),
                            'blocks': public_blocks,
                            'completed_at': doc.get('completed_at'),
                            'is_confidential': doc.get('is_confidential', False),
                            'owner_user_id': doc.get('user_id')
                        }
                        logger.info(f"Mapped evidence doc for task {task_id}: {len(public_blocks)} public blocks (out of {len(all_blocks)} total)")

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

        # Get subject XP for diploma credits section
        subject_xp_response = supabase.table('user_subject_xp').select('school_subject, xp_amount').eq('user_id', user_id).execute()
        subject_xp_data = subject_xp_response.data or []

        # Build quest_id -> completions map once (O(m) instead of O(n*m) in loop)
        # This prevents Python-side filtering for each quest iteration
        # OPTIMIZATION: Also build user_quest_id -> completions map for in-progress quests
        completions_by_quest = {}
        completions_by_user_quest = {}
        for tc in (task_completions.data or []):
            task_info = tc.get('user_quest_tasks')
            quest_id = None
            user_quest_id = None

            # Extract quest_id and user_quest_id from task_info (handle both dict and list formats)
            if task_info and isinstance(task_info, dict):
                quest_id = task_info.get('quest_id')
                user_quest_id = task_info.get('user_quest_id')
            elif task_info and isinstance(task_info, list) and len(task_info) > 0:
                # Flatten list structure
                task_info_dict = task_info[0]
                quest_id = task_info_dict.get('quest_id')
                user_quest_id = task_info_dict.get('user_quest_id')
                # Flatten the structure for later use
                tc_copy = tc.copy()
                tc_copy['user_quest_tasks'] = task_info_dict
                tc = tc_copy

            if quest_id:
                if quest_id not in completions_by_quest:
                    completions_by_quest[quest_id] = []
                completions_by_quest[quest_id].append(tc)

            # OPTIMIZATION: Build separate map for user_quest_id lookups (in-progress quests)
            if user_quest_id:
                if user_quest_id not in completions_by_user_quest:
                    completions_by_user_quest[user_quest_id] = []
                completions_by_user_quest[user_quest_id].append(tc)

        # OPTIMIZATION: Pre-fetch task counts for all in-progress quests (prevents N+1 queries)
        task_counts_by_user_quest = {}
        if in_progress_quests.data:
            user_quest_ids = [cq.get('id') for cq in in_progress_quests.data if cq.get('id')]
            if user_quest_ids:
                # Fetch task counts for all user quests in one query
                task_counts_response = supabase.table('user_quest_tasks')\
                    .select('user_quest_id')\
                    .in_('user_quest_id', user_quest_ids)\
                    .execute()

                # Count tasks per user_quest_id
                for task in (task_counts_response.data or []):
                    uq_id = task.get('user_quest_id')
                    if uq_id:
                        task_counts_by_user_quest[uq_id] = task_counts_by_user_quest.get(uq_id, 0) + 1

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

                # Get task completions for this quest from pre-built map (O(1) lookup)
                # Note: We match by quest_id, not user_quest_id, because when users
                # restart quests they get a new user_quest_id but we want to show ALL
                # completions for this quest regardless of which enrollment they came from
                quest_task_completions = completions_by_quest.get(quest_id, [])

                # Organize evidence by task
                task_evidence = {}
                total_quest_xp = 0

                for tc in quest_task_completions:
                    task_info = tc.get('user_quest_tasks', {})
                    task_title = task_info.get('title', 'Unknown Task')
                    # FIX: Use task_id from quest_task_completions, which matches user_task_evidence_documents.task_id
                    task_id = tc.get('task_id')

                    logger.debug(f"Looking up evidence for task_id={task_id}, task_title='{task_title}', available keys: {list(evidence_docs_map.keys())[:5]}")
                    logger.info(f"Looking up evidence for task_id={task_id}, task_title='{task_title}'")

                    # Get XP for this specific task from user_quest_tasks (not completions)
                    task_xp = task_info.get('xp_value', 0)
                    total_quest_xp += task_xp

                    # Check for multi-format evidence using our lookup map
                    evidence_doc = evidence_docs_map.get(task_id)
                    logger.info(f"  Found evidence_doc: {evidence_doc is not None}, blocks: {len(evidence_doc.get('blocks', [])) if evidence_doc else 0}")

                    if evidence_doc and evidence_doc.get('blocks'):
                        # Use new multi-format evidence
                        blocks = evidence_doc.get('blocks', [])
                        is_confidential = evidence_doc.get('is_confidential', False)
                        owner_user_id = evidence_doc.get('owner_user_id')
                        logger.info(f"Task '{task_title}' has {len(blocks)} evidence blocks, confidential: {is_confidential}")

                        task_evidence[task_title] = {
                            'evidence_type': 'multi_format',
                            'evidence_blocks': blocks,
                            'xp_awarded': task_xp,
                            'completed_at': tc.get('completed_at'),
                            'pillar': task_info.get('pillar', 'Arts & Creativity'),
                            'is_legacy': False,
                            'is_confidential': is_confidential,
                            'owner_user_id': owner_user_id
                        }
                    else:
                        # Use legacy single-format evidence OR parse document ID fallback
                        evidence_text = tc.get('evidence_text', '')
                        evidence_url = tc.get('evidence_url', '')

                        # Check if evidence_text contains multi-format document reference
                        document_id = parse_document_id_from_evidence_text(evidence_text)

                        if document_id:
                            # Fallback: Fetch blocks directly by document ID
                            logger.info(f"Using document ID fallback for task '{task_title}': {document_id}")
                            blocks, is_confidential, owner_user_id = fetch_evidence_blocks_by_document_id(
                                supabase, document_id, filter_private=True, viewer_user_id=None
                            )

                            if blocks:
                                # Successfully fetched blocks - treat as multi_format
                                task_evidence[task_title] = {
                                    'evidence_type': 'multi_format',
                                    'evidence_blocks': blocks,
                                    'xp_awarded': task_xp,
                                    'completed_at': tc.get('completed_at'),
                                    'pillar': task_info.get('pillar', 'Arts & Creativity'),
                                    'is_legacy': False,
                                    'is_confidential': is_confidential,
                                    'owner_user_id': owner_user_id
                                }
                                continue  # Skip legacy fallback

                        # Standard legacy evidence handling
                        is_confidential = tc.get('is_confidential', False)

                        if evidence_text and not evidence_text.startswith('Multi-format evidence document'):
                            evidence_type = 'text'
                            evidence_content = evidence_text
                        elif evidence_url:
                            evidence_type = 'link'
                            evidence_content = evidence_url
                        else:
                            # No evidence available
                            evidence_type = 'text'
                            evidence_content = 'No evidence submitted for this task'

                        task_evidence[task_title] = {
                            'evidence_type': evidence_type,
                            'evidence_content': evidence_content,
                            'xp_awarded': task_xp,
                            'completed_at': tc.get('completed_at'),
                            'pillar': task_info.get('pillar', 'Arts & Creativity'),
                            'is_legacy': True,
                            'is_confidential': is_confidential,
                            'owner_user_id': user_id
                        }

                # Only add quest to achievements if it has evidence to display
                if task_evidence:
                    achievement = {
                        'quest': quest,
                        'completed_at': cq['completed_at'],
                        'task_evidence': task_evidence,
                        'total_xp_earned': total_quest_xp,
                        'status': 'completed'
                    }

                    logger.info(f"Quest '{quest.get('title')}': {len(task_evidence)} tasks, {total_quest_xp} XP")
                    achievements.append(achievement)
                else:
                    logger.info(f"Skipping quest '{quest.get('title')}' - no public evidence available")

        # Add in-progress quests with at least one submitted task
        if in_progress_quests.data:
            for cq in in_progress_quests.data:
                quest = cq.get('quests')
                if not quest:
                    continue

                user_quest_id = cq.get('id')
                quest_id = quest.get('id')

                # OPTIMIZATION: Use pre-built user_quest_id map instead of filtering (O(1) vs O(m))
                # This eliminates the nested list comprehension that was creating O(n*m) complexity
                quest_task_completions = completions_by_user_quest.get(user_quest_id, [])

                # Skip if no tasks completed yet
                if not quest_task_completions:
                    continue

                # Organize evidence by task
                task_evidence = {}
                total_quest_xp = 0

                for tc in quest_task_completions:
                    task_info = tc.get('user_quest_tasks', {})
                    task_title = task_info.get('title', 'Unknown Task')
                    # FIX: Use task_id from quest_task_completions, which matches user_task_evidence_documents.task_id
                    task_id = tc.get('task_id')

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

                # OPTIMIZATION: Use pre-fetched task count instead of N+1 query
                total_tasks = task_counts_by_user_quest.get(user_quest_id, 0)
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

                logger.info(f"In-progress quest '{quest.get('title')}': {completed_tasks}/{total_tasks} tasks, {total_quest_xp} XP")

                achievements.append(achievement)

        # Sort achievements by date (completed_at for completed, started_at for in-progress)
        achievements.sort(key=lambda x: x.get('completed_at') or x.get('started_at'), reverse=True)

        logger.info(f"=== RETURNING DIPLOMA DATA ===")
        logger.info(f"Student: {user.data[0]}")
        logger.info(f"Achievements: {len(achievements)}")
        logger.info(f"Total XP: {total_xp}")
        logger.info(f"Subject XP: {subject_xp_data}")

        return jsonify({
            'student': user.data[0],
            'achievements': achievements,
            'skill_xp': xp_by_category,
            'subject_xp': subject_xp_data,
            'total_xp': total_xp,
            'total_quests_completed': len(achievements)
        }), 200

    except Exception as e:
        import traceback
        logger.error(f"=== ERROR IN DIPLOMA ENDPOINT ===")
        logger.error(f"Error fetching diploma: {str(e)}")
        logger.info(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Failed to fetch diploma'}), 500


# =============================================================================
# FERPA COMPLIANCE: Privacy and Consent Management (Added 2026-01-02)
# =============================================================================

def check_is_minor(user_data: dict) -> bool:
    """
    Check if a user is considered a minor (under 18 OR is_dependent=true).
    Used for FERPA parental consent requirements.

    Args:
        user_data: Dict containing user fields (is_dependent, date_of_birth)

    Returns:
        True if user is a minor, False otherwise
    """
    # If marked as dependent, always considered a minor
    if user_data.get('is_dependent') is True:
        return True

    # Check date of birth
    dob = user_data.get('date_of_birth')
    if not dob:
        # No DOB means we can't verify age - assume not a minor
        # (they would have given consent at registration)
        return False

    try:
        from datetime import date
        if isinstance(dob, str):
            dob = datetime.strptime(dob.split('T')[0], '%Y-%m-%d').date()
        elif hasattr(dob, 'date'):
            dob = dob.date()

        age = (date.today() - dob).days / 365.25
        return age < 18
    except Exception as e:
        logger.warning(f"Error parsing date_of_birth: {e}")
        return False


@bp.route('/user/<user_id>/visibility-status', methods=['GET'])
@require_auth
def get_visibility_status(authenticated_user_id, user_id):
    """
    Get portfolio visibility status including consent and minor status.
    Used by frontend to determine what UI to show for privacy controls.

    Returns:
        is_public: Current visibility status
        consent_given: Whether user has explicitly consented to public
        consent_given_at: Timestamp of consent
        is_minor: Whether user is under 18 or is_dependent
        requires_parent_approval: Whether parent must approve public visibility
        pending_parent_approval: Whether a request is pending
        parent_approval_denied: Whether parent denied the request
        parent_info: Basic info about linked parent (if minor)
    """
    try:
        # Verify user is checking their own status
        if authenticated_user_id != user_id:
            return error_response(
                code='UNAUTHORIZED',
                message='Can only check your own visibility status',
                status=403
            )

        supabase = get_supabase_admin_client()

        # Get user info including minor status fields
        user_result = supabase.table('users').select(
            'id, date_of_birth, is_dependent, managed_by_parent_id, first_name'
        ).eq('id', user_id).execute()

        if not user_result.data:
            return error_response(
                code='USER_NOT_FOUND',
                message='User not found',
                status=404
            )

        user_data = user_result.data[0]
        is_minor = check_is_minor(user_data)

        # Get diploma info - try new columns first, fall back to basic
        try:
            diploma_result = supabase.table('diplomas').select(
                'is_public, public_consent_given, public_consent_given_at, '
                'pending_parent_approval, parent_approval_denied, parent_approval_denied_at'
            ).eq('user_id', user_id).execute()
            diploma_data = diploma_result.data[0] if diploma_result.data else {}
        except Exception as col_err:
            logger.warning(f"New FERPA columns may not exist yet, falling back: {col_err}")
            # Fall back to just is_public if new columns don't exist
            diploma_result = supabase.table('diplomas').select('is_public').eq('user_id', user_id).execute()
            diploma_data = diploma_result.data[0] if diploma_result.data else {}
            diploma_data['public_consent_given'] = diploma_data.get('is_public', False)
            diploma_data['pending_parent_approval'] = False
            diploma_data['parent_approval_denied'] = False

        # Get parent info if minor
        parent_info = None
        if is_minor:
            parent_id = user_data.get('managed_by_parent_id')
            if parent_id:
                parent_result = supabase.table('users').select(
                    'first_name, email'
                ).eq('id', parent_id).execute()
                if parent_result.data:
                    parent_info = {
                        'first_name': parent_result.data[0].get('first_name'),
                        'has_email': bool(parent_result.data[0].get('email'))
                    }
            else:
                # Check parent_student_links table
                link_result = supabase.table('parent_student_links').select(
                    'parent_user_id'
                ).eq('student_user_id', user_id).eq('status', 'approved').limit(1).execute()
                if link_result.data:
                    parent_link_id = link_result.data[0].get('parent_user_id')
                    if parent_link_id:
                        parent_result = supabase.table('users').select(
                            'first_name, email'
                        ).eq('id', parent_link_id).execute()
                        if parent_result.data:
                            parent_info = {
                                'first_name': parent_result.data[0].get('first_name'),
                                'has_email': bool(parent_result.data[0].get('email'))
                            }

        # Check for pending visibility request
        pending_request = None
        if is_minor and diploma_data.get('pending_parent_approval'):
            req_result = supabase.table('public_visibility_requests').select(
                'id, requested_at'
            ).eq('student_user_id', user_id).eq('status', 'pending').limit(1).execute()
            if req_result.data:
                pending_request = {
                    'id': req_result.data[0]['id'],
                    'requested_at': req_result.data[0]['requested_at']
                }

        return success_response({
            'is_public': diploma_data.get('is_public', False),
            'consent_given': diploma_data.get('public_consent_given', False),
            'consent_given_at': diploma_data.get('public_consent_given_at'),
            'is_minor': is_minor,
            'requires_parent_approval': is_minor,
            'pending_parent_approval': diploma_data.get('pending_parent_approval', False),
            'pending_request': pending_request,
            'parent_approval_denied': diploma_data.get('parent_approval_denied', False),
            'parent_approval_denied_at': diploma_data.get('parent_approval_denied_at'),
            'parent_info': parent_info,
            'can_make_public': not is_minor or parent_info is not None
        })

    except Exception as e:
        import traceback
        logger.error(f"Error fetching visibility status: {str(e)}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return error_response(
            code='VISIBILITY_STATUS_ERROR',
            message=f'Failed to fetch visibility status: {str(e)}',
            status=500
        )


@bp.route('/user/<user_id>/privacy', methods=['PUT'])
@require_auth
def update_portfolio_privacy(authenticated_user_id, user_id):
    """
    Toggle portfolio privacy setting with FERPA-compliant consent flow.

    For making public:
    - Requires consent_acknowledged=true in request body
    - Minors (under 18 or is_dependent) require parent approval
    - Adults can consent directly

    For making private:
    - Always immediate, no restrictions

    Request body:
        is_public: boolean - desired visibility
        consent_acknowledged: boolean - user acknowledges public means visible to anyone

    Returns:
        For adults making public: immediate success
        For minors making public: creates parent approval request, returns pending status
        For anyone making private: immediate success
    """
    try:
        from flask import request
        from datetime import date

        # Verify user is updating their own portfolio
        if authenticated_user_id != user_id:
            return error_response(
                code='UNAUTHORIZED',
                message='Can only update your own privacy settings',
                status=403
            )

        supabase = get_supabase_admin_client()
        data = request.json or {}
        is_public = data.get('is_public', False)
        consent_acknowledged = data.get('consent_acknowledged', False)

        # Get user info to check if minor
        user_result = supabase.table('users').select(
            'id, date_of_birth, is_dependent, managed_by_parent_id, first_name, email'
        ).eq('id', user_id).execute()

        if not user_result.data:
            return error_response(
                code='USER_NOT_FOUND',
                message='User not found',
                status=404
            )

        user_data = user_result.data[0]
        is_minor_user = check_is_minor(user_data)

        # MAKING PRIVATE - always allowed immediately
        if not is_public:
            # Try to update with new columns, fall back to just is_public
            try:
                result = supabase.table('diplomas').update({
                    'is_public': False,
                    'pending_parent_approval': False
                }).eq('user_id', user_id).execute()
            except Exception:
                # Fall back if pending_parent_approval column doesn't exist
                result = supabase.table('diplomas').update({
                    'is_public': False
                }).eq('user_id', user_id).execute()

            # Cancel any pending visibility requests (if table exists)
            try:
                supabase.table('public_visibility_requests').update({
                    'status': 'denied',
                    'responded_at': datetime.utcnow().isoformat(),
                    'denial_reason': 'User made portfolio private'
                }).eq('student_user_id', user_id).eq('status', 'pending').execute()
            except Exception as e:
                logger.warning(f"Could not cancel visibility requests (table may not exist): {e}")

            return success_response({
                'message': 'Portfolio is now private',
                'is_public': False
            })

        # MAKING PUBLIC - requires consent and may require parent approval

        # Require consent acknowledgment
        if not consent_acknowledged:
            return error_response(
                code='CONSENT_REQUIRED',
                message='Must acknowledge consent to make portfolio public. '
                        'Set consent_acknowledged=true to confirm you understand '
                        'your educational records will be publicly accessible.',
                status=400
            )

        # Check if minor
        if is_minor_user:
            # Find parent
            parent_id = user_data.get('managed_by_parent_id')
            if not parent_id:
                # Check parent_student_links
                link_result = supabase.table('parent_student_links').select(
                    'parent_user_id'
                ).eq('student_user_id', user_id).eq('status', 'approved').limit(1).execute()
                if link_result.data:
                    parent_id = link_result.data[0]['parent_user_id']

            if not parent_id:
                return error_response(
                    code='PARENT_REQUIRED',
                    message='Users under 18 must have a linked parent or guardian '
                            'to make their portfolio public. Please link a parent first.',
                    status=400
                )

            # Try the full minor approval flow (requires migration)
            try:
                # Check if already has a pending request
                existing_request = supabase.table('public_visibility_requests').select(
                    'id'
                ).eq('student_user_id', user_id).eq('status', 'pending').execute()

                if existing_request.data:
                    return error_response(
                        code='REQUEST_PENDING',
                        message='A request for parent approval is already pending.',
                        status=400
                    )

                # Check if recently denied (within 30 days)
                diploma_result = supabase.table('diplomas').select(
                    'parent_approval_denied, parent_approval_denied_at'
                ).eq('user_id', user_id).execute()

                if diploma_result.data:
                    diploma = diploma_result.data[0]
                    if diploma.get('parent_approval_denied') and diploma.get('parent_approval_denied_at'):
                        denied_at = datetime.fromisoformat(
                            diploma['parent_approval_denied_at'].replace('Z', '+00:00')
                        )
                        days_since = (datetime.now(denied_at.tzinfo) - denied_at).days
                        if days_since < 30:
                            return error_response(
                                code='REQUEST_DENIED_RECENTLY',
                                message=f'Your parent denied this request {days_since} days ago. '
                                        f'You can request again in {30 - days_since} days.',
                                status=400
                            )

                # Create parent approval request
                supabase.table('public_visibility_requests').insert({
                    'student_user_id': user_id,
                    'parent_user_id': parent_id,
                    'status': 'pending',
                    'requested_at': datetime.utcnow().isoformat()
                }).execute()

                # Update diploma to show pending
                supabase.table('diplomas').update({
                    'pending_parent_approval': True,
                    'parent_approval_denied': False,
                    'parent_approval_denied_at': None
                }).eq('user_id', user_id).execute()

                # Get student and parent info for notification and response
                student_result = supabase.table('users').select(
                    'first_name, organization_id'
                ).eq('id', user_id).execute()
                student_name = student_result.data[0]['first_name'] if student_result.data else 'Your child'
                org_id = student_result.data[0].get('organization_id') if student_result.data else None

                parent_result = supabase.table('users').select(
                    'first_name'
                ).eq('id', parent_id).execute()
                parent_name = parent_result.data[0]['first_name'] if parent_result.data else 'your parent'

                # Send notification to parent
                try:
                    from services.notification_service import NotificationService
                    notification_service = NotificationService()
                    notification_service.notify_parent_approval_required(
                        parent_user_id=parent_id,
                        student_name=student_name,
                        student_id=user_id,
                        organization_id=org_id
                    )
                    logger.info(f"[FERPA] Sent parent approval notification to {parent_id} for student {user_id}")
                except Exception as notif_err:
                    logger.warning(f"Failed to send parent notification: {notif_err}")

                return success_response({
                    'message': f'Request sent to {parent_name} for approval',
                    'is_public': False,
                    'pending_parent_approval': True,
                    'parent_name': parent_name
                })
            except Exception as minor_err:
                logger.error(f"Minor approval flow failed (migration may not be applied): {minor_err}")
                return error_response(
                    code='MIGRATION_REQUIRED',
                    message='The FERPA compliance migration needs to be applied. '
                            'Please run backend/migrations/20260102_ferpa_private_by_default.sql',
                    status=500
                )

        # NOT A MINOR - can consent directly
        try:
            result = supabase.table('diplomas').update({
                'is_public': True,
                'public_consent_given': True,
                'public_consent_given_at': datetime.utcnow().isoformat(),
                'public_consent_given_by': user_id,
                'pending_parent_approval': False,
                'parent_approval_denied': False
            }).eq('user_id', user_id).execute()
        except Exception:
            # Fall back if new columns don't exist
            result = supabase.table('diplomas').update({
                'is_public': True
            }).eq('user_id', user_id).execute()

        if result.data:
            logger.info(f"[FERPA] User {user_id} consented to public portfolio")
            return success_response({
                'message': 'Portfolio is now public',
                'is_public': True,
                'consent_given': True
            })
        else:
            return error_response(
                code='UPDATE_FAILED',
                message='Failed to update privacy setting',
                status=400
            )

    except Exception as e:
        logger.error(f"Error updating privacy: {str(e)}")
        return error_response(
            code='PRIVACY_UPDATE_ERROR',
            message='Failed to update privacy setting',
            status=500
        )