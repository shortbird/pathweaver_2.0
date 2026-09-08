-- Migration: Add override system to email templates
-- Date: 2025-12-01
-- Purpose: Enable hybrid system where database templates can override YAML defaults

-- Add is_override column to track if this template overrides a YAML template
ALTER TABLE crm_email_templates
ADD COLUMN IF NOT EXISTS is_override BOOLEAN DEFAULT false;

-- Add index for efficient override lookups
CREATE INDEX IF NOT EXISTS idx_crm_email_templates_override
ON crm_email_templates(template_key, is_override)
WHERE is_override = true;

-- Update existing templates:
-- - Templates with is_system = false are custom templates (mark as override)
-- - Templates with is_system = true were synced from YAML (mark as NOT override)
UPDATE crm_email_templates
SET is_override = NOT is_system
WHERE is_override IS NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN crm_email_templates.is_system IS 'True if template was originally from YAML (system template)';
COMMENT ON COLUMN crm_email_templates.is_override IS 'True if this template overrides the YAML default (takes precedence)';

-- Migration complete
-- Now templates work as follows:
-- 1. Check database for templates with is_override = true (these take precedence)
-- 2. Fall back to YAML if no override exists
-- 3. Admins can edit any template - creates an override record
-- 4. Admins can "revert to default" - deletes the override record
