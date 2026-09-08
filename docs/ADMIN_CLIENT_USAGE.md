# Admin Client Usage Audit

**Date**: 2025-01-22
**Total Instances Found**: 193 across 34 files
**Status**: Audit in progress

## Executive Summary

This document tracks all uses of `get_supabase_admin_client()` in the codebase. The admin client bypasses Row Level Security (RLS) and should ONLY be used for:
1. User registration (creating auth users)
2. Admin dashboard operations (explicitly admin-scoped)
3. System maintenance tasks (migrations, cleanup)

**CRITICAL**: User-facing endpoints should use `get_user_client(user_id)` to enforce RLS.

## Audit Methodology

1. Search for all `get_supabase_admin_client()` calls in `backend/routes/`
2. For each instance, determine:
   - Is this user-specific data? → Should use `get_user_client()`
   - Is this admin-only operation? → OK to use admin client with comment
   - Is this system operation? → OK to use admin client with comment
3. Document findings and create remediation plan

---

## Legitimate Admin Client Usage

### backend/routes/auth.py (12 instances)
**Status**: LEGITIMATE - User registration requires service role

- **Lines**: User registration, password reset, email verification
- **Justification**: Creating auth users, modifying auth.users table, email verification requires service role privileges
- **Action**: ✅ No changes needed - add justification comments

### backend/routes/admin_core.py (11 instances)
**Status**: LEGITIMATE - Admin dashboard operations

- **Lines**: Admin user listing, system statistics, user management
- **Justification**: Explicitly admin-scoped operations viewing cross-user data
- **Action**: ✅ No changes needed - add justification comments

### backend/routes/admin/* (All files)
**Status**: LEGITIMATE - Admin dashboard operations

Files:
- `admin/user_management.py` (11 instances)
- `admin/quest_management.py` (9 instances)
- `admin/quest_ideas.py` (6 instances)
- `admin/task_approval.py` (6 instances)
- `admin/tier_management.py` (5 instances)
- `admin/analytics.py` (5 instances)
- `admin/ai_quest_review.py` (4 instances)
- `admin/student_task_management.py` (3 instances)

- **Justification**: All admin routes require cross-user data access for management purposes
- **Action**: ✅ No changes needed - add justification comments

### backend/routes/admin_badge_seed.py (2 instances)
**Status**: LEGITIMATE - System maintenance

- **Lines**: Badge seeding operations
- **Justification**: System maintenance task for populating badge data
- **Action**: ✅ No changes needed - add justification comments

### backend/routes/lms_integration.py (4 instances)
**Status**: LEGITIMATE - System integration

- **Lines**: LMS roster sync, grade passback, assignment import
- **Justification**: System-level LMS integration requires service role for bulk operations
- **Action**: ✅ No changes needed - add justification comments

---

## POTENTIALLY INAPPROPRIATE Admin Client Usage

### 🚨 HIGH PRIORITY - User-Facing Endpoints

#### backend/routes/quests.py (6 instances)
**Status**: ⚠️ NEEDS REVIEW

Lines found:
- **Line 393**: `@bp.route('/api/quests/<quest_id>/start')`
  - **Issue**: Starting a quest is a user-specific operation
  - **Current**: Uses admin client to check quest existence
  - **Should be**: Use user client - quest existence check will still work with RLS
  - **Impact**: Medium - Not accessing sensitive user data, but bypassing RLS unnecessarily

- **Line 561**: `@bp.route('/api/quests/library')`
  - **Issue**: Fetching user's quest library (completed + in-progress)
  - **Current**: Uses admin client to fetch user_quests
  - **Should be**: Use user client - this is user-specific data
  - **Impact**: HIGH - Bypassing RLS for user-specific data

- **Line 781**: `@bp.route('/api/quests/<quest_id>/abandon')`
  - **Issue**: Abandoning a quest is user-specific
  - **Current**: Uses admin client to check enrollment
  - **Should be**: Use user client
  - **Impact**: Medium - Bypassing RLS for user-specific operation

- **Line 871**: `@bp.route('/api/quest-sources')`
  - **Issue**: Fetching public quest source data
  - **Current**: Uses admin client for public data
  - **Should be**: This is OK - public data, no user-specific information
  - **Impact**: LOW - Public data only

**Action Required**: Replace admin client with user client in lines 393, 561, 781

