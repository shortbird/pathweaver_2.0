-- Saved email lists for /admin/crm/lists.
--
-- A superadmin picks a group of Optio users (all org admins, every Optio
-- Academy parent, the parents of one class's students...), copies the emails
-- and pastes them into BCC on a Gmail draft. A saved list stores the FILTER,
-- not the people, so it stays current as families join and leave; the two id
-- arrays are the hand edits on top of it (someone added who the filter misses,
-- someone the filter catches but should not get this email).
--
-- Service-role only, like every crm_* table: RLS on, no policies, every route
-- behind require_superadmin.

CREATE TABLE IF NOT EXISTS public.crm_email_lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    description text,
    filters jsonb NOT NULL DEFAULT '{}'::jsonb,
    include_ids uuid[] NOT NULL DEFAULT '{}',
    exclude_ids uuid[] NOT NULL DEFAULT '{}',
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_email_lists ENABLE ROW LEVEL SECURITY;
