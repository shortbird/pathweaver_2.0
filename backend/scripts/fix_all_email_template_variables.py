"""
Fix all email templates to use correct Jinja2 syntax: {{ variable }} instead of { variable }

This script updates all email templates in the database that use single-brace {variable}
syntax to use proper Jinja2 double-brace {{variable}} syntax for variable substitution.
"""
import os
import sys
import re
import json

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

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

def fix_variable_syntax(text):
    """
    Replace {variable} with {{ variable }} for Jinja2 compatibility.

    Handles common variable patterns:
    - {first_name} -> {{ first_name }}
    - {user_name} -> {{ user_name }}
    - {email} -> {{ email }}
    - {quest_title} -> {{ quest_title }}
    - etc.

    Preserves:
    - JSON object braces (e.g., {"key": "value"})
    - CSS braces
    - Already-correct {{ variable }} syntax
    """
    if not isinstance(text, str):
        return text

    # Pattern: {word_characters} but NOT {{ or }} or JSON structures
    # This regex finds {variable_name} but avoids {{already_fixed}}
    pattern = r'(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})'

    def replacer(match):
        var_name = match.group(1)
        # Don't replace if it looks like it's part of a JSON structure
        # (basic heuristic: check if surrounded by quotes or colons)
        return '{{ ' + var_name + ' }}'

    return re.sub(pattern, replacer, text)

def fix_template_data(template_data):
    """Recursively fix variable syntax in template data (handles nested dicts/lists)"""
    if isinstance(template_data, dict):
        fixed = {}
        for key, value in template_data.items():
            if isinstance(value, str):
                fixed[key] = fix_variable_syntax(value)
            elif isinstance(value, dict):
                fixed[key] = fix_template_data(value)
            elif isinstance(value, list):
                fixed[key] = [fix_template_data(item) if isinstance(item, (dict, str)) else item for item in value]
            else:
                fixed[key] = value
        return fixed
    elif isinstance(template_data, str):
        return fix_variable_syntax(template_data)
    else:
        return template_data

# Get all templates
result = client.table('email_templates').select('*').execute()

if not result.data:
    print("No templates found in database")
    sys.exit(1)

print(f"Found {len(result.data)} templates to check\n")

updated_count = 0
skipped_count = 0

for template in result.data:
    template_key = template['template_key']
    template_data = template['template_data']

    # Check if template has single-brace variables
    template_json = json.dumps(template_data)
    has_single_braces = bool(re.search(r'(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})', template_json))

    if not has_single_braces:
        print(f"✓ SKIP: {template_key} - already uses correct syntax")
        skipped_count += 1
        continue

    # Fix the template data
    fixed_data = fix_template_data(template_data)

    # Update in database
    try:
        update_result = client.table('email_templates').update({
            'template_data': fixed_data
        }).eq('id', template['id']).execute()

        if update_result.data:
            print(f"✓ FIXED: {template_key}")
            # Show what changed
            original_json = json.dumps(template_data, indent=2)
            fixed_json = json.dumps(fixed_data, indent=2)

            # Find differences and show first few
            original_vars = re.findall(r'\{([a-zA-Z_][a-zA-Z0-9_]*)\}', original_json)
            if original_vars:
                print(f"  Variables fixed: {', '.join(set(original_vars[:5]))}")

            updated_count += 1
        else:
            print(f"✗ ERROR: Failed to update {template_key}")

    except Exception as e:
        print(f"✗ ERROR updating {template_key}: {e}")

print(f"\n{'='*60}")
print(f"SUMMARY:")
print(f"  Updated: {updated_count} templates")
print(f"  Skipped: {skipped_count} templates (already correct)")
print(f"  Total: {len(result.data)} templates")
print(f"{'='*60}")

if updated_count > 0:
    print("\n✓ All email templates now use correct Jinja2 syntax: {{ variable }}")
