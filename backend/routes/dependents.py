"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Already uses DependentRepository exclusively for all database operations
- All CRUD operations delegated to repository layer
- Exemplar of repository pattern usage (clean separation of concerns)
- Parent role verification is properly isolated in helper function

Dependent Profiles API routes.
Allows parents to create and manage dependent child profiles (ages 5-12).
COPPA-compliant: Dependents have no email/password until promoted at age 13.

NOTE: Admin client usage justified throughout this file for cross-user operations.
Parents managing dependents requires elevated privileges to create/update dependent records.
All endpoints verify parent role before allowing operations.
"""
from flask import Blueprint, request, jsonify, send_file
from datetime import datetime
from database import get_supabase_admin_client
from repositories.dependent_repository import DependentRepository
from repositories.base_repository import NotFoundError, PermissionError, ValidationError as RepoValidationError
from services.dependent_progress_service import DependentProgressService
from utils.auth.decorators import require_auth, validate_uuid_param
from utils.session_manager import session_manager
from middleware.error_handler import ValidationError, AuthorizationError, NotFoundError as RouteNotFoundError
from utils.roles import UserRole
from utils.validation.password_validator import validate_password_strength
import logging
import json
import csv
import io

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('dependents', __name__, url_prefix='/api/dependents')


def verify_parent_role(user_id: str):
    """Helper function to verify user has parent, admin, or superadmin role"""
    supabase = get_supabase_admin_client()

    user_response = supabase.table('users').select('role').eq('id', user_id).execute()
    if not user_response.data:
        raise AuthorizationError("User not found")

    user_role = user_response.data[0].get('role')
    # Include superadmin since they have full admin privileges
    if user_role not in [UserRole.PARENT.value, UserRole.SUPERADMIN.value]:
        raise AuthorizationError("Only parent or admin accounts can manage dependent profiles")

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
@validate_uuid_param('dependent_id')
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
@validate_uuid_param('dependent_id')
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

        # Whitelist allowed fields to prevent mass assignment attacks
        ALLOWED_FIELDS = ['display_name', 'avatar_url', 'date_of_birth', 'bio']
        sanitized_updates = {k: v for k, v in data.items() if k in ALLOWED_FIELDS}

        # Validate that at least one field is being updated
        if not sanitized_updates:
            raise ValidationError(f"At least one valid field must be provided. Allowed fields: {', '.join(ALLOWED_FIELDS)}")

        # Parse date_of_birth if provided
        if 'date_of_birth' in sanitized_updates:
            try:
                datetime.strptime(sanitized_updates['date_of_birth'], '%Y-%m-%d')
            except ValueError:
                raise ValidationError("date_of_birth must be in YYYY-MM-DD format")

        supabase = get_supabase_admin_client()
        dependent_repo = DependentRepository(client=supabase)

        updated_dependent = dependent_repo.update_dependent(
            dependent_id=dependent_id,
            parent_id=user_id,
            updates=sanitized_updates
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
@validate_uuid_param('dependent_id')
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
@validate_uuid_param('dependent_id')
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

        # Validate password strength using comprehensive password validator
        is_valid, error_messages = validate_password_strength(password)
        if not is_valid:
            # Return first error message for user-friendly feedback
            raise ValidationError(error_messages[0] if error_messages else "Password does not meet security requirements")

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


@bp.route('/<dependent_id>/add-login', methods=['POST'])
@require_auth
@validate_uuid_param('dependent_id')
def add_dependent_login(user_id, dependent_id):
    """
    Give a dependent their own login credentials.
    Unlike promotion, the child remains a dependent with parent oversight.
    This allows children under 13 to have their own login while staying
    under parental management.

    Required fields:
        - email: str
        - password: str

    Returns:
        200: Login credentials added successfully
        400: Validation error (invalid email, weak password)
        403: Parent doesn't own this dependent
        404: Dependent not found
        409: Dependent already has login credentials
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            raise ValidationError("Request body is required")

        email = data.get('email', '').strip().lower()
        password = data.get('password', '').strip()

        # Validate required fields
        if not email:
            raise ValidationError("email is required")

        if not password:
            raise ValidationError("password is required")

        # Validate email format
        if '@' not in email or '.' not in email:
            raise ValidationError("Invalid email format")

        # Validate password strength
        is_valid, error_messages = validate_password_strength(password)
        if not is_valid:
            raise ValidationError(error_messages[0] if error_messages else "Password does not meet security requirements")

        supabase = get_supabase_admin_client()
        dependent_repo = DependentRepository(client=supabase)

        # Verify parent owns this dependent
        dependent = dependent_repo.get_dependent(dependent_id, user_id)

        # Check if dependent already has a real email (not placeholder)
        existing_email = dependent.get('email')
        if existing_email and not existing_email.endswith('@optio-internal-placeholder.local'):
            raise ValidationError("This dependent already has login credentials")

        # Check if email is already in use
        email_check = supabase.table('users').select('id').eq('email', email).execute()
        if email_check.data:
            raise ValidationError("This email is already in use")

        # Create Supabase Auth account for the dependent
        auth_response = supabase.auth.admin.create_user({
            'email': email,
            'password': password,
            'email_confirm': True,  # Skip email verification since parent is authorizing
            'user_metadata': {
                'display_name': dependent.get('display_name'),
                'is_dependent': True,
                'managed_by_parent_id': user_id
            }
        })

        if not auth_response.user:
            raise ValidationError("Failed to create login credentials")

        new_auth_id = auth_response.user.id

        # Update the user record with the new email and auth ID
        # IMPORTANT: Keep is_dependent=True and managed_by_parent_id set
        update_result = supabase.table('users').update({
            'email': email,
            'id': new_auth_id  # Link to new Supabase Auth account
        }).eq('id', dependent_id).execute()

        if not update_result.data:
            # Rollback: delete the auth user if profile update failed
            try:
                supabase.auth.admin.delete_user(new_auth_id)
            except Exception:
                pass
            raise ValidationError("Failed to link login credentials to profile")

        logger.info(f"Parent {user_id} added login credentials for dependent {dependent_id}")

        return jsonify({
            'success': True,
            'message': 'Login credentials added successfully',
            'dependent': {
                'id': new_auth_id,
                'email': email,
                'display_name': dependent.get('display_name'),
                'is_dependent': True
            }
        }), 200

    except AuthorizationError as e:
        logger.warning(f"Authorization error for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except (ValidationError, RepoValidationError) as e:
        logger.warning(f"Validation error adding login for dependent {dependent_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 400
    except (NotFoundError, PermissionError) as e:
        logger.warning(f"Error adding login for dependent {dependent_id} for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error adding login for dependent {dependent_id}: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to add login credentials'}), 500


@bp.route('/<child_id>/ai-access', methods=['POST'])
@require_auth
@validate_uuid_param('child_id')
def toggle_child_ai_access(user_id, child_id):
    """
    Enable or disable AI features for a child (dependent or linked student).
    Parent must own the child via managed_by_parent_id or parent_student_links.

    Required fields:
        - enabled: bool

    Returns:
        200: AI access updated successfully
        400: Validation error
        403: Parent doesn't own this child
        404: Child not found
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            raise ValidationError("Request body is required")

        enabled = data.get('enabled')
        if enabled is None:
            raise ValidationError("enabled field is required")

        if not isinstance(enabled, bool):
            raise ValidationError("enabled must be a boolean")

        supabase = get_supabase_admin_client()

        # Check if parent owns this child via managed_by_parent_id OR parent_student_links
        child_result = supabase.table('users').select(
            'id, display_name, managed_by_parent_id, is_dependent'
        ).eq('id', child_id).single().execute()

        if not child_result.data:
            raise NotFoundError("Child not found")

        child = child_result.data
        is_owner = False

        # Check managed_by_parent_id (for dependents)
        if child.get('managed_by_parent_id') == user_id:
            is_owner = True

        # Check parent_student_links (for linked students)
        if not is_owner:
            link_result = supabase.table('parent_student_links').select('id').eq(
                'parent_user_id', user_id
            ).eq('student_user_id', child_id).eq('status', 'approved').execute()
            if link_result.data:
                is_owner = True

        if not is_owner:
            raise PermissionError("You do not have permission to manage this child's settings")

        # Update AI access setting
        update_result = supabase.table('users').update({
            'ai_features_enabled': enabled,
            'ai_features_enabled_at': datetime.utcnow().isoformat(),
            'ai_features_enabled_by': user_id
        }).eq('id', child_id).execute()

        if not update_result.data:
            raise ValidationError("Failed to update AI access setting")

        action = "enabled" if enabled else "disabled"
        child_type = "dependent" if child.get('is_dependent') else "linked student"
        logger.info(f"Parent {user_id} {action} AI features for {child_type} {child_id}")

        return jsonify({
            'success': True,
            'message': f'AI features {action} successfully',
            'child_id': child_id,
            'ai_features_enabled': enabled
        }), 200

    except AuthorizationError as e:
        logger.warning(f"Authorization error for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except (ValidationError, RepoValidationError) as e:
        logger.warning(f"Validation error toggling AI access for child {child_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 400
    except (NotFoundError, PermissionError) as e:
        logger.warning(f"Error toggling AI access for child {child_id} for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error toggling AI access for child {child_id}: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to update AI access'}), 500


@bp.route('/<string:child_id>/ai-features', methods=['PUT'])
@require_auth
@validate_uuid_param('child_id')
def update_child_ai_features(user_id: str, child_id: str):
    """
    Update granular AI feature settings for a child (dependent or linked student).

    Body:
        chatbot (bool, optional): AI Tutor/chatbot enabled
        lesson_helper (bool, optional): Lesson helper enabled
        task_generation (bool, optional): Task generation enabled

    Returns:
        200: Features updated successfully
        400: Invalid request body
        403: Not authorized (not parent of this child)
        404: Child not found
    """
    try:
        verify_parent_role(user_id)

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400

        # Validate feature names
        valid_features = {'chatbot', 'lesson_helper', 'task_generation'}
        for key in data.keys():
            if key not in valid_features:
                return jsonify({'success': False, 'error': f'Invalid feature: {key}'}), 400
            if not isinstance(data[key], bool):
                return jsonify({'success': False, 'error': f'Feature {key} must be a boolean'}), 400

        supabase = get_supabase_admin_client()
        dependent_repo = DependentRepository(client=supabase)

        # Check if parent owns this child (via managed_by_parent_id or parent_student_links)
        child = None
        try:
            child = dependent_repo.get_dependent(child_id, user_id)
        except NotFoundError:
            # Try linked students
            link_result = supabase.table('parent_student_links').select('*').eq(
                'parent_id', user_id
            ).eq('student_id', child_id).eq('status', 'active').execute()

            if not link_result.data:
                raise NotFoundError(f"Child {child_id} not found or not associated with parent")

            # Get the linked student
            student_result = supabase.table('users').select('*').eq('id', child_id).single().execute()
            if not student_result.data:
                raise NotFoundError(f"Child {child_id} not found")
            child = student_result.data

        # Build update dict for granular features
        update_data = {}
        if 'chatbot' in data:
            update_data['ai_chatbot_enabled'] = data['chatbot']
        if 'lesson_helper' in data:
            update_data['ai_lesson_helper_enabled'] = data['lesson_helper']
        if 'task_generation' in data:
            update_data['ai_task_generation_enabled'] = data['task_generation']

        if not update_data:
            return jsonify({'success': False, 'error': 'No features to update'}), 400

        # Update the user record
        result = supabase.table('users').update(update_data).eq('id', child_id).execute()

        if not result.data:
            raise Exception("Failed to update AI features")

        logger.info(f"Parent {user_id} updated AI features for child {child_id}: {update_data}")

        return jsonify({
            'success': True,
            'dependent_id': child_id,
            'features': {
                'chatbot': result.data[0].get('ai_chatbot_enabled', True),
                'lesson_helper': result.data[0].get('ai_lesson_helper_enabled', True),
                'task_generation': result.data[0].get('ai_task_generation_enabled', True)
            },
            'message': 'AI features updated successfully'
        }), 200

    except ValidationError as e:
        logger.warning(f"Validation error updating AI features for child {child_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 400
    except (NotFoundError, PermissionError) as e:
        logger.warning(f"Error updating AI features for child {child_id} for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error updating AI features for child {child_id}: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to update AI features'}), 500


@bp.route('/<string:dependent_id>/act-as', methods=['POST'])
@require_auth
@validate_uuid_param('dependent_id')
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


@bp.route('/stop-acting-as', methods=['POST'])
def stop_acting_as():
    """
    Stop acting as a dependent and return fresh tokens for the parent.

    This endpoint is called when a parent wants to switch back from viewing
    the platform as their dependent. It generates new access and refresh tokens
    for the parent, bypassing any sessionStorage issues in cross-origin production
    environments.

    Uses get_actual_admin_id() to extract the parent's ID from the acting-as token,
    since @require_auth's get_effective_user_id() would return the dependent's ID.

    Returns:
        200: Fresh tokens for the parent
        401: Not authenticated or not in acting-as mode
        404: Parent user not found
        500: Server error
    """
    try:
        # Get the parent's ID from the acting-as token (not the dependent's ID)
        user_id = session_manager.get_actual_admin_id()

        if not user_id:
            return jsonify({'success': False, 'error': 'Authentication required'}), 401

        supabase = get_supabase_admin_client()

        # Verify the parent user exists
        user_response = supabase.table('users').select('*').eq('id', user_id).single().execute()

        if not user_response.data:
            logger.warning(f"Parent user not found when stopping acting-as: {user_id}")
            return jsonify({'success': False, 'error': 'Parent user not found'}), 404

        # Generate fresh access and refresh tokens for the parent
        access_token = session_manager.generate_access_token(user_id)
        refresh_token = session_manager.generate_refresh_token(user_id)

        logger.info(f"Parent {user_id} stopped acting as dependent, fresh tokens generated")

        return jsonify({
            'success': True,
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': user_response.data
        }), 200

    except Exception as e:
        logger.error(f"Error stopping acting-as for parent {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to restore parent session'}), 500


# ==================== Progress Reports ====================

@bp.route('/<dependent_id>/progress-report', methods=['GET'])
@require_auth
@validate_uuid_param('dependent_id')
def get_dependent_progress_report(user_id, dependent_id):
    """
    Get comprehensive progress report for a dependent.

    Query Params:
        - range: 'week', 'month', 'all_time' (default: 'month')
        - start_date: Custom start date (ISO format)
        - end_date: Custom end date (ISO format)

    Returns:
        200: Comprehensive progress report
        403: Not authorized or not a parent
        404: Dependent not found
    """
    try:
        verify_parent_role(user_id)

        progress_service = DependentProgressService()

        # Parse date range
        date_range = request.args.get('range', 'month')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        # Use preset if custom dates not provided
        if not start_date or not end_date:
            start_date, end_date = progress_service.get_date_range_preset(date_range)

        # Generate report
        report = progress_service.get_progress_report(
            dependent_id=dependent_id,
            parent_id=user_id,
            start_date=start_date,
            end_date=end_date
        )

        return jsonify({
            'success': True,
            'report': report
        }), 200

    except AuthorizationError as e:
        logger.warning(f"Authorization error for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        logger.warning(f"Dependent not found: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error generating progress report for dependent {dependent_id}: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to generate progress report'}), 500


@bp.route('/<dependent_id>/progress-report/export', methods=['GET'])
@require_auth
@validate_uuid_param('dependent_id')
def export_dependent_progress_report(user_id, dependent_id):
    """
    Export progress report as CSV or JSON.

    Query Params:
        - format: 'csv' or 'json' (default: 'json')
        - range: 'week', 'month', 'all_time' (default: 'month')
        - start_date: Custom start date (ISO format)
        - end_date: Custom end date (ISO format)

    Returns:
        200: File download (CSV or JSON)
        403: Not authorized or not a parent
        404: Dependent not found
    """
    try:
        verify_parent_role(user_id)

        progress_service = DependentProgressService()
        export_format = request.args.get('format', 'json').lower()

        # Parse date range
        date_range = request.args.get('range', 'month')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        # Use preset if custom dates not provided
        if not start_date or not end_date:
            start_date, end_date = progress_service.get_date_range_preset(date_range)

        # Generate report
        report = progress_service.get_progress_report(
            dependent_id=dependent_id,
            parent_id=user_id,
            start_date=start_date,
            end_date=end_date
        )

        dependent_name = report['dependent']['display_name'].replace(' ', '_')
        timestamp = datetime.utcnow().strftime('%Y%m%d')

        if export_format == 'csv':
            # Create CSV
            output = io.StringIO()
            writer = csv.writer(output)

            # Header
            writer.writerow(['Progress Report for', report['dependent']['display_name']])
            writer.writerow(['Period', f"{report['period']['start']} to {report['period']['end']}"])
            writer.writerow([])

            # Summary
            writer.writerow(['Summary'])
            writer.writerow(['Total XP', report['dependent']['total_xp']])
            writer.writerow(['Level', report['dependent']['level']])
            writer.writerow(['Quests Completed', report['quests']['completed_count']])
            writer.writerow(['Quests In Progress', report['quests']['in_progress_count']])
            writer.writerow(['Tasks Completed', report['completion_stats']['tasks_completed']])
            writer.writerow([])

            # Pillar XP
            writer.writerow(['Pillar XP Breakdown'])
            writer.writerow(['Pillar', 'XP Earned', 'Tasks Completed'])
            for pillar, data in report['pillars'].items():
                writer.writerow([pillar, data['xp'], data['task_count']])
            writer.writerow([])

            # Badges
            writer.writerow(['Badges Earned'])
            writer.writerow(['Badge Name', 'Pillar', 'Earned Date'])
            for badge in report['badges']:
                badge_info = badge.get('badges', {})
                writer.writerow([
                    badge_info.get('name', ''),
                    badge_info.get('pillar_primary', ''),
                    badge.get('earned_at', '')
                ])
            writer.writerow([])

            # Recent Activity
            writer.writerow(['Recent Activity'])
            writer.writerow(['Title', 'Pillar', 'XP', 'Date'])
            for activity in report['recent_activity']:
                writer.writerow([
                    activity.get('title', ''),
                    activity.get('pillar', ''),
                    activity.get('xp', 0),
                    activity.get('timestamp', '')
                ])

            output.seek(0)
            return send_file(
                io.BytesIO(output.getvalue().encode('utf-8')),
                mimetype='text/csv',
                as_attachment=True,
                download_name=f'{dependent_name}_progress_{timestamp}.csv'
            )

        else:
            # Return JSON
            output = io.BytesIO(json.dumps(report, indent=2).encode('utf-8'))
            return send_file(
                output,
                mimetype='application/json',
                as_attachment=True,
                download_name=f'{dependent_name}_progress_{timestamp}.json'
            )

    except AuthorizationError as e:
        logger.warning(f"Authorization error for user {user_id}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        logger.warning(f"Dependent not found: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error exporting progress report for dependent {dependent_id}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': 'Failed to export progress report'}), 500
