-- Which three stories the www home page shows, in order. NULL means not
-- featured. The admin Stories list writes the whole lineup at once
-- (PUT /api/admin/stories/featured); the home page fills any empty slot with
-- the newest published story, so fewer than three picks still shows three.
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS featured_rank smallint
    CHECK (featured_rank BETWEEN 1 AND 3);

CREATE UNIQUE INDEX IF NOT EXISTS stories_featured_rank_unique
  ON public.stories (featured_rank)
  WHERE featured_rank IS NOT NULL;
