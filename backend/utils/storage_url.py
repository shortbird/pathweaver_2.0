"""
Supabase Storage URL helper.

The supabase-py SDK's get_public_url() can return URLs with /rest/v1/object/public/
instead of the correct /storage/v1/object/public/ path. This helper normalizes those URLs.
"""


def fix_storage_url(url: str) -> str:
    """Fix Supabase storage URLs that use /rest/v1/ instead of /storage/v1/."""
    if url and '/rest/v1/object/public/' in url:
        return url.replace('/rest/v1/object/public/', '/storage/v1/object/public/')
    return url
