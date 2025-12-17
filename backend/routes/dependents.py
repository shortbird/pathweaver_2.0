"""
Dependent Profiles API routes.
Allows parents to create and manage dependent child profiles (ages 5-12).
COPPA-compliant: Dependents have no email/password until promoted at age 13.

NOTE: Admin client usage justified throughout this file for cross-user operations.
Parents managing dependents requires elevated privileges to create/update dependent records.
All endpoints verify parent role before allowing operations.
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from database import get_supabase_admin_client
from backend.repositories.dependent_repository import DependentRepository
from backend.repositories.base_repository import NotFoundError, PermissionError, ValidationError as RepoValidationError
from utils.auth.decorators import require_auth
from utils.session_manager import session_manager
from middleware.error_handler import ValidationError, AuthorizationError, NotFoundError as RouteNotFoundError
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('dependents', __name__, url_prefix='/api/dependents')


def verify_parent_role(user_id: str):
    """Helper function to verify user has parent role"""
    supabase = get_supabase_admin_client()

    user_response = supabase.table('users').select('role').eq('id', user_id).execute()
    if not user_response.data or user_response.data[0].get('role') != 'parent':
        raise AuthorizationError("Only parent accounts can manage dependent profiles")

    return True


@bp.route('/my-dependents', methods=['GET'])
@require_auth
def get_my_dependents(user_id):
    """
    Get all dependent profiles for the logged-in parent.

    Returns:
        200: List of dependents with metadata
        403: User is not a parent
    """
    try:
        verify_parent_role(user_id)

        supabase = get_supabase_admin_client()
        dependent_repo = DependentRepository(client=supabase)

        dependents = dependent_repo.get_parent_dependents(user_id)

        return jsonify({
            'success': True,
            'dependents': dependents,
            'count': len(dependents)
        }), 200

    except AuthorizationError as e:
        logger.warning(f"Authorization error for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error fetching dependents for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch dependents'}), 500


@bp.route('/create', methods=['POST'])
@require_auth
def create_dependent(user_id):
    """
    Create a new dependent profile.

    Required fields:
        - display_name: str
        - date_of_birth: str (YYYY-MM-DD)

    Optional fields:
        - avatar_url: str

    Returns:
        201: Created dependent profile
        400: Validation error (age > 13, missing fields)
        403: User is not a parent
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            raise ValidationError("Request body is required")

        display_name = data.get('display_name', '').strip()
        date_of_birth_str = data.get('date_of_birth', '').strip()
        avatar_url = data.get('avatar_url')

        # Validate required fields
        if not display_name:
            raise ValidationError("display_name is required")

        if not date_of_birth_str:
            raise ValidationError("date_of_birth is required")

        # Parse date of birth
        try:
            date_of_birth = datetime.strptime(date_of_birth_str, '%Y-%m-%d').date()
        except ValueError:
            raise ValidationError("date_of_birth must be in YYYY-MM-DD format")

        # Create dependent
        supabase = get_supabase_admin_client()
        dependent_repo = DependentRepository(client=supabase)

        dependent = dependent_repo.create_dependent(
            parent_id=user_id,
            display_name=display_name,
            date_of_birth=date_of_birth,
            avatar_url=avatar_url
        )

        logger.info(f"Parent {user_id} created dependent {dependent['id']}")

        return jsonify({
            'success': True,
            'dependent': dependent,
            'message': f'Dependent profile created for {display_name}'
        }), 201

    except AuthorizationError as e:
        logger.warning(f"Authorization error for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except (ValidationError, RepoValidationError) as e:
        logger.warning(f"Validation error creating dependent for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating dependent for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to create dependent profile'}), 500


@bp.route('/<dependent_id>', methods=['GET'])
@require_auth
def get_dependent(user_id, dependent_id):
    """
    Get a specific dependent profile.

    Returns:
        200: Dependent profile
        403: Parent doesn't own this dependent
        404: Dependent not found
    """
    try:
        verify_parent_role(user_id)

        supabase = get_supabase_admin_client()
        dependent_repo = DependentRepository(client=supabase)

        dependent = dependent_repo.get_dependent(dependent_id, user_id)

        return jsonify({
            'success': True,
            'dependent': dependent
        }), 200

    except AuthorizationError as e:
        logger.warning(f"Authorization error for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except (NotFoundError, PermissionError) as e:
        logger.warning(f"Error fetching dependent {dependent_id} for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error fetching dependent {dependent_id}: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch dependent'}), 500


@bp.route('/<dependent_id>', methods=['PUT'])
@require_auth
def update_dependent(user_id, dependent_id):
    """
    Update a dependent profile.

    Allowed fields:
        - display_name: str
        - avatar_url: str
        - date_of_birth: str (YYYY-MM-DD)
        - bio: str

    Returns:
        200: Updated dependent profile
        400: Validation error
        403: Parent doesn't own this dependent
        404: Dependent not found
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            raise ValidationError("Request body is required")

        # Parse date_of_birth if provided
        if 'date_of_birth' in data:
            try:
                datetime.strptime(data['date_of_birth'], '%Y-%m-%d')
            except ValueError:
                raise ValidationError("date_of_birth must be in YYYY-MM-DD format")

        supabase = get_supabase_admin_client()
        dependent_repo = DependentRepository(client=supabase)

        updated_dependent = dependent_repo.update_dependent(
            dependent_id=dependent_id,
            parent_id=user_id,
            updates=data
        )

        logger.info(f"Parent {user_id} updated dependent {dependent_id}")

        return jsonify({
            'success': True,
            'dependent': updated_dependent,
            'message': 'Dependent profile updated'
        }), 200

    except AuthorizationError as e:
        logger.warning(f"Authorization error for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except (ValidationError, RepoValidationError) as e:
        logger.warning(f"Validation error updating dependent {dependent_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 400
    except (NotFoundError, PermissionError) as e:
        logger.warning(f"Error updating dependent {dependent_id} for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error updating dependent {dependent_id}: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to update dependent'}), 500


@bp.route('/<dependent_id>', methods=['DELETE'])
@require_auth
def delete_dependent(user_id, dependent_id):
    """
    Delete a dependent profile.

    CAUTION: This will delete the dependent account and all associated data
    (quests, tasks, evidence, XP, etc.)

    Returns:
        200: Dependent deleted successfully
        403: Parent doesn't own this dependent
        404: Dependent not found
    """
    try:
        verify_parent_role(user_id)

        supabase = get_supabase_admin_client()
        dependent_repo = DependentRepository(client=supabase)

        dependent_repo.delete_dependent(dependent_id, user_id)

        logger.info(f"Parent {user_id} deleted dependent {dependent_id}")

        return jsonify({
            'success': True,
            'message': 'Dependent profile deleted'
        }), 200

    except AuthorizationError as e:
        logger.warning(f"Authorization error for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except (NotFoundError, PermissionError) as e:
        logger.warning(f"Error deleting dependent {dependent_id} for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error deleting dependent {dependent_id}: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to delete dependent'}), 500


@bp.route('/<dependent_id>/promote', methods=['POST'])
@require_auth
def promote_dependent(user_id, dependent_id):
    """
    Promote a dependent to an independent account (when they turn 13).

    Required fields:
        - email: str
        - password: str

    Returns:
        200: Dependent promoted successfully
        400: Validation error (not eligible, weak password)
        403: Parent doesn't own this dependent
        404: Dependent not found
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            raise ValidationError("Request body is required")

        email = data.get('email', '').strip()
        password = data.get('password', '').strip()

        # Validate required fields
        if not email:
            raise ValidationError("email is required")

        if not password:
            raise ValidationError("password is required")

        # Validate email format
        if '@' not in email or '.' not in email:
            raise ValidationError("Invalid email format")

        # Validate password strength (minimum 12 characters per CLAUDE.md)
        if len(password) < 12:
            raise ValidationError("Password must be at least 12 characters long")

        supabase = get_supabase_admin_client()
        dependent_repo = DependentRepository(client=supabase)

        promoted_user = dependent_repo.promote_dependent_to_independent(
            dependent_id=dependent_id,
            parent_id=user_id,
            email=email,
            password=password
        )

        logger.info(f"Parent {user_id} promoted dependent {dependent_id} to independent account")

        return jsonify({
            'success': True,
            'user': promoted_user,
            'message': 'Dependent successfully promoted to independent account'
        }), 200

    except AuthorizationError as e:
        logger.warning(f"Authorization error for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except (ValidationError, RepoValidationError) as e:
        logger.warning(f"Validation error promoting dependent {dependent_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 400
    except (NotFoundError, PermissionError) as e:
        logger.warning(f"Error promoting dependent {dependent_id} for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error promoting dependent {dependent_id}: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to promote dependent'}), 500


@bp.route('/<string:dependent_id>/act-as', methods=['POST'])
@require_auth
def generate_acting_as_token(user_id, dependent_id):
    """
    Generate an acting-as token for a parent to act as their dependent.
    This allows the parent to use the platform as if they were the dependent,
    similar to admin masquerade functionality.

    Returns:
        200: Token generated successfully with acting_as_token
        403: User is not a parent or doesn't own this dependent
        404: Dependent not found
    """
    try:
        verify_parent_role(user_id)

        supabase = get_supabase_admin_client()
        dependent_repo = DependentRepository(client=supabase)

        # Verify that this dependent belongs to this parent
        # get_dependent() will raise NotFoundError or PermissionError if not valid
        dependent = dependent_repo.get_dependent(dependent_id, user_id)

        # Generate acting-as token (parent_id, dependent_id)
        acting_as_token = session_manager.generate_acting_as_token(user_id, dependent_id)

        logger.info(f"Parent {user_id} generated acting-as token for dependent {dependent_id}")

        return jsonify({
            'success': True,
            'acting_as_token': acting_as_token,
            'dependent_id': dependent_id,
            'dependent_display_name': dependent.get('display_name'),
            'message': f"Now acting as {dependent.get('display_name')}"
        }), 200

    except AuthorizationError as e:
        logger.warning(f"Authorization error for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except (NotFoundError, PermissionError) as e:
        logger.warning(f"Error accessing dependent {dependent_id} for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error generating acting-as token for dependent {dependent_id}: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to generate token'}), 500
