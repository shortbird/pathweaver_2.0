"""
Database Client Selection Policy

RULE 1: Use get_user_client() for ALL user-specific operations
RULE 2: Use get_supabase_admin_client() ONLY for:
    - User registration (creating new auth users)
    - Admin dashboard operations (explicitly admin-scoped)
    - System maintenance tasks (migrations, cleanup)
RULE 3: NEVER use admin client in user-facing endpoints

This module helps enforce proper database client selection to prevent
RLS (Row Level Security) bypasses and maintain data security.
"""

from backend.database import get_supabase_admin_client, get_user_client

from utils.logger import get_logger

logger = get_logger(__name__)


class DatabasePolicy:
    """Enforces database client selection policy."""

    @staticmethod
    def get_safe_client(user_id=None):
        """
        Auto-select correct client based on context.
        Raises ValueError if admin client needed without explicit justification.

        Args:
            user_id: User ID for user-scoped operations

        Returns:
            Supabase client instance (user-authenticated)

        Raises:
            ValueError: If admin client is needed (must be explicit)
        """
        if user_id:
            return get_user_client(user_id)
        raise ValueError(
            "Admin client usage must be explicit. "
            "Use get_supabase_admin_client() with comment justifying usage."
        )

    @staticmethod
    def validate_admin_usage(operation_type: str, justification: str = None):
        """
        Validate that admin client usage is appropriate.

        Args:
            operation_type: Type of operation (registration/admin_dashboard/system_maintenance)
            justification: Optional justification for admin client usage

        Returns:
            bool: True if usage is valid

        Raises:
            ValueError: If usage is not justified
        """
        valid_operations = {
            'registration': 'Creating new auth users requires service role',
            'admin_dashboard': 'Admin-scoped operations require elevated privileges',
            'system_maintenance': 'System tasks require service role access'
        }

        if operation_type not in valid_operations:
            raise ValueError(
                f"Invalid admin client operation type: {operation_type}. "
                f"Valid types: {', '.join(valid_operations.keys())}"
            )

        return True


# Usage examples:
#
# GOOD - User-specific operation:
#   supabase = get_user_client(user_id)
#   response = supabase.table('quests').select('*').execute()
#
# GOOD - Explicit admin operation with justification:
#   supabase = get_supabase_admin_client()  # User registration - requires service role
#   response = supabase.auth.admin.create_user(...)
#
# BAD - Admin client for user data (RLS bypass):
#   supabase = get_supabase_admin_client()
#   response = supabase.table('user_quests').select('*').eq('user_id', user_id).execute()
#
# SHOULD BE - Use user client instead:
#   supabase = get_user_client(user_id)
#   response = supabase.table('user_quests').select('*').execute()
