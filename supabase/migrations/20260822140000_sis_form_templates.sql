-- Schools build their own forms (iCreate, 2026-08-20 and 2026-08-22).
--
-- "How do we add forms? The teachers have a place to submit forms like incident
-- reports, supply requests, etc, but I don't know what those look like or where
-- to edit them or where to add new ones." (16b736f3)
--
-- They could not: the twenty form types were a hardcoded Python dict, and every
-- one of them rendered the SAME three inputs -- a title, a free-text body and a
-- location. An injury report and a supply request were the same form with a
-- different word on the dropdown. Molly went looking for the editor that
-- checklists have and correctly concluded it was not there.
--
-- This mirrors sis_onboarding_templates deliberately: same authoring pattern,
-- same audience split, same delete guard. The submission table needs no change
-- -- `payload` is already jsonb, and the row already carries student_user_id,
-- class_id, assigned_to, priority and due_date for the field types that bind to
-- them.

CREATE TABLE IF NOT EXISTS public.sis_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Written into sis_form_submissions.form_type. Immutable once anything has
  -- been filed against it, so history keeps resolving.
  key text NOT NULL,
  name text NOT NULL,
  description text,

  -- Who may file it. 'staff' is the SIS console, 'family' the learning-app
  -- portal -- the same split onboarding templates use, and it subsumes the old
  -- PARENT_FORM_TYPES list.
  audience text NOT NULL DEFAULT 'staff' CHECK (audience IN ('staff', 'family')),

  -- Ordered [{key, label, type, required, options, help}].
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Routing and defaults: maintenance auto-assigns to whoever holds the keys,
  -- injury reports open at high without anyone remembering to set it.
  default_assignee_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  default_priority text CHECK (default_priority IS NULL
                               OR default_priority IN ('low', 'normal', 'high', 'urgent')),

  -- Narrow a form to some staff roles (substitute notes need only reach
  -- substitutes). NULL means everyone in the audience.
  visible_to_roles text[],

  -- Retire a form without destroying its history.
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,

  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, key)
);

CREATE INDEX IF NOT EXISTS idx_sis_form_templates_org
  ON public.sis_form_templates (organization_id, audience, is_active, sort_order);

COMMENT ON TABLE public.sis_form_templates IS
  'Org-defined forms. Mirrors sis_onboarding_templates. `key` is written into '
  'sis_form_submissions.form_type; the built-in types keep working because they '
  'resolve from code when no template row matches.';

-- Deny-all RLS: every read and write goes through the Flask backend on the
-- service role, the same as the other SIS tables.
ALTER TABLE public.sis_form_templates ENABLE ROW LEVEL SECURITY;
