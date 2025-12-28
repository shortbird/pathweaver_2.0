"""
Curriculum service for managing quest curriculum content and attachments.

Handles curriculum content storage, validation, and file management.
"""

from services.base_service import BaseService
from typing import Dict, List, Optional, Any
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
        content: str,
        user_id: str,
        organization_id: str
    ) -> Dict[str, Any]:
        """
        Save or update curriculum content for a quest.

        Args:
            quest_id: Quest ID
            content: Curriculum content (markdown/HTML)
            user_id: User making the change
            organization_id: Organization ID for RLS

        Returns:
            Updated curriculum data

        Raises:
            ValidationError: If content validation fails
        """
        try:
            # Validate iframe URLs if present
            if '<iframe' in content.lower():
                self.validate_iframe_urls(content)

            # Check if curriculum record exists
            existing = self.supabase.table('quest_curriculum')\
                .select('id')\
                .eq('quest_id', quest_id)\
                .execute()

            if existing.data and len(existing.data) > 0:
                # Update existing
                result = self.supabase.table('quest_curriculum')\
                    .update({
                        'content': content,
                        'updated_at': 'now()',
                        'updated_by': user_id
                    })\
                    .eq('quest_id', quest_id)\
                    .execute()
            else:
                # Create new
                result = self.supabase.table('quest_curriculum')\
                    .insert({
                        'quest_id': quest_id,
                        'content': content,
                        'created_by': user_id,
                        'organization_id': organization_id
                    })\
                    .execute()

            logger.info(f"Saved curriculum for quest {quest_id} by user {user_id[:8]}")
            return result.data[0] if result.data else {}

        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Error saving curriculum: {str(e)}")
            raise

    def get_curriculum(self, quest_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch curriculum content for a quest.

        Args:
            quest_id: Quest ID

        Returns:
            Curriculum data or None if not found
        """
        try:
            result = self.supabase.table('quest_curriculum')\
                .select('*')\
                .eq('quest_id', quest_id)\
                .execute()

            if result.data and len(result.data) > 0:
                return result.data[0]
            return None

        except Exception as e:
            logger.error(f"Error fetching curriculum: {str(e)}")
            raise

    def add_attachment(
        self,
        quest_id: str,
        filename: str,
        file_url: str,
        file_size: int,
        mime_type: str,
        user_id: str
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

        Returns:
            Created attachment record
        """
        try:
            result = self.supabase.table('curriculum_attachments')\
                .insert({
                    'quest_id': quest_id,
                    'filename': filename,
                    'file_url': file_url,
                    'file_size': file_size,
                    'mime_type': mime_type,
                    'uploaded_by': user_id
                })\
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
                .order('created_at', desc=False)\
                .execute()

            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching attachments: {str(e)}")
            raise
