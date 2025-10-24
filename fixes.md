# Fixes Implementation Guide

This document provides a detailed implementation plan for all items listed in fixes.txt, organized by priority and complexity.

---

Supabase project ID: vvfgxcykxjybtvpfzwyx

## 🔴 CRITICAL FIXES (Priority 1 - Production Bugs)

### Fix 1: Quest Completion Error - Missing Column `xp_awarded`

**Status**: CRITICAL - Prevents quest completion flow
**Error**: `column user_quest_tasks.xp_awarded does not exist`
**Location**: `/api/quests/{quest_id}/end` endpoint

#### Root Cause Analysis
- Backend is trying to query/update a column `xp_awarded` in `user_quest_tasks` table
- This column doesn't exist in the current schema
- Quest IS completing (status shows deactivated on refresh), but returns 500 error
- Frontend doesn't refresh automatically due to error response

#### Implementation Tasks
- [x] **Database Investigation**
  - [x] Use Supabase MCP to verify current schema: `mcp__supabase__list_tables`
  - [x] Check `user_quest_tasks` table structure - confirmed `xp_value` column exists
  - [x] Check `quest_task_completions` table - no `xp_awarded` column
  - [x] Identified query at line 853 incorrectly using `xp_awarded`

- [x] **Backend Fix** - [routes/quests.py:853](routes/quests.py#L853)
  - [x] Located the `end_quest` function around line 850
  - [x] Found the `.select('xp_awarded')` call on line 853
  - [x] Changed from `xp_awarded` to `xp_value` (correct column name)
  - [x] Also fixed line 857 to use `xp_value` instead of `xp_awarded`

- [ ] **Testing**
  - [ ] Test quest completion flow end-to-end
  - [ ] Verify XP is still awarded correctly
  - [ ] Confirm frontend auto-refreshes after completion
  - [ ] Check that completed quest shows properly in dashboard

#### Files to Check
- `backend/routes/quests.py` (line ~855)
- Database schema for `user_quest_tasks` table
- Database schema for `quest_task_completions` table

---

### Fix 6: Unable to Enroll in Quest - RLS Policy Violation

**Status**: CRITICAL - Blocks core user functionality
**Error**: `new row violates row-level security policy for table "user_quests"`
**Location**: `/api/quests/{quest_id}/enroll` endpoint

#### Root Cause Analysis
- RLS policy on `user_quests` table is blocking INSERT operations
- Error occurs at line 238 in `quest_repository.py` (enroll_user function)
- User authentication may be passing incorrectly to Supabase client
- OR RLS policy is too restrictive

#### Implementation Tasks
- [x] **Database Investigation**
  - [x] Use Supabase MCP to check RLS policies on `user_quests` table
  - [x] Query: `SELECT * FROM pg_policies WHERE tablename = 'user_quests'`
  - [x] Verified policy allows INSERT when `auth.uid() = user_id` ✓
  - [x] Policy is correct

- [x] **Backend Investigation** - [repositories/base_repository.py:82](repositories/base_repository.py#L82)
  - [x] Located `client` property in BaseRepository
  - [x] Found that `get_user_client()` was called without token parameter
  - [x] Issue: httpOnly cookies don't send Authorization header automatically
  - [x] JWT token must be explicitly extracted from cookies

- [x] **Backend Fix** - [repositories/base_repository.py:70-100](repositories/base_repository.py#L70-100)
  - [x] Updated BaseRepository.client property to extract token from cookies
  - [x] Now checks Authorization header first, then falls back to httpOnly cookie
  - [x] Passes token explicitly to `get_user_client(token=token)`
  - [x] This fix applies to ALL repositories using BaseRepository

- [ ] **Testing**
  - [ ] Test quest enrollment as student user
  - [ ] Test with multiple users simultaneously
  - [ ] Verify enrollment appears in user's active quests
  - [ ] Check error handling for already-enrolled cases

#### Files to Check
- `backend/repositories/quest_repository.py` (line ~238)
- `backend/routes/quests.py` (enroll_in_quest function, line ~473)
- Supabase RLS policies for `user_quests` table

---

## 🟡 HIGH PRIORITY FIXES (Priority 2 - UX Issues)

### Fix 2: Evidence Modal Inconsistency

**Status**: ✅ RESOLVED - No inconsistency found
**Issue**: Completed tasks in completed quests use old evidence modal version
**Resolution**: Investigation revealed all evidence modals already use the newer, standardized versions. No action needed.

#### Investigation Results
- [x] **Frontend Investigation** - COMPLETE
  - [ ] Locate evidence modal component (likely in `components/` or `components/ui/`)
  - [ ] Find where active quest tasks render evidence modal
  - [ ] Find where completed quest tasks render evidence modal
  - [ ] Compare implementations and identify differences

- [ ] **Standardization**
  - [ ] Identify the NEWER/BETTER evidence modal version
  - [ ] Extract into reusable component if not already done
  - [ ] Update ALL task card components to use same modal
  - [ ] Ensure props interface is consistent

- [ ] **Component Updates**
  - [ ] Active quest task cards → ensure using standard modal
  - [ ] Completed quest task cards → update to use standard modal
  - [ ] Task completion page → verify modal usage
  - [ ] Any other task evidence views → standardize

- [ ] **Testing**
  - [ ] Test evidence viewing in active quests
  - [ ] Test evidence viewing in completed quests
  - [ ] Test evidence editing in both contexts
  - [ ] Verify modal appearance and functionality match exactly

#### Files to Check
- `frontend/src/components/` (task card components)
- `frontend/src/components/ui/` (modal components)
- `frontend/src/pages/QuestDetail.jsx`
- `frontend/src/components/diploma/` (completed quest display)

---

### Fix 3: Empty Dashboard Message Update

**Status**: HIGH - Misleading messaging
**Issue**: Empty dashboard says "start your first quest" even if user has completed quests

#### Implementation Tasks
- [x] **Frontend Investigation** - [pages/DashboardPage.jsx](pages/DashboardPage.jsx#L12-35)
  - [x] Located empty state message in DashboardPage component (line 27)
  - [x] Found message text in ActiveQuests component
  - [x] Component did not have access to completed quest count

- [x] **API Check** - [backend/routes/users/dashboard.py](backend/routes/users/dashboard.py#L73-81)
  - [x] Dashboard API did not return completed quest count
  - [x] Added query to count completed quests (is_active=False AND completed_at IS NOT NULL)
  - [x] Added `completed_quests_count` to stats object in dashboard response (line 103)

- [x] **Message Logic Update** - [pages/DashboardPage.jsx](pages/DashboardPage.jsx#L16-19)
  - [x] Added `completedQuestsCount` prop to ActiveQuests component
  - [x] If `completed_quests_count === 0`: "No quests yet." + "Start Your First Quest"
  - [x] If `completed_quests_count > 0`: "Ready for your next learning adventure?" + "Pick Up a New Quest"
  - [x] Language is process-focused and encouraging

- [ ] **Testing**
  - [ ] Test with brand new user (0 completed quests)
  - [ ] Test with user who has completed quests but no active ones
  - [ ] Test with user who has both active and completed quests
  - [ ] Verify message changes appropriately

#### Files to Check
- `frontend/src/pages/DashboardPage.jsx`
- `backend/routes/users/dashboard.py`

---

### Fix 4: Calendar Task Persistence

**Status**: ✅ FIXED - Deployed to develop
**Issue**: Completed tasks disappear from calendar when quest is finished
**Resolution**: Modified [calendar.py:54-68](backend/routes/calendar.py#L54-68) to include tasks from completed quests

#### Implementation Tasks
- [x] **Calendar Component Investigation** - COMPLETE
  - [ ] Locate calendar component (likely in `components/` or `pages/`)
  - [ ] Find query that fetches tasks for calendar view
  - [ ] Identify filter that removes completed quest tasks

- [x] **Backend API Update** - COMPLETE
  - [x] Located calendar endpoint at `/api/calendar`
  - [x] Updated query to include ALL active quests (including completed ones)
  - [x] Only excludes abandoned quests (is_active=False)
  - [x] Completed tasks already included with status='completed'

- [x] **Frontend Display Update** - ALREADY IMPLEMENTED
  - [x] Calendar already shows completed tasks with green status
  - [x] Styling already differentiates completed vs active tasks
  - [x] Status helper function in useCalendar.js handles color coding

- [ ] **Testing** - NEEDS VERIFICATION
  - [ ] Complete a quest with tasks on calendar
  - [ ] Verify completed tasks remain visible after quest completion
  - [ ] Check that date ranges work correctly
  - [ ] Test with multiple completed quests over time

#### Files to Check
- `frontend/src/components/` (calendar component)
- `backend/routes/users/dashboard.py` or calendar endpoint
- Calendar query logic

---

### Fix 15: Private Evidence Option

**Status**: HIGH - Important privacy feature
**Issue**: Need option to mark evidence as private (only visible to user)

#### Implementation Tasks
- [ ] **Database Schema Update**
  - [ ] Add `is_private` boolean column to `quest_task_completions` table
  - [ ] Add `is_private` boolean column to `evidence_document_blocks` table
  - [ ] Set default to `false` (public)
  - [ ] Create migration file

- [ ] **Backend API Updates**
  - [ ] Update task completion endpoint to accept `is_private` parameter
  - [ ] Update evidence upload endpoint to accept `is_private` parameter
  - [ ] Add filter to portfolio/diploma endpoints to hide private evidence
  - [ ] Ensure private evidence only shows to owner (add RLS policy or query filter)

- [ ] **Frontend UI Updates**
  - [ ] Add checkbox to evidence submission form: "Make this evidence private"
  - [ ] Add toggle to edit evidence modal
  - [ ] Show lock icon on private evidence in user's own view
  - [ ] Hide private evidence completely in public diploma view

- [ ] **Diploma Page Update** - [pages/DiplomaPage.jsx](pages/DiplomaPage.jsx)
  - [ ] Filter out private evidence when viewing other users' diplomas
  - [ ] Show private evidence when viewing own diploma
  - [ ] Add visual indicator (lock icon) for private items

- [ ] **Testing**
  - [ ] Submit evidence marked as private
  - [ ] View own diploma - verify private evidence shows with indicator
  - [ ] View other user's diploma - verify private evidence is hidden
  - [ ] Toggle privacy setting on existing evidence

#### Files to Check
- Database migrations
- `backend/routes/tasks.py` (task completion)
- `backend/routes/evidence_documents.py` (evidence uploads)
- `backend/routes/portfolio.py` (diploma endpoint)
- `frontend/src/pages/DiplomaPage.jsx`
- `frontend/src/components/diploma/` (evidence display components)

---

## 🟢 MEDIUM PRIORITY FIXES (Priority 3 - Feature Improvements)

### Fix 5: Suggest a Quest Button Repositioning

**Status**: MEDIUM - UI/UX improvement
**Issue**: Move "Suggest a Quest" button to same row as badges/quests/search bar

#### Implementation Tasks
- [ ] **Frontend Investigation** - [pages/QuestBadgeHub.jsx](pages/QuestBadgeHub.jsx)
  - [ ] Locate current "Suggest a Quest" button placement
  - [ ] Find badges/quests/search bar row layout
  - [ ] Review current flex/grid layout structure

- [ ] **Layout Refactoring**
  - [ ] Move button to header row with badges/quests tabs
  - [ ] Adjust responsive layout for mobile (may need to stack)
  - [ ] Ensure button doesn't crowd search bar on small screens
  - [ ] Update spacing and alignment

- [ ] **Styling Updates**
  - [ ] Match button style to existing header elements
  - [ ] Ensure brand gradient consistency
  - [ ] Test on various screen sizes (mobile, tablet, desktop)
  - [ ] Verify accessibility (keyboard navigation, focus states)

- [ ] **Testing**
  - [ ] Desktop view - verify button fits naturally in header
  - [ ] Tablet view - check responsive behavior
  - [ ] Mobile view - verify button is accessible and not cramped
  - [ ] Click functionality remains unchanged

#### Files to Check
- `frontend/src/pages/QuestBadgeHub.jsx`
- Related CSS/Tailwind classes

---

### Fix 7: Admin Parent Dashboard - Multi-Child View

**Status**: MEDIUM - Important admin feature
**Issue**: Admin parent dashboard should show all children in dropdown, viewable from parent's perspective

#### Implementation Tasks
- [ ] **Requirements Clarification**
  - [ ] Determine if this is for admin viewing ANY parent-child relationship
  - [ ] OR for admin testing parent dashboard as if they were the parent
  - [ ] Confirm expected behavior with user

- [ ] **Backend API Update** (if needed)
  - [ ] Create admin endpoint: `/api/admin/parent-view/:parentId/children`
  - [ ] Return all linked children for a specific parent
  - [ ] Ensure admin-only access with `@require_role('admin')` decorator

- [ ] **Frontend Admin Panel** - [components/admin/AdminDashboard.jsx](components/admin/AdminDashboard.jsx)
  - [ ] Add "Parent Dashboard Viewer" section to admin panel
  - [ ] Add dropdown to select parent user
  - [ ] Add nested dropdown to select which child to view
  - [ ] Create link to parent dashboard with selected parent/child IDs

- [ ] **Parent Dashboard Update** - [pages/ParentDashboardPage.jsx](pages/ParentDashboardPage.jsx)
  - [ ] Add admin mode support (query param or route)
  - [ ] Allow admin to view as any parent
  - [ ] Show indicator that admin is in "view as" mode
  - [ ] Disable any actions that would modify data

- [ ] **Testing**
  - [ ] Test as admin selecting various parents
  - [ ] Verify child dropdown populates correctly
  - [ ] Test viewing dashboard as different parent/child combinations
  - [ ] Ensure non-admin users cannot access this feature

#### Files to Check
- `backend/routes/admin_core.py` or create new admin parent route
- `frontend/src/components/admin/AdminDashboard.jsx`
- `frontend/src/pages/ParentDashboardPage.jsx`

---

### Fix 8: Add Completed Quests Section to Dashboard

**Status**: ✅ COMPLETE - Deployed to develop
**Issue**: Dashboard needs dedicated completed quests section
**Resolution**: Added "Recently Completed" section showing last 5 completed quests with images, dates, and checkmarks

#### Implementation Tasks
- [ ] **Design Decision**
  - [ ] Determine placement (below active quests, separate tab, collapsible section)
  - [ ] Decide on display format (cards, list, compact view)
  - [ ] Consider pagination/load more for users with many completed quests

- [ ] **Backend API Check**
  - [ ] Verify `/api/users/:userId/completed-quests` endpoint exists and works
  - [ ] Check if dashboard API already includes completed quests
  - [ ] If not, add `recent_completed_quests` (limit 5-10) to dashboard endpoint

- [ ] **Frontend Implementation** - [pages/DashboardPage.jsx](pages/DashboardPage.jsx)
  - [ ] Add "Completed Quests" section below active quests
  - [ ] Create component for completed quest display (simpler than active quest cards)
  - [ ] Show: title, completion date, total XP earned, badge progress contributed to
  - [ ] Add "View All" link to full completed quests page if applicable

- [ ] **Styling**
  - [ ] Use muted colors to differentiate from active quests
  - [ ] Add completion checkmark or badge icon
  - [ ] Ensure responsive layout
  - [ ] Follow Poppins typography and brand gradient guidelines

- [ ] **Testing**
  - [ ] Test with user with no completed quests (should hide section or show empty state)
  - [ ] Test with user with few completed quests (2-3)
  - [ ] Test with user with many completed quests (10+)
  - [ ] Verify links to quest details work correctly

#### Files to Check
- `frontend/src/pages/DashboardPage.jsx`
- `backend/routes/users/dashboard.py`
- `backend/routes/users/completed_quests.py`

---

### Fix 10: Family Access Enhancement

**Status**: MEDIUM - Feature expansion
**Issue**: Expand "Parent access" to "Family access" with parent & observer roles + invitation ability

#### Implementation Tasks
- [ ] **Requirements Analysis**
  - [ ] Define observer role permissions (read-only, no evidence upload?)
  - [ ] Decide if observers use same invitation flow as parents
  - [ ] Determine if one student can have multiple observers
  - [ ] Clarify difference between parent and observer access levels

- [ ] **Database Schema** (observer role already exists in users table)
  - [ ] Verify `users.role` supports 'observer' (already done per CLAUDE.md)
  - [ ] Check if `parent_student_links` needs `role_type` column (parent vs observer)
  - [ ] OR create separate `family_access` table if permissions differ significantly
  - [ ] Update `parent_invitations` to support observer role

- [ ] **Backend API Updates**
  - [ ] Update invitation endpoints to accept `role_type` parameter (parent/observer)
  - [ ] Add permission checks differentiating parent vs observer capabilities
  - [ ] Update parent dashboard endpoints to work for observers
  - [ ] Restrict evidence upload to parents only (not observers)

- [ ] **Frontend UI Updates**
  - [ ] Rename "Parent Access" to "Family Access" throughout app
  - [ ] Update [components/parent/ParentLinking.jsx](components/parent/ParentLinking.jsx)
    - [ ] Add role selector (Parent or Observer) to invitation form
    - [ ] Update language to be more inclusive
  - [ ] Update [components/parent/ParentInvitationApproval.jsx](components/parent/ParentInvitationApproval.jsx)
    - [ ] Show role type in invitation display
  - [ ] Update parent dashboard to show role-appropriate features

- [ ] **Permission Logic**
  - [ ] Parents: Full read access + evidence upload
  - [ ] Observers: Read-only access, no evidence upload
  - [ ] Both: Can view AI tutor conversations for safety monitoring
  - [ ] Both: Can view calendar, insights, progress

- [ ] **Testing**
  - [ ] Send invitation as parent role
  - [ ] Send invitation as observer role
  - [ ] Accept both types and verify permission differences
  - [ ] Test evidence upload (should work for parent, not observer)
  - [ ] Verify dashboard displays appropriately for each role

#### Files to Check
- `backend/routes/parents.py` (or wherever parent routes live)
- `frontend/src/components/parent/ParentLinking.jsx`
- `frontend/src/components/parent/ParentInvitationApproval.jsx`
- `frontend/src/pages/ParentDashboardPage.jsx`

---

## 🔵 LOWER PRIORITY FIXES (Priority 4 - Polish & Enhancements)

### Fix 9: Task Customization Wizard Styling

**Status**: LOW - Styling update
**Issue**: Task customization wizard needs styling updates

#### Implementation Tasks
- [ ] **Locate Component**
  - [ ] Find task customization wizard (likely in quest creation or quest detail)
  - [ ] Review current styling

- [ ] **Design Requirements**
  - [ ] Clarify specific styling issues (colors, spacing, layout, responsiveness?)
  - [ ] Determine if following brand guidelines (Poppins, purple/pink gradient)
  - [ ] Check against Figma designs if available

- [ ] **Styling Updates**
  - [ ] Apply brand colors and gradients
  - [ ] Update typography to Poppins with proper weights
  - [ ] Improve spacing and layout
  - [ ] Ensure mobile responsiveness
  - [ ] Add animations/transitions if appropriate

- [ ] **Testing**
  - [ ] Test on all screen sizes
  - [ ] Verify accessibility (contrast ratios, keyboard navigation)
  - [ ] Test wizard flow with multiple tasks

#### Files to Check
- Quest customization components (TBD - need to locate)

---

### Fix 11: Capitalize Pillar Names on Calendar

**Status**: LOW - Visual polish
**Issue**: Pillar names should be capitalized on calendar view

#### Implementation Tasks
- [ ] **Locate Calendar Component**
  - [ ] Find where pillar names are rendered on calendar
  - [ ] Check if pillars are stored lowercase in database (they are per CLAUDE.md)

- [ ] **Display Fix**
  - [ ] Add CSS text-transform: capitalize
  - [ ] OR use JavaScript to capitalize first letter on display
  - [ ] Ensure consistency with other pillar displays in app

- [ ] **Testing**
  - [ ] Verify all 5 pillars display capitalized (Stem, Wellness, Communication, Civics, Art)
  - [ ] Check that database values remain lowercase
  - [ ] Test on calendar view

#### Files to Check
- Calendar component (need to locate)
- CSS/Tailwind classes for pillar display

---

### Fix 12: Update Pillar Names on "What Do Next" & Badge/Quest Filters

**Status**: LOW - Visual polish
**Issue**: Ensure pillar naming is consistent across app

#### Implementation Tasks
- [ ] **Audit Pillar Displays**
  - [ ] Find "What Do Next" component/section
  - [ ] Find badge filter component
  - [ ] Find quest filter component
  - [ ] List all locations where pillars are displayed

- [ ] **Standardization**
  - [ ] Decide on standard display format (Capitalized? Title Case?)
  - [ ] Update all pillar displays to match
  - [ ] Ensure icons match correctly to each pillar

- [ ] **Create Helper Function** (if not exists)
  - [ ] Create `formatPillarName()` utility function
  - [ ] Use consistently throughout app
  - [ ] Maps: 'stem' → 'STEM', 'wellness' → 'Wellness', etc.

- [ ] **Testing**
  - [ ] Visual audit of all pillar displays
  - [ ] Verify consistency across dashboard, quest hub, badges, calendar

#### Files to Check
- Dashboard "What Do Next" component
- `frontend/src/pages/QuestBadgeHub.jsx` (filter components)
- Create utility in `frontend/src/utils/` if needed

---

### Fix 13: Communication Page Styling & Past Conversation Debug

**Status**: LOW - Page-specific fixes
**Issue**: Communication page needs styling update and past conversation feature debugging

#### Implementation Tasks
- [ ] **Locate Communication Page**
  - [ ] Find communication page component (may be related to connections or tutor)
  - [ ] Identify if this is AI tutor conversations or student connections

- [ ] **Styling Updates**
  - [ ] Apply brand styling (Poppins, gradients)
  - [ ] Improve layout and spacing
  - [ ] Ensure mobile responsiveness

- [ ] **Past Conversation Debugging**
  - [ ] Identify the bug (not loading? not displaying? not saving?)
  - [ ] Check backend endpoint for conversation history
  - [ ] Check frontend state management for conversations
  - [ ] Fix data loading/display issues

- [ ] **Testing**
  - [ ] Test viewing past conversations
  - [ ] Test pagination/infinite scroll if applicable
  - [ ] Test search/filter if applicable

#### Files to Check
- Communication page component (TBD)
- Related backend API endpoints

---

### Fix 14: Connections Page Styling Fix

**Status**: LOW - Styling refinement
**Issue**: Connections page needs styling improvements

#### Implementation Tasks
- [ ] **Review Current State** - [pages/ConnectionsPage.jsx](pages/ConnectionsPage.jsx)
  - [ ] Check if recent redesign (described in CLAUDE.md) is fully implemented
  - [ ] Identify specific styling issues
  - [ ] Compare to design specifications

- [ ] **Styling Refinements**
  - [ ] Verify Poppins typography weights (700/600/500)
  - [ ] Check purple → pink gradient implementation
  - [ ] Verify pillar-specific accent colors
  - [ ] Review spacing and alignment
  - [ ] Test mobile responsiveness

- [ ] **Component Polish**
  - [ ] Check all components in `frontend/src/components/connections/`
  - [ ] Ensure consistent styling across tabs
  - [ ] Verify empty states look good
  - [ ] Check loading states

- [ ] **Testing**
  - [ ] Test on desktop, tablet, mobile
  - [ ] Verify accessibility (WCAG 2.1 AA)
  - [ ] Check keyboard navigation
  - [ ] Test with screen reader if possible

#### Files to Check
- `frontend/src/pages/ConnectionsPage.jsx`
- `frontend/src/components/connections/` (all components)

---

### Fix 16: Suggested Tasks Swipe Navigation

**Status**: LOW - Feature enhancement
**Issue**: Add swipe left/right navigation to suggested tasks

#### Implementation Tasks
- [ ] **Locate Suggested Tasks Component**
  - [ ] Find where suggested tasks are displayed (dashboard? quest detail?)
  - [ ] Review current navigation method

- [ ] **Implement Swipe Gestures**
  - [ ] Add swipe gesture library (react-swipeable or similar)
  - [ ] Implement left swipe → next task
  - [ ] Implement right swipe → previous task
  - [ ] Add visual indicators (arrows, dots)

- [ ] **Mobile Optimization**
  - [ ] Ensure smooth animations
  - [ ] Test on touch devices
  - [ ] Add edge bounce effects
  - [ ] Prevent accidental swipes

- [ ] **Testing**
  - [ ] Test on mobile devices
  - [ ] Test on desktop (mouse drag or buttons only?)
  - [ ] Verify with many suggested tasks
  - [ ] Test edge cases (first/last task)

#### Files to Check
- Suggested tasks component (TBD)

---

### Fix 17: Task Complexity Adjustment

**Status**: LOW - Feature enhancement
**Issue**: Add ability to make tasks simpler or more complex

#### Implementation Tasks
- [ ] **Requirements Clarification**
  - [ ] Who can adjust complexity? (student, advisor, admin?)
  - [ ] Does this affect XP values?
  - [ ] Is this AI-generated alternatives or manual editing?
  - [ ] Should this create new task variants or modify existing?

- [ ] **Database Design**
  - [ ] Add `complexity_level` column to `user_quest_tasks` (1-5 scale?)
  - [ ] OR create `task_variants` table linking alternative versions
  - [ ] Consider XP scaling based on complexity

- [ ] **AI Integration** (if using Gemini)
  - [ ] Create prompt to generate simpler version of task
  - [ ] Create prompt to generate more complex version
  - [ ] Use `gemini-2.5-flash-lite` model per CLAUDE.md
  - [ ] Validate generated alternatives

- [ ] **Frontend UI**
  - [ ] Add complexity adjustment buttons to task card
  - [ ] Show current complexity level indicator
  - [ ] Preview alternative versions before applying
  - [ ] Confirm dialog before changing

- [ ] **Backend API**
  - [ ] Create endpoint: POST `/api/tasks/:taskId/adjust-complexity`
  - [ ] Accept `direction` parameter (simpler/more_complex)
  - [ ] Return alternative task description and XP value
  - [ ] Save to database on confirmation

- [ ] **Testing**
  - [ ] Test making task simpler (should reduce XP)
  - [ ] Test making task more complex (should increase XP)
  - [ ] Test with various task types
  - [ ] Verify XP totals recalculate correctly

#### Files to Check
- `backend/routes/tasks.py`
- `backend/services/` (create task_complexity_service.py?)
- Task display components

---

### Fix 18: Badges Require a Book

**Status**: LOW - Feature requirement clarification
**Issue**: "Badges require a book" - needs clarification

#### Implementation Tasks
- [ ] **Clarify Requirements**
  - [ ] What does "require a book" mean?
  - [ ] Is this reading requirement for certain badges?
  - [ ] OR physical book evidence requirement?
  - [ ] OR educational resource link?
  - [ ] Get clarification from user before implementing

- [ ] **Pending User Input**
  - [ ] Ask user to explain this requirement in detail
  - [ ] Determine if this applies to all badges or specific ones
  - [ ] Understand the educational goal

#### Files to Check
- TBD pending clarification

---

### Fix 19: Quest Social Feature - "See How Others Completed"

**Status**: LOW - New feature
**Issue**: Quests should have "see how others completed this quest" feature

#### Implementation Tasks
- [ ] **Design Decision**
  - [ ] What information to show? (evidence samples, completion times, approaches?)
  - [ ] Privacy considerations (only show public evidence)
  - [ ] Filter by connections only or all users?

- [ ] **Backend API**
  - [ ] Create endpoint: GET `/api/quests/:questId/completions`
  - [ ] Query completed user_quests with evidence
  - [ ] Filter for public evidence only (when Fix 15 is implemented)
  - [ ] Include user display name, completion date, evidence samples

- [ ] **Frontend UI** - [pages/QuestDetail.jsx](pages/QuestDetail.jsx)
  - [ ] Add "See How Others Completed This" section to quest detail page
  - [ ] Display grid/list of completion examples
  - [ ] Link to user diplomas to see full evidence
  - [ ] Add inspiration/motivation messaging (align with core_philosophy.md)

- [ ] **Privacy & Safety**
  - [ ] Only show completions from users who have public portfolios
  - [ ] Filter out private evidence (when Fix 15 implemented)
  - [ ] Add reporting mechanism for inappropriate content

- [ ] **Testing**
  - [ ] Test with quest completed by many users
  - [ ] Test with quest completed by few users
  - [ ] Test with quest not yet completed by anyone
  - [ ] Verify privacy filters work correctly

#### Files to Check
- `backend/routes/quests.py` (add completions endpoint)
- `frontend/src/pages/QuestDetail.jsx`

---

### Fix 20: Chat Bot - Friends List Integration

**Status**: LOW - Feature enhancement
**Issue**: Chat bot should list all friends to chat with

#### Implementation Tasks
- [ ] **Clarify Feature Scope**
  - [ ] Is this AI tutor chat or peer-to-peer messaging?
  - [ ] Should this be connections (from ConnectionsPage)?
  - [ ] What's the chat functionality? (real-time? async?)

- [ ] **If AI Tutor Chat:**
  - [ ] Add friends list sidebar to tutor chat interface
  - [ ] Show which friends are online/recently active
  - [ ] Consider group chat feature
  - [ ] Ensure parent safety monitoring extends to group chats

- [ ] **If Peer-to-Peer Chat:**
  - [ ] This is a MAJOR new feature requiring significant architecture
  - [ ] Consider using existing service (Stream Chat, Firebase, etc.)
  - [ ] Implement real-time messaging infrastructure
  - [ ] Add safety monitoring and reporting
  - [ ] Consider parental controls

- [ ] **Pending User Input**
  - [ ] Get clarification on intended functionality
  - [ ] Determine priority relative to other features
  - [ ] Assess development effort required

#### Files to Check
- `frontend/src/components/tutor/ChatInterface.jsx` (if AI tutor)
- OR new messaging infrastructure (if peer-to-peer)

---

## 📋 IMPLEMENTATION PRIORITY SUMMARY

### Immediate Action Required (This Week)
1. **Fix 1**: Quest completion error (xp_awarded column)
2. **Fix 6**: Quest enrollment RLS policy violation

### Short Term (1-2 Weeks)
3. **Fix 2**: Evidence modal consistency
4. **Fix 3**: Dashboard empty state message
5. **Fix 4**: Calendar task persistence
6. **Fix 15**: Private evidence feature

### Medium Term (2-4 Weeks)
7. **Fix 5**: Suggest a Quest button repositioning
8. **Fix 7**: Admin parent dashboard multi-child view
9. **Fix 8**: Completed quests section on dashboard
10. **Fix 10**: Family access with observer role

### Long Term / Polish (As Time Permits)
11. **Fix 9**: Task customization wizard styling
12. **Fix 11**: Capitalize pillar names on calendar
13. **Fix 12**: Pillar name consistency
14. **Fix 13**: Communication page styling & debug
15. **Fix 14**: Connections page styling
16. **Fix 16**: Suggested tasks swipe navigation
17. **Fix 17**: Task complexity adjustment
18. **Fix 19**: Quest social feature

### Pending Clarification
- **Fix 18**: Badges require a book (unclear requirement)
- **Fix 20**: Chat bot friends list (scope undefined)

---

## 🔧 DEVELOPMENT NOTES

### Before Starting Any Fix:
1. ✅ Always use Supabase MCP to verify database schema
2. ✅ Check CLAUDE.md for relevant architecture patterns
3. ✅ Test in develop branch environment first
4. ✅ Commit changes to develop branch automatically
5. ✅ Reference core_philosophy.md for user-facing language

### Common Patterns:
- **Database queries**: Always verify table/column names with MCP first
- **API endpoints**: Follow existing patterns in routes/
- **React components**: Use functional components with hooks
- **Styling**: Poppins typography, purple→pink gradients, mobile-first
- **Security**: Use user-authenticated clients for RLS, validate inputs

### Testing Checklist:
- [ ] Desktop browser testing
- [ ] Mobile responsive testing
- [ ] Keyboard navigation (accessibility)
- [ ] Multiple user roles (student, parent, admin)
- [ ] Edge cases (empty states, many items, errors)

---

## 📞 SUPPORT & QUESTIONS

If any requirements are unclear or you need design mockups:
1. Ask for clarification before implementing
2. Reference existing similar features for patterns
3. Check CLAUDE.md for architectural guidance
4. Review core_philosophy.md for messaging tone

---

**Last Updated**: 2025-10-24
**Based On**: fixes.txt comprehensive review
