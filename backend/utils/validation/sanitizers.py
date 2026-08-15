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
    # Allow only alphanumeric, spaces, and basic punctuation.
    # NOTE: the comma is deliberately NOT allowed. This value is interpolated
    # into PostgREST `.or_()` filter strings like
    # "title.ilike.%{search}%,big_idea.ilike.%{search}%", where a comma starts a
    # NEW top-level condition — so a search of "foo,is_public.eq.true" would
    # inject an extra OR clause. Parens (used for and()/or() grouping) are also
    # excluded by this whitelist. Without a comma, dots inside the value stay
    # inside the ilike pattern and cannot escape it.
    search_term = re.sub(r'[^\w\s\-.!?@#]', '', search_term)
    
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

# ═══════════════════════════════════════════════════════════════════════════════
# PostgREST filter-string safety
# ═══════════════════════════════════════════════════════════════════════════════
#
# `.or_()` (and `.and_()`, `.not_.or_()`, `.filter()`) take a RAW FILTER STRING,
# not bound parameters. supabase-py hands the string to PostgREST verbatim:
#
#     .or_(f"title.ilike.%{search}%,big_idea.ilike.%{search}%")
#
# The grammar is `column.operator.value`, with `,` separating top-level
# conditions and `and(...)` / `or(...)` grouping them. So a value carrying a
# comma does not get escaped — it ENDS the current condition and starts a new
# one. A search for `x,is_public.eq.true` silently ORs in a clause the query
# never asked for, which on a listing endpoint means reading rows the caller is
# not entitled to. Nothing raises; the query just quietly answers a different
# question.
#
# Every user-facing callsite happened to sanitize correctly, but the safety was
# per-callsite rather than by construction: the next `.or_(f"...")` anyone writes
# is unprotected by default, and nothing fails when it is. These helpers make the
# escaping the only way to build the string, and
# backend/tests/test_postgrest_filter_injection.py fails the build on any raw
# interpolation that skips them.
#
# Pick by what the value IS:
#   pgrst_uuid       - an id. Validates; raises rather than guessing.
#   pgrst_timestamp  - an ISO-8601 date/datetime bound.
#   pgrst_int        - a numeric bound.
#   pgrst_enum       - one of a known set (a role, a status).
#   pgrst_pattern    - free text going inside an ilike/like pattern.
#
# The first four VALIDATE and pass the value through unchanged, so they cannot
# alter the behaviour of a correct call. Only pgrst_pattern rewrites its input,
# and only by removing characters that could not have been meaningful inside a
# pattern anyway.

# Characters that terminate a value or open a group in PostgREST's filter
# grammar. Inside a value they are structural, never literal.
_PGRST_STRUCTURAL = re.compile(r'[,()"\\]')

# PostgREST maps `*` to `%` for like/ilike. Callers supply their own wildcards
# around the value, so any the user typed are theirs to widen the match with --
# strip them so a search cannot turn into an unbounded scan.
_PGRST_WILDCARDS = re.compile(r'[%*]')

_PGRST_UUID_RE = re.compile(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-'
    r'[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
)

# YYYY-MM-DD, optionally with a time, fractional seconds and a UTC/offset suffix.
_PGRST_TIMESTAMP_RE = re.compile(
    r'^\d{4}-\d{2}-\d{2}'
    r'(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?'
    r'(?:Z|[+-]\d{2}:?\d{2})?)?$'
)


class PostgrestFilterError(ValueError):
    """A value could not be safely placed into a PostgREST filter string.

    Raised rather than returned so a bad value fails the request loudly instead
    of silently degrading into a filter that matches the wrong rows.
    """


def pgrst_uuid(value: Any, field: str = 'id') -> str:
    """Validate a UUID for interpolation into a PostgREST filter string.

    Returns the UUID unchanged. Raises PostgrestFilterError if it is not a UUID,
    which is the point: a UUID that survives this cannot contain `,`, `.`, `(`
    or `)`, so it cannot alter the shape of the filter.
    """
    text = str(value).strip() if value is not None else ''
    if not _PGRST_UUID_RE.match(text):
        raise PostgrestFilterError(f"{field} must be a UUID for a PostgREST filter")
    return text


def pgrst_timestamp(value: Any, field: str = 'timestamp') -> str:
    """Validate an ISO-8601 date/datetime for a PostgREST filter string.

    Accepts a `date`/`datetime` (rendered with .isoformat()) or an ISO string.
    """
    if hasattr(value, 'isoformat'):
        text = value.isoformat()
    else:
        text = str(value).strip() if value is not None else ''
    if not _PGRST_TIMESTAMP_RE.match(text):
        raise PostgrestFilterError(
            f"{field} must be an ISO-8601 date or timestamp for a PostgREST filter"
        )
    return text


def pgrst_int(value: Any, field: str = 'value') -> str:
    """Validate an integer bound for a PostgREST filter string."""
    try:
        return str(int(value))
    except (TypeError, ValueError):
        raise PostgrestFilterError(f"{field} must be an integer for a PostgREST filter")


def pgrst_enum(value: Any, allowed, field: str = 'value') -> str:
    """Validate that a value is one of a known set before interpolating it.

    For things like roles and statuses, where the safe set is small and known.
    Membership is the escape: nothing outside `allowed` reaches the filter.
    """
    text = str(value).strip() if value is not None else ''
    if text not in set(allowed):
        raise PostgrestFilterError(
            f"{field} must be one of {sorted(set(allowed))} for a PostgREST filter"
        )
    return text


def pgrst_pattern(value: Optional[str], max_length: int = 100) -> str:
    """Escape free text for use INSIDE a PostgREST like/ilike pattern value.

    Use for the `X` in `.or_(f"title.ilike.%{X}%")`. Removes the characters that
    are structural in the filter grammar (`,` `(` `)` `"` `\\`) and the pattern
    wildcards (`%` `*`), then collapses the resulting whitespace so a stripped
    value does not glue two words together.

    Note the empty string is a legitimate result (a caller whose input was
    entirely structural characters). `%%` matches everything, so a caller that
    treats an empty search as "no filter" must check for it BEFORE building the
    filter -- which is what the migrated callsites do.
    """
    if not value:
        return ''
    text = str(value).strip()[:max_length]
    text = _PGRST_STRUCTURAL.sub(' ', text)
    text = _PGRST_WILDCARDS.sub(' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def pgrst_uuid_list(values, field: str = 'id') -> str:
    """Validate a list of UUIDs and join them for a PostgREST `in.(...)` filter.

    Returns `"<uuid>,<uuid>,..."`. The commas are structural HERE -- they are the
    `in` list separator -- which is exactly why each element has to be proven a
    UUID first: one non-UUID element and the list stops being a list.
    """
    return ','.join(pgrst_uuid(v, field) for v in (values or []))
