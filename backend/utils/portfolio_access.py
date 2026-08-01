"""Portfolio visibility: one place that answers who may see, and who may decide.

Before this module the same four questions were answered by four divergent
copies of the logic (routes/portfolio.py::_can_curate_for,
routes/observer/sharing.py::_check_student_access, the observer feed's inline
checks, and portfolio_service.check_is_minor), and they disagreed. The
disagreements were the bug: one path treated a student with no date of birth
as an adult who could publish to the world, another silently reported every
portfolio as private, and a third let any authenticated user read any
portfolio at all.

The policy this encodes (decided 2026-08-01):

  * Student work is private by default. Nothing is world-readable without a
    consent record naming who gave it and when.
  * Parents decide. A minor cannot publish their own work, and a parent may
    both grant and revoke -- revocation is not a favour, it is symmetric with
    approval and always available.
  * Unknown age means minor. A missing date of birth is missing information,
    not evidence of adulthood, and it must fail closed.
  * Where no parent exists, an accountable adult stands in: for organization
    students that is their org admin or assigned advisor. For platform
    students with no parent at all, nobody can publish -- there is no one to
    hold responsible, so the answer is no.

Relationship-based reading (a parent, advisor, or observer opening a private
portfolio) is deliberately NOT the same question as publishing. Someone the
family has already connected to the student may read the portfolio without
that portfolio becoming public to anyone else.
"""

from datetime import date, datetime
from typing import Any, Dict, Optional, Tuple

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

# Statuses that count as a live parent<->student link. Historical rows use
# both spellings; treating only one as valid silently drops real parents.
ACTIVE_LINK_STATUSES = ('approved', 'active')

# Who may stand in for a parent when a student has none.
ORG_APPROVER_ROLES = ('org_admin', 'advisor')


def _admin():
    # admin client justified: every function here answers a cross-user
    # authorization question (is this caller that student's parent?) and must
    # read rows the caller cannot see under RLS. Nothing here returns student
    # data -- these are boolean/identifier answers consumed by callers that do
    # their own gating.
    return get_supabase_admin_client()


def _fetch_user(user_id: str, columns: str) -> Optional[Dict[str, Any]]:
    if not user_id:
        return None
    rows = _admin().table('users').select(columns).eq('id', user_id).limit(1).execute().data
    return rows[0] if rows else None


def _org_roles_of(user_row: Dict[str, Any]) -> set:
    """Effective role set for a user, flattening the org_managed indirection."""
    roles = set(user_row.get('org_roles') or [])
    if user_row.get('org_role'):
        roles.add(user_row['org_role'])
    role = user_row.get('role')
    # A platform user's role lives in `role`; org_managed defers to org_role,
    # which is already folded in above.
    if role and role != 'org_managed':
        roles.add(role)
    return roles


# ---------------------------------------------------------------------------
# Age
# ---------------------------------------------------------------------------

def is_minor(user_row: Optional[Dict[str, Any]]) -> bool:
    """True unless we have positive evidence the user is an adult.

    Fails closed on purpose. The previous implementation returned False when
    date_of_birth was NULL, on the reasoning that such users "would have given
    consent at registration" -- but date_of_birth is optional at registration,
    so 267 students of genuinely unknown age were classified as adults and
    could publish their work to the open internet with no parent involved.
    """
    if not user_row:
        return True

    if user_row.get('is_dependent') is True:
        return True

    dob = user_row.get('date_of_birth')
    if not dob:
        return True  # unknown age -> minor

    try:
        if isinstance(dob, str):
            dob = datetime.strptime(dob.split('T')[0], '%Y-%m-%d').date()
        elif hasattr(dob, 'date'):
            dob = dob.date()
        return (date.today() - dob).days / 365.25 < 18
    except Exception:
        logger.warning("Unparseable date_of_birth for user %s; treating as minor",
                       str(user_row.get('id'))[:8])
        return True


def is_minor_by_id(user_id: str) -> bool:
    return is_minor(_fetch_user(user_id, 'id, is_dependent, date_of_birth'))


# ---------------------------------------------------------------------------
# Relationships
# ---------------------------------------------------------------------------

def is_parent_of(caller_id: str, student_id: str) -> bool:
    """True if caller is the student's parent, by either linking mechanism."""
    if not caller_id or not student_id or caller_id == student_id:
        return False

    student = _fetch_user(student_id, 'id, managed_by_parent_id')
    if student and student.get('managed_by_parent_id') == caller_id:
        return True

    links = _admin().table('parent_student_links').select('id, status') \
        .eq('parent_user_id', caller_id).eq('student_user_id', student_id) \
        .execute().data or []
    return any(l.get('status') in ACTIVE_LINK_STATUSES for l in links)


