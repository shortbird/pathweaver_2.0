from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth, require_admin
import uuid
from datetime import datetime

settings_bp = Blueprint('settings', __name__)

@settings_bp.route('/settings', methods=['GET'])
def get_settings():
    try:
        # Get public settings (logo, site name, etc.)
        supabase = get_supabase_admin_client()
        response = supabase.table('site_settings').select('*').single().execute()
        
        if response.data:
            return jsonify(response.data), 200
        else:
            # Return default settings if none exist
            return jsonify({
                'logo_url': 'https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/logos/logo.svg',
                'site_name': 'Optio',
                'favicon_url': None
            }), 200

    except Exception as e:
        # If table doesn't exist or no settings, return defaults
        return jsonify({
            'logo_url': 'https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/logos/logo.svg',
            'site_name': 'Optio',
            'favicon_url': None
        }), 200

@settings_bp.route('/settings', methods=['PUT'])
@require_admin
def update_settings(current_user):
    try:
        data = request.get_json()
        supabase = get_supabase_admin_client()
        
        # Check if settings exist
        existing = supabase.table('site_settings').select('id').execute()
        
        if existing.data and len(existing.data) > 0:
            # Update existing settings
            response = supabase.table('site_settings').update({
                **data,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('id', existing.data[0]['id']).execute()
        else:
            # Create new settings
            response = supabase.table('site_settings').insert({
                'id': str(uuid.uuid4()),
                **data,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }).execute()
        
        return jsonify(response.data[0]), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@settings_bp.route('/settings/upload-logo', methods=['POST'])
@require_admin
def upload_logo(current_user):
    try:
        if 'logo' not in request.files:
            return jsonify({'error': 'No logo file provided'}), 400
        
        logo_file = request.files['logo']
        
        if logo_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Generate unique filename
        file_ext = logo_file.filename.rsplit('.', 1)[1].lower() if '.' in logo_file.filename else 'png'
        filename = f"logo_{uuid.uuid4().hex}.{file_ext}"
        
        # Upload to Supabase storage
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
        
        # Update settings with new logo URL
        existing = supabase.table('site_settings').select('id').execute()
        
        if existing.data and len(existing.data) > 0:
            supabase.table('site_settings').update({
                'logo_url': public_url,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('id', existing.data[0]['id']).execute()
        else:
            supabase.table('site_settings').insert({
                'id': str(uuid.uuid4()),
                'logo_url': public_url,
                'site_name': 'Optio',
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }).execute()
        
        return jsonify({'logo_url': public_url}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500