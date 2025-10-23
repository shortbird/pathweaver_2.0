"""
Update site logo to new SVG version
"""
from database import get_supabase_admin_client
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

def update_logo():
    supabase = get_supabase_admin_client()

    new_logo_url = 'https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/logos/logo.svg'

    try:
        # Check if settings exist
        existing = supabase.table('site_settings').select('id').execute()

        if existing.data and len(existing.data) > 0:
            # Update existing settings
            result = supabase.table('site_settings').update({
                'logo_url': new_logo_url,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('id', existing.data[0]['id']).execute()
            logger.info(f"✓ Updated logo URL for existing settings: {result.data}")
        else:
            # Create new settings with logo
            import uuid
            result = supabase.table('site_settings').insert({
                'id': str(uuid.uuid4()),
                'logo_url': new_logo_url,
                'site_name': 'Optio',
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }).execute()
            logger.info(f"✓ Created new settings with logo: {result.data}")

        logger.info(f"
Logo updated successfully to: {new_logo_url}")

    except Exception as e:
        logger.error(f"Error updating logo: {e}")

if __name__ == '__main__':
    update_logo()
