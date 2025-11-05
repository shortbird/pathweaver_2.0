"""
Spark LMS Integration Routes

Handles SSO authentication and evidence webhooks from Spark LMS.
Implements simple JWT-based SSO (not LTI 1.3) and HMAC-signed webhooks.

Security features:
- JWT signature validation
- HMAC webhook signature validation
- Rate limiting
- Replay attack protection
- SSRF protection for file downloads
"""

from flask import Blueprint, request, redirect, jsonify
import jwt
import os
import hmac
import hashlib
import requests
from datetime import datetime, timedelta
from urllib.parse import urlparse
import uuid

from database import get_supabase_admin_client
from utils.session_manager import session_manager
from services.xp_service import XPService
from middleware.rate_limiter import rate_limit
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('spark', __name__)

# ============================================
# SSO ENDPOINT
# ============================================

@bp.route('/spark/sso', methods=['GET'])
@rate_limit(limit=10, per=60)  # 10 SSO attempts per minute per IP
def spark_sso():
    """
    SSO login from Spark LMS

    Query params:
        token: JWT signed by Spark with shared secret

    JWT Claims Expected:
        sub: Spark user ID
        email: Student email
        given_name: First name
        family_name: Last name
        role: 'student' (always)
        iat: Issued at timestamp
        exp: Expiration timestamp (10 minutes)

    Returns:
        Redirect to dashboard with session cookies set
    """
    token = request.args.get('token')
    if not token:
        logger.warning("Spark SSO attempt without token")
        return jsonify({'error': 'Missing token parameter'}), 400

    # Validate JWT signature and claims
    try:
        secret = os.getenv('SPARK_SSO_SECRET')
        if not secret:
            logger.error("SPARK_SSO_SECRET not configured")
            return jsonify({'error': 'SSO not configured'}), 503

        claims = jwt.decode(
            token,
            secret,
            algorithms=['HS256'],
            options={'require': ['sub', 'email', 'exp', 'iat']}
        )

        logger.info(f"Spark SSO login attempt: user_id={claims['sub']}, email={claims['email']}")

    except jwt.ExpiredSignatureError:
        logger.warning("Spark SSO token expired")
        return jsonify({'error': 'Token expired. Please try again.'}), 401
    except jwt.InvalidTokenError as e:
        logger.warning(f"Spark SSO invalid token: {str(e)}")
        return jsonify({'error': 'Invalid token'}), 401
    except Exception as e:
        logger.error(f"Spark SSO validation error: {str(e)}", exc_info=True)
        return jsonify({'error': 'Token validation failed'}), 401

    # Create or update user
    try:
        user = create_or_update_spark_user(claims)

        # Generate tokens for Authorization header (incognito mode compatibility)
        access_token = session_manager.generate_access_token(user['id'])
        refresh_token = session_manager.generate_refresh_token(user['id'])

        # Redirect to frontend with tokens in URL (will be extracted and stored by frontend)
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
        redirect_url = f"{frontend_url}/dashboard?lti=true&access_token={access_token}&refresh_token={refresh_token}"

        response = redirect(redirect_url)

        # Also set cookies as fallback (will be skipped in cross-origin mode)
        session_manager.set_auth_cookies(response, user['id'])

        logger.info(f"Spark SSO successful: user_id={user['id']}")
        return response

    except Exception as e:
        logger.error(f"Failed to create Spark user: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to create user account'}), 500


# ============================================
# WEBHOOK ENDPOINT
# ============================================

@bp.route('/spark/webhook/submission', methods=['POST'])
@rate_limit(limit=100, per=60)  # 100 webhooks per minute (batch submissions)
def submission_webhook():
    """
    Receive assignment submissions from Spark

    Headers:
        X-Spark-Signature: HMAC-SHA256 signature of request body

    Body:
        spark_user_id: Spark's user ID
        spark_assignment_id: Spark's assignment ID
        spark_course_id: Spark's course ID
        submission_text: Student's text submission
        submission_files: Array of file objects with url, type, filename
        submitted_at: ISO timestamp
        grade: Numeric grade (optional)

    Returns:
        200: Success
        400: Invalid payload
        401: Invalid signature
        404: User or task not found
        500: Server error
    """
    # Validate signature
    signature = request.headers.get('X-Spark-Signature')
    if not signature:
        logger.warning("Spark webhook missing signature")
        return jsonify({'error': 'Missing signature'}), 401

    if not validate_spark_signature(request.data, signature):
        logger.warning("Spark webhook invalid signature")
        return jsonify({'error': 'Invalid signature'}), 401

    try:
        data = request.json

        # Check for replay attacks (timestamp freshness)
        submitted_at = datetime.fromisoformat(data['submitted_at'].replace('Z', '+00:00'))
        if datetime.utcnow() - submitted_at.replace(tzinfo=None) > timedelta(minutes=5):
            logger.warning(f"Rejected old Spark webhook: {submitted_at}")
            return jsonify({'error': 'Submission timestamp too old'}), 400

        # Process submission
        result = process_spark_submission(data)

        logger.info(f"Spark submission processed: assignment_id={data['spark_assignment_id']}, user_id={result['user_id']}")
        return jsonify({'status': 'success', 'completion_id': result['completion_id']}), 200

    except KeyError as e:
        logger.warning(f"Spark webhook missing field: {str(e)}")
        return jsonify({'error': f'Missing required field: {str(e)}'}), 400
    except ValueError as e:
        logger.warning(f"Spark webhook invalid data: {str(e)}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Failed to process Spark webhook: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to process submission'}), 500


# ============================================
# HELPER FUNCTIONS
# ============================================

def validate_spark_signature(payload: bytes, signature: str) -> bool:
    """
    Validate webhook HMAC signature

    Args:
        payload: Raw request body bytes
        signature: Signature from X-Spark-Signature header

    Returns:
        True if signature is valid, False otherwise
    """
    secret = os.getenv('SPARK_WEBHOOK_SECRET')
    if not secret:
        logger.error("SPARK_WEBHOOK_SECRET not configured")
        return False

    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()

    # Use constant-time comparison to prevent timing attacks
    return hmac.compare_digest(signature, expected)


def create_or_update_spark_user(claims: dict) -> dict:
    """
    Create or update user from Spark SSO claims

    Args:
        claims: JWT claims from Spark SSO token

    Returns:
        User dict with 'id' field
    """
    supabase = get_supabase_admin_client()
    spark_user_id = claims['sub']

    # Check if LMS integration exists for this Spark user
    integration = supabase.table('lms_integrations') \
        .select('user_id') \
        .eq('lms_platform', 'spark') \
        .eq('lms_user_id', spark_user_id) \
        .execute()

    if integration.data:
        # User already linked to Spark
        user_id = integration.data[0]['user_id']
        logger.info(f"Existing Spark user found: {user_id}")
        return {'id': user_id}

    # Check if user exists by email (account merging)
    email = claims['email']
    user = supabase.table('users') \
        .select('id') \
        .eq('email', email) \
        .execute()

    if user.data:
        # Link existing Optio account to Spark
        user_id = user.data[0]['id']
        logger.info(f"Linking existing user {user_id} to Spark")
    else:
        # Create new user in Supabase Auth first
        import secrets
        temp_password = secrets.token_urlsafe(32)  # Generate random password

        auth_user = supabase.auth.admin.create_user({
            'email': email,
            'password': temp_password,
            'email_confirm': True,  # Auto-confirm email for SSO users
            'user_metadata': {
                'first_name': claims.get('given_name', ''),
                'last_name': claims.get('family_name', ''),
                'display_name': f"{claims.get('given_name', '')} {claims.get('family_name', '')}".strip(),
                'sso_provider': 'spark'
            }
        })

        user_id = auth_user.user.id
        logger.info(f"Created auth user {user_id} from Spark SSO")

        # Create user profile in public.users table
        new_user = supabase.table('users').insert({
            'id': user_id,  # Use auth user ID
            'email': email,
            'first_name': claims.get('given_name', ''),
            'last_name': claims.get('family_name', ''),
            'role': 'student',
            'display_name': f"{claims.get('given_name', '')} {claims.get('family_name', '')}".strip()
        }).execute()

        logger.info(f"Created user profile {user_id} from Spark SSO")

    # Create LMS integration record
    supabase.table('lms_integrations').insert({
        'user_id': user_id,
        'lms_platform': 'spark',
        'lms_user_id': spark_user_id,
        'sync_enabled': True,
        'sync_status': 'active'
    }).execute()

    # Create LMS session for tracking
    supabase.table('lms_sessions').insert({
        'user_id': user_id,
        'lms_platform': 'spark',
        'session_token': str(uuid.uuid4()),
        'expires_at': (datetime.utcnow() + timedelta(hours=24)).isoformat()
    }).execute()

    return {'id': user_id}


def process_spark_submission(data: dict) -> dict:
    """
    Process Spark assignment submission

    Args:
        data: Webhook payload from Spark

    Returns:
        Dict with user_id and completion_id

    Raises:
        ValueError: If user or task not found
        Exception: For other processing errors
    """
    supabase = get_supabase_admin_client()

    # Find user by Spark ID
    spark_user_id = data['spark_user_id']
    integration = supabase.table('lms_integrations') \
        .select('user_id') \
        .eq('lms_platform', 'spark') \
        .eq('lms_user_id', spark_user_id) \
        .execute()

    if not integration.data:
        raise ValueError(f"User not found for Spark ID: {spark_user_id}")

    user_id = integration.data[0]['user_id']

    # Find task for this assignment
    spark_assignment_id = data['spark_assignment_id']
    task = supabase.table('user_quest_tasks') \
        .select('id, quest_id, xp_value, pillar, lms_assignment_id') \
        .eq('user_id', user_id) \
        .eq('lms_assignment_id', spark_assignment_id) \
        .execute()

    if not task.data:
        raise ValueError(f"Task not found for assignment: {spark_assignment_id}")

    task_data = task.data[0]
    task_id = task_data['id']
    quest_id = task_data['quest_id']

    # Check for duplicate submission (idempotency)
    existing = supabase.table('quest_task_completions') \
        .select('id') \
        .eq('task_id', task_id) \
        .eq('user_id', user_id) \
        .execute()

    if existing.data:
        logger.info(f"Duplicate submission ignored for task {task_id}")
        return {
            'user_id': user_id,
            'completion_id': existing.data[0]['id']
        }

    # Download and upload files
    evidence_files = []
    for file_data in data.get('submission_files', []):
        try:
            file_url = download_and_upload_file(file_data['url'], user_id)
            evidence_files.append(file_url)
        except Exception as e:
            logger.error(f"Failed to download file {file_data['filename']}: {str(e)}")
            # Continue processing, just log the error

    # Mark task complete
    completion = supabase.table('quest_task_completions').insert({
        'user_id': user_id,
        'quest_id': quest_id,
        'task_id': task_id,
        'evidence_text': data.get('submission_text', ''),
        'evidence_url': evidence_files[0] if evidence_files else None,
        'completed_at': data['submitted_at'],
        'xp_awarded': task_data['xp_value']
    }).execute()

    completion_id = completion.data[0]['id']

    # Award XP
    xp_service = XPService()
    xp_service.award_xp(
        user_id=user_id,
        xp_amount=task_data['xp_value'],
        pillar=task_data['pillar']
    )

    logger.info(f"Awarded {task_data['xp_value']} XP to user {user_id} for Spark submission")

    return {
        'user_id': user_id,
        'completion_id': completion_id
    }


def download_and_upload_file(temp_url: str, user_id: str) -> str:
    """
    Download file from Spark and upload to Supabase storage

    Args:
        temp_url: Temporary public URL from Spark
        user_id: Optio user ID for folder organization

    Returns:
        Public URL in Supabase storage

    Raises:
        ValueError: If URL is invalid or from untrusted domain
        requests.RequestException: If download fails
    """
    # SSRF protection: Validate URL domain
    parsed = urlparse(temp_url)
    allowed_domains = os.getenv('SPARK_STORAGE_DOMAINS', 'spark-storage.com,spark-cdn.com').split(',')

    if parsed.netloc not in allowed_domains:
        raise ValueError(f"Invalid file URL domain: {parsed.netloc}")

    if parsed.scheme != 'https':
        raise ValueError("File URLs must use HTTPS")

    # Download file with timeout
    response = requests.get(temp_url, timeout=30, allow_redirects=False)
    response.raise_for_status()

    # Generate unique filename
    file_extension = temp_url.split('.')[-1].split('?')[0]  # Handle query params
    filename = f"{user_id}/{uuid.uuid4()}.{file_extension}"

    # Upload to Supabase storage
    supabase = get_supabase_admin_client()
    supabase.storage.from_('evidence-files').upload(
        filename,
        response.content,
        file_options={"content-type": response.headers.get('content-type', 'application/octet-stream')}
    )

    # Return public URL
    public_url = supabase.storage.from_('evidence-files').get_public_url(filename)
    logger.info(f"Uploaded Spark file to {filename}")

    return public_url
