"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- 20+ direct database calls for COPPA compliance workflow
- Token generation, validation, and email verification logic
- Could create ParentalConsentRepository with methods:
  - send_consent_request(user_id, parent_email, child_email)
  - verify_consent_token(token)
  - check_consent_status(user_id)
  - resend_consent_request(user_id)
  - log_consent_attempt(user_id, parent_email, ip, user_agent)
- Complex consent workflow suitable for repository abstraction

Parental Consent API routes.
Handles COPPA compliance for users under 13.

ADMIN CLIENT USAGE: Every endpoint in this file uses get_supabase_admin_client()
because the consent flow operates on data the child user (under 13) cannot
authenticate to themselves: the workflow runs with either no session (parent
clicking an emailed link) or a child's session writing parent-owned consent
records. Each call site is annotated `# admin client justified` to satisfy the
H1 audit; access control comes from (a) one-time hashed consent tokens,
(b) email verification of the parent address, and (c) explicit user_id matching
on every update. Parental consent and child user records cannot be exposed to
arbitrary callers from these endpoints.
"""
from flask import Blueprint, request, jsonify
from app_config import Config
from database import get_supabase_admin_client
from repositories import (
    UserRepository,
    QuestRepository,
    EvidenceRepository,
    ParentRepository,
    TutorRepository,
    AnalyticsRepository
)
from middleware.error_handler import ValidationError, NotFoundError
from middleware.rate_limiter import rate_limit
from utils.auth.decorators import require_auth, require_role
from utils.roles import get_effective_role  # A2: org_managed users have actual role in org_role
from services.email_service import email_service
from werkzeug.utils import secure_filename
import secrets
import hashlib
from datetime import datetime, timedelta
import logging
import mimetypes

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)

bp = Blueprint('parental_consent', __name__)



def generate_consent_token():
    """Generate a secure random token for parental consent verification"""
    return secrets.token_urlsafe(32)

def hash_token(token):
    """Hash the token for secure storage"""
    return hashlib.sha256(token.encode()).hexdigest()

# Using repository pattern for database access


# Submodule imports trigger route registration on bp:
from . import requests  # noqa: F401,E402
from . import documents  # noqa: F401,E402
from . import admin_review  # noqa: F401,E402
from . import visibility  # noqa: F401,E402
