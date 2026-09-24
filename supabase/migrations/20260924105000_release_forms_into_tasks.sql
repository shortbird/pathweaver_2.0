-- RELEASE MIGRATION: requests and forms become tasks.
--
-- Run at release time, AFTER 20260924100000_tasks_one_table.sql and together
-- with the deploy of the code that stops reading sis_form_submissions. The old
-- code cannot survive it in one way only: it would show every request twice,
-- once in its old queue and once as a task. The new code works before this
-- runs too (the old requests just do not appear yet), so the order inside the
-- release window is free.
--
-- Idempotent. Every copied row carries the id it came from
-- (legacy_submission_id, legacy_comment_id, legacy_form_template_id) behind a
-- unique index, and every INSERT skips what is already there. Running it twice
-- copies nothing the second time.
--
-- The old tables are left exactly as they are -- read-only history for one
-- release, dropped in a later one. The class supply budget still reads its
-- past spend from sis_form_submissions (services/sis_supply_budget_service).
--
-- Mapping (owner decision, 2026-09-23):
--   assignee  = assigned_to, else whoever resolved it, else the person who
--               filed it. Every open request has an assignee in production;
--               the fallbacks only decide who holds finished history.
--   assigner  = the person who filed it.
--   status    = resolved -> complete, everything else -> in_progress.
--   body, location, time, custom answers, the student it was about and the
--   office's resolution note all go into the description, labelled, because
--   the task has no columns for them.

-- ── 1. Every submission becomes a one-step task ─────────────────────────────

WITH src AS (
    SELECT s.*,
           COALESCE(s.assigned_to, s.resolved_by, s.submitted_by) AS assignee,
           t.fields AS template_fields,
           NULLIF(btrim(COALESCE(stu.display_name,
                                 concat_ws(' ', stu.first_name, stu.last_name))), '') AS student_name,
           NULLIF(btrim(COALESCE(sub.display_name,
                                 concat_ws(' ', sub.first_name, sub.last_name))), '') AS submitter_name
    FROM public.sis_form_submissions s
    LEFT JOIN public.sis_form_templates t
           ON t.organization_id = s.organization_id AND t.key = s.form_type
    LEFT JOIN public.users stu ON stu.id = s.student_user_id
    LEFT JOIN public.users sub ON sub.id = s.submitted_by
),
answers AS (
    -- Custom-form answers, labelled with the question that asked them.
    SELECT src.id,
           string_agg(COALESCE(f.value->>'label', kv.key) || ': ' || kv.value, E'\n'
                      ORDER BY f.ordinality NULLS LAST, kv.key) AS lines
    FROM src
    CROSS JOIN LATERAL jsonb_each_text(src.payload) kv
    LEFT JOIN LATERAL jsonb_array_elements(COALESCE(src.template_fields, '[]'::jsonb))
              WITH ORDINALITY f(value, ordinality)
           ON f.value->>'key' = kv.key
    WHERE kv.key NOT IN ('body', 'location', 'occurred_at')
      AND NULLIF(btrim(kv.value), '') IS NOT NULL
    GROUP BY src.id
)
INSERT INTO public.sis_onboarding_assignments (
    organization_id, user_id, template_id, template_name, description, items,
    status, assigned_by, created_at, updated_at, audience, kind, batch_id,
    blocks_access, priority, due_date, action, legacy_submission_id
)
SELECT
    src.organization_id,
    src.assignee,
    NULL,
    COALESCE(NULLIF(btrim(src.title), ''), src.form_type_label, 'Task'),
    NULLIF(concat_ws(E'\n\n',
        NULLIF(btrim(src.payload->>'body'), ''),
        answers.lines,
        CASE WHEN NULLIF(btrim(src.payload->>'location'), '') IS NOT NULL
             THEN 'Where: ' || (src.payload->>'location') END,
        CASE WHEN NULLIF(btrim(src.payload->>'occurred_at'), '') IS NOT NULL
             THEN 'When: ' || (src.payload->>'occurred_at') END,
        CASE WHEN src.student_name IS NOT NULL THEN 'About: ' || src.student_name END,
        CASE WHEN src.submitter_role = 'parent' AND src.submitter_name IS NOT NULL
             THEN 'Sent by ' || src.submitter_name || ' (family)' END,
        CASE WHEN NULLIF(btrim(src.resolution_notes), '') IS NOT NULL
             THEN 'Resolution: ' || src.resolution_notes END
    ), ''),
    jsonb_build_array(jsonb_build_object(
        'key', 'item_' || substr(replace(src.id::text, '-', ''), 1, 12),
        'title', COALESCE(NULLIF(btrim(src.title), ''), src.form_type_label, 'Task'),
        'description', NULL,
        'required', true,
        'needs_document', false,
        'needs_signature', false,
        'needs_approval', false,
        'due_date', src.due_date,
        'link', NULL,
        'document_id', NULL,
        'status', CASE WHEN src.status = 'resolved' THEN 'complete' ELSE 'pending' END,
        'document_url', NULL,
        'documents', '[]'::jsonb,
        'submitted_at', CASE WHEN src.status = 'resolved'
                             THEN COALESCE(src.resolved_at, src.updated_at) END,
        'approved_by', NULL,
        'approved_at', NULL,
        'admin_notes', NULL,
        'signature', NULL
    )),
    CASE WHEN src.status = 'resolved' THEN 'complete' ELSE 'in_progress' END,
    src.submitted_by,
    src.created_at,
    src.updated_at,
    -- A parent is the assignee only when nobody on staff ever touched their
    -- request; production has no such row, but the fallback must still land
    -- on a portal that person can open.
    CASE WHEN src.assignee = src.submitted_by AND src.submitter_role = 'parent'
         THEN 'family' ELSE 'staff' END,
    'task',
    gen_random_uuid(),
    false,
    src.priority,
    src.due_date,
    'do',
    src.id
