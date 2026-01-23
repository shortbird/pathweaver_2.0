# Observer Routes Refactoring Plan

**File**: `backend/routes/observer.py`
**Current Size**: 2,532 lines
**Status**: Largest file in codebase
**Created**: January 23, 2026

## Problem

The `observer.py` route file has grown to 2,532 lines, making it:
- Difficult to navigate and maintain
- Prone to merge conflicts in team development
- Hard to test individual features in isolation
- Violating Single Responsibility Principle

## Current Structure Analysis

### Section Breakdown (by line count)

| Section | Lines | Percentage | Endpoints |
|---------|-------|------------|-----------|
| Header & Imports | 58 | 2% | - |
| STUDENT ENDPOINTS - Send & Manage Invitations | 245 | 10% | 5 |
| OBSERVER ENDPOINTS - Accept & View | 566 | 22% | 6 |
| STUDENT ACTIVITY FEED | 264 | 10% | 1 |
| PARENT ENDPOINTS | 311 | 12% | 4 |
| OBSERVER FEED | 392 | 15% | 1 |
| LIKES ENDPOINTS | 200 | 8% | 2 |
| FAMILY OBSERVER ENDPOINTS | 429 | 17% | 4 |
| UTILITY ENDPOINTS | 67 | 3% | 1 |
| **TOTAL** | **2,532** | **100%** | **24** |

### Endpoint Summary

**Student-initiated actions** (Students managing observers):
- `POST /api/observers/invite` - Send invitation
- `GET /api/observers/my-invitations` - List sent invitations
- `DELETE /api/observers/invitations/<id>/cancel` - Cancel invitation
- `GET /api/observers/my-observers` - List observers watching me
- `DELETE /api/observers/<link_id>/remove` - Remove observer access
- `GET /api/observers/student/<id>/activity` - View own activity feed

**Observer-initiated actions** (Observers viewing portfolios):
- `POST /api/observers/accept/<code>` - Accept invitation
- `GET /api/observers/my-students` - List students I observe
- `GET /api/observers/student/<id>/portfolio` - View student portfolio
- `POST /api/observers/comments` - Post comment on student work
- `DELETE /api/observers/comments/<id>` - Delete own comment
- `GET /api/observers/student/<id>/comments` - List student comments
- `GET /api/observers/feed` - View feed of all students
- `POST /api/observers/completions/<id>/like` - Like completion
- `GET /api/observers/completions/<id>/comments` - View completion comments

**Parent-specific actions** (Parents inviting observers for their dependents):
- `POST /api/observers/parent-invite` - Parent invite observer for child
- `GET /api/observers/parent-invitations/<student_id>` - List invitations for child
- `GET /api/observers/student/<id>/observers` - List observers for child
- `DELETE /api/observers/student/<id>/observers/<link_id>` - Remove observer for child

**Family observer actions** (Parents managing observers across multiple children):
- `POST /api/observers/family-invite` - Invite observer with multi-child access
- `GET /api/observers/family-observers` - List family observers
- `POST /api/observers/family-observers/<id>/toggle-child` - Toggle child access
- `DELETE /api/observers/family-observers/<id>` - Remove family observer

**Utility endpoints**:
- `GET /api/observers/pending-invitations` - Get pending invitations for observer

## Proposed Refactoring

### Option 1: Feature-Based Split (Recommended)

Split by user role and feature domain. This aligns with domain-driven design.

#### Files to Create

**1. `backend/routes/observer_invitations.py`** (~500 lines)
- Student invitation management
- Observer invitation acceptance
- Invitation listing and cancellation
- Endpoints:
  - `POST /api/observers/invite`
  - `GET /api/observers/my-invitations`
  - `DELETE /api/observers/invitations/<id>/cancel`
  - `POST /api/observers/accept/<code>`
  - `GET /api/observers/pending-invitations`

