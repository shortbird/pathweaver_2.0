"""
CRM Service - Business logic for campaign management and user segmentation

Handles:
- User segmentation with complex filter rules
- Campaign sending with recipient validation
- Variable substitution for email personalization
- Email preference enforcement
- Dry-run mode for testing
"""

import logging
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
from services.base_service import BaseService
from services.email_service import EmailService
from services.email_template_service import EmailTemplateService
from repositories.crm_repository import CRMRepository
from database import get_supabase_admin_client
from jinja2 import Environment, Template

logger = logging.getLogger(__name__)


class CRMService(BaseService):
    """Service for CRM campaign management and user segmentation"""

    def __init__(self):
        super().__init__()
        self.crm_repo = CRMRepository()
        self.email_service = EmailService()
        self.template_service = EmailTemplateService()
        # Lazy initialization - client will be created on first access
        self._admin_client = None

    @property
    def admin_client(self):
        """Get admin client with lazy initialization"""
        if self._admin_client is None:
            self._admin_client = get_supabase_admin_client()
        return self._admin_client

    def segment_users(self, filter_rules: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Apply segmentation rules to filter users.

        Supported filters:
        - role: student/parent/advisor/admin/observer
        - last_active_days: Users inactive for X days (e.g., 30)
        - min_quest_completions: Minimum completed quests
        - max_quest_completions: Maximum completed quests
        - min_xp: Minimum total XP
        - max_xp: Maximum total XP
        - registration_date_after: ISO date string
        - registration_date_before: ISO date string
        - marketing_emails_enabled: true/false
        - has_connections: true/false
        - has_tutor_usage: true/false

        Args:
            filter_rules: Dictionary of filter conditions

        Returns:
            List of user dictionaries matching all conditions
        """
        try:
            # Start with base query
            query = self.admin_client.table('users').select('*')

            # Apply role filter
            if 'role' in filter_rules:
                query = query.eq('role', filter_rules['role'])

            # Apply marketing email preference
            if 'marketing_emails_enabled' in filter_rules:
                query = query.eq('marketing_emails_enabled', filter_rules['marketing_emails_enabled'])

            # Apply registration date filters
            if 'registration_date_after' in filter_rules:
                query = query.gte('created_at', filter_rules['registration_date_after'])

            if 'registration_date_before' in filter_rules:
                query = query.lte('created_at', filter_rules['registration_date_before'])

            # Execute base query
            response = query.execute()
            users = response.data or []

            logger.info(f"Base query returned {len(users)} users")

            # Apply complex filters that require joins or calculations
            filtered_users = []

            for user in users:
                # Last active filter
                if 'last_active_days' in filter_rules:
                    if user.get('last_active'):
                        last_active = datetime.fromisoformat(user['last_active'].replace('Z', '+00:00'))
                        days_inactive = (datetime.now(last_active.tzinfo) - last_active).days

                        if days_inactive < filter_rules['last_active_days']:
                            continue  # Skip this user
                    else:
                        # No last_active means never logged in - treat as inactive
                        pass

                # XP filters
                if 'min_xp' in filter_rules:
                    if (user.get('total_xp') or 0) < filter_rules['min_xp']:
                        continue

                if 'max_xp' in filter_rules:
                    if (user.get('total_xp') or 0) > filter_rules['max_xp']:
                        continue

                # Quest completion filters (requires join query)
                if 'min_quest_completions' in filter_rules or 'max_quest_completions' in filter_rules:
                    quest_count = self._get_user_quest_completions(user['id'])

                    if 'min_quest_completions' in filter_rules:
                        if quest_count < filter_rules['min_quest_completions']:
                            continue

                    if 'max_quest_completions' in filter_rules:
                        if quest_count > filter_rules['max_quest_completions']:
                            continue

                # Connections filter
                if 'has_connections' in filter_rules:
                    has_connections = self._user_has_connections(user['id'])

                    if filter_rules['has_connections'] and not has_connections:
                        continue
                    if not filter_rules['has_connections'] and has_connections:
                        continue

                # Tutor usage filter
                if 'has_tutor_usage' in filter_rules:
                    has_tutor = self._user_has_tutor_usage(user['id'])

                    if filter_rules['has_tutor_usage'] and not has_tutor:
                        continue
                    if not filter_rules['has_tutor_usage'] and has_tutor:
                        continue

                # User passed all filters
                filtered_users.append(user)

            logger.info(f"Segmentation returned {len(filtered_users)} users matching all filters")
            return filtered_users

        except Exception as e:
            logger.error(f"Error segmenting users: {e}")
            raise

    def preview_campaign_recipients(
        self,
        campaign_id: Optional[str] = None,
        recipient_segment: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Preview recipients for a campaign without sending.

        Args:
            campaign_id: Campaign ID to preview (will load segment from campaign)
            recipient_segment: Or provide segment rules directly

        Returns:
            Dictionary with recipient count and sample users
        """
        try:
            # Load segment from campaign if ID provided
            if campaign_id:
                campaign = self.crm_repo.get_campaign_by_id(campaign_id)
                if not campaign:
                    raise ValueError(f"Campaign {campaign_id} not found")
                recipient_segment = campaign.get('recipient_segment', {})

            if not recipient_segment:
                raise ValueError("No recipient segment provided")

            # Get matching users
            users = self.segment_users(recipient_segment)

            # Return count and sample
            return {
                'total_recipients': len(users),
                'sample_recipients': users[:10],  # First 10 for preview
                'filter_rules': recipient_segment
            }

        except Exception as e:
            logger.error(f"Error previewing campaign recipients: {e}")
            raise

    def send_campaign(
        self,
        campaign_id: str,
        dry_run: bool = False
    ) -> Dict[str, Any]:
        """
        Send a campaign to all recipients.

        Args:
            campaign_id: Campaign ID to send
            dry_run: If True, validate but don't actually send emails

        Returns:
            Dictionary with send results (sent, failed, skipped counts)
        """
        try:
            # Load campaign
            campaign = self.crm_repo.get_campaign_by_id(campaign_id)
            if not campaign:
                raise ValueError(f"Campaign {campaign_id} not found")

            # Check campaign status
            if campaign['status'] not in ['draft', 'scheduled']:
                raise ValueError(f"Campaign status is '{campaign['status']}', cannot send")

            # Load template
            template = self.template_service.get_template(campaign['template_key'])
            if not template:
                raise ValueError(f"Template '{campaign['template_key']}' not found")

            # Get recipients
            recipient_segment = campaign.get('recipient_segment', {})
            recipients = self.segment_users(recipient_segment)

            if not recipients:
                logger.warning(f"No recipients found for campaign {campaign_id}")
                return {
                    'total_recipients': 0,
                    'sent': 0,
                    'failed': 0,
                    'skipped': 0,
                    'dry_run': dry_run
                }

            logger.info(f"Sending campaign {campaign_id} to {len(recipients)} recipients (dry_run={dry_run})")

            results = {
                'total_recipients': len(recipients),
                'sent': 0,
                'failed': 0,
                'skipped': 0,
                'dry_run': dry_run
            }

            # Send to each recipient
            for user in recipients:
                try:
                    # Check email preferences
                    if not user.get('marketing_emails_enabled', True):
                        logger.debug(f"Skipping user {user['id']} - marketing emails disabled")
                        results['skipped'] += 1
                        continue

                    # Prepare variables for template
                    variables = self._prepare_user_variables(user)

                    # Render email content
                    rendered = self._render_email(template, campaign['subject'], variables)

                    # Send email (unless dry run)
                    if not dry_run:
                        success = self.email_service.send_email(
                            to_email=user['email'],
                            subject=rendered['subject'],
                            html_body=rendered['html_body'],
                            text_body=rendered.get('text_body'),
                            sender_name_override=rendered.get('sender_name')
                        )

                        # Log send result
                        status = 'sent' if success else 'failed'
                        self.crm_repo.log_campaign_send(
                            campaign_id=campaign_id,
                            user_id=user['id'],
                            status=status,
                            metadata={'variables': variables}
                        )

                        if success:
                            results['sent'] += 1
                        else:
                            results['failed'] += 1
                    else:
                        # Dry run - just count as sent
                        results['sent'] += 1

                except Exception as e:
                    logger.error(f"Error sending to user {user.get('id')}: {e}")
                    results['failed'] += 1

                    if not dry_run:
                        self.crm_repo.log_campaign_send(
                            campaign_id=campaign_id,
                            user_id=user['id'],
                            status='failed',
                            error_message=str(e)
                        )

            # Update campaign status
            if not dry_run:
                self.crm_repo.update_campaign(campaign_id, {
                    'status': 'sent',
                    'sent_at': datetime.utcnow().isoformat()
                })

            logger.info(f"Campaign {campaign_id} complete: {results}")
            return results

        except Exception as e:
            logger.error(f"Error sending campaign {campaign_id}: {e}")
            raise

    def validate_template_variables(self, template_key: str) -> List[str]:
        """
        Extract all variable placeholders from a template.

        Args:
            template_key: Template identifier

        Returns:
            List of variable names used in template
        """
        try:
            template = self.template_service.get_template(template_key)
            if not template:
                return []

            # Extract variables from subject and template data
            variables = set()
            template_data = template['data']

            # Check subject
            subject = template.get('subject', '')
            variables.update(self._extract_variables(subject))

            # Check common fields
            for field in ['greeting', 'salutation', 'title']:
                if field in template_data:
                    variables.update(self._extract_variables(str(template_data[field])))

            # Check paragraphs
            if 'paragraphs' in template_data:
                for para in template_data['paragraphs']:
                    variables.update(self._extract_variables(str(para)))

            return sorted(list(variables))

        except Exception as e:
            logger.error(f"Error validating template variables: {e}")
            return []

    # ==================== HELPER METHODS ====================

    def _get_user_quest_completions(self, user_id: str) -> int:
        """Get count of completed quests for a user"""
        try:
            response = (
                self.admin_client.table('user_quests')
                .select('id', count='exact')
                .eq('user_id', user_id)
                .not_.is_('completed_at', 'null')
                .execute()
            )
            return response.count or 0
        except Exception as e:
            logger.error(f"Error getting quest completions for user {user_id}: {e}")
            return 0

    def _user_has_connections(self, user_id: str) -> bool:
        """Check if user has any connections"""
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
        except Exception as e:
            logger.error(f"Error checking connections for user {user_id}: {e}")
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
        except Exception as e:
            logger.error(f"Error checking tutor usage for user {user_id}: {e}")
            return False

    def _prepare_user_variables(self, user: Dict[str, Any]) -> Dict[str, Any]:
        """
        Prepare variable dictionary for a user.

        Args:
            user: User dictionary from database

        Returns:
            Dictionary of template variables
        """
        return {
            'user_name': user.get('display_name') or user.get('first_name') or 'there',
            'first_name': user.get('first_name') or 'there',
            'last_name': user.get('last_name') or '',
            'email': user.get('email') or '',
            'total_xp': user.get('total_xp') or 0,
            'level': user.get('level') or 1,
            'streak_days': user.get('streak_days') or 0,
            'dashboard_url': 'https://www.optioeducation.com/dashboard',
            'quests_url': 'https://www.optioeducation.com/quests',
            'profile_url': 'https://www.optioeducation.com/profile',
            'tutor_url': 'https://www.optioeducation.com/tutor',
            'connections_url': 'https://www.optioeducation.com/connections'
        }

    def _render_email(
        self,
        template: Dict[str, Any],
        subject_override: Optional[str],
        variables: Dict[str, Any]
    ) -> Dict[str, str]:
        """
        Render email content from template with variables.

        Args:
            template: Template dictionary
            subject_override: Custom subject (or None to use template subject)
            variables: Variable values for substitution

        Returns:
            Dictionary with 'subject', 'html_body', 'text_body'
        """
        try:
            # Use EmailService's _render_email_template for consistent rendering
            # This ensures preview matches actual sent emails
            return self.email_service._render_email_template(
                template=template,
                subject_override=subject_override,
                variables=variables
            )

        except Exception as e:
            logger.error(f"Error rendering email template: {e}")
            raise

    def _generate_basic_html(self, template_data: Dict[str, Any], variables: Dict[str, Any]) -> str:
        """Generate basic HTML email from template data"""
        html_parts = ['<html><body style="font-family: Arial, sans-serif;">']

        # Greeting
        if 'greeting' in template_data:
            greeting_template = Template(template_data['greeting'])
            html_parts.append(f'<h2>{greeting_template.render(**variables)}</h2>')

        # Paragraphs
        if 'paragraphs' in template_data:
            for para in template_data['paragraphs']:
                para_template = Template(para)
                html_parts.append(f'<p>{para_template.render(**variables)}</p>')

        # CTA button
        if 'cta' in template_data:
            cta = template_data['cta']
            cta_text_template = Template(cta.get('text', 'Click here'))
            cta_url_template = Template(cta.get('url', '#'))
            html_parts.append(
                f'<p><a href="{cta_url_template.render(**variables)}" '
                f'style="background: linear-gradient(to right, #6D469B, #EF597B); '
                f'color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">'
                f'{cta_text_template.render(**variables)}</a></p>'
            )

        html_parts.append('</body></html>')
        return ''.join(html_parts)

    def _html_to_text(self, html: str) -> str:
        """Convert HTML to plain text (basic implementation)"""
        import re
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', ' ', html)
        # Clean up whitespace
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

    def _extract_variables(self, text: str) -> set:
        """Extract {variable_name} placeholders from text"""
        import re
        return set(re.findall(r'\{(\w+)\}', text))
