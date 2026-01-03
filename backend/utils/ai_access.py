"""
AI Access Control Utilities

Provides functions to check if a user has access to AI features.
Checks both user-level toggle (for dependents) and organization-level toggle.
Supports granular feature-level checks for chatbot, lesson helper, and task generation.
"""

from flask import jsonify
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

# Valid feature names for granular control
VALID_FEATURES = {'chatbot', 'lesson_helper', 'task_generation'}


def check_ai_access(user_id: str, feature: str = None):
    """
    Check if a user has access to AI features.

    Checks two levels:
    1. User-level: If user is a dependent, checks ai_features_enabled flag
    2. Org-level: Checks if the user's organization has AI features enabled
    3. Feature-level (optional): Checks specific feature toggle

    Args:
        user_id: The user's ID
        feature: Optional feature name ('chatbot', 'lesson_helper', 'task_generation')
                 If None, only checks master toggle

    Returns:
        tuple: (has_access: bool, error_response: dict or None, status_code: int or None)
               If has_access is True, error_response and status_code are None.
               If has_access is False, returns the error response to send.
    """
    try:
        supabase = get_supabase_admin_client()

        # Build user select query with granular feature fields
        user_fields = 'id, is_dependent, ai_features_enabled, organization_id'
        if feature:
            # Add feature-specific fields
            user_fields += ', ai_chatbot_enabled, ai_lesson_helper_enabled, ai_task_generation_enabled'

        # Get user with org info
        user_result = supabase.table('users').select(
            user_fields
        ).eq('id', user_id).single().execute()

        if not user_result.data:
            return False, {'error': 'User not found'}, 404

        user = user_result.data

        # Check user-level master toggle (for dependents)
        if user.get('is_dependent') and not user.get('ai_features_enabled'):
            logger.info(f"AI access denied for dependent {user_id}: ai_features_enabled=False")
            return False, {
                'error': 'ai_disabled',
                'message': 'AI features are not enabled for your account. Ask your parent to enable them in their dashboard.',
                'code': 'DEPENDENT_AI_DISABLED'
            }, 403

        # Check org-level master toggle
        org_id = user.get('organization_id')
        org_data = None
        if org_id:
            org_fields = 'id, ai_features_enabled'
            if feature:
                org_fields += ', ai_chatbot_enabled, ai_lesson_helper_enabled, ai_task_generation_enabled'

            org_result = supabase.table('organizations').select(
                org_fields
            ).eq('id', org_id).single().execute()

            if org_result.data:
                org_data = org_result.data
                if not org_data.get('ai_features_enabled', True):
                    logger.info(f"AI access denied for user {user_id}: org {org_id} has AI disabled")
                    return False, {
                        'error': 'ai_disabled_org',
                        'message': 'AI features are disabled for your organization.',
                        'code': 'ORG_AI_DISABLED'
                    }, 403

        # Check feature-specific toggle if requested
        if feature and feature in VALID_FEATURES:
            feature_column = f'ai_{feature}_enabled'

            # Check org-level feature toggle (sets ceiling)
            if org_data:
                org_feature_enabled = org_data.get(feature_column, True)
                if not org_feature_enabled:
                    logger.info(f"AI feature '{feature}' denied for user {user_id}: org has {feature_column}=False")
                    return False, {
                        'error': 'ai_feature_disabled_org',
                        'message': f'This AI feature is disabled for your organization.',
                        'code': 'ORG_AI_FEATURE_DISABLED',
                        'feature': feature
                    }, 403

            # Check user-level feature toggle (for dependents only)
            if user.get('is_dependent'):
                user_feature_enabled = user.get(feature_column, True)
                if not user_feature_enabled:
                    logger.info(f"AI feature '{feature}' denied for dependent {user_id}: {feature_column}=False")
                    return False, {
                        'error': 'ai_feature_disabled',
                        'message': f'This AI feature is not enabled for your account.',
                        'code': 'DEPENDENT_AI_FEATURE_DISABLED',
                        'feature': feature
                    }, 403

        # Access granted
        return True, None, None

    except Exception as e:
        logger.error(f"Error checking AI access for user {user_id}: {e}")
        # On error, allow access to avoid blocking users due to a bug
        return True, None, None


