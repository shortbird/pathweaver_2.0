"""
Email service for sending custom transactional emails
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List
import logging

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        # SMTP Configuration from environment variables
        self.smtp_host = os.getenv('SMTP_HOST', 'smtp.sendgrid.net')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.smtp_user = os.getenv('SMTP_USER', 'apikey')
        self.smtp_pass = os.getenv('SMTP_PASS', '')
        self.sender_email = os.getenv('SENDER_EMAIL', 'noreply@optioeducation.com')
        self.sender_name = os.getenv('SENDER_NAME', 'OptioQuest')
        
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
    
    def send_welcome_email(self, user_email: str, user_name: str) -> bool:
        """Send a welcome email to new users"""
        subject = "Welcome to OptioQuest!"
        
        html_body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #6B46C1;">Welcome to OptioQuest, {user_name}!</h1>
                    <p>We're excited to have you join our learning community.</p>
                    <p>Your account has been successfully created. Here's what you can do next:</p>
                    <ul>
                        <li>Explore available quests</li>
                        <li>Track your learning progress</li>
                        <li>Earn XP and unlock achievements</li>
                    </ul>
                    <p style="margin-top: 30px;">
                        <a href="https://optioeducation.com/dashboard" 
                           style="background-color: #6B46C1; color: white; padding: 12px 30px; 
                                  text-decoration: none; border-radius: 5px; display: inline-block;">
                            Go to Dashboard
                        </a>
                    </p>
                    <p style="margin-top: 30px; font-size: 12px; color: #666;">
                        If you have any questions, feel free to contact our support team.
                    </p>
                </div>
            </body>
        </html>
        """
        
        text_body = f"""
        Welcome to OptioQuest, {user_name}!
        
        We're excited to have you join our learning community.
        
        Your account has been successfully created. Here's what you can do next:
        - Explore available quests
        - Track your learning progress
        - Earn XP and unlock achievements
        
        Go to Dashboard: https://optioeducation.com/dashboard
        
        If you have any questions, feel free to contact our support team.
        """
        
        return self.send_email(user_email, subject, html_body, text_body)
    
    def send_quest_completion_email(self, user_email: str, user_name: str, quest_title: str, xp_earned: int) -> bool:
        """Send email when user completes a quest"""
        subject = f"Congratulations! You completed '{quest_title}'"
        
        html_body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #6B46C1;">Quest Completed! 🎉</h1>
                    <p>Great job, {user_name}!</p>
                    <p>You've successfully completed <strong>{quest_title}</strong> and earned <strong>{xp_earned} XP</strong>!</p>
                    <p>Keep up the great work on your learning journey.</p>
                    <p style="margin-top: 30px;">
                        <a href="https://optioeducation.com/quests" 
                           style="background-color: #6B46C1; color: white; padding: 12px 30px; 
                                  text-decoration: none; border-radius: 5px; display: inline-block;">
                            Find Your Next Quest
                        </a>
                    </p>
                </div>
            </body>
        </html>
        """
        
        return self.send_email(user_email, subject, html_body)

# Create singleton instance
email_service = EmailService()