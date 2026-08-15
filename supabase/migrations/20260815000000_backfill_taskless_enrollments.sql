-- Backfill: materialize template tasks for active enrollments that never got any.
--
-- Background. GET /api/quests/<id> used to "self-heal": when a read found an
-- active enrollment with zero approved tasks, it copied the quest's template
-- tasks in and set personalization_completed. That covered enrollments created
-- by advisor assignment / invitation accept before those paths did the copy
-- themselves.
--
-- It also silently undid a student deleting their last task -- the empty task
-- list looked identical to a never-seeded enrollment, so the deleted task
-- reappeared on the next page load. The read-time heal is now removed
-- (backend/routes/quest/detail.py), the enrollment-creation paths own the copy,
-- and dropping the final task marks personalization_completed to record that
-- the empty list is deliberate. This migration performs the heal one final
-- time for the enrollments that were still relying on it.
--
-- Mirrors utils/template_tasks.copy_template_tasks_to_enrollment, including its
-- fallback from quest_template_tasks to the legacy quest_sample_tasks table
-- (routes/quest_types.get_template_tasks).
--
-- Measured on prod 2026-08-15: 106 task-less active enrollments, of which 7
-- have template tasks and 4 more have only legacy sample tasks -- 11 in scope,
-- receiving 112 task rows. The other 95 belong to quests with no authored tasks
-- at all; the heal never fired for them and this skips them too.
--
-- Written as one statement with data-modifying CTEs so the two inserts and the
-- flag update are atomic without assuming anything about how the migration
-- runner wraps the file in a transaction. The flag is set only for enrollments
-- that actually received rows (via RETURNING), so a quest whose task list turns
-- out to be empty is left alone.

WITH scope AS (
    SELECT
        uq.id AS user_quest_id,
        uq.user_id,
        uq.quest_id,
        EXISTS (
            SELECT 1 FROM quest_template_tasks qtt WHERE qtt.quest_id = uq.quest_id
        ) AS use_template_table
    FROM user_quests uq
    WHERE uq.is_active = true
      AND COALESCE(uq.personalization_completed, false) = false
      AND NOT EXISTS (
            SELECT 1 FROM user_quest_tasks t
            WHERE t.user_quest_id = uq.id
              AND t.approval_status = 'approved'
      )
      AND (
            EXISTS (SELECT 1 FROM quest_template_tasks qtt WHERE qtt.quest_id = uq.quest_id)
         OR EXISTS (SELECT 1 FROM quest_sample_tasks qst WHERE qst.quest_id = uq.quest_id)
      )
),

-- Modern path: quest_template_tasks.
-- diploma_subjects is text[] here but jsonb on user_quest_tasks, hence to_jsonb.
inserted_from_templates AS (
    INSERT INTO user_quest_tasks (
        user_id, quest_id, user_quest_id, title, description, pillar, xp_value,
        order_index, is_required, is_manual, approval_status, diploma_subjects,
        subject_xp_distribution, source_template_task_id, source_task_id
    )
    SELECT
        s.user_id,
        s.quest_id,
        s.user_quest_id,
        qtt.title,
        COALESCE(qtt.description, ''),
        qtt.pillar,
        COALESCE(qtt.xp_value, 100),
        COALESCE(qtt.order_index, 0),
        COALESCE(qtt.is_required, false),
        false,
        'approved',
        to_jsonb(COALESCE(qtt.diploma_subjects, ARRAY['Electives'::text])),
        COALESCE(qtt.subject_xp_distribution, '{}'::jsonb),
        qtt.id,   -- a real FK reference into quest_template_tasks
        qtt.id
    FROM scope s
    JOIN quest_template_tasks qtt ON qtt.quest_id = s.quest_id
    WHERE s.use_template_table
    RETURNING user_quest_id
),

-- Legacy path: quest_sample_tasks. These ids are NOT valid
-- quest_template_tasks references, so source_template_task_id stays NULL --
-- the same rule get_valid_source_template_ids applies at runtime, and the
-- reason the FK violation in test_template_tasks_fk.py happened. The table has
-- no is_required column; sample tasks are optional by definition.
inserted_from_legacy AS (
    INSERT INTO user_quest_tasks (
        user_id, quest_id, user_quest_id, title, description, pillar, xp_value,
        order_index, is_required, is_manual, approval_status, diploma_subjects,
        subject_xp_distribution, source_template_task_id, source_task_id
    )
    SELECT
        s.user_id,
        s.quest_id,
        s.user_quest_id,
        qst.title,
        COALESCE(qst.description, ''),
        qst.pillar,
        COALESCE(qst.xp_value, 100),
        COALESCE(qst.order_index, 0),
        false,
        false,
        'approved',
        COALESCE(qst.diploma_subjects, '["Electives"]'::jsonb),
        COALESCE(qst.subject_xp_distribution, '{}'::jsonb),
        NULL,
        qst.id
    FROM scope s
    JOIN quest_sample_tasks qst ON qst.quest_id = s.quest_id
    WHERE NOT s.use_template_table
    RETURNING user_quest_id
),

seeded AS (
    SELECT user_quest_id FROM inserted_from_templates
    UNION
    SELECT user_quest_id FROM inserted_from_legacy
)

-- Same closing step as copy_template_tasks_to_enrollment: the enrollment is
-- seeded, so the personalization wizard must not reopen.
UPDATE user_quests
SET personalization_completed = true
WHERE id IN (SELECT user_quest_id FROM seeded);
