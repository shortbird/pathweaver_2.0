-- Migration: Drop badge-related tables
-- Phase 1: Badge removal (frontend and backend code already cleaned up)
-- Date: 2026-01-01

-- Drop tables in correct order (respecting foreign key dependencies)
DROP TABLE IF EXISTS user_badges CASCADE;
DROP TABLE IF EXISTS badge_quests CASCADE;
DROP TABLE IF EXISTS badge_requirements CASCADE;
DROP TABLE IF EXISTS badges CASCADE;
