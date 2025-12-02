"""
Delete password_reset.html template to enable CRM database template system

The specific password_reset.html template expects YAML structure (paragraphs array)
but CRM database templates use body_html field. Deleting this file will make the
code fall back to crm_generic.html which properly handles both formats with variable
substitution via Jinja2 Template().render()
"""
import os

template_path = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    'templates',
    'email',
    'password_reset.html'
)

if os.path.exists(template_path):
    # Create backup first
    backup_path = template_path + '.backup'
    with open(template_path, 'r') as f:
        content = f.read()
    with open(backup_path, 'w') as f:
        f.write(content)

    # Delete the template
    os.remove(template_path)
    print(f"SUCCESS: Deleted {template_path}")
    print(f"SUCCESS: Backup saved to {backup_path}")
    print("\nPassword reset emails will now use crm_generic.html wrapper")
    print("which properly substitutes variables from CRM database templates.")
else:
    print(f"Template not found: {template_path}")
