"""
Login Routes Module

Authentication endpoints for login, logout, session management, and diagnostics.

This module has been decomposed from a single 1415 line file into:
- security.py: Account lockout, timing protection, user initialization
- core.py: Login, logout, session validation endpoints
- tokens.py: Token refresh and health checking
- diagnostics.py: Cookie debugging and Safari/iOS compatibility
- settings.py: User AI preference settings
"""

from flask import Blueprint

# Create the blueprint
bp = Blueprint('auth_login', __name__)

# Import and register routes from submodules
from . import core
from . import tokens
from . import diagnostics
from . import settings

# Register all routes
core.register_routes(bp)
tokens.register_routes(bp)
diagnostics.register_routes(bp)
settings.register_routes(bp)
