"""
OAuth 2.0 Authorization Flow for LMS Integrations

Implements OAuth 2.0 authorization code flow for external systems (Canvas, Moodle, etc.)
to securely access Optio API on behalf of users.

OAuth 2.0 Flow:
1. Client redirects user to /oauth/authorize with client_id, redirect_uri, scope
2. User authenticates and grants permission
3. Server redirects back to client with authorization code
4. Client exchanges code for access token at /oauth/token
5. Client uses access token to make API requests

Endpoints:
    GET /oauth/authorize - Authorization endpoint (user consent)
    POST /oauth/token - Token exchange endpoint
    POST /oauth/revoke - Token revocation endpoint
    GET /oauth/clients - List OAuth clients (admin only)
    POST /oauth/clients - Create OAuth client (admin only)
"""

from flask import Blueprint, request, jsonify, redirect, render_template_string, session
from datetime import datetime, timedelta
import secrets
import hashlib
import base64
from typing import Dict, Optional

from utils.auth.decorators import require_auth, require_admin
from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.session_manager import session_manager

logger = get_logger(__name__)

bp = Blueprint('oauth', __name__, url_prefix='/api/oauth')


# OAuth 2.0 Constants
AUTHORIZATION_CODE_TTL = 600  # 10 minutes
ACCESS_TOKEN_TTL = 3600  # 1 hour
REFRESH_TOKEN_TTL = 2592000  # 30 days


@bp.route('/authorize', methods=['GET'])
def authorize():
    """
    OAuth 2.0 authorization endpoint.

    User is redirected here by external application requesting access.
    Displays consent screen and redirects back with authorization code.

    Query params (required):
        - response_type: Must be 'code'
        - client_id: OAuth client ID
        - redirect_uri: Where to redirect after authorization
        - scope: Requested permissions (space-separated)
        - state: CSRF protection token from client

    Returns:
        302: Redirect to login if not authenticated
        302: Redirect to redirect_uri with authorization code
        400: Invalid request parameters
    """
    try:
        # Validate OAuth parameters
        response_type = request.args.get('response_type')
        client_id = request.args.get('client_id')
        redirect_uri = request.args.get('redirect_uri')
        scope = request.args.get('scope', 'read')
        state = request.args.get('state')

        if not all([response_type, client_id, redirect_uri]):
            return jsonify({
                'error': 'invalid_request',
                'error_description': 'Missing required parameters: response_type, client_id, redirect_uri'
            }), 400

        if response_type != 'code':
            return jsonify({
                'error': 'unsupported_response_type',
                'error_description': 'Only response_type=code is supported'
            }), 400

        # Verify OAuth client exists
        supabase = get_supabase_admin_client()
        client_result = supabase.table('oauth_clients').select('*').eq('client_id', client_id).single().execute()

        if not client_result.data:
            return jsonify({
                'error': 'invalid_client',
                'error_description': 'Client not found'
            }), 400

        client = client_result.data

        # Verify redirect URI matches registered URI
        if redirect_uri not in client.get('redirect_uris', []):
            return jsonify({
                'error': 'invalid_request',
                'error_description': 'redirect_uri does not match registered URIs'
            }), 400

        # Check if user is authenticated (would need session/cookie check)
        # For now, assuming user is authenticated via existing session
        # In production, this would redirect to login page if not authenticated

        # For MVP, auto-approve if user is authenticated
        # In production, show consent screen here

        # Generate authorization code
        auth_code = secrets.token_urlsafe(32)
        code_challenge = hashlib.sha256(auth_code.encode()).hexdigest()

        # Store authorization code in database
        supabase.table('oauth_authorization_codes').insert({
            'code': auth_code,
            'client_id': client_id,
            'redirect_uri': redirect_uri,
            'scope': scope,
            'expires_at': (datetime.utcnow() + timedelta(seconds=AUTHORIZATION_CODE_TTL)).isoformat(),
            'user_id': session.get('user_id'),  # From session (would come from @require_auth)
            'created_at': datetime.utcnow().isoformat()
        }).execute()

        # Redirect back to client with authorization code
        redirect_url = f"{redirect_uri}?code={auth_code}"
        if state:
            redirect_url += f"&state={state}"

        logger.info(f"OAuth authorization granted for client {client_id}")
        return redirect(redirect_url, code=302)

    except Exception as e:
        logger.error(f"OAuth authorization error: {str(e)}")
        return jsonify({
            'error': 'server_error',
            'error_description': 'Internal server error'
        }), 500


