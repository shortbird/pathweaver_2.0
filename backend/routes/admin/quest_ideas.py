"""
Admin Quest Ideas Management Routes

Handles quest idea submissions, approval workflow, and conversion to actual quests.
Includes AI-powered quest generation and manual quest creation from ideas.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from backend.repositories import (
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
from utils.auth.decorators import require_admin
from services.image_service import search_quest_image
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_quest_ideas', __name__, url_prefix='/api/admin')

# Lazy loading for AI service to save memory
_quest_ai_service = None

def get_quest_ai_service():
    """Get quest AI service with lazy initialization"""
    global _quest_ai_service
    if _quest_ai_service is None:
        from services.quest_ai_service import QuestAIService
        _quest_ai_service = QuestAIService()
    return _quest_ai_service

# Using repository pattern for database access
@bp.route('/quest-ideas', methods=['GET'])
@require_admin
def list_quest_ideas(user_id):
    """Get all quest ideas for admin review"""
    try:
        supabase = get_supabase_admin_client()

        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 100)
        status_filter = request.args.get('status', 'all')  # all, pending_review, approved, rejected

        # Map frontend status names to database status values
        status_mapping = {
            'pending': 'pending_review',
            'pending_review': 'pending_review',
            'approved': 'approved',
            'rejected': 'rejected'
        }

        offset = (page - 1) * per_page

        # Build query - we'll get user info separately since there's no foreign key relationship
        query = supabase.table('quest_ideas')\
            .select('*', count='exact')\
            .order('created_at', desc=True)

        # Apply status filter
        if status_filter != 'all':
            db_status = status_mapping.get(status_filter, status_filter)
            query = query.eq('status', db_status)

        # Apply pagination
        query = query.range(offset, offset + per_page - 1)

        result = query.execute()

        # Enrich quest ideas with user information
        quest_ideas_with_users = []
        if result.data:
            for idea in result.data:
                # Get user information for each quest idea
                try:
                    user_response = supabase.table('users')\
                        .select('first_name, last_name')\
                        .eq('id', idea['user_id'])\
                        .single().execute()

                    if user_response.data:
                        idea['users'] = user_response.data
                    else:
                        idea['users'] = {'first_name': 'Unknown', 'last_name': 'User'}
                except:
                    idea['users'] = {'first_name': 'Unknown', 'last_name': 'User'}

                # Normalize status for frontend - map database values to frontend values
                if idea['status'] == 'pending_review':
                    idea['status'] = 'pending'

                quest_ideas_with_users.append(idea)

        return jsonify({
            'success': True,
            'quest_ideas': quest_ideas_with_users,
            'total': result.count,
            'page': page,
            'per_page': per_page,
            'total_pages': (result.count + per_page - 1) // per_page if result.count else 0
        })

    except Exception as e:
        logger.error(f"Error listing quest ideas: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch quest ideas'
        }), 500

@bp.route('/quest-ideas/<idea_id>/approve', methods=['PUT'])
@require_admin
def approve_quest_idea(user_id, idea_id):
    """Approve a quest idea"""
    try:
        supabase = get_supabase_admin_client()
        data = request.get_json()
        approved_quest_id = data.get('approved_quest_id', None)

        # Update the quest idea status
        update_data = {
            'status': 'approved'
        }

        # Note: approved_quest_id column doesn't exist in quest_ideas table
        # We'll track the relationship differently or add the column later if needed

        result = supabase.table('quest_ideas').update(update_data).eq('id', idea_id).execute()

        if not result.data:
            return jsonify({'error': 'Quest idea not found'}), 404

        return jsonify({
            'success': True,
            'message': 'Quest idea approved successfully',
            'quest_idea': result.data[0]
        })

    except Exception as e:
        logger.error(f"Error approving quest idea: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to approve quest idea'
        }), 500

@bp.route('/quest-ideas/<idea_id>/reject', methods=['PUT'])
@require_admin
def reject_quest_idea(user_id, idea_id):
    """Reject a quest idea"""
    try:
        supabase = get_supabase_admin_client()
        data = request.get_json()

        # Update the quest idea status
        update_data = {
            'status': 'rejected'
        }

        logger.info(f"Attempting to reject quest idea {idea_id} with data: {update_data}")
        result = supabase.table('quest_ideas').update(update_data).eq('id', idea_id).execute()

        logger.info(f"Supabase response for reject: {result}")

        if not result.data:
            logger.info(f"No data returned from reject update. Full result: {result}")
            return jsonify({'error': 'Quest idea not found or update failed'}), 404

        return jsonify({
            'success': True,
            'message': 'Quest idea rejected',
            'quest_idea': result.data[0]
        })

    except Exception as e:
        logger.error(f"Error rejecting quest idea: {str(e)}")
        logger.error(f"Error type: {type(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Failed to reject quest idea: {str(e)}'
        }), 500

@bp.route('/quest-ideas/<idea_id>/generate-quest', methods=['POST'])
@require_admin
def generate_quest_from_idea(user_id, idea_id):
    """Generate a complete quest from an approved quest idea using AI"""
    try:
        supabase = get_supabase_admin_client()

        # Get the quest idea
        idea_response = supabase.table('quest_ideas').select('*').eq('id', idea_id).single().execute()

        if not idea_response.data:
            return jsonify({'error': 'Quest idea not found'}), 404

        idea = idea_response.data

        # Check if quest idea is approved
        if idea['status'] != 'approved':
            return jsonify({'error': 'Quest idea must be approved before generating quest'}), 400

        # Use AI service to generate quest
        ai_service = get_quest_ai_service()

        # Generate quest from the idea
        result = ai_service.generate_quest_from_topic(
            topic=idea['title'],
            learning_objectives=idea['description']
        )

        if not result['success']:
            return jsonify({
                'success': False,
                'error': f'AI generation failed: {result["error"]}'
            }), 500

        generated_quest = result['quest']

        # Auto-fetch image for AI-generated quest
        image_url = search_quest_image(generated_quest['title'])
        print(f"Auto-fetched image for AI quest '{generated_quest['title']}': {image_url}")

        # Create the quest in the database using the existing create quest endpoint logic
        quest_data = {
            'title': generated_quest['title'],
            'big_idea': generated_quest.get('big_idea', generated_quest.get('description', '')),
            'source': 'custom',
            'is_active': True,
            'image_url': image_url,
            'header_image_url': image_url,
            'created_at': datetime.utcnow().isoformat()
        }

        # Insert quest
        quest_response = supabase.table('quests').insert(quest_data).execute()

        if not quest_response.data:
            return jsonify({'error': 'Failed to create quest in database'}), 500

        quest = quest_response.data[0]
        quest_id = quest['id']

        # Create tasks from generated quest
        tasks = generated_quest.get('tasks', [])
        if tasks:
            task_records = []
            for idx, task in enumerate(tasks):
                task_record = {
                    'quest_id': quest_id,
                    'title': task['title'],
                    'description': task.get('description', ''),
                    'pillar': task.get('pillar', 'critical_thinking'),
                    'xp_amount': task.get('xp_amount', 100),
                    'order_index': idx,
                    'is_required': task.get('is_required', True),
                    'created_at': datetime.utcnow().isoformat()
                }
                task_records.append(task_record)

            # Insert tasks
            tasks_response = supabase.table('quest_tasks').insert(task_records).execute()

            if not tasks_response.data:
                # Rollback quest creation if tasks fail
                supabase.table('quests').delete().eq('id', quest_id).execute()
                return jsonify({'error': 'Failed to create quest tasks'}), 500

            quest['quest_tasks'] = tasks_response.data

        # Update quest idea to mark it as converted to quest
        supabase.table('quest_ideas').update({
            'approved_quest_id': quest_id,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', idea_id).execute()

        return jsonify({
            'success': True,
            'message': 'Quest generated successfully from idea',
            'quest': quest
        }), 201

    except Exception as e:
        logger.error(f"Error generating quest from idea: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Failed to generate quest from idea'
        }), 500

@bp.route('/quest-ideas/<idea_id>/create-quest-manual', methods=['POST'])
@require_admin
def create_quest_from_idea_manual(user_id, idea_id):
    """Create a basic quest structure from a quest idea for manual completion"""
    try:
        supabase = get_supabase_admin_client()

        # Get the quest idea
        idea_response = supabase.table('quest_ideas').select('*').eq('id', idea_id).single().execute()

        if not idea_response.data:
            return jsonify({'error': 'Quest idea not found'}), 404

        idea = idea_response.data

        # Check if quest idea is approved
        if idea['status'] != 'approved':
            return jsonify({'error': 'Quest idea must be approved before creating quest'}), 400

        # Auto-fetch image for manual quest creation
        image_url = search_quest_image(idea['title'])
        print(f"Auto-fetched image for manual quest '{idea['title']}': {image_url}")

        # Create basic quest structure
        quest_data = {
            'title': idea['title'],
            'big_idea': idea['description'],
            'source': 'custom',
            'is_active': False,  # Set as inactive so admin can complete it
            'image_url': image_url,
            'header_image_url': image_url,
            'created_at': datetime.utcnow().isoformat()
        }

        # Insert quest
        quest_response = supabase.table('quests').insert(quest_data).execute()

        if not quest_response.data:
            return jsonify({'error': 'Failed to create quest in database'}), 500

        quest = quest_response.data[0]
        quest_id = quest['id']

        # Create a basic task structure for the admin to complete
        basic_task = {
            'quest_id': quest_id,
            'title': f'Complete {idea["title"]}',
            'description': f'Based on: {idea["description"]}',
            'pillar': 'critical_thinking',  # Default pillar
            'xp_amount': 100,  # Default XP
            'order_index': 0,
            'is_required': True,
            'created_at': datetime.utcnow().isoformat()
        }

        # Insert basic task
        task_response = supabase.table('quest_tasks').insert(basic_task).execute()

        if not task_response.data:
            # Rollback quest creation if task fails
            supabase.table('quests').delete().eq('id', quest_id).execute()
            return jsonify({'error': 'Failed to create basic quest task'}), 500

        quest['quest_tasks'] = task_response.data

        # Update quest idea to mark it as converted to quest
        supabase.table('quest_ideas').update({
            'approved_quest_id': quest_id,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', idea_id).execute()

        return jsonify({
            'success': True,
            'message': 'Basic quest created successfully. Please edit it to add proper tasks and details.',
            'quest': quest,
            'redirect_to_edit': True
        }), 201

    except Exception as e:
        logger.error(f"Error creating manual quest from idea: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Failed to create quest from idea'
        }), 500