FROM src
LEFT JOIN answers ON answers.id = src.id
WHERE NOT EXISTS (
    SELECT 1 FROM public.sis_onboarding_assignments a
    WHERE a.legacy_submission_id = src.id
);

-- ── 2. The comment threads follow ───────────────────────────────────────────

INSERT INTO public.sis_task_comments (organization_id, task_id, author_id, body,
                                      created_at, legacy_comment_id)
SELECT c.organization_id, a.id, c.author_id, c.body, c.created_at, c.id
FROM public.sis_form_comments c
JOIN public.sis_onboarding_assignments a ON a.legacy_submission_id = c.submission_id
WHERE NULLIF(btrim(c.body), '') IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.sis_task_comments x WHERE x.legacy_comment_id = c.id
  );

-- ── 3. Custom forms become task templates, one step per question ────────────
-- Built-in form types are not copied: they were the same three inputs with a
-- different word on the dropdown, and a school that wants one back makes a
-- template in a minute. A retired (inactive) custom form is skipped for the
-- same reason it was retired.

INSERT INTO public.sis_onboarding_templates (
    organization_id, name, role_type, items, created_by, created_at, updated_at,
    audience, blocks_access, description, legacy_form_template_id
)
SELECT
    t.organization_id,
    t.name,
    NULL,
    COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                   'key', 'item_' || substr(md5(t.id::text || (f.value->>'key')), 1, 12),
                   'title', f.value->>'label',
                   'description', NULLIF(concat_ws(' ',
                        NULLIF(f.value->>'help', ''),
                        CASE WHEN jsonb_array_length(COALESCE(f.value->'options', '[]'::jsonb)) > 0
                             THEN 'Choices: ' || (
                                 SELECT string_agg(o, ', ') FROM jsonb_array_elements_text(f.value->'options') o)
                        END), ''),
                   'required', COALESCE((f.value->>'required')::boolean, false),
                   'needs_document', false,
                   'needs_signature', false,
                   'needs_approval', false,
                   'due_date', NULL,
                   'link', NULL,
                   'document_id', NULL
               ) ORDER BY f.ordinality)
        FROM jsonb_array_elements(t.fields) WITH ORDINALITY f(value, ordinality)
        WHERE NULLIF(btrim(f.value->>'label'), '') IS NOT NULL
    ), '[]'::jsonb),
    t.created_by,
    t.created_at,
    now(),
    CASE WHEN t.audience = 'family' THEN 'family' ELSE 'staff' END,
    false,
    t.description,
    t.id
FROM public.sis_form_templates t
WHERE t.is_active
  AND NOT EXISTS (
      SELECT 1 FROM public.sis_onboarding_templates x
      WHERE x.legacy_form_template_id = t.id
  );
