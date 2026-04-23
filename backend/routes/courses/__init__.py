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
from utils.roles import get_effective_role

# Create the blueprint
bp = Blueprint('courses', __name__, url_prefix='/api/courses')

# Users granted course creation/management privileges (in addition to superadmin)
COURSE_CREATOR_USER_IDS = {
    '1e50bf47-4146-48e3-b520-1cae530b37f3',  # Lisa Mauer (lmauer@jspeducate.com)
}


def can_create_course(user_data):
    """
    Check if a user can create admin-authored courses (surfaces the Course Builder
    "Create course" UI in catalog pages, etc.). This is kept strict.

    Allows:
    - superadmin
    - explicitly granted users (COURSE_CREATOR_USER_IDS)

    Any authenticated user can create a *student-curated class* via the student
    class form — that path posts to the same endpoint but the endpoint branches
    on role (see create_course in crud.py).
    """
    effective_role = get_effective_role(user_data)
    if effective_role == 'superadmin':
        return True
    if user_data.get('id') in COURSE_CREATOR_USER_IDS:
        return True
    return False


# `is_admin_course_creator` is a semantic alias for the strict check above, used
# inside create_course to decide whether to branch into the student-curated path.
is_admin_course_creator = can_create_course


def can_manage_course(user_data, course=None):
    """
    Check if a user can manage (edit/delete) a course.

    Allows:
    - superadmin: full access to all courses
    - course creator: can edit only courses they created
    - explicitly granted users: can manage courses they created

    Args:
        user_data: dict with role, org_role fields
        course: dict with created_by field (None for create-new checks)
    Returns:
        bool
    """
    effective_role = get_effective_role(user_data)
    if effective_role == 'superadmin':
        return True
    if course and course.get('created_by') == user_data.get('id'):
        return True
    return False


# Import and register routes from submodules
from . import crud
from . import publishing
from . import quests
from . import enrollment
from . import homepage
from . import invites
from . import kickoff


# Register all routes
crud.register_routes(bp)
publishing.register_routes(bp)
quests.register_routes(bp)
enrollment.register_routes(bp)
homepage.register_routes(bp)
invites.register_routes(bp)
kickoff.register_routes(bp)

