-- The material a quest was built from, kept so learners can build on it too.
--
-- Background. A school drafts a training quest by uploading its handbook
-- (POST /api/sis/quest-drafts/generate): the document is parsed, the text is
-- handed to the model, a draft comes back, and the text is then thrown away.
-- Fine when the draft was the whole job.
--
-- iCreate, 2026-08-17, wants staff and families to be able to generate their
-- OWN tasks on a training quest, "using the uploaded content as context". The
-- learner-side generator (services/personalization_service.py) builds its prompt
-- from the quest's title and big_idea, which is a paragraph -- not enough to
-- write a task about a specific policy in a 30-page handbook. So the source text
-- has to survive the draft that created it.
--
-- Its own column rather than a key in `quests.metadata`, because metadata is
-- serialized to the learner's browser on every quest-detail load
-- (routes/quest/detail.py) -- putting a handbook there would ship the whole
-- document to the client and bloat the response. Nothing selects this column by
-- name except the personalization service, which reads the quest row with
-- select('*') server-side.

ALTER TABLE public.quests
    ADD COLUMN IF NOT EXISTS source_material text;

COMMENT ON COLUMN public.quests.source_material IS
    'Source text the quest was drafted from (a handbook, syllabus, outline). Used as authoritative context when a learner generates their own tasks. Server-side only -- do not add to the quest-detail select list.';
