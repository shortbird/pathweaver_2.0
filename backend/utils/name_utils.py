"""
Name Utilities

Platform-wide standard for displaying user names.
Always uses first_name + last_name. Falls back to display_name or email.
"""


def get_user_display_name(user_data, fallback='Unknown'):
    """
    Get the full display name for a user.
    Priority: first_name + last_name > first_name > display_name > email > fallback

    Args:
        user_data: Dict with user fields (first_name, last_name, display_name, email)
        fallback: Default value if no name available

    Returns:
        str: The user's display name
    """
    if not user_data:
        return fallback

    first = (user_data.get('first_name') or '').strip()
    last = (user_data.get('last_name') or '').strip()

    if first and last:
        return f"{first} {last}"
    if first:
        return first
    if last:
        return last
    if user_data.get('display_name'):
        return user_data['display_name']
    if user_data.get('email'):
        return user_data['email']
    return fallback


def get_first_name(user_data, fallback=''):
    """
    Get just the first name for a user.

    Args:
        user_data: Dict with user fields
        fallback: Default value if no name available

    Returns:
        str: The user's first name
    """
    if not user_data:
        return fallback
    return (user_data.get('first_name') or '').strip() or user_data.get('display_name') or fallback
