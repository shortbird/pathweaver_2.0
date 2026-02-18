"""
Link Preview - Fetches Open Graph metadata from URLs for rich link previews.
"""

from flask import Blueprint, request, jsonify
import re
import logging
import requests as http_requests
from urllib.parse import urlparse

from utils.auth.decorators import require_auth
from middleware.rate_limiter import rate_limit

logger = logging.getLogger(__name__)

bp = Blueprint('link_preview', __name__)

# In-memory cache: url -> {data, fetched_at}
_cache = {}
_CACHE_TTL = 60 * 60 * 24 * 7  # 7 days in seconds

# Allowed URL schemes
_ALLOWED_SCHEMES = {'http', 'https'}

# Block internal/private networks
_BLOCKED_HOSTS = {'localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', 'metadata.google.internal'}


def _is_safe_url(url):
    """Validate URL is safe to fetch (prevent SSRF)."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in _ALLOWED_SCHEMES:
            return False
        if not parsed.hostname:
            return False
        hostname = parsed.hostname.lower()
        if hostname in _BLOCKED_HOSTS:
            return False
        # Block private IP ranges
        if hostname.startswith('10.') or hostname.startswith('192.168.') or hostname.startswith('172.'):
            return False
        return True
    except Exception:
        return False


def _extract_og_metadata(html, url):
    """Extract Open Graph and fallback metadata from HTML."""
    result = {
        'title': None,
        'description': None,
        'image': None,
        'site_name': None
    }

    # Open Graph tags
    og_patterns = {
        'title': r'<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']*)["\']',
        'description': r'<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']*)["\']',
        'image': r'<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']*)["\']',
        'site_name': r'<meta[^>]*property=["\']og:site_name["\'][^>]*content=["\']([^"\']*)["\']',
    }

    # Also check reverse attribute order (content before property)
    og_patterns_rev = {
        'title': r'<meta[^>]*content=["\']([^"\']*)["\'][^>]*property=["\']og:title["\']',
        'description': r'<meta[^>]*content=["\']([^"\']*)["\'][^>]*property=["\']og:description["\']',
        'image': r'<meta[^>]*content=["\']([^"\']*)["\'][^>]*property=["\']og:image["\']',
        'site_name': r'<meta[^>]*content=["\']([^"\']*)["\'][^>]*property=["\']og:site_name["\']',
    }

    for key, pattern in og_patterns.items():
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            result[key] = match.group(1).strip()

    for key, pattern in og_patterns_rev.items():
        if not result[key]:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                result[key] = match.group(1).strip()

    # Twitter card fallbacks
    if not result['image']:
        match = re.search(r'<meta[^>]*(?:name|property)=["\']twitter:image["\'][^>]*content=["\']([^"\']*)["\']', html, re.IGNORECASE)
        if not match:
            match = re.search(r'<meta[^>]*content=["\']([^"\']*)["\'][^>]*(?:name|property)=["\']twitter:image["\']', html, re.IGNORECASE)
        if match:
            result['image'] = match.group(1).strip()

    # Fallback: <title> tag
    if not result['title']:
        match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
        if match:
            result['title'] = match.group(1).strip()

    # Fallback: meta description
    if not result['description']:
        match = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\']', html, re.IGNORECASE)
        if not match:
            match = re.search(r'<meta[^>]*content=["\']([^"\']*)["\'][^>]*name=["\']description["\']', html, re.IGNORECASE)
        if match:
            result['description'] = match.group(1).strip()

    # Fallback site_name from hostname
    if not result['site_name']:
        try:
            parsed = urlparse(url)
            result['site_name'] = parsed.hostname.replace('www.', '')
        except Exception:
            pass

    # Make relative image URLs absolute
    if result['image'] and not result['image'].startswith(('http://', 'https://')):
        try:
            parsed = urlparse(url)
            base = f"{parsed.scheme}://{parsed.netloc}"
            if result['image'].startswith('/'):
                result['image'] = base + result['image']
            else:
                result['image'] = base + '/' + result['image']
        except Exception:
            result['image'] = None

    return result


@bp.route('/api/utils/link-preview', methods=['GET'])
@require_auth
@rate_limit(calls=30, period=60)
def get_link_preview(user_id):
    """
    Fetch Open Graph metadata for a URL.

    Query params:
        url: The URL to fetch metadata for

    Returns:
        200: {title, description, image, site_name}
        400: Invalid URL
        422: Could not fetch metadata
    """
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL parameter required'}), 400

    if not _is_safe_url(url):
        return jsonify({'error': 'Invalid URL'}), 400

    # Check cache
    import time
    now = time.time()
    if url in _cache and (now - _cache[url]['fetched_at']) < _CACHE_TTL:
        return jsonify(_cache[url]['data']), 200

    try:
        resp = http_requests.get(
            url,
            timeout=5,
            headers={
                'User-Agent': 'Mozilla/5.0 (compatible; OptioBot/1.0; +https://optioeducation.com)',
                'Accept': 'text/html,application/xhtml+xml',
            },
            allow_redirects=True,
            stream=True
        )

        # Only read the first 100KB (we only need the <head>)
        content = resp.raw.read(100_000).decode('utf-8', errors='ignore')
        resp.close()

        if resp.status_code != 200:
            return jsonify({'error': 'Could not fetch URL', 'title': None, 'description': None, 'image': None, 'site_name': None}), 200

        data = _extract_og_metadata(content, url)

        # Cache the result
        _cache[url] = {'data': data, 'fetched_at': now}

        return jsonify(data), 200

    except http_requests.Timeout:
        logger.warning(f"Link preview timeout for URL: {url}")
        return jsonify({'error': 'Request timed out', 'title': None, 'description': None, 'image': None, 'site_name': None}), 200
    except Exception as e:
        logger.warning(f"Link preview error for URL {url}: {e}")
        return jsonify({'error': 'Could not fetch metadata', 'title': None, 'description': None, 'image': None, 'site_name': None}), 200
