-- Pinned resources: staff links an org wants permanently on the teacher
-- dashboard (iCreate 2026-08-28: "a permanent links section... right below the
-- Today section and above the My Classes section"). Rendered by
-- /api/sis/teacher/dashboard as pinned_links; audience/visible_to_roles
-- filtering still applies, so a families-only resource can be pinned without
-- leaking to staff who shouldn't see it.
ALTER TABLE public.org_resources
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
