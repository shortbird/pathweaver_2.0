# Deprecated Migrations

**Status**: Archived
**Date Deprecated**: December 2025
**Reason**: Features removed during Phase 1 and Phase 2 refactoring

---

## Overview

This directory contains migration files for features that were removed from the Optio platform. These files are kept for historical reference only and should NOT be run on any database.

---

## Deprecated Features

### Phase 1 Refactoring (January 2025)

#### Quest Collaborations
Quest collaborations (team-based quests) were removed in Phase 1. Students now complete all quests individually, with connection system for social features instead.

**Removed Tables**:
- `quest_collaborations`
- `task_collaborations`

**Related Files**:
- `07_restore_quest_collaborations_table.sql` - Do NOT run

#### Quest Ratings
User rating system for quests was removed in Phase 1. Quest quality is now assessed through admin reviews and completion data.

**Removed Tables**:
- `quest_ratings`

**Related Files**:
- `06_restore_quest_ratings_table.sql` - Do NOT run

---

### Phase 2 Refactoring (January 2025)

#### Subscription Tiers
Subscription tier system was removed in Phase 2. All users now have full access to platform features. Monetization moved to B2B enterprise model.

**Removed Tables**:
- `subscription_tiers`
- `subscription_requests`
- `subscription_history`

**Removed User Columns**:
- `subscription_tier`
- `subscription_status`
- `subscription_start_date`
- `subscription_end_date`
- `stripe_customer_id`

**Related Files**:
- `create_subscription_tiers_table.sql` - Do NOT run
- `create_subscription_requests_table.sql` - Do NOT run

---

## Migration Scripts Also Deprecated

The following Python scripts in `backend/scripts/` create tables for removed features:

- `create_subscription_history_simple.py` - Do NOT run
- `create_subscription_history_table.py` - Do NOT run

These scripts have been left in place for historical reference but should not be executed.

---

## What to Do Instead

### For Quest Features
- Use the connection system for social features
- Individual quest completion with XP tracking
- Badges for achievement recognition

### For Monetization
- Enterprise organization accounts (implemented December 2025)
- Organization-level billing and user management
- Custom quest curation for organizations

---

## Database State Verification

If you need to verify these tables are properly deleted, use:

```sql
-- Check for deleted tables (should return no results)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  -- Phase 1 & 2 removed tables
  'quest_collaborations',
  'task_collaborations',
  'quest_ratings',
  'subscription_tiers',
  'subscription_requests',
  'subscription_history',
  -- February 2026 cleanup
  'quest_tasks_archived',
  'user_quest_tasks_legacy_archived',
  'learning_logs_backup',
  'parent_invitations_backup',
  'advisor_groups',
  'advisor_group_members',
  'pillar_subcategories',
  'quest_reflection_prompts',
  'submissions',
  'learning_logs',
  'user_xp',
  'user_credit_summary',
  'parent_child_relationships',
  'quest_templates',
  'quest_reviews',
  'quest_metadata',
  'quest_paths',
  'quest_customizations',
  'leaderboards',
  'user_achievements',
  'ai_cycle_logs'
);

-- Check user columns are removed (should not include subscription columns)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'users'
AND column_name LIKE '%subscription%';
```

---

## Migration Runner Configuration

If you use an automated migration runner, ensure it skips this directory:

```python
# Example migration runner config
MIGRATION_PATHS = [
    'backend/migrations/*.sql'
]
EXCLUDED_PATHS = [
    'backend/migrations/deprecated/*',
    'backend/migrations/verification_queries.sql'  # Query-only file
]
```

---

## Historical Context

### Why Were These Features Removed?

**Quest Collaborations**:
- Low usage (< 5% of quests were collaborative)
- Complex edge cases (what if collaborator drops out?)
- Difficult XP attribution
- Connections system provides better social features

**Quest Ratings**:
- Rating quality was poor (mostly 5 stars or no rating)
- Admin quality review process more effective
- Completion rate and task completion time provide better metrics

**Subscription Tiers**:
- B2C freemium model not sustainable
- B2B enterprise sales more promising
- Feature gating created poor user experience
- All users now get full access

---

### February 2026 Database Cleanup

#### Unused Tables Cleanup
Large-scale cleanup of 21 unused database objects (20 tables + 1 view) that were identified as archived, abandoned, or superseded.

**Migration**: `20260216_cleanup_unused_tables`

**Archived Tables (4)**:
- `quest_tasks_archived` - Archived Jan 2025, old task system
- `user_quest_tasks_legacy_archived` - Archived legacy data
- `learning_logs_backup` - Empty backup table
- `parent_invitations_backup` - Empty backup table

**Abandoned Features (5)**:
- `advisor_groups` - Feature never implemented
- `advisor_group_members` - Feature never implemented
- `pillar_subcategories` - Superseded by school_subjects.py diploma mapping
- `quest_reflection_prompts` - Feature not implemented
- `submissions` - Legacy test data from Aug 2025

**Superseded Tables (12)**:
- `learning_logs` - Replaced by `learning_events`
- `user_xp` - Replaced by `user_skill_xp`
- `user_credit_summary` (VIEW) - Replaced by `credit_ledger`
- `parent_child_relationships` - Replaced by `parent_student_links`
- `quest_templates` - Not used, `quest_template_tasks` is active
- `quest_reviews` - Ratings removed in Phase 1
- `quest_metadata` - Not used
- `quest_paths` - Not used
- `quest_customizations` - Not used
- `leaderboards` - Not used
- `user_achievements` - Not used
- `ai_cycle_logs` - Not used

**FK Constraints Also Dropped**:
- `credit_ledger_task_id_fkey` - Referenced archived table
- `tutor_conversations_task_id_fkey` - Referenced archived table

---

## Questions?

If you have questions about these deprecated features or need to understand historical codebase decisions, see:

- [CLAUDE.md](../../CLAUDE.md) - Phase 1 and Phase 2 documentation
- [COMPREHENSIVE_CODEBASE_REVIEW.md](../../COMPREHENSIVE_CODEBASE_REVIEW.md) - P0-DATA-1 and P0-DATA-2 sections
- Git history: Search for "Phase 1" or "Phase 2" commits in January 2025

---

**Last Updated**: February 16, 2026
**Maintained By**: Development Team
**Status**: Archived - Do Not Modify
