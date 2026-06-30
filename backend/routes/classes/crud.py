"""
Class CRUD Routes

Endpoints for creating, reading, updating, and archiving organization classes.
"""

import uuid
from datetime import datetime

from flask import request, jsonify
from . import bp
from services.class_service import ClassService
from services.base_service import ValidationError
from utils.auth.decorators import require_role, require_auth
from utils.roles import get_effective_role
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

# Image upload limits (mirrors the quest image endpoint)
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5MB
CLASS_IMAGES_BUCKET = 'class-images'


def _opt_int(value):
    """Coerce an optional numeric form field to int, treating '' / None as None."""
    if value is None or value == '':
        return None
    return int(value)


def _opt_float(value):
    """Coerce an optional numeric form field to float, treating '' / None as None."""
    if value is None or value == '':
        return None
    return float(value)


def get_user_info(user_id: str):
    """Get user role and organization info"""
    # admin client justified: classes module helper; class CRUD under org_admin/superadmin role checks
    supabase = get_supabase_admin_client()
    user = supabase.table('users').select('role, org_role, organization_id').eq('id', user_id).execute()
    if not user.data:
        return None, None, None
    user_data = user.data[0]
    effective_role = get_effective_role(user_data)
    return effective_role, user_data.get('organization_id'), user_data


@bp.route('/organizations/<org_id>/classes', methods=['GET'])
@require_role('org_admin', 'advisor', 'superadmin')
def list_org_classes(user_id, org_id):
    """
    List all classes for an organization.

    Query Parameters:
    - status: Filter by status ('active', 'archived', or omit for all active)

    Returns:
    {
        "success": true,
        "classes": [...]
    }
    """
    try:
        effective_role, user_org_id, _ = get_user_info(user_id)

        # Authorization: superadmin can access any org, others only their own
        if effective_role != 'superadmin' and user_org_id != org_id:
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        status = request.args.get('status', 'active')

        service = ClassService()
        classes = service.list_org_classes(org_id, status=status)

        return jsonify({
            'success': True,
            'classes': classes
        })

    except Exception as e:
        logger.error(f"Error listing org classes: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to list classes'
        }), 500


@bp.route('/organizations/<org_id>/classes', methods=['POST'])
@require_role('org_admin', 'superadmin')
def create_class(user_id, org_id):
    """
    Create a new class for an organization.

    Request body:
    {
        "name": "Class Name",
        "description": "Optional description",
        "xp_threshold": 100,
        "days_of_week": ["mon", "wed", "fri"],
        "start_time": "09:00",
        "duration_minutes": 60,
        "max_students": 12,
        "supply_fee": 25.00,
        "image_url": "https://...",
        "age_min": 8,
        "age_max": 12
    }

    Returns:
    {
        "success": true,
        "class": {...}
    }
    """
    try:
        effective_role, user_org_id, _ = get_user_info(user_id)

        # Authorization: superadmin can create in any org, org_admin only in their own
        if effective_role != 'superadmin' and user_org_id != org_id:
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        data = request.json or {}
        name = data.get('name', '').strip()
        description = data.get('description', '')
        xp_threshold = int(data.get('xp_threshold', 100))

        if not name:
            return jsonify({'success': False, 'error': 'Class name is required'}), 400

        days_of_week = data.get('days_of_week') or []
        start_time = (data.get('start_time') or '').strip() or None
        image_url = (data.get('image_url') or '').strip() or None

        service = ClassService()
        cls = service.create_class(
            org_id=org_id,
            name=name,
            description=description,
            xp_threshold=xp_threshold,
            created_by=user_id,
            days_of_week=days_of_week,
            start_time=start_time,
            duration_minutes=_opt_int(data.get('duration_minutes')),
            max_students=_opt_int(data.get('max_students')),
            supply_fee=_opt_float(data.get('supply_fee')),
            image_url=image_url,
            age_min=_opt_int(data.get('age_min')),
            age_max=_opt_int(data.get('age_max')),
        )

        return jsonify({
            'success': True,
            'class': cls
        }), 201

    except (ValueError, ValidationError) as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating class: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to create class'
        }), 500


@bp.route('/organizations/<org_id>/classes/<class_id>', methods=['GET'])
@require_role('student', 'org_admin', 'advisor', 'superadmin')
def get_class(user_id, org_id, class_id):
    """
    Get a class by ID with details.

    Returns:
    {
        "success": true,
        "class": {...}
    }
    """
    try:
        effective_role, user_org_id, _ = get_user_info(user_id)

        service = ClassService()

        # Check access
        if not service.can_access_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        cls = service.get_class(class_id)

        return jsonify({
            'success': True,
            'class': cls
        })

    except Exception as e:
        if 'not found' in str(e).lower():
            return jsonify({'success': False, 'error': 'Class not found'}), 404
        logger.error(f"Error getting class: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get class'
        }), 500


@bp.route('/organizations/<org_id>/classes/<class_id>', methods=['PUT'])
@require_role('org_admin', 'advisor', 'superadmin')
def update_class(user_id, org_id, class_id):
    """
    Update a class.

    Request body:
    {
        "name": "New Name",
        "description": "New description",
        "xp_threshold": 150
    }

    Returns:
    {
        "success": true,
        "class": {...}
    }
    """
    try:
        effective_role, user_org_id, _ = get_user_info(user_id)

        service = ClassService()

        # Check management access
        if not service.can_manage_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        data = request.json or {}
        updates = {}

        if 'name' in data:
            updates['name'] = data['name']
        if 'description' in data:
            updates['description'] = data['description']
        if 'xp_threshold' in data:
            updates['xp_threshold'] = int(data['xp_threshold'])

        if not updates:
            return jsonify({'success': False, 'error': 'No updates provided'}), 400

        cls = service.update_class(class_id, updates, user_id)

        return jsonify({
            'success': True,
            'class': cls
        })

    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        if 'not found' in str(e).lower():
            return jsonify({'success': False, 'error': 'Class not found'}), 404
        logger.error(f"Error updating class: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update class'
        }), 500


