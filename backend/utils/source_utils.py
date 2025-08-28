"""
Utility functions for managing quest sources and their header images
"""

from database import get_supabase_admin_client

def get_source_header_image(source_id):
    """
    Get the default header image URL for a source.
    Returns None if no default image exists.
    """
    if not source_id:
        return None
    
    supabase = get_supabase_admin_client()
    
    # Try different extensions
    for ext in ['png', 'jpg', 'jpeg', 'gif', 'webp']:
        file_name = f'source_defaults/{source_id}_header.{ext}'
        try:
            # Get public URL
            public_url = supabase.storage.from_('quest-images').get_public_url(file_name)
            
            # Verify the file actually exists by trying to list it
            files = supabase.storage.from_('quest-images').list('source_defaults/')
            if any(f['name'] == f'{source_id}_header.{ext}' for f in files):
                return public_url
        except:
            continue
    
    return None

def get_quest_header_image(quest):
    """
    Get the header image for a quest.
    Priority:
    1. Quest's own header_image_url (if set)
    2. Source's default header image (if source is set)
    3. None
    """
    # If quest has its own header image, use that
    if quest.get('header_image_url'):
        return quest['header_image_url']
    
    # Otherwise, try to get the source's default image
    if quest.get('source'):
        return get_source_header_image(quest['source'])
    
    return None