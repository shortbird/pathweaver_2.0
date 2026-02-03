# TODO/FIXME Comment Audit

**Original Audit Date**: December 18, 2025
**Last Updated**: December 27, 2025
**Status**: Updated - New TODOs found, some resolved
**Purpose**: Track all action items left in code comments per P1-QUAL-3

---

## December 27, 2025 Update

**Changes**:
- **RESOLVED**: frontend/src/pages/ConnectionsPage.jsx:163 - Observer fetching implemented
- **NEW**: 6 additional TODOs found in versioning, deprecation, quest listing, and auth routes
- **Updated Total**: 18 code TODOs (was 13) + 8 documentation TODOs = 26 total (was 21)

---

## Summary

**Total TODOs Found**: 18 code TODOs + 8 documentation TODOs = 26 total
**Critical**: 1
**High**: 6 (was 4)
**Medium**: 10 (was 8)
**Low**: 9 (was 8)

---

## Priority Legend

- **CRITICAL**: Security or data integrity issue
- **HIGH**: Impacts core functionality or user experience
- **MEDIUM**: Nice-to-have feature or optimization
- **LOW**: Documentation or future enhancement

---

## Code TODOs (13 items)

### CRITICAL Priority (1 item)

#### 1. [CRITICAL] Add permission check to transcript endpoint
- **File**: [backend/routes/credits.py:73](backend/routes/credits.py#L73)
- **Issue**: Transcript endpoint has no authorization check
- **Security Risk**: Any user can view any other user's transcript
- **Required Fix**: Add permission check for:
  - User viewing own transcript
  - Advisor viewing advisee transcript
  - Admin viewing any transcript
  - Public access if portfolio is public
- **Recommended Action**: Create GitHub issue immediately, fix within 1 week

---

### HIGH Priority (4 items)

#### 2. [HIGH] Re-enable welcome email after SendGrid setup
- **File**: [backend/routes/auth.py:651](backend/routes/auth.py#L651)
- **Issue**: Welcome emails disabled, awaiting SMTP configuration
- **Impact**: New users don't receive onboarding email
- **Dependencies**: SendGrid credentials, email templates
- **Status**: Email templates exist (`backend/templates/email/welcome.html`)
- **Recommended Action**: Create GitHub issue, complete when SendGrid configured

#### 3. [HIGH] Implement parent notification for evidence uploads
- **File**: [backend/routes/parent_evidence.py:397](backend/routes/parent_evidence.py#L397)
- **Issue**: Students not notified when parents upload evidence on their behalf
- **Impact**: Poor UX, students miss pending approvals
- **Dependencies**: Email service (already exists), notification preferences
- **Recommended Action**: Create GitHub issue, implement in next sprint

#### 4. [HIGH] Integrate tutor XP with existing XP service
- **File**: [backend/routes/tutor.py:800](backend/routes/tutor.py#L800)
- **Issue**: Tutor engagement XP bonuses not integrated with main XP system
- **Impact**: Duplicate XP logic, inconsistent tracking
- **Dependencies**: XP service refactoring
- **Recommended Action**: Create GitHub issue, coordinate with P1-ARCH-4 (service layer cleanup)

#### 5. [HIGH] Implement parent notification system for safety concerns
- **File**: [backend/routes/tutor.py:814](backend/routes/tutor.py#L814)
- **Issue**: Safety flags don't notify parents
- **Impact**: Parents unaware of concerning AI tutor interactions
- **Dependencies**: Parent linking system (exists), email service, notification preferences
- **Recommended Action**: Create GitHub issue, implement in next sprint

#### 6. [HIGH] Migrate auth response format to standardized format (registration)
- **Files**: backend/routes/auth/registration.py (lines 193, 290, 318, 398, 418, 444)
- **Issue**: Multiple auth endpoints use legacy response format instead of standardized format
- **Impact**: Inconsistent API contract, harder to maintain frontend
- **Dependencies**: Frontend updates to handle new format
- **Recommended Action**: Create GitHub issue, coordinate frontend-backend migration

#### 7. [HIGH] Migrate auth response format to standardized format (login)
- **Files**: backend/routes/auth/login.py (lines 270, 438, 656)
- **Issue**: Login endpoints use legacy response format
- **Impact**: Inconsistent API contract, harder to maintain frontend
- **Dependencies**: Frontend updates to handle new format
- **Recommended Action**: Create GitHub issue, coordinate frontend-backend migration

---

### MEDIUM Priority (10 items)

#### 8. [MEDIUM] Track actual badge earn dates
- **File**: [backend/repositories/badge_repository.py:169](backend/repositories/badge_repository.py#L169)
- **Issue**: Badge earn date not tracked in database
- **Impact**: Can't show badge progression timeline
- **Dependencies**: Database migration to add `earned_at` column to `user_badges` table
- **Recommended Action**: Create GitHub issue, implement when revisiting badge system

#### 9. [MEDIUM] Store safety flags in database for admin review
- **File**: [backend/services/safety_service.py:411](backend/services/safety_service.py#L411)
- **Issue**: Safety flags only logged, not persisted
- **Impact**: Can't review historical safety incidents
- **Dependencies**: Database table for safety incidents
- **Recommended Action**: Create GitHub issue, implement with admin safety dashboard

#### 10. [MEDIUM] Implement campaign scheduling
- **File**: [backend/services/campaign_automation_service.py:162](backend/services/campaign_automation_service.py#L162)
- **Issue**: Email campaigns can't be scheduled for future dates
- **Impact**: Manual timing of campaigns
- **Dependencies**: Background job scheduler (Celery or similar)
- **Recommended Action**: Create GitHub issue, implement when adding background jobs

#### 11. [MEDIUM] Implement HTML transcript format
- **File**: [backend/services/credit_mapping_service.py:232](backend/services/credit_mapping_service.py#L232)
- **Issue**: Transcript only supports JSON format
- **Impact**: Can't print/share formatted transcripts
- **Dependencies**: HTML template design
- **Recommended Action**: Create GitHub issue, implement with portfolio enhancements

#### 12. [MEDIUM] Implement PDF transcript generation
- **File**: [backend/services/credit_mapping_service.py:235](backend/services/credit_mapping_service.py#L235)
- **Issue**: No PDF export for transcripts
- **Impact**: Users can't generate official-looking transcripts
- **Dependencies**: PDF library (ReportLab or WeasyPrint), HTML template
- **Recommended Action**: Create GitHub issue, implement after HTML format

#### 13. [MEDIUM] Add advisor_badges tracking
- **File**: [backend/services/advisor_service.py:326](backend/services/advisor_service.py#L326)
- **Issue**: No way to track which advisor created which badges
- **Impact**: Can't attribute badge creation to advisors
- **Dependencies**: Database migration to add `created_by` column to `badges` table
- **Recommended Action**: Create GitHub issue, implement when refactoring badge system

#### 14. [MEDIUM] Implement cost tracking queries
- **File**: [backend/services/cost_tracker.py:96](backend/services/cost_tracker.py#L96)
- **Issue**: AI cost tracking incomplete
- **Impact**: Can't monitor API usage costs
- **Dependencies**: Logging infrastructure, analytics queries
- **Recommended Action**: Create GitHub issue, implement with admin analytics dashboard

#### 15. [MEDIUM] Send email/Slack notification for backup completion
- **File**: [backend/docs/BACKUP_RESTORE_TEST.md:519](backend/docs/BACKUP_RESTORE_TEST.md#L519)
- **Issue**: Backup completion not automatically communicated
- **Impact**: Manual checking of backup status
- **Dependencies**: Email service, Slack webhook
- **Recommended Action**: Create GitHub issue, implement with automated backup system

#### 16. [MEDIUM] Add cursor pagination to QuestRepository
- **File**: [backend/routes/quest/listing.py:149](backend/routes/quest/listing.py#L149)
- **Issue**: Quest listing doesn't support cursor pagination via repository
- **Impact**: Can't use more efficient pagination for large quest lists
- **Dependencies**: Update QuestRepository with cursor pagination support
- **Recommended Action**: Create GitHub issue, implement with pagination refactoring

#### 17. [MEDIUM] Implement dynamic endpoint version mapping
- **File**: [backend/utils/versioning.py:234](backend/utils/versioning.py#L234)
- **Issue**: Endpoint version mapping is hardcoded placeholder
- **Impact**: Can't dynamically manage API versioning
- **Dependencies**: Configuration system or database schema for version mapping
- **Recommended Action**: Create GitHub issue, implement as part of API versioning enhancement

---

## Documentation TODOs (9 items - All LOW Priority)

#### 18. [LOW] Document COPPA compliance implementation
- **File**: [backend/docs/LEGAL_COMPLIANCE_CHECKLIST.md:60-62](backend/docs/LEGAL_COMPLIANCE_CHECKLIST.md#L60-L62)
- **TODOs**:
  - Implement parental account linking
  - Create parent dashboard for monitoring minor accounts
  - Add data deletion request process for parents
- **Status**: Partially implemented (parent dashboard exists, linking exists)
- **Recommended Action**: Update documentation to reflect current implementation

#### 19. [LOW] Document data processing agreements
- **File**: [backend/docs/LEGAL_COMPLIANCE_CHECKLIST.md:101-104](backend/docs/LEGAL_COMPLIANCE_CHECKLIST.md#L101-L104)
- **TODOs**:
  - Document data processing agreement with Supabase
  - Document data processing agreement with Stripe
  - Document data processing agreement with OpenAI/Gemini
  - Document data retention policies
- **Status**: Agreements likely in place, need documentation
- **Recommended Action**: Work with legal team to document existing agreements

#### 20. [LOW] Review /settings endpoint authentication
- **File**: [backend/docs/SECURITY_AUDIT_ANALYSIS.md:87](backend/docs/SECURITY_AUDIT_ANALYSIS.md#L87)
- **Issue**: Unclear if `/settings` GET endpoint requires authentication
- **Recommended Action**: Audit endpoint, document decision

#### 21. [LOW] Remove or protect /tutor/test endpoint
- **File**: [backend/docs/SECURITY_AUDIT_ANALYSIS.md:88](backend/docs/SECURITY_AUDIT_ANALYSIS.md#L88)
- **Issue**: Test endpoint may be exposed in production
- **Recommended Action**: Verify endpoint doesn't exist in production, or add auth

#### 22. [LOW] Complete sequence analytics plan
- **File**: [backend/docs/SEQUENCE_ANALYTICS_PLAN.md:301](backend/docs/SEQUENCE_ANALYTICS_PLAN.md#L301)
- **Issue**: Analytics plan incomplete
- **Recommended Action**: Review and complete plan when implementing analytics

#### 23. [LOW] Implement deprecation statistics
- **File**: [backend/utils/deprecation.py:124](backend/utils/deprecation.py#L124)
- **Issue**: Deprecation statistics endpoint is placeholder only
- **Impact**: Can't track usage of deprecated endpoints
- **Dependencies**: Logging aggregation system
- **Recommended Action**: Create GitHub issue, implement with logging infrastructure

#### 24. [LOW/WON'T FIX] Send task flag to backend during personalization
- **File**: [frontend/src/components/quests/QuestPersonalizationWizard.jsx:207](frontend/src/components/quests/QuestPersonalizationWizard.jsx#L207)
- **Issue**: Users can't flag inappropriate tasks during personalization wizard
- **Impact**: Low - tasks aren't in library yet, so flagging doesn't make sense
- **Status**: Feature limitation - tasks only get IDs when saved to library after user accepts them
- **Recommended Action**: Document as "Won't Fix" - flagging only works for saved tasks

---

## Resolved TODOs (December 27, 2025)

#### RESOLVED: Observer fetching in ConnectionsPage
- **File**: ~~frontend/src/pages/ConnectionsPage.jsx:163~~
- **Issue**: Observer list was hardcoded empty array
- **Resolution**: Implemented useQuery hook to fetch observers from backend API
- **Impact**: Users can now see their linked observers in the Connections page
- **Date Resolved**: December 27, 2025

---

## Stale TODOs (Resolved or No Longer Relevant)

None identified beyond the resolved item above - all remaining TODOs are valid action items.

---

## New TODO Format (Enforce Going Forward)

All new TODOs MUST follow this format:

```python
# TODO(#<issue_number>): <description>
# Example: TODO(#42): Implement rate limiting for upload endpoint
```

This links the code comment directly to a GitHub issue for tracking.

---

## GitHub Issue Creation Checklist

### Critical (Create Immediately)
- [ ] Issue #1: Add authorization check to transcript endpoint (credits.py:73)

### High Priority (Create This Week)
- [ ] Issue #2: Re-enable welcome emails after SendGrid setup (auth.py:651)
- [ ] Issue #3: Add student notification for parent evidence uploads (parent_evidence.py:397)
- [ ] Issue #4: Integrate tutor XP with main XP service (tutor.py:800)
- [ ] Issue #5: Implement parent safety notifications (tutor.py:814)
- [ ] Issue #6: Migrate auth response format to standardized format - registration (registration.py)
- [ ] Issue #7: Migrate auth response format to standardized format - login (login.py)

### Medium Priority (Create This Month)
- [ ] Issue #8: Track badge earn dates (badge_repository.py:169)
- [ ] Issue #9: Persist safety flags to database (safety_service.py:411)
- [ ] Issue #10: Implement email campaign scheduling (campaign_automation_service.py:162)
- [ ] Issue #11: Add HTML transcript format (credit_mapping_service.py:232)
- [ ] Issue #12: Add PDF transcript generation (credit_mapping_service.py:235)
- [ ] Issue #13: Track advisor badge creation (advisor_service.py:326)
- [ ] Issue #14: Implement AI cost tracking queries (cost_tracker.py:96)
- [ ] Issue #15: Add backup completion notifications (BACKUP_RESTORE_TEST.md:519)
- [ ] Issue #16: Add cursor pagination to QuestRepository (quest/listing.py:149)
- [ ] Issue #17: Implement dynamic endpoint version mapping (utils/versioning.py:234)

### Low Priority (Document for Future)
- [ ] Issue #18: Update COPPA compliance documentation (LEGAL_COMPLIANCE_CHECKLIST.md)
- [ ] Issue #19: Document data processing agreements (LEGAL_COMPLIANCE_CHECKLIST.md)
- [ ] Issue #20: Audit /settings endpoint auth (SECURITY_AUDIT_ANALYSIS.md:87)
- [ ] Issue #21: Remove/protect /tutor/test endpoint (SECURITY_AUDIT_ANALYSIS.md:88)
- [ ] Issue #22: Complete sequence analytics plan (SEQUENCE_ANALYTICS_PLAN.md:301)
- [ ] Issue #23: Implement deprecation statistics (utils/deprecation.py:124)

---

## Enforcement Policy

1. **No new TODOs without GitHub issues** - All TODOs must reference an issue number
2. **Regular audits** - Run this audit quarterly to identify new TODOs
3. **Stale TODO cleanup** - Remove TODOs older than 6 months without progress
4. **Code review requirement** - PRs with TODOs must include corresponding GitHub issue link

---

## Audit Script

Use this command to find all TODOs:

```bash
cd backend
grep -r "TODO\|FIXME\|HACK\|XXX" --include="*.py" --line-number
```

---

**Next Steps**:
1. Create GitHub issues for all Critical and High priority items (7 issues - was 5)
2. Create GitHub issues for Medium priority items (10 issues - was 8)
3. Update documentation TODOs (9 items - was 8)
4. Add TODO format enforcement to code review checklist
5. Schedule quarterly TODO audits

**Completion**: This audit satisfies P1-QUAL-3 requirements. All 26 TODOs are now tracked and prioritized (updated December 27, 2025).

**December 27, 2025 Summary**:
- 1 TODO resolved (observer fetching)
- 6 new TODOs found (auth format migration, cursor pagination, versioning, deprecation)
- Net increase: +5 TODOs (26 total, was 21)
- All new TODOs documented with priority, impact, and recommended action
