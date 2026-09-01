-- Delivery channels for announcements (iCreate, 2026-08-31): the office can
-- send as app message, email, or both. in_app=false rows never fan out as
-- notifications and stay off the family-facing surfaces (announcements list,
-- archive); they exist for the staff send history. Every existing row was an
-- app send, hence the default.
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS in_app boolean NOT NULL DEFAULT true;
