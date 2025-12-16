"""
Dependent Repository

Handles all database operations for dependent profiles (children under 13 managed by parent accounts).
Supports COPPA-compliant dependent profiles without email/password.
"""

from typing import List, Dict, Optional, Any
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from backend.repositories.base_repository import BaseRepository, NotFoundError, PermissionError, ValidationError
from utils.logger import get_logger

logger = get_logger(__name__)


class DependentRepository(BaseRepository):
    """Repository for dependent profile operations."""

    table_name = 'users'

    def __init__(self, client):
        """
        Initialize repository with Supabase client.

        Args:
            client: Supabase client (admin client for cross-user operations)
        """
        self.table_name = 'users'
        self._client = client
        self.user_id = None  # Not used for dependent operations

    @property
    def client(self):
        """Return the provided client."""
        return self._client

    def create_dependent(
        self,
        parent_id: str,
        display_name: str,
        date_of_birth: date,
        avatar_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new dependent profile for a parent.

        Args:
            parent_id: Parent user ID
            display_name: Display name for the dependent
            date_of_birth: Date of birth
            avatar_url: Optional avatar URL

        Returns:
            Created dependent user record

        Raises:
            ValidationError: If validation fails (age > 13, parent not valid, etc.)
            PermissionError: If parent doesn't have permission
        """
        # Validate parent exists and has parent role (get organization_id too)
        parent = self.client.table('users').select('id, role, organization_id, first_name, last_name').eq('id', parent_id).single().execute()
        if not parent.data:
            raise NotFoundError(f"Parent with ID {parent_id} not found")

        if parent.data.get('role') != 'parent':
            raise PermissionError(f"User {parent_id} is not a parent")

        # Validate age (must be under 13)
        age = self._calculate_age(date_of_birth)
        if age >= 13:
            raise ValidationError(
                f"Dependent must be under 13 years old. Child is {age} years old. "
                "Please create an independent account instead."
            )

        # Calculate promotion eligibility date (13th birthday)
        promotion_eligible_at = date_of_birth + relativedelta(years=13)

        # Inherit organization_id from parent
        parent_org_id = parent.data.get('organization_id')

        try:
            # Step 1: Create a stub auth account (COPPA-compliant, no login)
            # Use a placeholder email that can't be used for login
            import uuid
            import secrets

            # Generate unique placeholder email
            random_suffix = secrets.token_hex(16)
            placeholder_email = f"dependent_{random_suffix}@optio-internal-placeholder.local"

            # Create disabled auth account
            auth_response = self.client.auth.admin.create_user({
                'email': placeholder_email,
                'email_confirm': False,  # Don't send confirmation email
                'user_metadata': {
                    'is_dependent': True,
                    'managed_by_parent_id': parent_id,
                    'display_name': display_name,
                    'created_as_dependent': True
                },
                'app_metadata': {
                    'provider': 'dependent',
                    'providers': ['dependent']
                }
            })

            if not auth_response.user:
                raise ValidationError("Failed to create auth account for dependent")

            dependent_id = auth_response.user.id

            # Step 2: Create dependent user record in public.users
            dependent_data = {
                'id': dependent_id,
                'display_name': display_name,
                'date_of_birth': str(date_of_birth),
                'avatar_url': avatar_url,
                'is_dependent': True,
                'managed_by_parent_id': parent_id,
                'promotion_eligible_at': str(promotion_eligible_at),
                'role': 'student',
                'email': None,  # COPPA compliance - no visible email for dependents
                'organization_id': parent_org_id,  # Inherit from parent
                'total_xp': 0,
                'level': 1,
                'streak_days': 0,
                'first_name': display_name.split()[0] if display_name else 'Child',
                'last_name': ' '.join(display_name.split()[1:]) if len(display_name.split()) > 1 else ''
            }

            result = self.client.table('users').insert(dependent_data).execute()

            if not result.data:
                # Rollback: delete auth user if public.users insert fails
                try:
                    self.client.auth.admin.delete_user(dependent_id)
                except:
                    pass
                raise ValidationError("Failed to create dependent profile")

            logger.info(f"Created dependent profile {result.data[0]['id']} for parent {parent_id}")
            return result.data[0]

        except Exception as e:
            logger.error(f"Error creating dependent for parent {parent_id}: {e}")
            raise ValidationError(f"Failed to create dependent: {str(e)}")

    def get_parent_dependents(self, parent_id: str) -> List[Dict[str, Any]]:
        """
        Get all dependents for a parent.

        Args:
            parent_id: Parent user ID

        Returns:
            List of dependent profiles with metadata
        """
        try:
            # Use the database function for optimized query
            result = self.client.rpc('get_parent_dependents', {
                'p_parent_id': parent_id
            }).execute()

            dependents = result.data or []

            # Transform keys to match expected format
            formatted_dependents = []
            for dep in dependents:
                formatted_dependents.append({
                    'id': dep.get('dependent_id'),
                    'display_name': dep.get('dependent_name'),
                    'date_of_birth': dep.get('date_of_birth'),
                    'avatar_url': dep.get('avatar_url'),
                    'promotion_eligible': dep.get('promotion_eligible', False),
                    'total_xp': dep.get('total_xp', 0),
                    'active_quest_count': dep.get('active_quest_count', 0),
                    'age': self._calculate_age(datetime.strptime(dep.get('date_of_birth'), '%Y-%m-%d').date()) if dep.get('date_of_birth') else None
                })

            return formatted_dependents

        except Exception as e:
            logger.error(f"Error fetching dependents for parent {parent_id}: {e}")
            return []

    def get_dependent(self, dependent_id: str, parent_id: str) -> Dict[str, Any]:
        """
        Get a specific dependent profile.

        Args:
            dependent_id: Dependent user ID
            parent_id: Parent user ID (for authorization check)

        Returns:
            Dependent profile

        Raises:
            NotFoundError: If dependent not found
            PermissionError: If parent doesn't own this dependent
        """
        try:
            result = self.client.table('users')\
                .select('*')\
                .eq('id', dependent_id)\
                .eq('is_dependent', True)\
                .single()\
                .execute()

            if not result.data:
                raise NotFoundError(f"Dependent with ID {dependent_id} not found")

            dependent = result.data

            # Verify parent owns this dependent
            if dependent.get('managed_by_parent_id') != parent_id:
                raise PermissionError(f"Parent {parent_id} does not own dependent {dependent_id}")

            # Add calculated fields
            if dependent.get('date_of_birth'):
                dob = datetime.strptime(dependent['date_of_birth'], '%Y-%m-%d').date()
                dependent['age'] = self._calculate_age(dob)

            return dependent

        except Exception as e:
            if isinstance(e, (NotFoundError, PermissionError)):
                raise
            logger.error(f"Error fetching dependent {dependent_id}: {e}")
            raise NotFoundError(f"Dependent {dependent_id} not found")

    def update_dependent(
        self,
        dependent_id: str,
        parent_id: str,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update a dependent profile.

        Args:
            dependent_id: Dependent user ID
            parent_id: Parent user ID (for authorization)
            updates: Dictionary of fields to update

        Returns:
            Updated dependent profile

        Raises:
            NotFoundError: If dependent not found
            PermissionError: If parent doesn't own this dependent
            ValidationError: If updates are invalid
        """
        # Verify ownership
        self.get_dependent(dependent_id, parent_id)

        # Filter allowed fields (prevent updating critical fields)
        allowed_fields = {'display_name', 'avatar_url', 'date_of_birth', 'bio'}
        filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}

        # If date_of_birth is updated, recalculate promotion_eligible_at
        if 'date_of_birth' in filtered_updates:
            dob = datetime.strptime(filtered_updates['date_of_birth'], '%Y-%m-%d').date()
            age = self._calculate_age(dob)

            if age >= 13:
                raise ValidationError(
                    f"Cannot update date of birth: dependent would be {age} years old (must be under 13)"
                )

            filtered_updates['promotion_eligible_at'] = str(dob + relativedelta(years=13))

        try:
            result = self.client.table('users')\
                .update(filtered_updates)\
                .eq('id', dependent_id)\
                .eq('managed_by_parent_id', parent_id)\
                .execute()

            if not result.data:
                raise NotFoundError(f"Failed to update dependent {dependent_id}")

            logger.info(f"Updated dependent {dependent_id} for parent {parent_id}")
            return result.data[0]

        except Exception as e:
            if isinstance(e, (NotFoundError, ValidationError)):
                raise
            logger.error(f"Error updating dependent {dependent_id}: {e}")
            raise ValidationError(f"Failed to update dependent: {str(e)}")

    def delete_dependent(self, dependent_id: str, parent_id: str) -> bool:
        """
        Delete a dependent profile.

        Args:
            dependent_id: Dependent user ID
            parent_id: Parent user ID (for authorization)

        Returns:
            True if deleted successfully

        Raises:
            NotFoundError: If dependent not found
            PermissionError: If parent doesn't own this dependent
        """
        # Verify ownership
        self.get_dependent(dependent_id, parent_id)

        try:
            result = self.client.table('users')\
                .delete()\
                .eq('id', dependent_id)\
                .eq('managed_by_parent_id', parent_id)\
                .execute()

            if not result.data:
                raise NotFoundError(f"Failed to delete dependent {dependent_id}")

            logger.info(f"Deleted dependent {dependent_id} for parent {parent_id}")
            return True

        except Exception as e:
            if isinstance(e, NotFoundError):
                raise
            logger.error(f"Error deleting dependent {dependent_id}: {e}")
            raise ValidationError(f"Failed to delete dependent: {str(e)}")

    def promote_dependent_to_independent(
        self,
        dependent_id: str,
        parent_id: str,
        email: str,
        password: str
    ) -> Dict[str, Any]:
        """
        Promote a dependent to an independent account (when they turn 13).

        Args:
            dependent_id: Dependent user ID
            parent_id: Parent user ID (for authorization)
            email: Email for the new independent account
            password: Password for the new independent account

        Returns:
            Updated user record

        Raises:
            NotFoundError: If dependent not found
            PermissionError: If not eligible for promotion
            ValidationError: If promotion fails
        """
        # Get dependent and verify ownership
        dependent = self.get_dependent(dependent_id, parent_id)

        # Check promotion eligibility
        promotion_date = datetime.strptime(dependent['promotion_eligible_at'], '%Y-%m-%d').date()
        if date.today() < promotion_date:
            raise PermissionError(
                f"Dependent is not yet eligible for promotion. "
                f"Eligible on {promotion_date.strftime('%B %d, %Y')} (13th birthday)."
            )

        try:
            # Create Supabase Auth account
            from backend.database import get_supabase_admin_client
            admin_client = get_supabase_admin_client()

            auth_response = admin_client.auth.admin.create_user({
                'email': email,
                'password': password,
                'email_confirm': True,
                'user_metadata': {
                    'display_name': dependent.get('display_name'),
                    'promoted_from_dependent': True,
                    'promoted_at': datetime.utcnow().isoformat()
                }
            })

            if not auth_response.user:
                raise ValidationError("Failed to create authentication account")

            # Update user record to remove dependent status
            update_data = {
                'email': email,
                'is_dependent': False,
                'managed_by_parent_id': None,
                'id': auth_response.user.id  # Update to match Supabase Auth ID
            }

            # Note: This is a complex operation that may require data migration
            # For now, we'll update the existing record
            result = self.client.table('users')\
                .update(update_data)\
                .eq('id', dependent_id)\
                .execute()

            logger.info(f"Promoted dependent {dependent_id} to independent account {auth_response.user.id}")
            return result.data[0] if result.data else update_data

        except Exception as e:
            logger.error(f"Error promoting dependent {dependent_id}: {e}")
            raise ValidationError(f"Failed to promote dependent: {str(e)}")

    def _calculate_age(self, date_of_birth: date) -> int:
        """
        Calculate age from date of birth.

        Args:
            date_of_birth: Date of birth

        Returns:
            Age in years
        """
        today = date.today()
        age = today.year - date_of_birth.year

        # Adjust if birthday hasn't occurred this year
        if (today.month, today.day) < (date_of_birth.month, date_of_birth.day):
            age -= 1

        return age
