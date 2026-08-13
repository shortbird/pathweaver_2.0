-- Scheduled publishing for class quests (org_classes)
--
-- Lets a teacher schedule WHEN a quest assigned to a class becomes visible to the
-- students in that class. A class_quest with publish_at in the future is hidden
-- from students but still shown to teachers/admins (with a "scheduled" indicator).
--
-- There is no is_published flip and no cron job: class quests reach students through
-- a single read path (GET .../classes/<id>/quests), so visibility is evaluated at
-- read time — the quest appears automatically once publish_at passes. A NULL
-- publish_at means "visible now" (the existing default behaviour).
--
-- Who can SET a schedule is gated in the app layer behind the org feature flag
-- `scheduled_publish` (see backend/utils/org_features.py). Nullable, no default, so
-- every existing class_quest row is unaffected (visible now).

ALTER TABLE class_quests
  ADD COLUMN IF NOT EXISTS publish_at timestamptz;

COMMENT ON COLUMN class_quests.publish_at IS
  'Optional scheduled time at which this quest becomes visible to the class''s students. NULL = visible now. Future = hidden from students, shown to teachers. Gated by org feature flag scheduled_publish.';
