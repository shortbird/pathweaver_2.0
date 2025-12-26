"""
Campaign Automation Service - Event-triggered email automation

Handles:
- Processing event triggers (evidence uploaded, quest completed, etc.)
- Checking trigger conditions before sending
- Managing multi-step automation sequences
- Safety checks: only processes ACTIVE campaigns/sequences
"""

import logging
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
from services.base_service import BaseService
from services.crm_service import CRMService
from services.email_template_service import EmailTemplateService
from repositories.crm_repository import CRMRepository
from database import get_supabase_admin_client

logger = logging.getLogger(__name__)


class CampaignAutomationService(BaseService):
    """Service for event-triggered email automation with safety checks"""

    def __init__(self):
        super().__init__()
        self.crm_repo = CRMRepository()
        self.crm_service = CRMService()
        self.template_service = EmailTemplateService()
        self.admin_client = get_supabase_admin_client()

    def process_event_trigger(
        self,
        event_type: str,
        user_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process an event trigger and send any matching automated emails.

        SAFETY: Only processes ACTIVE campaigns and sequences.

        Args:
            event_type: Type of event (e.g., 'evidence_uploaded', 'task_completed')
            user_id: UUID of user who triggered the event
            metadata: Additional event data

        Returns:
            Dictionary with processing results
        """
        try:
            # Find active triggered campaigns for this event
            campaigns = (
                self.admin_client.table('email_campaigns')
                .select('*')
                .eq('campaign_type', 'triggered')
                .eq('trigger_event', event_type)
                .eq('status', 'active')  # SAFETY: Only active campaigns
                .execute()
            )

            active_campaigns = campaigns.data or []

            # Find active sequences for this event
            sequences = self.crm_repo.get_sequences_by_trigger(event_type)

            logger.info(
                f"Event '{event_type}' triggered by user {user_id}: "
                f"{len(active_campaigns)} active campaigns, {len(sequences)} active sequences"
            )

            results = {
                'event_type': event_type,
                'user_id': user_id,
                'campaigns_triggered': 0,
                'sequences_started': 0,
                'emails_sent': 0,
                'errors': []
            }

            # Process triggered campaigns
            for campaign in active_campaigns:
                try:
                    # Check trigger conditions
                    if self._check_trigger_conditions(campaign['trigger_config'], user_id, metadata):
                        # Send single email
                        success = self._send_triggered_email(campaign, user_id)
                        if success:
                            results['campaigns_triggered'] += 1
                            results['emails_sent'] += 1
                        else:
                            results['errors'].append(f"Failed to send campaign {campaign['id']}")
                    else:
                        logger.debug(f"Campaign {campaign['id']} conditions not met for user {user_id}")

                except Exception as e:
                    logger.error(f"Error processing campaign {campaign['id']}: {e}")
                    results['errors'].append(str(e))

            # Process sequences
            for sequence in sequences:
                try:
                    # Start sequence for this user
                    self.start_sequence(sequence['id'], user_id)
                    results['sequences_started'] += 1

                except Exception as e:
                    logger.error(f"Error starting sequence {sequence['id']}: {e}")
                    results['errors'].append(str(e))

            return results

        except Exception as e:
            logger.error(f"Error processing event trigger '{event_type}': {e}")
            return {
                'event_type': event_type,
                'user_id': user_id,
                'campaigns_triggered': 0,
                'sequences_started': 0,
                'emails_sent': 0,
                'errors': [str(e)]
            }

    def start_sequence(self, sequence_id: str, user_id: str) -> bool:
        """
        Start an automation sequence for a user.

        Args:
            sequence_id: Sequence UUID
            user_id: User UUID

        Returns:
            True if sequence started successfully
        """
        try:
            sequence = self.crm_repo.get_sequence_by_id(sequence_id)
            if not sequence:
                logger.error(f"Sequence {sequence_id} not found")
                return False

            # SAFETY CHECK: Only start active sequences
            if not sequence.get('is_active', False):
                logger.warning(f"Sequence {sequence_id} is INACTIVE, not starting for user {user_id}")
                return False

            steps = sequence.get('steps', [])
            if not steps:
                logger.warning(f"Sequence {sequence_id} has no steps")
                return False

            logger.info(f"Starting sequence '{sequence['name']}' for user {user_id} ({len(steps)} steps)")

            # Process first step immediately (delay=0) or schedule others
            for step in steps:
                delay_hours = step.get('delay_hours', 0)

                if delay_hours == 0:
                    # Send immediately
                    self._process_sequence_step(sequence_id, user_id, step)
                else:
                    # TODO: Schedule for later (requires background job scheduler)
                    # For now, log that scheduling is not yet implemented
                    logger.warning(
                        f"Sequence step with delay {delay_hours}h not yet implemented. "
                        f"Requires background job scheduler (APScheduler or Celery)."
                    )

            return True

        except Exception as e:
            logger.error(f"Error starting sequence {sequence_id} for user {user_id}: {e}")
            return False

    def start_sequence_by_email(
        self,
        sequence_name: str,
        email: str,
        context: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Start an automation sequence for a non-user (email-only contact).
        Used for promo signups and lead nurturing.

        Args:
            sequence_name: Name of sequence (e.g., 'promo_credit_tracker')
            email: Recipient email address
            context: Additional variables for email personalization

        Returns:
            True if sequence started successfully
        """
        try:
            # Find sequence by name
            sequences = (
                self.admin_client.table('automation_sequences')
                .select('*')
                .eq('name', sequence_name)
                .eq('is_active', True)
                .execute()
            )

            if not sequences.data:
                logger.error(f"Active sequence '{sequence_name}' not found")
                return False

            sequence = sequences.data[0]
            steps = sequence.get('steps', [])

            if not steps:
                logger.warning(f"Sequence '{sequence_name}' has no steps")
                return False

            logger.info(f"Starting sequence '{sequence_name}' for email {email} ({len(steps)} steps)")

            # Process first step immediately (delay=0)
            for step in steps:
                delay_hours = step.get('delay_hours', 0)

                if delay_hours == 0:
                    # Send immediately
                    self._process_sequence_step_by_email(sequence['id'], email, step, context)
                else:
                    logger.warning(
                        f"Sequence step with delay {delay_hours}h not yet implemented. "
                        f"Requires background job scheduler."
                    )

            return True

        except Exception as e:
            logger.error(f"Error starting sequence '{sequence_name}' for email {email}: {e}")
            return False

    def _check_trigger_conditions(
        self,
        trigger_config: Optional[Dict[str, Any]],
        user_id: str,
        metadata: Optional[Dict[str, Any]]
    ) -> bool:
        """
        Check if trigger conditions are met for a user.

        Supported conditions:
        - email_not_verified: User's email is not verified
        - no_quests_started: User has never started a quest
        - tutor_unused: User has never used AI tutor
        - no_connections: User has no connections
        - min_quest_count: User has at least X quests
        - max_quest_count: User has at most X quests

        Args:
            trigger_config: Condition configuration
            user_id: User UUID
            metadata: Event metadata

        Returns:
            True if all conditions met
        """
        if not trigger_config:
            return True  # No conditions = always trigger

        try:
            # Check email_not_verified
            if 'email_not_verified' in trigger_config:
                # Check if user's email is verified (welcome_email_sent is proxy)
                user = self._get_user(user_id)
                # Assuming email verification sets welcome_email_sent to True
                email_verified = user.get('welcome_email_sent', False)

                if trigger_config['email_not_verified'] and email_verified:
                    return False

            # Check no_quests_started
            if 'no_quests_started' in trigger_config:
                quest_count = self._get_user_quest_count(user_id)

                if trigger_config['no_quests_started'] and quest_count > 0:
                    return False

            # Check tutor_unused
            if 'tutor_unused' in trigger_config:
                has_tutor = self._user_has_tutor_usage(user_id)

                if trigger_config['tutor_unused'] and has_tutor:
                    return False

            # Check no_connections
            if 'no_connections' in trigger_config:
                has_connections = self._user_has_connections(user_id)

                if trigger_config['no_connections'] and has_connections:
                    return False

            # Check min_quest_count
            if 'min_quest_count' in trigger_config:
                quest_count = self._get_user_quest_count(user_id)

                if quest_count < trigger_config['min_quest_count']:
                    return False

            # Check max_quest_count
            if 'max_quest_count' in trigger_config:
                quest_count = self._get_user_quest_count(user_id)

                if quest_count > trigger_config['max_quest_count']:
                    return False

            # All conditions met
            return True

        except Exception as e:
            logger.error(f"Error checking trigger conditions: {e}")
            return False

    def _process_sequence_step(
        self,
        sequence_id: str,
        user_id: str,
        step: Dict[str, Any]
    ) -> bool:
        """
        Process a single step in an automation sequence.

        Args:
            sequence_id: Sequence UUID
            user_id: User UUID
            step: Step configuration with template_key and condition

        Returns:
            True if email sent successfully
        """
        try:
            # Check step condition
            condition = step.get('condition')
            if condition:
                # Map condition string to trigger_config format
                condition_map = {
                    'email_not_verified': {'email_not_verified': True},
                    'no_quests_started': {'no_quests_started': True},
                    'tutor_unused': {'tutor_unused': True},
                    'no_connections': {'no_connections': True}
                }

                trigger_config = condition_map.get(condition, {})

                if not self._check_trigger_conditions(trigger_config, user_id, {}):
                    logger.info(f"Sequence step condition '{condition}' not met for user {user_id}, skipping")
                    return False

            # Get template
            template_key = step.get('template_key')
            if not template_key:
                logger.error(f"Sequence step missing template_key")
                return False

            template = self.template_service.get_template(template_key)
            if not template:
                logger.error(f"Template '{template_key}' not found")
                return False

            # Get user details
            user = self._get_user(user_id)
            if not user:
                logger.error(f"User {user_id} not found")
                return False

            # Prepare variables
            variables = self.crm_service._prepare_user_variables(user)

            # Render email
            rendered = self.crm_service._render_email(
                template=template,
                subject_override=template['subject'],
                variables=variables
            )

            # Send email
            from services.email_service import EmailService
            email_service = EmailService()

            success = email_service.send_email(
                to_email=user['email'],
                subject=rendered['subject'],
                html_body=rendered['html_body'],
                text_body=rendered.get('text_body'),
                sender_name_override=rendered.get('sender_name')
            )

            # Log send (create a pseudo-campaign for sequence emails)
            if success:
                logger.info(f"Sent sequence email '{template_key}' to user {user_id}")
            else:
                logger.error(f"Failed to send sequence email '{template_key}' to user {user_id}")

            return success

        except Exception as e:
            logger.error(f"Error processing sequence step: {e}")
            return False

    def _process_sequence_step_by_email(
        self,
        sequence_id: str,
        email: str,
        step: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Process a single sequence step for an email-only contact (non-user).

        Args:
            sequence_id: Sequence UUID
            email: Recipient email address
            step: Step configuration with template_key
            context: Additional variables for personalization

        Returns:
            True if email sent successfully
        """
        try:
            # Get template
            template_key = step.get('template_key')
            if not template_key:
                logger.error(f"Sequence step missing template_key")
                return False

            template = self.template_service.get_template(template_key)
            if not template:
                logger.error(f"Template '{template_key}' not found")
                return False

            # Prepare variables from context
            variables = context or {}
            variables.setdefault('email', email)

            # Render email
            rendered = self.crm_service._render_email(
                template=template,
                subject_override=template.get('subject'),
                variables=variables
            )

            # Send email
            from services.email_service import EmailService
            email_service = EmailService()

            success = email_service.send_email(
                to_email=email,
                subject=rendered['subject'],
                html_body=rendered['html_body'],
                text_body=rendered.get('text_body'),
                sender_name_override=rendered.get('sender_name')
            )

            if success:
                logger.info(f"Sent sequence email '{template_key}' to {email}")
            else:
                logger.error(f"Failed to send sequence email '{template_key}' to {email}")

            return success

        except Exception as e:
            logger.error(f"Error processing sequence step for email {email}: {e}")
            return False

    def _send_triggered_email(self, campaign: Dict[str, Any], user_id: str) -> bool:
        """
        Send a triggered campaign email to a user.

        Args:
            campaign: Campaign dictionary
            user_id: User UUID

        Returns:
            True if sent successfully
        """
        try:
            # Get user
            user = self._get_user(user_id)
            if not user:
                logger.error(f"User {user_id} not found")
                return False

            # Check email preferences
            if not user.get('marketing_emails_enabled', True):
                logger.debug(f"Skipping user {user_id} - marketing emails disabled")
                return False

            # Get template
            template = self.template_service.get_template(campaign['template_key'])
            if not template:
                logger.error(f"Template '{campaign['template_key']}' not found")
                return False

            # Prepare variables
            variables = self.crm_service._prepare_user_variables(user)

            # Render email
            rendered = self.crm_service._render_email(
                template=template,
                subject_override=campaign['subject'],
                variables=variables
            )

            # Send email
            from services.email_service import EmailService
            email_service = EmailService()

            success = email_service.send_email(
                to_email=user['email'],
                subject=rendered['subject'],
                html_body=rendered['html_body'],
                text_body=rendered.get('text_body'),
                sender_name_override=rendered.get('sender_name')
            )

            # Log send result
            status = 'sent' if success else 'failed'
            self.crm_repo.log_campaign_send(
                campaign_id=campaign['id'],
                user_id=user_id,
                status=status,
                metadata={'variables': variables, 'triggered': True}
            )

            return success

        except Exception as e:
            logger.error(f"Error sending triggered email: {e}")
            return False

    # ==================== HELPER METHODS ====================

    def _get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user by ID"""
        try:
            response = (
                self.admin_client.table('users')
                .select('*')
                .eq('id', user_id)
                .single()
                .execute()
            )
            return response.data
        except Exception as e:
            logger.error(f"Error getting user {user_id}: {e}")
            return None

    def _get_user_quest_count(self, user_id: str) -> int:
        """Get count of user's started quests"""
        try:
            response = (
                self.admin_client.table('user_quests')
                .select('id', count='exact')
                .eq('user_id', user_id)
                .execute()
            )
            return response.count or 0
        except Exception:
            return 0

    def _user_has_connections(self, user_id: str) -> bool:
        """Check if user has connections"""
        try:
            response = (
                self.admin_client.table('friendships')
                .select('id', count='exact')
                .or_(f'requester_id.eq.{user_id},addressee_id.eq.{user_id}')
                .eq('status', 'accepted')
                .limit(1)
                .execute()
            )
            return (response.count or 0) > 0
        except Exception:
            return False

    def _user_has_tutor_usage(self, user_id: str) -> bool:
        """Check if user has used AI tutor"""
        try:
            response = (
                self.admin_client.table('tutor_conversations')
                .select('id', count='exact')
                .eq('user_id', user_id)
                .limit(1)
                .execute()
            )
            return (response.count or 0) > 0
        except Exception:
            return False
