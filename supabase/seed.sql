-- Optio Development Branch Seed Data
-- This file populates a fresh branch with test data for development
-- Run automatically when branch is created/reset, or manually via:
--   psql $DATABASE_URL -f supabase/seed.sql

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================
INSERT INTO organizations (id, name, slug, quest_visibility_policy, is_active) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Test Academy', 'test-academy', 'all_optio', true),
  ('00000000-0000-0000-0000-000000000002', 'Demo High School', 'demo-high', 'org_only', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- TEST USERS
-- ============================================================================
-- Note: These users need corresponding entries in auth.users for login to work.
-- For local development, you can create them via the Supabase Dashboard or
-- use the registration flow.

-- Platform Users (no organization)
INSERT INTO users (id, email, display_name, first_name, last_name, role, total_xp, level, tutorial_completed_at) VALUES
  -- Superadmin
  ('11111111-1111-1111-1111-111111111111', 'test-superadmin@optioeducation.com', 'Test Admin', 'Test', 'Admin', 'superadmin', 0, 1, NOW()),
  -- Platform Student
  ('22222222-2222-2222-2222-222222222222', 'test-student@example.com', 'Test Student', 'Test', 'Student', 'student', 500, 3, NOW()),
  -- Platform Parent
  ('33333333-3333-3333-3333-333333333333', 'test-parent@example.com', 'Test Parent', 'Test', 'Parent', 'parent', 0, 1, NOW()),
  -- Platform Advisor
  ('44444444-4444-4444-4444-444444444444', 'test-advisor@example.com', 'Test Advisor', 'Test', 'Advisor', 'advisor', 0, 1, NOW()),
  -- Platform Observer
  ('55555555-5555-5555-5555-555555555555', 'test-observer@example.com', 'Test Observer', 'Test', 'Observer', 'observer', 0, 1, NOW())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role;

-- Organization Users
INSERT INTO users (id, email, display_name, first_name, last_name, role, org_role, organization_id, total_xp, level, tutorial_completed_at) VALUES
  -- Org Admin
  ('66666666-6666-6666-6666-666666666666', 'org-admin@test-academy.com', 'Org Admin', 'Org', 'Admin', 'org_managed', 'org_admin', '00000000-0000-0000-0000-000000000001', 0, 1, NOW()),
  -- Org Student
  ('77777777-7777-7777-7777-777777777777', 'org-student@test-academy.com', 'Org Student', 'Org', 'Student', 'org_managed', 'student', '00000000-0000-0000-0000-000000000001', 250, 2, NOW()),
  -- Org Advisor
  ('88888888-8888-8888-8888-888888888888', 'org-advisor@test-academy.com', 'Org Advisor', 'Org', 'Advisor', 'org_managed', 'advisor', '00000000-0000-0000-0000-000000000001', 0, 1, NOW())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role,
  org_role = EXCLUDED.org_role,
  organization_id = EXCLUDED.organization_id;

-- Dependent Child (managed by parent)
INSERT INTO users (id, email, display_name, first_name, last_name, role, is_dependent, managed_by_parent_id, total_xp, level, tutorial_completed_at) VALUES
  ('99999999-9999-9999-9999-999999999999', 'child@example.com', 'Test Child', 'Test', 'Child', 'student', true, '33333333-3333-3333-3333-333333333333', 100, 1, NOW())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  is_dependent = EXCLUDED.is_dependent,
  managed_by_parent_id = EXCLUDED.managed_by_parent_id;

-- ============================================================================
-- TEST QUESTS
-- ============================================================================
INSERT INTO quests (id, title, description, big_idea, quest_type, is_active, is_public, created_by) VALUES
  -- Public Quest
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Learn to Code', 'Introduction to programming fundamentals', 'Programming opens doors to creativity and problem-solving', 'standard', true, true, '11111111-1111-1111-1111-111111111111'),
  -- Standard Quest
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Financial Literacy', 'Understanding money management and investing', 'Financial knowledge empowers independence', 'standard', true, false, '11111111-1111-1111-1111-111111111111'),
  -- Organization Quest
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Academy Special Project', 'Exclusive project for Test Academy members', 'Collaboration builds community', 'standard', true, false, '66666666-6666-6666-6666-666666666666')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

-- Link org quest to organization
UPDATE quests SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- ============================================================================
-- USER QUEST ENROLLMENTS
-- ============================================================================
INSERT INTO user_quests (user_id, quest_id, status, started_at) VALUES
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active', NOW()),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'active', NOW()),
  ('77777777-7777-7777-7777-777777777777', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'active', NOW()),
  ('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- USER QUEST TASKS
-- ============================================================================
INSERT INTO user_quest_tasks (id, user_id, quest_id, title, description, pillar, xp_value, approval_status) VALUES
  -- Test Student's tasks
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Complete Python Tutorial', 'Work through the Python basics tutorial', 'Knowledge', 50, 'approved'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Build a Calculator App', 'Create a simple calculator using Python', 'Skill', 100, 'pending'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Track Expenses for a Week', 'Record all spending for 7 days', 'Character', 75, 'pending'),
  -- Org Student's tasks
  ('11111111-2222-3333-4444-555555555555', '77777777-7777-7777-7777-777777777777', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Team Project Kickoff', 'Attend kickoff meeting and define roles', 'Community', 50, 'approved')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  approval_status = EXCLUDED.approval_status;

-- ============================================================================
-- PARENT-STUDENT LINKS
-- ============================================================================
INSERT INTO parent_student_links (parent_id, student_id, relationship_type, status, verified_at) VALUES
  ('33333333-3333-3333-3333-333333333333', '99999999-9999-9999-9999-999999999999', 'parent', 'active', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- OBSERVER-STUDENT LINKS
-- ============================================================================
INSERT INTO observer_student_links (observer_id, student_id, status, created_at) VALUES
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'active', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- ADVISOR-STUDENT ASSIGNMENTS
-- ============================================================================
INSERT INTO advisor_student_assignments (advisor_id, student_id, assigned_at, is_active) VALUES
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', NOW(), true),
  ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', NOW(), true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- COURSES
-- ============================================================================
INSERT INTO courses (id, title, description, status, visibility, created_by) VALUES
  ('12345678-1234-1234-1234-123456789012', 'Introduction to Self-Directed Learning', 'Learn how to take charge of your own education', 'published', 'public', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status;

-- Link course to quest
INSERT INTO course_quests (course_id, quest_id, sequence_order) VALUES
  ('12345678-1234-1234-1234-123456789012', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Test Users Created:
--   - test-superadmin@optioeducation.com (superadmin)
--   - test-student@example.com (platform student, 500 XP)
--   - test-parent@example.com (platform parent)
--   - test-advisor@example.com (platform advisor)
--   - test-observer@example.com (platform observer)
--   - org-admin@test-academy.com (org admin)
--   - org-student@test-academy.com (org student, 250 XP)
--   - org-advisor@test-academy.com (org advisor)
--   - child@example.com (dependent child managed by test-parent)
--
-- Organizations:
--   - Test Academy (test-academy)
--   - Demo High School (demo-high)
--
-- Quests:
--   - Learn to Code (public)
--   - Financial Literacy (standard)
--   - Academy Special Project (org-specific)
--
-- NOTE: To log in as these users, you need to:
-- 1. Create matching auth.users entries (via Dashboard or registration)
-- 2. Or use the app's registration flow with these emails
