"""
Input validation utilities for API endpoints
"""
import re
import bleach
from typing import Dict, List, Any, Optional

# UUID v4 validation pattern
UUID_REGEX = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', re.IGNORECASE)

def validate_email(email: str) -> tuple[bool, Optional[str]]:
    """
    Validate email format
    Returns: (is_valid, error_message)
    """
    if not email:
        return False, "Email is required"
    
    # Basic email regex pattern
    email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    
    if not email_pattern.match(email):
        return False, "Invalid email format"
    
    if len(email) > 255:
        return False, "Email is too long (max 255 characters)"
    
    return True, None

def validate_password(password: str) -> tuple[bool, Optional[str]]:
    """
    Validate password strength with enhanced security requirements
    Returns: (is_valid, error_message)
    """
    if not password:
        return False, "Password is required"
    
    if len(password) < 12:
        return False, "Password must be at least 12 characters long"
    
    if len(password) > 128:
        return False, "Password is too long (max 128 characters)"
    
    # Check for at least one uppercase, one lowercase, one number, and one special character
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password)
    
    missing_requirements = []
    if not has_upper:
        missing_requirements.append("uppercase letter")
    if not has_lower:
        missing_requirements.append("lowercase letter")
    if not has_digit:
        missing_requirements.append("number")
    if not has_special:
        missing_requirements.append("special character (!@#$%^&*()_+-=[]{}|;:,.<>?)")
    
    if missing_requirements:
        return False, f"Password must contain at least one: {', '.join(missing_requirements)}"
    
    # Check for common weak patterns
    weak_patterns = [
        r'(.)\1{2,}',  # Same character repeated 3+ times
        r'123|abc|password|qwerty|admin',  # Common sequences
        r'^.{0,2}(.+)\1',  # Short repeated patterns
    ]
    
    for pattern in weak_patterns:
        if re.search(pattern, password.lower()):
            return False, "Password contains common weak patterns. Please choose a more complex password"
    
    return True, None

def validate_name(name: str, field_name: str = "Name") -> tuple[bool, Optional[str]]:
    """
    Validate name fields (first name, last name)
    Returns: (is_valid, error_message)
    """
    if not name:
        return False, f"{field_name} is required"
    
    if len(name) < 1:
        return False, f"{field_name} must be at least 1 character long"
    
    if len(name) > 50:
        return False, f"{field_name} is too long (max 50 characters)"
    
    # Allow letters, spaces, hyphens, and apostrophes
    name_pattern = re.compile(r"^[a-zA-Z\s\-']+$")
    if not name_pattern.match(name):
        return False, f"{field_name} can only contain letters, spaces, hyphens, and apostrophes"
    
    return True, None

def validate_registration_data(data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate complete registration data
    Returns: (is_valid, error_message)
    """
    # Check required fields
    required_fields = ['email', 'password', 'first_name', 'last_name']
    for field in required_fields:
        if field not in data or not data[field]:
            return False, f"Missing required field: {field}"
    
    # Validate email
    is_valid, error = validate_email(data['email'])
    if not is_valid:
        return False, error
    
    # Validate password
    is_valid, error = validate_password(data['password'])
    if not is_valid:
        return False, error
    
    # Validate first name
    is_valid, error = validate_name(data['first_name'], "First name")
    if not is_valid:
        return False, error
    
    # Validate last name
    is_valid, error = validate_name(data['last_name'], "Last name")
    if not is_valid:
        return False, error
    
    return True, None

def sanitize_input(text: str, strip_html: bool = True, allowed_tags: list = None) -> str:
    """
    Sanitize user input to prevent XSS and injection attacks using bleach library

    Args:
        text: The text to sanitize
        strip_html: If True, strip all HTML tags. If False, allow specified tags.
        allowed_tags: List of allowed HTML tags (only used if strip_html=False)

    Returns:
        Sanitized text string
    """
    if not text:
        return ""

    if strip_html:
        # Strip all HTML tags for maximum security
        text = bleach.clean(text, tags=[], strip=True)
    else:
        # Allow only specified tags with strict attribute filtering
        if allowed_tags is None:
            allowed_tags = ['b', 'i', 'u', 'em', 'strong', 'p', 'br']

        allowed_attributes = {}  # No attributes allowed by default
        text = bleach.clean(
            text,
            tags=allowed_tags,
            attributes=allowed_attributes,
            strip=True
        )

    # Additional safety: escape any remaining special characters
    text = bleach.linkify(text, parse_email=False)  # Linkify URLs but not emails

    return text.strip()

def sanitize_rich_text(text: str) -> str:
    """
    Sanitize rich text fields (quest descriptions, evidence text, user bios)
    Allows basic formatting tags but strips dangerous content

    Returns:
        Sanitized text with safe HTML formatting
    """
    if not text:
        return ""

    # Allow basic formatting tags for rich text
    allowed_tags = [
        'p', 'br', 'strong', 'em', 'u', 'b', 'i',
        'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'blockquote', 'code', 'pre'
    ]

    # Allow only safe attributes on links
    allowed_attributes = {
        'a': ['href', 'title'],
        '*': []  # No attributes for other tags
    }

    # Allowed protocols for links (prevent javascript: urls)
    allowed_protocols = ['http', 'https', 'mailto']

    text = bleach.clean(
        text,
        tags=allowed_tags,
        attributes=allowed_attributes,
        protocols=allowed_protocols,
        strip=True
    )

    return text.strip()

def validate_uuid(uuid_string: str) -> tuple[bool, Optional[str]]:
    """
    Validate UUID v4 format to prevent SQL injection
    Returns: (is_valid, error_message)
    """
    if not uuid_string:
        return False, "UUID cannot be empty"

    if not isinstance(uuid_string, str):
        return False, "UUID must be a string"

    if not UUID_REGEX.match(uuid_string):
        return False, "Invalid UUID format"

    return True, None

def validate_quest_data(data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate quest creation/update data
    Returns: (is_valid, error_message)
    """
    if 'title' in data:
        if not data['title']:
            return False, "Quest title is required"
        if len(data['title']) > 100:
            return False, "Quest title is too long (max 100 characters)"
    
    if 'description' in data:
        if not data['description']:
            return False, "Quest description is required"
        if len(data['description']) > 1000:
            return False, "Quest description is too long (max 1000 characters)"
    
    if 'difficulty_level' in data:
        valid_levels = ['beginner', 'intermediate', 'advanced']
        if data['difficulty_level'] not in valid_levels:
            return False, f"Invalid difficulty level. Must be one of: {', '.join(valid_levels)}"
    
    if 'estimated_hours' in data:
        try:
            hours = float(data['estimated_hours'])
            if hours < 0.5 or hours > 100:
                return False, "Estimated hours must be between 0.5 and 100"
        except (ValueError, TypeError):
            return False, "Estimated hours must be a number"
    
    return True, None