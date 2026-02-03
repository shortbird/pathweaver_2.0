"""
Curriculum service for managing quest curriculum content and attachments.

Handles curriculum content storage, validation, and file management.
"""

from services.base_service import BaseService
from typing import Dict, List, Optional, Any, Union
from utils.logger import get_logger
from middleware.error_handler import ValidationError
import re

logger = get_logger(__name__)

# Whitelist of allowed iframe domains for security
ALLOWED_IFRAME_DOMAINS = [
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'vimeo.com',
    'player.vimeo.com',
    'drive.google.com',
    'docs.google.com',
    'slideshare.net',
    'www.slideshare.net',
    'loom.com',
    'www.loom.com'
]


class CurriculumService(BaseService):
    """Manages quest curriculum content and attachments."""

    def __init__(self, supabase=None):
        """Initialize the service with Supabase client."""
        super().__init__()
        self.supabase = supabase

    def validate_iframe_urls(self, content: str) -> bool:
        """
        Validate that iframe URLs are from whitelisted domains.

        Args:
            content: HTML/markdown content potentially containing iframes

        Returns:
            True if all iframes are valid

        Raises:
            ValidationError: If any iframe contains non-whitelisted domain
        """
        # Extract iframe src attributes
        iframe_pattern = r'<iframe[^>]+src=["\']([^"\']+)["\']'
        matches = re.findall(iframe_pattern, content, re.IGNORECASE)

        for url in matches:
            url_lower = url.lower()
            is_allowed = any(domain in url_lower for domain in ALLOWED_IFRAME_DOMAINS)

            if not is_allowed:
                raise ValidationError(
                    f"Iframe URL not allowed: {url}. Only YouTube, Vimeo, Google Drive, "
                    f"SlideShare, and Loom embeds are permitted."
                )

        return True

    def save_curriculum(
        self,
        quest_id: str,
        content: Any,
        user_id: str,
        organization_id: str
    ) -> Dict[str, Any]:
        """
        Save or update curriculum content for a quest.

        Args:
            quest_id: Quest ID
            content: Curriculum content (JSONB or string)
            user_id: User making the change
            organization_id: Organization ID for RLS

        Returns:
            Updated curriculum data

        Raises:
            ValidationError: If content validation fails
        """
        try:
            # Validate iframe URLs if content is string with iframes
            content_str = str(content) if not isinstance(content, str) else content
            if '<iframe' in content_str.lower():
                self.validate_iframe_urls(content_str)

            # Update curriculum_content on quests table
            result = self.supabase.table('quests')\
                .update({
                    'curriculum_content': content
                })\
                .eq('id', quest_id)\
                .execute()

            logger.info(f"Saved curriculum for quest {quest_id} by user {user_id[:8]}")
            return result.data[0] if result.data else {}

        except ValidationError:
            raise
        except Exception as e:
            error_str = str(e).lower()
            if 'curriculum_content' in error_str or 'column' in error_str:
                logger.error(f"curriculum_content column not found - run migration 019")
                raise ValidationError(
                    "Curriculum feature not yet enabled. Please run database migration 019.",
                    500
                )
            logger.error(f"Error saving curriculum: {str(e)}", exc_info=True)
            raise

    def get_curriculum(self, quest_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch curriculum content for a quest.

        Args:
            quest_id: Quest ID

        Returns:
            Quest data with curriculum_content or None if not found
        """
        try:
            # Try with curriculum_content column first
            try:
                result = self.supabase.table('quests')\
                    .select('id, title, description, curriculum_content, organization_id')\
                    .eq('id', quest_id)\
                    .execute()

                if result.data and len(result.data) > 0:
                    quest = result.data[0]
                    return {
                        'quest': quest,
                        'curriculum_content': quest.get('curriculum_content')
                    }
                return None

            except Exception as col_error:
                # Column might not exist yet - fetch without it
                error_str = str(col_error).lower()
                logger.warning(f"Error fetching curriculum with curriculum_content: {str(col_error)}")

                if any(phrase in error_str for phrase in ['curriculum_content', 'column', 'undefined']):
                    logger.warning("curriculum_content column not found, fetching quest without it")
                    result = self.supabase.table('quests')\
                        .select('id, title, description, organization_id')\
                        .eq('id', quest_id)\
                        .execute()

                    if result.data and len(result.data) > 0:
                        quest = result.data[0]
                        quest['curriculum_content'] = None  # Add empty field
                        return {
                            'quest': quest,
                            'curriculum_content': None
                        }
                    return None
                else:
                    raise

        except Exception as e:
            logger.error(f"Error fetching curriculum: {str(e)}", exc_info=True)
            raise

    def add_attachment(
        self,
        quest_id: str,
        filename: str,
        file_url: str,
        file_size: int,
        mime_type: str,
        user_id: str,
        organization_id: str = None
    ) -> Dict[str, Any]:
        """
        Record a curriculum attachment.

        Args:
            quest_id: Quest ID
            filename: Original filename
            file_url: Storage URL
            file_size: File size in bytes
            mime_type: MIME type
            user_id: User uploading
            organization_id: Organization ID (required for RLS)

        Returns:
            Created attachment record
        """
        try:
            # Get organization_id from quest if not provided
            if not organization_id:
                quest = self.supabase.table('quests').select('organization_id').eq('id', quest_id).execute()
                if quest.data:
                    organization_id = quest.data[0].get('organization_id')

            insert_data = {
                'quest_id': quest_id,
                'file_name': filename,  # DB column is file_name, not filename
                'file_url': file_url,
                'file_size_bytes': file_size,  # DB column is file_size_bytes
                'file_type': mime_type,  # DB column is file_type, not mime_type
                'uploaded_by': user_id
            }

            # Only add organization_id if it exists (for org quests)
            if organization_id:
                insert_data['organization_id'] = organization_id

            result = self.supabase.table('curriculum_attachments')\
                .insert(insert_data)\
                .execute()

            logger.info(f"Added attachment {filename} to quest {quest_id}")
            return result.data[0] if result.data else {}

        except Exception as e:
            logger.error(f"Error adding attachment: {str(e)}")
            raise

    def delete_attachment(
        self,
        attachment_id: str,
        quest_id: str
    ) -> bool:
        """
        Delete a curriculum attachment.

        Args:
            attachment_id: Attachment ID
            quest_id: Quest ID (for verification)

        Returns:
            True if deleted successfully
        """
        try:
            # Verify attachment belongs to quest
            attachment = self.supabase.table('curriculum_attachments')\
                .select('file_url')\
                .eq('id', attachment_id)\
                .eq('quest_id', quest_id)\
                .execute()

            if not attachment.data:
                raise ValidationError("Attachment not found or does not belong to this quest")

            file_url = attachment.data[0]['file_url']

            # Delete from storage
            try:
                # Extract path from URL
                # URL format: https://.../storage/v1/object/public/curriculum/{path}
                if '/curriculum/' in file_url:
                    file_path = file_url.split('/curriculum/')[-1]
                    self.supabase.storage.from_('curriculum').remove([file_path])
            except Exception as e:
                logger.warning(f"Could not delete file from storage: {str(e)}")

            # Delete database record
            self.supabase.table('curriculum_attachments')\
                .delete()\
                .eq('id', attachment_id)\
                .execute()

            logger.info(f"Deleted attachment {attachment_id} from quest {quest_id}")
            return True

        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Error deleting attachment: {str(e)}")
            raise

    def get_attachments(self, quest_id: str) -> List[Dict[str, Any]]:
        """
        Get all attachments for a quest.

        Args:
            quest_id: Quest ID

        Returns:
            List of attachment records
        """
        try:
            result = self.supabase.table('curriculum_attachments')\
                .select('*')\
                .eq('quest_id', quest_id)\
                .eq('is_deleted', False)\
                .order('created_at', desc=False)\
                .execute()

            return result.data or []

        except Exception as e:
            # Table or column might not exist yet - return empty list
            error_str = str(e).lower()
            if any(phrase in error_str for phrase in ['does not exist', 'relation', 'column', 'undefined']):
                logger.warning(f"curriculum_attachments query failed (table/column may not exist): {str(e)}")
                return []
            logger.error(f"Error fetching attachments: {str(e)}", exc_info=True)
            # For other errors, just return empty list to not break the page
            return []
