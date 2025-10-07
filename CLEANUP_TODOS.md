# Frontend Cleanup & Bug Fix - Implementation Tracker

**Purpose:** Track progress of codebase cleanup before major frontend update

**Status:** 🟡 In Progress

---

## 🔴 PHASE 1: Critical Bug Fix (Day 1)

### Subscription Tier Update Bug
- [ ] **Fix SubscriptionSuccess.jsx** - Replace optimistic update with React Query invalidation and polling
- [ ] **Update AuthContext.jsx** - Ensure proper cache invalidation methods
- [ ] **Test subscription flow** - Verify tier updates immediately without refresh
- [ ] **Deploy to develop** - Push changes to develop branch
- [ ] **Live test** - Test on https://optio-dev-frontend.onrender.com

**Files to Modify:**
- `frontend/src/pages/SubscriptionSuccess.jsx`
- `frontend/src/contexts/AuthContext.jsx`

**Acceptance Criteria:**
✅ Subscription tier updates in UI immediately after Stripe payment
✅ No hard refresh or logout/login required
✅ Manual refresh button available as fallback

---

## 🟠 PHASE 2: Backend Cleanup (Days 2-3)

### Delete Quest Sources Feature
- [ ] **Delete** `backend/routes/sources.py` (219 lines)
- [ ] **Delete** `backend/routes/quest_sources.py` (280 lines)
- [ ] **Delete** `backend/routes/admin/quest_sources.py` (55 lines)
- [ ] **Update** `backend/app.py` - Remove blueprint registrations
- [ ] **Search frontend** - Find and remove any quest sources API calls
- [ ] **Test** - Ensure no broken imports or routes

### Fix Database Anti-patterns
- [ ] **Refactor** `backend/routes/quest_ideas.py`
  - [ ] Replace direct Supabase instantiation with `get_supabase_admin_client()`
  - [ ] Add consistent url_prefix: `/api/quest-ideas`
  - [ ] Test quest idea submission flow

### Standardize API Responses
- [ ] **Create** error response schema/format
- [ ] **Update** middleware to enforce consistent structure
- [ ] **Document** standard response format

**Files to Delete:**
- `backend/routes/sources.py`
- `backend/routes/quest_sources.py`
- `backend/routes/admin/quest_sources.py`

**Files to Modify:**
- `backend/app.py`
- `backend/routes/quest_ideas.py`

**Acceptance Criteria:**
✅ No quest sources routes exist
✅ No 500 errors from quest_ideas.py
✅ Consistent error format across all endpoints

---

## 🟡 PHASE 3: Frontend Cleanup (Days 4-5)

### Remove Duplicate/Legacy Code
- [ ] **Delete** `frontend/src/hooks/useUserData.js` (legacy version)
- [ ] **Search** for imports of legacy useUserData
- [ ] **Update** components to use React Query version from `hooks/api/useUserData.js`
- [ ] **Test** all affected components

### Fix Race Conditions
- [ ] **Refactor** `frontend/src/pages/FriendsPage.jsx`
  - [ ] Remove manual `useState` for friends/requests
  - [ ] Use only React Query hooks (`useFriends`, `useCollaborations`)
  - [ ] Remove duplicate data merging logic (lines 62-65)
  - [ ] Test friend request flow end-to-end

### Remove Debug Code
- [ ] **Remove** all 153 console.log statements
  - [ ] `ChatInterface.jsx` (7 statements)
  - [ ] `ParentDashboard.jsx` (8 statements)
  - [ ] `BadgeQuestLinker.jsx` (9 statements)
  - [ ] `AIContentPipeline.jsx` (9 statements)
  - [ ] `SubscriptionSuccess.jsx` (9 statements)
  - [ ] All other files (111 statements)

### Replace Window Events
- [ ] **Update** `QuestDetail.jsx` - Remove window.dispatchEvent for taskCompleted
- [ ] **Update** `DashboardPage.jsx` - Remove window.addEventListener for taskCompleted
- [ ] **Replace** with React Query invalidation using `queryClient.invalidateQueries()`
- [ ] **Test** task completion updates dashboard

**Files to Delete:**
- `frontend/src/hooks/useUserData.js`

