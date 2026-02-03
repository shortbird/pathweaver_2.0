# Admin Client Usage Audit

**Date**: 2025-01-22
**Status**: IN PROGRESS
**Total Files**: 33
**Total Usages**: 193 instances

## Purpose

This audit identifies all uses of `get_supabase_admin_client()` in backend routes to ensure proper database client selection and RLS (Row Level Security) enforcement.

## Database Client Selection Policy

### RULE 1: Use `get_user_client(user_id)` for user-specific operations
- Fetching user-owned quests
- Fetching user friendships/connections
- Fetching user portfolios
- Fetching user evidence documents
- Any operation where RLS should apply based on the authenticated user

### RULE 2: Use `get_supabase_admin_client()` ONLY for:
- **User registration** - Creating new auth users (bypasses RLS requirement)
- **Admin dashboard operations** - Explicitly admin-scoped queries
- **System operations** - Migrations, cleanup, seeding
- **Cross-user operations** - Operations that need to read/write across multiple users (with explicit auth check)

### RULE 3: NEVER use admin client in user-facing endpoints without justification
- Using admin client bypasses Row Level Security
- Can expose other users' data if not carefully controlled
- Should have explicit authorization checks

## Files Audited

### ✅ Legitimate Admin Client Usage (Admin-Scoped)

#### backend/routes/admin/ (All files)
- `admin/ai_quest_review.py` - Admin reviewing AI-generated quests
- `admin/analytics.py` - Admin viewing analytics across all users
- `admin/quest_ideas.py` - Admin managing quest suggestions
- `admin/quest_management.py` - Admin CRUD operations on quests
- `admin/student_task_management.py` - Admin managing student tasks
- `admin/task_approval.py` - Admin approving submitted tasks
- `admin/tier_management.py` - Admin managing subscription tiers
- `admin/user_management.py` - Admin managing users

**Justification**: All admin routes require @require_admin decorator and operate across all users.

#### backend/routes/auth.py
- Lines 119, 348, 386, etc. - User registration, profile creation, login

**Justification**: Auth operations require service role to create/fetch users before RLS context exists.

#### backend/routes/admin_core.py
- Admin dashboard operations

**Justification**: Explicitly admin-scoped, requires @require_admin.

#### backend/routes/admin_badge_seed.py
- Seeding badge data

**Justification**: System operation, not user-facing.

### ⚠️ Needs Review (Potentially Inappropriate)

#### backend/routes/quests.py (193 instances in this file alone - HIGH PRIORITY)
- Multiple endpoints fetching quest data
- **Issue**: Should use `get_user_client()` for user-specific quest fetching
- **Endpoints to review**:
  - GET /api/quests - Fetching available quests
  - POST /api/quests/:id/start - Starting a quest
  - GET /api/quests/:id - Get quest details

**Action Required**: Audit each endpoint to determine if admin client is truly needed.

#### backend/routes/community.py
- Friendship/connection operations
- **Issue**: Should use `get_user_client()` for user-specific friendship data
- **Action Required**: Replace with user client where RLS should apply.

#### backend/routes/portfolio.py
- Portfolio/diploma data fetching
- **Issue**: Public portfolios might need admin client, but user's own portfolio should use user client
- **Action Required**: Differentiate between public view (admin) vs private view (user).

#### backend/routes/evidence_documents.py
- Evidence file uploads
- **Issue**: Should use `get_user_client()` for user's own evidence
- **Action Required**: Replace with user client.

#### backend/routes/tasks.py
- Task completion tracking
- **Issue**: Should use `get_user_client()` for user's own tasks
- **Action Required**: Replace with user client.

### ✅ Legitimate (System/Cross-User Operations)

#### backend/routes/parent_dashboard.py
- Parent viewing child's data

**Justification**: Cross-user operation with explicit parent-child relationship check.

#### backend/routes/parent_linking.py
- Parent-child linking

**Justification**: Cross-user operation, requires both parties' consent.

#### backend/routes/lms_integration.py
- LMS roster sync, grade passback

**Justification**: System operation, manages data across multiple users.

## Priority Actions

### HIGH PRIORITY (Security Risk)
1. **backend/routes/quests.py** - Most usages (193), user-facing
2. **backend/routes/community.py** - User friendship data
3. **backend/routes/evidence_documents.py** - User evidence uploads
4. **backend/routes/tasks.py** - User task completions

### MEDIUM PRIORITY
5. **backend/routes/portfolio.py** - Mixed public/private access
6. **backend/routes/badges.py** - User badge progress
7. **backend/routes/calendar.py** - User calendar events

### LOW PRIORITY (Likely Legitimate)
- **backend/routes/tutor.py** - AI tutor, may need admin for system prompts
- **backend/routes/promo.py** - Promo code validation, system operation
- **backend/routes/settings.py** - User settings, should review

## Next Steps

1. Create `backend/utils/database_policy.py` helper module
2. Add `get_safe_client(user_id)` wrapper that auto-selects correct client
3. Audit each HIGH PRIORITY file endpoint by endpoint
4. Replace inappropriate admin client usage with `get_user_client(user_id)`
5. Test that RLS policies work correctly
6. Document all remaining admin client usage with justification comments

## Estimated Effort

- **HIGH PRIORITY files**: 4-6 hours
- **MEDIUM PRIORITY files**: 2-3 hours
- **Documentation**: 1 hour
- **Testing**: 2 hours

**Total**: 9-12 hours (split across multiple sessions)

## Notes

- This is a critical security task but requires careful testing
- Each change must be validated to ensure RLS policies are correctly configured
- Some endpoints may legitimately need admin client (e.g., public quest browsing)
- Must preserve functionality while improving security
