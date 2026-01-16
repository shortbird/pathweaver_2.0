# Role System Fixes - Implementation Plan

## Issues Identified

### Issue 1: Org admins who are parents can't see parent tab
**Root Cause:** `Sidebar.jsx:131` checks `user?.role === 'parent'` directly instead of checking parental relationships.

When a parent joins an organization as org_admin:
- `role` becomes `org_managed`
- `org_role` becomes `org_admin`
- The parent tab check fails because `role !== 'parent'`

However, the user still has entries in `parent_student_links` or `managed_by_parent_id` relationships - the parental data exists, just the UI check is wrong.

### Issue 2: Moving student to org doesn't update role to org_managed
**Root Cause:** `user_management.py:965-968` only updates `organization_id`, not `role` or `org_role`.

The correct logic exists in `organization_management.py:408-419`:
```python
client.table('users').update({
    'organization_id': org_id,
    'role': 'org_managed',
    'org_role': org_role
})
```

But `user_management.py` only does:
```python
admin_client.table('users').update({'organization_id': organization_id})
```

---

## Solution Options for Issue 1 (Parent Tab Access)

### Option A: Check parent relationships, not role (Recommended)
**Concept:** Show parent tab based on actual parent-child data, not role.

**Implementation:**
1. Add `has_dependents` and `has_linked_students` to `/api/auth/me` response
2. Backend checks: `parent_student_links` has approved links OR users with `managed_by_parent_id` exist
3. AuthContext computes `isParent = has_dependents || has_linked_students`
4. Sidebar shows parent tab if `user?.isParent || effectiveRole === 'superadmin'`

**Pros:**
- Cleanly separates "parental capability" from "organization role"
- Scales well - any user type could theoretically be a parent
- Reflects actual data state
- No new columns needed

**Cons:**
- Requires 2 additional queries on `/api/auth/me` (can be optimized with counts)

### Option B: Add `is_parent` boolean flag to users table
**Concept:** Explicit flag for "has parental duties" regardless of role.

**Implementation:**
1. Add `is_parent` column to users table
2. Set `is_parent = true` when user creates dependents or accepts parent invitations
3. Sidebar checks `user.is_parent || effectiveRole === 'superadmin'`

**Pros:**
- Simple boolean check, fast
- No extra API queries needed

**Cons:**
- Denormalized data (must keep in sync with relationships)
- Another flag to maintain
- Migration needed to backfill existing parents

### Option C: Use effective role + check org_role for parent
**Concept:** Also check if `org_role === 'parent'` for org_managed users who are parents within their org.

**Implementation:**
1. Sidebar checks `effectiveRole === 'parent' || user?.org_role === 'parent'`

**Pros:**
- Minimal changes
- Works for org parents

**Cons:**
- Doesn't solve the real problem: org_admins who are ALSO parents
- An org_admin's org_role is `org_admin`, not `parent`

---

## Recommendation for Issue 1

**Option A (Check parent relationships)** is recommended because:
1. It's based on actual data, not flags that can get out of sync
2. Works for all scenarios (org_admin who is also parent, advisor who is parent, etc.)
3. No schema changes required
4. Clear separation: role determines permissions, relationships determine capabilities

**Specific implementation:**

Backend (`/api/auth/me` in `session.py`):
```python
# After fetching user data, add:
dependent_count = supabase.table('users').select('id', count='exact').eq('managed_by_parent_id', user_id).execute()
linked_count = supabase.table('parent_student_links').select('id', count='exact').eq('parent_user_id', user_id).eq('status', 'approved').execute()

user_data['has_dependents'] = dependent_count.count > 0
user_data['has_linked_students'] = linked_count.count > 0
```

Frontend (`AuthContext.jsx`):
```javascript
// In user state, compute:
const isParent = user?.has_dependents || user?.has_linked_students
```

Frontend (`Sidebar.jsx`):
```javascript
// Change line 131 from:
if (user?.role === 'parent')
// To:
if (user?.isParent || user?.has_dependents || user?.has_linked_students)
```

---

## Solution for Issue 2 (Role not updating to org_managed)

**Fix:** Update `user_management.py` to use the same logic as `organization_management.py`.

**Changes to `update_user_organization()` at line 964:**

When adding to org:
```python
# Get current user data
user_data = admin_client.table('users').select('role, org_role').eq('id', user_id).single().execute()
current_role = user_data.data.get('role', 'student')

# Don't change superadmin
if current_role == 'superadmin':
    return jsonify({'success': False, 'error': 'Cannot add superadmin to organization'}), 400

# If already org_managed, just update org_id
if current_role == 'org_managed':
    admin_client.table('users').update({'organization_id': organization_id}).eq('id', user_id).execute()
else:
    # Convert platform user to org user
    org_role = current_role if current_role in ['student', 'parent', 'advisor', 'observer'] else 'student'
    admin_client.table('users').update({
        'organization_id': organization_id,
        'role': 'org_managed',
        'org_role': org_role
    }).eq('id', user_id).execute()
```

When removing from org (line 938):
```python
# Get current org_role to restore
user_data = admin_client.table('users').select('org_role').eq('id', user_id).single().execute()
restore_role = user_data.data.get('org_role', 'student')

admin_client.table('users').update({
    'organization_id': None,
    'role': restore_role,  # Restore their role from org_role
    'org_role': None
}).eq('id', user_id).execute()
```

---

## Files to Modify

### Issue 1 (Parent tab access):
1. `backend/routes/auth/session.py` - Add parent relationship counts to `/api/auth/me`
2. `frontend/src/contexts/AuthContext.jsx` - Expose `isParent` computed property
3. `frontend/src/components/navigation/Sidebar.jsx` - Use relationship check instead of role

### Issue 2 (Role update on org assignment):
1. `backend/routes/admin/user_management.py` - Fix `update_user_organization` function (lines 920-990)

---

## Data Migration

Run SQL to fix existing users in broken state:
```sql
-- Find and fix users with organization_id but role != 'org_managed'
UPDATE users
SET
    org_role = CASE
        WHEN org_role IS NOT NULL THEN org_role
        WHEN role IN ('student', 'parent', 'advisor', 'observer') THEN role
        ELSE 'student'
    END,
    role = 'org_managed'
WHERE organization_id IS NOT NULL
  AND role != 'org_managed'
  AND role != 'superadmin';
```

---

## Summary

| Issue | Root Cause | Solution | Complexity |
|-------|------------|----------|------------|
| Parent tab not showing for org_admin parents | Sidebar checks `role === 'parent'` | Check actual parent relationships | Low |
| Role not updating to org_managed | Missing role update in user_management.py | Add role transition logic | Low |

Both fixes are straightforward and maintain the existing architecture. No major refactoring needed.
