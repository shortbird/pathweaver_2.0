# E2E Test Plan for Optio Platform

## Test Organization Strategy

Tests are organized by user journey and feature area, prioritized by:
- **P0**: Critical user flows that must work (auth, core features)
- **P1**: Important features used daily (quests, badges, tasks)
- **P2**: Secondary features (profile, connections, settings)
- **P3**: Admin/special role features

---

## P0: Critical Authentication & Core Flows

### `auth.spec.js` ✅ (In Progress)
- [x] Display login page
- [x] Login with valid credentials
- [x] Show error for invalid credentials
- [x] Logout successfully
- [x] Redirect unauthenticated users from protected routes
- [x] Persist session across page refreshes (httpOnly cookies)
- [ ] Password strength validation on registration
- [ ] Email verification flow (if enabled)

### `portfolio.spec.js` (CORE FEATURE)
- [ ] View own diploma/portfolio page
- [ ] Verify badges display on portfolio
- [ ] Verify XP totals by pillar display correctly
- [ ] Portfolio slug URL works (e.g., `/portfolio/test-user`)
- [ ] Public portfolio page accessible without login
- [ ] Portfolio shows school credit distribution

---

## P1: Core Quest & Badge System

### `quest-enrollment.spec.js` ✅ (Complete)
- [x] Display available quests (public + user's own)
- [x] View quest details page
- [x] Start personalization flow for a quest
- [x] Answer personalization questions (interests, cross-curricular)
- [x] View personalized tasks after enrollment
- [x] Verify quest appears in "My Quests"
- [x] Drop/abandon a quest

### `quest-personalization.spec.js`
- [ ] Personalization session saves progress
- [ ] Can restart personalization session
- [ ] AI-generated tasks match selected interests
- [ ] Task difficulty appropriate for selections
- [ ] Can skip optional personalization questions

### `task-completion.spec.js`
- [ ] View task list for enrolled quest
- [ ] Submit text evidence for task
- [ ] Submit file/image evidence for task
- [ ] Mark task as complete
- [ ] XP awarded correctly after task completion
- [ ] Task marked as complete in UI
- [ ] Cannot re-complete already completed task
- [ ] Complete all tasks triggers quest completion

### `badge-claiming.spec.js`
- [ ] Display available badges
- [ ] View badge details (requirements, XP needed)
- [ ] Badge progress displays correctly
- [ ] Claim completed badge
- [ ] Cannot claim incomplete badge
- [ ] Claimed badge appears in profile
- [ ] Filter badges by pillar
- [ ] Badge claim updates portfolio

---

## P2: User Profile & Social Features

### `profile.spec.js`
- [ ] View own profile
- [ ] Edit display name
- [ ] Upload avatar image
- [ ] Update bio
- [ ] View XP breakdown by pillar
- [ ] View quest history
- [ ] View claimed badges

### `connections.spec.js`
- [ ] Send connection request
- [ ] Accept connection request
- [ ] Reject connection request
- [ ] View list of connections
- [ ] Remove connection
- [ ] Cannot send duplicate connection request

### `credit-tracker.spec.js`
- [ ] View credit distribution by subject
- [ ] Credits calculated correctly from completed quests
- [ ] XP to credit conversion (1000 XP = 1 credit)
- [ ] Filter credits by subject area
- [ ] Export transcript (if available)

---

## P2: Parent Features

### `parent-dashboard.spec.js`
- [ ] Parent can view dashboard
- [ ] View list of dependents
- [ ] Create new dependent profile
- [ ] Edit dependent profile
- [ ] Delete dependent profile
- [ ] Switch between parent and dependent contexts
- [ ] View dependent's progress/quests

### `dependent-management.spec.js`
- [ ] Create dependent (requires display_name, date_of_birth)
- [ ] COPPA validation (age < 13 requires parent management)
- [ ] Cannot create dependent with email
- [ ] Promote dependent to independent account at age 13
- [ ] Promotion requires email and password
- [ ] Parent can act as dependent for quest enrollment
- [ ] Parent can submit evidence as dependent

### `observer-system.spec.js`
- [ ] Send observer invitation
- [ ] Observer receives invitation email
- [ ] Observer accepts invitation (creates account)
- [ ] Observer views linked students
- [ ] Observer views student portfolio
- [ ] Student can view sent invitations
- [ ] Student can remove observer access

---

## P3: Admin & Special Features

### `admin-dashboard.spec.js`
- [ ] Admin can access admin dashboard
- [ ] Non-admin redirected from admin routes
- [ ] View user list
- [ ] View quest analytics
- [ ] View platform statistics

### `admin-user-management.spec.js`
- [ ] Search users
- [ ] View user details
- [ ] View user activity logs
- [ ] Filter users by role
- [ ] Filter users by organization

### `admin-quest-management.spec.js`
- [ ] Create new quest concept
- [ ] Edit quest details
- [ ] Activate/deactivate quest
- [ ] View quest completion statistics
- [ ] Delete quest (with confirmation)

### `organization-management.spec.js` (if applicable)
- [ ] Create organization
- [ ] Assign users to organization
- [ ] View organization analytics
- [ ] Manage organization quest access
- [ ] Update organization branding

---

## P3: Edge Cases & Error Handling

### `error-handling.spec.js`
- [ ] Handle 404 for non-existent quests
- [ ] Handle 404 for non-existent badges
- [ ] Handle network errors gracefully
- [ ] Show user-friendly error messages
- [ ] Rate limiting messages display correctly

### `accessibility.spec.js`
- [ ] Keyboard navigation works on main flows
- [ ] Screen reader labels present on forms
- [ ] Focus management on modals
- [ ] Color contrast meets WCAG standards
- [ ] Skip links present and functional

---

## Test Utilities Needed

### `helpers/auth.js`
- `loginAs(page, email, password)` - Reusable login helper
- `logout(page)` - Reusable logout helper
- `createTestUser(role)` - Create test users programmatically

### `helpers/quest.js`
- `enrollInQuest(page, questId)` - Quick quest enrollment
- `completeTask(page, taskId, evidence)` - Submit task evidence

### `helpers/db-cleanup.js`
- `resetTestUserProgress()` - Reset test account state between runs
- `deleteTestData()` - Clean up test data

---

## Implementation Priority

**Phase 1 (This Session):**
1. ✅ Fix `auth.spec.js`
2. ✅ Rebuild `quest-enrollment.spec.js`
3. Rebuild `task-completion.spec.js`
4. Rebuild `badge-claiming.spec.js`

**Phase 2 (Next):**
5. Create `portfolio.spec.js` (CORE FEATURE)
6. Create `profile.spec.js`
7. Create `parent-dashboard.spec.js`
8. Create `dependent-management.spec.js`

**Phase 3 (Later):**
9. Create `observer-system.spec.js`
10. Create `connections.spec.js`
11. Create `admin-*.spec.js` tests
12. Create `error-handling.spec.js`

---

## Notes

- All tests should use actual test account: `test@optioeducation.com` / `TestPassword123!`
- Tests run against live dev: https://optio-dev-frontend.onrender.com
- No retries during debugging (set to 0 in playwright.config.js)
- Each test file should be independent (no shared state between files)
- Use beforeEach hooks for common setup (like login)
- Use afterEach hooks for cleanup (if needed)
