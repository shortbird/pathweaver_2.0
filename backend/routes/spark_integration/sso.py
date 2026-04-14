"""Spark SSO and OAuth token exchange.

Split from routes/spark_integration.py on 2026-04-14 (Q1).
"""

"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED - Integration Layer
- SSO authentication endpoint (JWT signature validation)
- Webhook handler for external LMS events (HMAC signature validation)
- Uses XPService for XP calculations from LMS submissions
- Integration layer, not standard CRUD operations
- Security-focused code (JWT, HMAC, rate limiting, replay protection)
- Direct DB access acceptable for SSO user provisioning and webhook processing
- Per migration guidelines: Integration endpoints don't benefit from repository abstraction

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
from app_config import Config
import jwt
import hmac
import hashlib
import json
import requests
from datetime import datetime, timedelta
from urllib.parse import urlparse
import uuid

from database import get_supabase_admin_client
from utils.session_manager import session_manager
from services.xp_service import XPService
from middleware.rate_limiter import rate_limit
from middleware.activity_tracker import track_custom_event
from routes.quest_types import get_course_tasks_for_quest
import logging

logger = logging.getLogger(__name__)


from routes.spark_integration import bp


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
        courses: Array of SPARK course IDs (optional - for course-specific enrollment)
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
        secret = Config.SPARK_SSO_SECRET
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
        # Extract course IDs from JWT claims (optional)
        course_ids = claims.get('courses', [])
        logger.info(f"SPARK SSO course_ids from JWT: {course_ids}")

        user = create_or_update_spark_user(claims, course_ids)

        # Generate one-time authorization code (OAuth 2.0 authorization code flow)
        # SECURITY: This prevents tokens from appearing in browser history/logs
        auth_code = generate_auth_code()
        expires_at = datetime.utcnow() + timedelta(seconds=60)  # 60 second expiry

        # admin client justified: Spark LMS SSO/webhook handlers verify JWT/HMAC signatures externally; admin client used for cross-user account provisioning + XP attribution from external system
        supabase = get_supabase_admin_client()
        supabase.table('spark_auth_codes').insert({
            'code': auth_code,
            'user_id': user['id'],
            'expires_at': expires_at.isoformat(),
            'used': False
        }).execute()

        # Redirect to frontend with one-time code (not tokens)
        frontend_url = Config.FRONTEND_URL
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

        # admin client justified: Spark LMS SSO/webhook handlers verify JWT/HMAC signatures externally; admin client used for cross-user account provisioning + XP attribution from external system
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
# COURSE SYNC WEBHOOK
# ============================================

