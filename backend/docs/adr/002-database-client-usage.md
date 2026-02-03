# ADR-002: Database Client Usage Pattern

**Date**: December 18, 2025
**Status**: Accepted
**Supersedes**: 600+ inline JUSTIFICATION comments across route files

---

## Context

Supabase provides two types of database clients in the Optio platform:

1. **User-scoped client** (`get_user_client()`) - Enforces Row Level Security (RLS) policies
2. **Admin client** (`get_supabase_admin_client()`) - Bypasses RLS policies for administrative operations

Without clear guidelines, developers have been adding lengthy JUSTIFICATION comments (600+ lines total) explaining their client choice in every route file. This creates noise, inconsistency, and confusion for new developers.

### The Problem

- Duplicate 20-line comments in 30+ route files
- No single source of truth for client selection rules
- Inconsistent application of patterns
- Difficult to understand when RLS bypass is appropriate
- Auth decorators using admin client without explanation

---

## Decision

We adopt the following **Database Client Usage Pattern** for all backend code:

### Rule 1: Default to User-Scoped Client

**Use `get_user_client()` for all user operations where possible.**

```python
from backend.database import get_user_client

@require_auth
def get_user_tasks(user_id: str):
    """User viewing their own tasks - use user client"""
    supabase = get_user_client()
    return supabase.table('user_quest_tasks').select('*').eq('user_id', user_id).execute()
```

**Why**: RLS policies enforce data access rules automatically. This is the most secure option.

---

### Rule 2: Use Admin Client for Role-Based Operations

**Use `get_supabase_admin_client()` when you need to:**
- Query across multiple users (admin analytics)
- Verify user roles/permissions (auth decorators)
- Perform administrative actions (user management)
- Access system-level data

```python
from backend.database import get_supabase_admin_client

@require_admin
def get_all_users():
    """Admin viewing all users - use admin client"""
    supabase = get_supabase_admin_client()
    return supabase.table('users').select('*').execute()
```

**Why**: Admin operations need unrestricted access to data across the entire system.

---

### Rule 3: Auth Decorators Always Use Admin Client

**All `@require_auth`, `@require_admin`, `@require_advisor` decorators use admin client internally.**

```python
# backend/middleware/auth_decorators.py
def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Uses admin client to bypass RLS for role verification
        supabase = get_supabase_admin_client()
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()
        # ...
```

**Why**:
- Auth decorators verify roles/permissions before endpoint logic runs
- User roles are not subject to RLS policies themselves
- Prevents chicken-and-egg problem (need role to determine if RLS applies)

---

### Rule 4: Spark SSO Requires Admin Client

**Spark SSO users MUST use admin client because they don't have Supabase `auth.users` entries.**

```python
@require_auth  # May be Spark SSO user
def get_student_data(user_id: str):
    """Use admin client for Spark compatibility"""
    supabase = get_supabase_admin_client()
    return supabase.table('users').select('*').eq('id', user_id).single().execute()
```

**Why**:
- Spark SSO users authenticate via external LMS (not Supabase Auth)
- RLS policies check `auth.uid()` which doesn't exist for Spark users
- `@require_auth` decorator validates Spark users, so admin client is safe

**Identification**: Check if endpoint is used by Spark SSO (LMS integration)

---

### Rule 5: Cross-Domain Operations Use Admin Client

**Operations spanning domains (evidence retrieval for parents, advisor dashboards) use admin client.**

```python
@require_parent
def get_dependent_evidence(parent_id: str, dependent_id: str):
    """Parent viewing dependent's data - use admin client"""
    # Auth decorator verified parent owns dependent
    supabase = get_supabase_admin_client()
    return supabase.table('evidence_documents').select('*').eq('user_id', dependent_id).execute()
```

**Why**:
- Auth decorators enforce authorization (parent-dependent relationship)
- RLS policies designed for user viewing own data (not cross-user access)
- Admin client bypasses RLS after auth decorator verifies permission

---

## Client Selection Decision Tree

```
START
  ├─ Is this an auth decorator implementation?
  │    └─ YES → Use Admin Client (Rule 3)
  │
  ├─ Is this a Spark SSO endpoint?
  │    └─ YES → Use Admin Client (Rule 4)
  │
  ├─ Is this an admin operation (analytics, user management)?
  │    └─ YES → Use Admin Client (Rule 2)
  │
  ├─ Does the endpoint access another user's data?
  │    ├─ YES, with authorization check (@require_parent, @require_advisor)
  │    │    └─ Use Admin Client (Rule 5)
  │    └─ NO → Use User Client (Rule 1)
  │
  └─ DEFAULT → Use User Client (Rule 1)
```

---

## Code Comment Convention

Replace verbose JUSTIFICATION comments with a concise reference:

### OLD (20+ lines repeated everywhere)
```python
# JUSTIFICATION: Using admin client for evidence retrieval because:
# 1. User authentication already validated by @require_auth decorator
# 2. We've confirmed parent_id owns student_id via parental_consent table
# 3. Spark SSO users don't have Supabase auth.users entries
# 4. RLS policies check auth.uid() which doesn't exist for Spark users
# 5. Using user client would fail for Spark SSO users
# ... (15 more lines)
```

### NEW (1 line)
```python
# Admin client: Parent cross-user access (ADR-002, Rule 5)
```

or for Spark SSO:
```python
# Admin client: Spark SSO compatibility (ADR-002, Rule 4)
```

---

## Helper Decorators (Future Enhancement)

