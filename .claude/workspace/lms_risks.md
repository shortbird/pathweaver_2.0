# LMS Transformation Risk Assessment

**Date**: December 27, 2025
**Scope**: Multi-tenant LMS features for Optio Platform
**Current State**: Basic organization support with RLS, observer audit logging, manual org creation by superadmin

---

## 1. FERPA/COPPA Compliance Risks (K-12 Student Data)

### Risk Level: CRITICAL

### Description
K-12 student data in a multi-tenant environment must comply with:
- **FERPA**: Protects educational records, requires parental consent for disclosure
- **COPPA**: Requires parental consent for collecting data from children under 13

### Specific Concerns
- **Minor Account Creation**: Current registration flow may not verify age or obtain parental consent
- **Data Sharing**: Quest collaboration and friendship features could expose PII without proper safeguards
- **Third-Party Services**: Gemini AI integration processes student submissions (potential FERPA violation)
- **Audit Trail**: No comprehensive logging of who accessed student records when

### Mitigation Strategies

1. **Age Verification & Parental Consent**
   - Add `date_of_birth` field to users table
   - Require parental email for users under 13
   - Implement parental consent workflow before account activation
   - Use `is_dependent` flag to enforce special protections for minors

2. **Enhanced Audit Logging**
   - Extend existing observer audit system to log ALL access to student records
   - Log fields: `user_id`, `accessed_by`, `resource_type`, `action`, `timestamp`, `ip_address`
   - Retention: 7 years (FERPA requirement)

3. **AI Service Data Processing Agreement**
   - Verify Gemini API meets FERPA "school official" exception criteria
   - Add data processing addendum (DPA) to terms of service
   - Implement opt-out for AI grading if required by district

4. **Data Minimization**
   - Review all fields in `users`, `user_quest_tasks`, `quest_task_completions` for necessity
   - Remove/mask PII in analytics dashboards
   - Implement data retention policies (auto-delete after graduation/account closure)

---

## 2. Data Isolation Risks (RLS Policies)

### Risk Level: HIGH

### Description
Row-Level Security (RLS) policies enforce data isolation, but misconfiguration could lead to cross-organization data leaks.

### Specific Concerns
- **Complex Join Queries**: Joins across tables with different RLS policies may bypass restrictions
- **Admin Client Usage**: `get_supabase_admin_client()` bypasses RLS (high risk if used incorrectly)
- **Service Role Key**: Direct SQL access to Supabase bypasses RLS entirely
- **RLS Policy Gaps**: New tables/columns may not have policies applied

### Current RLS Coverage
```
✓ users (org_id filter)
✓ quests (org_id filter + visibility policy)
✓ user_quest_tasks (via user_id → users.org_id join)
✓ organizations (id filter)
? badges (no org_id - global or needs policy?)
? friendships (no org_id - cross-org risk?)
```

### Mitigation Strategies

1. **RLS Policy Audit**
   - Run automated tests to verify RLS on ALL tables with org-sensitive data
   - Document which tables are intentionally global (e.g., badge definitions)
   - Add `organization_id` to missing tables if needed

2. **Service Role Restrictions**
   - Create separate Supabase role with limited permissions for backend
   - Only use admin client for truly cross-org operations (e.g., superadmin analytics)
   - Add code review checklist: "Why is admin client needed here?"

3. **Integration Tests**
   - Test Case 1: User from Org A cannot access User B's quests from Org B
   - Test Case 2: Observer from Org A cannot view student from Org B
   - Test Case 3: Admin queries return correct org-filtered results

4. **Friendship/Badge RLS**
   - Option A: Add `organization_id` to friendships, restrict cross-org friendships
   - Option B: Allow cross-org friendships but add privacy controls
   - Badges: Clarify if org-specific badges needed or remain global

---

## 3. Migration Risks (Single-Org → Multi-Org Model)

### Risk Level: MEDIUM

### Description
Current data assumes single organization. Migration to multi-tenant model requires data backfill and schema changes.

### Specific Concerns
- **Existing Production Data**: All current users/quests have `organization_id = NULL` or default org
- **Foreign Key Constraints**: Adding NOT NULL `organization_id` columns breaks existing rows
- **Dependent Accounts**: `managed_by_parent_id` relationships may span organizations (design decision needed)
- **Observer Relationships**: Current observers may become cross-org (need policy decision)

### Migration Plan

1. **Pre-Migration Audit**
   ```sql
   -- Check NULL org_id counts
   SELECT COUNT(*) FROM users WHERE organization_id IS NULL;
   SELECT COUNT(*) FROM quests WHERE organization_id IS NULL;
   ```

