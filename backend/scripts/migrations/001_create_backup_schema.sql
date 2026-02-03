-- File: migrations/001_create_backup_schema.sql
-- Purpose: Create backup schema and copy tables before deletion
-- Date: January 2025

-- Create backup schema for safety
CREATE SCHEMA IF NOT EXISTS backup_schema;

-- Backup tables we plan to delete
CREATE TABLE backup_schema.quest_collaborations AS
  SELECT * FROM quest_collaborations;

CREATE TABLE backup_schema.task_collaborations AS
  SELECT * FROM task_collaborations;

CREATE TABLE backup_schema.quest_ratings AS
  SELECT * FROM quest_ratings;

CREATE TABLE backup_schema.subscription_tiers AS
  SELECT * FROM subscription_tiers;

CREATE TABLE backup_schema.subscription_requests AS
  SELECT * FROM subscription_requests;

CREATE TABLE backup_schema.subscription_history AS
  SELECT * FROM subscription_history;

-- Backup users table (before column deletion)
CREATE TABLE backup_schema.users_backup AS
  SELECT * FROM users;

-- Backup quests table (before modification)
CREATE TABLE backup_schema.quests_backup AS
  SELECT * FROM quests;

-- Verify backups
SELECT
  'quest_collaborations' as table_name,
  COUNT(*) as row_count
FROM backup_schema.quest_collaborations
UNION ALL
SELECT 'task_collaborations', COUNT(*) FROM backup_schema.task_collaborations
UNION ALL
SELECT 'quest_ratings', COUNT(*) FROM backup_schema.quest_ratings
UNION ALL
SELECT 'subscription_tiers', COUNT(*) FROM backup_schema.subscription_tiers
UNION ALL
SELECT 'subscription_requests', COUNT(*) FROM backup_schema.subscription_requests
UNION ALL
SELECT 'subscription_history', COUNT(*) FROM backup_schema.subscription_history
UNION ALL
SELECT 'users_backup', COUNT(*) FROM backup_schema.users_backup
UNION ALL
SELECT 'quests_backup', COUNT(*) FROM backup_schema.quests_backup;