@bp.route('/organizations/<org_id>/classes/<class_id>/upload-image', methods=['POST'])
@require_role('org_admin', 'advisor', 'superadmin')
def upload_class_image(user_id, org_id, class_id):
    """
    Upload a custom image for a class and store its public URL on the class.

    Multipart form with a single `file` field (image, max 5MB).

    Returns:
    {
        "success": true,
        "image_url": "https://..."
    }
    """
    # admin client justified: class management is gated by can_manage_class below;
    # needs RLS bypass to touch storage + cross-tenant class rows for superadmin.
    supabase = get_supabase_admin_client()

    try:
        effective_role, user_org_id, _ = get_user_info(user_id)

        service = ClassService()
        if not service.can_manage_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        # Verify the class exists and belongs to this org
        cls = supabase.table('org_classes').select('id, organization_id, image_url')\
            .eq('id', class_id).maybe_single().execute()
        if not cls.data or cls.data.get('organization_id') != org_id:
            return jsonify({'success': False, 'error': 'Class not found'}), 404

        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['file']
        if not file.filename:
            return jsonify({'success': False, 'error': 'No file selected'}), 400

        ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            return jsonify({
                'success': False,
                'error': 'Invalid file type. Allowed types: JPG, PNG, GIF, WebP, HEIC'
            }), 400

        file.seek(0, 2)
        file_size = file.tell()
        file.seek(0)
        if file_size > MAX_IMAGE_BYTES:
            return jsonify({'success': False, 'error': 'File size exceeds 5MB limit'}), 400

        # Ensure the bucket exists (public read)
        try:
            supabase.storage.create_bucket(CLASS_IMAGES_BUCKET, {'public': True})
        except Exception:
            logger.debug(f"{CLASS_IMAGES_BUCKET} bucket create skipped (likely exists)", exc_info=True)

        unique_filename = f"{class_id}/{uuid.uuid4()}.{ext}"
        file_content = file.read()

        # Best-effort cleanup of a prior image
        old_url = cls.data.get('image_url')
        if old_url and CLASS_IMAGES_BUCKET in old_url:
            try:
                old_path = old_url.split(f'{CLASS_IMAGES_BUCKET}/')[-1]
                supabase.storage.from_(CLASS_IMAGES_BUCKET).remove([old_path])
            except Exception:
                logger.debug("old class image delete failed (non-fatal)", exc_info=True)

        supabase.storage.from_(CLASS_IMAGES_BUCKET).upload(
            path=unique_filename,
            file=file_content,
            file_options={"content-type": file.content_type or f'image/{ext}'}
        )

        image_url = supabase.storage.from_(CLASS_IMAGES_BUCKET).get_public_url(unique_filename)

        supabase.table('org_classes').update({
            'image_url': image_url,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', class_id).execute()

        return jsonify({'success': True, 'image_url': image_url})

    except Exception as e:
        logger.error(f"Error uploading class image: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to upload class image'}), 500


@bp.route('/organizations/<org_id>/classes/<class_id>', methods=['DELETE'])
@require_role('org_admin', 'superadmin')
def archive_class(user_id, org_id, class_id):
    """
    Archive a class (soft delete).

    Returns:
    {
        "success": true,
        "message": "Class archived successfully"
    }
    """
    try:
        effective_role, user_org_id, _ = get_user_info(user_id)

        service = ClassService()

        # Check management access
        if not service.can_manage_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        service.archive_class(class_id, user_id)

        return jsonify({
            'success': True,
            'message': 'Class archived successfully'
        })

    except Exception as e:
        if 'not found' in str(e).lower():
            return jsonify({'success': False, 'error': 'Class not found'}), 404
        logger.error(f"Error archiving class: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to archive class'
        }), 500


@bp.route('/student/classes', methods=['GET'])
@require_auth
def get_student_classes(user_id):
    """
    Get all classes the current student is enrolled in with progress.

    Returns:
    {
        "success": true,
        "classes": [
            {
                "id": "...",
                "name": "...",
                "description": "...",
                "xp_threshold": 100,
                "progress": { "earned_xp": 75, "xp_threshold": 100, "percentage": 75, "is_complete": false },
                "enrollment": { "status": "active", "enrolled_at": "..." },
                "student_count": 10,
                "quest_count": 3,
                "advisor_count": 1
            }
        ]
    }
    """
    try:
        service = ClassService()
        classes = service.get_student_classes(user_id)

        return jsonify({
            'success': True,
            'classes': classes
        })

    except Exception as e:
        logger.error(f"Error getting student classes: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get classes'
        }), 500


@bp.route('/advisor/classes', methods=['GET'])
@require_role('advisor', 'org_admin', 'superadmin')
def get_advisor_classes(user_id):
    """
    Get all classes the current user is assigned to as an advisor.

    Query Parameters:
    - status: Filter by status ('active', 'archived', or omit for all active)

    Returns:
    {
        "success": true,
        "classes": [...]
    }
    """
    try:
        status = request.args.get('status', 'active')

        service = ClassService()
        classes = service.get_advisor_classes(user_id, status=status)

        return jsonify({
            'success': True,
            'classes': classes
        })

    except Exception as e:
        logger.error(f"Error getting advisor classes: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get classes'
        }), 500
