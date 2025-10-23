"""Input validation functions"""

import re
from typing import Dict, Any, Optional, Tuple
from .password_validator import validate_password_strength

from utils.logger import get_logger

logger = get_logger(__name__)

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
    Validate password strength using comprehensive security requirements.

    ✅ SECURITY FIX (Phase 1): Enhanced from 6-char minimum to 12-char with complexity.

    Requirements:
    - Minimum 12 characters (increased from 6)
    - At least 1 uppercase letter
    - At least 1 lowercase letter
    - At least 1 digit
    - At least 1 special character
    - Not in common password blacklist

    Returns: (is_valid, error_message)

    Note: Existing users with 6-char passwords are grandfathered in.
    This validation only applies to NEW registrations and password changes.
    """
    if not password:
        return False, "Password is required"

    if len(password) > 128:
        return False, "Password is too long (max 128 characters)"

    # Use new comprehensive password strength validator
    is_valid, errors = validate_password_strength(password)

    if not is_valid:
        # Return the first error as the primary message
        # Full error list will be available in frontend for detailed feedback
        return False, errors[0]

    return True, None

def validate_phone_number(phone: str) -> Tuple[bool, Optional[str]]:
    """
    Validate phone number format (international format supported)
    Returns: (is_valid, error_message)
    """
    if not phone:
        return True, None  # Phone is optional

    # Remove common formatting characters
    cleaned = re.sub(r'[\s\-\(\)\.]', '', phone)

    # Check if it contains only digits and optional leading +
    if not re.match(r'^\+?\d+$', cleaned):
        return False, "Phone number can only contain digits, spaces, hyphens, parentheses, and an optional leading +"

    # Check length (international numbers typically 7-15 digits)
    digit_only = cleaned.lstrip('+')
    if len(digit_only) < 7 or len(digit_only) > 15:
        return False, "Phone number must be between 7 and 15 digits"

    return True, None

def validate_address(address_data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Validate address fields (all optional)
    Returns: (is_valid, error_message)
    """
    # All address fields are optional, just validate lengths if provided

    if address_data.get('address_line1') and len(address_data['address_line1']) > 255:
        return False, "Address line 1 is too long (max 255 characters)"

    if address_data.get('address_line2') and len(address_data['address_line2']) > 255:
        return False, "Address line 2 is too long (max 255 characters)"

    if address_data.get('city') and len(address_data['city']) > 100:
        return False, "City is too long (max 100 characters)"

    if address_data.get('state') and len(address_data['state']) > 100:
        return False, "State/Province is too long (max 100 characters)"

    if address_data.get('postal_code') and len(address_data['postal_code']) > 20:
        return False, "Postal code is too long (max 20 characters)"

    if address_data.get('country') and len(address_data['country']) > 100:
        return False, "Country is too long (max 100 characters)"

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

    # Validate optional phone number
    if data.get('phone_number'):
        is_valid, error = validate_phone_number(data['phone_number'])
        if not is_valid:
            return False, error

    # Validate optional address fields
    is_valid, error = validate_address(data)
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