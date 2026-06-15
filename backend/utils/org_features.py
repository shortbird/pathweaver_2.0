"""
Per-organization feature flags.

Generic capability gates stored on `organizations.feature_flags` (jsonb). Lets a
feature be enabled for one organization without hardcoding the org's slug in code
(unlike the slug-gated Treehouse/OEA program tabs). Reusable across future
microschools: enable a flag on the org row, no code change.

Convention: absent or falsy = OFF. Superadmin is handled by callers (a superadmin
acting outside any org should still be allowed where appropriate).

Usage:
    from utils.org_features import org_has_feature, user_org_has_feature

    if not org_has_feature(class_org_id, 'scheduled_publish'):
        return jsonify({'error': '...'}), 403
"""

from typing import Optional
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


def org_has_feature(org_id: Optional[str], feature: str) -> bool:
    """
    Return True if the organization has `feature` enabled in feature_flags.

    Returns False for a missing org_id, a missing org, or a flag that is absent
    or falsy. On unexpected error, returns False (fail closed — a gated feature
    should not silently leak to orgs that didn't enable it).
    """
    if not org_id or not feature:
        return False

    try:
        # admin client justified: reads org-level feature flags for access gating;
        # no user context, single-column read keyed by org_id.
        supabase = get_supabase_admin_client()
        result = supabase.table('organizations')\
            .select('feature_flags')\
            .eq('id', org_id)\
            .single()\
            .execute()

        flags = (result.data or {}).get('feature_flags') or {}
        return bool(flags.get(feature))

    except Exception as e:
        logger.warning(f"Could not read feature flag '{feature}' for org {org_id}: {e}")
        return False


def user_org_has_feature(user_id: str, feature: str) -> bool:
    """
    Resolve the user's organization and check `feature`. Returns False if the
    user has no organization. (Superadmin bypass, if desired, belongs in the
    caller — this helper is purely about the org's flags.)
    """
    if not user_id:
        return False

    try:
        # admin client justified: resolves the caller's own organization_id for
        # feature gating; single-column self read.
        supabase = get_supabase_admin_client()
        user_result = supabase.table('users')\
            .select('organization_id')\
            .eq('id', user_id)\
            .single()\
            .execute()

        org_id = (user_result.data or {}).get('organization_id')
        return org_has_feature(org_id, feature)

    except Exception as e:
        logger.warning(f"Could not resolve org feature '{feature}' for user {user_id}: {e}")
        return False
