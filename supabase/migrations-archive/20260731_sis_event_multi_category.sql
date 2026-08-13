-- Calendar events can belong to more than one category.
--
-- iCreate, 2026-07-30: "With the color coding on the calendar, can we make it so
-- that we can choose more than one category? Some things will belong in more
-- than one category."
--
-- `category` stays as the PRIMARY category — it drives the event's colour, the
-- per-category ICS feeds, and every existing query — and is kept in sync as
-- categories[0]. Nothing that reads only `category` needs to change.

ALTER TABLE sis_events
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';

-- Backfill: an event with a category becomes a one-category event.
UPDATE sis_events
   SET categories = ARRAY[category]
 WHERE category IS NOT NULL
   AND category <> ''
   AND cardinality(categories) = 0;

-- Filtering "events in category X" hits the array on every calendar load.
CREATE INDEX IF NOT EXISTS idx_sis_events_categories
  ON sis_events USING GIN (categories);
