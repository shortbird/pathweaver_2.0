"""
Datetime Helper Utilities

Centralized datetime operations to reduce code duplication and ensure consistency.
Replaces 267+ occurrences of datetime.utcnow().isoformat() and related patterns.

All functions return UTC timestamps in ISO 8601 format unless otherwise specified.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional


def utc_now() -> datetime:
    """
    Get current UTC datetime (timezone-aware).

    Returns:
        datetime: Current UTC datetime with timezone info

    Example:
        >>> now = utc_now()
        >>> now.tzinfo  # timezone.utc
    """
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    """
    Get current UTC timestamp in ISO 8601 format.

    Replaces: datetime.utcnow().isoformat()

    Returns:
        str: ISO 8601 formatted timestamp (e.g., "2025-01-15T14:30:00.123456")

    Example:
        >>> timestamp = utc_now_iso()
        >>> "2025-01-15T14:30:00" in timestamp  # True
    """
    return datetime.utcnow().isoformat()


def utc_timestamp(dt: Optional[datetime] = None) -> str:
    """
    Convert datetime to ISO 8601 string, or get current timestamp if None.

    Args:
        dt: Datetime to convert (defaults to now)

    Returns:
        str: ISO 8601 formatted timestamp

    Example:
        >>> utc_timestamp()  # Current time
        >>> utc_timestamp(some_datetime)  # Convert specific datetime
    """
    if dt is None:
        return utc_now_iso()
    return dt.isoformat()


def days_ago_iso(days: int) -> str:
    """
    Get UTC timestamp for N days ago.

    Replaces: (datetime.utcnow() - timedelta(days=N)).isoformat()

    Args:
        days: Number of days to subtract

    Returns:
        str: ISO 8601 formatted timestamp

    Example:
        >>> days_ago_iso(7)  # 7 days ago
        >>> days_ago_iso(30)  # 30 days ago
    """
    return (datetime.utcnow() - timedelta(days=days)).isoformat()


def hours_ago_iso(hours: int) -> str:
    """
    Get UTC timestamp for N hours ago.

    Args:
        hours: Number of hours to subtract

    Returns:
        str: ISO 8601 formatted timestamp

    Example:
        >>> hours_ago_iso(24)  # 24 hours ago
        >>> hours_ago_iso(1)  # 1 hour ago
    """
    return (datetime.utcnow() - timedelta(hours=hours)).isoformat()


def minutes_ago_iso(minutes: int) -> str:
    """
    Get UTC timestamp for N minutes ago.

    Args:
        minutes: Number of minutes to subtract

    Returns:
        str: ISO 8601 formatted timestamp

    Example:
        >>> minutes_ago_iso(30)  # 30 minutes ago
    """
    return (datetime.utcnow() - timedelta(minutes=minutes)).isoformat()


def days_from_now_iso(days: int) -> str:
    """
    Get UTC timestamp for N days in the future.

    Args:
        days: Number of days to add

    Returns:
        str: ISO 8601 formatted timestamp

    Example:
        >>> days_from_now_iso(7)  # 7 days from now
        >>> days_from_now_iso(30)  # 30 days from now
    """
    return (datetime.utcnow() + timedelta(days=days)).isoformat()


def hours_from_now_iso(hours: int) -> str:
    """
    Get UTC timestamp for N hours in the future.

    Args:
        hours: Number of hours to add

    Returns:
        str: ISO 8601 formatted timestamp

    Example:
        >>> hours_from_now_iso(1)  # 1 hour from now (token expiry)
        >>> hours_from_now_iso(24)  # 24 hours from now
    """
    return (datetime.utcnow() + timedelta(hours=hours)).isoformat()


def format_date(dt: datetime, format_string: str = "%Y-%m-%d") -> str:
    """
    Format datetime using strftime pattern.

    Args:
        dt: Datetime to format
        format_string: strftime format pattern (default: YYYY-MM-DD)

    Returns:
        str: Formatted date string

    Example:
        >>> format_date(datetime.now(), "%Y-%m-%d")  # "2025-01-15"
        >>> format_date(datetime.now(), "%B %d, %Y")  # "January 15, 2025"
    """
    return dt.strftime(format_string)


def format_date_iso(dt: datetime, format_string: str = "%Y-%m-%d") -> str:
    """
    Format ISO string datetime using strftime pattern.

    Args:
        dt: Datetime to format
        format_string: strftime format pattern (default: YYYY-MM-DD)

    Returns:
        str: Formatted date string

    Example:
        >>> now = datetime.utcnow()
        >>> format_date_iso(now, "%Y-%m-%d")  # "2025-01-15"
    """
    return dt.strftime(format_string)


def parse_iso_timestamp(iso_string: str) -> datetime:
    """
    Parse ISO 8601 timestamp string to datetime object.

    Args:
        iso_string: ISO 8601 formatted timestamp

    Returns:
        datetime: Parsed datetime object

    Example:
        >>> dt = parse_iso_timestamp("2025-01-15T14:30:00")
        >>> dt.year  # 2025
    """
    return datetime.fromisoformat(iso_string)


def is_expired(timestamp_iso: str) -> bool:
    """
    Check if an ISO timestamp is in the past.

    Args:
        timestamp_iso: ISO 8601 formatted timestamp

    Returns:
        bool: True if timestamp is in the past

    Example:
        >>> is_expired(days_ago_iso(1))  # True
        >>> is_expired(days_from_now_iso(1))  # False
    """
    try:
        timestamp_dt = parse_iso_timestamp(timestamp_iso)
        return timestamp_dt < datetime.utcnow()
    except (ValueError, TypeError):
        return True  # Treat invalid timestamps as expired


def time_until(timestamp_iso: str) -> timedelta:
    """
    Calculate time remaining until a timestamp.

    Args:
        timestamp_iso: ISO 8601 formatted timestamp

    Returns:
        timedelta: Time remaining (negative if in the past)

    Example:
        >>> delta = time_until(hours_from_now_iso(2))
        >>> delta.total_seconds() / 3600  # ~2.0 hours
    """
    timestamp_dt = parse_iso_timestamp(timestamp_iso)
    return timestamp_dt - datetime.utcnow()


def time_since(timestamp_iso: str) -> timedelta:
    """
    Calculate time elapsed since a timestamp.

    Args:
        timestamp_iso: ISO 8601 formatted timestamp

    Returns:
        timedelta: Time elapsed (negative if in the future)

    Example:
        >>> delta = time_since(days_ago_iso(7))
        >>> delta.days  # 7
    """
    timestamp_dt = parse_iso_timestamp(timestamp_iso)
    return datetime.utcnow() - timestamp_dt


# Common timedelta constants for reuse
MINUTE = timedelta(minutes=1)
HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
WEEK = timedelta(weeks=1)
MONTH = timedelta(days=30)  # Approximate
YEAR = timedelta(days=365)  # Approximate
