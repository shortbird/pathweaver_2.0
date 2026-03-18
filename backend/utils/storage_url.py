"""
Supabase Storage URL helper.

Normalizes storage URLs to use the custom domain (auth.optioeducation.com)
and fixes the SDK's /rest/v1/ path issue.
"""

from app_config import Config

# The raw Supabase URL from config (e.g., https://vvfgxcykxjybtvpfzwyx.supabase.co)
_SUPABASE_URL = None
_CUSTOM_DOMAIN = 'https://auth.optioeducation.com'


def _get_supabase_url():
    global _SUPABASE_URL
    if _SUPABASE_URL is None:
        _SUPABASE_URL = Config.SUPABASE_URL.rstrip('/')
    return _SUPABASE_URL


def fix_storage_url(url: str) -> str:
    """
    Normalize Supabase storage URLs:
    1. Fix /rest/v1/ -> /storage/v1/ path issue from SDK
    2. Replace raw Supabase domain with custom domain (auth.optioeducation.com)
    """
    if not url:
        return url

    # Fix path issue from SDK
    if '/rest/v1/object/public/' in url:
        url = url.replace('/rest/v1/object/public/', '/storage/v1/object/public/')

    # Normalize domain to custom domain
    supabase_url = _get_supabase_url()
    if supabase_url and supabase_url in url:
        url = url.replace(supabase_url, _CUSTOM_DOMAIN)

    # Strip trailing ? (Supabase SDK sometimes appends empty query string)
    if url.endswith('?'):
        url = url[:-1]

    return url
