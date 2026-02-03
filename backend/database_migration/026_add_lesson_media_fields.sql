-- Migration 026: Add video_url and files columns to curriculum_lessons
-- Purpose: Support video embeds and file attachments in lessons
-- Created: 2025-12-29

BEGIN;

-- 1. Add video_url column for embedded videos (YouTube, Vimeo, etc.)
ALTER TABLE curriculum_lessons
ADD COLUMN IF NOT EXISTS video_url TEXT;

-- 2. Add files column for file attachments (JSONB array)
-- Format: [{"name": "file.pdf", "url": "https://...", "size": 12345}, ...]
ALTER TABLE curriculum_lessons
ADD COLUMN IF NOT EXISTS files JSONB DEFAULT NULL;

-- Add comments
COMMENT ON COLUMN curriculum_lessons.video_url IS 'URL for embedded video (YouTube, Vimeo). Null if no video.';
COMMENT ON COLUMN curriculum_lessons.files IS 'JSONB array of file attachments: [{name, url, size}, ...]';

COMMIT;