#### backend/routes/community.py (8 instances)
**Status**: ⚠️ NEEDS REVIEW

Lines found:
- **Line 13**: `get_friends()` function
  - **Issue**: Fetching user's friendships
  - **Current**: Uses admin client
  - **Should be**: Use user client
  - **Impact**: HIGH - User-specific social data

- **Line 146**: `send_friend_request()` - email lookup
  - **Issue**: Looking up user by email
  - **Current**: Uses admin client to query auth.users table
  - **Should be**: LEGITIMATE - Requires service role to query auth.users by email
  - **Impact**: LOW - Justified usage

- **Line 281**: `accept_friend_request()` function
  - **Issue**: Accepting friend request
  - **Current**: Uses admin client
  - **Should be**: Use user client
  - **Impact**: HIGH - User-specific operation

- **Line 515**: `get_friends_activity()` function
  - **Issue**: Fetching friends' activity feed
  - **Current**: Uses admin client
  - **Should be**: Use user client
  - **Impact**: HIGH - User-specific social data

**Action Required**: Replace admin client with user client (except email lookup at line 146)

#### backend/routes/portfolio.py (2 instances)
**Status**: ⚠️ NEEDS REVIEW

Lines found:
- **Line 299**: `@bp.route('/api/portfolio/diploma/<user_id>')`
  - **Issue**: Public diploma viewing
  - **Current**: Uses admin client with comment "bypass RLS for public diploma viewing"
  - **Analysis**: This endpoint shows PUBLIC portfolio data. However, it's accessing user data.
  - **Should be**: Use user client with the requesting user's ID, OR keep admin client but add RLS check
  - **Impact**: MEDIUM - Public data but bypassing RLS

**Action Required**: Review and add proper RLS enforcement or document why admin client is needed

#### backend/routes/evidence_documents.py (4 instances)
**Status**: ⚠️ NEEDS REVIEW

Lines found:
- **Line 87**: `create_evidence_document()`
  - **Issue**: Creating evidence for user's task
  - **Current**: Uses both user client AND admin client
  - **Analysis**: Admin client used for XP awards (requires elevated privileges)
  - **Should be**: Keep admin client for XP service, but verify it's needed
  - **Impact**: MEDIUM - XP service requires admin privileges

- **Line 283**: `delete_block()`
  - **Issue**: Deleting user's evidence block
  - **Current**: Uses admin client
  - **Should be**: Use user client
  - **Impact**: HIGH - User-specific deletion

- **Line 414**: `create_task_evidence_v3()`
  - **Issue**: Creating evidence for personalized task
  - **Current**: Uses admin client for XP awards
  - **Should be**: Keep admin client for XP service
  - **Impact**: MEDIUM - XP service requires admin privileges

**Action Required**: Review XP service usage, replace admin client where not needed for XP

#### backend/routes/tasks.py (2 instances)
**Status**: ⚠️ NEEDS REVIEW

Lines found:
- **Line 41**: `complete_task()` function
  - **Issue**: Completing user's task
  - **Current**: Uses admin client for XP awards with comment "Admin client only for XP awards"
  - **Should be**: Verify XP service requires admin client, otherwise use user client
  - **Impact**: MEDIUM - Already has justification comment

**Action Required**: Verify XP service implementation

#### backend/routes/badges.py (18 instances)
**Status**: ⚠️ NEEDS REVIEW

- **Lines**: Badge progress, badge selection, badge listing
- **Issue**: Many badge operations are user-specific
- **Should review**: Each instance to determine if user client can be used
- **Impact**: HIGH - Large number of instances to review

**Action Required**: Detailed review of all 18 instances

#### backend/routes/tutor.py (13 instances)
**Status**: ⚠️ NEEDS REVIEW

- **Lines**: Tutor conversations, messages, settings
- **Issue**: Tutor operations are user-specific
- **Should review**: Each instance to determine if user client can be used
- **Impact**: HIGH - User-specific AI tutor data

**Action Required**: Detailed review of all 13 instances

#### backend/routes/parent_dashboard.py (7 instances)
**Status**: ⚠️ NEEDS REVIEW

