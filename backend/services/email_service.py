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
        self.sender_name = os.getenv('SENDER_NAME', 'Tanner from Optio')
        
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
    
    def send_welcome_email(self, user_email: str, user_name: str) -> bool:
        """Send a welcome email to new users"""
        subject = "Welcome to Optio!"
        
        html_body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #6B46C1;">Welcome to Optio, {user_name}!</h1>
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
        Welcome to Optio, {user_name}!
        
        We're excited to have you join our learning community.
        
        Your account has been successfully created. Here's what you can do next:
        - Explore available quests
        - Track your learning progress
        - Earn XP and unlock achievements
        
        Go to Dashboard: https://optioeducation.com/dashboard
        
        If you have any questions, feel free to contact our support team.
        """
        
        return self.send_email(user_email, subject, html_body, text_body)
    
    def send_confirmation_email(self, user_email: str, user_name: str, confirmation_link: str) -> bool:
        """Send signup confirmation email to new users"""
        subject = "Confirm your Optio account"
        
        html_body = f"""
        <html>
            <head>
                <style>
                    @media only screen and (max-width: 600px) {{
                        .container {{ padding: 10px !important; }}
                        .button {{ width: 100% !important; text-align: center !important; }}
                    }}
                </style>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5; margin: 0; padding: 0;">
                <div class="container" style="max-width: 600px; margin: 40px auto; background-color: white; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden;">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #6B46C1 0%, #8B5CF6 100%); padding: 40px 20px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Welcome to Optio!</h1>
                        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Just one more step to start your learning adventure</p>
                    </div>
                    
                    <!-- Body -->
                    <div style="padding: 40px 30px;">
                        <p style="font-size: 16px; margin: 0 0 20px 0;">Hi {user_name},</p>
                        
                        <p style="font-size: 15px; line-height: 1.8; color: #555;">
                            Thanks for signing up for Optio! We're excited to have you join our community of learners.
                        </p>
                        
                        <p style="font-size: 15px; line-height: 1.8; color: #555;">
                            Please confirm your email address to activate your account and start exploring quests:
                        </p>
                        
                        <!-- CTA Button -->
                        <div style="text-align: center; margin: 35px 0;">
                            <a href="{confirmation_link}" 
                               class="button"
                               style="background: linear-gradient(135deg, #6B46C1 0%, #8B5CF6 100%); 
                                      color: white; 
                                      padding: 14px 40px; 
                                      text-decoration: none; 
                                      border-radius: 8px; 
                                      display: inline-block;
                                      font-size: 16px;
                                      font-weight: 600;
                                      box-shadow: 0 4px 15px rgba(107, 70, 193, 0.3);
                                      transition: all 0.3s ease;">
                                Confirm Email Address
                            </a>
                        </div>
                        
                        <!-- What's Next Section -->
                        <div style="background-color: #f8f7ff; border-radius: 8px; padding: 20px; margin: 30px 0;">
                            <h3 style="color: #6B46C1; margin: 0 0 15px 0; font-size: 16px;">What happens next?</h3>
                            <ul style="margin: 0; padding-left: 20px; color: #555;">
                                <li style="margin-bottom: 8px;">Access hundreds of educational quests</li>
                                <li style="margin-bottom: 8px;">Track your progress across 5 skill pillars</li>
                                <li style="margin-bottom: 8px;">Earn XP and unlock achievements</li>
                                <li>Join a community of motivated learners</li>
                            </ul>
                        </div>
                        
                        <!-- Alternative Link -->
                        <p style="font-size: 13px; color: #999; margin-top: 25px;">
                            If the button doesn't work, copy and paste this link into your browser:
                        </p>
                        <p style="font-size: 12px; color: #6B46C1; word-break: break-all; margin: 5px 0 0 0;">
                            {confirmation_link}
                        </p>
                    </div>
                    
                    <!-- Footer -->
                    <div style="background-color: #f8f7ff; padding: 20px 30px; border-top: 1px solid #e5e5e5;">
                        <p style="font-size: 12px; color: #999; margin: 0; text-align: center;">
                            This confirmation link will expire in 24 hours for security reasons.
                        </p>
                        <p style="font-size: 12px; color: #999; margin: 10px 0 0 0; text-align: center;">
                            If you didn't create an account with Optio, please ignore this email.
                        </p>
                        <p style="font-size: 11px; color: #999; margin: 15px 0 0 0; text-align: center;">
                            © 2024 Optio | <a href="https://optioeducation.com" style="color: #6B46C1; text-decoration: none;">optioeducation.com</a>
                        </p>
                    </div>
                </div>
            </body>
        </html>
        """
        
        text_body = f"""
        Welcome to Optio!
        
        Hi {user_name},
        
        Thanks for signing up for Optio! We're excited to have you join our community of learners.
        
        Please confirm your email address to activate your account:
        
        {confirmation_link}
        
        What happens next?
        - Access hundreds of educational quests
        - Track your progress across 5 skill pillars  
        - Earn XP and unlock achievements
        - Join a community of motivated learners
        
        This confirmation link will expire in 24 hours for security reasons.
        
        If you didn't create an account with Optio, please ignore this email.
        
        © 2024 Optio | optioeducation.com
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
    
    def send_promo_welcome_email(self, parent_email: str, parent_name: str, teen_age: str, activity: str = '') -> bool:
        """Send welcome email to parents who fill out the promo form"""
        subject = "Welcome to Optio! Let's Chat About Your Teen's Future"
        
        # Simple HTML version with markdown-like formatting
        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
                <img src="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/logos/icon.jpg" alt="Optio Logo" style="width: 80px; height: 80px; border-radius: 50%;">
            </div>
            <h1>Welcome to Optio!</h1>
            
            <p>Hi {parent_name},</p>
            
            <p>Thank you for your interest in helping your teen{' (age ' + teen_age + ')' if teen_age else ''} build real-world skills and create an impressive portfolio.{' I noticed they\'re passionate about ' + activity + '! That\'s fantastic!' if activity else ''}</p>
            
            <p>We created Optio because we believe teens learn best when given the freedom to pursue their interests. Our platform helps students earn real high school credit for the learning experiences they have in their daily lives while building portfolios that showcase their excellent work.</p>
            
            <h2>Want to learn more?</h2>
            
            <ol>
                <li><strong>Explore our demo:</strong> <a href="https://www.optioeducation.com/demo">Take a quick tour</a> to see how Optio works.</li>
                <li><strong>Tell us about your teen:</strong> Reply to this email and share what makes your teen unique. What are their interests, goals, or challenges?</li>
                <li><strong>Get personalized guidance:</strong> I will read every reply and respond with specific thoughts about how Optio could help your kid customize their own high school education.</li>
            </ol>
            
            <p><strong>I'd love to hear from you!</strong> What are your teen's biggest interests? What educational challenges are you facing? What are your hopes for their future?</p>
            
            <p>Just hit reply and tell me about your situation. There's a real person (me!) who will read your message and respond personally.</p>
            
            <p>Best,<br>
            Dr. Tanner Bowman<br>
            Founder, Optio Education<br>
            <a href="mailto:tanner@optioeducation.com">tanner@optioeducation.com</a></p>
        </body>
        </html>
        """
        
        # Plain text version
        text_body = f"""
        Welcome to Optio!
        
        Hi {parent_name},
        
        I'm Dr. Tanner Bowman, founder of Optio Education. Thank you for your interest in helping your teen{' (age ' + teen_age + ')' if teen_age else ''} build real-world skills and create an impressive portfolio.{' I noticed they\'re passionate about ' + activity + '! That\'s fantastic!' if activity else ''}
        
        
        I created Optio because I believe teens learn best when given the freedom to pursue their interests. Our platform helps students earn real high school credit for the learning experiences they have in their lives while building portfolios that showcase their excellent work.        
        
        Want to learn more?
        
        1. Explore our demo: Take a quick tour at https://www.optioeducation.com/demo to see how Optio works
        
        2. Tell me about your teen: Reply to this email and share what makes your teen unique. What are their interests, goals, or challenges?
        
        3. Get personalized guidance: I personally read every reply and will respond with specific thoughts about how Optio could help your kid customize their own high school education.
        
        I'd love to hear from you! What are your teen's biggest interests? What educational challenges are you facing? What are your hopes for their future?
        
        Just hit reply and tell me about your situation. There's a real person (me!) who will read your message and respond personally.
        
        Best,
        Dr. Tanner Bowman
        Founder, Optio Education
        tanner@optioeducation.com
        """
        
        # Send email with BCC to Tanner for follow-up
        tanner_email = os.getenv('ADMIN_EMAIL', 'tanner@optioeducation.com')
        return self.send_email(
            to_email=parent_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            bcc=[tanner_email]  # Copy Tanner for personal follow-up
        )

# Create singleton instance
email_service = EmailService()