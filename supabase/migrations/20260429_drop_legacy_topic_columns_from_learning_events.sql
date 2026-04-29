-- Drop legacy single-value topic columns from learning_events.
-- The learning_event_topics junction table is now the sole source of truth for
-- which topics (interest tracks) and quests a learning moment is assigned to.
--
-- Backfill orphaned legacy assignments into the junction so we don't silently
-- lose topic info on column drop.

INSERT INTO public.learning_event_topics (learning_event_id, topic_type, topic_id)
SELECT le.id, 'topic', le.track_id
FROM public.learning_events le
WHERE le.track_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.learning_event_topics t
    WHERE t.learning_event_id = le.id
      AND t.topic_type = 'topic'
      AND t.topic_id = le.track_id
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.learning_event_topics (learning_event_id, topic_type, topic_id)
SELECT le.id, 'quest', le.quest_id
FROM public.learning_events le
WHERE le.quest_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.learning_event_topics t
    WHERE t.learning_event_id = le.id
      AND t.topic_type = 'quest'
      AND t.topic_id = le.quest_id
  )
ON CONFLICT DO NOTHING;

ALTER TABLE public.learning_events
  DROP COLUMN track_id,
  DROP COLUMN quest_id;
