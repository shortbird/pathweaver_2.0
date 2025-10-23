"""
Input sanitization utilities for preventing SQL injection and XSS attacks.
"""

import re
from typing import Optional, Any
import html

from utils.logger import get_logger

logger = get_logger(__name__)

def sanitize_search_input(search_term: Optional[str], max_length: int = 100) -> str:
    """
    Sanitize search input to prevent SQL injection.
    
    Args:
        search_term: The search term to sanitize
        max_length: Maximum allowed length for search term
        
    Returns:
        Sanitized search term safe for database queries
    """
    if not search_term:
        return ""
    
    # Convert to string and strip whitespace
    search_term = str(search_term).strip()
    
    # Limit length to prevent DOS attacks
    if len(search_term) > max_length:
        search_term = search_term[:max_length]
    
    # Remove SQL special characters and potential injection patterns
    # Allow only alphanumeric, spaces, and basic punctuation
    search_term = re.sub(r'[^\w\s\-.,!?@#]', '', search_term)
    
    # Remove multiple spaces
    search_term = re.sub(r'\s+', ' ', search_term)
    
    # Remove SQL keywords that could be used for injection
    sql_keywords = [
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 
        'ALTER', 'EXEC', 'EXECUTE', 'UNION', 'FROM', 'WHERE',
        'OR', 'AND', 'NOT', '--', '/*', '*/', 'XP_', 'SP_'
    ]
    
    for keyword in sql_keywords:
        # Case-insensitive replacement
        pattern = re.compile(re.escape(keyword), re.IGNORECASE)
        search_term = pattern.sub('', search_term)
    
    return search_term.strip()

def sanitize_html_input(text: Optional[str], max_length: int = 5000) -> str:
    """
    Sanitize HTML input to prevent XSS attacks.
    
    Args:
        text: The text to sanitize
        max_length: Maximum allowed length
        
    Returns:
        HTML-escaped text safe for display
    """
    if not text:
        return ""
    
    # Convert to string and limit length
    text = str(text)[:max_length]
    
    # HTML escape to prevent XSS
    return html.escape(text)

def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent directory traversal attacks.
    
    Args:
        filename: The filename to sanitize
        
    Returns:
        Safe filename without directory traversal patterns
    """
    if not filename:
        return "unnamed"
    
    # Remove directory traversal patterns
    filename = filename.replace('..', '')
    filename = filename.replace('/', '')
    filename = filename.replace('\\', '')
    
    # Remove null bytes
    filename = filename.replace('\x00', '')
    
    # Keep only safe characters
    filename = re.sub(r'[^a-zA-Z0-9._\-]', '_', filename)
    
    # Limit length
    if len(filename) > 255:
        name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
        if ext:
            # Preserve extension
            max_name_length = 250 - len(ext)
            filename = f"{name[:max_name_length]}.{ext}"
        else:
            filename = filename[:255]
    
    return filename or "unnamed"

def sanitize_integer(value: Any, default: int = 0, min_val: Optional[int] = None, max_val: Optional[int] = None) -> int:
    """
    Sanitize and validate integer input.
    
    Args:
        value: The value to sanitize
        default: Default value if invalid
        min_val: Minimum allowed value
        max_val: Maximum allowed value
        
    Returns:
        Valid integer within specified range
    """
    try:
        result = int(value)
        
        if min_val is not None and result < min_val:
            return min_val
        if max_val is not None and result > max_val:
            return max_val
            
        return result
    except (ValueError, TypeError):
        return default

def sanitize_email(email: Optional[str]) -> str:
    """
    Sanitize email address input.
    
    Args:
        email: The email to sanitize
        
    Returns:
        Sanitized email address
    """
    if not email:
        return ""
    
    # Basic email sanitization
    email = str(email).strip().lower()
    
    # Remove any HTML/script tags
    email = re.sub(r'<[^>]*>', '', email)
    
    # Basic email pattern validation
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        return ""
    
    return email[:255]  # Limit length

def sanitize_url(url: Optional[str]) -> str:
    """
    Sanitize URL input to prevent injection attacks.
    
    Args:
        url: The URL to sanitize
        
    Returns:
        Sanitized URL
    """
    if not url:
        return ""
    
    url = str(url).strip()
    
    # Remove javascript: and data: protocols
    if url.lower().startswith(('javascript:', 'data:', 'vbscript:')):
        return ""
    
    # Remove any HTML/script tags
    url = re.sub(r'<[^>]*>', '', url)
    
    # Limit length
    return url[:2000]

def sanitize_json_key(key: str) -> str:
    """
    Sanitize JSON object keys to prevent injection.
    
    Args:
        key: The key to sanitize
        
    Returns:
        Safe key for JSON objects
    """
    if not key:
        return ""
    
    # Allow only alphanumeric and underscore
    return re.sub(r'[^\w]', '_', str(key))[:100]