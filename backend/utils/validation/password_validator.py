"""
Password strength validation module for Optio platform.

Enforces strong password requirements to prevent brute force attacks
and improve account security (OWASP A07:2021 compliance).

Requirements (Phase 1 Security Fix):
- Minimum 12 characters (increased from 6)
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 digit
- At least 1 special character
- Not in common password blacklist

Created: January 2025 (Phase 1 Security Improvements)
"""

import re
from typing import Tuple, List

from utils.logger import get_logger

logger = get_logger(__name__)

# Top 100 most common passwords (security risk)
# Source: NIST, Have I Been Pwned, OWASP
COMMON_PASSWORDS = [
    'password', 'password123', '123456', '123456789', 'qwerty', 'abc123',
    '12345678', '111111', '1234567', 'password1', '12345', '1234567890',
    '123123', '000000', 'iloveyou', '1234', '1q2w3e4r5t', 'qwertyuiop',
    'monkey', 'dragon', 'passw0rd', 'master', 'hello', 'freedom',
    'whatever', 'qazwsx', 'trustno1', 'jordan', 'password123456',
    'starwars', '654321', 'superman', '1qaz2wsx', 'sunshine', 'admin',
    'welcome', 'login', 'princess', 'solo', 'qwerty123', 'football',
    'shadow', 'michael', 'jennifer', '111', 'admin123', 'letmein',
    'welcome123', 'monkey123', '123321', 'qwerty1', 'password1234',
    'abc12345', 'mypassword', 'computer', 'hello123', 'trustno1',
    'welcome1', 'baseball', 'batman', 'superman123', 'iloveyou123',
    'qwerty12345', 'password12345', 'admin1234', 'letmein123',
    'qwertyui', '12341234', 'password!', 'Password1', 'Password123',
    'Welcome1', 'Welcome123', 'Admin123', 'Qwerty123', 'Abc123456',
    'Password1!', 'Welcome1!', 'Admin123!', 'Qwerty123!', 'Abc123456!',
    'P@ssw0rd', 'P@ssword', 'P@ssword1', 'P@ssword123', 'Passw0rd!',
    'Summer2024', 'Winter2024', 'Spring2024', 'Fall2024', 'January2024',
    'Company123', 'Company2024', 'Business123', 'Office123', 'User1234',
    'Test1234', 'Demo1234', 'Sample123', 'Example123', 'Default123',
]

# Compile regex patterns once for performance
UPPERCASE_PATTERN = re.compile(r'[A-Z]')
LOWERCASE_PATTERN = re.compile(r'[a-z]')
DIGIT_PATTERN = re.compile(r'\d')
SPECIAL_PATTERN = re.compile(r'[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;/~`]')


def validate_password_strength(password: str) -> Tuple[bool, List[str]]:
    """
    Validates password meets security requirements.

    Args:
        password: The password string to validate

    Returns:
        Tuple of (is_valid, error_messages)
        - is_valid: True if password meets all requirements
        - error_messages: List of specific requirement violations

    Example:
        >>> is_valid, errors = validate_password_strength("weak")
        >>> print(errors)
        ['Password must be at least 12 characters long', ...]

        >>> is_valid, errors = validate_password_strength("MyP@ssw0rd2025!")
        >>> print(is_valid)
        True
    """
    errors = []

    # Length check (12+ characters)
    if len(password) < 12:
        errors.append("Password must be at least 12 characters long")

    # Uppercase check
    if not UPPERCASE_PATTERN.search(password):
        errors.append("Password must contain at least one uppercase letter (A-Z)")

    # Lowercase check
    if not LOWERCASE_PATTERN.search(password):
        errors.append("Password must contain at least one lowercase letter (a-z)")

    # Digit check
    if not DIGIT_PATTERN.search(password):
        errors.append("Password must contain at least one digit (0-9)")

    # Special character check
    if not SPECIAL_PATTERN.search(password):
        errors.append("Password must contain at least one special character (!@#$%^&*...)")

    # Common password check (case-insensitive)
    if password.lower() in COMMON_PASSWORDS:
        errors.append("This password is too common and easily guessed. Please choose a more unique password")

    # Additional pattern checks for weak passwords
    if password.lower().startswith('password'):
        errors.append("Avoid using 'password' as the base of your password")

    if re.match(r'^[a-zA-Z]+\d+$', password):  # Like "Password123"
        errors.append("Avoid simple patterns like 'Word' followed by numbers")

    return (len(errors) == 0, errors)


def get_password_strength_score(password: str) -> int:
    """
    Calculate password strength score (0-100).

    Used for password strength meter UI component.

    Args:
        password: The password to score

    Returns:
        Integer score from 0-100 where:
        - 0-25: Very Weak (red)
        - 26-50: Weak (orange)
        - 51-75: Medium (yellow)
        - 76-90: Strong (light green)
        - 91-100: Very Strong (dark green)
    """
    score = 0

    # Length scoring (max 30 points)
    if len(password) >= 12:
        score += 20
        if len(password) >= 16:
            score += 5
        if len(password) >= 20:
            score += 5

    # Character diversity (max 40 points)
    if UPPERCASE_PATTERN.search(password):
        score += 10
    if LOWERCASE_PATTERN.search(password):
        score += 10
    if DIGIT_PATTERN.search(password):
        score += 10
    if SPECIAL_PATTERN.search(password):
        score += 10

    # Unique character count (max 20 points)
    unique_chars = len(set(password))
    if unique_chars >= 8:
        score += 10
    if unique_chars >= 12:
        score += 10

    # Entropy bonus (max 10 points)
    # Check for patterns that reduce entropy
    has_no_patterns = True
    if password.lower() in COMMON_PASSWORDS:
        has_no_patterns = False
        score -= 50  # Major penalty
    if password.lower().startswith('password'):
        has_no_patterns = False
        score -= 20
    if re.match(r'^[a-zA-Z]+\d+$', password):
        has_no_patterns = False
        score -= 10

    if has_no_patterns:
        score += 10

    # Cap at 100
    return max(0, min(100, score))


def get_password_strength_label(score: int) -> str:
    """
    Get human-readable label for password strength score.

    Args:
        score: Password strength score (0-100)

    Returns:
        String label: "Very Weak", "Weak", "Medium", "Strong", or "Very Strong"
    """
    if score <= 25:
        return "Very Weak"
    elif score <= 50:
        return "Weak"
    elif score <= 75:
        return "Medium"
    elif score <= 90:
        return "Strong"
    else:
        return "Very Strong"