To enforce these patterns and reduce boilerplate, we can create helper decorators:

```python
# backend/decorators/db_client.py

from functools import wraps
from backend.database import get_user_client, get_supabase_admin_client

def with_user_client(f):
    """Inject user-scoped Supabase client (RLS enforced)"""
    @wraps(f)
    def decorated(*args, **kwargs):
        client = get_user_client()
        return f(*args, client=client, **kwargs)
    return decorated

def with_admin_client(f):
    """Inject admin Supabase client (RLS bypassed)"""
    @wraps(f)
    def decorated(*args, **kwargs):
        client = get_supabase_admin_client()
        return f(*args, client=client, **kwargs)
    return decorated
```

**Usage**:
```python
@require_auth
@with_user_client
def get_user_tasks(user_id: str, client):
    """client parameter is automatically user-scoped"""
    return client.table('user_quest_tasks').select('*').eq('user_id', user_id).execute()

@require_admin
@with_admin_client
def get_all_users(client):
    """client parameter is automatically admin-scoped"""
    return client.table('users').select('*').execute()
```

**Status**: Not implemented yet (future improvement)

---

## Consequences

### Positive

1. **Single source of truth** - All client selection logic documented in one place
2. **Reduced code duplication** - 600+ lines of comments can be replaced with 1-line references
3. **Clearer onboarding** - New developers read ADR once, not 30 files
4. **Consistent patterns** - Decision tree ensures uniform application
5. **Easier audits** - Security reviews check ADR compliance, not scattered comments

### Negative

1. **Learning curve** - Developers must read ADR before understanding client usage
2. **Enforcement** - Requires code review diligence to ensure compliance
3. **Edge cases** - Some scenarios may not fit cleanly into 5 rules

### Neutral

1. **No immediate code changes** - Existing code continues to work
2. **Gradual adoption** - New code follows ADR, old code updated as touched
3. **Helper decorators optional** - Pattern can be followed without decorators

---

## Migration Plan

### Phase 1: Documentation (COMPLETE ✅)
- [x] Create this ADR
- [x] Publish to `backend/docs/adr/002-database-client-usage.md`

### Phase 2: Code Review Enforcement (This Week)
- [ ] Add ADR-002 compliance check to PR template
- [ ] Train team on client selection rules
- [ ] Update CONTRIBUTING.md with ADR reference

### Phase 3: Gradual Comment Replacement (Ongoing)
- [ ] Replace verbose JUSTIFICATION comments with ADR-002 references as files are touched
- [ ] Target: Remove 600+ lines of duplicate comments over 3 months
- [ ] Do NOT do bulk find-replace (review each instance for accuracy)

### Phase 4: Helper Decorators (Optional, Month 2)
- [ ] Implement `@with_user_client` and `@with_admin_client` decorators
- [ ] Add to new endpoints first
- [ ] Gradually refactor existing endpoints

---

## Validation Examples

### Example 1: User viewing own data ✅
```python
@require_auth
def get_my_quests(user_id: str):
    supabase = get_user_client()  # ✅ Correct (Rule 1)
    return supabase.table('user_quests').select('*').eq('user_id', user_id).execute()
```

### Example 2: Admin viewing all users ✅
```python
@require_admin
def list_all_users():
    supabase = get_supabase_admin_client()  # ✅ Correct (Rule 2)
    return supabase.table('users').select('*').execute()
```

### Example 3: Spark SSO endpoint ✅
```python
@require_auth  # May be Spark user
def submit_lms_assignment(user_id: str):
    supabase = get_supabase_admin_client()  # ✅ Correct (Rule 4)
    # Spark users don't have auth.uid(), need admin client
    return supabase.table('lms_assignments').insert({'user_id': user_id}).execute()
```

### Example 4: Parent viewing dependent ✅
```python
@require_parent  # Decorator verifies parent owns dependent
def get_dependent_transcript(parent_id: str, dependent_id: str):
    supabase = get_supabase_admin_client()  # ✅ Correct (Rule 5)
    return supabase.table('quest_completions').select('*').eq('user_id', dependent_id).execute()
```

### Example 5: User client in admin endpoint ❌
```python
@require_admin
def delete_user(user_id: str):
    supabase = get_user_client()  # ❌ WRONG - User client can't delete other users
    return supabase.table('users').delete().eq('id', user_id).execute()
```
**Fix**: Use `get_supabase_admin_client()` (Rule 2)

---

## Related ADRs

- [ADR-001: Repository Pattern Migration](001-repository-pattern-migration.md)
- [ADR-003: httpOnly Cookie Authentication](003-httponly-cookie-authentication.md) (to be created)
- [ADR-004: Safari/iOS Compatibility](004-safari-ios-compatibility.md) (to be created)

---

## References

- Supabase RLS documentation: https://supabase.com/docs/guides/auth/row-level-security
- OWASP Access Control: https://owasp.org/www-project-top-ten/2017/A5_2017-Broken_Access_Control
- Original code review: `COMPREHENSIVE_CODEBASE_REVIEW.md` (P1-ARCH-3)

---

**Questions?**

If you're unsure which client to use:
1. Follow the decision tree above
2. Ask in PR review
3. Default to user client (Rule 1) for safety

**Exceptions?**

If your use case doesn't fit these 5 rules:
1. Document why in code comments
2. Add to this ADR as a new rule or example
3. Discuss in architecture review

---

**Last Updated**: December 18, 2025
**Author**: Development Team
**Status**: Accepted and Enforced
