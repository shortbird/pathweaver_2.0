"""
Fix password reset template to use correct Jinja2 syntax: {{ variable }} instead of { variable }

The issue was that the template used single braces {variable} but Jinja2 requires
double braces {{variable}} for variable substitution.
"""
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv()

# Initialize Supabase client directly (bypass Flask app context)
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables")
    sys.exit(1)

client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Update the body_html to use Jinja2 syntax {{variable}} instead of {variable}
new_body_html = '''<p>Hi {{ first_name }},</p>
<p>We received a request to reset your password for your Optio account. If you didn't make this request, you can safely ignore this email.</p>
<p>To reset your password, click the button below. This link will expire in {{ expiry_hours }} hours.</p>
<div style="text-align: center; margin: 30px 0;"><a href="{{ reset_link }}" style="display: inline-block; background: linear-gradient(135deg, #6D469B 0%, #EF597B 100%); color: white !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(109, 70, 155, 0.25);">Reset My Password</a></div>
<h3>Security Reminder</h3>
<p>Never share this link with anyone. Optio support will never ask for your password or reset link.</p>
<p>If you didn't request a password reset, please contact us immediately at <a href="mailto:support@optioeducation.com">support@optioeducation.com</a> to secure your account.</p>'''

# Get the current template
result = client.table('email_templates').select('*').eq('template_key', 'password_reset').execute()

if result.data:
    template_id = result.data[0]['id']
    template_data = result.data[0]['template_data']

    print(f"Current body_html preview: {template_data.get('body_html', '')[:100]}...")

    # Update body_html with correct Jinja2 syntax
    template_data['body_html'] = new_body_html

    update_result = client.table('email_templates').update({
        'template_data': template_data
    }).eq('id', template_id).execute()

    if update_result.data:
        print('SUCCESS: Updated password_reset template with Jinja2 syntax')
        print('  Changed {variable} to {{ variable }} for proper substitution')
        print('  Variables: {{ first_name }}, {{ reset_link }}, {{ expiry_hours }}')
    else:
        print('ERROR: Failed to update template')
        sys.exit(1)
else:
    print('ERROR: Template not found in database')
    sys.exit(1)
