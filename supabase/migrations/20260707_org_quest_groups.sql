-- Org quest groups: named subcategories of an organization's quests so
-- facilitators can batch-assign a whole group (e.g. "Ages 5-7 pins",
-- "STEM pins") to students or cohorts in one action.
-- A quest can belong to any number of groups.

CREATE TABLE IF NOT EXISTS org_quest_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS org_quest_group_items (
    group_id uuid NOT NULL REFERENCES org_quest_groups(id) ON DELETE CASCADE,
    quest_id uuid NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    added_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, quest_id)
);

CREATE INDEX IF NOT EXISTS idx_org_quest_groups_org ON org_quest_groups(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_quest_group_items_quest ON org_quest_group_items(quest_id);

-- Backend-only tables (service role); no anon/authenticated policies needed —
-- both frontends go through the Flask backend, not PostgREST.
ALTER TABLE org_quest_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_quest_group_items ENABLE ROW LEVEL SECURITY;
