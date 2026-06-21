"""
Email service for sending custom transactional emails using Jinja2 templates
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List, Dict, Any
from services.base_service import BaseService
from jinja2 import Environment, FileSystemLoader, select_autoescape, TemplateNotFound
from markupsafe import Markup
from services.email_copy_loader import email_copy_loader
from app_config import Config

from utils.logger import get_logger

logger = get_logger(__name__)

class EmailService(BaseService):
    def __init__(self):
        # SMTP Configuration from Config
        self.smtp_host = Config.SMTP_HOST
        self.smtp_port = Config.SMTP_PORT
        self.smtp_user = Config.SMTP_USER
        self.smtp_pass = Config.SMTP_PASS
        self.sender_email = Config.SENDER_EMAIL
        self.sender_name = Config.SENDER_NAME

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
        bcc: Optional[List[str]] = None,
        sender_name_override: Optional[str] = None
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
            # Use sender_name_override if provided, otherwise use default
            sender_display_name = sender_name_override if sender_name_override else self.sender_name
            msg['From'] = f"{sender_display_name} <{self.sender_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject

            if cc:
                msg['Cc'] = ', '.join(cc)

            # Note: BCC header is intentionally NOT set in the message itself
            # BCC recipients are only added to the SMTP envelope (to_addrs)
            # This prevents BCC recipients from being visible in the email headers

            # Add plain text part if provided
            if text_body:
                text_part = MIMEText(text_body, 'plain')
                msg.attach(text_part)

            # Add HTML part
            html_part = MIMEText(html_body, 'html')
            msg.attach(html_part)

            # Automatically copy support email for monitoring all outgoing emails
            # Note: We'll send a separate copy instead of BCC due to SendGrid SMTP limitations
            # Use tanner@optioeducation.com directly to avoid email alias loops (support@ and admin@ redirect to tanner@)
            support_email = Config.SUPPORT_EMAIL
            support_copy_email = Config.SUPPORT_COPY_EMAIL
            should_copy_support = False

            bcc = bcc or []
            cc = cc or []

            # Check if support email should be copied (not already in CC and not the primary recipient)
            if support_email not in cc and to_email.lower() != support_copy_email.lower():
                should_copy_support = True
                logger.info(f"Will send copy to {support_copy_email} for monitoring email to {to_email}")

            # SendGrid SMTP API configuration - disable click tracking only
            # Note: BCC is handled via standard SMTP envelope (recipients list)
            # SendGrid SMTP does not support BCC via X-SMTPAPI header
            msg['X-SMTPAPI'] = '{"filters": {"clicktrack": {"settings": {"enable": 0}}}}'

            # Prepare recipient list
            recipients = [to_email]
            if cc:
                recipients.extend(cc)
            if bcc:
                recipients.extend(bcc)

            # Log full recipient list for debugging
            logger.info(f"SMTP envelope recipients: to={to_email}, cc={cc}, bcc={bcc}, total_recipients={recipients}")

            # Send email
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_pass)
                server.send_message(msg, to_addrs=recipients)

            logger.info(f"Email sent successfully to {to_email} (with {len(recipients)} total recipients)")

            # Send separate copy to support email for monitoring (SendGrid SMTP doesn't reliably deliver BCC)
            if should_copy_support:
                try:
                    # Create a copy of the message with support email as recipient
                    support_msg = MIMEMultipart('alternative')
                    support_msg['From'] = f"{sender_display_name} <{self.sender_email}>"
                    support_msg['To'] = support_copy_email
                    support_msg['Subject'] = f"[COPY] {subject}"  # Mark as copy for clarity

                    # Add context header
                    context_text = f"[This is a copy of an email sent to: {to_email}]\n\n"

                    # Add plain text with context
                    if text_body:
                        support_text = context_text + text_body
                        support_msg.attach(MIMEText(support_text, 'plain'))

                    # Add HTML with context banner
                    html_context = f'<div style="background: #f3f4f6; padding: 12px; margin-bottom: 20px; border-left: 4px solid #6D469B;"><strong>Copy:</strong> This email was sent to {to_email}</div>'
                    support_html = html_context + html_body
                    support_msg.attach(MIMEText(support_html, 'html'))

                    # Disable click tracking for support copy
                    support_msg['X-SMTPAPI'] = '{"filters": {"clicktrack": {"settings": {"enable": 0}}}}'

                    # Send support copy
                    with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                        server.starttls()
                        server.login(self.smtp_user, self.smtp_pass)
                        server.send_message(support_msg, to_addrs=[support_copy_email])

                    logger.info(f"Support copy sent successfully to {support_copy_email} | Subject: [COPY] {subject}")
                except Exception as e:
                    # Don't fail the main email if support copy fails
                    logger.error(f"Failed to send support copy to {support_email}: {str(e)}")

            return True

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False

    def _process_copy_strings(self, data: Any, context: Dict[str, Any]) -> Any:
        """
        Recursively process YAML copy data to substitute variables using Jinja2 (secure autoescaping).
        Handles {variable_name} syntax in YAML strings.
        """
        if isinstance(data, str):
            # Use Jinja2 with autoescape instead of Python .format() for security
            try:
                # Convert {variable} to {{ variable }} for Jinja2 syntax
                jinja_str = data.replace('{', '{{').replace('}', '}}')
                template = self.jinja_env.from_string(jinja_str)
                return template.render(**context)
            except Exception as e:
                # If rendering fails, return the string as-is
                logger.warning(f"Failed to render template string: {e}")
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
        Send an email using the template system (database overrides + YAML fallback)

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
            # Load template from YAML
            template_data = self.copy_loader.get_email_copy(template_name)
            if not template_data:
                raise ValueError(f"Template '{template_name}' not found in email_copy.yaml")

            template = {
                'key': template_name,
                'subject': template_data.get('subject', ''),
                'data': template_data,
            }

            # Render template with context
            rendered = self._render_email_template(template, subject, context)

            # Use rendered subject and body
            html_body = rendered['html_body']
            text_body = rendered['text_body']
            final_subject = rendered['subject']
            sender_name = rendered.get('sender_name')  # Get sender_name if it exists

            # Send email with sender_name override if provided
            return self.send_email(
                to_email,
                final_subject,
                html_body,
                text_body,
                cc,
                bcc,
                sender_name_override=sender_name
            )

        except TemplateNotFound as e:
            logger.error(f"Template not found: {template_name} - {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Failed to render template {template_name}: {str(e)}")
            return False

    def _render_email_template(
        self,
        template: Dict[str, Any],
        subject_override: Optional[str],
        variables: Dict[str, Any]
    ) -> Dict[str, str]:
        """
        Render email content from template with variables.

        Args:
            template: Template dictionary from EmailTemplateService
            subject_override: Custom subject (or None to use template subject)
            variables: Variable values for substitution

        Returns:
            Dictionary with 'subject', 'html_body', 'text_body', 'sender_name'
        """
        try:
            # Render subject with autoescape
            subject = subject_override or template.get('subject', 'Message from Optio')
            subject_template = self.jinja_env.from_string(subject)
            rendered_subject = subject_template.render(**variables)

            # Get template data
            template_data = template.get('data', {})

            # Extract sender_name from template_data (if provided)
            sender_name = template_data.get('sender_name')

            # Render with generic wrapper
            rendered_html = self._render_with_generic_wrapper(template_data, variables, rendered_subject)

            # Generate plain text version
            text_body = self._html_to_text(rendered_html)

            result = {
                'subject': rendered_subject,
                'html_body': rendered_html,
                'text_body': text_body
            }

            # Add sender_name if it exists in template
            if sender_name:
                result['sender_name'] = sender_name

            return result

        except Exception as e:
            logger.error(f"Error rendering email template: {e}")
            raise

    def _render_with_generic_wrapper(
        self,
        template_data: Dict[str, Any],
        variables: Dict[str, Any],
        subject: str
    ) -> str:
        """
        Render email using generic CRM wrapper template with professional styling.

        Args:
            template_data: Template data dictionary (YAML-like structure)
            variables: Variable values for substitution
            subject: Rendered email subject

        Returns:
            Rendered HTML using crm_generic.html template with full styling
        """
        try:
            # Load the generic CRM wrapper template
            generic_template = self.jinja_env.get_template('email/crm_generic.html')

            # Prepare render context
            render_context = {
                'email_subject': subject,
                **variables
            }

            # Process greeting or salutation (YAML templates use 'salutation')
            greeting_value = template_data.get('greeting') or template_data.get('salutation')
            if greeting_value:
                logger.info(f"Rendering greeting: '{greeting_value}' with variables: {variables}")
                greeting_template = self.jinja_env.from_string(greeting_value)
                rendered_greeting = greeting_template.render(**variables)
                logger.info(f"Rendered greeting: '{rendered_greeting}'")
                render_context['greeting'] = rendered_greeting

            # Process body_html (custom templates) or paragraphs (YAML templates)
            if 'body_html' in template_data:
                # Custom template - render body_html with variables and autoescape
                body_template = self.jinja_env.from_string(template_data['body_html'])
                render_context['body_html'] = body_template.render(**variables)
            elif 'paragraphs' in template_data:
                # YAML template - render paragraphs as HTML (NOT closing_paragraphs - those go after highlight box)
                rendered_paragraphs = []
                for para in template_data['paragraphs']:
                    para_template = self.jinja_env.from_string(para)
                    rendered_para = para_template.render(**variables)
                    rendered_paragraphs.append(f'<p class="text">{rendered_para}</p>')

                # Append top-level bullet_points to body (if not inside highlight_box)
                if 'bullet_points' in template_data and template_data['bullet_points']:
                    rendered_paragraphs.append('<ul style="margin: 14px 0; padding-left: 20px;">')
                    for bullet in template_data['bullet_points']:
                        bullet_template = self.jinja_env.from_string(bullet)
                        rendered_bullet = bullet_template.render(**variables)
                        rendered_paragraphs.append(f'<li class="list-item" style="margin-bottom: 8px; line-height: 1.6; color: #333333;">{rendered_bullet}</li>')
                    rendered_paragraphs.append('</ul>')

                render_context['body_html'] = ''.join(rendered_paragraphs)

                # Render closing_paragraphs separately (will be placed after highlight box)
                if 'closing_paragraphs' in template_data:
                    rendered_closing = []
                    for para in template_data['closing_paragraphs']:
                        para_template = self.jinja_env.from_string(para)
                        rendered_para = para_template.render(**variables)
                        rendered_closing.append(f'<p class="text">{rendered_para}</p>')
                    render_context['closing_html'] = ''.join(rendered_closing)

            # Process CTA button with autoescape
            if 'cta' in template_data:
                cta = template_data['cta']
                cta_text_template = self.jinja_env.from_string(cta.get('text', 'Click here'))
                cta_url_template = self.jinja_env.from_string(cta.get('url', '#'))
                render_context['cta'] = {
                    'text': cta_text_template.render(**variables),
                    'url': cta_url_template.render(**variables)
                }

            # Process highlight box (if exists) with autoescape
            highlight_data = template_data.get('highlight') or template_data.get('highlight_box')
            if highlight_data:
                highlight_context = {
                    'title': highlight_data.get('title', ''),
                    'content': self.jinja_env.from_string(highlight_data.get('content', '')).render(**variables) if highlight_data.get('content') else ''
                }
                # Render bullet points if they exist
                if 'bullet_points' in highlight_data and highlight_data['bullet_points']:
                    rendered_bullets = []
                    for bullet in highlight_data['bullet_points']:
                        bullet_template = self.jinja_env.from_string(bullet)
                        rendered_bullets.append(bullet_template.render(**variables))
                    highlight_context['bullet_points'] = rendered_bullets
                render_context['highlight'] = highlight_context

            # Process signature (if exists)
            if 'signature' in template_data:
                sig = template_data['signature']
                # If signature is a string, it's a reference to signatures section in YAML
                if isinstance(sig, str):
                    # Load signature from YAML
                    sig_data = self.copy_loader.get_signature(sig)
                    if sig_data:
                        # Format signature for template
                        render_context['signature'] = {
                            'line1': 'Best regards,',
                            'line2': sig_data.get('name', 'The Optio Team')
                        }
                else:
                    # Signature is already a dict
                    render_context['signature'] = sig

            # Render with generic wrapper
            rendered_html = generic_template.render(**render_context)

            return rendered_html

        except Exception as e:
            logger.error(f"Error rendering with generic wrapper: {e}")
            # Fallback to basic HTML
            return self._generate_basic_html_fallback(template_data, variables)

    def _generate_basic_html_fallback(self, template_data: Dict[str, Any], variables: Dict[str, Any]) -> str:
        """Emergency fallback - generate very basic HTML if wrapper template fails"""
        html_parts = ['<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">']

        # Greeting with autoescape
        if 'greeting' in template_data or 'salutation' in template_data:
            greeting_value = template_data.get('greeting') or template_data.get('salutation')
            greeting_template = self.jinja_env.from_string(greeting_value)
            html_parts.append(f'<h2 style="color: #6D469B;">{greeting_template.render(**variables)}</h2>')

        # Paragraphs or body_html with autoescape
        if 'body_html' in template_data:
            body_template = self.jinja_env.from_string(template_data['body_html'])
            html_parts.append(body_template.render(**variables))
        elif 'paragraphs' in template_data:
            for para in template_data['paragraphs']:
                para_template = self.jinja_env.from_string(para)
                html_parts.append(f'<p style="line-height: 1.6; color: #333;">{para_template.render(**variables)}</p>')

        # CTA button with autoescape
        if 'cta' in template_data:
            cta = template_data['cta']
            cta_text_template = self.jinja_env.from_string(cta.get('text', 'Click here'))
            cta_url_template = self.jinja_env.from_string(cta.get('url', '#'))
            html_parts.append(
                f'<div style="text-align: center; margin: 30px 0;">'
                f'<a href="{cta_url_template.render(**variables)}" '
                f'style="background: linear-gradient(to right, #6D469B, #EF597B); '
                f'color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600;">'
                f'{cta_text_template.render(**variables)}</a></div>'
            )

        html_parts.append('<p style="margin-top: 30px; color: #666;">Best regards,<br>The Optio Team</p>')
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
        tanner_email = Config.ADMIN_EMAIL

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

    def send_student_promo_email(self, email: str, name: str, interest_individual: bool = False, interest_fulltime: bool = False, classes: str = '', state: str = '') -> bool:
        """Send promo email to students based on their interest selections."""
        tanner_email = Config.ADMIN_EMAIL

        # Build conditional text (marked as safe HTML)
        classes_text = Markup(f"You mentioned interest in <strong>{classes}</strong>. We'll help you figure out the best path to earn that credit.") if classes else ''

        # Pick template based on selections
        if interest_individual and interest_fulltime:
            template = 'student_promo_both'
            subject = 'Your Free Credit Code + Full-Time Program Info'
        elif interest_fulltime:
            template = 'student_promo_fulltime'
            subject = 'Welcome to Optio — Full-Time Program Info'
        else:
            template = 'student_promo_individual'
            subject = 'Your Free Credit Code from Optio'

        return self.send_templated_email(
            to_email=email,
            subject=subject,
            template_name=template,
            context={
                'name': name,
                'classes_text': classes_text,
            },
            bcc=[tanner_email]
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
        admin_email = Config.ADMIN_EMAIL
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

    def send_demo_request_confirmation(
        self,
        user_name: str,
        user_email: str,
        organization: str = None
    ) -> bool:
        """
        Send demo request confirmation email to user.

        Sends confirmation to the user and automatically copies
        tanner@optioeducation.com for follow-up (via the standard
        support copy mechanism in send_email).

        Args:
            user_name: Name of the person who submitted demo request
            user_email: Email of the person who submitted demo request
            organization: Organization name (optional)

        Returns:
            True if email sent successfully, False otherwise
        """
        return self.send_templated_email(
            to_email=user_email,
            subject="Thanks for Your Interest in Optio!",
            template_name='demo_request_confirmation',
            context={
                'name': user_name,
                'organization': organization or ''
            }
        )

    def send_sales_inquiry_confirmation(
        self,
        user_name: str,
        user_email: str,
        organization: str = None,
        message: str = None
    ) -> bool:
        """
        Send sales inquiry confirmation email to user.

        Sends confirmation to the user and automatically copies
        tanner@optioeducation.com for follow-up (via the standard
        support copy mechanism in send_email).

        Args:
            user_name: Name of the person who submitted sales inquiry
            user_email: Email of the person who submitted sales inquiry
            organization: Organization name (optional)
            message: User's message (optional)

        Returns:
            True if email sent successfully, False otherwise
        """
        return self.send_templated_email(
            to_email=user_email,
            subject="Thanks for Contacting Optio Sales",
            template_name='sales_inquiry_confirmation',
            context={
                'name': user_name,
                'organization': organization or '',
                'message': message or ''
            }
        )

    def send_family_inquiry_confirmation(
        self,
        user_name: str,
        user_email: str,
        message: str = None
    ) -> bool:
        """Send family inquiry confirmation email from the for-families page."""
        return self.send_templated_email(
            to_email=user_email,
            subject="Welcome to Optio! Let's Talk About Your Family",
            template_name='family_inquiry_confirmation',
            context={
                'name': user_name,
                'message': message or ''
            }
        )

    def send_academy_inquiry_confirmation(
        self,
        user_name: str,
        user_email: str,
        message: str = None
    ) -> bool:
        """Send Academy inquiry confirmation email from the /academy page."""
        return self.send_templated_email(
            to_email=user_email,
            subject="Thanks for Your Interest in Optio Academy",
            template_name='academy_inquiry_confirmation',
            context={
                'name': user_name,
                'message': message or ''
            }
        )

    def send_poe_signup_confirmation(
        self,
        to_email: str,
        first_name: str,
        cohort_name: str,
        cc: Optional[List[str]] = None
    ) -> bool:
        """
        Confirm a Pipe Organ Encounter interest-list signup (public /poe page).

        This is NOT an account/email-verification message. It acknowledges that
        the participant is on the POE credit list and that Optio will follow up
        to get them set up before camp. For minors, pass the parent/guardian
        email via cc so they receive the confirmation too.
        """
        safe_name = (first_name or '').strip() or 'there'
        camp = cohort_name or 'your Pipe Organ Encounter'
        subject = f"You're on the list — {camp}"
        register_url = f"{Config.FRONTEND_URL}/register"

        html_body = f"""\
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
  <div style="background: linear-gradient(90deg, #6D469B 0%, #EF597B 100%); padding: 28px 24px; border-radius: 12px 12px 0 0;">
    <p style="margin: 0; color: rgba(255,255,255,0.85); font-size: 13px; letter-spacing: 1px; text-transform: uppercase;">Pipe Organ Encounter &middot; 2026</p>
    <h1 style="margin: 6px 0 0; color: #ffffff; font-size: 24px;">You're on the list!</h1>
  </div>
  <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
    <p style="font-size: 16px;">Hi {safe_name},</p>
    <p style="font-size: 15px; line-height: 1.6;">
      Thanks for signing up to earn <strong>0.5 fine arts credit</strong> for <strong>{camp}</strong>.
      We've added you to the list and saved where your credit should go.
    </p>
    <p style="font-size: 15px; line-height: 1.6;">
      <strong>Next step: create your free Optio account now</strong> so it's ready to go when camp starts.
      We'll automatically link it to your POE so you can document your week and we can review your work for credit.
    </p>
    <p style="margin: 18px 0;">
      <a href="{register_url}" style="display: inline-block; background: linear-gradient(90deg, #6D469B 0%, #EF597B 100%); color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: bold; font-size: 15px;">Create your Optio account</a>
    </p>
    <div style="background: #f5f3ff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin: 18px 0;">
      <p style="margin: 0 0 6px; font-size: 15px; font-weight: bold; color: #6D469B;">Watch the info session</p>
      <p style="margin: 0; font-size: 15px; line-height: 1.6;">
        We held a short online info session walking through how the credit works and answering questions.
        We recorded it so you can watch any time:
        <a href="https://docs.google.com/videos/d/1uT8opeYJWfi6Nz9bOmrYiwNQ9VYptX9R1hk3uNy3CG0/edit?usp=drive_link" style="color: #6D469B; font-weight: bold;">watch the recording</a>.
      </p>
    </div>
    <p style="font-size: 15px; line-height: 1.6;">
      Questions? Just reply to this email.
    </p>
    <p style="font-size: 15px; line-height: 1.6; margin-top: 24px;">
      &mdash; The Optio Team
    </p>
  </div>
