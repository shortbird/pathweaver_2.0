"""
Role management utilities and constants for RBAC system
"""

from enum import Enum
from typing import List, Dict, Optional, Set

from utils.logger import get_logger

logger = get_logger(__name__)

class UserRole(Enum):
    """Enumeration of available user roles"""
    STUDENT = 'student'
    PARENT = 'parent'
    ADVISOR = 'advisor'
    OBSERVER = 'observer'
    ORG_ADMIN = 'org_admin'
    ORG_MANAGED = 'org_managed'  # Platform role indicating org controls this user
    SUPERADMIN = 'superadmin'


class OrgRole(Enum):
    """Enumeration of organization-specific roles (used when role=org_managed)"""
    STUDENT = 'student'
    PARENT = 'parent'
    ADVISOR = 'advisor'
    OBSERVER = 'observer'
    ORG_ADMIN = 'org_admin'

# Role hierarchy for privilege checking
ROLE_HIERARCHY = {
    UserRole.SUPERADMIN: 5,
    UserRole.ORG_ADMIN: 4,
    UserRole.ADVISOR: 2,
    UserRole.PARENT: 1,
    UserRole.OBSERVER: 1,
    UserRole.STUDENT: 0,
    UserRole.ORG_MANAGED: 0  # Effective hierarchy determined by org_role
}

# Valid roles as a set for quick validation
VALID_ROLES = {role.value for role in UserRole}

# Valid organization roles (used when role=org_managed)
VALID_ORG_ROLES = {role.value for role in OrgRole}

# Role display names for UI
ROLE_DISPLAY_NAMES = {
    UserRole.STUDENT.value: 'Student',
    UserRole.PARENT.value: 'Parent',
    UserRole.ADVISOR.value: 'Advisor',
    UserRole.OBSERVER.value: 'Observer',
    UserRole.ORG_ADMIN.value: 'Organization Admin',
    UserRole.ORG_MANAGED.value: 'Organization Managed',
    UserRole.SUPERADMIN.value: 'Super Admin'
}

# Role descriptions
ROLE_DESCRIPTIONS = {
    UserRole.STUDENT.value: 'Can complete quests, earn XP, and build their diploma',
    UserRole.PARENT.value: 'Full platform access plus ability to view linked children\'s progress',
    UserRole.ADVISOR.value: 'Can manage student groups and view progress within their organization',
    UserRole.OBSERVER.value: 'View-only access to linked students, can comment on student work',
    UserRole.ORG_ADMIN.value: 'Organization-level admin with access to org management tools',
    UserRole.ORG_MANAGED.value: 'Role is controlled by the user\'s organization',
    UserRole.SUPERADMIN.value: 'Full system access to all organizations and features'
}

class RolePermissions:
    """Define permissions for each role"""

    PERMISSIONS = {
        UserRole.STUDENT.value: {
            'quests': ['view', 'start', 'complete'],
            'diploma': ['view_own', 'edit_own'],
            'collaborations': ['send', 'receive'],
            'profile': ['view_others', 'edit_own'],
            'admin_panel': []
        },
        UserRole.PARENT.value: {
            'quests': ['view', 'start', 'complete'],
            'diploma': ['view_own', 'edit_own', 'view_children'],
            'collaborations': ['send', 'receive'],
            'profile': ['view_others', 'edit_own', 'view_children'],
            'admin_panel': []
        },
        UserRole.ADVISOR.value: {
            'quests': ['view', 'demo'],
            'diploma': ['view_students'],
            'collaborations': [],
            'profile': ['view_students', 'edit_own'],
            'admin_panel': ['view_analytics', 'view_students']
        },
        UserRole.OBSERVER.value: {
            'quests': ['view'],
            'diploma': ['view_linked'],
            'collaborations': [],
            'profile': ['view_linked', 'edit_own'],
            'admin_panel': []
        },
        UserRole.ORG_ADMIN.value: {
            'quests': ['view', 'create', 'edit', 'delete', 'start', 'complete'],
            'diploma': ['view_org', 'edit_org'],
            'collaborations': ['view_org', 'manage_org'],
            'profile': ['view_org', 'edit_org'],
            'admin_panel': ['org_access']
        },
        UserRole.SUPERADMIN.value: {
            'quests': ['view', 'create', 'edit', 'delete', 'start', 'complete'],
            'diploma': ['view_all', 'edit_all'],
            'collaborations': ['view_all', 'manage'],
            'profile': ['view_all', 'edit_all'],
            'admin_panel': ['full_access']
        }
    }
    
    @classmethod
    def has_permission(cls, role: str, resource: str, action: str) -> bool:
        """Check if a role has permission for a specific action on a resource"""
        if role not in cls.PERMISSIONS:
            return False
        
        role_perms = cls.PERMISSIONS[role].get(resource, [])
        
        # Check for wildcard permissions
        if 'full_access' in role_perms or f'{action}_all' in role_perms:
            return True
        
        return action in role_perms
    
    @classmethod
    def get_permissions(cls, role: str) -> Dict[str, List[str]]:
        """Get all permissions for a role"""
        return cls.PERMISSIONS.get(role, {})
    
    @classmethod
    def can_manage_role(cls, actor_role: str, target_role: str) -> bool:
        """Check if an actor can manage/change a target role"""
        # Superadmin can manage all roles
        if actor_role == UserRole.SUPERADMIN.value:
            return True
        # Org admins can manage roles within their org (except superadmin)
        if actor_role == UserRole.ORG_ADMIN.value:
            return target_role != UserRole.SUPERADMIN.value
        return False