2. **Create Default Organization**
   ```sql
   INSERT INTO organizations (name, slug, quest_visibility_policy, is_active)
   VALUES ('Optio Default', 'default', 'org_only', true)
   RETURNING id;  -- e.g., org_id = 1
   ```

3. **Backfill Data**
   ```sql
   -- Assign existing users to default org
   UPDATE users SET organization_id = 1 WHERE organization_id IS NULL;

   -- Assign existing quests to default org
   UPDATE quests SET organization_id = 1 WHERE organization_id IS NULL;
   ```

4. **Add Constraints AFTER Backfill**
   ```sql
   ALTER TABLE users ALTER COLUMN organization_id SET NOT NULL;
   ALTER TABLE quests ALTER COLUMN organization_id SET NOT NULL;
   ```

5. **Dependent Account Policy**
   - **Option A (Strict)**: Dependents must belong to same org as parent
   - **Option B (Flexible)**: Allow cross-org (e.g., parent is teacher at Org A, child is student at Org B)
   - **Recommendation**: Option A for simplicity, add cross-org support later if needed

---

## 4. Edge Case Risks

### Risk Level: MEDIUM

### Description
Complex interactions between features create edge cases that could cause data inconsistency or UX issues.

### Edge Case 1: Organization Deactivation
**Scenario**: District cancels subscription, org is deactivated (`is_active = false`)

**Issues**:
- Should users still log in? (read-only access vs full lockout)
- What happens to in-progress quests?
- Can students still view completed portfolio?
- Observer access to historical data?

**Mitigation**:
- Add `deactivated_at` timestamp to organizations
- Implement "grace period" (30 days read-only access)
- After grace period: hide org from login, preserve data for 1 year (compliance), then archive
- Update RLS policies: `is_active = true OR (deactivated_at > NOW() - INTERVAL '30 days')`

### Edge Case 2: Quest Visibility Across Orgs
**Scenario**: Teacher at Org A creates quest, wants to share with Org B

**Issues**:
- Current `quest_visibility_policy` is per-org, not per-quest
- No mechanism for explicit quest sharing
- LMS courses (`lms_course_id`) may be org-specific

**Mitigation**:
- Add `quest_sharing` table: `quest_id`, `shared_with_org_id`, `shared_by_user_id`, `shared_at`
- Update quest retrieval queries to check both `quests.organization_id = user.organization_id` AND shared quests
- Add UI: "Share this quest with another organization" (admin/teacher only)
- Canvas course IDs: Add `organization_id` to LMS import to prevent cross-org course collisions

### Edge Case 3: Deactivated Quests in Portfolios
**Scenario**: Student completes quest, later quest is deactivated (`is_active = false`)

**Issues**:
- Should completed quest still appear in portfolio?
- XP/badges already awarded - revoke or keep?
- Observer viewing portfolio sees incomplete picture

**Mitigation**:
- **Decision**: Keep completed work visible even if quest deactivated (student earned it)
- Update portfolio query: `WHERE is_active = true OR quest_id IN (SELECT quest_id FROM quest_task_completions WHERE user_id = ?)`
- Add badge note: "Quest no longer available" if `is_active = false`
- DO NOT revoke XP/badges (violates "The Process Is The Goal" philosophy)

### Edge Case 4: Cross-Org Dependent Promotion
**Scenario**: Dependent user promoted to full account (`POST /api/dependents/:id/promote`)

**Issues**:
- If dependent is in Org A, parent in Org B, which org does promoted account belong to?
- Parent may lose access to dependent's data after promotion
- Observer relationships may break

**Mitigation**:
- **Decision**: Promoted user stays in original organization
- Add confirmation dialog: "This will make [name] an independent account in [org_name]. You will lose access to their account."
- Optionally: Create observer relationship (`POST /api/observers/invite`) so parent can still view portfolio
- Update promotion logic to preserve `organization_id`

---

## 5. Dependency Risks (Canvas Converter & Observer System)

### Risk Level: LOW-MEDIUM

### Description
LMS transformation relies on existing systems that may have org-awareness gaps.

### Canvas Converter Risks
**Current State**: Converts Canvas courses to Optio quests (`lms_course_id` reference)

