"""Quest create/update/delete + bulk ops + school subjects.

Split from routes/admin/quest_management.py on 2026-04-14 (Q1).
"""

"""
Admin Quest Management Routes

Handles CRUD operations for quests including creation, editing, deletion,
and quest validation functionality.

REPOSITORY MIGRATION: PARTIALLY COMPLETE
- Uses QuestRepository for search and bulk operations
- Image management uses service layer (correct pattern)
- Complex CRUD operations remain in routes for readability
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from repositories import (
    UserRepository,
    QuestRepository,
    EvidenceRepository,
    ParentRepository,
    TutorRepository,
    AnalyticsRepository
)
from utils.auth.decorators import require_admin, require_advisor, get_advisor_assigned_students
from utils.pillar_utils import is_valid_pillar
from utils.pillar_utils import normalize_pillar_name
from utils.school_subjects import validate_school_subjects, normalize_subject_key
from services.image_service import search_quest_image
from services.api_usage_tracker import pexels_tracker
from datetime import datetime, timedelta
import json
import uuid

from utils.logger import get_logger

logger = get_logger(__name__)



from routes.admin.quest_management import bp


@bp.route('/quests/school-subjects', methods=['GET'])
def get_school_subjects_v3():
    """
    Get all available school subjects for task creation.
    Public endpoint - no auth required for getting subject list.
    """
    try:
        from utils.school_subjects import get_all_subjects_with_info
        subjects = get_all_subjects_with_info()

        return jsonify({
            'success': True,
            'school_subjects': subjects
        })

    except Exception as e:
        logger.error(f"Error getting school subjects: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch school subjects'
        }), 500

# Using repository pattern for database access
@bp.route('/quests/create', methods=['POST'])
@bp.route('/quests/create-v3', methods=['POST'])  # Legacy alias
@require_advisor
def create_quest_v3_clean(user_id):
    """
    Create a new Optio quest (title + idea only).
    Tasks are now created individually per student by advisors or AI.
    Advisors create unpublished drafts; admins can publish immediately.
    """
    logger.info(f"CREATE OPTIO QUEST: user_id={user_id}")
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()

    try:
        data = request.json
        logger.info(f"Received quest data: {json.dumps(data, indent=2)}")

        # Validate required fields
        if not data.get('title'):
            return jsonify({'success': False, 'error': 'Title is required'}), 400

        # Get user role to determine default is_active and is_public values
        user = supabase.table('users').select('role').eq('id', user_id).execute()
        user_role = user.data[0].get('role') if user.data else 'advisor'

        # Auto-fetch image if not provided
        image_url = data.get('header_image_url')
        if not image_url:
            # Try to fetch image based on quest title and description (AI-enhanced)
            quest_desc = data.get('big_idea', '').strip() or data.get('description', '').strip()
            image_url = search_quest_image(data['title'].strip(), quest_desc)
            logger.info(f"Auto-fetched image for quest '{data['title']}': {image_url}")

        # Determine is_active and is_public values based on role
        # Admins can set is_active=True and is_public=True (publish immediately)
        # Advisors create active but private quests (can invite students, but not in public library)
        if user_role == 'superadmin':
            is_active = data.get('is_active', False)
            is_public = data.get('is_public', False)
        else:
            is_active = True   # Advisors create active quests (can be enrolled via invitation)
            is_public = False  # But not public (won't appear in public quest library)

        # Check for organization_id (org-specific quest)
        organization_id = data.get('organization_id')
        quest_type = data.get('quest_type', 'optio')  # Default to 'optio', can also be 'course'

        # Validate quest_type
        valid_quest_types = ['optio', 'course']
        if quest_type not in valid_quest_types:
            return jsonify({'success': False, 'error': f'quest_type must be one of: {", ".join(valid_quest_types)}'}), 400

        # If organization_id is provided, verify user has access to that org
        if organization_id:
            # Check if user is superadmin or belongs to the org
            user_data = supabase.table('users').select('role, organization_id').eq('id', user_id).single().execute()
            if user_data.data:
                if user_data.data.get('role') != 'superadmin' and user_data.data.get('organization_id') != organization_id:
                    return jsonify({'success': False, 'error': 'Access denied: cannot create quests for other organizations'}), 403
            # Org quests are not public (only visible within the org)
            is_public = False

        # Create quest record
        quest_data = {
            'title': data['title'].strip(),
            'big_idea': data.get('big_idea', '').strip() or data.get('description', '').strip(),
            'description': data.get('big_idea', '').strip() or data.get('description', '').strip(),
            'is_v3': True,
            'is_active': is_active,
            'is_public': is_public,  # NEW: Control public visibility
            'quest_type': quest_type,  # 'optio' or 'course'
            'header_image_url': image_url,
            'image_url': image_url,  # Add to new image_url column
            'material_link': data.get('material_link', '').strip() if data.get('material_link') else None,
            'created_by': user_id,  # Track who created the quest
            'created_at': datetime.utcnow().isoformat(),
            'organization_id': organization_id  # Will be None for global quests
        }

        # Insert quest
        quest_result = supabase.table('quests').insert(quest_data).execute()

        if not quest_result.data:
            return jsonify({'success': False, 'error': 'Failed to create quest'}), 500

        quest_id = quest_result.data[0]['id']
        logger.info(f"Successfully created quest {quest_id}: {quest_data['title']}")

        # Generate topics if quest is created as public
        if is_public:
            try:
                from services.topic_generation_service import get_topic_generation_service
                topic_service = get_topic_generation_service()
                topic_result = topic_service.generate_topics(
                    quest_data['title'],
                    quest_data.get('big_idea') or quest_data.get('description', '')
                )
                supabase.table('quests').update({
                    'topic_primary': topic_result['primary'],
                    'topics': topic_result['topics']
                }).eq('id', quest_id).execute()
                logger.info(f"Generated topics for new public quest {quest_id}: {topic_result['primary']} - {topic_result['topics']}")
            except Exception as topic_err:
                logger.warning(f"Failed to generate topics for quest {quest_id}: {topic_err}")

        # Generate starter path approaches in background
        try:
            from utils.background_tasks import generate_approaches_background
            generate_approaches_background(
                quest_id=quest_id,
                quest_title=quest_data['title'],
                quest_description=quest_data.get('big_idea') or quest_data.get('description', '')
            )
            logger.info(f"Triggered background approach generation for quest {quest_id}")
        except Exception as bg_err:
            # Don't fail quest creation if background task fails
            logger.warning(f"Failed to trigger background approach generation: {bg_err}")

        return jsonify({
            'success': True,
            'message': 'Quest created successfully. Tasks can now be added per student.',
            'quest_id': quest_id,
            'quest': quest_result.data[0]
        })

    except Exception as e:
        logger.error(f"Error creating quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to create quest: {str(e)}'
        }), 500


@bp.route('/quests/bulk-delete', methods=['POST'])
@require_admin
def bulk_delete_quests(user_id):
    """
    Delete multiple quests at once (superadmin only).

    Request body:
    {
        "quest_ids": ["id1", "id2", ...]
    }
    """
    try:
        data = request.json
        quest_ids = data.get('quest_ids', [])

        if not quest_ids:
            return jsonify({'success': False, 'error': 'No quest IDs provided'}), 400

        if len(quest_ids) > 100:
            return jsonify({'success': False, 'error': 'Cannot delete more than 100 quests at once'}), 400

        # Verify user is superadmin
        user_repo = UserRepository()
        if not user_repo.is_superadmin(user_id):
            return jsonify({'success': False, 'error': 'Only superadmin can bulk delete quests'}), 403

        quest_repo = QuestRepository()
        result = quest_repo.bulk_delete_quests(quest_ids, user_id)

        return jsonify({
            'success': True,
            'message': f'Deleted {result["deleted_count"]} quests',
            'deleted_count': result['deleted_count'],
            'failed': result['failed']
        })

    except Exception as e:
        logger.error(f"Error in bulk delete: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to delete quests: {str(e)}'
        }), 500


@bp.route('/quests/bulk-update', methods=['POST'])
@require_admin
def bulk_update_quests(user_id):
    """
    Update multiple quests at once (superadmin only).

    Request body:
    {
        "quest_ids": ["id1", "id2", ...],
        "updates": {
            "is_active": true/false,
            "is_public": true/false
        }
    }
    """
    try:
        data = request.json
        quest_ids = data.get('quest_ids', [])
        updates = data.get('updates', {})

        if not quest_ids:
            return jsonify({'success': False, 'error': 'No quest IDs provided'}), 400

        if not updates:
            return jsonify({'success': False, 'error': 'No updates provided'}), 400

        if len(quest_ids) > 100:
            return jsonify({'success': False, 'error': 'Cannot update more than 100 quests at once'}), 400

        # Verify user is superadmin
        user_repo = UserRepository()
        if not user_repo.is_superadmin(user_id):
            return jsonify({'success': False, 'error': 'Only superadmin can bulk update quests'}), 403

        # Validate updates - only allow is_active and is_public
        allowed_fields = {'is_active', 'is_public'}
        update_data = {k: v for k, v in updates.items() if k in allowed_fields}

        if not update_data:
            return jsonify({'success': False, 'error': 'No valid update fields provided'}), 400

        quest_repo = QuestRepository()
        result = quest_repo.bulk_update_quests(quest_ids, update_data, user_id)

        return jsonify({
            'success': True,
            'message': f'Updated {result["updated_count"]} quests',
            'updated_count': result['updated_count'],
            'failed': result['failed']
        })

    except Exception as e:
        logger.error(f"Error in bulk update: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to update quests: {str(e)}'
        }), 500


@bp.route('/quests/<quest_id>', methods=['PUT'])
@require_advisor
def update_quest(user_id, quest_id):
    """
    Update an existing quest.
    Advisors can only edit their own unpublished quests.
    Org admins can edit and toggle is_active for their organization's quests.
    Superadmins can edit any quest and toggle is_active.
    """
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        # Validate quest exists and get ownership info
        quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        # Get user role and organization
        user = supabase.table('users').select('role, organization_id, org_role').eq('id', user_id).execute()
        user_data = user.data[0] if user.data else {}
        user_role = user_data.get('role', 'advisor')
        user_org_id = user_data.get('organization_id')
        user_org_role = user_data.get('org_role')

        # Determine effective role for permissions
        is_superadmin = user_role == 'superadmin'
        is_org_admin = user_role == 'org_managed' and user_org_role == 'org_admin'
        quest_org_id = quest.data.get('organization_id')

        # Check if user can edit this quest
        can_edit = False
        can_toggle_active = False

        if is_superadmin:
            can_edit = True
            can_toggle_active = True
        elif is_org_admin and quest_org_id and quest_org_id == user_org_id:
            # Org admins can edit their organization's quests
            can_edit = True
            can_toggle_active = True
        elif user_role == 'advisor' or (user_role == 'org_managed' and user_org_role == 'advisor'):
            # Advisors can only edit their own unpublished quests
            if quest.data.get('created_by') == user_id and not quest.data.get('is_active'):
                can_edit = True

        if not can_edit:
            return jsonify({'success': False, 'error': 'Not authorized to edit this quest'}), 403

        # Update quest data
        update_data = {}
        if 'title' in data:
            update_data['title'] = data['title'].strip()

        # Handle both 'big_idea' and 'description' fields (frontend sends big_idea, backend uses both)
        if 'big_idea' in data or 'description' in data:
            quest_desc = data.get('big_idea', '').strip() or data.get('description', '').strip()
            update_data['big_idea'] = quest_desc
            update_data['description'] = quest_desc  # Keep both fields in sync

        if 'header_image_url' in data:
            update_data['header_image_url'] = data['header_image_url']

        if 'material_link' in data:
            update_data['material_link'] = data['material_link'].strip() if data['material_link'] else None

        # Admins and org admins can change is_active (publish/unpublish quests)
        if 'is_active' in data:
            if can_toggle_active:
                # Validate course quests have preset tasks before activation
                if data['is_active']:
                    from utils.quest_validation import can_activate_quest
                    can_activate, error_msg = can_activate_quest(quest_id)
                    if not can_activate:
                        return jsonify({'success': False, 'error': error_msg}), 400

                update_data['is_active'] = data['is_active']
            # Silently ignore is_active changes from advisors

        # Only superadmins can change is_public (make quests available in public quest library)
        if 'is_public' in data:
            if is_superadmin:
                # Validate course quests have preset tasks before making public
                if data['is_public']:
                    from utils.quest_validation import can_make_public
                    can_make_public_result, error_msg = can_make_public(quest_id)
                    if not can_make_public_result:
                        return jsonify({'success': False, 'error': error_msg}), 400

                    # Generate topics when quest is first made public (if not already set)
                    if not quest.data.get('is_public') and (not quest.data.get('topic_primary') or not quest.data.get('topics')):
                        try:
                            from services.topic_generation_service import get_topic_generation_service
                            topic_service = get_topic_generation_service()
                            topic_result = topic_service.generate_topics(
                                quest.data.get('title', ''),
                                quest.data.get('big_idea') or quest.data.get('description', '')
                            )
                            update_data['topic_primary'] = topic_result['primary']
                            update_data['topics'] = topic_result['topics']
                            logger.info(f"Generated topics for quest {quest_id}: {topic_result['primary']} - {topic_result['topics']}")
                        except Exception as topic_err:
                            logger.warning(f"Failed to generate topics for quest {quest_id}: {topic_err}")
                            # Don't block publish, just log the error

                update_data['is_public'] = data['is_public']
            # Silently ignore is_public changes from advisors

        if update_data:
            update_data['updated_at'] = datetime.utcnow().isoformat()
            result = supabase.table('quests').update(update_data).eq('id', quest_id).execute()

            updated_quest = result.data[0] if result.data else None

            return jsonify({
                'success': True,
                'message': 'Quest updated successfully',
                'quest': updated_quest
            })

        return jsonify({
            'success': True,
            'message': 'No updates provided'
        })

    except Exception as e:
        logger.error(f"Error updating quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to update quest: {str(e)}'
        }), 500

@bp.route('/quests/<quest_id>/ai-cleanup', methods=['POST'])
@require_advisor
def ai_cleanup_quest(user_id, quest_id):
    """
    Use AI to clean up and standardize quest title and description.
    Fixes grammar, spelling, punctuation, and ensures Optio formatting standards.
    """
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()

    try:
        # Get quest data
        quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        # Get user role
        user = supabase.table('users').select('role').eq('id', user_id).execute()
        user_role = user.data[0].get('role') if user.data else 'advisor'

        # Check ownership for advisors
        if user_role == 'advisor':
            if quest.data.get('created_by') != user_id:
                return jsonify({'success': False, 'error': 'Not authorized to edit this quest'}), 403

        # Get current title and big_idea
        current_title = quest.data.get('title', '')
        current_big_idea = quest.data.get('big_idea', '') or quest.data.get('description', '')

        if not current_title:
            return jsonify({'success': False, 'error': 'Quest must have a title'}), 400

        # Use AI service to clean up the quest text
        from services.quest_ai_service import QuestAIService
        ai_service = QuestAIService()
        result = ai_service.cleanup_quest_format(current_title, current_big_idea)

        if not result.get('success'):
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to cleanup quest format')
            }), 500

        return jsonify({
            'success': True,
            'cleaned_title': result.get('cleaned_title'),
            'cleaned_big_idea': result.get('cleaned_big_idea'),
            'changes_made': result.get('changes_made', []),
            'quality_score': result.get('quality_score', 50)
        })

    except Exception as e:
        logger.error(f"Error cleaning up quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to cleanup quest: {str(e)}'
        }), 500

@bp.route('/quests/<quest_id>', methods=['DELETE'])
@require_advisor
def delete_quest(user_id, quest_id):
    """
    Delete a quest and all its associated data.
    Advisors can only delete their own unpublished quests.
    Admins can delete any quest.
    """
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()

    try:
        # Check if quest exists and get ownership info
        quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        # Get user role
        user = supabase.table('users').select('role').eq('id', user_id).execute()
        user_role = user.data[0].get('role') if user.data else 'advisor'

        # Check ownership for advisors
        if user_role == 'advisor':
            # Advisors can only delete their own quests
            if quest.data.get('created_by') != user_id:
                return jsonify({'success': False, 'error': 'Not authorized to delete this quest'}), 403

            # Advisors cannot delete published quests
            if quest.data.get('is_active'):
                return jsonify({'success': False, 'error': 'Cannot delete published quests'}), 403

        # Step 1: Delete quest_task_completions (blocks user_quest_tasks deletion)
        # This has NO ACTION constraint on user_quest_task_id
        supabase.table('quest_task_completions')\
            .delete()\
            .eq('quest_id', quest_id)\
            .execute()

        # Step 3: Delete evidence documents (has CASCADE but delete manually to be safe)
        supabase.table('user_task_evidence_documents')\
            .delete()\
            .eq('quest_id', quest_id)\
            .execute()

        # Step 4: Delete user_quest_tasks (CASCADE from quests, but blocked by completions)
        supabase.table('user_quest_tasks')\
            .delete()\
            .eq('quest_id', quest_id)\
            .execute()

        # Step 5: Delete user_quests (CASCADE from quests)
        supabase.table('user_quests')\
            .delete()\
            .eq('quest_id', quest_id)\
            .execute()

        # Step 6: Finally delete the quest itself
        supabase.table('quests').delete().eq('id', quest_id).execute()

        return jsonify({
            'success': True,
            'message': 'Quest deleted successfully'
        })

    except Exception as e:
        logger.error(f"Error deleting quest: {str(e)}")
        error_message = str(e)

        # Provide helpful error message for foreign key constraints
        if '409' in error_message or 'conflict' in error_message.lower():
            return jsonify({
                'success': False,
                'error': 'Cannot delete quest: it is still referenced by other data. Please contact support.'
            }), 409

        return jsonify({
            'success': False,
            'error': f'Failed to delete quest: {error_message}'
        }), 500