def is_advisor_of(caller_id: str, student_id: str) -> bool:
    rows = _admin().table('advisor_student_assignments').select('id') \
        .eq('advisor_id', caller_id).eq('student_id', student_id) \
        .eq('is_active', True).limit(1).execute().data or []
    return bool(rows)


def is_observer_of(caller_id: str, student_id: str) -> bool:
    rows = _admin().table('observer_student_links').select('id') \
        .eq('observer_id', caller_id).eq('student_id', student_id) \
        .limit(1).execute().data or []
    return bool(rows)


def is_org_admin_over(caller: Dict[str, Any], student: Dict[str, Any]) -> bool:
    if not caller or not student:
        return False
    org_id = caller.get('organization_id')
    return bool(
        org_id
        and org_id == student.get('organization_id')
        and 'org_admin' in _org_roles_of(caller)
    )


# ---------------------------------------------------------------------------
# The two questions callers actually ask
# ---------------------------------------------------------------------------

def can_view_portfolio(caller_id: Optional[str], student_id: str) -> bool:
    """May this caller read the student's portfolio, public or not?

    Grants: the student, a superadmin, a parent, an assigned advisor, a linked
    observer, and an org admin of the student's organization.

    This is what makes private-by-default survivable. Without it, flipping
    portfolios private would leave advisors and parents with no way to see
    student work at all, and families would be pushed back toward publishing
    to the whole internet just so one person could look.
    """
    if not caller_id:
        return False
    if caller_id == student_id:
        return True

    caller = _fetch_user(caller_id, 'id, role, org_role, org_roles, organization_id')
    if not caller:
        return False
    if caller.get('role') == 'superadmin':
        return True

    if is_parent_of(caller_id, student_id):
        return True
    if is_advisor_of(caller_id, student_id):
        return True
    if is_observer_of(caller_id, student_id):
        return True

    student = _fetch_user(student_id, 'id, organization_id')
    return is_org_admin_over(caller, student)


def can_manage_privacy(caller_id: str, student_id: str) -> Tuple[bool, Optional[str]]:
    """May this caller change the student's portfolio visibility?

    Returns (allowed, reason_if_denied).

    A student may manage their own visibility only if they are an adult; a
    minor's visibility belongs to their parent (or, absent a parent, to the
    accountable adult in their organization). Superadmin always may.
    """
    if not caller_id or not student_id:
        return False, 'Not authorized'

    caller = _fetch_user(caller_id, 'id, role, org_role, org_roles, organization_id')
    if caller and caller.get('role') == 'superadmin':
        return True, None

    if caller_id == student_id:
        if is_minor_by_id(student_id):
            return False, ('Your parent or guardian controls who can see your '
                           'portfolio. You can ask them to share it.')
        return True, None

    if is_parent_of(caller_id, student_id):
        return True, None

    # Org approver stands in where there is no parent.
    student = _fetch_user(student_id, 'id, organization_id')
    if student and student.get('organization_id') and caller:
        caller_roles = _org_roles_of(caller)
        same_org = caller.get('organization_id') == student.get('organization_id')
        if same_org and 'org_admin' in caller_roles:
            return True, None
        if same_org and 'advisor' in caller_roles and is_advisor_of(caller_id, student_id):
            return True, None

    return False, 'You do not control this student\'s portfolio visibility'


def find_approver(student_id: str) -> Optional[Dict[str, Any]]:
    """Who can approve publishing this student's work?

    Order: parent (either linking mechanism), then -- only for organization
    students -- the org admin. Returns None when nobody is accountable, which
    is a real answer: that student's work cannot be published.

    Returns {'user_id', 'kind', 'first_name'} or None.
    """
    student = _fetch_user(student_id, 'id, managed_by_parent_id, organization_id')
    if not student:
        return None

    parent_id = student.get('managed_by_parent_id')
    if not parent_id:
        links = _admin().table('parent_student_links').select('parent_user_id, status') \
            .eq('student_user_id', student_id).execute().data or []
        for link in links:
            if link.get('status') in ACTIVE_LINK_STATUSES:
                parent_id = link.get('parent_user_id')
                break

    if parent_id:
        parent = _fetch_user(parent_id, 'id, first_name')
        return {
            'user_id': parent_id,
            'kind': 'parent',
            'first_name': (parent or {}).get('first_name') or 'your parent',
        }

    org_id = student.get('organization_id')
    if org_id:
        candidates = _admin().table('users').select('id, first_name, role, org_role, org_roles') \
            .eq('organization_id', org_id).execute().data or []
        for cand in candidates:
            if 'org_admin' in _org_roles_of(cand):
                return {
                    'user_id': cand['id'],
                    'kind': 'org_admin',
                    'first_name': cand.get('first_name') or 'your school administrator',
                }

    return None
