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
from middleware.activity_tracker import track_custom_event
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
        track_custom_event(
            event_type='spark_sso_failed',
            event_data={
                'error_type': 'missing_token',
                'error_message': 'Missing token parameter'
            }
        )
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
        track_custom_event(
            event_type='spark_sso_token_expired',
            event_data={
                'error_type': 'token_expired',
                'error_message': 'Token expired. Please try again.'
            }
        )
        return jsonify({'error': 'Token expired. Please try again.'}), 401
    except jwt.InvalidTokenError as e:
        logger.warning(f"Spark SSO invalid token: {str(e)}")
        track_custom_event(
            event_type='spark_sso_invalid_token',
            event_data={
                'error_type': 'invalid_signature',
                'error_message': str(e)
            }
        )
        return jsonify({'error': 'Invalid token'}), 401
    except Exception as e:
        logger.error(f"Spark SSO validation error: {str(e)}", exc_info=True)
        track_custom_event(
            event_type='spark_sso_failed',
            event_data={
                'error_type': 'validation_error',
                'error_message': str(e)
            }
        )
        return jsonify({'error': 'Token validation failed'}), 401

    # Create or update user
    try:
        user = create_or_update_spark_user(claims)

        # Generate one-time authorization code (OAuth 2.0 authorization code flow)
        # SECURITY: This prevents tokens from appearing in browser history/logs
        auth_code = generate_auth_code()
        expires_at = datetime.utcnow() + timedelta(seconds=60)  # 60 second expiry

        supabase = get_supabase_admin_client()
        supabase.table('spark_auth_codes').insert({
            'code': auth_code,
            'user_id': user['id'],
            'expires_at': expires_at.isoformat(),
            'used': False
        }).execute()

        # Redirect to frontend with one-time code (not tokens)
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
        redirect_url = f"{frontend_url}/auth/callback?code={auth_code}"

        logger.info(f"[SPARK SSO DEBUG] FRONTEND_URL env var: {frontend_url}")
        logger.info(f"[SPARK SSO DEBUG] Issuing HTTP 302 redirect to: {redirect_url}")
        logger.info(f"[SPARK SSO DEBUG] Auth code: {auth_code[:10]}... (60 second expiry)")

        response = redirect(redirect_url)

        logger.info(f"[SPARK SSO DEBUG] Redirect response created, sending to browser")
        logger.info(f"Spark SSO successful: user_id={user['id']}, code issued")

        # Track successful SSO
        track_custom_event(
            event_type='spark_sso_success',
            event_data={
                'spark_user_id': claims['sub'],
                'email': claims['email'],
                'jwt_issued_at': claims.get('iat'),
                'user_created': user.get('created', False)
            },
            user_id=user['id']
        )

        return response

    except Exception as e:
        logger.error(f"Failed to create Spark user: {str(e)}", exc_info=True)
        track_custom_event(
            event_type='spark_sso_failed',
            event_data={
                'error_type': 'user_creation_error',
                'error_message': str(e)
            }
        )
        return jsonify({'error': 'Failed to create user account'}), 500


def generate_auth_code() -> str:
    """Generate a cryptographically secure random authorization code"""
    import secrets
    return secrets.token_urlsafe(32)


# ============================================
# TOKEN EXCHANGE ENDPOINT
# ============================================

