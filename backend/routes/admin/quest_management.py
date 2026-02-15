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
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
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

bp = Blueprint('admin_quest_management', __name__, url_prefix='/api/admin')

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


@bp.route('/quests/similar', methods=['GET'])
@require_advisor
def search_similar_quests(user_id):
    """
    Search for similar quests for autocomplete during quest creation.
    Respects organization visibility policies.

    Query Parameters:
    - search: Search term (quest title, minimum 3 characters)
    - limit: Maximum results (default: 10, max: 20)

    Returns:
    {
        "success": true,
        "quests": [...],
        "total": N
    }
    """
    try:
        search_term = request.args.get('search', '').strip()
        limit = min(int(request.args.get('limit', 10)), 20)

        # Require minimum 3 characters
        if len(search_term) < 3:
            return jsonify({
                'success': True,
                'quests': [],
                'message': 'Search term must be at least 3 characters'
            })

        # Use repository to search with organization awareness
        quest_repo = QuestRepository()

        quests = quest_repo.search_similar_quests(
            user_id=user_id,
            search_term=search_term,
            limit=limit
        )

        return jsonify({
            'success': True,
            'quests': quests,
            'total': len(quests)
        })

    except Exception as e:
        logger.error(f"Error searching similar quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to search similar quests'
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

@bp.route('/quests/<quest_id>/upload-image', methods=['POST'])
@require_admin
def upload_quest_image(user_id, quest_id):
    """Upload a custom image for a quest"""
    from flask import request
    supabase = get_supabase_admin_client()

    try:
        # Get quest to verify it exists
        quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        # Check if file was provided
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400

        # Validate file type (images only)
        allowed_extensions = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'}
        file_extension = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''

        if file_extension not in allowed_extensions:
            return jsonify({
                'success': False,
                'error': f'Invalid file type. Allowed types: JPG, PNG, GIF, WebP, HEIC'
            }), 400

        # Check file size (5MB max for images)
        file.seek(0, 2)  # Seek to end
        file_size = file.tell()
        file.seek(0)  # Reset to beginning

        max_size = 5 * 1024 * 1024  # 5MB
        if file_size > max_size:
            return jsonify({'success': False, 'error': 'File size exceeds 5MB limit'}), 400

        # Create quest-images bucket if it doesn't exist
        try:
            supabase.storage.create_bucket('quest-images', {'public': True})
        except:
            pass  # Bucket might already exist

        # Generate unique filename
        unique_filename = f"{quest_id}/{uuid.uuid4()}.{file_extension}"

        # Read file content
        file_content = file.read()

        # Delete old image if exists (cleanup)
        if quest.data.get('image_url') and 'quest-images' in quest.data['image_url']:
            try:
                old_path = quest.data['image_url'].split('quest-images/')[-1]
                supabase.storage.from_('quest-images').remove([old_path])
            except:
                pass  # Ignore deletion errors

        # Upload to Supabase Storage
        response = supabase.storage.from_('quest-images').upload(
            path=unique_filename,
            file=file_content,
            file_options={"content-type": file.content_type or f'image/{file_extension}'}
        )

        # Get public URL
        image_url = supabase.storage.from_('quest-images').get_public_url(unique_filename)

        # Update quest with new image
        update_data = {
            'image_url': image_url,
            'header_image_url': image_url,
            'updated_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('quests').update(update_data).eq('id', quest_id).execute()

        return jsonify({
            'success': True,
            'message': 'Quest image uploaded successfully',
            'image_url': image_url
        })

    except Exception as e:
        logger.error(f"Error uploading quest image: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to upload quest image: {str(e)}'
        }), 500

@bp.route('/quests/<quest_id>/refresh-image', methods=['POST'])
@require_admin
def refresh_quest_image(user_id, quest_id):
    """Refresh the quest image by fetching a new one from Pexels"""
    supabase = get_supabase_admin_client()

    try:
        # Get quest
        quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        # Fetch new image
        image_url = search_quest_image(quest.data['title'])

        if not image_url:
            return jsonify({
                'success': False,
                'error': 'Could not find a suitable image for this quest'
            }), 404

        # Update quest with new image
        update_data = {
            'image_url': image_url,
            'header_image_url': image_url,
            'updated_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('quests').update(update_data).eq('id', quest_id).execute()

        return jsonify({
            'success': True,
            'message': 'Quest image refreshed successfully',
            'image_url': image_url
        })

    except Exception as e:
        logger.error(f"Error refreshing quest image: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to refresh quest image: {str(e)}'
        }), 500

@bp.route('/quests/<quest_id>', methods=['DELETE'])
@require_advisor
def delete_quest(user_id, quest_id):
    """
    Delete a quest and all its associated data.
    Advisors can only delete their own unpublished quests.
    Admins can delete any quest.
    """
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

@bp.route('/quests', methods=['GET'])
@require_advisor
def get_admin_quests(user_id):
    """
    Get quests for admin/advisor management.
    Admins see all quests.
    Advisors see only their own quests.

    Query Parameters:
    - page: Page number (default: 1)
    - per_page: Items per page (default: 1000, max: 10000)
    - quest_type: Filter by quest type ('optio', 'course', or omit for all)
    - is_active: Filter by active status ('true', 'false', or omit for all)
    - is_public: Filter by public status ('true', 'false', or omit for all)
    """
    supabase = get_supabase_admin_client()

    try:
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 1000)), 10000)  # Default to 1000, max 10000
        offset = (page - 1) * per_page

        # Get filter parameters
        quest_type = request.args.get('quest_type')  # 'optio', 'course', or None for all
        is_active = request.args.get('is_active')  # 'true', 'false', or None for all
        is_public = request.args.get('is_public')  # 'true', 'false', or None for all

        # Get user role
        user = supabase.table('users').select('role').eq('id', user_id).execute()
        user_role = user.data[0].get('role') if user.data else 'advisor'

        # Build query based on role
        # Join with users table to get creator information
        query = supabase.table('quests').select('*, creator:created_by(id, display_name, first_name, last_name, email)', count='exact')

        # Advisors see only their own quests
        if user_role == 'advisor':
            query = query.eq('created_by', user_id)

        # Apply filters
        if quest_type:
            query = query.eq('quest_type', quest_type)

        if is_active is not None:
            active_bool = is_active.lower() == 'true'
            query = query.eq('is_active', active_bool)

        if is_public is not None:
            public_bool = is_public.lower() == 'true'
            query = query.eq('is_public', public_bool)

        # Get quests with pagination
        # Note: In V3 personalized system, quests don't have quest_tasks (that table is archived)
        # Task counts would need to be calculated from user_quest_tasks if needed
        quests = query\
            .order('created_at', desc=True)\
            .range(offset, offset + per_page - 1)\
            .execute()

        # Get course connections for all quests
        quest_ids = [q['id'] for q in quests.data]
        course_connections = {}
        if quest_ids:
            course_links = supabase.table('course_quests')\
                .select('quest_id, course_id, courses(id, title)')\
                .in_('quest_id', quest_ids)\
                .execute()
            for link in (course_links.data or []):
                quest_id = link.get('quest_id')
                if quest_id not in course_connections:
                    course_connections[quest_id] = []
                course_data = link.get('courses')
                if course_data:
                    course_connections[quest_id].append({
                        'course_id': course_data.get('id'),
                        'course_title': course_data.get('title')
                    })

        # Process quest data to flatten creator info
        # Collect creator IDs for batch lookup if embedded query didn't work
        creator_ids = set()
        for quest in quests.data:
            if not quest.get('creator') and quest.get('created_by'):
                creator_ids.add(quest['created_by'])

        # Batch fetch creator info if embedded query didn't return it
        creator_lookup = {}
        if creator_ids:
            logger.debug(f"Embedded creator query didn't work, fetching {len(creator_ids)} creators manually")
            creators = supabase.table('users')\
                .select('id, display_name, first_name, last_name, email')\
                .in_('id', list(creator_ids))\
                .execute()
            for c in (creators.data or []):
                creator_lookup[c['id']] = c

        processed_quests = []
        for quest in quests.data:
            # Flatten creator data for easier frontend access
            creator = quest.get('creator') or creator_lookup.get(quest.get('created_by'))
            if creator:
                quest['creator_name'] = creator.get('display_name') or f"{creator.get('first_name', '')} {creator.get('last_name', '')}".strip() or creator.get('email', 'Unknown User')
            else:
                quest['creator_name'] = None

            # Add course connection info
            quest['connected_courses'] = course_connections.get(quest['id'], [])
            quest['is_project'] = len(quest['connected_courses']) > 0

            processed_quests.append(quest)

        return jsonify({
            'success': True,
            'quests': processed_quests,
            'total': quests.count,
            'page': page,
            'per_page': per_page,
            'total_pages': (quests.count + per_page - 1) // per_page
        })

    except Exception as e:
        logger.error(f"Error getting admin quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve quests'
        }), 500

