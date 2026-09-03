-- Migration: Add showcase fields for public course pages
-- Date: 2026-02-03
-- Purpose: Add parent-focused fields for course marketing/discovery

-- Add URL slug for public course pages (SEO-friendly URLs)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Parent-focused showcase fields
-- Array: ["Critical thinking", "Creative writing", "Project management"]
ALTER TABLE courses ADD COLUMN IF NOT EXISTS learning_outcomes JSONB DEFAULT '[]';

-- Example: "A published children's picture book with 12+ illustrated pages"
ALTER TABLE courses ADD COLUMN IF NOT EXISTS final_deliverable TEXT;

-- How much support is provided
ALTER TABLE courses ADD COLUMN IF NOT EXISTS guidance_level TEXT
  CHECK (guidance_level IS NULL OR guidance_level IN ('guided', 'moderate', 'independent'));

-- Example: "Covers language arts, visual arts, and digital literacy standards"
ALTER TABLE courses ADD COLUMN IF NOT EXISTS academic_alignment TEXT;

-- Example: "Ages 10-14" or "Middle School"
ALTER TABLE courses ADD COLUMN IF NOT EXISTS age_range TEXT;

-- Total hours to complete the course
ALTER TABLE courses ADD COLUMN IF NOT EXISTS estimated_hours INTEGER;

-- Create index for slug lookups (fast public page access)
CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug);

-- Comment on new columns for documentation
COMMENT ON COLUMN courses.slug IS 'URL-friendly slug for public course pages (e.g., picture-book-creation)';
COMMENT ON COLUMN courses.learning_outcomes IS 'JSON array of skills/competencies students will develop';
COMMENT ON COLUMN courses.final_deliverable IS 'Description of the tangible end product students will create';
COMMENT ON COLUMN courses.guidance_level IS 'Amount of support provided: guided, moderate, or independent';
COMMENT ON COLUMN courses.academic_alignment IS 'How course content aligns with traditional academic standards';
COMMENT ON COLUMN courses.age_range IS 'Target age range or grade level for the course';
COMMENT ON COLUMN courses.estimated_hours IS 'Estimated total hours to complete the course';
