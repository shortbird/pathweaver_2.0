"""Field validators and validation schemas"""

from typing import Any, Dict, List, Optional, Callable, Tuple
from datetime import datetime
import re

# UUID v4 validation pattern
UUID_REGEX = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', re.IGNORECASE)

class FieldValidator:
    """Base field validator class"""
    
    def __init__(self, required: bool = False, error_message: Optional[str] = None):
        self.required = required
        self.error_message = error_message
    
    def validate(self, value: Any, field_name: str) -> Tuple[bool, Optional[str]]:
        """Validate field value"""
        if value is None or value == "":
            if self.required:
                return False, self.error_message or f"{field_name} is required"
            return True, None
        
        return self._validate_value(value, field_name)
    
    def _validate_value(self, value: Any, field_name: str) -> Tuple[bool, Optional[str]]:
        """Override in subclasses to implement specific validation"""
        return True, None

class RequiredField(FieldValidator):
    """Validator for required fields"""
    
    def __init__(self):
        super().__init__(required=True)

class EmailField(FieldValidator):
    """Email field validator"""
    
    def _validate_value(self, value: str, field_name: str) -> Tuple[bool, Optional[str]]:
        email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
        
        if not email_pattern.match(value):
            return False, self.error_message or "Invalid email format"
        
        if len(value) > 255:
            return False, "Email is too long (max 255 characters)"
        
        return True, None

class StringField(FieldValidator):
    """String field validator with length constraints"""
    
    def __init__(self, min_length: int = 0, max_length: int = 255, 
                 pattern: Optional[str] = None, **kwargs):
        super().__init__(**kwargs)
        self.min_length = min_length
        self.max_length = max_length
        self.pattern = re.compile(pattern) if pattern else None
    
    def _validate_value(self, value: str, field_name: str) -> Tuple[bool, Optional[str]]:
        if len(value) < self.min_length:
            return False, f"{field_name} must be at least {self.min_length} characters"
        
        if len(value) > self.max_length:
            return False, f"{field_name} must not exceed {self.max_length} characters"
        
        if self.pattern and not self.pattern.match(value):
            return False, self.error_message or f"{field_name} has invalid format"
        
        return True, None

class IntegerField(FieldValidator):
    """Integer field validator with range constraints"""
    
    def __init__(self, min_value: Optional[int] = None, 
                 max_value: Optional[int] = None, **kwargs):
        super().__init__(**kwargs)
        self.min_value = min_value
        self.max_value = max_value
    
    def _validate_value(self, value: Any, field_name: str) -> Tuple[bool, Optional[str]]:
        try:
            int_value = int(value)
        except (ValueError, TypeError):
            return False, f"{field_name} must be an integer"
        
        if self.min_value is not None and int_value < self.min_value:
            return False, f"{field_name} must be at least {self.min_value}"
        
        if self.max_value is not None and int_value > self.max_value:
            return False, f"{field_name} must not exceed {self.max_value}"
        
        return True, None

class FloatField(FieldValidator):
    """Float field validator with range constraints"""
    
    def __init__(self, min_value: Optional[float] = None, 
                 max_value: Optional[float] = None, **kwargs):
        super().__init__(**kwargs)
        self.min_value = min_value
        self.max_value = max_value
    
    def _validate_value(self, value: Any, field_name: str) -> Tuple[bool, Optional[str]]:
        try:
            float_value = float(value)
        except (ValueError, TypeError):
            return False, f"{field_name} must be a number"
        
        if self.min_value is not None and float_value < self.min_value:
            return False, f"{field_name} must be at least {self.min_value}"
        
        if self.max_value is not None and float_value > self.max_value:
            return False, f"{field_name} must not exceed {self.max_value}"
        
        return True, None