@bp.route('/quests/<quest_id>/task-templates', methods=['GET'])
@require_admin
def get_quest_task_templates(user_id, quest_id):
    """
    Get reusable task templates for a quest.
    Returns tasks created by other students that can be copied.
    Optionally filters out tasks already assigned to a specific student.
    """
    from flask import request
    supabase = get_supabase_admin_client()

    try:
        # Get target_user_id from query params (student we're adding tasks for)
        target_user_id = request.args.get('target_user_id')

        # Get existing task titles for this student if target_user_id provided
        existing_titles = set()
        if target_user_id:
            existing_tasks = supabase.table('user_quest_tasks')\
                .select('title')\
                .eq('user_id', target_user_id)\
                .eq('quest_id', quest_id)\
                .execute()
            existing_titles = {t['title'].strip().lower() for t in existing_tasks.data if t.get('title')}

        # Get all tasks for this quest from user_quest_tasks
        # Group by title to find commonly used tasks
        tasks = supabase.table('user_quest_tasks')\
            .select('*')\
            .eq('quest_id', quest_id)\
            .execute()

        if not tasks.data:
            return jsonify({
                'success': True,
                'templates': [],
                'message': 'No task templates available yet for this quest'
            })

        # Aggregate tasks by similarity (using title as primary key)
        template_map = {}
        for task in tasks.data:
            title = task.get('title', '').strip().lower()
            if not title:
                continue

            # Skip tasks already assigned to this student
            if title in existing_titles:
                continue

            if title not in template_map:
                subject_xp_dist = task.get('subject_xp_distribution', {})
                total_xp = sum(subject_xp_dist.values()) if subject_xp_dist else task.get('xp_value', 100)

                template_map[title] = {
                    'id': task['id'],  # Use first occurrence ID as template
                    'title': task.get('title'),
                    'description': task.get('description', ''),
                    'pillar': task.get('pillar'),
                    'subject_xp_distribution': subject_xp_dist or {"Electives": total_xp},
                    'xp_value': int(total_xp),
                    'usage_count': 0,
                    'created_at': task.get('created_at')
                }

            template_map[title]['usage_count'] += 1

        # Convert to list and sort by usage count (most popular first)
        templates = sorted(
            template_map.values(),
            key=lambda x: (x['usage_count'], x['created_at']),
            reverse=True
        )

        return jsonify({
            'success': True,
            'templates': templates,
            'total': len(templates)
        })

    except Exception as e:
        logger.error(f"Error getting task templates: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve task templates'
        }), 500

