"""
Utility functions for managing quest sources and their header images
"""

from database import get_supabase_admin_client

def get_source_header_image(source_id):
    """
    Get the default header image URL for a source from the quest_sources table.
    Returns None if no default image exists.
    """
    if not source_id:
        return None
    
    supabase = get_supabase_admin_client()
    
    try:
        # Query the quest_sources table for this source's header image
        response = supabase.table('quest_sources')\
            .select('header_image_url')\
            .eq('id', source_id)\
            .execute()
        
        if response.data and response.data[0].get('header_image_url'):
            return response.data[0]['header_image_url']
    except Exception as e:
        print(f"Error fetching source header image for {source_id}: {e}")
    
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