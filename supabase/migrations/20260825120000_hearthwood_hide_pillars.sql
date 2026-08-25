-- Hearthwood Academy switches Optio's five pillars off.
--
-- Hearthwood is a diploma program: what its families are working toward is
-- school-subject credit, so the pillars (STEM / Wellness / Communication /
-- Civics / Art) are a second, parallel label on the same task. A parent wrote in
-- on 2026-08-25 -- "the Pillar and task sizes are so bizarre and hard to make
-- sense of" -- having got stuck trying to upload evidence.
--
-- `feature_flags.hide_pillars` is a generic per-org gate, not a Hearthwood
-- special case: the frontend reads it through hooks/useHidePillars.js and any
-- org admin can flip it from Organization -> Settings. Nothing is deleted --
-- user_quest_tasks.pillar is still written, derived from the diploma credit the
-- family chose (backend/utils/school_subjects.py::pillar_for_subject) -- so
-- turning this back off restores every pillar view exactly as it was.
--
-- Applied to the live org and its (Test) twin so staging behaves the same.

UPDATE organizations
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                    || jsonb_build_object('hide_pillars', true),
    updated_at = now()
WHERE slug IN ('hearthwood', 'hearthwood-test');