@bp.route('/pexels/usage', methods=['GET'])
@require_admin
def get_pexels_usage(user_id):
    """Get current Pexels API usage stats"""
    try:
        usage = pexels_tracker.get_usage()
        return jsonify({
            'success': True,
            **usage
        })
    except Exception as e:
        logger.error(f"Error getting Pexels usage: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get API usage'
        }), 500

@bp.route('/quests/bulk-generate-images', methods=['POST'])
@require_admin
def bulk_generate_images(user_id):
    """
    Generate images for multiple quests

    Request body:
    {
        "quest_ids": ["id1", "id2", ...],  # Optional, if not provided processes all without images
        "skip_existing": true,  # Default true - skip quests that already have images
        "max_count": 50  # Optional limit on number of quests to process
    }
    """
    supabase = get_supabase_admin_client()

    try:
        data = request.json or {}
        quest_ids = data.get('quest_ids', [])
        skip_existing = data.get('skip_existing', True)
        max_count = data.get('max_count', 50)

        # Build query
        query = supabase.table('quests').select('id, title, big_idea, description, image_url')

        # Filter by quest_ids if provided
        if quest_ids:
            query = query.in_('id', quest_ids)

        # Filter out quests that already have images if skip_existing=true
        if skip_existing:
            query = query.is_('image_url', 'null')

        # Limit results
        query = query.limit(max_count)

        quests = query.execute()

        if not quests.data:
            return jsonify({
                'success': True,
                'message': 'No quests found that need images',
                'processed': 0,
                'skipped': 0,
                'failed': 0
            })

        # Check if we have enough API capacity
        needed_calls = len(quests.data)
        usage = pexels_tracker.get_usage()

        if usage['remaining'] < needed_calls:
            return jsonify({
                'success': False,
                'error': f'Not enough API capacity. Need {needed_calls} calls but only {usage["remaining"]} remaining.',
                'usage': usage
            }), 429

        # Process each quest
        processed = 0
        skipped = 0
        failed = 0
        results = []

        for quest in quests.data:
            try:
                # Skip if already has image and skip_existing is true
                if skip_existing and quest.get('image_url'):
                    skipped += 1
                    continue

                # Generate image
                quest_desc = quest.get('big_idea', '') or quest.get('description', '')
                image_url = search_quest_image(quest['title'], quest_desc)

                if image_url:
                    # Update quest with image
                    update_result = supabase.table('quests').update({
                        'image_url': image_url,
                        'header_image_url': image_url,
                        'image_generated_at': datetime.utcnow().isoformat(),
                        'image_generation_status': 'success'
                    }).eq('id', quest['id']).execute()

                    processed += 1
                    results.append({
                        'quest_id': quest['id'],
                        'title': quest['title'],
                        'status': 'success',
                        'image_url': image_url
                    })
                else:
                    failed += 1
                    # Mark as failed
                    supabase.table('quests').update({
                        'image_generation_status': 'failed',
                        'image_generated_at': datetime.utcnow().isoformat()
                    }).eq('id', quest['id']).execute()

                    results.append({
                        'quest_id': quest['id'],
                        'title': quest['title'],
                        'status': 'failed',
                        'error': 'No image found'
                    })

            except Exception as e:
                failed += 1
                logger.error(f"Error processing quest {quest['id']}: {str(e)}")
                results.append({
                    'quest_id': quest['id'],
                    'title': quest['title'],
                    'status': 'failed',
                    'error': str(e)
                })

        # Get final usage
        final_usage = pexels_tracker.get_usage()

        return jsonify({
            'success': True,
            'message': f'Processed {processed} quests, skipped {skipped}, failed {failed}',
            'processed': processed,
            'skipped': skipped,
            'failed': failed,
            'results': results,
            'usage': final_usage
        })

    except Exception as e:
        logger.error(f"Error in bulk image generation: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to generate images: {str(e)}'
        }), 500

