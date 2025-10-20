# Phase 1 Testing Checklist - Dev Site

**Test Site:** https://optio-dev-frontend.onrender.com
**Backend:** https://optio-dev-backend.onrender.com
**Date:** January 2025

## ⚠️ CRITICAL: What Changed in Phase 1

### Database Changes (COMPLETED)
- 6 tables DELETED (collaborations, ratings, subscriptions)
- 5 user columns REMOVED (subscription fields)
- Observer role ADDED
- Quest sources SIMPLIFIED (all = 'optio')
- LMS columns ADDED to quests

### What STILL WORKS (Backend routes not deleted yet)
- Collaboration routes still exist (will be removed in Phase 2)
- Subscription routes still exist (will be removed in Phase 2)
- Rating routes still exist (will be removed in Phase 2)

---

## 🎯 Primary Testing Goals

1. **Verify core functionality unaffected** by database table deletions
2. **Check for broken references** to deleted subscription columns
3. **Ensure no crashes** from missing tables
4. **Validate quest system** still works with simplified sources

---

## ✅ Test Checklist

### 1. User Registration & Authentication (CRITICAL)

**Why:** Users table modified (subscription columns removed)

- [ ] Register new account at /register
  - [ ] Registration completes successfully
  - [ ] No errors about subscription_tier
  - [ ] Default role assigned correctly
- [ ] Login with new account
  - [ ] Login succeeds
  - [ ] Dashboard loads without errors
- [ ] Logout and login again
  - [ ] Session persistence works

**Expected:** All auth flows work normally, no subscription-related errors

---

### 2. Dashboard Page (HIGH PRIORITY)

**Why:** Dashboard may reference deleted subscription/collaboration data

- [ ] Visit /dashboard after login
  - [ ] Page loads without errors
  - [ ] User stats display correctly (XP, level, quests)
  - [ ] Active quests section loads
  - [ ] No JavaScript console errors
- [ ] Check browser console for:
  - [ ] No 404 errors for deleted API endpoints
  - [ ] No "subscription_tier undefined" errors
  - [ ] No "collaboration" related errors

**Expected:** Dashboard loads cleanly, showing user progress

---

### 3. Quest Discovery & Starting (CRITICAL)

**Why:** Quest sources simplified, collaboration features removed

- [ ] Navigate to /quests or /badges (QuestBadgeHub)
  - [ ] Quest list loads successfully
  - [ ] All 35 quests visible
  - [ ] Quest images display correctly
- [ ] Click on any quest
  - [ ] Quest detail page loads (/quests/:id)
  - [ ] Tasks list displays
  - [ ] ~~Team-up button~~ (may still appear - ignore for now)
- [ ] Click "Start Quest"
  - [ ] Quest starts successfully
  - [ ] No errors about quest_collaborations table
  - [ ] Quest appears in active quests

**Expected:** All quests startable and functional

---

### 4. Quest Task Completion (CRITICAL)

**Why:** Core XP system, needs to work despite table deletions

- [ ] Start a quest with simple tasks
- [ ] Complete first task:
  - [ ] Add evidence (text/link)
  - [ ] Submit task
  - [ ] Task marked complete
  - [ ] XP awarded and displayed
  - [ ] No errors in console
- [ ] Complete second task:
  - [ ] Same process works
  - [ ] XP accumulates correctly
- [ ] Check /dashboard
  - [ ] Total XP updated
  - [ ] Progress shown correctly

**Expected:** Task completion works, XP awarded (bonuses still active in Phase 1)

---

### 5. Badge System (MEDIUM PRIORITY)

**Why:** Badge system references user_skill_xp (unchanged)

- [ ] Navigate to /badges
  - [ ] Badge carousel loads
  - [ ] Badge images display
- [ ] Click on a badge
  - [ ] Progress toward badge shown
  - [ ] "x/y quests completed" displays
  - [ ] "x/y XP earned" displays
- [ ] If eligible, select badge
  - [ ] Badge selection works
  - [ ] No errors

**Expected:** Badge system fully functional

---

### 6. Profile & Settings (MEDIUM PRIORITY)

**Why:** User profile may reference deleted subscription columns

- [ ] Navigate to /profile
  - [ ] Profile loads successfully
  - [ ] ~~Subscription tier~~ should NOT display
  - [ ] Display name, bio editable
  - [ ] Avatar upload works
- [ ] Update profile information
  - [ ] Changes save successfully
  - [ ] No subscription-related errors