**2. `backend/routes/observer_portfolio.py`** (~600 lines)
- Observer viewing student portfolios
- Portfolio data aggregation
- Access control verification
- Endpoints:
  - `GET /api/observers/my-students`
  - `GET /api/observers/student/<id>/portfolio`
  - `GET /api/observers/student/<id>/activity`

**3. `backend/routes/observer_interactions.py`** (~600 lines)
- Comments on student work
- Likes/reactions
- Feed viewing
- Endpoints:
  - `POST /api/observers/comments`
  - `DELETE /api/observers/comments/<id>`
  - `GET /api/observers/student/<id>/comments`
  - `GET /api/observers/completions/<id>/comments`
  - `POST /api/observers/completions/<id>/like`
  - `GET /api/observers/feed`

**4. `backend/routes/observer_parent.py`** (~450 lines)
- Parent-specific observer management
- Managing observers for dependents
- Endpoints:
  - `POST /api/observers/parent-invite`
  - `GET /api/observers/parent-invitations/<student_id>`
  - `GET /api/observers/student/<id>/observers`
  - `DELETE /api/observers/student/<id>/observers/<link_id>`

**5. `backend/routes/observer_family.py`** (~450 lines)
- Family observer management (multi-child access)
- Toggling child access
- Endpoints:
  - `POST /api/observers/family-invite`
  - `GET /api/observers/family-observers`
  - `POST /api/observers/family-observers/<id>/toggle-child`
  - `DELETE /api/observers/family-observers/<id>`

**6. `backend/routes/observer_access.py`** (~250 lines)
- Observer link management
- Access verification
- Permission checks
- Endpoints:
  - `GET /api/observers/my-observers`
  - `DELETE /api/observers/<link_id>/remove`

#### Shared Module

**`backend/services/observer_service.py`** (NEW)
- Shared helper functions:
  - `get_frontend_url()` (currently duplicated)
  - Common access control checks
  - Observer link verification
  - Student permission validation

### Option 2: Layer-Based Split

Split by operation type (read vs write, public vs authenticated).

#### Files to Create

**1. `backend/routes/observer_read.py`** (~800 lines)
- All GET endpoints
- Portfolio viewing, feed viewing, list operations

**2. `backend/routes/observer_write.py`** (~800 lines)
- All POST/DELETE endpoints
- Invitations, comments, likes, access management

**3. `backend/routes/observer_admin.py`** (~400 lines)
- Parent-specific management endpoints
- Family observer management

### Option 3: Hybrid Approach (Most Pragmatic)

Combine the best of both: split by feature but group smaller related features.

#### Files to Create

**1. `backend/routes/observer_invitations.py`** (~500 lines)
- All invitation-related logic (send, accept, cancel, list)
- Both student and parent invitation flows

**2. `backend/routes/observer_viewing.py`** (~800 lines)
- Portfolio viewing
- Feed viewing
- Activity feeds
- All read-only observer operations

**3. `backend/routes/observer_interactions.py`** (~600 lines)
- Comments
- Likes
- All observer engagement features

**4. `backend/routes/observer_management.py`** (~600 lines)
- Link management (add/remove observers)
- Parent management of child observers
- Family observer management
- Access control modifications

## Repository Pattern Integration

**IMPORTANT**: During refactoring, also migrate to repository pattern as noted in the file header.

### Create `ObserverRepository`

The file header already identifies this as a migration candidate. Create:

**`backend/repositories/observer_repository.py`**

Methods needed:
```python
class ObserverRepository:
    # Invitation management
    def create_invitation(student_id, observer_email, observer_name, ...)
    def get_invitation_by_code(invitation_code)
    def get_student_invitations(student_id)
    def cancel_invitation(invitation_id, student_id)
    def accept_invitation(invitation_code, observer_data)

    # Observer links
    def create_observer_link(observer_id, student_id, relationship, permissions)
    def get_observer_students(observer_id)
    def get_student_observers(student_id)
    def remove_observer_link(link_id, student_id)
    def verify_observer_access(observer_id, student_id)

    # Comments & interactions
    def create_comment(observer_id, student_id, comment_data)
    def get_student_comments(student_id)
    def delete_comment(comment_id, observer_id)
    def toggle_like(observer_id, completion_id)
    def get_completion_comments(completion_id)

    # Portfolio & feed
    def get_student_portfolio_data(student_id, observer_id)
    def get_student_activity_feed(student_id, observer_id)
    def get_observer_feed(observer_id)
```

