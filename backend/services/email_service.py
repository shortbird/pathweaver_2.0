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
        self.sender_name = os.getenv('SENDER_NAME', 'Optio')
        
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
        subject = "Welcome to Optio Education - Your Teen's Learning Journey Starts Here"
        
        # HTML version using the professional template
        html_body = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <title>Welcome to Optio Education</title>
            <style>
                /* Reset and base styles */
                * {{
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }}
                
                body {{
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333333;
                    background-color: #f8f9fa;
                }}
                
                /* Container */
                .email-container {{
                    max-width: 600px;
                    margin: 0 auto;
                    background-color: #ffffff;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }}
                
                /* Header with Optio branding */
                .header {{
                    background: linear-gradient(135deg, #ef597b 0%, #6d469b 100%);
                    padding: 40px 30px;
                    text-align: center;
                    color: white;
                }}
                
                .logo {{
                    font-size: 32px;
                    font-weight: bold;
                    letter-spacing: -0.5px;
                    margin-bottom: 8px;
                }}
                
                .tagline {{
                    font-size: 16px;
                    opacity: 0.95;
                    font-weight: 300;
                }}
                
                /* Main content */
                .content {{
                    padding: 40px 30px;
                }}
                
                .greeting {{
                    font-size: 24px;
                    font-weight: 600;
                    color: #2d3748;
                    margin-bottom: 20px;
                }}
                
                .intro-text {{
                    font-size: 16px;
                    color: #4a5568;
                    margin-bottom: 25px;
                    line-height: 1.7;
                }}
                
                .highlight-box {{
                    background: linear-gradient(135deg, #f8b3c5 0%, #b794d6 100%);
                    padding: 25px;
                    border-radius: 12px;
                    margin: 30px 0;
                    color: #2d3748;
                }}
                
                .highlight-title {{
                    font-size: 18px;
                    font-weight: 600;
                    margin-bottom: 12px;
                }}
                
                .highlight-text {{
                    font-size: 15px;
                    line-height: 1.6;
                }}
                
                /* Call-to-action button */
                .cta-container {{
                    text-align: center;
                    margin: 35px 0;
                }}
                
                .cta-button {{
                    display: inline-block;
                    background: linear-gradient(135deg, #ef597b 0%, #6d469b 100%);
                    color: white;
                    text-decoration: none;
                    padding: 16px 32px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    letter-spacing: 0.3px;
                    transition: transform 0.2s ease;
                }}
                
                /* Next steps section */
                .next-steps {{
                    background-color: #f7fafc;
                    padding: 25px;
                    border-radius: 12px;
                    margin: 30px 0;
                    border-left: 4px solid #ef597b;
                }}
                
                .next-steps h3 {{
                    color: #2d3748;
                    font-size: 18px;
                    margin-bottom: 15px;
                    font-weight: 600;
                }}
                
                .step {{
                    margin-bottom: 12px;
                    display: flex;
                    align-items: flex-start;
                }}
                
                .step-number {{
                    background: linear-gradient(135deg, #ef597b 0%, #6d469b 100%);
                    color: white;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: 600;
                    margin-right: 12px;
                    flex-shrink: 0;
                    margin-top: 1px;
                }}
                
                .step-text {{
                    font-size: 15px;
                    color: #4a5568;
                    line-height: 1.5;
                }}
                
                /* Contact section */
                .contact-info {{
                    background-color: #2d3748;
                    color: white;
                    padding: 30px;
                    text-align: center;
                }}
                
                .contact-title {{
                    font-size: 18px;
                    font-weight: 600;
                    margin-bottom: 15px;
                }}
                
                .contact-text {{
                    font-size: 14px;
                    margin-bottom: 20px;
                    opacity: 0.9;
                }}
                
                .contact-email {{
                    color: #f8b3c5;
                    text-decoration: none;
                    font-weight: 600;
                }}
                
                /* Footer */
                .footer {{
                    background-color: #1a202c;
                    color: #a0aec0;
                    padding: 25px 30px;
                    text-align: center;
                    font-size: 13px;
                }}
                
                .footer-brand {{
                    color: #ef597b;
                    font-weight: 600;
                    margin-bottom: 8px;
                }}
                
                .footer-text {{
                    line-height: 1.5;
                }}
                
                .footer a {{
                    color: #b794d6;
                    text-decoration: none;
                }}
                
                /* Mobile responsive */
                @media only screen and (max-width: 600px) {{
                    .email-container {{
                        margin: 0;
                        box-shadow: none;
                    }}
                    
                    .header {{
                        padding: 30px 20px;
                    }}
                    
                    .logo {{
                        font-size: 28px;
                    }}
                    
                    .content {{
                        padding: 30px 20px;
                    }}
                    
                    .greeting {{
                        font-size: 22px;
                    }}
                    
                    .highlight-box {{
                        padding: 20px;
                    }}
                    
                    .cta-button {{
                        padding: 14px 28px;
                        font-size: 15px;
                    }}
                    
                    .next-steps {{
                        padding: 20px;
                    }}
                    
                    .contact-info {{
                        padding: 25px 20px;
                    }}
                    
                    .footer {{
                        padding: 20px;
                    }}
                }}
            </style>
        </head>
        <body>
            <div class="email-container">
                <!-- Header -->
                <div class="header">
                    <div class="logo">Optio Education</div>
                    <div class="tagline">Empowering Self-Directed Learning</div>
                </div>
                
                <!-- Main Content -->
                <div class="content">
                    <div class="greeting">Welcome to the Optio Family, {parent_name}!</div>
                    
                    <div class="intro-text">
                        Thank you for your interest in Optio Education. We're excited to help your teen{' (age ' + teen_age + ')' if teen_age else ''} develop real-world skills, build an impressive portfolio, and gain the confidence that comes from self-directed learning.{' We noticed they\'re passionate about ' + activity + ' - that\'s a perfect starting point for their learning journey!' if activity else ''}
                    </div>
                    
                    <div class="highlight-box">
                        <div class="highlight-title">Why Parents Choose Optio</div>
                        <div class="highlight-text">
                            Our platform helps teens create self-validated diplomas by completing meaningful quests that develop critical thinking, creativity, and practical skills. Students build portfolios they can proudly share with colleges and employers.
                        </div>
                    </div>
                    
                    <div class="cta-container">
                        <a href="https://www.optioeducation.com/demo" class="cta-button">Explore Our Interactive Demo</a>
                    </div>
                    
                    <div class="next-steps">
                        <h3>Your Next Steps</h3>
                        
                        <div class="step">
                            <div class="step-number">1</div>
                            <div class="step-text">
                                <strong>Try the Demo:</strong> Experience our platform firsthand with our interactive demo designed specifically for parents and students.
                            </div>
                        </div>
                        
                        <div class="step">
                            <div class="step-number">2</div>
                            <div class="step-text">
                                <strong>Schedule a Call:</strong> Book a 15-minute conversation with our education specialists to discuss your teen's goals and how Optio can help.
                            </div>
                        </div>
                        
                        <div class="step">
                            <div class="step-number">3</div>
                            <div class="step-text">
                                <strong>Start the Journey:</strong> Create your teen's account and begin their first quest in an area that interests them most.
                            </div>
                        </div>
                    </div>
                    
                    <div class="intro-text">
                        We understand that choosing the right educational path for your teen is one of the most important decisions you'll make. We're here to support you every step of the way.
                    </div>
                </div>
                
                <!-- Contact Information -->
                <div class="contact-info">
                    <div class="contact-title">Questions? We're Here to Help</div>
                    <div class="contact-text">
                        Our team is ready to answer any questions about Optio's approach, pricing, or how we can best support your teen's learning journey.
                    </div>
                    <a href="mailto:support@optioeducation.com" class="contact-email">support@optioeducation.com</a>
                </div>
                
                <!-- Footer -->
                <div class="footer">
                    <div class="footer-brand">Optio Education</div>
                    <div class="footer-text">
                        Building the future of self-directed learning<br>
                        <a href="https://www.optioeducation.com">www.optioeducation.com</a> | 
                        <a href="mailto:support@optioeducation.com">support@optioeducation.com</a>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text version
        text_body = f"""
        OPTIO EDUCATION
        Empowering Self-Directed Learning
        
        =================================================
        
        WELCOME TO THE OPTIO FAMILY!
        
        Dear {parent_name},
        
        Thank you for your interest in Optio Education. We're excited to help your teen{' (age ' + teen_age + ')' if teen_age else ''} develop real-world skills, build an impressive portfolio, and gain the confidence that comes from self-directed learning.{' We noticed they\'re passionate about ' + activity + ' - that\'s a perfect starting point for their learning journey!' if activity else ''}
        
        WHY PARENTS CHOOSE OPTIO
        ------------------------
        Our platform helps teens create self-validated diplomas by completing meaningful quests that develop critical thinking, creativity, and practical skills. Students build portfolios they can proudly share with colleges and employers.
        
        EXPLORE OUR INTERACTIVE DEMO
        ---------------------------
        Experience our platform firsthand with our interactive demo designed specifically for parents and students:
        https://www.optioeducation.com/demo
        
        YOUR NEXT STEPS
        ---------------
        
        1. TRY THE DEMO
           Experience our platform firsthand with our interactive demo designed specifically for parents and students.
        
        2. SCHEDULE A CALL
           Book a 15-minute conversation with our education specialists to discuss your teen's goals and how Optio can help.
        
        3. START THE JOURNEY
           Create your teen's account and begin their first quest in an area that interests them most.
        
        We understand that choosing the right educational path for your teen is one of the most important decisions you'll make. We're here to support you every step of the way.
        
        QUESTIONS? WE'RE HERE TO HELP
        -----------------------------
        Our team is ready to answer any questions about Optio's approach, pricing, or how we can best support your teen's learning journey.
        
        Email us at: support@optioeducation.com
        
        =================================================
        
        OPTIO EDUCATION
        Building the future of self-directed learning
        
        Website: https://www.optioeducation.com
        Email: support@optioeducation.com
        
        This email was sent because you expressed interest in Optio Education through our promotional landing page. If you have any questions, please don't hesitate to reach out to our support team.
        """
        
        # Send email with BCC to admin for follow-up
        admin_email = os.getenv('ADMIN_EMAIL', 'hello@optioeducation.com')
        return self.send_email(
            to_email=parent_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            bcc=[admin_email]  # Copy admin for follow-up
        )

# Create singleton instance
email_service = EmailService()