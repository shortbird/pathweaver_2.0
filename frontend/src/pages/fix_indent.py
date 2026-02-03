import re

with open('DiplomaPage.test.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix indentation for setAuthContext calls
# Pattern: setAuthContext({  with wrong indentation
pattern = r'setAuthContext\(\{\n\s{6}user: mockUser,\n\s+isAuthenticated: true,\n\s+loading: false\n\s+\}\)'

# Replace with properly indented version
replacement = '''setAuthContext({
        user: mockUser,
        isAuthenticated: true,
        loading: false
      })'''

content = re.sub(pattern, replacement, content)

with open('DiplomaPage.test.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Indentation fixed")
