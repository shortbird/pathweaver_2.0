-- Attach a learning moment to a quest task as draft evidence.
-- Mobile capture can attach; completion still happens on web.
-- 1:1 — each moment can link to at most one task, each task has at most one attached moment.

ALTER TABLE learning_events
  ADD COLUMN attached_task_id UUID
  REFERENCES user_quest_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_learning_events_attached_task
  ON learning_events(attached_task_id)
  WHERE attached_task_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_events_attached_task_unique
  ON learning_events(attached_task_id)
  WHERE attached_task_id IS NOT NULL;
