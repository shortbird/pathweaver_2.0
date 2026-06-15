-- Due dates for class quests (org_classes)
--
-- Lets a teacher set a due date on a quest assigned to a class. Unlike publish_at
-- (which hides the quest until it arrives), due_date is purely informational: the
-- quest stays visible and students see a "Due <date>" badge and an upcoming agenda.
--
-- Who can SET a due date is gated in the app layer behind the org feature flag
-- `due_dates` (see backend/utils/org_features.py). Nullable, no default.

ALTER TABLE class_quests
  ADD COLUMN IF NOT EXISTS due_date timestamptz;

COMMENT ON COLUMN class_quests.due_date IS
  'Optional due date shown to the class''s students (badge + agenda). Informational only; does not hide the quest. Gated by org feature flag due_dates.';
