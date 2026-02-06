"""
Observer Routes Module

Handles observer role functionality for extended family portfolio access.
Observers can:
- View student portfolios (read-only)
- Leave encouraging comments on completed work
- Receive notifications of student progress

Students control observer access through invitations.

This module has been decomposed from a single 2500+ line file into:
- student_invitations.py: Student invitation management
- acceptance.py: Observer accepting invitations
- portfolio.py: Portfolio access
- comments.py: Observer comments
- activity.py: Activity feed
- parent_management.py: Parent-initiated observer management
- feed.py: Observer feed
- social.py: Likes and completion comments
- family.py: Family observer management
- pending.py: Pending invitations
"""

from flask import Blueprint

# Create the blueprint
bp = Blueprint('observer', __name__)

# Import and register routes from submodules
from . import student_invitations
from . import acceptance
from . import portfolio
from . import comments
from . import activity
from . import parent_management
from . import feed
from . import social
from . import family
from . import pending

# Register all routes
student_invitations.register_routes(bp)
acceptance.register_routes(bp)
portfolio.register_routes(bp)
comments.register_routes(bp)
activity.register_routes(bp)
parent_management.register_routes(bp)
feed.register_routes(bp)
social.register_routes(bp)
family.register_routes(bp)
pending.register_routes(bp)
