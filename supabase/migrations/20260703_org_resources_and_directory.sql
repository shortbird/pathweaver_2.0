-- SIS: org resource library + family-directory opt-in (iCreate requests 2026-07-02).
--
-- 1) org_resources — documents/links families can refer back to after
--    registration (family guidebook, student contract, ...). Managed by staff
--    in the SIS; read by the org's parents/students in the learning app.
--
-- 2) households.directory_opt_in — families choose whether other families can
--    see their contact info in the family directory. Default FALSE: staff can
--    always contact everyone, but a family is only visible to other families
--    after opting in.

CREATE TABLE IF NOT EXISTS org_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  url text,
  category text,
  sort_order integer NOT NULL DEFAULT 0,
  -- Links this resource to a registration-form paperwork item (its key in
  -- feature_flags.icreate_registration.paperwork). When set, the registration
  -- funnel serves THIS resource's url as that document — single source of truth.
  paperwork_key text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Covers pre-existing deployments where the table was created without the column.
ALTER TABLE org_resources ADD COLUMN IF NOT EXISTS paperwork_key text;
CREATE INDEX IF NOT EXISTS idx_org_resources_org ON org_resources(organization_id);

COMMENT ON TABLE org_resources IS
  'Org document library (guidebooks, contracts, links). Staff manage in the SIS; org families read them in the learning app.';

ALTER TABLE org_resources ENABLE ROW LEVEL SECURITY;

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS directory_opt_in boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN households.directory_opt_in IS
  'Family chose to appear in the org family directory (visible to other families, not just staff).';