def validate_role(role: str) -> bool:
    """Validate if a role string is valid"""
    return role in VALID_ROLES


def validate_org_role(org_role: str) -> bool:
    """Validate if an org_role string is valid"""
    return org_role in VALID_ORG_ROLES


def get_effective_role(user: Dict) -> str:
    """
    Get the effective role for a user, resolving org_managed to the actual org_role.

    Role Model:
        - Platform users (organization_id = NULL): Use 'role' directly (student, parent, etc.)
        - Organization users (organization_id set): Have role='org_managed', actual role in 'org_role'
        - Superadmin: Always organization_id = NULL, role = 'superadmin'

    Args:
        user: User dict with 'role' and optionally 'org_role' keys

    Returns:
        The effective role string to use for permission checks
    """
    role = user.get('role', UserRole.STUDENT.value)

    # Superadmin always returns superadmin
    if role == UserRole.SUPERADMIN.value:
        return UserRole.SUPERADMIN.value

    # Organization users have role='org_managed' and actual role in org_role
    if role == UserRole.ORG_MANAGED.value:
        org_role = user.get('org_role')
        if org_role and org_role in VALID_ORG_ROLES:
            return org_role
        # Fallback to student if org_role is not set (shouldn't happen due to constraints)
        logger.warning(f"User has org_managed role but no valid org_role: {user.get('id')}")
        return UserRole.STUDENT.value

    # Platform users (no org) use their role directly
    return role


def is_role_higher(role1: str, role2: str) -> bool:
    """Check if role1 has higher privileges than role2"""
    try:
        r1 = UserRole(role1)
        r2 = UserRole(role2)
        return ROLE_HIERARCHY[r1] > ROLE_HIERARCHY[r2]
    except (ValueError, KeyError):
        return False

def is_role_equal_or_higher(role1: str, role2: str) -> bool:
    """Check if role1 has equal or higher privileges than role2"""
    try:
        r1 = UserRole(role1)
        r2 = UserRole(role2)
        return ROLE_HIERARCHY[r1] >= ROLE_HIERARCHY[r2]
    except (ValueError, KeyError):
        return False

def get_accessible_roles(current_role: str) -> List[str]:
    """Get list of platform roles that can be assigned by the current role"""
    if current_role == UserRole.SUPERADMIN.value:
        # Superadmin can assign any platform role
        return list(VALID_ROLES)
    else:
        # Only superadmin can assign platform roles
        return []


def get_accessible_org_roles(effective_role: str) -> List[str]:
    """Get list of org roles that can be assigned by the current effective role"""
    if effective_role == UserRole.SUPERADMIN.value:
        # Superadmin can assign any org role
        return list(VALID_ORG_ROLES)
    elif effective_role == UserRole.ORG_ADMIN.value:
        # Org admins can assign org roles (not org_admin to prevent self-demotion issues)
        return list(VALID_ORG_ROLES)
    else:
        # Other roles cannot assign org roles
        return []

def sanitize_role(role: Optional[str]) -> str:
    """Sanitize and validate a role, returning default if invalid"""
    if not role or role not in VALID_ROLES:
        return UserRole.STUDENT.value
    return role

def get_role_badge_color(role: str) -> str:
    """Get the color scheme for role badges in the UI"""
    colors = {
        UserRole.STUDENT.value: 'blue',
        UserRole.PARENT.value: 'green',
        UserRole.ADVISOR.value: 'purple',
        UserRole.OBSERVER.value: 'teal',
        UserRole.ORG_ADMIN.value: 'orange',
        UserRole.ORG_MANAGED.value: 'indigo',
        UserRole.SUPERADMIN.value: 'red'
    }
    return colors.get(role, 'gray')

def requires_parent_child_link(parent_id: str, child_id: str, action: str) -> bool:
    """Check if a parent-child relationship is required for an action"""
    # Define actions that require parent-child relationship
    restricted_actions = {
        'view_diploma', 'view_progress'
    }
    return action in restricted_actions

def requires_advisor_student_link(advisor_id: str, student_id: str, action: str) -> bool:
    """Check if an advisor-student relationship is required for an action"""
    # Define actions that require advisor-student relationship
    restricted_actions = {
        'view_progress', 'generate_report'
    }
    return action in restricted_actions