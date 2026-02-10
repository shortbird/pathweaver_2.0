"""
Organization Classes Routes

Provides API endpoints for organization class management including:
- Class CRUD operations
- Advisor assignment
- Student enrollment
- Quest management
- Progress tracking

Authorization:
- superadmin: Full access to all classes everywhere
- org_admin: Full access to all classes in their organization
- advisor: Full access to classes they're assigned to
"""

from flask import Blueprint

bp = Blueprint('classes', __name__, url_prefix='/api')

# Import all route modules to register endpoints
from . import crud
from . import advisors
from . import students
from . import quests