**Issues**:
- No `organization_id` in conversion process (assumes single org)
- Course ID collisions across orgs (District A Canvas course #123 ≠ District B Canvas course #123)
- Assignment groups/weightings may differ by district

**Mitigation**:
1. **Add Org Context to Converter**
   ```python
   # OLD
   def import_canvas_course(course_id, user_id):
       quest = create_quest(title, tasks, lms_course_id=course_id)

   # NEW
   def import_canvas_course(course_id, user_id, organization_id):
       quest = create_quest(title, tasks, lms_course_id=course_id, organization_id=organization_id)
   ```

2. **Composite Key for LMS References**
   - Change `lms_course_id` from `TEXT` to composite: `(organization_id, lms_course_id)`
   - Or prefix: `lms_course_id = 'org_1_course_123'`

3. **Canvas API Multi-Tenancy**
   - Store Canvas instance URL per org: `organizations.canvas_base_url`
   - Store Canvas API token per org (encrypted): `organizations.canvas_api_token_encrypted`
   - Teacher initiates import: "Connect your Canvas account" → OAuth flow

### Observer System Risks
**Current State**: Audit logging exists for observer access (`observer_audit_log` implied)

**Issues**:
- Can observer from Org A view student from Org B?
- Observer invitations may not check org boundaries
- Portfolio data may leak org-sensitive quest info

**Mitigation**:
1. **Add RLS to Observer Tables**
   ```sql
   -- observers table policy
   CREATE POLICY observer_org_isolation ON observers
   USING (
     observer_user_id IN (SELECT id FROM users WHERE organization_id = current_setting('app.current_org_id')::uuid)
     AND student_user_id IN (SELECT id FROM users WHERE organization_id = current_setting('app.current_org_id')::uuid)
   );
   ```

2. **Invitation Validation**
   ```python
   # /api/observers/invite
   observer_org = get_user_org(observer_user_id)
   student_org = get_user_org(student_user_id)
   if observer_org != student_org:
       raise ValueError("Cannot create cross-organization observer relationships")
   ```

3. **Portfolio Data Filtering**
   - Filter quests to only show org-appropriate content
   - If quest was shared from another org, show but mark as "Shared Quest"

---

## Summary & Prioritization

| Risk Area | Severity | Mitigation Effort | Timeline |
|-----------|----------|-------------------|----------|
| FERPA/COPPA Compliance | CRITICAL | High (legal review, consent flows) | Phase 0 (pre-launch) |
| Data Isolation (RLS) | HIGH | Medium (policy audit, tests) | Phase 0 (pre-launch) |
| Migration (Single→Multi-Org) | MEDIUM | Low (SQL scripts, testing) | Phase 1 (before first org onboarding) |
| Edge Cases | MEDIUM | Medium (UX decisions, queries) | Phase 1-2 (iterative) |
| Canvas/Observer Dependencies | LOW-MEDIUM | Medium (refactor imports, RLS) | Phase 2 (post-MVP) |

### Recommended Phase 0 Actions (Pre-Launch)
1. Complete FERPA/COPPA compliance review with legal counsel
2. Implement age verification and parental consent flows
3. Audit all RLS policies and add integration tests
4. Extend audit logging to cover all student record access
5. Add Gemini API data processing agreement to terms

### Recommended Phase 1 Actions (First Org Onboarding)
1. Create and test migration scripts for existing data
2. Implement organization deactivation workflows
3. Add quest sharing mechanism for cross-org collaboration
4. Update Canvas converter for org-aware imports

### Recommended Phase 2 Actions (Post-MVP)
1. Refine edge case handling based on real usage
2. Add cross-org observer support (if needed)
3. Implement advanced data retention and archival policies
4. Conduct third-party security audit

---

## Additional Recommendations

### Organizational Onboarding Checklist
- [ ] Legal review of district's data sharing agreements
- [ ] Configure `quest_visibility_policy` (org_only vs public)
- [ ] Set up Canvas API integration (if applicable)
- [ ] Train superadmin on observer relationship limits
- [ ] Document incident response plan for data breaches

### Monitoring & Alerts
- Alert: RLS policy failures (Supabase logs)
- Alert: Admin client usage outside approved routes
- Dashboard: Cross-org query attempts (should be 0)
- Report: Monthly FERPA access logs per organization

### Testing Requirements
- [ ] RLS bypass attempt tests (malicious user tries to access other org data)
- [ ] Migration dry-run on staging with production data snapshot
- [ ] Load testing with 10 concurrent organizations
- [ ] Observer access logs verified for completeness
- [ ] Canvas import with org-specific course IDs

---

**Document Owner**: AI Agent
**Review Cycle**: After each phase completion
**Next Review**: Before Phase 0 launch
