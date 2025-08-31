"""Input validation functions"""

import re
from typing import Dict, Any, Optional, Tuple

def validate_email(email: str) -> Tuple[bool, Optional[str]]:
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

def validate_password(password: str) -> Tuple[bool, Optional[str]]:
    """
    Validate password strength to match Supabase requirements
    Returns: (is_valid, error_message)
    """
    if not password:
        return False, "Password is required"
    
    if len(password) < 6:
        return False, "Password must be at least 6 characters long"
    
    if len(password) > 128:
        return False, "Password is too long (max 128 characters)"
    
    # Check for at least one uppercase, one lowercase, and one number
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    
    if not (has_upper and has_lower and has_digit):
        return False, "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    
    # Skip weak pattern check for short passwords
    # With only 6 characters required, weak pattern checking is less relevant
    
    return True, None

def validate_name(name: str, field_name: str = "Name") -> Tuple[bool, Optional[str]]:
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

def validate_registration_data(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
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

def validate_quest_data(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
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
    
    if 'difficulty' in data:
        valid_levels = ['beginner', 'intermediate', 'advanced']
        if data['difficulty'] not in valid_levels:
            return False, f"Invalid difficulty level. Must be one of: {', '.join(valid_levels)}"
    
    if 'estimated_hours' in data:
        try:
            hours = float(data['estimated_hours'])
            if hours < 0.5 or hours > 100:
                return False, "Estimated hours must be between 0.5 and 100"
        except (ValueError, TypeError):
            return False, "Estimated hours must be a number"
    
    return True, None

def validate_submission_data(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Validate quest submission data
    Returns: (is_valid, error_message)
    """
    if 'content' not in data or not data['content']:
        return False, "Submission content is required"
    
    if len(data['content']) > 5000:
        return False, "Submission content is too long (max 5000 characters)"
    
    if 'quest_id' in data:
        if not data['quest_id']:
            return False, "Quest ID is required"
    
    return True, None