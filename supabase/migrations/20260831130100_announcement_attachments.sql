-- Announcement attachments (iCreate, 2026-08-31): files uploaded with a send,
-- stored as the same {url, type, name, size} list message attachments use.
-- Durable pointers only — readers sign them per read (private user-uploads).
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachments jsonb;
