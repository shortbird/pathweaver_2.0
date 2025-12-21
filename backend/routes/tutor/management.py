"""
AI Tutor - Management & Parent Monitoring.
Part of tutor.py refactoring (P2-ARCH-1).
"""
from flask import Blueprint, request, jsonify
from datetime import datetime, date
from typing import Dict, Optional
import uuid

from utils.logger import get_logger
from database import get_supabase_admin_client
from backend.repositories import ParentRepository
from utils.auth.decorators import require_auth
from services.ai_tutor_service import ConversationMode
from middleware.error_handler import ValidationError, AuthorizationError
from utils.validation.validators import validate_required_fields, validate_string_length
from utils.api_response import success_response, error_response

logger = get_logger(__name__)
bp = Blueprint("tutor_management", __name__, url_prefix="/api/tutor")

