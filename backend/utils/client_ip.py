"""The real client IP, proxy-spoofing aware.

Lived in `middleware/rate_limiter` until 2026-08-27, when a second caller
appeared in `utils` (refresh_families, fingerprinting the client behind a token
chain) and utils may not import middleware. The logic below carries a CVE fix,
so the answer was to move the one function down a layer rather than let anyone
write a second, subtly wrong copy of it.

`middleware.rate_limiter` re-exports this name; both import paths are the same
function.
"""
from flask import request

from app_config import Config

# NOTE: a TRUSTED_PROXIES set used to live beside this. It was never read by
# anything -- get_real_ip() counts hops from the RIGHT of X-Forwarded-For
# (ProxyFix semantics, see below) rather than matching peer addresses against an
# allowlist, and Render does not publish stable egress IPs to put in one.
# Removed 2026-08-15 so the module does not advertise a control it never
# applied. The hop count is the knob: Config.TRUSTED_PROXY_HOPS.


def get_real_ip() -> str:
    """
    Get the real client IP address, preventing spoofing attacks.

    CVE-OPTIO-2025-012 FIX: Securely extracts client IP from proxy headers.

    X-Forwarded-For is built left-to-right as "client, proxy1, proxy2, ..." where
    each proxy APPENDS the address that connected to it. The LEFTMOST entry is
    therefore attacker-controlled: a client can send its own
    `X-Forwarded-For: 1.2.3.4` and our infrastructure appends after it. Reading
    the leftmost value (the previous bug) let anyone rotate the header per request
    for a fresh rate-limit bucket, defeating every IP-keyed limit (login, OTP,
    password reset, etc.).

    The values our OWN trusted proxies append are on the RIGHT and cannot be
    spoofed by the client. We therefore read the client IP `TRUSTED_PROXY_HOPS`
    entries from the right (ProxyFix semantics). Default 1 = the rightmost entry.

    Returns:
        str: Client IP address
    """
    is_production = Config.FLASK_ENV == 'production'

    if is_production and 'X-Forwarded-For' in request.headers:
        forwarded_for = request.headers.get('X-Forwarded-For', '')
        ips = [ip.strip() for ip in forwarded_for.split(',') if ip.strip()]

        if ips:
            hops = max(1, min(Config.TRUSTED_PROXY_HOPS, len(ips)))
            # Count from the right: the address our own proxy appended.
            client_ip = ips[-hops]

            # Basic validation: ensure it looks like an IP
            if '.' in client_ip or ':' in client_ip:
                return client_ip

    # Fallback to remote_addr (direct connection or dev environment)
    return request.remote_addr or 'unknown'
