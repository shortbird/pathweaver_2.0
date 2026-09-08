"""
Slug generation utilities
Shared slug generation functions used across courses and public routes
"""
import re


def generate_slug(title: str) -> str:
    """Generate a URL-friendly slug from a title."""
    if not title:
        return None
    # Convert to lowercase
    slug = title.lower()
    # Replace spaces and special characters with hyphens
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    # Remove leading/trailing hyphens
    slug = slug.strip('-')
    # Collapse multiple hyphens
    slug = re.sub(r'-+', '-', slug)
    return slug


def ensure_unique_slug(client, base_slug: str, course_id: str = None) -> str:
    """Ensure a slug is unique, appending a number if needed."""
    slug = base_slug
    counter = 1

    while True:
        # Check if slug exists
        query = client.table('courses').select('id').eq('slug', slug)
        if course_id:
            query = query.neq('id', course_id)  # Exclude current course when updating

        result = query.execute()

        if not result.data:
            return slug

        # Slug exists, try with counter
        counter += 1
        slug = f"{base_slug}-{counter}"