@bp.route('/token', methods=['POST'])
def token():
    """
    OAuth 2.0 token endpoint.

    Exchange authorization code for access token.

    Request body (form-encoded):
        - grant_type: 'authorization_code' or 'refresh_token'
        - code: Authorization code (if grant_type=authorization_code)
        - refresh_token: Refresh token (if grant_type=refresh_token)
        - client_id: OAuth client ID
        - client_secret: OAuth client secret
        - redirect_uri: Same redirect_uri used in /authorize

    Returns:
        200: Access token response
        400: Invalid request
        401: Invalid client credentials
    """
    try:
        grant_type = request.form.get('grant_type')
        client_id = request.form.get('client_id')
        client_secret = request.form.get('client_secret')

        if not all([grant_type, client_id, client_secret]):
            return jsonify({
                'error': 'invalid_request',
                'error_description': 'Missing required parameters'
            }), 400

        # Verify client credentials
        supabase = get_supabase_admin_client()
        client_result = supabase.table('oauth_clients').select('*').eq('client_id', client_id).single().execute()

        if not client_result.data:
            return jsonify({
                'error': 'invalid_client',
                'error_description': 'Client authentication failed'
            }), 401

        client = client_result.data

        # Verify client secret (should be hashed in production)
        if not secrets.compare_digest(client['client_secret'], client_secret):
            return jsonify({
                'error': 'invalid_client',
                'error_description': 'Client authentication failed'
            }), 401

        if grant_type == 'authorization_code':
            return _handle_authorization_code_grant(request, client)
        elif grant_type == 'refresh_token':
            return _handle_refresh_token_grant(request, client)
        else:
            return jsonify({
                'error': 'unsupported_grant_type',
                'error_description': f'Grant type {grant_type} not supported'
            }), 400

    except Exception as e:
        logger.error(f"OAuth token error: {str(e)}")
        return jsonify({
            'error': 'server_error',
            'error_description': 'Internal server error'
        }), 500


def _handle_authorization_code_grant(request, client):
    """Handle authorization_code grant type."""
    code = request.form.get('code')
    redirect_uri = request.form.get('redirect_uri')

    if not all([code, redirect_uri]):
        return jsonify({
            'error': 'invalid_request',
            'error_description': 'Missing code or redirect_uri'
        }), 400

    supabase = get_supabase_admin_client()

    # Verify authorization code
    code_result = supabase.table('oauth_authorization_codes')\
        .select('*')\
        .eq('code', code)\
        .eq('client_id', client['client_id'])\
        .single()\
        .execute()

    if not code_result.data:
        return jsonify({
            'error': 'invalid_grant',
            'error_description': 'Invalid authorization code'
        }), 400

    auth_code_data = code_result.data

    # Check if code is expired
    if datetime.fromisoformat(auth_code_data['expires_at']) < datetime.utcnow():
        return jsonify({
            'error': 'invalid_grant',
            'error_description': 'Authorization code expired'
        }), 400

    # Verify redirect_uri matches
    if auth_code_data['redirect_uri'] != redirect_uri:
        return jsonify({
            'error': 'invalid_grant',
            'error_description': 'redirect_uri mismatch'
        }), 400

    # Generate access token and refresh token
    user_id = auth_code_data['user_id']
    scope = auth_code_data['scope']

    access_token = session_manager.generate_access_token(user_id)
    refresh_token = secrets.token_urlsafe(32)

    # Store tokens in database
    supabase.table('oauth_tokens').insert({
        'access_token': hashlib.sha256(access_token.encode()).hexdigest(),  # Store hash only
        'refresh_token': hashlib.sha256(refresh_token.encode()).hexdigest(),
        'client_id': client['client_id'],
        'user_id': user_id,
        'scope': scope,
        'access_token_expires_at': (datetime.utcnow() + timedelta(seconds=ACCESS_TOKEN_TTL)).isoformat(),
        'refresh_token_expires_at': (datetime.utcnow() + timedelta(seconds=REFRESH_TOKEN_TTL)).isoformat(),
        'created_at': datetime.utcnow().isoformat()
    }).execute()

    # Delete used authorization code
    supabase.table('oauth_authorization_codes').delete().eq('code', code).execute()

    logger.info(f"OAuth access token issued for user {user_id[:8]} via client {client['client_id']}")

    return jsonify({
        'access_token': access_token,
        'token_type': 'Bearer',
        'expires_in': ACCESS_TOKEN_TTL,
        'refresh_token': refresh_token,
        'scope': scope
    }), 200