@bp.route('/quests/<quest_id>/clone-to-optio', methods=['POST'])
@require_admin
def clone_quest_to_optio(user_id, quest_id):
    """
    Clone a quest into an Optio universal quest with AI enhancement.
    Superadmin only.

    Creates a new quest with:
    - organization_id = NULL (Optio universal)
    - is_active = False (draft)
    - is_public = False (private until reviewed)
    - quest_type = 'optio'
    - AI-enhanced title, description, and big_idea
    """
    supabase = get_supabase_admin_client()

    try:
        # Verify user is superadmin
        user = supabase.table('users').select('role').eq('id', user_id).execute()
        user_role = user.data[0].get('role') if user.data else None

        if user_role != 'superadmin':
            return jsonify({'success': False, 'error': 'Only superadmin can clone quests to Optio'}), 403

        # Fetch source quest
        source_quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not source_quest.data:
            return jsonify({'success': False, 'error': 'Source quest not found'}), 404

        # Use AI service to enhance the quest
        from services.quest_ai_service import QuestAIService
        ai_service = QuestAIService()
        ai_result = ai_service.clone_quest_to_optio(source_quest.data)

        if not ai_result.get('success'):
            return jsonify({
                'success': False,
                'error': ai_result.get('error', 'AI enhancement failed')
            }), 500

        enhanced_quest = ai_result['quest']

        # Auto-fetch header image using existing search_quest_image
        image_url = search_quest_image(
            enhanced_quest['title'],
            enhanced_quest.get('description', '')
        )
        logger.info(f"Auto-fetched image for cloned quest '{enhanced_quest['title']}': {image_url}")

        # Build metadata for tracking
        metadata = {
            'cloned_from': quest_id,
            'cloned_at': datetime.utcnow().isoformat(),
            'original_organization_id': source_quest.data.get('organization_id')
        }

        # Create new quest
        new_quest_data = {
            'title': enhanced_quest['title'],
            'description': enhanced_quest['description'],
            'big_idea': enhanced_quest['big_idea'],
            'topics': enhanced_quest.get('topics', []),
            'organization_id': None,  # Optio universal
            'is_active': False,  # Draft
            'is_public': False,  # Private until reviewed
            'quest_type': 'optio',
            'is_v3': True,
            'header_image_url': image_url,
            'image_url': image_url,
            'created_by': user_id,
            'created_at': datetime.utcnow().isoformat(),
            'metadata': metadata
        }

        quest_result = supabase.table('quests').insert(new_quest_data).execute()

        if not quest_result.data:
            return jsonify({'success': False, 'error': 'Failed to create cloned quest'}), 500

        new_quest = quest_result.data[0]
        logger.info(f"Successfully cloned quest {quest_id[:8]} to Optio as {new_quest['id'][:8]}")

        return jsonify({
            'success': True,
            'quest': new_quest,
            'message': 'Quest cloned successfully. Review and publish when ready.',
            'original_quest_id': quest_id
        })

    except Exception as e:
        logger.error(f"Error cloning quest to Optio: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to clone quest: {str(e)}'
        }), 500


