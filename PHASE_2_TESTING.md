# Phase 2 Testing Guide - Multi-Organization Backend

**Date:** 2025-12-07
**Status:** Ready for testing at https://www.optioeducation.com
**Your Account:** tannerbowman@gmail.com (Superadmin)

---

## Overview

Phase 2 added complete backend infrastructure for multi-organization management. You can now test organization-aware quest filtering and admin operations through the browser.

---

## Pre-Testing Checklist

1. ✅ Deployment complete to production (main branch)
2. ✅ Database migrations applied (Phase 1 + Phase 2)
3. ✅ All backend routes registered
4. ✅ Auth decorators in place

---

## Testing Scenarios

### Test 1: Verify Existing Functionality Still Works

**Purpose:** Ensure Phase 2 didn't break existing features

**Steps:**
1. Login at https://www.optioeducation.com with your account
2. Navigate to Quest Hub
3. Verify you can see quests (should work as before)
4. Try enrolling in a quest
5. Verify quest details page loads

**Expected Result:**
- All existing quest functionality works normally
- No errors in browser console
- Quests are visible and accessible

**Why This Works:**
- Your account (tannerbowman@gmail.com) is in the "Optio" organization with policy `all_optio`
- You should see ALL global quests + Optio organization quests
- The new organization filtering runs transparently in the background

---

### Test 2: Organization Quest Filtering (As Student)

**Purpose:** Verify organization-aware quest filtering works for authenticated users

**Steps:**
1. Login with your student account (if you have one) or create a test student account
2. Navigate to Quest Hub
3. Open browser DevTools (F12) → Network tab
4. Filter for `/api/quests` requests
5. Look at the response payload

**Expected Result:**
- Request to `/api/quests` returns quests based on your organization's policy
- Response includes quests visible to your organization
- No server errors (check Network tab for 500 errors)

**What to Look For in Response:**
```json
{
  "success": true,
  "quests": [...],  // Should contain quests
  "total": <number>,
  "page": 1,
  "per_page": 12
}
```

---

### Test 3: Superadmin Organization Management (API Testing)

**Purpose:** Test organization management endpoints via browser DevTools

Since Phase 3 (Frontend) is not complete yet, we'll test the API directly using browser DevTools.

#### 3A: List All Organizations

**Steps:**
1. Login as tannerbowman@gmail.com
2. Open browser DevTools (F12) → Console tab
3. Run this JavaScript:

```javascript
fetch('/api/admin/organizations/organizations', {
  method: 'GET',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => {
  console.log('Organizations:', data);
  console.table(data.organizations);
});
```

**Expected Result:**
```json
{
  "organizations": [
    {
      "id": "<uuid>",
      "name": "Optio",
      "slug": "optio",
      "quest_visibility_policy": "all_optio",
      "is_active": true,
      "created_at": "...",
      "branding_config": {}
    }
  ],
  "total": 1
}
```

**Troubleshooting:**
- If you get 401 Unauthorized: Your session expired, login again
- If you get 403 Forbidden: Check that you're logged in as tannerbowman@gmail.com
- If you get 500 Server Error: Check backend logs in Render dashboard

---

#### 3B: Create a Test Organization

**Steps:**
1. Still in DevTools Console, run:

```javascript
fetch('/api/admin/organizations/organizations', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Test Organization',
    slug: 'test-org',
    quest_visibility_policy: 'curated'
  })
})
.then(r => r.json())
.then(data => {
  console.log('Created Organization:', data);
  // Save the org ID for next tests
  window.testOrgId = data.id;
  console.log('Org ID saved to window.testOrgId:', data.id);
});
```

**Expected Result:**
```json
{
  "id": "<uuid>",
  "name": "Test Organization",
  "slug": "test-org",
  "quest_visibility_policy": "curated",
  "is_active": true,
  "created_at": "...",
  "branding_config": {}
}
```

---

#### 3C: Get Organization Dashboard Data

**Steps:**
1. After creating the test org (above), run:

```javascript
fetch(`/api/admin/organizations/organizations/${window.testOrgId}`, {
  method: 'GET',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => {
  console.log('Organization Dashboard:', data);
  console.log('Users:', data.users.length);
  console.log('Quests:', data.organization_quests.length);
  console.log('Analytics:', data.analytics);
});
```

**Expected Result:**
```json
{
  "organization": {
    "id": "<uuid>",
    "name": "Test Organization",
    "slug": "test-org",
    "quest_visibility_policy": "curated",
    ...
  },
  "users": [],  // Empty for new org
  "organization_quests": [],  // Empty for new org
  "curated_quests": [],  // Empty (no quests granted yet)
  "analytics": {
    "total_users": 0,
    "total_completions": 0,
    "total_xp": 0
  }
}
```

---

#### 3D: Grant Quest Access (Curated Policy)

**Purpose:** Test granting a global Optio quest to the test organization

