-- Link a group conversation to the class roster it was created from.
--
-- Lets "create a group chat for this class" be idempotent: if a class already has
-- a linked group, we sync its membership instead of creating a duplicate.

ALTER TABLE group_conversations
  ADD COLUMN IF NOT EXISTS source_class_id uuid REFERENCES org_classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_conversations_source_class
  ON group_conversations (source_class_id)
  WHERE source_class_id IS NOT NULL;