@bp.route('/spark/token', methods=['POST'])
@rate_limit(limit=10, per=60)  # 10 token exchanges per minute
def exchange_auth_code():
    """
    Exchange authorization code for access/refresh tokens (OAuth 2.0 pattern)

    Request Body:
        code: One-time authorization code from SSO redirect

    Returns:
        200: {user_id} + httpOnly cookies with tokens
        400: Missing/invalid code
        401: Code expired or already used

    SECURITY: Tokens are set as httpOnly cookies (not in response body) to prevent XSS attacks.
    This matches the authentication pattern used by /api/auth/login endpoint.
    """
    try:
        data = request.get_json()
        code = data.get('code')

        if not code:
            return jsonify({'error': 'Missing authorization code'}), 400

        supabase = get_supabase_admin_client()

        # Validate code (one-time use, not expired)
        code_record = supabase.table('spark_auth_codes')\
            .select('*')\
            .eq('code', code)\
            .single()\
            .execute()

        if not code_record.data:
            logger.warning(f"Invalid auth code attempted: {code[:10]}...")
            track_custom_event(
                event_type='spark_token_exchange_failed',
                event_data={
                    'error_type': 'invalid_code',
                    'error_message': 'Invalid authorization code'
                }
            )
            return jsonify({'error': 'Invalid authorization code'}), 401

        record = code_record.data

        # Check if already used
        if record['used']:
            logger.warning(f"Auth code reuse attempted: {code[:10]}...")
            track_custom_event(
                event_type='spark_token_code_reuse',
                event_data={
                    'error_type': 'code_reused',
                    'error_message': 'Authorization code already used',
                    'user_id': record['user_id']
                },
                user_id=record['user_id']
            )
            return jsonify({'error': 'Authorization code already used'}), 401

        # Check if expired
        expires_at = datetime.fromisoformat(record['expires_at'].replace('Z', '+00:00'))
        if datetime.now(expires_at.tzinfo) > expires_at:
            logger.warning(f"Expired auth code attempted: {code[:10]}...")
            track_custom_event(
                event_type='spark_token_code_expired',
                event_data={
                    'error_type': 'code_expired',
                    'error_message': 'Authorization code expired',
                    'user_id': record['user_id']
                },
                user_id=record['user_id']
            )
            return jsonify({'error': 'Authorization code expired'}), 401

        # Mark code as used (one-time use)
        supabase.table('spark_auth_codes')\
            .update({'used': True})\
            .eq('code', code)\
            .execute()

        # Generate tokens
        user_id = record['user_id']
        access_token = session_manager.generate_access_token(user_id)
        refresh_token = session_manager.generate_refresh_token(user_id)

        logger.info(f"Token exchange successful: user_id={user_id}")

        # Track successful token exchange
        code_created_at = datetime.fromisoformat(record['created_at'].replace('Z', '+00:00'))
        code_age_seconds = (datetime.now(code_created_at.tzinfo) - code_created_at).total_seconds()

        track_custom_event(
            event_type='spark_token_exchange_success',
            event_data={
                'code_age_seconds': code_age_seconds,
                'user_id': user_id
            },
            user_id=user_id
        )

        # ✅ CROSS-ORIGIN FIX: Return tokens in response body for Spark SSO
        # httpOnly cookies don't work cross-origin (frontend on optio-dev-frontend, backend on optio-dev-backend)
        # Frontend will store these using tokenStore.setTokens() for Authorization headers
        # This matches the regular /api/auth/login behavior
        from flask import make_response

        logger.info(f"[SPARK SSO DEBUG] Returning tokens in response body for user_id={user_id}")

        response = make_response(jsonify({
            'user_id': user_id,
            'app_access_token': access_token,
            'app_refresh_token': refresh_token,
            'message': 'Authentication successful'
        }), 200)

        # ALSO set httpOnly cookies as fallback (for same-origin deployments)
        # IMPORTANT: Cookie names MUST match session_manager.py lines 141/151 (access_token, refresh_token)
        response.set_cookie(
            'access_token',
            access_token,
            max_age=3600,  # 1 hour
            httponly=True,
            secure=session_manager.cookie_secure,
            samesite=session_manager.cookie_samesite,
            path='/'
        )

        response.set_cookie(
            'refresh_token',
            refresh_token,
            max_age=2592000,  # 30 days
            httponly=True,
            secure=session_manager.cookie_secure,
            samesite=session_manager.cookie_samesite,
            path='/'
        )

        logger.info(f"[SPARK SSO DEBUG] Tokens returned in body AND cookies set")

        return response

    except Exception as e:
        logger.error(f"Token exchange error: {str(e)}", exc_info=True)
        track_custom_event(
            event_type='spark_token_exchange_failed',
            event_data={
                'error_type': 'exchange_error',
                'error_message': str(e)
            }
        )
        return jsonify({'error': 'Token exchange failed'}), 500