This repository would eliminate 25+ direct database calls noted in the file header.

## Implementation Strategy

### Phase 1: Create Repository (Week 1)
1. Create `backend/repositories/observer_repository.py`
2. Implement core methods for invitation workflow
3. Add comprehensive tests for repository
4. Do NOT modify routes yet

### Phase 2: Create Shared Service (Week 1)
1. Create `backend/services/observer_service.py`
2. Extract `get_frontend_url()` helper
3. Add common access control helpers
4. Add utility functions used across endpoints

### Phase 3: Split Routes - Invitations (Week 2)
1. Create `backend/routes/observer_invitations.py`
2. Copy invitation endpoints from `observer.py`
3. Refactor to use `ObserverRepository`
4. Register new blueprint in `app.py`
5. Test all invitation flows locally
6. Deploy to dev environment
7. Verify in production

### Phase 4: Split Routes - Viewing (Week 2)
1. Create `backend/routes/observer_viewing.py`
2. Copy viewing endpoints
3. Refactor to use repository
4. Test, deploy, verify

### Phase 5: Split Routes - Interactions (Week 3)
1. Create `backend/routes/observer_interactions.py`
2. Copy interaction endpoints
3. Refactor to use repository
4. Test, deploy, verify

### Phase 6: Split Routes - Management (Week 3)
1. Create `backend/routes/observer_management.py`
2. Copy management endpoints
3. Refactor to use repository
4. Test, deploy, verify

### Phase 7: Cleanup (Week 4)
1. Verify all endpoints work in production
2. Delete original `observer.py`
3. Update documentation
4. Create ADR (Architecture Decision Record)

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing frontend calls | HIGH | Deploy incrementally, maintain URL compatibility |
| Merge conflicts during transition | MEDIUM | Complete refactor in dedicated branch, minimize team changes to observer.py |
| Missing edge cases in tests | HIGH | Review production logs, add integration tests |
| Performance regression | LOW | Use same DB queries, repository adds minimal overhead |
| Deployment coordination | MEDIUM | Deploy to dev first, monitor for 48 hours |

## Testing Strategy

### Unit Tests
- Test each repository method independently
- Mock Supabase calls
- Cover edge cases (expired invitations, missing links, etc.)

### Integration Tests
- Test full invitation workflow (send → accept → view portfolio)
- Test comment posting and retrieval
- Test family observer multi-child access
- Test parent management of child observers

### E2E Tests
- Test critical user flows in browser
- Student invites observer → observer accepts → observer views portfolio
- Parent invites observer → observer comments on child's work

## Success Metrics

- [ ] Original `observer.py` deleted
- [ ] No file over 800 lines in `backend/routes/observer_*`
- [ ] 25+ direct DB calls migrated to `ObserverRepository`
- [ ] All 24 endpoints still functional
- [ ] Zero production errors related to observer features
- [ ] Test coverage maintained or improved (>80%)
- [ ] Frontend requires zero changes

## Decision

**Recommendation**: Option 3 (Hybrid Approach)

**Reasoning**:
- Balances feature cohesion with file size management
- Each file has clear, single responsibility
- Easier to understand for new developers
- Aligns with existing codebase patterns
- Manageable file sizes (500-800 lines each)

## Next Steps

1. Get team approval for this plan
2. Create epic in project management tool
3. Break into 7 sprint tickets (one per phase)
4. Assign to developer
5. Schedule refactoring to avoid conflicts with feature work

## References

- File header notes repository migration candidate
- CLAUDE.md recommends repository pattern for new code
- File currently has 129 `for` loops (high complexity)
- Only 1 file in codebase uses caching (opportunity for improvement)
