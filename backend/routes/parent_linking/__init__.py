"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- 30+ direct database calls for parent-student linking operations
- Complex JOIN queries with nested select (users table)
- Could create ParentLinkingRepository with methods:
  - get_linked_children(parent_id)
  - get_parent_links(student_id)
  - create_admin_link(parent_id, student_id, admin_id)
  - delete_link(link_id, admin_id)
  - submit_connection_requests(parent_id, children_data)
  - get_pending_requests(student_id)
  - approve_connection(link_id, student_id)
  - reject_connection(link_id, student_id)
- Note: Already uses ParentRepository (imported but unused), needs integration

Parent-Student Linking API routes.
Admin-only workflow for connecting parents to students.
Once linked, connections are permanent.

NOTE: Admin client usage justified throughout this file for parent-student linking operations.
Managing parent-student relationships requires cross-user operations and elevated privileges.
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from database import get_supabase_admin_client
from repositories import ParentRepository
from utils.auth.decorators import require_auth, require_admin
from middleware.error_handler import ValidationError, NotFoundError, AuthorizationError
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('parent_linking', __name__, url_prefix='/api/parents')



# Submodule imports trigger route registration on bp:
from . import dashboard  # noqa: F401,E402
from . import admin  # noqa: F401,E402
from . import requests  # noqa: F401,E402