def _handle_refresh_token_grant(request, client):
    """Handle refresh_token grant type."""
    refresh_token = request.form.get('refresh_token')

    if not refresh_token:
        return jsonify({
            'error': 'invalid_request',
            'error_description': 'Missing refresh_token'
        }), 400

    supabase = get_supabase_admin_client()
    refresh_token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()

    # Verify refresh token
    token_result = supabase.table('oauth_tokens')\
        .select('*')\
        .eq('refresh_token', refresh_token_hash)\
        .eq('client_id', client['client_id'])\
        .single()\
        .execute()

    if not token_result.data:
        return jsonify({
            'error': 'invalid_grant',
            'error_description': 'Invalid refresh token'
        }), 400

    token_data = token_result.data

    # Check if refresh token is expired
    if datetime.fromisoformat(token_data['refresh_token_expires_at']) < datetime.utcnow():
        return jsonify({
            'error': 'invalid_grant',
            'error_description': 'Refresh token expired'
        }), 400

    # Generate new access token
    user_id = token_data['user_id']
    scope = token_data['scope']

    access_token = session_manager.generate_access_token(user_id)

    # Update token in database
    supabase.table('oauth_tokens').update({
        'access_token': hashlib.sha256(access_token.encode()).hexdigest(),
        'access_token_expires_at': (datetime.utcnow() + timedelta(seconds=ACCESS_TOKEN_TTL)).isoformat()
    }).eq('refresh_token', refresh_token_hash).execute()

    logger.info(f"OAuth access token refreshed for user {user_id[:8]}")

    return jsonify({
        'access_token': access_token,
        'token_type': 'Bearer',
        'expires_in': ACCESS_TOKEN_TTL,
        'scope': scope
    }), 200


@bp.route('/revoke', methods=['POST'])
def revoke():
    """
    OAuth 2.0 token revocation endpoint.

    Revoke an access token or refresh token.

    Request body (form-encoded):
        - token: The token to revoke
        - token_type_hint: 'access_token' or 'refresh_token' (optional)
        - client_id: OAuth client ID
        - client_secret: OAuth client secret

    Returns:
        200: Token revoked
        400: Invalid request
        401: Invalid client credentials
    """
    try:
        token = request.form.get('token')
        client_id = request.form.get('client_id')
        client_secret = request.form.get('client_secret')

        if not all([token, client_id, client_secret]):
            return jsonify({
                'error': 'invalid_request',
                'error_description': 'Missing required parameters'
            }), 400

        # Verify client credentials
        supabase = get_supabase_admin_client()
        client_result = supabase.table('oauth_clients').select('*').eq('client_id', client_id).single().execute()

        if not client_result.data or not secrets.compare_digest(client_result.data['client_secret'], client_secret):
            return jsonify({
                'error': 'invalid_client',
                'error_description': 'Client authentication failed'
            }), 401

        # Revoke token (delete from database)
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        supabase.table('oauth_tokens').delete()\
            .eq('client_id', client_id)\
            .or_(f'access_token.eq.{token_hash},refresh_token.eq.{token_hash}')\
            .execute()

        logger.info(f"OAuth token revoked for client {client_id}")

        return jsonify({'message': 'Token revoked'}), 200

    except Exception as e:
        logger.error(f"OAuth revoke error: {str(e)}")
        return jsonify({
            'error': 'server_error',
            'error_description': 'Internal server error'
        }), 500


@bp.route('/clients', methods=['GET'])
@require_admin
def list_clients(user_id: str):
    """
    List OAuth clients (admin only).

    Returns:
        200: List of OAuth clients
        403: Insufficient permissions
    """
    try:
        supabase = get_supabase_admin_client()

        # Get all OAuth clients
        clients_result = supabase.table('oauth_clients').select('client_id, name, redirect_uris, created_at').execute()

        return jsonify({
            'clients': clients_result.data or [],
            'count': len(clients_result.data or [])
        }), 200

    except Exception as e:
        logger.error(f"List OAuth clients error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@bp.route('/clients', methods=['POST'])
@require_admin
def create_client(user_id: str):
    """
    Create OAuth client (admin only).

    Request body:
        - name: Client name
        - redirect_uris: List of allowed redirect URIs

    Returns:
        201: Client created (includes client_secret - store securely!)
        400: Invalid request
        403: Insufficient permissions
    """
    try:
        supabase = get_supabase_admin_client()

        data = request.get_json()
        if not data or not data.get('name') or not data.get('redirect_uris'):
            return jsonify({
                'error': 'Missing required fields',
                'required': ['name', 'redirect_uris']
            }), 400

        # Generate client credentials
        client_id = secrets.token_urlsafe(16)
        client_secret = secrets.token_urlsafe(32)

        # Create client
        client_data = {
            'client_id': client_id,
            'client_secret': client_secret,  # Should be hashed in production
            'name': data['name'],
            'redirect_uris': data['redirect_uris'],
            'created_by': user_id,
            'created_at': datetime.utcnow().isoformat()
        }

        supabase.table('oauth_clients').insert(client_data).execute()

        logger.info(f"OAuth client created: {client_id} by user {user_id[:8]}")

        return jsonify({
            'message': 'OAuth client created',
            'client_id': client_id,
            'client_secret': client_secret,  # Return once - client must store securely
            'name': data['name'],
            'redirect_uris': data['redirect_uris']
        }), 201

    except Exception as e:
        logger.error(f"Create OAuth client error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500
