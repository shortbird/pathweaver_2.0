-- Training can be a link, not only a quest.
--
-- Background. The SIS Training page is built out of quests: an admin attaches
-- one from the library or builds one in the form, and teachers work through
-- its tasks in the web platform. That is right for an orientation course and
-- wrong for the thing iCreate actually has most of -- a recorded training on
-- Loom, a slide deck in Drive, a district PDF. Turning each of those into a
-- quest means inventing tasks for a video, and the office stopped adding them
-- (iCreate, 2026-09-15: "I still dont' have a way to add resources to the
-- teacher training. I need to get some trainings up asap!"; Marika, same day:
-- "the ability to add training as links and not just as new quests").
--
-- A training link is an org_resources row. That table already carries
-- everything the Training page needs -- title, url, description, category,
-- role and named-person targeting, and sis_resource_acks for "who has done
-- it" -- so a link is one flag on an existing row rather than a parallel
-- table with a parallel completion record. The flag is what keeps the two
-- pages apart: the Resources page lists the document library and hides
-- training rows; the Training page lists training rows beside its quests and
-- nothing else. Without it every training video would also appear under
-- Resources, and every guidebook under Training.
--
-- `audience` stays 'staff' on a training row (the form sets it), so the family
-- portal, which reads families/all, never sees one.

ALTER TABLE public.org_resources
    ADD COLUMN IF NOT EXISTS is_training boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.org_resources.is_training IS
  'True for a link the SIS Training page owns (a recorded training, a deck). Hidden from the Resources page. Done-ness is a sis_resource_acks row, the same as a required document.';

-- The Training page reads one org's training rows in order; the partial index
-- keeps that read off the document library, which is the larger half.
CREATE INDEX IF NOT EXISTS org_resources_training_idx
  ON public.org_resources (organization_id, sort_order, title)
  WHERE is_training;
