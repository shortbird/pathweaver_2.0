"""
Email service for sending custom transactional emails using Jinja2 templates
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List, Dict, Any
from services.base_service import BaseService
import logging
from jinja2 import Environment, FileSystemLoader, select_autoescape, TemplateNotFound
from services.email_copy_loader import email_copy_loader

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)

class EmailService(BaseService):
    def __init__(self):
        # SMTP Configuration from environment variables
        self.smtp_host = os.getenv('SMTP_HOST', 'smtp.sendgrid.net')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.smtp_user = os.getenv('SMTP_USER', 'apikey')
        self.smtp_pass = os.getenv('SMTP_PASS', '')
        self.sender_email = os.getenv('SENDER_EMAIL', 'support@optioeducation.com')
        self.sender_name = os.getenv('SENDER_NAME', 'Optio Support')

        # Set up Jinja2 template environment
        template_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'templates')
        self.jinja_env = Environment(
            loader=FileSystemLoader(template_dir),
            autoescape=select_autoescape(['html', 'xml']),
            trim_blocks=True,
            lstrip_blocks=True
        )

        # Load email copy loader for centralized copy management
        self.copy_loader = email_copy_loader

    def send_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: Optional[str] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None
    ) -> bool:
        """
        Send an email using configured SMTP settings

        Args:
            to_email: Recipient email address
            subject: Email subject
            html_body: HTML content of the email
            text_body: Plain text content (optional)
            cc: List of CC recipients (optional)
            bcc: List of BCC recipients (optional)

        Returns:
            True if email sent successfully, False otherwise
        """
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['From'] = f"{self.sender_name} <{self.sender_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject

            if cc:
                msg['Cc'] = ', '.join(cc)

            # Add plain text part if provided
            if text_body:
                text_part = MIMEText(text_body, 'plain')
                msg.attach(text_part)

            # Add HTML part
            html_part = MIMEText(html_body, 'html')
            msg.attach(html_part)

            # Disable SendGrid click tracking to avoid HTTP warning
            msg['X-SMTPAPI'] = '{"filters": {"clicktrack": {"settings": {"enable": 0}}}}'

            # Automatically BCC support email for monitoring all outgoing emails
            support_email = 'support@optioeducation.com'
            bcc = bcc or []
            if support_email not in bcc:
                bcc.append(support_email)

            # Prepare recipient list
            recipients = [to_email]
            if cc:
                recipients.extend(cc)
            if bcc:
                recipients.extend(bcc)

            # Send email
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_pass)
                server.send_message(msg, to_addrs=recipients)

            logger.info(f"Email sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False

    def _process_copy_strings(self, data: Any, context: Dict[str, Any]) -> Any:
        """
        Recursively process YAML copy data to substitute variables using Python string formatting.
        Handles {variable_name} syntax in YAML strings.
        """
        if isinstance(data, str):
            # Use Python string formatting for {variable_name} syntax
            try:
                return data.format(**context)
            except KeyError:
                # If a variable is missing, return the string as-is
                return data
        elif isinstance(data, dict):
            return {key: self._process_copy_strings(value, context) for key, value in data.items()}
        elif isinstance(data, list):
            return [self._process_copy_strings(item, context) for item in data]
        else:
            return data

    def send_templated_email(
        self,
        to_email: str,
        subject: str,
        template_name: str,
        context: Dict[str, Any],
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None
    ) -> bool:
        """
        Send an email using the CRM template system (database overrides + YAML fallback)

        Args:
            to_email: Recipient email address
            subject: Email subject (can be overridden by template)
            template_name: Name of the template (e.g., 'welcome', 'password_reset')
            context: Dictionary of variables to pass to the template
            cc: List of CC recipients (optional)
            bcc: List of BCC recipients (optional)

        Returns:
            True if email sent successfully, False otherwise
        """
        try:
            # Use CRM service to render template (handles database overrides + YAML fallback)
            from services.crm_service import CRMService
            crm_service = CRMService()

            # Render email using CRM template system
            rendered = crm_service.render_email_template(
                template_key=template_name,
                variables=context
            )

            # Use rendered subject and body
            html_body = rendered['html_body']
            text_body = rendered['text_body']
            final_subject = rendered['subject']

            # Send email
            return self.send_email(to_email, final_subject, html_body, text_body, cc, bcc)

        except TemplateNotFound as e:
            logger.error(f"Template not found: {template_name} - {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Failed to render template {template_name}: {str(e)}")
            return False

    def send_welcome_email(self, user_email: str, user_name: str) -> bool:
        """
        Send a welcome email to new users.
        Uses CRM template system (database override or YAML default).
        """
        return self.send_templated_email(
            to_email=user_email,
            subject="Welcome to Optio!",  # Can be overridden by template
            template_name='welcome',
            context={
                'user_name': user_name,
                'first_name': user_name  # For compatibility
            }
        )

    def send_confirmation_email(self, user_email: str, user_name: str, confirmation_link: str) -> bool:
        """
        Send signup confirmation email to new users.
        Uses CRM template system (database override or YAML default).
        """
        return self.send_templated_email(
            to_email=user_email,
            subject="Confirm your Optio account",  # Can be overridden by template
            template_name='email_confirmation',
            context={
                'user_name': user_name,
                'first_name': user_name,  # For compatibility
                'confirmation_link': confirmation_link
            }
        )

    def send_quest_completion_email(self, user_email: str, user_name: str, quest_title: str, xp_earned: int) -> bool:
        """Send email when user completes a quest"""
        return self.send_templated_email(
            to_email=user_email,
            subject=f"Congratulations! You completed '{quest_title}'",
            template_name='quest_completion',
            context={
                'user_name': user_name,
                'quest_title': quest_title,
                'xp_earned': xp_earned
            }
        )

    def send_promo_welcome_email(self, parent_email: str, parent_name: str, teen_age: str, activity: str = '') -> bool:
        """Send welcome email to parents who fill out the promo form"""
        tanner_email = os.getenv('ADMIN_EMAIL', 'tanner@optioeducation.com')

        # Format teen_age_text for template (handles empty/None values)
        teen_age_text = ''
        if teen_age and str(teen_age).strip():
            teen_age_text = f" (age {teen_age})"

        # Format activity_text for template (handles empty/None values)
        activity_text = ''
        if activity and str(activity).strip():
            activity_text = f" We're excited to hear that they're interested in {activity}."

        return self.send_templated_email(
            to_email=parent_email,
            subject="Welcome to Optio! Let's Chat About Your Teen's Future",
            template_name='promo_welcome',
            context={
                'parent_name': parent_name,
                'teen_age_text': teen_age_text,
                'activity_text': activity_text
            },
            bcc=[tanner_email]  # Copy Tanner for personal follow-up
        )

    def send_consultation_confirmation_email(self, parent_email: str, parent_name: str) -> bool:
        """Send confirmation email after consultation booking"""
        return self.send_templated_email(
            to_email=parent_email,
            subject="Consultation Request Received - Optio",
            template_name='consultation_confirmation',
            context={
                'parent_name': parent_name
            }
        )

    def send_parental_consent_email(
        self,
        parent_email: str,
        parent_name: str,
        child_name: str,
        verification_link: str
    ) -> bool:
        """Send parental consent verification email"""
        return self.send_templated_email(
            to_email=parent_email,
            subject="Parental Consent Required - Optio Account",
            template_name='parental_consent',
            context={
                'parent_name': parent_name,
                'child_name': child_name,
                'verification_link': verification_link
            }
        )

    def send_parent_invitation_email(
        self,
        parent_email: str,
        student_name: str,
        invitation_link: str
    ) -> bool:
        """Send parent invitation email from student"""
        return self.send_templated_email(
            to_email=parent_email,
            subject=f"{student_name} invited you to Optio",
            template_name='parent_invitation',
            context={
                'student_name': student_name,
                'invitation_link': invitation_link
            }
        )

    def send_subscription_request_confirmation(
        self,
        user_email: str,
        user_name: str,
        tier_requested: str,
        tier_display_name: str,
        contact_preference: str,
        phone_number: str = None
    ) -> bool:
        """Send confirmation email to user after subscription upgrade request"""
        return self.send_templated_email(
            to_email=user_email,
            subject=f"Your {tier_display_name} Upgrade Request Has Been Received",
            template_name='subscription_request_user',
            context={
                'user_name': user_name,
                'tier_requested': tier_requested,
                'tier_display_name': tier_display_name,
                'contact_preference': contact_preference,
                'phone_number': phone_number
            }
        )

    def send_subscription_request_admin_notification(
        self,
        user_name: str,
        user_email: str,
        user_id: str,
        tier_requested: str,
        tier_display_name: str,
        current_tier: str,
        contact_preference: str,
        phone_number: str = None,
        message: str = None
    ) -> bool:
        """Send notification email to support team about new subscription request"""
        admin_email = os.getenv('ADMIN_EMAIL', 'support@optioeducation.com')
        return self.send_templated_email(
            to_email=admin_email,
            subject=f"New Subscription Request: {user_name} → {tier_display_name}",
            template_name='subscription_request_admin',
            context={
                'user_name': user_name,
                'user_email': user_email,
                'user_id': user_id,
                'tier_requested': tier_requested,
                'tier_display_name': tier_display_name,
                'current_tier': current_tier,
                'contact_preference': contact_preference,
                'phone_number': phone_number,
                'message': message
            }
        )

    def send_password_reset_email(
        self,
        user_email: str,
        user_name: str,
        reset_link: str,
        expiry_hours: int = 24
    ) -> bool:
        """
        Send password reset email with secure reset link.
        Uses CRM template system (database override or YAML default).

        Args:
            user_email: Recipient email address
            user_name: User's display name
            reset_link: Secure password reset link (generated by Supabase)
            expiry_hours: Hours until link expires (default 24)

        Returns:
            True if email sent successfully, False otherwise
        """
        return self.send_templated_email(
            to_email=user_email,
            subject="Reset Your Optio Password",  # Can be overridden by template
            template_name='password_reset',
            context={
                'user_name': user_name,
                'first_name': user_name,  # For compatibility
                'reset_link': reset_link,
                'expiry_hours': expiry_hours
            }
        )

    def send_service_inquiry_notification(
        self,
        user_name: str,
        user_email: str,
        user_phone: str,
        service_name: str,
        message: str
    ) -> bool:
        """
        Send service inquiry confirmation to user with Optio support CC'd

        This sends ONE email TO the user/parent with support@optioeducation.com CC'd,
        so the client gets confirmation and Optio receives the notification.

        Args:
            user_name: Name of the person who submitted inquiry
            user_email: Email of the person who submitted inquiry
            user_phone: Phone number (optional)
            service_name: Name of the service
            message: Inquiry message

        Returns:
            True if email sent successfully, False otherwise
        """
        support_email = 'support@optioeducation.com'

        # Format phone display
        phone_display = user_phone if user_phone else 'Not provided'

        return self.send_templated_email(
            to_email=user_email,  # Send TO the client/parent
            subject=f"We Received Your Inquiry About {service_name}",
            template_name='service_inquiry_notification',
            context={
                'name': user_name,
                'email': user_email,
                'phone': phone_display,
                'service_name': service_name,
                'message': message
            },
            cc=[support_email]  # CC Optio support for notification
        )

# Create singleton instance
email_service = EmailService()
