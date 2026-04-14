"""Quest image upload, refresh, bulk generation, Pexels usage.

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


@bp.route('/quests/<quest_id>/upload-image', methods=['POST'])
@require_admin
def upload_quest_image(user_id, quest_id):
    """Upload a custom image for a quest"""
    from flask import request
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
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
        except Exception:
            logger.debug("quest-images bucket create skipped (likely exists)", exc_info=True)

        # Generate unique filename
        unique_filename = f"{quest_id}/{uuid.uuid4()}.{file_extension}"

        # Read file content
        file_content = file.read()

        # Delete old image if exists (cleanup)
        if quest.data.get('image_url') and 'quest-images' in quest.data['image_url']:
            try:
                old_path = quest.data['image_url'].split('quest-images/')[-1]
                supabase.storage.from_('quest-images').remove([old_path])
            except Exception:
                logger.debug("quest-images old file delete failed (non-fatal)", exc_info=True)

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
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
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
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
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