- **Lines**: Parent viewing student data
- **Issue**: Cross-user data access (parent viewing child)
- **Analysis**: Parents viewing linked students requires elevated privileges
- **Should be**: POSSIBLY LEGITIMATE - Cross-user data with permission
- **Impact**: MEDIUM - Needs justification for cross-user access

**Action Required**: Add justification comments, verify parent-student links are checked

#### backend/routes/parent_linking.py (10 instances)
**Status**: ⚠️ NEEDS REVIEW

- **Lines**: Parent invitation system
- **Issue**: Managing parent-student relationships
- **Analysis**: Requires cross-user operations
- **Should be**: POSSIBLY LEGITIMATE - System operation for linking accounts
- **Impact**: MEDIUM - Needs justification

**Action Required**: Add justification comments

#### backend/routes/parent_evidence.py (6 instances)
**Status**: ⚠️ NEEDS REVIEW

- **Lines**: Parents uploading evidence for students
- **Issue**: Cross-user evidence submission
- **Analysis**: Requires elevated privileges for cross-user operations
- **Should be**: POSSIBLY LEGITIMATE - Parent acting on behalf of student
- **Impact**: MEDIUM - Needs justification

**Action Required**: Add justification comments

---

## Lower Priority Files

### backend/routes/calendar.py (1 instance)
- **Status**: Needs review
- **Impact**: Low priority

### backend/routes/learning_events.py (2 instances)
- **Status**: Needs review
- **Impact**: Low priority

### backend/routes/settings.py (4 instances)
- **Status**: Needs review
- **Impact**: Medium priority - user settings

### backend/routes/promo.py (3 instances)
- **Status**: Needs review
- **Impact**: Low priority

### backend/routes/quest_personalization.py (4 instances)
- **Status**: Needs review
- **Impact**: Medium priority

### backend/routes/quest_ideas.py (4 instances)
- **Status**: Needs review
- **Impact**: Medium priority

### backend/routes/student_ai_assistance.py (2 instances)
- **Status**: Needs review
- **Impact**: Medium priority

### backend/routes/parental_consent.py (5 instances)
- **Status**: Needs review
- **Impact**: Medium priority

### backend/routes/quest_badge_hub.py (3 instances)
- **Status**: Needs review
- **Impact**: Medium priority

### backend/routes/ai_content.py (3 instances)
- **Status**: Needs review
- **Impact**: Low priority

### backend/routes/uploads.py (3 instances)
- **Status**: Needs review
- **Impact**: Medium priority

### backend/routes/account_deletion.py (5 instances)
- **Status**: Needs review
- **Impact**: High priority - user data deletion

---

## Remediation Plan

### Phase 1: High-Priority Fixes (Week 1.4)
1. ✅ Create database_policy.py module
2. ✅ Audit all admin client usage (193 instances documented)
3. 🔄 Fix high-risk user-facing endpoints:
   - backend/routes/quests.py (lines 393, 561, 781)
   - backend/routes/community.py (lines 13, 281, 515)
   - backend/routes/portfolio.py (line 299)
   - backend/routes/evidence_documents.py (line 283)

### Phase 2: Medium-Priority Fixes (Week 2)
1. Review and fix:
   - backend/routes/badges.py (18 instances)
   - backend/routes/tutor.py (13 instances)
   - backend/routes/parent_* files (justify cross-user access)
   - backend/routes/settings.py (4 instances)
   - backend/routes/account_deletion.py (5 instances)

### Phase 3: Low-Priority Review (Week 3)
1. Review remaining files
2. Add justification comments to all legitimate admin client usage
3. Create pre-commit hook to enforce policy

---

## Testing Checklist

After fixing each file:
- [ ] Verify RLS policies are enforced
- [ ] Test with actual user data
- [ ] Verify no 401/403 errors
- [ ] Verify data access is properly scoped
- [ ] Add justification comment if admin client is truly needed

---

## Notes

- **XP Service Pattern**: Several files use admin client specifically for XP awards (tasks.py, evidence_documents.py). Need to verify if XP service truly requires admin client or if it can use user client.
- **Parent Features**: Parent-related endpoints (parent_dashboard, parent_linking, parent_evidence) need special consideration as they involve cross-user data access with permissions.
- **Public Data**: Some endpoints fetch public data (quest_sources) where admin client is less concerning but still unnecessary.

---

**Last Updated**: 2025-01-22
**Next Review**: After Phase 1 fixes are complete
