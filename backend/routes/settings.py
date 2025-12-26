"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Already uses SiteSettingsRepository for all database operations
- Only 2 endpoints (GET/PUT settings, upload logo)
- Exemplar of repository pattern usage - no direct database calls
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from repositories import SiteSettingsRepository
from utils.auth.decorators import require_auth, require_admin
import uuid
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

settings_bp = Blueprint('settings', __name__)

@settings_bp.route('/settings', methods=['GET'])
def get_settings():
    """Get site settings (public endpoint)"""
    try:
        # Admin client: Public site settings access (ADR-002, Rule 2)
        settings_repo = SiteSettingsRepository()
        settings = settings_repo.get_settings()
        return jsonify(settings), 200

    except Exception as e:
        logger.error(f"Error getting site settings: {str(e)}")
        # Return defaults on error
        return jsonify({
            'logo_url': 'https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/logos/logo.svg',
            'site_name': 'Optio',
            'favicon_url': None
        }), 200

@settings_bp.route('/settings', methods=['PUT'])
@require_admin
def update_settings(current_user):
    """Update site settings (admin only)"""
    try:
        data = request.get_json()
        # Admin client: Admin operations (ADR-002, Rule 2)
        settings_repo = SiteSettingsRepository()
        updated_settings = settings_repo.upsert_settings(data)
        return jsonify(updated_settings), 200

    except Exception as e:
        logger.error(f"Error updating site settings: {str(e)}")
        return jsonify({'error': str(e)}), 500

@settings_bp.route('/settings/upload-logo', methods=['POST'])
@require_admin
def upload_logo(current_user):
    """Upload site logo (admin only)"""
    try:
        if 'logo' not in request.files:
            return jsonify({'error': 'No logo file provided'}), 400

        logo_file = request.files['logo']

        if logo_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Generate unique filename
        file_ext = logo_file.filename.rsplit('.', 1)[1].lower() if '.' in logo_file.filename else 'png'
        filename = f"logo_{uuid.uuid4().hex}.{file_ext}"

        # Admin client: Admin operations (ADR-002, Rule 2)
        file_data = logo_file.read()
        supabase = get_supabase_admin_client()

        # Create bucket if it doesn't exist
        try:
            supabase.storage.create_bucket('site-assets', {'public': True})
        except:
            pass  # Bucket might already exist

        # Upload file
        response = supabase.storage.from_('site-assets').upload(
            f'logos/{filename}',
            file_data,
            {'content-type': logo_file.content_type}
        )

        # Get public URL
        public_url = supabase.storage.from_('site-assets').get_public_url(f'logos/{filename}')

        # Update settings with new logo URL using repository
        settings_repo = SiteSettingsRepository()
        settings_repo.update_logo_url(public_url)

        return jsonify({'logo_url': public_url}), 200

    except Exception as e:
        logger.error(f"Error uploading logo: {str(e)}")
        return jsonify({'error': str(e)}), 500