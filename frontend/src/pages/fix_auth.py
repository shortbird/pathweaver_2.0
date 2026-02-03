import re

with open('DiplomaPage.test.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to match renderWithProviders with authValue parameter
# This will match:  renderWithProviders(<DiplomaPage />, {\n    authValue: {...}\n  })
pattern = r'(renderWithProviders\(<DiplomaPage />), \{\s*authValue: \{([^}]+)\}\s*\}\)'

# Find all matches and process them
def replace_auth(match):
    render_call = match.group(1)
    auth_content = match.group(2).strip()
    
    # Create the setAuthContext call
    return f'setAuthContext({{\n      {auth_content}\n    }})\n\n      {render_call})'

# Replace all occurrences
content = re.sub(pattern, replace_auth, content, flags=re.DOTALL | re.MULTILINE)

with open('DiplomaPage.test.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacements completed")
