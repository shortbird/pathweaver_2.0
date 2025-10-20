# Phase 3: Frontend Refactoring - UPDATED PLAN

**Date:** October 20, 2025
**Status:** READY TO BEGIN
**Estimated Time:** 8-12 hours

---

## Pre-Phase 3 Status Check

**Phase 1 (Database):** ✅ 100% COMPLETE
- All tables deleted, columns removed, observer role added, quest sources simplified

**Phase 2 (Backend):** ✅ 95% COMPLETE
- All files deleted, blueprints removed, XP bonuses removed
- Minor cleanup items remain (documented in Phase 2 completion report)

**Phase 3 (Frontend):** ⏳ STARTING NOW

---

## UPDATED Phase 3 Task List

### Task 3.1: Delete Removed Feature Components ⏳ STARTING

**Files/Folders to DELETE:**

**Pages:**
- [ ] `frontend/src/pages/Pricing.jsx` (if exists)
- [ ] `frontend/src/pages/Subscription.jsx` (if exists)
- [ ] `frontend/src/pages/SubscriptionPage.jsx` (if exists)
- [ ] `frontend/src/pages/SubscriptionSuccess.jsx` (if exists)
- [ ] `frontend/src/pages/SubscriptionCancel.jsx` (if exists)
- [ ] `frontend/src/pages/Upgrade.jsx` (if exists)

**Components:**
- [ ] `frontend/src/components/collaborations/` (entire directory)
- [ ] `frontend/src/components/ratings/` (entire directory)
- [ ] `frontend/src/components/subscription/` (entire directory)
- [ ] `frontend/src/components/connections/Invitations/TeamUpInvite.jsx` (team-up specific)

**Strategy:**
1. Use Glob to find exact file paths
2. Verify each file before deletion (check if actually used)
3. Delete files one by one with Git tracking
4. Test after each deletion batch

---

### Task 3.2: Update Badge Components (SKIP - ALREADY CORRECT)

**Status:** Per refactor plan corrections, badge system is already simplified:
- No 5-level progression exists in codebase
- Badge cards already show earned/not-earned state
- Already display XP progress and quest count

**Action:** SKIP this task entirely

---

### Task 3.3: Update Quest Components

**Files to update:**
- [ ] `frontend/src/components/hub/QuestCard.jsx` or similar
- [ ] `frontend/src/pages/QuestDetail.jsx` or similar

**Changes:**
- Remove source badges/logos (Khan Academy, Brilliant)
- Remove collaboration/team-up buttons
- Remove rating stars display
- Remove rating submission form

**Strategy:**
1. Find actual quest component files (may differ from plan)
2. Search for collaboration/rating UI elements
3. Remove cleanly without breaking layout
4. Test quest browsing and detail pages

---

### Task 3.4: Update Profile/Stats Components (VERIFY FIRST)

**Status:** Need to verify if achievement levels and momentum ranks exist in frontend

**Files to check:**
- [ ] `frontend/src/components/profile/ProfileStats.jsx` (if exists)
- [ ] `frontend/src/pages/ProfilePage.jsx`
- [ ] Dashboard components

**Action:**
1. Use Grep to find "achievement" and "momentum" references
2. If found, remove and replace with simple XP milestones
3. If not found, SKIP this task

---

### Task 3.5: Update Connections Page ⚠️ PRIORITY

**File:** `frontend/src/components/connections/Invitations/InvitationsTab.jsx`

**Changes:**
- Remove TeamUpInvite component/import
- Keep ConnectionRequest component (1:1 connections still supported)
- Update tab to show only connection requests (NOT team-up invites)

**Strategy:**
1. Read InvitationsTab.jsx to see current structure
2. Remove team-up specific code
3. Keep connection request functionality intact
4. Update empty state messages if needed

---

### Task 3.6: Update Navigation/Routing ⚠️ PRIORITY

**File:** `frontend/src/App.jsx` or routing configuration

**Changes:**
- Remove `/pricing` route (if exists)
- Remove `/subscription` route
- Remove `/subscription/success` route
- Remove `/subscription/cancel` route
- Remove `/upgrade` route (if exists)

**Strategy:**
1. Find main routing file
2. Comment out routes first (safety)
3. Test navigation doesn't break
4. Permanently delete routes
5. Remove imports for deleted page components

---

### Task 3.7: Remove Tier-Based UI Elements

**Search patterns:**
- [ ] "upgrade" (button text, links)
- [ ] "premium" (feature badges)
- [ ] "tier" (tier requirement messages)
- [ ] "subscription" (subscription prompts)
- [ ] "paywall" (paywall modals)
- [ ] "@require_paid_tier" equivalent in frontend

**Files likely to contain tier references:**
- Navigation components
- Feature gatekeeping components
- Settings pages
- Quest/badge detail pages

**Strategy:**
1. Use Grep to find all instances
2. Review each instance in context
3. Remove tier checks and upgrade prompts
4. Replace with direct feature access

---

### Task 3.8: Update API Service

**File:** `frontend/src/services/api.js`

**Changes:**
- Remove collaboration API calls
- Remove rating API calls
- Remove subscription/tier API calls
- Keep all other endpoints

**Strategy:**
1. Read api.js file
2. Find and remove deleted endpoint functions
3. Search codebase for usage of removed functions
4. Remove usage or stub with error messages

---

### Task 3.9: Remove Stripe Components

**Search patterns:**
- [ ] "stripe" (Stripe SDK imports)
- [ ] "CardElement" (Stripe card input)
- [ ] "checkout" (checkout flows)

**Strategy:**
1. Use Grep to find Stripe references
2. Delete Stripe-related components
3. Remove Stripe script tags from index.html
4. Remove Stripe imports from package.json (optional)

---

### Task 3.10: Final Frontend Cleanup

**Actions:**
- [ ] Remove unused imports throughout codebase
- [ ] Update any hardcoded tier references
- [ ] Clean up dead code paths
- [ ] Update frontend error handling for removed endpoints

---

## Implementation Order (Priority-Based)

**HIGH PRIORITY (Do First):**
1. Task 3.6: Update Navigation/Routing
2. Task 3.5: Update Connections Page
3. Task 3.1: Delete Removed Feature Components

**MEDIUM PRIORITY:**
4. Task 3.3: Update Quest Components
5. Task 3.7: Remove Tier-Based UI Elements
6. Task 3.8: Update API Service

**LOW PRIORITY:**
7. Task 3.9: Remove Stripe Components
8. Task 3.4: Update Profile/Stats (if needed)
9. Task 3.10: Final Cleanup

---

## Testing Checklist (After Each Task)

- [ ] Navigate to affected pages
- [ ] Check browser console for errors
- [ ] Verify no broken links
- [ ] Test user flows (quest browsing, connections, etc.)
- [ ] Check responsive design on mobile
- [ ] Git commit after successful testing

---

## Success Criteria

**Phase 3 is complete when:**
1. All subscription/pricing pages deleted
2. All collaboration/team-up UI removed
3. All quest rating UI removed
4. Connections page shows only connection requests (no team-ups)
5. No tier-based feature gates or upgrade prompts
6. All navigation routes work correctly
7. No console errors on any page
8. All user flows tested and working

---

## Next Steps After Phase 3

**Phase 4:** LMS Integration Foundation (optional - not required for MVP)
**Phase 5:** Testing & Validation
**Phase 6:** Documentation Updates

---

**Ready to begin Task 3.1: Delete Removed Feature Components**
