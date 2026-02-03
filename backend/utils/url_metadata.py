"""
URL Metadata Fetcher

Fetches metadata (title, description, image) from URLs.
Used to display friendly link titles instead of raw URLs.
"""

import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse
import re
from utils.logger import get_logger

logger = get_logger(__name__)

# Timeout for URL fetching (seconds)
FETCH_TIMEOUT = 5

# User agent to avoid being blocked
USER_AGENT = 'Mozilla/5.0 (compatible; OptioBot/1.0; +https://optioeducation.com)'


def clean_title(title: str) -> str:
    """
    Remove common suffixes from page titles.
    """
    # Common suffixes to remove
    suffixes_to_remove = [
        ' - Google Docs',
        ' - Google Sheets',
        ' - Google Slides',
        ' - Google Forms',
        ' - Google Drive',
        ' | Google Docs',
        ' | Google Drive',
        ' - YouTube',
        ' | YouTube',
        ' - Canva',
        ' | Canva',
        ' - Notion',
        ' | Notion',
        ' - Figma',
        ' | Figma',
    ]

    for suffix in suffixes_to_remove:
        if title.endswith(suffix):
            title = title[:-len(suffix)]
            break

    return title.strip()


def fetch_url_metadata(url: str) -> dict:
    """
    Fetch metadata from a URL.

    Returns:
        dict with keys:
            - title: Page title (from og:title or <title> tag)
            - description: Page description (from og:description or meta description)
            - image: Preview image URL (from og:image)
            - domain: Domain name of the URL
            - success: Boolean indicating if fetch was successful
    """
    result = {
        'title': None,
        'description': None,
        'image': None,
        'domain': None,
        'success': False
    }

    try:
        # Parse domain
        parsed = urlparse(url)
        result['domain'] = parsed.netloc.replace('www.', '')

        # Special handling for known services
        special_title = get_special_service_title(url, parsed)
        if special_title:
            result['title'] = special_title
            result['success'] = True
            return result

        # Fetch the page
        headers = {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
        }

        response = requests.get(
            url,
            headers=headers,
            timeout=FETCH_TIMEOUT,
            allow_redirects=True
        )
        response.raise_for_status()

        # Parse HTML
        soup = BeautifulSoup(response.text, 'html.parser')

        # Try to get title from Open Graph first
        og_title = soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            result['title'] = og_title['content'].strip()
        else:
            # Fall back to <title> tag
            title_tag = soup.find('title')
            if title_tag and title_tag.string:
                result['title'] = title_tag.string.strip()

        # Clean up common suffixes from titles
        if result['title']:
            result['title'] = clean_title(result['title'])

        # Get description
        og_desc = soup.find('meta', property='og:description')
        if og_desc and og_desc.get('content'):
            result['description'] = og_desc['content'].strip()
        else:
            meta_desc = soup.find('meta', attrs={'name': 'description'})
            if meta_desc and meta_desc.get('content'):
                result['description'] = meta_desc['content'].strip()

        # Get image
        og_image = soup.find('meta', property='og:image')
        if og_image and og_image.get('content'):
            result['image'] = og_image['content']

        result['success'] = True

    except requests.Timeout:
        logger.warning(f"Timeout fetching metadata for URL: {url}")
    except requests.RequestException as e:
        logger.warning(f"Failed to fetch URL metadata for {url}: {str(e)}")
    except Exception as e:
        logger.error(f"Error parsing URL metadata for {url}: {str(e)}")

    return result


def get_special_service_title(url: str, parsed) -> str:
    """
    Generate friendly titles for known services without fetching.
    """
    domain = parsed.netloc.lower()
    path = parsed.path.lower()

    # Google services - fetch to get actual document title
    if 'docs.google.com' in domain:
        return None  # Fetch to get actual document title

    if 'drive.google.com' in domain:
        return None  # Fetch to get actual file title

    # Video services (will fetch for actual title but provide fallback)
    if 'youtube.com' in domain or 'youtu.be' in domain:
        return None  # Let it fetch to get video title

    if 'vimeo.com' in domain:
        return None  # Let it fetch to get video title

    # Other common services
    if 'canva.com' in domain:
        return 'Canva Design'

    if 'figma.com' in domain:
        return 'Figma Design'

    if 'notion.so' in domain or 'notion.site' in domain:
        return 'Notion Page'

    if 'github.com' in domain:
        return None  # Fetch to get repo/page title

    if 'scratch.mit.edu' in domain:
        return 'Scratch Project'

    if 'khan' in domain and 'academy' in domain:
        return None  # Fetch to get specific content title

    return None


def get_domain_from_url(url: str) -> str:
    """
    Extract clean domain name from URL.
    """
    try:
        parsed = urlparse(url)
        return parsed.netloc.replace('www.', '')
    except:
        return 'Link'