</div>"""

        text_body = (
            f"Hi {safe_name},\n\n"
            f"Thanks for signing up to earn 0.5 fine arts credit for {camp}. "
            "We've added you to the list and saved where your credit should go.\n\n"
            "Next step: create your free Optio account now so it's ready to go when camp "
            "starts. We'll automatically link it to your POE so you can document your week "
            f"and we can review your work for credit.\n\n"
            f"Create your account: {register_url}\n\n"
            "Watch the info session: we held a short online session walking through how the "
            "credit works and answering questions, and we recorded it so you can watch any time: "
            "https://docs.google.com/videos/d/1uT8opeYJWfi6Nz9bOmrYiwNQ9VYptX9R1hk3uNy3CG0/edit?usp=drive_link\n\n"
            "Questions? Just reply to this email.\n\n"
            "— The Optio Team"
        )

        return self.send_email(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            cc=cc or None,
        )

    def send_claim_free_class_confirmation(
        self,
        user_email: str
    ) -> bool:
        """
        Send confirmation email for the 'first class free' modal on /classes.

        The modal collects only an email (no name), so this template uses a
        generic salutation. The standard support copy mechanism in send_email
        copies tanner@optioeducation.com for follow-up.
        """
        return self.send_templated_email(
            to_email=user_email,
            subject="Your free Optio class — here's what's next",
            template_name='claim_free_class_confirmation',
            context={}
        )

    def send_promo_code_email(
        self,
        to_email: str,
        name: str,
        promo_code: str
    ) -> bool:
        """
        Send first month free promo code email.

        Args:
            to_email: Recipient email address
            name: Recipient's name (or 'there' for fallback)
            promo_code: The promo code to include

        Returns:
            True if email sent successfully, False otherwise
        """
        frontend_url = Config.FRONTEND_URL
        registration_url = f"{frontend_url}/register?promo={promo_code}"

        return self.send_templated_email(
            to_email=to_email,
            subject="Your Optio First Month Free Code",
            template_name='promo_first_month_free',
            context={
                'name': name,
                'promo_code': promo_code,
                'registration_url': registration_url
            }
        )

    def send_observer_linked_notification(
        self,
        parent_email: str,
        parent_name: str,
        student_name: str,
        observer_name: str,
        observer_email: str
    ) -> bool:
        """
        Send notification to parent when an observer links to their child's account.

        Args:
            parent_email: Parent's email address
            parent_name: Parent's display name
            student_name: Child's display name
            observer_name: Observer's display name
            observer_email: Observer's email address

        Returns:
            True if email sent successfully, False otherwise
        """
        # Get frontend URL for dashboard link
        frontend_url = Config.FRONTEND_URL
        dashboard_url = f"{frontend_url}/parent/dashboard"

        return self.send_templated_email(
            to_email=parent_email,
            subject=f"New observer linked to {student_name}'s Optio account",
            template_name='observer_linked_notification',
            context={
                'parent_name': parent_name,
                'student_name': student_name,
                'observer_name': observer_name,
                'observer_email': observer_email,
                'dashboard_url': dashboard_url
            }
        )

    def send_course_enrollment_email(
        self,
        user_email: str,
        user_name: str,
        course_title: str,
        quest_count: int,
        course_url: str
    ) -> bool:
        """Send welcome email when a student enrolls in a course."""
        return self.send_templated_email(
            to_email=user_email,
            subject=f"Welcome to '{course_title}' on Optio!",
            template_name='course_enrollment',
            context={
                'user_name': user_name,
                'course_title': course_title,
                'quest_count': quest_count,
                'quest_count_suffix': 's' if quest_count != 1 else '',
                'course_url': course_url
            }
        )

    def send_org_course_welcome_email(
        self,
        to_email: str,
        student_name: str,
        student_email: str,
        temp_password: str,
        org_name: str,
        courses_sentence: str,
        course_count: int,
        login_url: str
    ) -> bool:
        """
        Send a welcome email when a partner org_admin registers a NEW student for
        one or more purchased courses. Includes login credentials (temp password)
        and an overview of how Optio courses work.
        """
        course_word = 'course' if course_count == 1 else 'courses'
        return self.send_templated_email(
            to_email=to_email,
            subject="Welcome to Optio - your account is ready",
            template_name='org_course_welcome',
            context={
                'student_name': student_name,
                'student_email': student_email,
                'temp_password': temp_password,
                'org_name': org_name,
                'courses_sentence': courses_sentence,
                'course_count': course_count,
                'course_word': course_word,
                'login_url': login_url
            }
        )

    def send_org_courses_added_email(
        self,
        to_email: str,
        student_name: str,
        org_name: str,
        courses_sentence: str,
        course_count: int,
        login_url: str
    ) -> bool:
        """
        Send an email when an EXISTING student is enrolled in additional purchased
        courses (e.g. a repeat purchase). No login credentials - the student
        already has an account.
        """
        course_word = 'course' if course_count == 1 else 'courses'
        return self.send_templated_email(
            to_email=to_email,
            subject=f"New {course_word} added to your Optio account",
            template_name='org_courses_added',
            context={
                'student_name': student_name,
                'org_name': org_name,
                'courses_sentence': courses_sentence,
                'course_count': course_count,
                'course_word': course_word,
                'login_url': login_url
            }
        )

    def send_daily_advisor_summary(
        self,
        advisor_email: str,
        advisor_name: str,
        summary_date: str,
        active_students: int,
        total_tasks: int,
        total_xp: int
    ) -> bool:
        """
        Send daily advisor summary email.

        Note: The full daily advisor summary job uses send_email directly with
        custom HTML for the detailed student-by-student breakdown. This method
        is provided for simpler use cases or testing.

        Args:
            advisor_email: Advisor's email address
            advisor_name: Advisor's display name
            summary_date: Formatted date string
            active_students: Number of students with activity
            total_tasks: Total tasks completed
            total_xp: Total XP earned

        Returns:
            True if email sent successfully, False otherwise
        """
        frontend_url = Config.FRONTEND_URL
        dashboard_url = f"{frontend_url}/advisor"

        return self.send_templated_email(
            to_email=advisor_email,
            subject=f"Morning Briefing: Your Students' Progress - {summary_date}",
            template_name='daily_advisor_summary',
            context={
                'advisor_name': advisor_name,
                'summary_date': summary_date,
                'active_students': active_students,
                'total_tasks': total_tasks,
                'total_xp': total_xp,
                'dashboard_url': dashboard_url
            }
        )


# Create singleton instance
email_service = EmailService()
