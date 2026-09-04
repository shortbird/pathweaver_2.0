"""Login credentials for org-created student accounts.

Young students in an org get a username instead of an email and a
"PIN + word" password (`1234apple`) they can actually type. Both the pattern
and the generator live here because TWO route modules mint these accounts --
admin/organization_users.py one at a time, admin/bulk_import.py by the
spreadsheet -- and bulk_import used to reach into organization_management.py to
borrow them. A route module importing from another route module is how the
generator and the validator drift apart, and a password this file generates
must be one this file accepts.

Split out of routes/admin/organization_management.py on 2026-09-03 (QB-04).
"""

import re

# Username validation pattern: 3-30 chars, alphanumeric, dots, underscores, hyphens
# Cannot start or end with dot/underscore/hyphen
USERNAME_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9._-]{1,28}[a-zA-Z0-9]$|^[a-zA-Z0-9]{1,2}$')

# Kid-friendly words for password generation
KID_FRIENDLY_WORDS = [
    'apple', 'banana', 'cherry', 'dragon', 'eagle', 'forest', 'garden', 'happy',
    'island', 'jungle', 'kitten', 'lemon', 'mango', 'ocean', 'panda', 'rabbit',
    'sunny', 'tiger', 'umbrella', 'violet', 'whale', 'yellow', 'zebra', 'cloud',
    'star', 'moon', 'river', 'mountain', 'flower', 'bird', 'fish', 'tree',
    'rainbow', 'rocket', 'planet', 'cookie', 'puppy', 'dolphin', 'penguin', 'lion'
]


def generate_simple_password():
    """
    Generate a kid-friendly password: 4-digit PIN + word
    Example: 1234apple, 5678tiger
    """
    import random
    pin = str(random.randint(1000, 9999))
    word = random.choice(KID_FRIENDLY_WORDS)
    return f"{pin}{word}"


def validate_simple_password(password: str):
    """
    Validate password for young students using PIN + word format.
    Accepts: 4+ digits followed by 4+ letters, OR 4+ letters followed by 4+ digits
    Examples: 1234apple, sunny5678

    Returns: (is_valid, error_message)
    """
    if not password or len(password) < 8:
        return False, 'Password must be at least 8 characters (4 digits + 4 letters)'

    pattern = re.compile(r'^\d{4,}[a-zA-Z]{4,}$|^[a-zA-Z]{4,}\d{4,}$')
    if pattern.match(password):
        return True, None

    return False, 'Password must be a PIN (4+ digits) followed by a word (4+ letters), like "1234apple"'
