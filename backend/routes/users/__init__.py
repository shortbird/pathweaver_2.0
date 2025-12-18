"""User routes module - organized into focused sub-modules"""

from flask import Blueprint
from .profile import profile_bp
from .dashboard import dashboard_bp
from .transcript import transcript_bp
from .completed_quests import completed_quests_bp

from utils.logger import get_logger

logger = get_logger(__name__)

# Create main users blueprint
bp = Blueprint('users', __name__)

# Register sub-blueprints
bp.register_bluelogger.info(profile_bp)
bp.register_bluelogger.info(dashboard_bp)
bp.register_bluelogger.info(transcript_bp)
bp.register_bluelogger.info(completed_quests_bp)