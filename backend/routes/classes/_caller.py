"""Who is calling, in terms this module can authorize on.

One helper, imported by every route file here. It used to be four copies of a
`get_user_info` that each selected `role, org_role, organization_id` and
collapsed the answer to a single string via `get_effective_role` -- which, for
an org account, returns `org_roles[0]`.

`org_roles[0]` is an arbitrary pick. The head of a school who is also listed as
an advisor carries `org_roles = ['advisor', 'observer', 'org_admin']`, resolves
to 'advisor', and `can_user_access_class` then asks whether an advisor is
assigned to this particular class. She is the org admin and it is her school's
class, so the answer should never have been no -- but the org_admin branch
compares one string and never saw the role she actually holds. She got "Access
denied" opening a class page on her own org (Sentry OPTIO-WEB-F).

The same shape has now cost three separate bugs: OPTIO-BACKEND-6P (a campus
coordinator locked out of her own children's accounts), OPTIO-WEB-3/E (an
assistant teacher 403'd off the class she teaches), and this one. The rule that
falls out of them: authorize on the full role list, never on whichever role
happens to sort first.
"""

from database import get_supabase_admin_client
from utils.roles import get_effective_roles

# Roles that see a class as staff rather than as a learner. Used for the
# read-scoping decisions (published-only vs everything) that a single-role
# comparison used to make.
STAFF_CLASS_ROLES = frozenset({'advisor', 'org_admin', 'campus_coordinator', 'superadmin'})


def get_caller(user_id: str):
    """Return (effective_roles, organization_id, user_row).

    `effective_roles` is a list -- every role the account holds, resolved the
    same way `get_effective_roles` resolves them elsewhere (including narrowing
    to a single role when a "view as" is active, so previewing the platform as
    a student still previews it as a student here).
    """
    # admin client justified: classes module helper; the role/org lookup is the
    # input to the route-level authorization checks that follow it.
    supabase = get_supabase_admin_client()
    user = (supabase.table('users')
            .select('id, role, org_role, org_roles, organization_id')
            .eq('id', user_id).execute())
    if not user.data:
        return [], None, None
    user_data = user.data[0]
    return get_effective_roles(user_data), user_data.get('organization_id'), user_data


def is_superadmin(roles) -> bool:
    return 'superadmin' in (roles or [])


def is_staff(roles) -> bool:
    return any(r in STAFF_CLASS_ROLES for r in (roles or []))
