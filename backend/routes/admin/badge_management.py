"""
REPOSITORY MIGRATION: PARTIALLY MIGRATED - Needs Completion
- Already imports BadgeRepository and QuestRepository (line 10)
- Uses image_service for badge image generation (line 12)
- BUT: Many endpoints still use direct database access
- Mixed pattern creates inconsistency
- Should consolidate badge CRUD into BadgeRepository methods
- Image management (search_badge_image) should remain in service layer

Recommendation: Complete migration by using existing BadgeRepository for all badge CRUD

Admin Badge Management Routes

Handles CRUD operations for badges including creation, editing, deletion,
image management, and quest associations.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from repositories import BadgeRepository, QuestRepository
from utils.auth.decorators import require_admin
from services.image_service import search_badge_image
from services.api_usage_tracker import pexels_tracker
from datetime import datetime
import json
import uuid

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_badge_management', __name__, url_prefix='/api/admin')


@bp.route('/badges', methods=['GET'])
@require_admin
def get_admin_badges(user_id):
    """Get all badges for admin management"""
    supabase = get_supabase_admin_client()

    try:
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 100)
        offset = (page - 1) * per_page

        # Get badges with quest count
        badges = supabase.table('badges')\
            .select('*', count='exact')\
            .order('created_at', desc=True)\
            .range(offset, offset + per_page - 1)\
            .execute()

        # Enrich badges with quest count
        enriched_badges = []
        for badge in badges.data:
            # Get quest count for this badge
            quest_count = supabase.table('badge_quests')\
                .select('id', count='exact')\
                .eq('badge_id', badge['id'])\
                .execute()

            badge['quest_count'] = quest_count.count or 0
            enriched_badges.append(badge)

        return jsonify({
            'success': True,
            'badges': enriched_badges,
            'total': badges.count,
            'page': page,
            'per_page': per_page,
            'total_pages': (badges.count + per_page - 1) // per_page
        })

    except Exception as e:
        logger.error(f"Error getting admin badges: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve badges'
        }), 500


@bp.route('/badges/create', methods=['POST'])
@require_admin
def create_badge(user_id):
    """
    Create a new badge.

    Request body:
        - name: Badge name (required)
        - identity_statement: "I am..." statement (required)
        - description: Badge description (required)
        - pillar_primary: Primary pillar (required)
        - min_quests: Minimum quests required (default 5)
        - min_xp: Minimum XP required (default 1500)
        - is_active: Active status (default True)
        - quest_ids: Optional list of quest IDs to associate
    """
    logger.info(f"CREATE BADGE: admin_user_id={user_id}")
    supabase = get_supabase_admin_client()

    try:
        data = request.json
        logger.info(f"Received badge data: {json.dumps(data, indent=2)}")

        # Validate required fields
        if not data.get('name'):
            return jsonify({'success': False, 'error': 'Name is required'}), 400
        if not data.get('identity_statement'):
            return jsonify({'success': False, 'error': 'Identity statement is required'}), 400
        if not data.get('description'):
            return jsonify({'success': False, 'error': 'Description is required'}), 400
        if not data.get('pillar_primary'):
            return jsonify({'success': False, 'error': 'Primary pillar is required'}), 400

        # Auto-fetch image if not provided
        image_url = data.get('image_url')
        if not image_url:
            image_url = search_badge_image(
                data['name'].strip(),
                data['identity_statement'].strip(),
                data.get('pillar_primary')
            )
            logger.info(f"Auto-fetched image for badge '{data['name']}': {image_url}")

        # Create badge record
        badge_data = {
            'name': data['name'].strip(),
            'identity_statement': data['identity_statement'].strip(),
            'description': data['description'].strip(),
            'pillar_primary': data['pillar_primary'],
            'min_quests': data.get('min_quests', 5),
            'min_xp': data.get('min_xp', 1500),
            'is_active': data.get('is_active', True),
            'image_url': image_url,
            'image_generated_at': datetime.utcnow().isoformat() if image_url else None,
            'image_generation_status': 'success' if image_url else None,
            'created_at': datetime.utcnow().isoformat()
        }

        # Insert badge
        badge_result = supabase.table('badges').insert(badge_data).execute()

        if not badge_result.data:
            return jsonify({'success': False, 'error': 'Failed to create badge'}), 500

        badge_id = badge_result.data[0]['id']
        logger.info(f"Successfully created badge {badge_id}: {badge_data['name']}")

        # Link quests if provided
        quest_ids = data.get('quest_ids', [])
        if quest_ids:
            for idx, quest_id in enumerate(quest_ids):
                link_data = {
                    'badge_id': badge_id,
                    'quest_id': quest_id,
                    'is_required': True,
                    'order_index': idx
                }
                supabase.table('badge_quests').insert(link_data).execute()
            logger.info(f"Linked {len(quest_ids)} quests to badge {badge_id}")

        return jsonify({
            'success': True,
            'message': 'Badge created successfully',
            'badge_id': badge_id,
            'badge': badge_result.data[0]
        })

    except Exception as e:
        logger.error(f"Error creating badge: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to create badge: {str(e)}'
        }), 500


@bp.route('/badges/<badge_id>', methods=['PUT'])
@require_admin
def update_badge(user_id, badge_id):
    """Update an existing badge"""
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        # Validate badge exists
        badge = supabase.table('badges').select('*').eq('id', badge_id).single().execute()
        if not badge.data:
            return jsonify({'success': False, 'error': 'Badge not found'}), 404

        # Update badge data
        update_data = {}
        if 'name' in data:
            update_data['name'] = data['name'].strip()
        if 'identity_statement' in data:
            update_data['identity_statement'] = data['identity_statement'].strip()
        if 'description' in data:
            update_data['description'] = data['description'].strip()
        if 'pillar_primary' in data:
            update_data['pillar_primary'] = data['pillar_primary']
        if 'min_quests' in data:
            update_data['min_quests'] = data['min_quests']
        if 'min_xp' in data:
            update_data['min_xp'] = data['min_xp']
        if 'is_active' in data:
            update_data['is_active'] = data['is_active']
        if 'image_url' in data:
            update_data['image_url'] = data['image_url']

        if update_data:
            update_data['updated_at'] = datetime.utcnow().isoformat()
            supabase.table('badges').update(update_data).eq('id', badge_id).execute()

        return jsonify({
            'success': True,
            'message': 'Badge updated successfully'
        })

    except Exception as e:
        logger.error(f"Error updating badge: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to update badge: {str(e)}'
        }), 500


@bp.route('/badges/<badge_id>', methods=['DELETE'])
@require_admin
def delete_badge(user_id, badge_id):
    """Delete a badge and all its associated data"""
    supabase = get_supabase_admin_client()

    try:
        # Check if badge exists
        badge = supabase.table('badges').select('*').eq('id', badge_id).single().execute()
        if not badge.data:
            return jsonify({'success': False, 'error': 'Badge not found'}), 404

        # Step 1: Delete badge_quests associations
        supabase.table('badge_quests')\
            .delete()\
            .eq('badge_id', badge_id)\
            .execute()

        # Step 2: Delete user_badges progress tracking
        supabase.table('user_badges')\
            .delete()\
            .eq('badge_id', badge_id)\
            .execute()

        # Step 3: Finally delete the badge itself
        supabase.table('badges').delete().eq('id', badge_id).execute()

        return jsonify({
            'success': True,
            'message': 'Badge deleted successfully'
        })

    except Exception as e:
        logger.error(f"Error deleting badge: {str(e)}")
        error_message = str(e)

        # Provide helpful error message for foreign key constraints
        if '409' in error_message or 'conflict' in error_message.lower():
            return jsonify({
                'success': False,
                'error': 'Cannot delete badge: it is still referenced by other data. Please contact support.'
            }), 409

        return jsonify({
            'success': False,
            'error': f'Failed to delete badge: {error_message}'
        }), 500


@bp.route('/badges/<badge_id>/upload-image', methods=['POST'])
@require_admin
def upload_badge_image(user_id, badge_id):
    """Upload a custom image for a badge"""
    supabase = get_supabase_admin_client()

    try:
        # Get badge to verify it exists
        badge = supabase.table('badges').select('*').eq('id', badge_id).single().execute()
        if not badge.data:
            return jsonify({'success': False, 'error': 'Badge not found'}), 404

        # Check if file was provided
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400

        # Validate file type (images only)
        allowed_extensions = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
        file_extension = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''

        if file_extension not in allowed_extensions:
            return jsonify({
                'success': False,
                'error': f'Invalid file type. Allowed types: {", ".join(allowed_extensions)}'
            }), 400

        # Check file size (5MB max for images)
        file.seek(0, 2)  # Seek to end
        file_size = file.tell()
        file.seek(0)  # Reset to beginning

        max_size = 5 * 1024 * 1024  # 5MB
        if file_size > max_size:
            return jsonify({'success': False, 'error': 'File size exceeds 5MB limit'}), 400

        # Create badge-images bucket if it doesn't exist
        try:
            supabase.storage.create_bucket('badge-images', {'public': True})
        except:
            pass  # Bucket might already exist

        # Generate unique filename
        unique_filename = f"{badge_id}/{uuid.uuid4()}.{file_extension}"

        # Read file content
        file_content = file.read()

        # Delete old image if exists (cleanup)
        if badge.data.get('image_url') and 'badge-images' in badge.data['image_url']:
            try:
                old_path = badge.data['image_url'].split('badge-images/')[-1]
                supabase.storage.from_('badge-images').remove([old_path])
            except:
                pass  # Ignore deletion errors

        # Upload to Supabase Storage
        response = supabase.storage.from_('badge-images').upload(
            path=unique_filename,
            file=file_content,
            file_options={"content-type": file.content_type or f'image/{file_extension}'}
        )

        # Get public URL
        image_url = supabase.storage.from_('badge-images').get_public_url(unique_filename)

        # Update badge with new image
        update_data = {
            'image_url': image_url,
            'image_generated_at': datetime.utcnow().isoformat(),
            'image_generation_status': 'success',
            'updated_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('badges').update(update_data).eq('id', badge_id).execute()

        return jsonify({
            'success': True,
            'message': 'Badge image uploaded successfully',
            'image_url': image_url
        })

    except Exception as e:
        logger.error(f"Error uploading badge image: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to upload badge image: {str(e)}'
        }), 500


@bp.route('/badges/<badge_id>/refresh-image', methods=['POST'])
@require_admin
def refresh_badge_image(user_id, badge_id):
    """Refresh the badge image by fetching a new one from Pexels"""
    supabase = get_supabase_admin_client()

    try:
        # Get badge
        badge = supabase.table('badges').select('*').eq('id', badge_id).single().execute()
        if not badge.data:
            return jsonify({'success': False, 'error': 'Badge not found'}), 404

        # Fetch new image
        image_url = search_badge_image(
            badge.data['name'],
            badge.data['identity_statement'],
            badge.data.get('pillar_primary')
        )

        if not image_url:
            return jsonify({
                'success': False,
                'error': 'Could not find a suitable image for this badge'
            }), 404

        # Update badge with new image
        update_data = {
            'image_url': image_url,
            'image_generated_at': datetime.utcnow().isoformat(),
            'image_generation_status': 'success',
            'updated_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('badges').update(update_data).eq('id', badge_id).execute()

        return jsonify({
            'success': True,
            'message': 'Badge image refreshed successfully',
            'image_url': image_url
        })

    except Exception as e:
        logger.error(f"Error refreshing badge image: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to refresh badge image: {str(e)}'
        }), 500


@bp.route('/badges/<badge_id>/quests', methods=['GET'])
@require_admin
def get_badge_quests(user_id, badge_id):
    """Get all quests associated with a badge"""
    supabase = get_supabase_admin_client()

    try:
        # Get badge_quests associations
        badge_quests = supabase.table('badge_quests')\
            .select('*, quests(*)')\
            .eq('badge_id', badge_id)\
            .order('order_index')\
            .execute()

        return jsonify({
            'success': True,
            'badge_quests': badge_quests.data,
            'total': len(badge_quests.data)
        })

    except Exception as e:
        logger.error(f"Error getting badge quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve badge quests'
        }), 500


@bp.route('/badges/<badge_id>/quests', methods=['POST'])
@require_admin
def link_quest_to_badge(user_id, badge_id):
    """
    Link a quest to a badge.

    Request body:
        - quest_id: Quest UUID (required)
        - is_required: Boolean (default True)
        - order_index: Integer (default 0)
    """
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        if 'quest_id' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: quest_id'
            }), 400

        # Check if association already exists
        existing = supabase.table('badge_quests')\
            .select('id')\
            .eq('badge_id', badge_id)\
            .eq('quest_id', data['quest_id'])\
            .execute()

        if existing.data:
            return jsonify({
                'success': False,
                'error': 'Quest is already linked to this badge'
            }), 400

        link_data = {
            'badge_id': badge_id,
            'quest_id': data['quest_id'],
            'is_required': data.get('is_required', True),
            'order_index': data.get('order_index', 0)
        }

        result = supabase.table('badge_quests').insert(link_data).execute()

        return jsonify({
            'success': True,
            'message': 'Quest linked to badge successfully',
            'badge_quest': result.data[0]
        }), 201

    except Exception as e:
        logger.error(f"Error linking quest to badge: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to link quest: {str(e)}'
        }), 500


@bp.route('/badges/<badge_id>/quests/<quest_id>', methods=['DELETE'])
@require_admin
def unlink_quest_from_badge(user_id, badge_id, quest_id):
    """Remove a quest from a badge"""
    supabase = get_supabase_admin_client()

    try:
        result = supabase.table('badge_quests')\
            .delete()\
            .eq('badge_id', badge_id)\
            .eq('quest_id', quest_id)\
            .execute()

        return jsonify({
            'success': True,
            'message': 'Quest unlinked from badge successfully'
        })

    except Exception as e:
        logger.error(f"Error unlinking quest from badge: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to unlink quest: {str(e)}'
        }), 500


@bp.route('/badges/<badge_id>/quests/<quest_id>', methods=['PUT'])
@require_admin
def update_badge_quest_link(user_id, badge_id, quest_id):
    """
    Update badge-quest association properties.

    Request body:
        - is_required: Boolean (optional)
        - order_index: Integer (optional)
    """
    supabase = get_supabase_admin_client()

    try:
        data = request.json
        update_data = {}

        if 'is_required' in data:
            update_data['is_required'] = data['is_required']
        if 'order_index' in data:
            update_data['order_index'] = data['order_index']

        if not update_data:
            return jsonify({
                'success': False,
                'error': 'No update data provided'
            }), 400

        result = supabase.table('badge_quests')\
            .update(update_data)\
            .eq('badge_id', badge_id)\
            .eq('quest_id', quest_id)\
            .execute()

        return jsonify({
            'success': True,
            'message': 'Badge-quest link updated successfully'
        })

    except Exception as e:
        logger.error(f"Error updating badge-quest link: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to update link: {str(e)}'
        }), 500
