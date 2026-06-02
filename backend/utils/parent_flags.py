"""Shared helper to attach parent/advisor relationship flags to a user dict.

The app's role-shell detection (useIsParent / useIsObserver in frontend-v2)
relies on `has_dependents`, `has_linked_students`, and `has_advisor_assignments`.
Email login and /api/auth/me compute these inline, but the OAuth callbacks
(Google/Apple) historically returned the raw users row without them — so right
after social sign-in a parent (e.g. a superadmin with a dependent) was treated
as a plain student until a full reload hit /me. That dropped parent-only flows
like capturing a learning moment for a child.

Call this on the user dict before returning it from any auth response so the
flags are consistent across every login path.
"""

from utils.logger import get_logger

logger = get_logger(__name__)


def attach_relationship_flags(admin_client, user_data):
    """Mutate + return user_data with has_dependents / has_linked_students /
    has_advisor_assignments. Best-effort: never raises (auth must not fail if a
    relationship count query hiccups)."""
    if not user_data or not user_data.get('id'):
        return user_data
    uid = user_data['id']

    try:
        dependents = admin_client.table('users') \
            .select('id', count='exact').eq('managed_by_parent_id', uid).execute()
        user_data['has_dependents'] = (dependents.count or 0) > 0
    except Exception as e:
        logger.warning(f"[parent_flags] dependents check failed: {e}")
        user_data.setdefault('has_dependents', False)

    try:
        linked = admin_client.table('parent_student_links') \
            .select('id', count='exact').eq('parent_user_id', uid).eq('status', 'approved').execute()
        user_data['has_linked_students'] = (linked.count or 0) > 0
    except Exception as e:
        logger.warning(f"[parent_flags] linked-students check failed: {e}")
        user_data.setdefault('has_linked_students', False)

    try:
        advisor = admin_client.table('advisor_student_assignments') \
            .select('id', count='exact').eq('advisor_id', uid).eq('is_active', True).execute()
        user_data['has_advisor_assignments'] = (advisor.count or 0) > 0
    except Exception as e:
        logger.warning(f"[parent_flags] advisor check failed: {e}")
        user_data.setdefault('has_advisor_assignments', False)

    return user_data
