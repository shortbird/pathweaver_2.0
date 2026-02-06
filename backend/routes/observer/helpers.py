"""
Observer Module Helpers

Shared utilities for observer routes.
"""

from flask import request


def get_frontend_url():
    """
    Determine the correct frontend URL based on the request host.
    - localhost/127.0.0.1 -> http://localhost:3000
    - optio-dev-backend -> https://optio-dev-frontend.onrender.com
    - production -> https://www.optioeducation.com
    """
    host = request.host.lower() if request.host else ''

    if 'localhost' in host or '127.0.0.1' in host:
        return 'http://localhost:3000'
    elif 'optio-dev' in host:
        return 'https://optio-dev-frontend.onrender.com'
    else:
        return 'https://www.optioeducation.com'
