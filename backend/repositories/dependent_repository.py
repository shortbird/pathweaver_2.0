"""
Dependent Repository

Handles all database operations for dependent profiles (children under 13 managed by parent accounts).
Supports COPPA-compliant dependent profiles without email/password.
"""

from typing import Dict, Optional, Any
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from repositories.base_repository import BaseRepository, NotFoundError, PermissionError, ValidationError
from utils.logger import get_logger
from utils.roles import get_effective_roles

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
        # Validate parent exists and has parent or admin role (get organization_id too)
        parent = self.client.table('users').select(
            'id, role, org_role, org_roles, organization_id, first_name, last_name'
        ).eq('id', parent_id).single().execute()
        if not parent.data:
            raise NotFoundError(f"Parent with ID {parent_id} not found")

        # Resolve org_managed users to their real role(s) so org-based parents
        # (role='org_managed', org_role/org_roles='parent') are allowed, not just
        # platform parents. Previously this checked only the raw `role` column,
        # which the route-layer verify_parent_role does not, so org parents passed
        # the route gate but were rejected here.
        effective_roles = get_effective_roles(parent.data)
        if 'parent' not in effective_roles and 'superadmin' not in effective_roles:
            raise PermissionError(f"User {parent_id} is not a parent or superadmin")

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
                # A child inheriting a parent's organisation is an org student
                # and needs the org role columns, or the org_role-only queries
                # skip them and the school's student counts disagree with each
                # other (iCreate, 2026-08-27). Platform children keep the plain
                # student role, which is what a user with no organisation has.
                'role': 'org_managed' if parent_org_id else 'student',
                'org_role': 'student' if parent_org_id else None,
                'org_roles': ['student'] if parent_org_id else None,
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
                except Exception as cleanup_error:
                    # Log cleanup failure but don't block the main error
                    logger.warning(f"Failed to cleanup auth user {dependent_id} after dependent creation failure: {cleanup_error}")
                raise ValidationError("Failed to create dependent profile")

            logger.info(f"Created dependent profile {result.data[0]['id']} for parent {parent_id}")
            return result.data[0]

        except Exception as e:
            logger.error(f"Error creating dependent for parent {parent_id}: {e}")
            raise ValidationError(f"Failed to create dependent: {str(e)}") from e

    def get_dependent(self, dependent_id: str, parent_id: str,
                      owner_only: bool = False) -> Dict[str, Any]:
        """
        Get a specific dependent profile.

        Authorization has two levels, because "may act for this child" and "may
        change what this account IS" are different questions:

        * default -- any of the child's guardians (utils.portfolio_access
          .is_parent_of: managed_by_parent_id, an approved parent_student_links
          row, or a shared household). This is what lets a second guardian act
          as the child, complete a task, or edit the profile, which they could
          not do while this checked managed_by_parent_id alone: two parents of
          the same child had different powers depending on who had clicked
          "add a child" first.
        * owner_only=True -- the guardian named in managed_by_parent_id, and
          only them. For the three actions that end or hand over the account:
          delete, promote to an independent login, and add credentials. Those
          are not "acting for the child", and a co-guardian doing one of them
          silently takes the account away from the guardian who made it.

        The `is_dependent` filter is unchanged and is what keeps a student with
        their own login non-impersonable, whoever asks.

        Args:
            dependent_id: Dependent user ID
            parent_id: Parent user ID (for authorization check)
            owner_only: Require the managing parent, not any guardian

        Returns:
            Dependent profile

        Raises:
            NotFoundError: If dependent not found
            PermissionError: If the caller is not a guardian (or, with
                owner_only, not the managing parent)
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

            # Verify the caller may act for this dependent (see the docstring
            # for why owner_only exists).
            is_owner = dependent.get('managed_by_parent_id') == parent_id
            if not is_owner:
                from utils.portfolio_access import is_parent_of
                if owner_only or not is_parent_of(parent_id, dependent_id):
                    raise PermissionError(
                        f"Parent {parent_id} does not own dependent {dependent_id}")

            # Add calculated fields
            if dependent.get('date_of_birth'):
                dob = datetime.strptime(dependent['date_of_birth'], '%Y-%m-%d').date()
                dependent['age'] = self._calculate_age(dob)

            return dependent

        except Exception as e:
            if isinstance(e, (NotFoundError, PermissionError)):
                raise
            logger.error(f"Error fetching dependent {dependent_id}: {e}")
            raise NotFoundError(f"Dependent {dependent_id} not found") from e

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
            raise ValidationError(f"Failed to update dependent: {str(e)}") from e

    def delete_dependent(self, dependent_id: str, parent_id: str) -> bool:
        """
        Delete a dependent profile: rows, storage objects, and auth account.

        A dependent is a child under 13. This used to hard-delete only the
        `public.users` row, leaving the child's Supabase **auth** account and
        every uploaded file (avatar, evidence media) in place indefinitely —
        a parent exercising erasure on their child's behalf got a partial
        deletion. It now runs the same full erasure as every other deletion
        path (services/account_deletion_service.py), which fails loudly rather
        than reporting a deletion that didn't happen.

        Args:
            dependent_id: Dependent user ID
            parent_id: Parent user ID (for authorization)

        Returns:
            True if deleted successfully

        Raises:
            NotFoundError: If dependent not found
            PermissionError: If parent doesn't own this dependent
            ValidationError: If any part of the erasure failed (nothing is
                reported as deleted; the record stays retryable)
        """
        # Verify ownership BEFORE anything is deleted — get_dependent enforces
        # managed_by_parent_id, which the purge itself does not re-check.
        # owner_only: erasing the account is not "acting for the child", and a
        # co-guardian must not be able to delete a record another guardian made.
        self.get_dependent(dependent_id, parent_id, owner_only=True)

        from repositories.user_erasure_repository import AccountDeletionError, purge_user

        try:
            purge_user(dependent_id, admin=self.client,
                       reason='Parent-initiated dependent deletion',
                       deletion_type='dependent')
            logger.info(f"Deleted dependent {dependent_id} for parent {parent_id}")
            return True

        except AccountDeletionError as e:
            logger.error(f"Dependent {dependent_id} deletion incomplete: {e.errors}")
            raise ValidationError(
                "Failed to delete dependent: the deletion did not complete and has been "
                "left for retry"
            ) from e
        except Exception as e:
            if isinstance(e, (NotFoundError, PermissionError)):
                raise
            logger.error(f"Error deleting dependent {dependent_id}: {e}")
            raise ValidationError(f"Failed to delete dependent: {str(e)}") from e

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
            Updated user record. Its id is dependent_id: promotion never
            changes a user's id.

        Raises:
            NotFoundError: If dependent not found
            PermissionError: If not eligible for promotion
            ValidationError: If promotion fails
        """
        # Get dependent and verify ownership. owner_only: promotion hands the
        # account to the child permanently and ends managed_by_parent_id, so it
        # stays with the guardian who created it.
        dependent = self.get_dependent(dependent_id, parent_id, owner_only=True)

        # Check promotion eligibility
        promotion_date = datetime.strptime(dependent['promotion_eligible_at'], '%Y-%m-%d').date()
        if date.today() < promotion_date:
            raise PermissionError(
                f"Dependent is not yet eligible for promotion. "
                f"Eligible on {promotion_date.strftime('%B %d, %Y')} (13th birthday)."
            )

        # Cheap pre-check against the profile table, before anything is
        # written. It cannot see an address held only in auth.users, so
        # GoTrue's own duplicate error is translated below as well.
        email_check = self.client.table('users').select('id').eq('email', email).execute()
        if email_check.data:
            raise ValidationError("This email is already in use by another account")

        # The id never changes (ticket 4c26966c). create_dependent already made
        # an auth user -- a stub with a placeholder email -- whose id IS this
        # profile's id, so promotion hands that same auth user a real email and
        # password. The old code created a SECOND auth user and rewrote users.id
        # to match it, which orphaned every row keyed to the child (~40 tables
        # reference users.id) and left the placeholder auth user behind.
        # add-login in routes/dependents.py made the same move for the same
        # reason; this is the other half of it.
        #
        # Order matters, and each step leaves a state a retry can finish:
        #   1. auth credentials  -- if this fails, nothing else is written.
        #   2. parent link       -- written BEFORE managed_by_parent_id is
        #                           cleared, so the parent never loses sight of
        #                           the child in between.
        #   3. public.users      -- email + dependent flags in ONE update, since
        #                           check_dependent_no_email forbids an email
        #                           while is_dependent is still true.
        # A failure after step 1 leaves the auth user already holding the
        # address; a retry passes the profile-table check (users.email is still
        # NULL) and update_user_by_id on the same user is accepted again.
        promoted_at = datetime.utcnow().isoformat()
        auth_attributes = {
            'email': email,
            'password': password,
            'email_confirm': True,
            'user_metadata': {
                'display_name': dependent.get('display_name'),
                'promoted_from_dependent': True,
                'promoted_at': promoted_at,
            },
        }
        self._set_promoted_credentials(dependent_id, auth_attributes)

        # Owner decision: promotion hands the child their own login, it does
        # not take them out of the family. managed_by_parent_id is the link
        # that goes away, so the promoting parent gets an approved
        # parent_student_links row in its place -- the link the family view
        # (utils.class_membership.links_of_parent) and is_parent_of already
        # read for a student with their own login. household_members is left
        # alone: a shared household keeps working as it did.
        self._ensure_parent_link(parent_id, dependent_id)

        update_data = {
            'email': email,
            'is_dependent': False,
            'managed_by_parent_id': None,
        }
        try:
            result = self.client.table('users')\
                .update(update_data)\
                .eq('id', dependent_id)\
                .execute()
        except Exception as e:
            logger.error(f"Promoted dependent {dependent_id} in auth but the profile update failed: {e}")
            raise ValidationError(f"Failed to promote dependent: {str(e)}") from e

        logger.info(f"Promoted dependent {dependent_id} to an independent account (id unchanged)")
        if result.data:
            return result.data[0]
        return {**dependent, **update_data}

    def _set_promoted_credentials(self, dependent_id: str, attributes: Dict[str, Any]) -> None:
        """Give the dependent's existing auth user a real email and password.

        Every dependent in production has an auth.users row (238 of 238 on
        2026-09-29), because create_dependent makes one first. If one is ever
        missing, the auth user is created with the SAME id rather than a new
        one: the profile id is the thing that must not move.
        """
        from utils.validation.breached_password import (
            BREACHED_PASSWORD_MESSAGE, is_weak_password_error,
        )
        try:
            try:
                self.client.auth.admin.update_user_by_id(dependent_id, attributes)
            except Exception as e:
                if not self._is_auth_user_missing(e):
                    raise
                logger.warning(f"Dependent {dependent_id} had no auth user; creating one with the same id")
                response = self.client.auth.admin.create_user({**attributes, 'id': dependent_id})
                created_id = getattr(getattr(response, 'user', None), 'id', None)
                if created_id and str(created_id) != str(dependent_id):
                    raise ValidationError("Failed to create authentication account")
        except ValidationError:
            raise
        except Exception as e:
            message = str(e).lower()
            if 'already been registered' in message or 'already exists' in message:
                raise ValidationError("This email is already in use by another account") from e
            if is_weak_password_error(e):
                raise ValidationError(BREACHED_PASSWORD_MESSAGE) from e
            logger.error(f"Failed to set login credentials while promoting dependent {dependent_id}: {e}")
            raise ValidationError("Failed to promote dependent: could not set login credentials") from e

    @staticmethod
    def _is_auth_user_missing(exc: Exception) -> bool:
        if getattr(exc, 'code', None) == 'user_not_found':
            return True
        if getattr(exc, 'status', None) == 404:
            return True
        return 'user not found' in str(getattr(exc, 'message', '') or exc).lower()

    def _ensure_parent_link(self, parent_id: str, student_id: str) -> None:
        """Approved parent_student_links row from parent to student. Idempotent:
        an existing approved row is left alone, any other status is raised to
        approved (the parent is the child's managing guardian, which outranks a
        stale pending or rejected request)."""
        try:
            existing = self.client.table('parent_student_links').select('id, status')\
                .eq('parent_user_id', parent_id).eq('student_user_id', student_id)\
                .execute().data or []
            if not existing:
                self.client.table('parent_student_links').insert({
                    'parent_user_id': parent_id,
                    'student_user_id': student_id,
                    'status': 'approved',
                    'admin_verified': True,
                    'admin_notes': 'Auto-linked when the parent promoted their dependent to their own account',
                }).execute()
            elif existing[0].get('status') != 'approved':
                self.client.table('parent_student_links')\
                    .update({'status': 'approved'})\
                    .eq('id', existing[0]['id']).execute()
        except Exception as e:
            logger.error(f"Failed to link parent {parent_id} to promoted dependent {student_id}: {e}")
            raise ValidationError(
                "Failed to promote dependent: could not keep the parent link") from e

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
