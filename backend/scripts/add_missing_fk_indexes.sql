-- Migration: Add missing foreign key indexes for performance
-- Date: January 2025
-- Purpose: Fix performance issue where 11 FK columns lack indexes
-- Impact: Significantly improves JOIN performance on related tables

-- Check if index doesn't exist before creating (prevents errors on re-run)

-- advisor_student_assignments.assigned_by
CREATE INDEX IF NOT EXISTS idx_advisor_student_assignments_assigned_by
ON advisor_student_assignments(assigned_by);

-- ai_generated_quests.reviewer_id
CREATE INDEX IF NOT EXISTS idx_ai_generated_quests_reviewer_id
ON ai_generated_quests(reviewer_id);

-- ai_generation_jobs.created_by
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_created_by
ON ai_generation_jobs(created_by);

-- automation_sequences.created_by
CREATE INDEX IF NOT EXISTS idx_automation_sequences_created_by
ON automation_sequences(created_by);

-- email_campaigns.created_by
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_by
ON email_campaigns(created_by);

-- email_templates.created_by
CREATE INDEX IF NOT EXISTS idx_email_templates_created_by
ON email_templates(created_by);

-- observer_requests.reviewed_by
CREATE INDEX IF NOT EXISTS idx_observer_requests_reviewed_by
ON observer_requests(reviewed_by);

-- parent_connection_requests.reviewed_by_admin_id
CREATE INDEX IF NOT EXISTS idx_parent_connection_requests_reviewed_by_admin_id
ON parent_connection_requests(reviewed_by_admin_id);

-- quest_reviews.reviewer_id
CREATE INDEX IF NOT EXISTS idx_quest_reviews_reviewer_id
ON quest_reviews(reviewer_id);

-- service_inquiries.user_id
CREATE INDEX IF NOT EXISTS idx_service_inquiries_user_id
ON service_inquiries(user_id);

-- user_segments.created_by
CREATE INDEX IF NOT EXISTS idx_user_segments_created_by
ON user_segments(created_by);

-- Verify indexes were created
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%_assigned_by'
    OR indexname LIKE 'idx_%_reviewer_id'
    OR indexname LIKE 'idx_%_created_by'
    OR indexname LIKE 'idx_%_reviewed_by%'
    OR indexname LIKE 'idx_service_inquiries_user_id'
ORDER BY tablename, indexname;
