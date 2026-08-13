-- Carpool board (iCreate feedback 2026-08-06): families post ride offers/needs
-- and arrange between themselves. First family-AUTHORED module of the community
-- hub — same access model as the rest of it: deny-all RLS, backend-only writes,
-- authorization enforced in the service layer (org member, non-student).
-- Applied to prod via Supabase MCP 2026-08-06.
CREATE TABLE IF NOT EXISTS sis_carpool_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Display-name snapshot so the family feed never has to join users (whose
    -- rows carry far more than a board post should reveal).
    author_name text NOT NULL,
    type text NOT NULL CHECK (type IN ('offer', 'need')),
    message text NOT NULL,
    area text,
    days text,
    contact text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carpool_org_status
    ON sis_carpool_posts (organization_id, status, created_at DESC);

ALTER TABLE sis_carpool_posts ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: service-role only, like the other sis_ community tables.
