"""
Site Settings Repository - Database operations for site configuration

Handles site-wide configuration like logo, site name, favicon.
"""

from typing import Optional, Dict, Any
from repositories.base_repository import BaseRepository, DatabaseError
from postgrest.exceptions import APIError
from datetime import datetime
import uuid

from utils.logger import get_logger

logger = get_logger(__name__)


class SiteSettingsRepository(BaseRepository):
    """Repository for site settings database operations"""

    table_name = 'site_settings'
    id_column = 'id'

    def get_settings(self) -> Dict[str, Any]:
        """
        Get site settings (should be a single row).

        Returns:
            Site settings record or default values if not found

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = self.client.table(self.table_name).select('*').execute()

            if response.data and len(response.data) > 0:
                return response.data[0]

            # Return defaults if no settings exist
            return {
                'logo_url': 'https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/logos/logo.svg',
                'site_name': 'Optio',
                'favicon_url': None
            }

        except APIError as e:
            logger.error(f"Error fetching site settings: {e}")
            # Return defaults on error
            return {
                'logo_url': 'https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/logos/logo.svg',
                'site_name': 'Optio',
                'favicon_url': None
            }

    def upsert_settings(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create or update site settings.

        Args:
            data: Settings data to save

        Returns:
            Updated settings record

        Raises:
            DatabaseError: If operation fails
        """
        try:
            # Check if settings exist
            existing = self.client.table(self.table_name).select('id').execute()

            if existing.data and len(existing.data) > 0:
                # Update existing settings
                settings_id = existing.data[0]['id']
                updated_data = {
                    **data,
                    'updated_at': datetime.utcnow().isoformat()
                }
                response = (
                    self.client.table(self.table_name)
                    .update(updated_data)
                    .eq('id', settings_id)
                    .execute()
                )
                logger.info(f"Updated site settings: {settings_id}")
            else:
                # Create new settings
                new_data = {
                    'id': str(uuid.uuid4()),
                    **data,
                    'created_at': datetime.utcnow().isoformat(),
                    'updated_at': datetime.utcnow().isoformat()
                }
                response = (
                    self.client.table(self.table_name)
                    .insert(new_data)
                    .execute()
                )
                logger.info(f"Created site settings: {new_data['id']}")

            if not response.data:
                raise DatabaseError("Failed to upsert site settings")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error upserting site settings: {e}")
            raise DatabaseError(f"Failed to save site settings") from e

    def update_logo_url(self, logo_url: str) -> Dict[str, Any]:
        """
        Update just the logo URL.

        Args:
            logo_url: New logo URL

        Returns:
            Updated settings record

        Raises:
            DatabaseError: If operation fails
        """
        return self.upsert_settings({'logo_url': logo_url})

    def update_site_name(self, site_name: str) -> Dict[str, Any]:
        """
        Update just the site name.

        Args:
            site_name: New site name

        Returns:
            Updated settings record

        Raises:
            DatabaseError: If operation fails
        """
        return self.upsert_settings({'site_name': site_name})

    def update_favicon_url(self, favicon_url: str) -> Dict[str, Any]:
        """
        Update just the favicon URL.

        Args:
            favicon_url: New favicon URL

        Returns:
            Updated settings record

        Raises:
            DatabaseError: If operation fails
        """
        return self.upsert_settings({'favicon_url': favicon_url})
