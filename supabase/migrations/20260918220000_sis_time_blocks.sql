-- The school day's blocks as rows with ids, not a JSON list with none.
--
-- feature_flags.sis_settings.time_blocks held [{start, end, label}] and every
-- reader -- the block reports, the parent's Schedule Builder, the sheet sync,
-- the AI schedule editor, the tuition quote -- matched a class meeting to a
-- block by its times and named it by its position ("Block 2" is the second
-- teaching block). Inserting or retiming a block renumbered every roster,
-- and nothing could say "this meeting IS Block 2" (audit E1; consolidation
-- move M8b). The first half of M8b (2026-09-17) put every reader behind
-- sis_catalog_service.time_blocks; this is the second half: the rows, and
-- class_meetings.block_id for the meetings that fill exactly one block.
--
-- Additive. The JSON list is copied, not removed: the code that reads the
-- rows ships after this runs, and the writer clears the legacy key on the
-- school's first save. Idempotent: an org with rows already is left alone.

CREATE TABLE IF NOT EXISTS public.sis_time_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  start_time time NOT NULL,
  end_time time NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
ALTER TABLE public.sis_time_blocks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sis_time_blocks_org
  ON public.sis_time_blocks (organization_id, sort_order);

COMMENT ON TABLE public.sis_time_blocks IS
  'The standard periods of a school''s day, in order. A blank label means "Block N" by position among the non-break blocks; a label naming a break (Lunch, Recess) is not a teaching block.';

ALTER TABLE public.class_meetings
  ADD COLUMN IF NOT EXISTS block_id uuid REFERENCES public.sis_time_blocks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_class_meetings_block ON public.class_meetings (block_id);

COMMENT ON COLUMN public.class_meetings.block_id IS
  'The school block this meeting fills, when its times are exactly one block''s; NULL for custom times and for meetings spanning several blocks. Set by the class writer; the meeting''s own start_time/end_time stay authoritative for when it meets.';

-- Copy each org's JSON list into rows, in list order.
INSERT INTO public.sis_time_blocks (organization_id, label, start_time, end_time, sort_order)
SELECT o.id,
       coalesce(t.b->>'label', ''),
       (t.b->>'start')::time,
       (t.b->>'end')::time,
       (t.ord - 1)::integer
FROM public.organizations o,
     jsonb_array_elements(o.feature_flags->'sis_settings'->'time_blocks') WITH ORDINALITY AS t(b, ord)
WHERE jsonb_typeof(o.feature_flags->'sis_settings'->'time_blocks') = 'array'
  AND (t.b->>'start') ~ '^[0-9]{1,2}:[0-9]{2}'
  AND (t.b->>'end') ~ '^[0-9]{1,2}:[0-9]{2}'
  AND (t.b->>'end')::time > (t.b->>'start')::time
  AND NOT EXISTS (SELECT 1 FROM public.sis_time_blocks x WHERE x.organization_id = o.id);

-- A meeting whose times are exactly one block's is that block.
UPDATE public.class_meetings m
SET block_id = tb.id
FROM public.sis_time_blocks tb
WHERE tb.organization_id = m.organization_id
  AND tb.start_time = m.start_time
  AND tb.end_time = m.end_time
  AND m.block_id IS NULL;
