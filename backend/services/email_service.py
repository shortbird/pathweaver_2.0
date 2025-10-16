"""
Email service for sending custom transactional emails using Jinja2 templates
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List, Dict, Any
import logging
from jinja2 import Environment, FileSystemLoader, select_autoescape, TemplateNotFound

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        # SMTP Configuration from environment variables
        self.smtp_host = os.getenv('SMTP_HOST', 'smtp.sendgrid.net')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.smtp_user = os.getenv('SMTP_USER', 'apikey')
        self.smtp_pass = os.getenv('SMTP_PASS', '')
        self.sender_email = os.getenv('SENDER_EMAIL', 'tanner@optioeducation.com')
        self.sender_name = os.getenv('SENDER_NAME', 'Tanner from Optio')

        # Set up Jinja2 template environment
        template_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'templates')
        self.jinja_env = Environment(
            loader=FileSystemLoader(template_dir),
            autoescape=select_autoescape(['html', 'xml']),
            trim_blocks=True,
            lstrip_blocks=True
        )

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
        Send an email using Jinja2 templates

        Args:
            to_email: Recipient email address
            subject: Email subject
            template_name: Name of the template (without extension)
            context: Dictionary of variables to pass to the template
            cc: List of CC recipients (optional)
            bcc: List of BCC recipients (optional)

        Returns:
            True if email sent successfully, False otherwise
        """
        try:
            # Load HTML template
            html_template = self.jinja_env.get_template(f'email/{template_name}.html')
            html_body = html_template.render(**context)

            # Load TXT template if available
            text_body = None
            try:
                text_template = self.jinja_env.get_template(f'email/{template_name}.txt')
                text_body = text_template.render(**context)
            except TemplateNotFound:
                logger.warning(f"Text template not found for {template_name}, sending HTML only")

            # Send email
            return self.send_email(to_email, subject, html_body, text_body, cc, bcc)

        except TemplateNotFound as e:
            logger.error(f"Template not found: {template_name} - {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Failed to render template {template_name}: {str(e)}")
            return False

    def send_welcome_email(self, user_email: str, user_name: str) -> bool:
        """Send a welcome email to new users"""
        return self.send_templated_email(
            to_email=user_email,
            subject="Welcome to Optio!",
            template_name='welcome',
            context={'user_name': user_name}
        )

    def send_confirmation_email(self, user_email: str, user_name: str, confirmation_link: str) -> bool:
        """Send signup confirmation email to new users"""
        return self.send_templated_email(
            to_email=user_email,
            subject="Confirm your Optio account",
            template_name='email_confirmation',
            context={
                'user_name': user_name,
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
        return self.send_templated_email(
            to_email=parent_email,
            subject="Welcome to Optio! Let's Chat About Your Teen's Future",
            template_name='promo_welcome',
            context={
                'parent_name': parent_name,
                'teen_age': teen_age,
                'activity': activity
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

    def send_subscription_request_confirmation(
        self,
        user_email: str,
        user_name: str,
        tier_requested: str,
        contact_preference: str,
        phone_number: str = None
    ) -> bool:
        """Send confirmation email to user after subscription upgrade request"""
        return self.send_templated_email(
            to_email=user_email,
            subject=f"Your {tier_requested} Upgrade Request Has Been Received",
            template_name='subscription_request_user',
            context={
                'user_name': user_name,
                'tier_requested': tier_requested,
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
        current_tier: str,
        contact_preference: str,
        phone_number: str = None,
        message: str = None
    ) -> bool:
        """Send notification email to support team about new subscription request"""
        admin_email = os.getenv('ADMIN_EMAIL', 'support@optioeducation.com')
        return self.send_templated_email(
            to_email=admin_email,
            subject=f"New Subscription Request: {user_name} → {tier_requested}",
            template_name='subscription_request_admin',
            context={
                'user_name': user_name,
                'user_email': user_email,
                'user_id': user_id,
                'tier_requested': tier_requested,
                'current_tier': current_tier,
                'contact_preference': contact_preference,
                'phone_number': phone_number,
                'message': message
            }
        )

# Create singleton instance
email_service = EmailService()