def require_ai_access(user_id: str, feature: str = None):
    """
    Check AI access and return error response if denied.

    This is a convenience wrapper around check_ai_access that
    returns a Flask response if access is denied.

    Args:
        user_id: The user's ID
        feature: Optional feature name ('chatbot', 'lesson_helper', 'task_generation')

    Returns:
        Flask response if access denied, None if access granted
    """
    has_access, error_data, status_code = check_ai_access(user_id, feature)

    if not has_access:
        return jsonify(error_data), status_code

    return None


def get_ai_feature_status(user_id: str):
    """
    Get the full AI access status for a user including all feature toggles.

    Returns a dict with:
    - has_access: bool (master toggle)
    - features: dict of feature_name -> enabled
    - org_limits: dict of feature_name -> enabled (what org allows)
    - reason: str (if access denied)
    - code: str (if access denied)

    Args:
        user_id: The user's ID

    Returns:
        dict with AI access status
    """
    try:
        supabase = get_supabase_admin_client()

        # Get user with all AI settings
        user_result = supabase.table('users').select(
            'id, is_dependent, ai_features_enabled, organization_id, '
            'ai_chatbot_enabled, ai_lesson_helper_enabled, ai_task_generation_enabled'
        ).eq('id', user_id).single().execute()

        if not user_result.data:
            return {
                'has_access': False,
                'reason': 'User not found',
                'code': 'USER_NOT_FOUND',
                'features': {'chatbot': False, 'lesson_helper': False, 'task_generation': False},
                'org_limits': {'chatbot': True, 'lesson_helper': True, 'task_generation': True}
            }

        user = user_result.data

        # Initialize defaults
        org_limits = {'chatbot': True, 'lesson_helper': True, 'task_generation': True}
        result = {
            'has_access': True,
            'reason': None,
            'code': None,
            'features': {'chatbot': True, 'lesson_helper': True, 'task_generation': True},
            'org_limits': org_limits
        }

        # Check master toggle for dependents
        if user.get('is_dependent') and not user.get('ai_features_enabled'):
            return {
                'has_access': False,
                'reason': 'AI features are not enabled for your account. Ask your parent to enable them in their dashboard.',
                'code': 'DEPENDENT_AI_DISABLED',
                'features': {'chatbot': False, 'lesson_helper': False, 'task_generation': False},
                'org_limits': org_limits
            }

        # Get org settings
        org_id = user.get('organization_id')
        if org_id:
            org_result = supabase.table('organizations').select(
                'id, ai_features_enabled, ai_chatbot_enabled, ai_lesson_helper_enabled, ai_task_generation_enabled'
            ).eq('id', org_id).single().execute()

            if org_result.data:
                org = org_result.data

                # Check org master toggle
                if not org.get('ai_features_enabled', True):
                    return {
                        'has_access': False,
                        'reason': 'AI features are disabled for your organization.',
                        'code': 'ORG_AI_DISABLED',
                        'features': {'chatbot': False, 'lesson_helper': False, 'task_generation': False},
                        'org_limits': {'chatbot': False, 'lesson_helper': False, 'task_generation': False}
                    }

                # Get org feature limits
                org_limits = {
                    'chatbot': org.get('ai_chatbot_enabled', True),
                    'lesson_helper': org.get('ai_lesson_helper_enabled', True),
                    'task_generation': org.get('ai_task_generation_enabled', True)
                }
                result['org_limits'] = org_limits

        # Calculate effective feature access (org AND user)
        user_features = {
            'chatbot': user.get('ai_chatbot_enabled', True),
            'lesson_helper': user.get('ai_lesson_helper_enabled', True),
            'task_generation': user.get('ai_task_generation_enabled', True)
        }

        # Effective = org limit AND user setting
        result['features'] = {
            'chatbot': org_limits['chatbot'] and user_features['chatbot'],
            'lesson_helper': org_limits['lesson_helper'] and user_features['lesson_helper'],
            'task_generation': org_limits['task_generation'] and user_features['task_generation']
        }

        return result

    except Exception as e:
        logger.error(f"Error getting AI feature status for user {user_id}: {e}")
        # On error, return access granted
        return {
            'has_access': True,
            'features': {'chatbot': True, 'lesson_helper': True, 'task_generation': True},
            'org_limits': {'chatbot': True, 'lesson_helper': True, 'task_generation': True}
        }
