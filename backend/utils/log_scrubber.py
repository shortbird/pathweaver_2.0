"""
Log scrubbing utility for masking PII and sensitive data (P1-SEC-4)

GDPR/Privacy compliance:
- Masks user IDs to prevent PII tracking
- Limits token exposure for security
- Masks email addresses to prevent enumeration
- Environment-aware (more verbose in development)

OWASP: A09:2021 - Security Logging and Monitoring Failures mitigation
"""

import os
import re
from typing import Optional


def mask_user_id(user_id: Optional[str]) -> str:
    """
    Mask user ID for logging (GDPR compliance)

    Args:
        user_id: UUID string or None

    Returns:
        Masked user ID showing only first 8 characters

    Examples:
        >>> mask_user_id('550e8400-e29b-41d4-a716-446655440000')
        '550e8400-***'
        >>> mask_user_id(None)
        'None'
    """
    if not user_id:
        return 'None'

    # UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    # Show first 8 chars (first segment) only
    if isinstance(user_id, str) and len(user_id) >= 8:
        return f"{user_id[:8]}-***"

    return '***'


def mask_token(token: Optional[str], max_chars: int = 8) -> str:
    """
    Mask JWT token or access token for logging

    Args:
        token: JWT token string or None
        max_chars: Maximum characters to show (default: 8)

    Returns:
        Masked token showing only first max_chars characters

    Examples:
        >>> mask_token('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
        'eyJhbGci...'
        >>> mask_token(None)
        'None'
    """
    if not token:
        return 'None'

    if isinstance(token, str) and len(token) > max_chars:
        return f"{token[:max_chars]}..."

    return token if isinstance(token, str) else '***'


def mask_email(email: Optional[str]) -> str:
    """
    Mask email address for logging (prevent enumeration attacks)

    Args:
        email: Email address string or None

    Returns:
        Masked email showing only first 3 chars + domain

    Examples:
        >>> mask_email('user@example.com')
        'use***@example.com'
        >>> mask_email('a@b.com')
        'a***@b.com'
        >>> mask_email(None)
        'None'
    """
    if not email or not isinstance(email, str):
        return 'None'

    if '@' not in email:
        # Invalid email format, mask entire string
        return '***'

    local, domain = email.split('@', 1)

    # Show first 3 chars of local part (or less if shorter)
    visible_chars = min(3, len(local))
    masked_local = f"{local[:visible_chars]}***"

    return f"{masked_local}@{domain}"


def mask_pii(text: str) -> str:
    """
    Auto-detect and mask PII in log messages

    Detects and masks:
    - Email addresses
    - UUIDs (potential user IDs)
    - JWT tokens (starts with 'eyJ')

    Args:
        text: Log message text

    Returns:
        Text with PII masked

    Examples:
        >>> mask_pii('User user@example.com logged in')
        'User use***@example.com logged in'
        >>> mask_pii('Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature')
        'Token: eyJhbGci...'
    """
    # Email pattern
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    text = re.sub(email_pattern, lambda m: mask_email(m.group(0)), text)

    # UUID pattern (potential user IDs)
    uuid_pattern = r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b'
    text = re.sub(uuid_pattern, lambda m: mask_user_id(m.group(0)), text)

    # JWT token pattern (starts with 'eyJ')
    jwt_pattern = r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'
    text = re.sub(jwt_pattern, lambda m: mask_token(m.group(0)), text)

    return text


def should_log_sensitive_data() -> bool:
    """
    Check if sensitive data logging is allowed (development only)

    Returns:
        True if FLASK_ENV is 'development', False otherwise
    """
    return os.getenv('FLASK_ENV', 'production') == 'development'


def log_safe_user_context(user_id: Optional[str], **kwargs) -> dict:
    """
    Create safe logging context dict with masked user ID

    Args:
        user_id: User ID to mask
        **kwargs: Additional context to include

    Returns:
        Dict with masked user_id and any additional context

    Examples:
        >>> log_safe_user_context('550e8400-e29b-41d4-a716-446655440000', action='login')
        {'user_id': '550e8400-***', 'action': 'login'}
    """
    context = {'user_id': mask_user_id(user_id)}
    context.update(kwargs)
    return context


def log_safe_auth_attempt(email: str, success: bool, **kwargs) -> dict:
    """
    Create safe logging context for authentication attempts

    Args:
        email: Email address to mask
        success: Whether auth was successful
        **kwargs: Additional context

    Returns:
        Dict with masked email and auth result

    Examples:
        >>> log_safe_auth_attempt('user@example.com', True)
        {'email': 'use***@example.com', 'success': True}
    """
    context = {
        'email': mask_email(email),
        'success': success
    }
    context.update(kwargs)
    return context


# Convenience functions for common logging patterns
def log_user_action(logger, level: str, action: str, user_id: Optional[str], **kwargs):
    """
    Log user action with masked user ID

    Args:
        logger: Logger instance
        level: Log level ('debug', 'info', 'warning', 'error')
        action: Action description
        user_id: User ID to mask
        **kwargs: Additional context
    """
    log_func = getattr(logger, level)
    context = log_safe_user_context(user_id, **kwargs)
    log_func(f"[USER_ACTION] {action}", extra=context)


def log_auth_event(logger, level: str, event: str, email: str, success: bool, **kwargs):
    """
    Log authentication event with masked email

    Args:
        logger: Logger instance
        level: Log level ('debug', 'info', 'warning', 'error')
        event: Event description
        email: Email to mask
        success: Whether event was successful
        **kwargs: Additional context
    """
    log_func = getattr(logger, level)
    context = log_safe_auth_attempt(email, success, **kwargs)
    log_func(f"[AUTH] {event}", extra=context)


# Testing
if __name__ == '__main__':
    # Run doctests
    import doctest
    doctest.testmod(verbose=True)

    # Additional tests
    print("\n=== Additional Tests ===")
    print(f"mask_user_id('550e8400-e29b-41d4-a716-446655440000'): {mask_user_id('550e8400-e29b-41d4-a716-446655440000')}")
    print(f"mask_token('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'): {mask_token('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')}")
    print(f"mask_email('user@example.com'): {mask_email('user@example.com')}")
    print(f"mask_pii('User 550e8400-e29b-41d4-a716-446655440000 with user@example.com logged in'): {mask_pii('User 550e8400-e29b-41d4-a716-446655440000 with user@example.com logged in')}")
