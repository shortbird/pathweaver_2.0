"""
Curriculum service for managing quest curriculum content and attachments.

Handles curriculum content storage, validation, and file management.
"""

from services.base_service import BaseService
from typing import Dict, List, Optional, Any, Union
from utils.logger import get_logger
from middleware.error_handler import ValidationError
import re
from urllib.parse import urlparse

logger = get_logger(__name__)

# Whitelist of allowed iframe domains for security. Matched against the parsed
# HOST -- exactly, or as a parent domain on a dot boundary -- never as a
# substring of the whole URL. `www.` variants are therefore redundant but kept
# so the list reads as the set of sites we embed.
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
            ValidationError: If any iframe uses a disallowed scheme or domain

        Security note: this used to be `any(domain in url.lower() for domain in
        ALLOWED_IFRAME_DOMAINS)` -- a substring test against the whole URL,
        which accepted all of:

            javascript:alert(document.cookie)//youtube.com   (stored XSS)
            https://evil-youtube.com.malicious.com/video     (lookalike host)
            https://attacker.test/?ref=youtube.com           (allowlisted string in the query)
            http://www.youtube.com/embed/abc                 (plaintext, MITM-able)

        Curriculum content is authored by staff and rendered to students, so a
        single crafted src ran script in every student's browser. Validation is
        now scheme-first, then an exact/parent-domain match on the parsed host.
        """
        # Extract iframe src attributes
        iframe_pattern = r'<iframe[^>]+src=["\']([^"\']+)["\']'
        matches = re.findall(iframe_pattern, content, re.IGNORECASE)

        for url in matches:
            parsed = urlparse(url.strip())
            scheme = (parsed.scheme or '').lower()

            # Anything that isn't http(s) is rejected by name, so the message
            # tells the author what they actually pasted.
            if scheme not in ('http', 'https'):
                raise ValidationError(
                    f"Iframe URL scheme '{scheme}:' is not allowed. Embeds must be "
                    f"https:// links to YouTube, Vimeo, Google Drive, SlideShare, or Loom."
                )

            if scheme != 'https':
                raise ValidationError(
                    f"Iframe URL must use https://: {url}"
                )

            # hostname is already lowercased and strips any userinfo/port, so
            # "https://youtube.com@evil.test/" resolves to host evil.test.
            host = parsed.hostname or ''
            is_allowed = any(
                host == domain or host.endswith('.' + domain)
                for domain in ALLOWED_IFRAME_DOMAINS
            )

            if not is_allowed:
                raise ValidationError(
                    f"Iframe URL domain not allowed: {url}. Only YouTube, Vimeo, "
                    f"Google Drive, SlideShare, and Loom embeds are permitted."
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
            organization_id: Organization ID (optional, for org quests)

        Returns:
            Created attachment record
        """
        try:
            result = self.supabase.rpc('insert_curriculum_attachment', {
                'p_quest_id': quest_id,
                'p_file_name': filename,
                'p_file_url': file_url,
                'p_file_size_bytes': file_size,
                'p_file_type': mime_type,
                'p_uploaded_by': user_id,
                'p_organization_id': organization_id
            }).execute()

            logger.info(f"Added attachment {filename} to quest {quest_id}")
            return result.data if isinstance(result.data, dict) else (result.data[0] if result.data else {})

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
