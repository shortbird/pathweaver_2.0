"""
Courses Routes Module

API endpoints for course management, quest sequencing, and student enrollments.

This module has been decomposed from a single 1874 line file into:
- crud.py: Course CRUD operations and image uploads
- publishing.py: Course publishing workflow
- quests.py: Quest/project management within courses
- enrollment.py: Student enrollment and progress
- homepage.py: Course homepage data
"""

from flask import Blueprint

# Create the blueprint
bp = Blueprint('courses', __name__, url_prefix='/api/courses')

# Import and register routes from submodules
from . import crud
from . import publishing
from . import quests
from . import enrollment
from . import homepage

# Register all routes
crud.register_routes(bp)
publishing.register_routes(bp)
quests.register_routes(bp)
enrollment.register_routes(bp)
homepage.register_routes(bp)
