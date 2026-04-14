"""
Admin Quest Management Routes

Handles CRUD operations for quests including creation, editing, deletion,
and quest validation functionality.

REPOSITORY MIGRATION: PARTIALLY COMPLETE
- Uses QuestRepository for search and bulk operations
- Image management uses service layer (correct pattern)
- Complex CRUD operations remain in routes for readability
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from repositories import (
    UserRepository,
    QuestRepository,
    EvidenceRepository,
    ParentRepository,
    TutorRepository,
    AnalyticsRepository
)
from utils.auth.decorators import require_admin, require_advisor, get_advisor_assigned_students
from utils.pillar_utils import is_valid_pillar
from utils.pillar_utils import normalize_pillar_name
from utils.school_subjects import validate_school_subjects, normalize_subject_key
from services.image_service import search_quest_image
from services.api_usage_tracker import pexels_tracker
from datetime import datetime, timedelta
import json
import uuid

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_quest_management', __name__, url_prefix='/api/admin')



# Submodule imports trigger route registration on bp:
from . import crud  # noqa: F401,E402
from . import images  # noqa: F401,E402
from . import listing  # noqa: F401,E402
from . import tools  # noqa: F401,E402
