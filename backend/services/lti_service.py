"""
LTI 1.3 Integration Service

Handles LTI 1.3 (Learning Tools Interoperability) standard for Canvas, Moodle, and other LMS platforms.
LTI 1.3 provides secure, standards-based integration with SSO and grade passback.
"""

import jwt
import requests
from datetime import datetime, timedelta, timezone
from flask import current_app
from lms_config.lms_platforms import get_platform_config
from database import get_supabase_admin_client


class LTI13Service:
    """LTI 1.3 integration service for LMS platforms"""

    def __init__(self):
        self.platform_configs = {}
        self._load_platform_configs()

    def _load_platform_configs(self):
        """Load LTI platform configurations"""
        from config.lms_platforms import get_supported_platforms

        for platform in get_supported_platforms():
            config = get_platform_config(platform)
            if config and config.get('auth_method') == 'lti_1_3':
                self.platform_configs[platform] = config

    def validate_launch(self, id_token, platform='canvas'):
        """
        Validate LTI 1.3 launch request

        Args:
            id_token: JWT token from LMS
            platform: Platform identifier (canvas, moodle, etc.)

        Returns:
            User data dict or None if invalid
        """
        try:
            config = self.platform_configs.get(platform)
            if not config:
                current_app.logger.error(f"Platform {platform} not configured for LTI")
                return None

            # Fetch JWKS from platform
            jwks = self._fetch_jwks(config.get('jwks_url'))
            if not jwks:
                current_app.logger.error("Failed to fetch JWKS")
                return None

            # Decode and validate JWT
            decoded = jwt.decode(
                id_token,
                jwks,
                algorithms=['RS256'],
                audience=config.get('client_id')
            )

            # Validate required claims
            if not self._validate_claims(decoded):
                current_app.logger.error("Invalid LTI claims")
                return None

            # Extract user info from LTI claims
            user_data = {
                'lms_user_id': decoded.get('sub'),
                'email': decoded.get('email'),
                'name': decoded.get('name') or decoded.get('given_name', '') + ' ' + decoded.get('family_name', ''),
                'lms_platform': platform,
                'lms_course_id': decoded.get('https://purl.imsglobal.org/spec/lti/claim/context', {}).get('id'),
                'lms_course_name': decoded.get('https://purl.imsglobal.org/spec/lti/claim/context', {}).get('label'),
                'role': self._map_lti_role(decoded.get('https://purl.imsglobal.org/spec/lti/claim/roles', []))
            }

            return user_data

        except jwt.ExpiredSignatureError:
            current_app.logger.error("LTI token expired")
            return None
        except jwt.InvalidTokenError as e:
            current_app.logger.error(f"Invalid LTI token: {e}")
            return None
        except Exception as e:
            current_app.logger.error(f"LTI validation error: {e}")
            return None

    def _fetch_jwks(self, jwks_url):
        """
        Fetch JSON Web Key Set from platform

        Args:
            jwks_url: URL to platform's JWKS endpoint

        Returns:
            JWKS data or None if fetch failed
        """
        try:
            response = requests.get(jwks_url, timeout=5)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            current_app.logger.error(f"Failed to fetch JWKS: {e}")
            return None

    def _validate_claims(self, decoded):
        """
        Validate required LTI 1.3 claims

        Args:
            decoded: Decoded JWT payload

        Returns:
            Boolean indicating if claims are valid
        """
        required_claims = [
            'sub',  # User ID
            'iss',  # Issuer (platform)
            'aud',  # Audience (client ID)
            'exp',  # Expiration
            'iat',  # Issued at
            'nonce'  # Nonce for replay protection
        ]

        for claim in required_claims:
            if claim not in decoded:
                return False

        # Validate message type
        message_type = decoded.get('https://purl.imsglobal.org/spec/lti/claim/message_type')
        if message_type != 'LtiResourceLinkRequest':
            return False

        return True

    def _map_lti_role(self, roles):
        """
        Map LTI roles to Optio roles

        Args:
            roles: List of LTI role URIs

        Returns:
            Optio role string
        """
        role_mapping = {
            'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner': 'student',
            'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor': 'advisor',
            'http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant': 'advisor',
            'http://purl.imsglobal.org/vocab/lis/v2/membership#Administrator': 'admin'
        }

        for role in roles:
            if role in role_mapping:
                return role_mapping[role]

        # Default to student
        return 'student'

    def create_or_update_user(self, user_data):
        """
        Create or update user from LMS data

        Args:
            user_data: Dict with user information from LTI launch

        Returns:
            User object or None if creation failed
        """
        try:
            supabase = get_supabase_admin_client()

            # Check if user already exists by LMS user ID
            existing_user = supabase.table('users').select('*').eq(
                'lms_user_id', user_data['lms_user_id']
            ).execute()

            if existing_user.data:
                # Update existing user
                user_id = existing_user.data[0]['id']
                supabase.table('users').update({
                    'lms_platform': user_data['lms_platform'],
                    'last_active': 'now()'
                }).eq('id', user_id).execute()

                return existing_user.data[0]
            else:
                # Create new user
                # Split name into first and last
                name_parts = user_data['name'].split(' ', 1)
                first_name = name_parts[0] if name_parts else 'Student'
                last_name = name_parts[1] if len(name_parts) > 1 else ''

                new_user_data = {
                    'email': user_data['email'],
                    'first_name': first_name,
                    'last_name': last_name,
                    'lms_user_id': user_data['lms_user_id'],
                    'lms_platform': user_data['lms_platform'],
                    'role': user_data.get('role', 'student'),
                    'sso_provider': 'lti_1_3',
                    'created_at': 'now()'
                }

                result = supabase.table('users').insert(new_user_data).execute()
                return result.data[0] if result.data else None

        except Exception as e:
            current_app.logger.error(f"Error creating/updating LMS user: {e}")
            return None

    def generate_deep_link(self, quest_id, platform='canvas'):
        """
        Generate LTI deep link to specific quest

        Args:
            quest_id: Quest UUID
            platform: Platform identifier

        Returns:
            Deep link URL
        """
        frontend_url = current_app.config.get('FRONTEND_URL', 'https://www.optioeducation.com')
        return f"{frontend_url}/lti/quest/{quest_id}"

    def send_grade(self, user_id, quest_id, score, max_score=100, platform='canvas'):
        """
        Send grade back to LMS gradebook via LTI Assignment and Grade Services (AGS)

        Args:
            user_id: Optio user ID
            quest_id: Quest ID
            score: Score value
            max_score: Maximum possible score (default 100)
            platform: Platform identifier

        Returns:
            Boolean indicating success
        """
        try:
            supabase = get_supabase_admin_client()

            # Get LMS integration info
            integration = supabase.table('lms_integrations').select('*').eq(
                'user_id', user_id
            ).eq('lms_platform', platform).single().execute()

            if not integration.data:
                current_app.logger.error(f"No LMS integration found for user {user_id}")
                return False

            # Queue grade sync for async processing
            supabase.table('lms_grade_sync').insert({
                'user_id': user_id,
                'quest_id': quest_id,
                'lms_platform': platform,
                'lms_assignment_id': integration.data.get('lms_assignment_id'),
                'score': score,
                'max_score': max_score,
                'sync_status': 'pending',
                'created_at': 'now()'
            }).execute()

            return True

        except Exception as e:
            current_app.logger.error(f"Error queueing grade sync: {e}")
            return False
