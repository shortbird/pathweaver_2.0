"""Input sanitization utilities"""

import re
import html
from typing import Optional

from utils.logger import get_logger

logger = get_logger(__name__)

def sanitize_input(text: str) -> str:
    """
    Sanitize user input to prevent XSS and injection attacks
    
    Args:
        text: Raw input text
    
    Returns:
        Sanitized text safe for storage and display
    """
    if not text:
        return ""
    
    # Remove any HTML tags
    text = re.sub(r'<[^>]*>', '', text)
    
    # Escape HTML entities
    text = html.escape(text)
    
    # Remove null bytes
    text = text.replace('\x00', '')
    
    # Normalize whitespace
    text = ' '.join(text.split())
    
    return text.strip()

def sanitize_html(html_content: str, allowed_tags: Optional[list] = None) -> str:
    """
    Sanitize HTML content, allowing only specific tags
    
    Args:
        html_content: HTML content to sanitize
        allowed_tags: List of allowed HTML tags (default: basic formatting)
    
    Returns:
        Sanitized HTML content
    """
    if not html_content:
        return ""
    
    # Default allowed tags for basic formatting
    if allowed_tags is None:
        allowed_tags = ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li']
    
    # Try to use bleach if available
    try:
        import bleach
        
        # Configure allowed attributes for specific tags
        allowed_attributes = {
            'a': ['href', 'title'],
        }
        
        # Sanitize with bleach
        cleaned = bleach.clean(
            html_content,
            tags=allowed_tags,
            attributes=allowed_attributes,
            strip=True
        )
        
        # Additional sanitization for URLs in href
        if 'a' in allowed_tags:
            cleaned = sanitize_urls(cleaned)
        
        return cleaned
        
    except ImportError:
        # Fallback to basic sanitization if bleach is not available
        # Remove all HTML tags except allowed ones
        pattern = r'<(?!/?(?:' + '|'.join(allowed_tags) + r')(?:\s|>))[^>]*>'
        cleaned = re.sub(pattern, '', html_content)
        
        # Escape remaining content
        return html.escape(cleaned)

def sanitize_urls(content: str) -> str:
    """
    Sanitize URLs in content to prevent XSS via javascript: URLs
    
    Args:
        content: Content containing URLs
    
    Returns:
        Content with sanitized URLs
    """
    # Remove javascript: and data: URLs
    dangerous_protocols = ['javascript:', 'data:', 'vbscript:']
    
    for protocol in dangerous_protocols:
        content = re.sub(
            rf'href\s*=\s*["\']?{re.escape(protocol)}[^"\'>\s]*',
            'href="#"',
            content,
            flags=re.IGNORECASE
        )
    
    return content

def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent directory traversal attacks
    
    Args:
        filename: Original filename
    
    Returns:
        Safe filename
    """
    if not filename:
        return "unnamed"
    
    # Remove path components
    filename = filename.replace('..', '')
    filename = filename.replace('/', '')
    filename = filename.replace('\\', '')
    
    # Remove special characters except dots and underscores
    filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    
    # Limit length
    max_length = 255
    if len(filename) > max_length:
        name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
        if ext:
            max_name_length = max_length - len(ext) - 1
            filename = f"{name[:max_name_length]}.{ext}"
        else:
            filename = filename[:max_length]
    
    return filename

def sanitize_sql_identifier(identifier: str) -> str:
    """
    Sanitize SQL identifiers (table names, column names)
    
    Args:
        identifier: SQL identifier
    
    Returns:
        Safe identifier
    """
    if not identifier:
        raise ValueError("Identifier cannot be empty")
    
    # Allow only alphanumeric characters and underscores
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '', identifier)
    
    # Ensure it starts with a letter or underscore
    if sanitized and not re.match(r'^[a-zA-Z_]', sanitized):
        sanitized = '_' + sanitized
    
    # Limit length
    max_length = 63  # PostgreSQL identifier limit
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length]
    
    if not sanitized:
        raise ValueError("Invalid identifier after sanitization")
    
    return sanitized.lower()