# ============================================
# WEBHOOK ENDPOINT
# ============================================

@bp.route('/spark/webhook/submission', methods=['POST'])
@rate_limit(limit=100, per=60)  # 100 webhooks per minute (batch submissions)
def submission_webhook():
    """
    Receive assignment submissions from Spark

    Headers:
        X-Spark-Signature: HMAC-SHA256 signature of metadata field (for multipart) or request body (for JSON)

    Body (JSON - text-only submission):
        spark_user_id: Spark's user ID
        spark_assignment_id: Spark's assignment ID
        spark_course_id: Spark's course ID
        submission_text: Student's text submission
        submitted_at: ISO timestamp
        grade: Numeric grade (optional)

    Body (multipart/form-data - with files):
        metadata: JSON string with all fields above
        file1, file2, ...: File attachments (50MB per file, 200MB total)

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
        track_custom_event(
            event_type='spark_webhook_failed',
            event_data={
                'error_type': 'missing_signature',
                'error_message': 'Missing signature'
            }
        )
        return jsonify({'error': 'Missing signature'}), 401

    try:
        # Parse request based on content type
        content_type = request.content_type or ''

        if 'multipart/form-data' in content_type:
            # Multipart request with files
            if 'metadata' not in request.form:
                return jsonify({'error': 'Missing metadata field in multipart request'}), 400

            metadata_json = request.form['metadata']

            # Validate signature on metadata field only
            if not validate_spark_signature(metadata_json.encode('utf-8'), signature):
                logger.warning("Spark webhook invalid signature")
                track_custom_event(
                    event_type='spark_webhook_invalid_signature',
                    event_data={
                        'error_type': 'invalid_signature',
                        'error_message': 'HMAC signature validation failed'
                    }
                )
                return jsonify({'error': 'Invalid signature'}), 401

            data = json.loads(metadata_json)
            files = request.files
        else:
            # JSON request (text-only)
            if not validate_spark_signature(request.data, signature):
                logger.warning("Spark webhook invalid signature")
                track_custom_event(
                    event_type='spark_webhook_invalid_signature',
                    event_data={
                        'error_type': 'invalid_signature',
                        'error_message': 'HMAC signature validation failed'
                    }
                )
                return jsonify({'error': 'Invalid signature'}), 401

            data = request.json
            files = None

        # Validate required fields
        if not data.get('submission_text') and not files:
            return jsonify({'error': 'Must provide either submission_text or files'}), 400

        # Check for replay attacks (timestamp freshness)
        submitted_at = datetime.fromisoformat(data['submitted_at'].replace('Z', '+00:00'))
        if datetime.utcnow() - submitted_at.replace(tzinfo=None) > timedelta(minutes=5):
            logger.warning(f"Rejected old Spark webhook: {submitted_at}")
            track_custom_event(
                event_type='spark_webhook_replay_attack',
                event_data={
                    'error_type': 'old_timestamp',
                    'error_message': 'Submission timestamp too old',
                    'submitted_at': data['submitted_at'],
                    'spark_assignment_id': data.get('spark_assignment_id')
                }
            )
            return jsonify({'error': 'Submission timestamp too old'}), 400

        # Track webhook received (before processing)
        processing_start = datetime.utcnow()

        # Process submission
        result = process_spark_submission(data, files)

        # Track successful webhook processing
        processing_time_ms = int((datetime.utcnow() - processing_start).total_seconds() * 1000)

        track_custom_event(
            event_type='spark_webhook_success',
            event_data={
                'spark_assignment_id': data['spark_assignment_id'],
                'spark_course_id': data.get('spark_course_id'),
                'quest_id': result.get('quest_id'),
                'file_count': len(files) if files else 0,
                'processing_time_ms': processing_time_ms
            },
            user_id=result['user_id']
        )

        logger.info(f"Spark submission processed: assignment_id={data['spark_assignment_id']}, user_id={result['user_id']}")
        return jsonify({'status': 'success', 'completion_id': result['completion_id']}), 200

    except KeyError as e:
        logger.warning(f"Spark webhook missing field: {str(e)}")
        track_custom_event(
            event_type='spark_webhook_failed',
            event_data={
                'error_type': 'missing_field',
                'error_message': f'Missing required field: {str(e)}',
                'spark_assignment_id': data.get('spark_assignment_id') if 'data' in locals() else None
            }
        )
        return jsonify({'error': f'Missing required field: {str(e)}'}), 400
    except ValueError as e:
        logger.warning(f"Spark webhook invalid data: {str(e)}")
        error_message = str(e)
        track_custom_event(
            event_type='spark_webhook_failed',
            event_data={
                'error_type': 'user_not_found' if 'User not found' in error_message else 'quest_not_found' if 'Quest not found' in error_message else 'invalid_data',
                'error_message': error_message,
                'spark_assignment_id': data.get('spark_assignment_id') if 'data' in locals() else None
            }
        )
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Failed to process Spark webhook: {str(e)}", exc_info=True)
        track_custom_event(
            event_type='spark_webhook_failed',
            event_data={
                'error_type': 'processing_error',
                'error_message': str(e),
                'spark_assignment_id': data.get('spark_assignment_id') if 'data' in locals() else None
            }
        )
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


def process_spark_submission(data: dict, files=None) -> dict:
    """
    Process Spark assignment submission with direct file uploads

    Args:
        data: Webhook payload from Spark (JSON metadata)
        files: Flask request.files object (multipart uploads) or None (text-only)

    Returns:
        Dict with user_id and completion_id

    Raises:
        ValueError: If user or task not found, or file validation fails
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

    # Find quest for this assignment
    spark_assignment_id = data['spark_assignment_id']
    quest = supabase.table('quests') \
        .select('id') \
        .eq('lms_assignment_id', spark_assignment_id) \
        .eq('lms_platform', 'spark') \
        .execute()

    if not quest.data:
        raise ValueError(f"Quest not found for assignment: {spark_assignment_id}")

    quest_id = quest.data[0]['id']

    # Auto-enroll user in quest if not already enrolled, or reactivate if completed
    enrollment = supabase.table('user_quests') \
        .select('id, is_active, completed_at') \
        .eq('user_id', user_id) \
        .eq('quest_id', quest_id) \
        .execute()

    enrollment_id = None
    if not enrollment.data:
        # Create enrollment
        enrollment_result = supabase.table('user_quests').insert({
            'user_id': user_id,
            'quest_id': quest_id,
            'is_active': True,
            'started_at': datetime.utcnow().isoformat()
        }).execute()
        enrollment_id = enrollment_result.data[0]['id']
        logger.info(f"Auto-enrolled user {user_id} in Spark quest {quest_id}")

        # Copy course tasks to user_quest_tasks (since this is a course quest)
        from routes.quest_types import get_course_tasks_for_quest
        preset_tasks = get_course_tasks_for_quest(quest_id)

        if preset_tasks:
            user_tasks_data = []
            for task in preset_tasks:
                task_data = {
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'user_quest_id': enrollment_id,
                    'title': task['title'],
                    'description': task.get('description', ''),
                    'pillar': task['pillar'],
                    'xp_value': task.get('xp_value', 100),
                    'order_index': task.get('order_index', 0),
                    'is_required': task.get('is_required', True),
                    'is_manual': False,
                    'approval_status': 'approved',
                    'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                    'subject_xp_distribution': task.get('subject_xp_distribution', {})
                }
                user_tasks_data.append(task_data)

            if user_tasks_data:
                supabase.table('user_quest_tasks').insert(user_tasks_data).execute()
                logger.info(f"Copied {len(user_tasks_data)} preset tasks to user_quest_tasks for Spark enrollment")
    elif enrollment.data[0].get('is_active') == False or enrollment.data[0].get('completed_at'):
        # Reactivate completed quest on new submission
        enrollment_id = enrollment.data[0]['id']
        supabase.table('user_quests') \
            .update({
                'is_active': True,
                'completed_at': None
            }) \
            .eq('id', enrollment_id) \
            .execute()
        logger.info(f"Reactivated completed Spark quest {quest_id} for user {user_id}")
    else:
        enrollment_id = enrollment.data[0]['id']

    # Find user's tasks for this quest (should exist after enrollment)
    tasks = supabase.table('user_quest_tasks') \
        .select('id, xp_value, pillar') \
        .eq('user_id', user_id) \
        .eq('quest_id', quest_id) \
        .execute()

    if not tasks.data:
        raise ValueError(f"No tasks found for quest: {spark_assignment_id}. Quest may not have tasks configured.")

    # Use first task (or we could mark all tasks complete)
    task_data = tasks.data[0]
    task_id = task_data['id']

    # Check for duplicate submission (idempotency)
    existing = supabase.table('quest_task_completions') \
        .select('id') \
        .eq('user_quest_task_id', task_id) \
        .eq('user_id', user_id) \
        .execute()

    if existing.data:
        logger.info(f"Duplicate submission ignored for task {task_id}")
        return {
            'user_id': user_id,
            'completion_id': existing.data[0]['id']
        }

    # Process uploaded files directly (no URL downloads)
    evidence_files = []
    if files:
        # File size limits
        MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB per file
        MAX_TOTAL_SIZE = 200 * 1024 * 1024  # 200MB total
        total_size = 0

        # Allowed MIME types
        ALLOWED_TYPES = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/quicktime', 'video/x-msvideo',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ]

        for file_key in files:
            file = files[file_key]
            if not file or file.filename == '':
                continue

            # Read file content
            file_content = file.read()
            file_size = len(file_content)

            # Validate file size
            if file_size > MAX_FILE_SIZE:
                raise ValueError(f"File {file.filename} exceeds 50MB limit")

            total_size += file_size
            if total_size > MAX_TOTAL_SIZE:
                raise ValueError("Total file size exceeds 200MB limit")

            # Validate MIME type
            mime_type = file.content_type or 'application/octet-stream'
            if mime_type not in ALLOWED_TYPES:
                raise ValueError(f"File type {mime_type} not allowed")

            # Generate unique filename
            file_extension = file.filename.rsplit('.', 1)[-1] if '.' in file.filename else 'bin'
            unique_filename = f"{user_id}/{uuid.uuid4()}.{file_extension}"

            # Upload to Supabase storage
            supabase.storage.from_('evidence-files').upload(
                unique_filename,
                file_content,
                file_options={"content-type": mime_type}
            )

            # Get public URL
            public_url = supabase.storage.from_('evidence-files').get_public_url(unique_filename)

            evidence_files.append({
                'url': public_url,
                'filename': file.filename,
                'type': mime_type
            })

            logger.info(f"Uploaded Spark file {file.filename} to {unique_filename}")

    # ✅ BLOCK-BASED EVIDENCE: Create evidence document with blocks
    # This allows UI editing after webhook submission and unifies evidence system
    document_id = create_block_based_evidence(
        supabase=supabase,
        user_id=user_id,
        quest_id=quest_id,
        task_id=task_id,
        submission_text=data.get('submission_text', ''),
        files=evidence_files,
        submitted_at=data['submitted_at']
    )

    # Mark task complete (need both task_id and user_quest_task_id for schema compatibility)
    completion = supabase.table('quest_task_completions').insert({
        'user_id': user_id,
        'quest_id': quest_id,
        'task_id': task_id,  # Legacy column (NOT NULL constraint)
        'user_quest_task_id': task_id,  # New column (this is the id from user_quest_tasks table)
        'evidence_text': data.get('submission_text', ''),  # Keep for backward compatibility
        'evidence_url': evidence_files[0]['url'] if evidence_files else None,  # Keep for backward compatibility
        'completed_at': data['submitted_at']
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
        'quest_id': quest_id,
        'completion_id': completion_id
    }


def create_block_based_evidence(supabase, user_id: str, quest_id: str, task_id: str,
                               submission_text: str, files: list, submitted_at: str) -> str:
    """
    Create block-based evidence document for Spark webhook submissions.
    This allows evidence to be editable in the UI after webhook submission.

    Args:
        supabase: Supabase admin client
        user_id: Optio user ID
        quest_id: Quest ID
        task_id: Task ID from user_quest_tasks
        submission_text: Text submission from Spark
        files: List of uploaded files with {url, filename, type}
        submitted_at: ISO timestamp of submission

    Returns:
        Evidence document ID

    Creates:
        - user_task_evidence_documents record
        - evidence_document_blocks for text content
        - evidence_document_blocks for each file attachment
    """
    from datetime import datetime

    # Get or create evidence document (handle existing documents from UI edits)
    existing = supabase.table('user_task_evidence_documents')\
        .select('id, status')\
        .eq('user_id', user_id)\
        .eq('task_id', task_id)\
        .execute()

    if existing.data:
        # Update existing document to completed status
        document_id = existing.data[0]['id']
        supabase.table('user_task_evidence_documents')\
            .update({
                'status': 'completed',
                'completed_at': submitted_at,
                'updated_at': submitted_at
            })\
            .eq('id', document_id)\
            .execute()

        # Delete existing blocks (Spark submission is authoritative)
        supabase.table('evidence_document_blocks')\
            .delete()\
            .eq('document_id', document_id)\
            .execute()

        logger.info(f"Updated existing evidence document {document_id} and cleared old blocks for Spark submission")
    else:
        # Create new evidence document
        document = supabase.table('user_task_evidence_documents').insert({
            'user_id': user_id,
            'quest_id': quest_id,
            'task_id': task_id,
            'status': 'completed',
            'completed_at': submitted_at,
            'created_at': submitted_at,
            'updated_at': submitted_at
        }).execute()

        if not document.data:
            logger.error(f"Failed to create evidence document for task {task_id}")
            raise ValueError("Failed to create evidence document")

        document_id = document.data[0]['id']
        logger.info(f"Created new evidence document {document_id} for Spark submission")

    # Create blocks for the evidence
    blocks = []
    order_index = 0

    # Add text block if submission has text
    if submission_text and submission_text.strip():
        blocks.append({
            'document_id': document_id,
            'block_type': 'text',
            'content': {'text': submission_text},
            'order_index': order_index,
            'is_private': False
        })
        order_index += 1

    # Add file blocks for each attachment
    for file in files:
        file_type = file['type']

        # Determine block type based on MIME type
        if file_type.startswith('image/'):
            block_type = 'image'
            content = {
                'url': file['url'],
                'alt': file['filename'],
                'caption': f"Submitted via Spark LMS: {file['filename']}"
            }
        elif file_type.startswith('video/'):
            block_type = 'video'
            content = {
                'url': file['url'],
                'title': file['filename'],
                'platform': 'custom'  # Not YouTube/Vimeo, direct video file
            }
        else:
            # PDFs, docs, etc.
            block_type = 'document'
            content = {
                'url': file['url'],
                'title': file['filename'],
                'filename': file['filename']
            }

        blocks.append({
            'document_id': document_id,
            'block_type': block_type,
            'content': content,
            'order_index': order_index,
            'is_private': False
        })
        order_index += 1

    # Batch insert all blocks
    if blocks:
        supabase.table('evidence_document_blocks').insert(blocks).execute()
        logger.info(f"Created {len(blocks)} evidence blocks for document {document_id}")

    return document_id