**Files to Modify:**
- `frontend/src/pages/FriendsPage.jsx`
- `frontend/src/pages/QuestDetail.jsx`
- `frontend/src/pages/DashboardPage.jsx`
- 50+ other files (console.log removal)

**Acceptance Criteria:**
✅ No legacy useUserData imports
✅ FriendsPage shows no duplicates
✅ Zero console.log in production build
✅ Task completion updates via React Query

---

## 🟢 PHASE 4: Configuration & Testing (Days 6-7)

### ESLint Configuration
- [ ] **Add** ESLint rule: `'no-console': ['error', { allow: ['warn', 'error'] }]`
- [ ] **Create/update** `.eslintrc.js` or `.eslintrc.json`
- [ ] **Run** `npm run lint` and fix any issues
- [ ] **Test** build fails if console.log is present

### API Endpoint Constants (Future Improvement)
- [ ] **Create** `frontend/src/constants/apiEndpoints.ts`
- [ ] **Define** all API endpoints as constants
- [ ] **Document** endpoint structure
- [ ] (Optional) Migrate components to use constants

### Comprehensive Testing
- [ ] **Run** all tests in TESTING_PLAN.md
- [ ] **Document** any issues found
- [ ] **Fix** critical issues
- [ ] **Retest** after fixes

**Files to Create:**
- `.eslintrc.js` or `.eslintrc.json` (if not exists, else modify)
- `frontend/src/constants/apiEndpoints.ts` (optional)

**Acceptance Criteria:**
✅ ESLint prevents console statements
✅ All tests in TESTING_PLAN.md pass
✅ Ready for major frontend update

---

## 🚀 DEPLOYMENT CHECKLIST

### Develop Branch
- [ ] **Commit** all changes with descriptive messages
- [ ] **Push** to develop branch
- [ ] **Monitor** deployment on Render
- [ ] **Test** on https://optio-dev-frontend.onrender.com
- [ ] **Check** logs for errors
- [ ] **Run** smoke tests (5 min quick check)

### Main Branch (Production)
- [ ] **Verify** all develop tests pass
- [ ] **Create** pull request: develop → main
- [ ] **Review** changes
- [ ] **Merge** to main
- [ ] **Monitor** deployment on Render
- [ ] **Test** on https://www.optioeducation.com
- [ ] **Run** full regression suite (30 min)
- [ ] **Monitor** for 24 hours

---

## 📊 PROGRESS TRACKING

### Overall Progress
- Phase 1 (Critical Bug Fix): ⬜ 0/5 tasks complete
- Phase 2 (Backend Cleanup): ⬜ 0/9 tasks complete
- Phase 3 (Frontend Cleanup): ⬜ 0/11 tasks complete
- Phase 4 (Config & Testing): ⬜ 0/8 tasks complete
- Deployment: ⬜ 0/13 tasks complete

**Total:** 0/46 tasks complete (0%)

### Session Tracking
Update this section after each work session:

**Session 1 (2025-10-06):**
- Created TESTING_PLAN.md ✅
- Created CLEANUP_TODOS.md ✅
- Ready to start Phase 1

**Session 2:**
- [To be filled in]

**Session 3:**
- [To be filled in]

---

## 🐛 ISSUES FOUND DURING CLEANUP

Document any issues discovered during cleanup:

### Issue #1: [Title]
- **Severity:** Critical/High/Medium/Low
- **Description:** [What's wrong]
- **Fix Applied:** [How it was fixed]
- **Tested:** Yes/No
- **Commit:** [commit hash]

---

## 📝 NOTES & OBSERVATIONS

### Performance Improvements Noticed
- [List any performance gains]

### Code Quality Improvements
- [List any code quality wins]

### Technical Debt Identified
- [List any remaining technical debt to address later]

### Future Improvements
- Create TypeScript types for all API responses
- Implement automated E2E tests
- Set up error monitoring (Sentry)
- Add performance monitoring
- Create API documentation (OpenAPI/Swagger)

---

**Created:** 2025-10-06
**Last Updated:** 2025-10-06
**Estimated Completion:** 7 days
**Actual Completion:** TBD