**Steps:**
1. First, get a global quest ID from the quest hub (any quest should work)
2. Copy a quest ID from the URL when viewing a quest (e.g., `/quests/<quest-id>`)
3. Run this in DevTools Console:

```javascript
// Replace <QUEST_ID> with an actual quest ID
const questId = '<QUEST_ID>';  // Get from quest hub URL

fetch(`/api/admin/organizations/organizations/${window.testOrgId}/quests/grant`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    quest_id: questId
  })
})
.then(r => r.json())
.then(data => {
  console.log('Quest Access Granted:', data);
});
```

**Expected Result:**
```json
{
  "id": "<uuid>",
  "organization_id": "<test-org-id>",
  "quest_id": "<quest-id>",
  "granted_by": "<your-user-id>",
  "granted_at": "..."
}
```

**Error Cases to Test:**
- Try granting access to an organization-specific quest (should fail with "Can only grant access to global Optio quests")
- Try granting access to an organization with `all_optio` policy (should fail with "Can only grant quest access for organizations with 'curated' policy")

---

#### 3E: Revoke Quest Access

**Steps:**
1. After granting access (above), revoke it:

```javascript
const questId = '<SAME_QUEST_ID>';

fetch(`/api/admin/organizations/organizations/${window.testOrgId}/quests/revoke`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    quest_id: questId
  })
})
.then(r => r.json())
.then(data => {
  console.log('Quest Access Revoked:', data);
});
```

**Expected Result:**
```json
{
  "message": "Quest access revoked"
}
```

---

### Test 4: Anonymous User Quest Filtering

**Purpose:** Verify anonymous users only see global public quests

**Steps:**
1. Open an incognito/private browser window
2. Navigate to https://www.optioeducation.com
3. Go to Quest Hub (without logging in)
4. Open DevTools → Network tab
5. Look at `/api/quests` request

**Expected Result:**
- Anonymous users should only see quests where:
  - `is_active = true`
  - `is_public = true`
  - `organization_id IS NULL` (global quests only)

**SQL Query That's Running:**
```sql
SELECT * FROM quests
WHERE is_active = true
  AND is_public = true
  AND organization_id IS NULL
```

---

### Test 5: Check Backend Logs

**Purpose:** Verify no errors during organization operations

**Steps:**
1. Go to Render Dashboard: https://dashboard.render.com
2. Navigate to Services → optio-prod-backend
3. Click "Logs" tab
4. Look for any errors after running the tests above

**What to Look For:**
- ✅ No 500 errors
- ✅ No Python exceptions
- ✅ No database query errors
- ✅ Successful log entries like "Organization created: Test Organization"

**Common Errors to Watch For:**
- `relation "organizations" does not exist` → Migration not applied
- `column "organization_id" does not exist` → Phase 1 migrations not applied
- `function get_org_total_xp does not exist` → Phase 2 migration 016 not applied

---

## Validation Checklist

After completing all tests, verify:

- [ ] Existing quest functionality works (Test 1)
- [ ] Organization-aware quest filtering works for authenticated users (Test 2)
- [ ] Can list all organizations as superadmin (Test 3A)
- [ ] Can create new organizations (Test 3B)
- [ ] Can view organization dashboard data (Test 3C)
- [ ] Can grant quest access for curated policy (Test 3D)
- [ ] Can revoke quest access (Test 3E)
- [ ] Anonymous users only see global public quests (Test 4)
- [ ] No errors in backend logs (Test 5)

---

## Known Limitations (Phase 2)

These are expected and will be addressed in Phase 3 (Frontend):

1. No admin UI for organization management yet
   - Must test via DevTools Console (as shown above)
   - Frontend pages coming in Phase 3

2. No visual indicator of which organization you're in
   - Users don't see their organization policy
   - Organization context is transparent to users

3. No way to assign users to different organizations via UI
   - Must use SQL directly in Supabase
   - Or wait for Phase 3 user management UI

4. No quest curation interface
   - Must use API directly (Test 3D/3E)
   - Visual interface coming in Phase 3

---

## If You Find Issues

**Report with:**
1. Which test scenario you were running
2. Browser console errors (screenshot)
3. Network tab showing the failed request (screenshot)
4. Backend logs from Render (if applicable)

**Common Fixes:**
- Clear browser cache and cookies
- Re-login if you get 401 errors
- Check that you're testing on the correct URL (production vs dev)
- Verify all migrations are applied in Supabase

---

## Next Steps After Testing

Once you've validated Phase 2:

1. **Phase 3 (Frontend Implementation)** - 8-10 hours
   - Organization admin dashboard UI
   - Quest curation interface
   - User management for organizations

2. **Phase 4 (Testing & Validation)** - 4-6 hours
   - Comprehensive integration tests
   - Performance testing
   - RLS policy verification

3. **Phase 5 (Rollout)** - Already deployed to production
   - Monitor logs for 24 hours
   - Create OnFire Learning organization
   - Assign users to appropriate organizations

---

**Good luck with testing!**

The backend infrastructure is solid and ready. Any issues you find now will help us refine before building the frontend UI.
