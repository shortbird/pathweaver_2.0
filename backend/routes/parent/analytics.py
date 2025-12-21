"""
Parent Dashboard - Analytics, Calendar & Insights.
Part of parent_dashboard.py refactoring (P2-ARCH-1).
"""
from flask import Blueprint, jsonify, request
from datetime import datetime, date, timedelta
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from middleware.error_handler import AuthorizationError
from utils.pillar_utils import get_pillar_name
from utils.logger import get_logger
from collections import defaultdict
from .dashboard import verify_parent_access

logger = get_logger(__name__)
bp = Blueprint("parent_analytics", __name__, url_prefix="/api/parent")

