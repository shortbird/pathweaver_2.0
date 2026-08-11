"""Shared SSRF protection for server-side fetches of user-supplied URLs.

Several features fetch a URL that ultimately comes from a user: evidence "link"
blocks (utils/url_metadata.py), the link-preview endpoint (routes/link_preview.py),
and PDF logo/asset embedding (services/*_pdf*.py). Each of these previously either
did no validation at all or used a string-prefix blocklist that a determined
caller could bypass with a redirect, a DNS name resolving to an internal IP, an
IPv6 literal, or a decimal/octal-encoded IPv4 address.

This module centralizes the defense:

  - `is_safe_public_url(url)` — scheme allow-list, then resolve the hostname and
    reject if ANY resolved address is private / loopback / link-local (incl. the
    cloud metadata range 169.254.0.0/16) / reserved / multicast / unspecified.
    Resolution defeats the DNS-name and IP-encoding bypasses; checking every
    resolved address defeats round-robin DNS-rebinding tricks.

  - `safe_get(url, ...)` — a `requests.get` wrapper that validates the initial URL
    and then follows redirects MANUALLY, re-validating each hop's Location. This
    is the critical part: `requests`' own `allow_redirects=True` would happily
    follow a 302 from an attacker-controlled public host to `http://169.254.169.254/`.
"""

import ipaddress
import socket
from urllib.parse import urlparse

import requests

from utils.logger import get_logger

logger = get_logger(__name__)

_ALLOWED_SCHEMES = {'http', 'https'}
_DEFAULT_MAX_REDIRECTS = 3


class SSRFError(Exception):
    """Raised when a URL fails SSRF validation (unsafe host/scheme)."""


def _ip_is_blocked(ip: ipaddress._BaseAddress) -> bool:
    """A resolved address we must never fetch from."""
    return (
        ip.is_private          # 10/8, 172.16/12, 192.168/16, fc00::/7, etc.
        or ip.is_loopback      # 127/8, ::1
        or ip.is_link_local    # 169.254/16 (incl. cloud metadata), fe80::/10
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified   # 0.0.0.0, ::
    )


def is_safe_public_url(url: str) -> tuple[bool, str]:
    """Return (ok, reason). ok=True only for an http(s) URL whose hostname
    resolves exclusively to public addresses."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False, 'unparseable URL'

    if parsed.scheme not in _ALLOWED_SCHEMES:
        return False, f'scheme not allowed: {parsed.scheme!r}'

    hostname = parsed.hostname
    if not hostname:
        return False, 'missing hostname'

    # Resolve to every A/AAAA address and reject if any is non-public. A bare IP
    # literal (including decimal/octal/hex-encoded IPv4 and IPv6) round-trips
    # through getaddrinfo and is checked the same way.
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False, 'DNS resolution failed'

    if not infos:
        return False, 'no addresses resolved'

    for info in infos:
        sockaddr = info[4]
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return False, f'unparseable resolved address: {ip_str!r}'
        if _ip_is_blocked(ip):
            return False, f'resolves to non-public address {ip_str}'

    return True, 'ok'


def safe_get(url: str, *, timeout, headers=None, max_redirects=_DEFAULT_MAX_REDIRECTS,
             stream=False, **kwargs) -> requests.Response:
    """`requests.get` with SSRF protection and per-hop redirect re-validation.

    Validates the initial URL and every redirect target against
    is_safe_public_url before the request is made. Raises SSRFError if any URL
    in the chain is unsafe. All other kwargs pass through to requests.get.
    """
    current = url
    for _ in range(max_redirects + 1):
        ok, reason = is_safe_public_url(current)
        if not ok:
            logger.warning(f"SSRF blocked: {reason} | url={current!r}")
            raise SSRFError(f'URL not allowed: {reason}')

        resp = requests.get(
            current,
            timeout=timeout,
            headers=headers,
            allow_redirects=False,
            stream=stream,
            **kwargs,
        )

        if resp.is_redirect or resp.is_permanent_redirect:
            location = resp.headers.get('Location')
            if not location:
                return resp
            # Resolve relative redirects against the current URL.
            current = requests.compat.urljoin(current, location)
            resp.close()
            continue

        return resp

    raise SSRFError('too many redirects')
