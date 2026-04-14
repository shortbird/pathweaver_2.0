"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses LearningEventsService exclusively (service layer pattern)
- Only 1 direct database call for file upload verification (line 293-304, acceptable)
- Service layer properly encapsulates all CRUD operations
- File upload endpoint uses get_user_client for RLS enforcement (correct pattern)

Learning Events Routes
API endpoints for spontaneous learning moment capture
"""
from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from services.learning_events_service import LearningEventsService
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)

learning_events_bp = Blueprint('learning_events', __name__)



# Submodule imports trigger route registration on bp:
from . import crud  # noqa: F401,E402
from . import evidence  # noqa: F401,E402
from . import threads  # noqa: F401,E402
from . import ai  # noqa: F401,E402
