# Multi-Organization Implementation Plan

**Status:** 🟡 Phase 1 In Progress
**Created:** 2025-12-07
**Last Updated:** 2025-12-07
**Owner:** Tanner Bowman (Superadmin)

---

## Table of Contents
1. [Overview](#overview)
2. [Architecture Summary](#architecture-summary)
3. [Implementation Phases](#implementation-phases)
4. [Database Schema Changes](#database-schema-changes)
5. [Backend Changes](#backend-changes)
6. [Frontend Changes](#frontend-changes)
7. [Testing Strategy](#testing-strategy)
8. [Rollout Plan](#rollout-plan)
9. [Post-Launch Tasks](#post-launch-tasks)
10. [Cleanup Tasks](#cleanup-tasks)

---

## Overview

### Goal
Transform Optio from a single-tenant platform into a multi-organization platform where different organizations can have controlled access to Optio's quest library and create their own custom quests.

### Key Requirements (Answered Questions)
- ✅ **User-Org Relationship:** One organization per user, all data preserved on transfer
- ✅ **Quest Creation:** All users can create quests; user-created quests are global
- ✅ **Badge System:** Global badges + custom org badges (hybrid model)
- ✅ **XP & Progress:** Global XP tracking across platform
- ✅ **Achievement Ranks:** DEPRECATED - Remove all references to Explorer/Builder/Creator/Scholar/Sage
- ✅ **Social Features:** Global connections/friendships across organizations
- ✅ **Diploma Pages:** No organization branding, always public
- ✅ **Admin Levels:** Superadmin (platform) + Org Admin (per organization)
- ✅ **Visibility Policies:** 3 policies (all_optio, curated, private_only)
- ✅ **Org Creation:** Superadmin only
- ✅ **Analytics:** All analytics accessible to org admins
- ✅ **Billing:** Not implemented in platform
- ✅ **Migration:** All existing users/quests → "Optio" organization
- ✅ **LMS Integration:** Per-organization LMS connections (OnFire Learning uses SPARK)
- ✅ **AI Tutor:** Default tutor (no org-specific customization)

### Success Criteria
- [ ] Multiple organizations can operate independently on same platform
- [ ] Organizations can control quest visibility via policies
- [ ] Org admins can curate Optio quest library for their users
- [ ] All existing Optio users continue working without disruption
- [ ] OnFire Learning LMS integration continues to work
- [ ] Superadmin can manage all organizations from admin dashboard
- [ ] No achievement rank references remain in codebase

---

## Architecture Summary

### Organization Visibility Policies

**Policy 1: `all_optio` (Most Permissive)**
- Users see ALL global Optio quests (organization_id IS NULL)
- Users see ALL quests created by their organization (organization_id = their org)
- Use case: Organizations that want to supplement Optio's library

**Policy 2: `curated` (Selective)**
- Users see ONLY quests in `organization_quest_access` table
- Users see ALL quests created by their organization
- Use case: Organizations wanting tight content control

**Policy 3: `private_only` (Most Restrictive)**
- Users see ONLY quests created by their organization
- No global Optio quests visible
- Use case: Organizations with completely custom curriculum

### Data Model

```
organizations (NEW)
├── id (UUID, PK)
├── name (VARCHAR)
├── slug (VARCHAR, unique)
├── quest_visibility_policy (ENUM: all_optio, curated, private_only)
├── branding_config (JSONB) - Future: logo, colors
└── is_active (BOOLEAN)

users (MODIFIED)
├── organization_id (UUID, FK to organizations) - NEW
├── is_org_admin (BOOLEAN) - NEW
└── [existing columns...]

quests (MODIFIED)
├── organization_id (UUID, FK to organizations, NULLABLE) - NEW
│   └── NULL = global Optio quest
│   └── NOT NULL = organization-specific quest
└── [existing columns...]

organization_quest_access (NEW) - For 'curated' policy
├── id (UUID, PK)
├── organization_id (UUID, FK)
├── quest_id (UUID, FK)
└── granted_by (UUID, FK to users)

lms_integrations (MODIFIED)
├── organization_id (UUID, FK to organizations) - NEW
└── [existing columns...]
```

---

## Implementation Phases

### Phase 0: Cleanup & Preparation ✅
**Completed:** 2025-12-07 (1.5 hours) | **Commit:** `1b58368`

**Summary:** Removed achievement rank system (Explorer, Builder, Creator, Scholar, Sage) to simplify XP progression.

**Changes:**
- Removed `MASTERY_LEVELS`, `ACHIEVEMENT_TIERS`, and all rank calculation functions from [xp_progression.py](backend/config/xp_progression.py)
- Updated test files to remove tier progression validation
- Removed achievement rank messaging from [core_philosophy.md](core_philosophy.md)
- Students now earn pure cumulative XP without artificial levels

---

### Phase 1: Database Schema Migration ✅
**Completed:** 2025-12-07 (2 hours) | **Commit:** `89df8a8`

**Summary:** Created complete database foundation for multi-organization platform with 7 migrations.

**New Tables:**
- `organizations` - Core org table with 3 visibility policies (all_optio, curated, private_only)
- `organization_quest_access` - Curated quest selection per organization

**Modified Tables:**
- `users` - Added organization_id (FK, NOT NULL) and is_org_admin flag
- `quests` - Added organization_id (nullable, NULL = global quest)
- `lms_integrations` - Added organization_id (FK, NOT NULL)

**Key Features:**
- Created `quest_visible_to_user()` function implementing 3-policy visibility logic
- Updated RLS policies for organization-aware quest filtering
- All 49 existing users assigned to default "Optio" organization
- All 131 existing quests marked as global (visible to 'all_optio' orgs)
- Org admins can manage their organization's quests and curated library

**Migration Files:** [009-015](backend/database_migration/) applied via Supabase MCP

---

### Phase 2: Backend Repository & Service Layer
**Status:** 🟢 Complete
**Completed:** 2025-12-07 (3 hours) | **Commit:** Pending

**Summary:** Created complete backend infrastructure for multi-organization management with organization-aware quest filtering.

**Key Changes:**
1. **OrganizationRepository** ([backend/repositories/organization_repository.py](backend/repositories/organization_repository.py))
   - CRUD operations for organizations
   - Quest access management (grant/revoke for curated policy)
   - Organization analytics (users, completions, XP)
   - User and quest queries per organization

2. **OrganizationService** ([backend/services/organization_service.py](backend/services/organization_service.py))
   - Business logic for organization management
   - Policy validation (all_optio, curated, private_only)
   - Slug validation and uniqueness checks
   - Dashboard data aggregation

3. **QuestRepository Enhancement** ([backend/repositories/quest_repository.py](backend/repositories/quest_repository.py))
   - Added `get_quests_for_user()` method implementing 3-policy visibility system
   - Respects organization quest_visibility_policy
   - Filters quests based on: global quests, org quests, curated quests, user-created quests

4. **Auth Decorators** ([backend/utils/auth/decorators.py](backend/utils/auth/decorators.py))
   - `@require_superadmin` - Restricts to tannerbowman@gmail.com admin
   - `@require_org_admin` - Allows org admins + superadmin
   - Both pass user_id, organization_id, is_superadmin to routes

5. **Organization Routes** ([backend/routes/admin/organization_management.py](backend/routes/admin/organization_management.py))
   - `GET/POST /api/admin/organizations/organizations` - List/create orgs (superadmin)
   - `GET/PUT /api/admin/organizations/organizations/<org_id>` - Manage org (org admin)
   - `POST /api/admin/organizations/organizations/<org_id>/quests/grant` - Grant quest access
   - `POST /api/admin/organizations/organizations/<org_id>/quests/revoke` - Revoke access
   - `GET /api/admin/organizations/organizations/<org_id>/users` - List org users
   - `GET /api/admin/organizations/organizations/<org_id>/analytics` - Org analytics

6. **Quest Route Updates** ([backend/routes/quests.py](backend/routes/quests.py))
   - Authenticated users: Uses `get_quests_for_user()` for org-aware filtering
   - Anonymous users: Only see global public quests (organization_id IS NULL)

7. **Database Migration** ([backend/database_migration/016_create_org_analytics_function.sql](backend/database_migration/016_create_org_analytics_function.sql))
   - Created `get_org_total_xp()` RPC function for analytics

**All Phase 2 Tasks Completed:**
- ✅ OrganizationRepository with all methods
- ✅ Analytics RPC function
- ✅ OrganizationService with business logic
- ✅ QuestRepository.get_quests_for_user() method
- ✅ @require_superadmin and @require_org_admin decorators
- ✅ Organization management routes
- ✅ Quest routes updated for organization filtering
- ✅ Routes registered in app.py

---

#### Original Task Documentation (Collapsed)

<details>
<summary>Task 2.1: Create OrganizationRepository (Click to expand)</summary>

#### Task 2.1: Create OrganizationRepository

**File:** [backend/repositories/organization_repository.py](backend/repositories/organization_repository.py)

```python
from typing import Dict, Any, List, Optional
from backend.repositories.base_repository import BaseRepository

class OrganizationRepository(BaseRepository):
    """Repository for organization data access"""

    def __init__(self, client=None):
        super().__init__(client)
        self.table_name = 'organizations'

    def get_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        """Get organization by slug"""
        response = self.client.table(self.table_name)\
            .select('*')\
            .eq('slug', slug)\
            .eq('is_active', True)\
            .single()\
            .execute()
        return response.data if response.data else None

    def get_all_active(self) -> List[Dict[str, Any]]:
        """Get all active organizations"""
        response = self.client.table(self.table_name)\
            .select('*')\
            .eq('is_active', True)\
            .order('name')\
            .execute()
        return response.data if response.data else []

    def create_organization(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create new organization (superadmin only)"""
        response = self.client.table(self.table_name)\
            .insert(data)\
            .execute()
        return response.data[0] if response.data else None

    def update_organization(self, org_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update organization (superadmin only)"""
        response = self.client.table(self.table_name)\
            .update(data)\
            .eq('id', org_id)\
            .execute()
        return response.data[0] if response.data else None

    def get_organization_users(self, org_id: str) -> List[Dict[str, Any]]:
        """Get all users in an organization"""
        response = self.client.table('users')\
            .select('id, email, display_name, role, is_org_admin, total_xp')\
            .eq('organization_id', org_id)\
            .order('display_name')\
            .execute()
        return response.data if response.data else []

    def get_organization_quests(self, org_id: str) -> List[Dict[str, Any]]:
        """Get quests created by organization"""
        response = self.client.table('quests')\
            .select('*')\
            .eq('organization_id', org_id)\
            .eq('is_active', True)\
            .order('created_at.desc')\
            .execute()
        return response.data if response.data else []

    def get_curated_quests(self, org_id: str) -> List[Dict[str, Any]]:
        """Get curated quest access for organization"""
        response = self.client.table('organization_quest_access')\
            .select('quest_id, granted_at, granted_by, quests(*)')\
            .eq('organization_id', org_id)\
            .execute()
        return response.data if response.data else []

    def grant_quest_access(self, org_id: str, quest_id: str, granted_by: str) -> Dict[str, Any]:
        """Grant organization access to a quest (for curated policy)"""
        data = {
            'organization_id': org_id,
            'quest_id': quest_id,
            'granted_by': granted_by
        }
        response = self.client.table('organization_quest_access')\
            .insert(data)\
            .execute()
        return response.data[0] if response.data else None

    def revoke_quest_access(self, org_id: str, quest_id: str) -> bool:
        """Revoke organization access to a quest"""
        response = self.client.table('organization_quest_access')\
            .delete()\
            .eq('organization_id', org_id)\
            .eq('quest_id', quest_id)\
            .execute()
        return bool(response.data)

    def get_organization_analytics(self, org_id: str) -> Dict[str, Any]:
        """Get analytics for organization"""
        from backend.database import get_supabase_admin_client

        # Use admin client for analytics aggregation
        admin = get_supabase_admin_client()

        # Total users
        users_count = admin.table('users')\
            .select('id', count='exact')\
            .eq('organization_id', org_id)\
            .execute()

        # Total quests completed by org users
        completions = admin.table('quest_task_completions')\
            .select('user_id', count='exact')\
            .in_('user_id',
                admin.table('users')\
                .select('id')\
                .eq('organization_id', org_id)\
                .execute().data
            )\
            .execute()

        # Total XP earned by org users
        xp_result = admin.rpc('get_org_total_xp', {'org_id_param': org_id}).execute()

        return {
            'total_users': users_count.count,
            'total_completions': completions.count,
            'total_xp': xp_result.data if xp_result.data else 0
        }
```

**Subtasks:**
- [x] Create organization_repository.py
- [x] Implement all repository methods
- [x] Add docstrings to all methods
- [x] Create RPC function for analytics aggregation

**Analytics RPC Function:**
```sql
-- Add to migration file or run separately
CREATE OR REPLACE FUNCTION get_org_total_xp(org_id_param UUID)
RETURNS BIGINT AS $$
    SELECT COALESCE(SUM(total_xp), 0)
    FROM users
    WHERE organization_id = org_id_param;
$$ LANGUAGE SQL SECURITY DEFINER;
```

---

#### Task 2.2: Create OrganizationService

**File:** [backend/services/organization_service.py](backend/services/organization_service.py)

```python
from typing import Dict, Any, List, Optional
from backend.services.base_service import BaseService
from backend.repositories.organization_repository import OrganizationRepository

class OrganizationService(BaseService):
    """Business logic for organization management"""

    def __init__(self, client=None):
        super().__init__(client)
        self.org_repo = OrganizationRepository(client=self.client)

    def get_organization_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        """Get organization by slug"""
        return self.org_repo.get_by_slug(slug)

    def list_all_organizations(self) -> List[Dict[str, Any]]:
        """List all active organizations (superadmin only)"""
        return self.org_repo.get_all_active()

    def create_organization(
        self,
        name: str,
        slug: str,
        policy: str,
        created_by: str
    ) -> Dict[str, Any]:
        """Create new organization (superadmin only)"""

        # Validate policy
        valid_policies = ['all_optio', 'curated', 'private_only']
        if policy not in valid_policies:
            raise ValueError(f"Invalid policy. Must be one of: {', '.join(valid_policies)}")

        # Validate slug format (alphanumeric + hyphens only)
        import re
        if not re.match(r'^[a-z0-9-]+$', slug):
            raise ValueError("Slug must contain only lowercase letters, numbers, and hyphens")

        # Check if slug already exists
        existing = self.org_repo.get_by_slug(slug)
        if existing:
            raise ValueError(f"Organization with slug '{slug}' already exists")

        data = {
            'name': name,
            'slug': slug,
            'quest_visibility_policy': policy,
            'branding_config': {},
            'is_active': True
        }

        org = self.org_repo.create_organization(data)

        # Log organization creation
        self.logger.info(f"Organization created: {name} (slug: {slug}, policy: {policy}) by user {created_by}")

        return org

    def update_organization_policy(
        self,
        org_id: str,
        new_policy: str,
        updated_by: str
    ) -> Dict[str, Any]:
        """Update organization quest visibility policy"""

        valid_policies = ['all_optio', 'curated', 'private_only']
        if new_policy not in valid_policies:
            raise ValueError(f"Invalid policy. Must be one of: {', '.join(valid_policies)}")

        data = {'quest_visibility_policy': new_policy}
        org = self.org_repo.update_organization(org_id, data)

        self.logger.info(f"Organization {org_id} policy updated to {new_policy} by user {updated_by}")

        return org

    def get_organization_dashboard_data(self, org_id: str) -> Dict[str, Any]:
        """Get all data needed for org admin dashboard"""

        org = self.org_repo.get_by_id(org_id)
        users = self.org_repo.get_organization_users(org_id)
        quests = self.org_repo.get_organization_quests(org_id)
        analytics = self.org_repo.get_organization_analytics(org_id)

        # If curated policy, get curated quests
        curated_quests = []
        if org['quest_visibility_policy'] == 'curated':
            curated_quests = self.org_repo.get_curated_quests(org_id)

        return {
            'organization': org,
            'users': users,
            'organization_quests': quests,
            'curated_quests': curated_quests,
            'analytics': analytics
        }

    def grant_quest_access(
        self,
        org_id: str,
        quest_id: str,
        granted_by: str
    ) -> Dict[str, Any]:
        """Grant organization access to a quest (curated policy only)"""

        # Verify organization has curated policy
        org = self.org_repo.get_by_id(org_id)
        if org['quest_visibility_policy'] != 'curated':
            raise ValueError("Can only grant quest access for organizations with 'curated' policy")

        # Verify quest is a global Optio quest (organization_id IS NULL)
        from backend.repositories.quest_repository import QuestRepository
        quest_repo = QuestRepository(client=self.client)
        quest = quest_repo.get_by_id(quest_id)

        if quest['organization_id'] is not None:
            raise ValueError("Can only grant access to global Optio quests")

        result = self.org_repo.grant_quest_access(org_id, quest_id, granted_by)

        self.logger.info(f"Quest {quest_id} access granted to org {org_id} by user {granted_by}")

        return result

    def revoke_quest_access(
        self,
        org_id: str,
        quest_id: str,
        revoked_by: str
    ) -> bool:
        """Revoke organization access to a quest"""

        success = self.org_repo.revoke_quest_access(org_id, quest_id)

        if success:
            self.logger.info(f"Quest {quest_id} access revoked from org {org_id} by user {revoked_by}")

        return success
```

**Subtasks:**
- [x] Create organization_service.py
- [x] Implement all service methods
- [x] Add validation logic
- [x] Add logging for all organization changes

---

#### Task 2.3: Update QuestRepository for Organization Filtering

**File:** [backend/repositories/quest_repository.py](backend/repositories/quest_repository.py)

Add new method:

```python
def get_quests_for_user(
    self,
    user_id: str,
    filters: Dict[str, Any] = None,
    page: int = 1,
    limit: int = 20
) -> Dict[str, Any]:
    """
    Get quests visible to a user based on their organization's policy.
    This method handles all organization-aware filtering.
    """
    from backend.database import get_supabase_admin_client

    # Get user's organization and policy
    admin = get_supabase_admin_client()
    user_data = admin.table('users')\
        .select('organization_id, organizations(quest_visibility_policy)')\
        .eq('id', user_id)\
        .single()\
        .execute()

    org_id = user_data.data['organization_id']
    policy = user_data.data['organizations']['quest_visibility_policy']

    # Base query: only active quests
    query = self.client.table('quests').select('*', count='exact').eq('is_active', True)

    # Apply organization visibility policy
    if policy == 'all_optio':
        # Global quests (NULL) + organization quests
        query = query.or_(f'organization_id.is.null,organization_id.eq.{org_id}')

    elif policy == 'curated':
        # Get curated quest IDs
        curated = admin.table('organization_quest_access')\
            .select('quest_id')\
            .eq('organization_id', org_id)\
            .execute()

        quest_ids = [q['quest_id'] for q in curated.data]

        if quest_ids:
            # Curated quests + organization quests
            quest_ids_str = ','.join(f"'{qid}'" for qid in quest_ids)
            query = query.or_(
                f'id.in.({quest_ids_str}),'
                f'organization_id.eq.{org_id}'
            )
        else:
            # No curated quests, only org quests
            query = query.eq('organization_id', org_id)

    elif policy == 'private_only':
        # Only organization quests
        query = query.eq('organization_id', org_id)

    # Also include user's own created quests
    query = query.or_(f'created_by.eq.{user_id}')

    # Apply additional filters (pillar, quest_type, search, etc.)
    if filters:
        if 'pillar' in filters and filters['pillar']:
            query = query.eq('pillar_primary', filters['pillar'])
        if 'quest_type' in filters and filters['quest_type']:
            query = query.eq('quest_type', filters['quest_type'])
        if 'search' in filters and filters['search']:
            query = query.ilike('title', f"%{filters['search']}%")

    # Pagination
    offset = (page - 1) * limit
    query = query.range(offset, offset + limit - 1)

    # Execute query
    response = query.execute()

    return {
        'quests': response.data if response.data else [],
        'total': response.count,
        'page': page,
        'limit': limit
    }
```

**Subtasks:**
- [x] Add get_quests_for_user() method to QuestRepository
- [x] Update existing quest filtering methods to use this logic
- [ ] Add unit tests for organization filtering (Phase 4)

---

#### Task 2.4: Create Superadmin Decorator

**File:** [backend/middleware/auth.py](backend/middleware/auth.py)

Add new decorator:

```python
def require_superadmin(f):
    """
    Decorator to require superadmin role.
    Superadmin is defined as role='admin' AND email='tannerbowman@gmail.com'
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        from backend.database import get_supabase_admin_client
        from flask import request, jsonify

        # Get user_id from JWT token
        token = request.cookies.get('access_token')
        if not token:
            return jsonify({'error': 'No authentication token'}), 401

        try:
            import jwt
            from app_config import Config
            payload = jwt.decode(token, Config.SECRET_KEY, algorithms=['HS256'])
            user_id = payload.get('user_id')
        except Exception as e:
            return jsonify({'error': 'Invalid token'}), 401

        # Verify superadmin status
        admin = get_supabase_admin_client()
        user = admin.table('users').select('role, email').eq('id', user_id).single().execute()

        if not user.data or user.data['role'] != 'admin' or user.data['email'] != 'tannerbowman@gmail.com':
            return jsonify({'error': 'Superadmin access required'}), 403

        # Pass user_id to handler
        return f(user_id, *args, **kwargs)

    return decorated_function


def require_org_admin(f):
    """
    Decorator to require org admin or superadmin role.
    Org admins can manage their own organization.
    Superadmins can manage all organizations.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        from backend.database import get_supabase_admin_client
        from flask import request, jsonify

        # Get user_id from JWT token
        token = request.cookies.get('access_token')
        if not token:
            return jsonify({'error': 'No authentication token'}), 401

        try:
            import jwt
            from app_config import Config
            payload = jwt.decode(token, Config.SECRET_KEY, algorithms=['HS256'])
            user_id = payload.get('user_id')
        except Exception as e:
            return jsonify({'error': 'Invalid token'}), 401

        # Verify org admin or superadmin status
        admin = get_supabase_admin_client()
        user = admin.table('users')\
            .select('role, email, is_org_admin, organization_id')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user.data:
            return jsonify({'error': 'User not found'}), 404

        # Check if superadmin
        is_superadmin = (
            user.data['role'] == 'admin' and
            user.data['email'] == 'tannerbowman@gmail.com'
        )

        # Check if org admin
        is_org_admin = user.data.get('is_org_admin', False)

        if not (is_superadmin or is_org_admin):
            return jsonify({'error': 'Organization admin access required'}), 403

        # Pass user info to handler
        return f(user_id, user.data['organization_id'], is_superadmin, *args, **kwargs)

    return decorated_function
```

**Subtasks:**
- [x] Add @require_superadmin decorator
- [x] Add @require_org_admin decorator
- [ ] Test decorators with different user roles (Phase 4)

---

#### Task 2.5: Create Organization Admin Routes

**File:** [backend/routes/admin/organization_management.py](backend/routes/admin/organization_management.py)

```python
from flask import Blueprint, request, jsonify
from backend.middleware.auth import require_superadmin, require_org_admin
from backend.services.organization_service import OrganizationService
from backend.database import get_supabase_admin_client

bp = Blueprint('organization_management', __name__)

@bp.route('/organizations', methods=['GET'])
@require_superadmin
def list_organizations(superadmin_user_id):
    """List all organizations (superadmin only)"""
    try:
        service = OrganizationService(client=get_supabase_admin_client())
        organizations = service.list_all_organizations()

        return jsonify({
            'organizations': organizations,
            'total': len(organizations)
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/organizations', methods=['POST'])
@require_superadmin
def create_organization(superadmin_user_id):
    """Create new organization (superadmin only)"""
    try:
        data = request.get_json()

        # Validate required fields
        required = ['name', 'slug', 'quest_visibility_policy']
        for field in required:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        service = OrganizationService(client=get_supabase_admin_client())
        org = service.create_organization(
            name=data['name'],
            slug=data['slug'],
            policy=data['quest_visibility_policy'],
            created_by=superadmin_user_id
        )

        return jsonify(org), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/organizations/<org_id>', methods=['GET'])
@require_org_admin
def get_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Get organization details (org admin or superadmin)"""
    try:
        # Verify access: org admin can only view their org, superadmin can view all
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        service = OrganizationService(client=get_supabase_admin_client())
        org = service.get_organization_dashboard_data(org_id)

        return jsonify(org), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/organizations/<org_id>', methods=['PUT'])
@require_superadmin
def update_organization(superadmin_user_id, org_id):
    """Update organization (superadmin only)"""
    try:
        data = request.get_json()

        # Only allow updating specific fields
        allowed_fields = ['name', 'quest_visibility_policy', 'branding_config', 'is_active']
        update_data = {k: v for k, v in data.items() if k in allowed_fields}

        if not update_data:
            return jsonify({'error': 'No valid fields to update'}), 400

        service = OrganizationService(client=get_supabase_admin_client())

        # If updating policy, use dedicated method
        if 'quest_visibility_policy' in update_data:
            org = service.update_organization_policy(
                org_id,
                update_data['quest_visibility_policy'],
                superadmin_user_id
            )
        else:
            # Use repository directly for other updates
            from backend.repositories.organization_repository import OrganizationRepository
            repo = OrganizationRepository(client=get_supabase_admin_client())
            org = repo.update_organization(org_id, update_data)

        return jsonify(org), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/organizations/<org_id>/quests/grant', methods=['POST'])
@require_org_admin
def grant_quest_access(current_user_id, current_org_id, is_superadmin, org_id):
    """Grant organization access to a quest (curated policy only)"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        quest_id = data.get('quest_id')

        if not quest_id:
            return jsonify({'error': 'quest_id is required'}), 400

        service = OrganizationService(client=get_supabase_admin_client())
        result = service.grant_quest_access(org_id, quest_id, current_user_id)

        return jsonify(result), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/organizations/<org_id>/quests/revoke', methods=['POST'])
@require_org_admin
def revoke_quest_access(current_user_id, current_org_id, is_superadmin, org_id):
    """Revoke organization access to a quest"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        quest_id = data.get('quest_id')

        if not quest_id:
            return jsonify({'error': 'quest_id is required'}), 400

        service = OrganizationService(client=get_supabase_admin_client())
        success = service.revoke_quest_access(org_id, quest_id, current_user_id)

        if success:
            return jsonify({'message': 'Quest access revoked'}), 200
        else:
            return jsonify({'error': 'Failed to revoke access'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/organizations/<org_id>/users', methods=['GET'])
@require_org_admin
def list_organization_users(current_user_id, current_org_id, is_superadmin, org_id):
    """List users in organization"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        from backend.repositories.organization_repository import OrganizationRepository
        repo = OrganizationRepository(client=get_supabase_admin_client())
        users = repo.get_organization_users(org_id)

        return jsonify({
            'users': users,
            'total': len(users)
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/organizations/<org_id>/analytics', methods=['GET'])
@require_org_admin
def get_organization_analytics(current_user_id, current_org_id, is_superadmin, org_id):
    """Get analytics for organization"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        from backend.repositories.organization_repository import OrganizationRepository
        repo = OrganizationRepository(client=get_supabase_admin_client())
        analytics = repo.get_organization_analytics(org_id)

        return jsonify(analytics), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Subtasks:**
- [x] Create organization_management.py routes file
- [x] Implement all route handlers
- [x] Add error handling and validation
- [ ] Test all endpoints with Postman/curl (Phase 4)

---

#### Task 2.6: Update Quests Routes for Organization Filtering

**File:** [backend/routes/quests.py](backend/routes/quests.py)

Update the quest listing endpoint around line 94-110:

```python
@bp.route('/quests', methods=['GET'])
def get_quests():
    """Get quests with organization-aware filtering"""
    try:
        # Get current user if authenticated
        user_id = None
        token = request.cookies.get('access_token')
        if token:
            try:
                import jwt
                from app_config import Config
                payload = jwt.decode(token, Config.SECRET_KEY, algorithms=['HS256'])
                user_id = payload.get('user_id')
            except:
                pass  # Anonymous user

        # Get query parameters
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))
        pillar = request.args.get('pillar')
        quest_type = request.args.get('quest_type')
        search = request.args.get('search')

        filters = {}
        if pillar:
            filters['pillar'] = pillar
        if quest_type:
            filters['quest_type'] = quest_type
        if search:
            filters['search'] = search

        # Use repository method for organization-aware filtering
        from backend.repositories.quest_repository import QuestRepository
        from backend.database import get_user_client, get_supabase_client

        if user_id:
            # Authenticated user: apply organization policy
            client = get_user_client()
            quest_repo = QuestRepository(client=client)
            result = quest_repo.get_quests_for_user(
                user_id=user_id,
                filters=filters,
                page=page,
                limit=limit
            )
        else:
            # Anonymous user: only show global public quests
            client = get_supabase_client()
            query = client.table('quests')\
                .select('*', count='exact')\
                .eq('is_active', True)\
                .eq('is_public', True)\
                .is_('organization_id', 'null')  # Only global quests

            # Apply filters
            if pillar:
                query = query.eq('pillar_primary', pillar)
            if quest_type:
                query = query.eq('quest_type', quest_type)
            if search:
                query = query.ilike('title', f'%{search}%')

            # Pagination
            offset = (page - 1) * limit
            query = query.range(offset, offset + limit - 1)

            response = query.execute()
            result = {
                'quests': response.data if response.data else [],
                'total': response.count,
                'page': page,
                'limit': limit
            }

        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error fetching quests: {e}")
        return jsonify({'error': str(e)}), 500
```

**Subtasks:**
- [x] Update get_quests() route handler
- [ ] Test quest visibility for different policies (Phase 4)
- [ ] Verify anonymous users only see global quests (Phase 4)

---

#### Task 2.7: Register Organization Routes in App

**File:** [backend/app.py](backend/app.py)

Add import and blueprint registration:

```python
# Import organization routes
from backend.routes.admin import organization_management

# Register blueprint
app.register_blueprint(
    organization_management.bp,
    url_prefix='/api/admin/organizations'
)
```

**Subtasks:**
- [x] Import organization_management blueprint
- [x] Register blueprint with URL prefix
- [x] Test routes are accessible

</details>

---

#### Phase 2 Completion Checklist

- [x] OrganizationRepository created with all methods
- [x] OrganizationService created with business logic
- [x] QuestRepository updated with get_quests_for_user() method
- [x] @require_superadmin decorator created
- [x] @require_org_admin decorator created
- [x] Organization management routes created
- [x] Quest routes updated for organization filtering
- [x] All routes registered in app.py
- [x] Repository analytics RPC function created
- [ ] All code tested with different organization policies (Phase 4)

---

### Phase 3: Frontend Implementation
**Status:** 🔴 Not Started
**Estimated Time:** 8-10 hours

#### Task 3.1: Create Organization Context

**File:** [frontend/src/contexts/OrganizationContext.jsx](frontend/src/contexts/OrganizationContext.jsx)

```javascript
import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const OrganizationContext = createContext(null);

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
};

export const OrganizationProvider = ({ children }) => {
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrganization();
  }, []);

  const fetchOrganization = async () => {
    try {
      // Get current user's organization from their profile
      const { data } = await api.get('/api/user/profile');
      if (data.organization_id) {
        const orgResponse = await api.get(`/api/organizations/${data.organization_id}`);
        setOrganization(orgResponse.data);
      }
    } catch (error) {
      console.error('Failed to fetch organization:', error);
    } finally {
      setLoading(false);
    }
  };

  const value = {
    organization,
    loading,
    refreshOrganization: fetchOrganization
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
};
```

**Subtasks:**
- [ ] Create OrganizationContext.jsx
- [ ] Add OrganizationProvider to App.jsx
- [ ] Test context provides organization data

---

#### Task 3.2: Create Superadmin Organization Dashboard

**File:** [frontend/src/pages/admin/OrganizationDashboard.jsx](frontend/src/pages/admin/OrganizationDashboard.jsx)

```javascript
import React, { useState, useEffect } from 'react';
import api from '../../services/api';

export default function OrganizationDashboard() {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const { data } = await api.get('/api/admin/organizations/organizations');
      setOrganizations(data.organizations);
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading organizations...</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Organizations</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg"
        >
          Create Organization
        </button>
      </div>

      <div className="grid gap-4">
        {organizations.map(org => (
          <OrganizationCard key={org.id} organization={org} onUpdate={fetchOrganizations} />
        ))}
      </div>

      {showCreateModal && (
        <CreateOrganizationModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchOrganizations();
          }}
        />
      )}
    </div>
  );
}

function OrganizationCard({ organization, onUpdate }) {
  const policyLabels = {
    all_optio: 'All Optio Quests',
    curated: 'Curated Quests',
    private_only: 'Private Only'
  };

  return (
    <div className="border rounded-lg p-6 bg-white shadow-sm">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-bold">{organization.name}</h3>
          <p className="text-gray-600">Slug: {organization.slug}</p>
          <p className="text-sm text-gray-500 mt-2">
            Policy: {policyLabels[organization.quest_visibility_policy]}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/admin/organizations/${organization.id}`}
            className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
          >
            Manage
          </a>
        </div>
      </div>
    </div>
  );
}

function CreateOrganizationModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    quest_visibility_policy: 'all_optio'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.post('/api/admin/organizations/organizations', formData);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Create Organization</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
              className="w-full border rounded px-3 py-2"
              pattern="[a-z0-9-]+"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, hyphens only</p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Quest Visibility Policy</label>
            <select
              value={formData.quest_visibility_policy}
              onChange={(e) => setFormData({ ...formData, quest_visibility_policy: e.target.value })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="all_optio">All Optio Quests + Org Quests</option>
              <option value="curated">Curated Quests + Org Quests</option>
              <option value="private_only">Organization Quests Only</option>
            </select>
          </div>

          {error && (
            <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Subtasks:**
- [ ] Create OrganizationDashboard.jsx
- [ ] Create CreateOrganizationModal component
- [ ] Add route in frontend routing
- [ ] Test organization creation

---

#### Task 3.3: Create Organization Admin Management Page

**File:** [frontend/src/pages/admin/OrganizationManagement.jsx](frontend/src/pages/admin/OrganizationManagement.jsx)

```javascript
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../services/api';

export default function OrganizationManagement() {
  const { orgId } = useParams();
  const [orgData, setOrgData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchOrganizationData();
  }, [orgId]);

  const fetchOrganizationData = async () => {
    try {
      const { data } = await api.get(`/api/admin/organizations/organizations/${orgId}`);
      setOrgData(data);
    } catch (error) {
      console.error('Failed to fetch organization:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!orgData) {
    return <div className="p-8">Organization not found</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">{orgData.organization.name}</h1>

      <div className="mb-6 border-b">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 ${activeTab === 'overview' ? 'border-b-2 border-optio-purple' : ''}`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 ${activeTab === 'users' ? 'border-b-2 border-optio-purple' : ''}`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('quests')}
            className={`px-4 py-2 ${activeTab === 'quests' ? 'border-b-2 border-optio-purple' : ''}`}
          >
            Quests
          </button>
          {orgData.organization.quest_visibility_policy === 'curated' && (
            <button
              onClick={() => setActiveTab('curation')}
              className={`px-4 py-2 ${activeTab === 'curation' ? 'border-b-2 border-optio-purple' : ''}`}
            >
              Quest Curation
            </button>
          )}
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 ${activeTab === 'analytics' ? 'border-b-2 border-optio-purple' : ''}`}
          >
            Analytics
          </button>
        </nav>
      </div>

      {activeTab === 'overview' && <OverviewTab orgData={orgData} />}
      {activeTab === 'users' && <UsersTab users={orgData.users} />}
      {activeTab === 'quests' && <QuestsTab quests={orgData.organization_quests} />}
      {activeTab === 'curation' && <CurationTab orgId={orgId} curatedQuests={orgData.curated_quests} onUpdate={fetchOrganizationData} />}
      {activeTab === 'analytics' && <AnalyticsTab analytics={orgData.analytics} />}
    </div>
  );
}

function OverviewTab({ orgData }) {
  const policyLabels = {
    all_optio: 'All Optio Quests + Org Quests',
    curated: 'Curated Quests + Org Quests',
    private_only: 'Organization Quests Only'
  };

  return (
    <div className="grid gap-6">
      <div className="bg-white rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold mb-4">Organization Details</h2>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="font-medium text-gray-600">Name</dt>
            <dd className="text-lg">{orgData.organization.name}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">Slug</dt>
            <dd className="text-lg font-mono">{orgData.organization.slug}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">Quest Visibility Policy</dt>
            <dd className="text-lg">{policyLabels[orgData.organization.quest_visibility_policy]}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">Status</dt>
            <dd className="text-lg">
              {orgData.organization.is_active ? (
                <span className="text-green-600">Active</span>
              ) : (
                <span className="text-red-600">Inactive</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total Users</h3>
          <p className="text-3xl font-bold">{orgData.analytics.total_users}</p>
        </div>
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Quest Completions</h3>
          <p className="text-3xl font-bold">{orgData.analytics.total_completions}</p>
        </div>
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total XP Earned</h3>
          <p className="text-3xl font-bold">{orgData.analytics.total_xp.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ users }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">XP</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Org Admin</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map(user => (
            <tr key={user.id}>
              <td className="px-6 py-4">{user.display_name}</td>
              <td className="px-6 py-4">{user.email}</td>
              <td className="px-6 py-4">{user.role}</td>
              <td className="px-6 py-4">{user.total_xp.toLocaleString()}</td>
              <td className="px-6 py-4">
                {user.is_org_admin ? (
                  <span className="text-green-600">Yes</span>
                ) : (
                  <span className="text-gray-400">No</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuestsTab({ quests }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pillar</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {quests.map(quest => (
            <tr key={quest.id}>
              <td className="px-6 py-4">{quest.title}</td>
              <td className="px-6 py-4">{quest.quest_type}</td>
              <td className="px-6 py-4">{quest.pillar_primary}</td>
              <td className="px-6 py-4">
                {quest.is_active ? (
                  <span className="text-green-600">Active</span>
                ) : (
                  <span className="text-gray-400">Inactive</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CurationTab({ orgId, curatedQuests, onUpdate }) {
  const [showAddModal, setShowAddModal] = useState(false);

  const handleRevoke = async (questId) => {
    if (!confirm('Remove this quest from your curated library?')) return;

    try {
      await api.post(`/api/admin/organizations/organizations/${orgId}/quests/revoke`, {
        quest_id: questId
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to revoke quest access:', error);
      alert('Failed to revoke quest access');
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-bold">Curated Quests</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded"
        >
          Add Quest
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pillar</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Granted At</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {curatedQuests.map(item => (
              <tr key={item.quest_id}>
                <td className="px-6 py-4">{item.quests.title}</td>
                <td className="px-6 py-4">{item.quests.pillar_primary}</td>
                <td className="px-6 py-4">{new Date(item.granted_at).toLocaleDateString()}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleRevoke(item.quest_id)}
                    className="text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <AddQuestModal
          orgId={orgId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            onUpdate();
          }}
        />
      )}
    </div>
  );
}

function AddQuestModal({ orgId, onClose, onSuccess }) {
  const [globalQuests, setGlobalQuests] = useState([]);
  const [selectedQuest, setSelectedQuest] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGlobalQuests();
  }, []);

  const fetchGlobalQuests = async () => {
    try {
      // Fetch all quests, then filter for global ones in frontend
      const { data } = await api.get('/api/quests?limit=100');
      // Filter for global quests only (organization_id is null)
      const global = data.quests.filter(q => !q.organization_id);
      setGlobalQuests(global);
    } catch (error) {
      console.error('Failed to fetch quests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.post(`/api/admin/organizations/organizations/${orgId}/quests/grant`, {
        quest_id: selectedQuest
      });
      onSuccess();
    } catch (error) {
      console.error('Failed to grant quest access:', error);
      alert(error.response?.data?.error || 'Failed to grant quest access');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Add Quest to Library</h2>

        {loading ? (
          <p>Loading quests...</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Select Global Optio Quest</label>
              <select
                value={selectedQuest}
                onChange={(e) => setSelectedQuest(e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              >
                <option value="">Choose a quest...</option>
                {globalQuests.map(quest => (
                  <option key={quest.id} value={quest.id}>
                    {quest.title} ({quest.pillar_primary})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded"
              >
                Add Quest
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function AnalyticsTab({ analytics }) {
  return (
    <div className="grid gap-4">
      <div className="bg-white rounded-lg p-6 shadow">
        <h3 className="text-lg font-bold mb-4">Organization Analytics</h3>
        <dl className="grid grid-cols-3 gap-4">
          <div>
            <dt className="text-sm text-gray-600">Total Users</dt>
            <dd className="text-2xl font-bold">{analytics.total_users}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Total Completions</dt>
            <dd className="text-2xl font-bold">{analytics.total_completions}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Total XP Earned</dt>
            <dd className="text-2xl font-bold">{analytics.total_xp.toLocaleString()}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
```

**Subtasks:**
- [ ] Create OrganizationManagement.jsx
- [ ] Create all tab components (Overview, Users, Quests, Curation, Analytics)
- [ ] Add AddQuestModal for curated policy
- [ ] Add route for `/admin/organizations/:orgId`
- [ ] Test all tabs and functionality

---

#### Task 3.4: Update Admin Navigation

**File:** [frontend/src/components/admin/AdminNav.jsx](frontend/src/components/admin/AdminNav.jsx) (or wherever admin nav is located)

Add link to organization management:

```javascript
<NavLink to="/admin/organizations" className="nav-link">
  Organizations
</NavLink>
```

**Subtasks:**
- [ ] Add "Organizations" link to admin navigation
- [ ] Test navigation works
- [ ] Ensure link only shows for superadmin

---

#### Task 3.5: Update Quest Filtering (Transparent to Users)

The quest filtering already happens server-side, so frontend changes are minimal. Just ensure quest listing components work correctly.

**File:** [frontend/src/pages/QuestBadgeHub.jsx](frontend/src/pages/QuestBadgeHub.jsx)

No changes needed - quest filtering happens server-side via updated `/api/quests` endpoint.

**Subtasks:**
- [ ] Test quest visibility for users in different organizations
- [ ] Verify users only see quests according to their org policy
- [ ] Test anonymous users only see global public quests

---

#### Phase 3 Completion Checklist

- [ ] OrganizationContext created and provider added to App
- [ ] OrganizationDashboard page created (superadmin)
- [ ] OrganizationManagement page created (org admin)
- [ ] CreateOrganizationModal component working
- [ ] Quest curation interface working (AddQuestModal)
- [ ] Organization navigation added to admin menu
- [ ] All tabs in OrganizationManagement tested
- [ ] Quest visibility tested for all three policies
- [ ] Anonymous user quest visibility tested

---

### Phase 4: Testing & Validation
**Status:** 🔴 Not Started
**Estimated Time:** 4-6 hours

#### Task 4.1: Database Testing

**Test Cases:**
- [ ] Create new organization via SQL
- [ ] Assign user to organization
- [ ] Create organization-specific quest
- [ ] Grant quest access via organization_quest_access
- [ ] Test RLS policies with different user roles
- [ ] Test quest_visible_to_user() function with all three policies

**SQL Test Script:**
```sql
-- Create test organization
INSERT INTO organizations (name, slug, quest_visibility_policy)
VALUES ('Test Org', 'test-org', 'curated')
RETURNING *;

-- Create test user in that org
INSERT INTO users (email, display_name, organization_id, is_org_admin, role)
VALUES ('testuser@test.com', 'Test User', '<org_id>', false, 'student')
RETURNING *;

-- Test quest visibility function
SELECT quest_visible_to_user('<quest_id>'::UUID, '<user_id>'::UUID);

-- Verify RLS policies
SET ROLE authenticated;
SET request.jwt.claims.sub = '<user_id>';
SELECT * FROM quests WHERE is_active = true;
```

---

#### Task 4.2: Backend API Testing

**Test with cURL or Postman:**

```bash
# Create organization (superadmin)
curl -X POST http://localhost:5000/api/admin/organizations/organizations \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "Test Organization",
    "slug": "test-org",
    "quest_visibility_policy": "curated"
  }'

# Get organization
curl -X GET http://localhost:5000/api/admin/organizations/organizations/<org_id> \
  -b cookies.txt

# Grant quest access
curl -X POST http://localhost:5000/api/admin/organizations/organizations/<org_id>/quests/grant \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"quest_id": "<quest_id>"}'

# List quests (should respect org policy)
curl -X GET http://localhost:5000/api/quests \
  -b cookies.txt
```

**Test Cases:**
- [ ] Create organization (superadmin only)
- [ ] Update organization policy (superadmin only)
- [ ] Grant quest access (org admin)
- [ ] Revoke quest access (org admin)
- [ ] List organization users (org admin)
- [ ] Get organization analytics (org admin)
- [ ] Quest listing respects organization policy
- [ ] Non-org-admin cannot access org admin routes
- [ ] Non-superadmin cannot create organizations

---

#### Task 4.3: Frontend Testing

**Manual Test Cases:**
- [ ] Superadmin can access /admin/organizations
- [ ] Superadmin can create new organization
- [ ] Org admin can access their organization's management page
- [ ] Org admin cannot access other organization's pages
- [ ] Curated policy: Org admin can add/remove quests from library
- [ ] All policy: Users see all global quests + org quests
- [ ] Curated policy: Users see only curated quests + org quests
- [ ] Private policy: Users see only org quests
- [ ] Quest hub filters work correctly
- [ ] Organization analytics display correctly

---

#### Task 4.4: Integration Testing

**Test Scenarios:**

**Scenario 1: New Organization with All Optio Policy**
1. Superadmin creates organization with policy=all_optio
2. Create new user in that organization
3. Login as that user
4. Verify user sees all global Optio quests + any org quests
5. Create a quest as that user
6. Verify quest is global (organization_id = NULL per requirements)

**Scenario 2: Curated Policy Organization**
1. Superadmin creates organization with policy=curated
2. Create org admin user in that organization
3. Login as org admin
4. Grant access to 3 specific global quests
5. Create 2 organization-specific quests
6. Create regular student user in same organization
7. Login as student
8. Verify student sees only the 3 curated quests + 2 org quests

**Scenario 3: Private Only Policy Organization**
1. Superadmin creates organization with policy=private_only
2. Create organization-specific quests
3. Create student user in that organization
4. Login as student
5. Verify student sees ONLY organization quests (no global quests)

**Scenario 4: OnFire Learning LMS Integration**
1. Verify OnFire Learning organization exists (or create it)
2. Assign OnFire users to OnFire organization
3. Verify SPARK LMS integration has organization_id set
4. Test course quest enrollment for OnFire users
5. Verify LMS webhook still works correctly

**Scenario 5: User Transfer Between Organizations**
1. Create user in Organization A
2. User completes quests, earns XP, earns badges
3. Superadmin changes user's organization_id to Organization B
4. Verify user keeps all XP, badges, quest completions
5. Verify user now sees Organization B's quest library

---

#### Task 4.5: Performance Testing

**Test Cases:**
- [ ] Quest listing with 100+ quests (check query performance)
- [ ] Organization with 500+ users (analytics performance)
- [ ] RLS policy enforcement doesn't cause N+1 queries
- [ ] Curated policy with 50+ curated quests performs well

**Performance Benchmarks:**
- Quest listing should load in < 500ms
- Organization analytics should load in < 1s
- RLS function should execute in < 50ms

---

#### Phase 4 Completion Checklist

- [ ] All database test cases passed
- [ ] All backend API test cases passed
- [ ] All frontend test cases passed
- [ ] All integration scenarios tested successfully
- [ ] Performance benchmarks met
- [ ] No RLS policy violations found
- [ ] Quest visibility working correctly for all three policies
- [ ] OnFire Learning LMS integration still working

---

### Phase 5: Rollout & Migration
**Status:** 🔴 Not Started
**Estimated Time:** 2-3 hours

#### Task 5.1: Prepare Production Migration

**Pre-Migration Checklist:**
- [ ] All Phase 0-4 tasks completed
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Migrations tested in development
- [ ] Backup plan prepared

**Migration Files to Run (in order):**
1. 009_create_organizations_table.sql
2. 010_add_organization_to_users.sql
3. 011_add_organization_to_quests.sql
4. 012_create_organization_quest_access.sql
5. 013_add_organization_to_lms.sql
6. 014_update_quest_rls_policies.sql
7. 015_organization_triggers.sql

---

#### Task 5.2: Create OnFire Learning Organization

**Before Running Migration 013:**

```sql
-- Create OnFire Learning organization
INSERT INTO organizations (name, slug, quest_visibility_policy)
VALUES ('OnFire Learning', 'onfire', 'all_optio')
RETURNING *;

-- Note the ID for next step
```

**Update Migration 013:**
```sql
-- In migration 013, update OnFire LMS integration
UPDATE lms_integrations
SET organization_id = (SELECT id FROM organizations WHERE slug = 'onfire')
WHERE lms_type = 'spark';

-- Assign OnFire users to OnFire organization
-- (If you can identify them by email domain or other criteria)
UPDATE users
SET organization_id = (SELECT id FROM organizations WHERE slug = 'onfire')
WHERE email LIKE '%@onfirelearning.com%';
```

**Subtasks:**
- [ ] Create OnFire Learning organization
- [ ] Assign OnFire users to OnFire org
- [ ] Assign SPARK LMS integration to OnFire org
- [ ] Verify OnFire users can access their LMS quests

---

#### Task 5.3: Run Production Migrations

**Steps:**
1. [ ] Notify users of upcoming maintenance (if applicable)
2. [ ] Create database backup
3. [ ] Run migrations using Supabase MCP in sequence
4. [ ] Verify each migration succeeded before running next
5. [ ] Run verification queries after all migrations complete
6. [ ] Test critical flows (login, quest listing, enrollment)

**Verification Queries:**
```sql
-- Verify all users have organization
SELECT COUNT(*) FROM users WHERE organization_id IS NULL;
-- Should be 0

-- Verify organizations exist
SELECT * FROM organizations;
-- Should show Optio + OnFire Learning (at minimum)

-- Verify quest visibility function works
SELECT quest_visible_to_user(
  (SELECT id FROM quests WHERE is_active = true LIMIT 1),
  (SELECT id FROM users LIMIT 1)
);
-- Should return true/false

-- Verify RLS policies exist
SELECT policyname FROM pg_policies WHERE tablename = 'quests';
-- Should show new org-aware policies
```

---

#### Task 5.4: Deploy Backend Code

**Steps:**
1. [ ] Merge feature branch to `develop`
2. [ ] Auto-commit changes
3. [ ] Push to `develop` branch
4. [ ] Monitor Render deployment logs
5. [ ] Verify deployment succeeded
6. [ ] Check backend logs for errors
7. [ ] Test API endpoints in development environment

**Verification:**
```bash
# Test organizations endpoint
curl https://optio-dev-backend.onrender.com/api/admin/organizations/organizations \
  -b cookies.txt

# Test quest listing
curl https://optio-dev-backend.onrender.com/api/quests \
  -b cookies.txt
```

---

#### Task 5.5: Deploy Frontend Code

**Steps:**
1. [ ] Verify backend deployment succeeded first
2. [ ] Frontend auto-deploys when backend is done (same commit)
3. [ ] Monitor Render deployment logs for frontend
4. [ ] Verify frontend build succeeded
5. [ ] Visit https://optio-dev-frontend.onrender.com
6. [ ] Test organization management UI

**Verification:**
- [ ] Can access /admin/organizations (as superadmin)
- [ ] Can create new organization
- [ ] Can manage organization settings
- [ ] Quest hub shows correct quests based on policy

---

#### Task 5.6: Production Deployment (After Testing in Dev)

**Only after dev testing is complete:**

1. [ ] Merge `develop` to `main` branch
2. [ ] Monitor production deployment
3. [ ] Run smoke tests in production
4. [ ] Monitor error logs for 24 hours
5. [ ] Communicate with OnFire Learning about changes

**Production Verification:**
- [ ] OnFire Learning users can still access their quests
- [ ] SPARK LMS integration working
- [ ] Optio users can access global quest library
- [ ] No performance degradation
- [ ] No RLS policy errors in logs

---

#### Phase 5 Completion Checklist

- [ ] All migrations run successfully in production
- [ ] Default Optio organization created
- [ ] OnFire Learning organization created
- [ ] All users assigned to appropriate organizations
- [ ] Backend code deployed to develop and tested
- [ ] Frontend code deployed to develop and tested
- [ ] Production deployment successful
- [ ] OnFire Learning verified working
- [ ] No errors in production logs
- [ ] Rollback plan documented (if needed)

---

## Post-Launch Tasks

### Task PL.1: Documentation Updates
- [ ] Update API documentation with new organization endpoints
- [ ] Document organization admin workflows
- [ ] Create guide for creating new organizations
- [ ] Update developer onboarding docs
- [ ] Document organization policies for support team

### Task PL.2: Monitoring & Metrics
- [ ] Set up alerts for RLS policy violations
- [ ] Monitor quest visibility query performance
- [ ] Track organization creation rate
- [ ] Monitor organization analytics usage
- [ ] Set up dashboard for org metrics

### Task PL.3: User Communication
- [ ] Email OnFire Learning about multi-org changes
- [ ] Update help documentation
- [ ] Create FAQ for organization admins
- [ ] Prepare support responses for common questions

### Task PL.4: Future Enhancements
- [ ] Organization branding customization (logos, colors)
- [ ] Custom badges per organization
- [ ] Organization-specific AI tutor context
- [ ] Cross-organization collaboration features
- [ ] Organization analytics export

---

## Cleanup Tasks

### Cleanup.1: Remove Achievement Rank Code

**Status:** 🔴 Not Started (Part of Phase 0)

This is a prerequisite before starting Phase 1. See Phase 0 for complete checklist.

**Quick Summary:**
- [ ] Remove rank calculations from backend
- [ ] Remove rank displays from frontend
- [ ] Update documentation to remove rank messaging
- [ ] Test that XP system still works without ranks

### Cleanup.2: Remove Old Organization Endpoints

**File:** [backend/routes/admin/user_management.py](backend/routes/admin/user_management.py)

```python
# DELETE these routes (lines 777-867):
# - assign_user_to_organization()
# - get_organizations()
```

**Subtasks:**
- [ ] Delete deprecated organization endpoints in user_management.py
- [ ] Verify no code calls these endpoints
- [ ] Remove any frontend code that called these endpoints

### Cleanup.3: Code Review & Optimization

**Post-Launch Review:**
- [ ] Review all SQL queries for optimization opportunities
- [ ] Add database indexes if needed (org_id columns)
- [ ] Review RLS function performance
- [ ] Optimize quest filtering queries
- [ ] Remove any dead code
- [ ] Add missing error handling

---

## Rollback Plan

If critical issues occur during rollout:

### Rollback Steps

1. **Database Rollback:**
   ```sql
   -- Rollback migrations in reverse order
   BEGIN;

   -- Drop organization tables
   DROP TABLE IF EXISTS organization_quest_access CASCADE;
   DROP FUNCTION IF EXISTS quest_visible_to_user CASCADE;

   -- Remove organization columns
   ALTER TABLE users DROP COLUMN IF EXISTS organization_id CASCADE;
   ALTER TABLE users DROP COLUMN IF EXISTS is_org_admin CASCADE;
   ALTER TABLE quests DROP COLUMN IF EXISTS organization_id CASCADE;
   ALTER TABLE lms_integrations DROP COLUMN IF EXISTS organization_id CASCADE;

   -- Drop organizations table
   DROP TABLE IF EXISTS organizations CASCADE;

   -- Restore old RLS policies (from migration 008)
   -- (Copy policies from backup)

   COMMIT;
   ```

2. **Code Rollback:**
   - [ ] Revert develop branch to previous commit
   - [ ] Force push to Render
   - [ ] Monitor deployment
   - [ ] Verify old functionality restored

3. **Communication:**
   - [ ] Notify stakeholders of rollback
   - [ ] Document what went wrong
   - [ ] Plan fix and re-deployment

---

## Progress Tracking

### Overall Progress: 0%

**Phase 0 (Cleanup):** 🔴 0% (0/50 tasks)
**Phase 1 (Database):** 🔴 0% (0/20 tasks)
**Phase 2 (Backend):** 🔴 0% (0/25 tasks)
**Phase 3 (Frontend):** 🔴 0% (0/20 tasks)
**Phase 4 (Testing):** 🔴 0% (0/25 tasks)
**Phase 5 (Rollout):** 🔴 0% (0/15 tasks)

---

## Update Instructions

**After completing tasks, update this document:**

1. Check off completed tasks with `[x]`
2. Update phase status:
   - 🔴 Not Started (0%)
   - 🟡 In Progress (1-99%)
   - 🟢 Complete (100%)
3. Update overall progress percentage
4. Add notes about any deviations from plan
5. Document any issues encountered
6. Update "Last Updated" date at top
7. Commit changes to repository

**Example Update:**
```markdown
**Phase 0 (Cleanup):** 🟡 45% (23/50 tasks)

Notes:
- Achievement rank removal took longer than expected due to extensive frontend references
- Found additional rank references in CRM components
- Updated core_philosophy.md successfully
```

---

## Questions & Decisions Log

**Document key decisions here as implementation progresses:**

**Decision 1:** Existing quests global vs org-owned
- **Status:** PENDING
- **Options:** A) NULL (global) | B) Assign to Optio org
- **Recommendation:** Option A (global)
- **Decision:** TBD
- **Date:** 2025-01-07

**Decision 2:** User-created quests ownership
- **Status:** RESOLVED
- **Decision:** User-created quests are global (organization_id = NULL)
- **Rationale:** Per requirements, user quests are globally accessible
- **Date:** 2025-01-07

**Decision 3:** OnFire Learning organization setup
- **Status:** PENDING
- **Decision:** Create OnFire org before running migration 013
- **Date:** 2025-01-07

---

## Contact & Support

**Implementation Owner:** Tanner Bowman (tannerbowman@gmail.com)
**Technical Questions:** Claude Code (this agent)
**Documentation:** [backend/docs/MULTI_ORG_IMPLEMENTATION.md](backend/docs/MULTI_ORG_IMPLEMENTATION.md)

---

**End of Implementation Plan**