@bp.route('/quests/fix-course-enrollments', methods=['POST'])
@require_admin
def fix_course_quest_enrollments(user_id):
    """
    One-time fix for existing course quest enrollments that are missing preset tasks.

    Finds all active course quest enrollments without tasks and auto-loads preset tasks.
    """
    supabase = get_supabase_admin_client()

    try:
        # Get all active course quest enrollments
        enrollments = supabase.table('user_quests')\
            .select('id, user_id, quest_id, quests!inner(quest_type, title)')\
            .eq('is_active', True)\
            .eq('quests.quest_type', 'course')\
            .execute()

        if not enrollments.data:
            return jsonify({
                'success': True,
                'message': 'No course quest enrollments found',
                'fixed': 0
            })

        logger.info(f"[FIX_COURSE_ENROLLMENTS] Found {len(enrollments.data)} course quest enrollments")

        fixed_count = 0
        skipped_count = 0
        failed_count = 0
        results = []

        from routes.quest_types import get_course_tasks_for_quest
        from services.subject_classification_service import SubjectClassificationService
        classification_service = SubjectClassificationService(client=supabase)

        # Pre-fetch all existing tasks for all enrollments in a single query to avoid N+1
        enrollment_ids = [enrollment['id'] for enrollment in enrollments.data]
        all_existing_tasks = supabase.table('user_quest_tasks')\
            .select('user_quest_id')\
            .in_('user_quest_id', enrollment_ids)\
            .execute()

        # Build a set of enrollment IDs that have existing tasks
        enrollments_with_tasks = {task['user_quest_id'] for task in all_existing_tasks.data}

        for enrollment in enrollments.data:
            enrollment_id = enrollment['id']
            quest_id = enrollment['quest_id']
            user_id_enrolled = enrollment['user_id']
            quest_title = enrollment['quests']['title']

            try:
                # Check if tasks already exist for this enrollment (using pre-fetched data)
                if enrollment_id in enrollments_with_tasks:
                    skipped_count += 1
                    results.append({
                        'enrollment_id': enrollment_id,
                        'quest_title': quest_title,
                        'user_id': user_id_enrolled[:8],
                        'status': 'skipped',
                        'reason': 'Tasks already exist'
                    })
                    continue

                # Get preset tasks for this course quest
                preset_tasks = get_course_tasks_for_quest(quest_id)

                if not preset_tasks:
                    failed_count += 1
                    results.append({
                        'enrollment_id': enrollment_id,
                        'quest_title': quest_title,
                        'user_id': user_id_enrolled[:8],
                        'status': 'failed',
                        'reason': 'No preset tasks found'
                    })
                    continue

                # Copy preset tasks to user_quest_tasks
                user_tasks_data = []
                for task in preset_tasks:
                    xp_value = task.get('xp_value', 100)

                    # Auto-generate subject distribution if not present
                    subject_distribution = task.get('subject_xp_distribution', {})
                    if not subject_distribution:
                        try:
                            subject_distribution = classification_service.classify_task_subjects(
                                task['title'],
                                task.get('description', ''),
                                task['pillar'],
                                xp_value
                            )
                        except Exception as e:
                            logger.warning(f"[FIX_COURSE_ENROLLMENTS] Failed to classify task, using fallback: {str(e)}")
                            subject_distribution = classification_service._fallback_subject_mapping(
                                task['pillar'],
                                xp_value
                            )

                    task_data = {
                        'user_id': user_id_enrolled,
                        'quest_id': quest_id,
                        'user_quest_id': enrollment_id,
                        'title': task['title'],
                        'description': task.get('description', ''),
                        'pillar': task['pillar'],
                        'xp_value': xp_value,
                        'order_index': task.get('order_index', 0),
                        'is_required': task.get('is_required', False),
                        'is_manual': False,
                        'approval_status': 'approved',
                        'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                        'subject_xp_distribution': subject_distribution
                    }
                    user_tasks_data.append(task_data)

                # Bulk insert tasks
                if user_tasks_data:
                    supabase.table('user_quest_tasks').insert(user_tasks_data).execute()

                    # Mark personalization as completed
                    supabase.table('user_quests')\
                        .update({'personalization_completed': True})\
                        .eq('id', enrollment_id)\
                        .execute()

                    fixed_count += 1
                    results.append({
                        'enrollment_id': enrollment_id,
                        'quest_title': quest_title,
                        'user_id': user_id_enrolled[:8],
                        'status': 'fixed',
                        'tasks_added': len(user_tasks_data)
                    })
                    logger.info(f"[FIX_COURSE_ENROLLMENTS] Fixed enrollment {enrollment_id[:8]} - added {len(user_tasks_data)} tasks")

            except Exception as e:
                failed_count += 1
                logger.error(f"[FIX_COURSE_ENROLLMENTS] Error fixing enrollment {enrollment_id[:8]}: {str(e)}")
                results.append({
                    'enrollment_id': enrollment_id,
                    'quest_title': quest_title,
                    'user_id': user_id_enrolled[:8],
                    'status': 'failed',
                    'error': str(e)
                })

        return jsonify({
            'success': True,
            'message': f'Fixed {fixed_count} enrollments, skipped {skipped_count}, failed {failed_count}',
            'fixed': fixed_count,
            'skipped': skipped_count,
            'failed': failed_count,
            'total_checked': len(enrollments.data),
            'results': results
        })

    except Exception as e:
        logger.error(f"[FIX_COURSE_ENROLLMENTS] Error: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to fix course enrollments: {str(e)}'
        }), 500