- [ ] Check /settings
  - [ ] Settings page loads
  - [ ] No subscription management section (or shows error)

**Expected:** Profile works, no subscription references

---

### 7. Connections Page (LOW PRIORITY - Known Issues)

**Why:** Collaboration features being removed, but friendships still work

- [ ] Navigate to /connections
  - [ ] Page loads
  - [ ] "Your Connections" tab works
  - [ ] ~~"Invitations" tab may show team-up invites~~ (ignore errors)
- [ ] Send connection request (not collaboration)
  - [ ] Request sends successfully
  - [ ] No database errors
- [ ] Accept/decline connection
  - [ ] Friendship operations work

**Expected:** Friendships work, team-up features may error (OK for now)

---

### 8. Admin Panel (IF YOU HAVE ADMIN ACCESS)

**Why:** Admin routes may reference deleted tables

- [ ] Navigate to /admin
  - [ ] Admin dashboard loads
  - [ ] User list displays
  - [ ] ~~Subscription tier column~~ may show empty/error (OK)
- [ ] Quest management
  - [ ] Quest list loads
  - [ ] Can create new quest
  - [ ] Source defaults to 'optio'
  - [ ] ~~LMS fields visible~~ (new feature)
- [ ] User management
  - [ ] Can view user details
  - [ ] ~~Subscription info may error~~ (OK for now)

**Expected:** Core admin functions work, subscription stuff may be broken

---

### 9. Diploma/Portfolio Page (CRITICAL)

**Why:** Core product feature, must work flawlessly

- [ ] Navigate to /diploma/:userId or /portfolio/:slug
  - [ ] Portfolio page loads
  - [ ] Completed quests display
  - [ ] XP radar chart renders
  - [ ] Badge showcase displays
  - [ ] No console errors
- [ ] Share portfolio
  - [ ] Public URL works when logged out
  - [ ] All content visible

**Expected:** Portfolio page 100% functional

---

### 10. Error Scenarios (IMPORTANT)

**Test these scenarios to catch edge cases:**

- [ ] Try accessing deleted endpoints directly:
  - Visit: `https://optio-dev-backend.onrender.com/api/collaborations/invites`
  - **Expected:** Either 404 or empty array (routes still exist)
- [ ] Check browser Network tab for:
  - [ ] Any 500 errors from missing tables
  - [ ] Any 404s for deleted endpoints
  - [ ] Any failed API calls
- [ ] Check browser Console for:
  - [ ] JavaScript errors
  - [ ] "undefined" property errors
  - [ ] React component errors

**Expected:** No critical errors, graceful degradation

---

## 📝 Test Results Template

**Copy this to report results:**

```
Date Tested: [DATE]
Tester: [YOUR NAME]
Environment: Dev (optio-dev-frontend.onrender.com)

CRITICAL ISSUES (breaks core functionality):
- [ ] None found / [describe issue]

MEDIUM ISSUES (feature impaired but workarounds exist):
- [ ] None found / [describe issue]

LOW ISSUES (cosmetic or non-essential features):
- [ ] Team-up invitations show errors (expected - Phase 2 fix)
- [ ] Subscription references may appear (expected - Phase 2 fix)

SUMMARY:
- Core quest system: [ ] PASS / [ ] FAIL
- User auth: [ ] PASS / [ ] FAIL
- Dashboard: [ ] PASS / [ ] FAIL
- Badge system: [ ] PASS / [ ] FAIL
- Diploma page: [ ] PASS / [ ] FAIL

READY FOR PHASE 2? [ ] YES / [ ] NO (explain why)
```

---

## 🚨 Critical Issues to Watch For

1. **500 Errors** - Indicates missing table/column causing server crash
2. **White Screen** - React component crashed, check console
3. **XP Not Awarded** - Core functionality broken
4. **Can't Start Quests** - Critical blocker
5. **Can't Complete Tasks** - Critical blocker

## ✅ Known Non-Issues (Expected in Phase 1)

- Team-up/collaboration features may error (routes exist but tables deleted)
- Subscription references may appear (routes exist but columns deleted)
- Admin panel subscription management broken (expected)
- Quest ratings may still show in UI (will be removed in Phase 2)

---

## 📞 Report Issues

If you find CRITICAL issues:
1. Note the exact error message
2. Note the page/action that triggered it
3. Check browser console for JavaScript errors
4. Check Network tab for failed API calls
5. Report back before proceeding to Phase 2

**Phase 2 should NOT start if critical issues found.**