class DateField(FieldValidator):
    """Date field validator"""
    
    def __init__(self, date_format: str = "%Y-%m-%d", 
                 min_date: Optional[datetime] = None,
                 max_date: Optional[datetime] = None, **kwargs):
        super().__init__(**kwargs)
        self.date_format = date_format
        self.min_date = min_date
        self.max_date = max_date
    
    def _validate_value(self, value: Any, field_name: str) -> Tuple[bool, Optional[str]]:
        if isinstance(value, datetime):
            date_value = value
        else:
            try:
                date_value = datetime.strptime(str(value), self.date_format)
            except ValueError:
                return False, f"{field_name} must be a valid date ({self.date_format})"
        
        if self.min_date and date_value < self.min_date:
            return False, f"{field_name} must be after {self.min_date.strftime(self.date_format)}"
        
        if self.max_date and date_value > self.max_date:
            return False, f"{field_name} must be before {self.max_date.strftime(self.date_format)}"
        
        return True, None

class ChoiceField(FieldValidator):
    """Choice field validator"""
    
    def __init__(self, choices: List[Any], **kwargs):
        super().__init__(**kwargs)
        self.choices = choices
    
    def _validate_value(self, value: Any, field_name: str) -> Tuple[bool, Optional[str]]:
        if value not in self.choices:
            choices_str = ", ".join(str(c) for c in self.choices)
            return False, f"{field_name} must be one of: {choices_str}"
        
        return True, None

class ValidationSchema:
    """Schema for validating complex data structures"""
    
    def __init__(self, fields: Dict[str, FieldValidator]):
        self.fields = fields
    
    def validate(self, data: Dict[str, Any]) -> Tuple[bool, Dict[str, str]]:
        """
        Validate data against schema
        
        Returns:
            Tuple of (is_valid, errors_dict)
        """
        errors = {}
        
        for field_name, validator in self.fields.items():
            value = data.get(field_name)
            is_valid, error_message = validator.validate(value, field_name)
            
            if not is_valid:
                errors[field_name] = error_message
        
        return len(errors) == 0, errors

# Utility validation functions
def validate_required_fields(data: Dict[str, Any], required_fields: List[str]) -> None:
    """
    Validate that required fields are present in data
    Raises ValueError if any required field is missing
    """
    missing_fields = []
    for field in required_fields:
        if field not in data or data[field] is None or data[field] == "":
            missing_fields.append(field)

    if missing_fields:
        raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")

def validate_string_length(value: str, field_name: str, min_length: int = 0, max_length: int = 255) -> None:
    """
    Validate string length
    Raises ValueError if string is too short or too long
    """
    if value is None:
        value = ""

    if len(value) < min_length:
        raise ValueError(f"{field_name} must be at least {min_length} characters long")

    if len(value) > max_length:
        raise ValueError(f"{field_name} must not exceed {max_length} characters")

def validate_uuid(uuid_string: str) -> Tuple[bool, Optional[str]]:
    """
    Validate UUID v4 format to prevent SQL injection

    Args:
        uuid_string: String to validate as UUID

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not uuid_string:
        return False, "UUID cannot be empty"

    if not isinstance(uuid_string, str):
        return False, "UUID must be a string"

    if not UUID_REGEX.match(uuid_string):
        return False, "Invalid UUID format"

    return True, None

# Example schemas
USER_REGISTRATION_SCHEMA = ValidationSchema({
    'email': EmailField(required=True),
    'password': StringField(required=True, min_length=8, max_length=128),
    'first_name': StringField(required=True, min_length=1, max_length=50),
    'last_name': StringField(required=True, min_length=1, max_length=50)
})

QUEST_CREATION_SCHEMA = ValidationSchema({
    'title': StringField(required=True, min_length=3, max_length=100),
    'description': StringField(required=True, min_length=10, max_length=1000),
    'difficulty': ChoiceField(choices=['beginner', 'intermediate', 'advanced'], required=True),
    'category': StringField(required=True, max_length=50),
    'estimated_hours': FloatField(min_value=0.5, max_value=100)
})