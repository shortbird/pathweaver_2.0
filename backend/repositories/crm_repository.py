"""
CRM Repository - Data access layer for email campaign management

Handles database operations for:
- Email campaigns (manual, scheduled, triggered)
- Campaign sends tracking
- User segments
- Email templates
- Automation sequences
"""

import logging
from typing import Optional, Dict, List, Any
from datetime import datetime
from postgrest.exceptions import APIError
from repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from database import get_supabase_admin_client

logger = logging.getLogger(__name__)


class CRMRepository(BaseRepository):
    """
    Repository for CRM system data access.

    Note: All CRM tables require admin access, so this repository
    uses admin client for all operations.
    """

    table_name = 'email_campaigns'  # Default table

    def __init__(self):
        """Initialize CRM repository with admin client (required for CRM operations)"""
        # CRM operations always use admin client (no user_id needed)
        super().__init__(user_id=None)
        # Lazy initialization - client will be created on first access
        self._admin_client = None

    @property
    def client(self):
        """Always return admin client for CRM operations (lazy initialization)"""
        if self._admin_client is None:
            self._admin_client = get_supabase_admin_client()
        return self._admin_client

    # ==================== CAMPAIGNS ====================

    def get_campaigns(
        self,
        status: Optional[str] = None,
        campaign_type: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get all campaigns with optional filtering.

        Args:
            status: Filter by status (draft/scheduled/sent/active/paused)
            campaign_type: Filter by type (manual/scheduled/triggered)
            limit: Maximum number of results
            offset: Pagination offset

        Returns:
            List of campaign dictionaries
        """
        try:
            query = self.client.table('email_campaigns').select('*')

            if status:
                query = query.eq('status', status)
            if campaign_type:
                query = query.eq('campaign_type', campaign_type)

            query = query.order('created_at', desc=True).range(offset, offset + limit - 1)

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error fetching campaigns: {e}")
            raise DatabaseError("Failed to fetch campaigns") from e

    def get_campaign_by_id(self, campaign_id: str) -> Optional[Dict[str, Any]]:
        """Get campaign by ID"""
        try:
            response = (
                self.client.table('email_campaigns')
                .select('*')
                .eq('id', campaign_id)
                .single()
                .execute()
            )
            return response.data
        except APIError as e:
            if 'PGRST116' in str(e):  # Not found error
                return None
            logger.error(f"Error fetching campaign {campaign_id}: {e}")
            raise DatabaseError("Failed to fetch campaign") from e

    def create_campaign(self, campaign_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create new campaign.

        Args:
            campaign_data: Campaign configuration dictionary

        Returns:
            Created campaign dictionary with ID
        """
        try:
            response = (
                self.client.table('email_campaigns')
                .insert(campaign_data)
                .execute()
            )

            if not response.data:
                raise DatabaseError("Campaign creation returned no data")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error creating campaign: {e}")
            raise DatabaseError("Failed to create campaign") from e

    def update_campaign(self, campaign_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update campaign by ID"""
        try:
            response = (
                self.client.table('email_campaigns')
                .update(updates)
                .eq('id', campaign_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Campaign {campaign_id} not found")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error updating campaign {campaign_id}: {e}")
            raise DatabaseError("Failed to update campaign") from e

    def delete_campaign(self, campaign_id: str) -> bool:
        """Delete campaign by ID"""
        try:
            response = (
                self.client.table('email_campaigns')
                .delete()
                .eq('id', campaign_id)
                .execute()
            )
            return True
        except APIError as e:
            logger.error(f"Error deleting campaign {campaign_id}: {e}")
            raise DatabaseError("Failed to delete campaign") from e

    # ==================== CAMPAIGN SENDS ====================

    def log_campaign_send(
        self,
        campaign_id: str,
        user_id: str,
        status: str = 'sent',
        error_message: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Log a campaign send to a user.

        Args:
            campaign_id: UUID of campaign
            user_id: UUID of recipient
            status: sent/failed/bounced
            error_message: Error details if failed
            metadata: Additional data (variables used, SendGrid message ID, etc.)

        Returns:
            Created send record
        """
        try:
            send_data = {
                'campaign_id': campaign_id,
                'user_id': user_id,
                'status': status,
                'error_message': error_message,
                'metadata': metadata or {}
            }

            response = (
                self.client.table('email_campaign_sends')
                .insert(send_data)
                .execute()
            )

            return response.data[0] if response.data else {}

        except APIError as e:
            logger.error(f"Error logging campaign send: {e}")
            # Don't raise - we don't want logging failures to break email sending
            return {}

    def get_campaign_sends(
        self,
        campaign_id: Optional[str] = None,
        user_id: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get campaign send history.

        Args:
            campaign_id: Filter by campaign
            user_id: Filter by user
            limit: Maximum results

        Returns:
            List of send records
        """
        try:
            query = self.client.table('email_campaign_sends').select('*')

            if campaign_id:
                query = query.eq('campaign_id', campaign_id)
            if user_id:
                query = query.eq('user_id', user_id)

            query = query.order('sent_at', desc=True).limit(limit)

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error fetching campaign sends: {e}")
            raise DatabaseError("Failed to fetch campaign sends") from e

    def get_campaign_stats(self, campaign_id: str) -> Dict[str, int]:
        """
        Get aggregated stats for a campaign.

        Returns:
            Dictionary with total_sent, total_failed, total_bounced counts
        """
        try:
            # Get all sends for campaign
            sends = self.get_campaign_sends(campaign_id=campaign_id, limit=10000)

            stats = {
                'total_sent': sum(1 for s in sends if s['status'] == 'sent'),
                'total_failed': sum(1 for s in sends if s['status'] == 'failed'),
                'total_bounced': sum(1 for s in sends if s['status'] == 'bounced'),
                'total': len(sends)
            }

            return stats

        except Exception as e:
            logger.error(f"Error calculating campaign stats: {e}")
            return {'total_sent': 0, 'total_failed': 0, 'total_bounced': 0, 'total': 0}

    # ==================== USER SEGMENTS ====================

    def get_segments(self, created_by: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all saved segments, optionally filtered by creator"""
        try:
            query = self.client.table('user_segments').select('*')

            if created_by:
                query = query.eq('created_by', created_by)

            query = query.order('created_at', desc=True)

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error fetching segments: {e}")
            raise DatabaseError("Failed to fetch segments") from e

    def get_segment_by_id(self, segment_id: str) -> Optional[Dict[str, Any]]:
        """Get segment by ID"""
        try:
            response = (
                self.client.table('user_segments')
                .select('*')
                .eq('id', segment_id)
                .single()
                .execute()
            )
            return response.data
        except APIError as e:
            if 'PGRST116' in str(e):
                return None
            logger.error(f"Error fetching segment {segment_id}: {e}")
            raise DatabaseError("Failed to fetch segment") from e

    def create_segment(self, segment_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create new saved segment"""
        try:
            response = (
                self.client.table('user_segments')
                .insert(segment_data)
                .execute()
            )

            if not response.data:
                raise DatabaseError("Segment creation returned no data")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error creating segment: {e}")
            raise DatabaseError("Failed to create segment") from e

    def update_segment(self, segment_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update segment by ID"""
        try:
            response = (
                self.client.table('user_segments')
                .update(updates)
                .eq('id', segment_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Segment {segment_id} not found")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error updating segment {segment_id}: {e}")
            raise DatabaseError("Failed to update segment") from e

    def delete_segment(self, segment_id: str) -> bool:
        """Delete segment by ID"""
        try:
            self.client.table('user_segments').delete().eq('id', segment_id).execute()
            return True
        except APIError as e:
            logger.error(f"Error deleting segment {segment_id}: {e}")
            raise DatabaseError("Failed to delete segment") from e

    # ==================== EMAIL TEMPLATES ====================

    def get_templates(self, is_system: Optional[bool] = None) -> List[Dict[str, Any]]:
        """
        Get all templates, optionally filtered by system/custom.

        Args:
            is_system: If True, only system templates. If False, only custom templates.

        Returns:
            List of template dictionaries
        """
        try:
            query = self.client.table('email_templates').select('*')

            if is_system is not None:
                query = query.eq('is_system', is_system)

            query = query.order('name')

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error fetching templates: {e}")
            raise DatabaseError("Failed to fetch templates") from e

    def get_template_by_key(self, template_key: str) -> Optional[Dict[str, Any]]:
        """Get template by unique key"""
        try:
            response = (
                self.client.table('email_templates')
                .select('*')
                .eq('template_key', template_key)
                .single()
                .execute()
            )
            return response.data
        except APIError as e:
            if 'PGRST116' in str(e):
                return None
            logger.error(f"Error fetching template {template_key}: {e}")
            raise DatabaseError("Failed to fetch template") from e

    def create_template(self, template_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create new email template"""
        try:
            response = (
                self.client.table('email_templates')
                .insert(template_data)
                .execute()
            )

            if not response.data:
                raise DatabaseError("Template creation returned no data")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error creating template: {e}")
            raise DatabaseError("Failed to create template") from e

    def update_template(self, template_key: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update template by key"""
        try:
            response = (
                self.client.table('email_templates')
                .update(updates)
                .eq('template_key', template_key)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Template {template_key} not found")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error updating template {template_key}: {e}")
            raise DatabaseError("Failed to update template") from e

    def delete_template(self, template_key: str) -> bool:
        """Delete custom template by key (cannot delete system templates)"""
        try:
            # Check if system template
            template = self.get_template_by_key(template_key)
            if template and template.get('is_system'):
                raise DatabaseError("Cannot delete system template")

            self.client.table('email_templates').delete().eq('template_key', template_key).execute()
            return True
        except APIError as e:
            logger.error(f"Error deleting template {template_key}: {e}")
            raise DatabaseError("Failed to delete template") from e

    # ==================== AUTOMATION SEQUENCES ====================

    def get_sequences(self, is_active: Optional[bool] = None) -> List[Dict[str, Any]]:
        """
        Get all automation sequences.

        Args:
            is_active: If True, only active sequences. If False, only inactive.

        Returns:
            List of sequence dictionaries
        """
        try:
            query = self.client.table('automation_sequences').select('*')

            if is_active is not None:
                query = query.eq('is_active', is_active)

            query = query.order('created_at', desc=True)

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error fetching sequences: {e}")
            raise DatabaseError("Failed to fetch sequences") from e

    def get_sequence_by_id(self, sequence_id: str) -> Optional[Dict[str, Any]]:
        """Get sequence by ID"""
        try:
            response = (
                self.client.table('automation_sequences')
                .select('*')
                .eq('id', sequence_id)
                .single()
                .execute()
            )
            return response.data
        except APIError as e:
            if 'PGRST116' in str(e):
                return None
            logger.error(f"Error fetching sequence {sequence_id}: {e}")
            raise DatabaseError("Failed to fetch sequence") from e

    def get_sequences_by_trigger(self, trigger_event: str) -> List[Dict[str, Any]]:
        """Get all ACTIVE sequences for a specific trigger event"""
        try:
            response = (
                self.client.table('automation_sequences')
                .select('*')
                .eq('trigger_event', trigger_event)
                .eq('is_active', True)  # Only active sequences
                .execute()
            )
            return response.data or []
        except APIError as e:
            logger.error(f"Error fetching sequences for trigger {trigger_event}: {e}")
            return []

    def create_sequence(self, sequence_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create new automation sequence (inactive by default)"""
        try:
            # Ensure is_active defaults to False for safety
            sequence_data.setdefault('is_active', False)

            response = (
                self.client.table('automation_sequences')
                .insert(sequence_data)
                .execute()
            )

            if not response.data:
                raise DatabaseError("Sequence creation returned no data")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error creating sequence: {e}")
            raise DatabaseError("Failed to create sequence") from e

    def update_sequence(self, sequence_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update sequence by ID"""
        try:
            response = (
                self.client.table('automation_sequences')
                .update(updates)
                .eq('id', sequence_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Sequence {sequence_id} not found")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error updating sequence {sequence_id}: {e}")
            raise DatabaseError("Failed to update sequence") from e

    def activate_sequence(self, sequence_id: str) -> Dict[str, Any]:
        """Activate a sequence (enables trigger processing)"""
        logger.warning(f"ACTIVATING SEQUENCE {sequence_id} - emails will now be sent automatically")
        return self.update_sequence(sequence_id, {'is_active': True})

    def pause_sequence(self, sequence_id: str) -> Dict[str, Any]:
        """Pause a sequence (disables trigger processing)"""
        logger.info(f"Pausing sequence {sequence_id}")
        return self.update_sequence(sequence_id, {'is_active': False})

    def delete_sequence(self, sequence_id: str) -> bool:
        """Delete sequence by ID"""
        try:
            self.client.table('automation_sequences').delete().eq('id', sequence_id).execute()
            return True
        except APIError as e:
            logger.error(f"Error deleting sequence {sequence_id}: {e}")
            raise DatabaseError("Failed to delete sequence") from e
