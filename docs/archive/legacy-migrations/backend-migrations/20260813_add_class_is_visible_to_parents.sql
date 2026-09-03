-- Migration: 20260813_add_class_is_visible_to_parents.sql
-- Description: Adds is_visible_to_parents column to org_classes table (defaults to true)

ALTER TABLE org_classes ADD COLUMN IF NOT EXISTS is_visible_to_parents BOOLEAN NOT NULL DEFAULT TRUE;
