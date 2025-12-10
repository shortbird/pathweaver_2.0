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
    ADMIN = 'admin'
    OBSERVER = 'observer'

# Role hierarchy for privilege checking
ROLE_HIERARCHY = {
    UserRole.ADMIN: 4,
    UserRole.ADVISOR: 2,
    UserRole.PARENT: 1,
    UserRole.STUDENT: 0,
    UserRole.OBSERVER: -1  # Special role with limited, relationship-based access
}

# Valid roles as a set for quick validation
VALID_ROLES = {role.value for role in UserRole}

# Role display names for UI
ROLE_DISPLAY_NAMES = {
    UserRole.STUDENT.value: 'Student',
    UserRole.PARENT.value: 'Parent',
    UserRole.ADVISOR.value: 'Advisor',
    UserRole.ADMIN.value: 'Administrator',
    UserRole.OBSERVER.value: 'Observer'
}

# Role descriptions
ROLE_DESCRIPTIONS = {
    UserRole.STUDENT.value: 'Can complete quests, earn XP, and build their diploma',
    UserRole.PARENT.value: 'Full platform access plus ability to view linked children\'s progress',
    UserRole.ADVISOR.value: 'Can manage student groups and view progress',
    UserRole.ADMIN.value: 'Full system access including user and quest management',
    UserRole.OBSERVER.value: 'Can view linked students\' portfolios and provide encouragement'
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
        UserRole.ADMIN.value: {
            'quests': ['view', 'create', 'edit', 'delete', 'start', 'complete'],
            'diploma': ['view_all', 'edit_all'],
            'collaborations': ['view_all', 'manage'],
            'profile': ['view_all', 'edit_all'],
            'admin_panel': ['full_access']
        },
        UserRole.OBSERVER.value: {
            'quests': [],
            'diploma': ['view_linked_students'],
            'collaborations': [],
            'profile': ['view_linked_students', 'edit_own'],
            'admin_panel': []
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
        # Only admins can manage roles
        if actor_role != UserRole.ADMIN.value:
            return False
        
        # Admins can manage all roles
        return True

def validate_role(role: str) -> bool:
    """Validate if a role string is valid"""
    return role in VALID_ROLES

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
    """Get list of roles that can be assigned by the current role"""
    if current_role == UserRole.ADMIN.value:
        # Admins can assign any role
        return list(VALID_ROLES)
    else:
        # Other roles cannot assign roles
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
        UserRole.ADMIN.value: 'red',
        UserRole.OBSERVER.value: 'cyan'
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