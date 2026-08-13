-- The Treehouse program — schema for the program-specific tab (OEA-style).
-- Org gating is by organizations.slug = 'treehouse'. All new tables use RLS with
-- no public policies; the Flask backend reaches them via the service-role/admin
-- client only (see CLAUDE.md "Frontends don't use PostgREST RPC").
--
-- Default Data API grants are inherited (see 20260527_restore_default_data_api_grants.sql),
-- so no per-table GRANTs are required here.

-- ── Additive columns on existing tables ──────────────────────────────────────

-- Phase 1.3: optional recommended age band shown on Treehouse quest/badge cards.
ALTER TABLE quests ADD COLUMN IF NOT EXISTS recommended_age text;

-- Phase 3.2: optional per-task due date used by showcase deadline scaffolding.
-- Nullable + unused elsewhere, so this does not affect any existing task flow.
ALTER TABLE user_quest_tasks ADD COLUMN IF NOT EXISTS due_date timestamptz;

-- Phase 2.6: optional cohort restriction on a bounty (reuses org_classes).
ALTER TABLE bounties ADD COLUMN IF NOT EXISTS cohort_class_id uuid REFERENCES org_classes(id) ON DELETE SET NULL;

-- ── Phase 2.1: student signals (I Need Help / I'm Proud) ─────────────────────
CREATE TABLE IF NOT EXISTS treehouse_signals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  signal_type     text NOT NULL CHECK (signal_type IN ('help','proud')),
  quest_id        uuid REFERENCES quests(id) ON DELETE SET NULL,
  task_id         uuid,
  note            text,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_treehouse_signals_org_status ON treehouse_signals(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_treehouse_signals_student ON treehouse_signals(student_id);
ALTER TABLE treehouse_signals ENABLE ROW LEVEL SECURITY;

-- ── Phase 2.5: pin-creation queue (only stores marked-created/distributed) ───
-- "Ready" pins are computed live (completed Treehouse quests not yet marked here).
CREATE TABLE IF NOT EXISTS treehouse_pins (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id          uuid NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES organizations(id),
  status            text NOT NULL DEFAULT 'created' CHECK (status IN ('created','distributed')),
  marked_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  marked_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, quest_id)
);
CREATE INDEX IF NOT EXISTS idx_treehouse_pins_org ON treehouse_pins(organization_id);
ALTER TABLE treehouse_pins ENABLE ROW LEVEL SECURITY;

-- ── Phase 3.2: showcase events + participants ────────────────────────────────
CREATE TABLE IF NOT EXISTS treehouse_showcase_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  title           text NOT NULL,
  theme           text,
  description     text,
  showcase_date   date,
  prompts         jsonb NOT NULL DEFAULT '[]'::jsonb,
  examples        jsonb NOT NULL DEFAULT '[]'::jsonb,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treehouse_showcase_events_org ON treehouse_showcase_events(organization_id, status);
ALTER TABLE treehouse_showcase_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS treehouse_showcase_participants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES treehouse_showcase_events(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_title   text,
  project_category text,
  quest_id        uuid REFERENCES quests(id) ON DELETE SET NULL,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_treehouse_showcase_participants_event ON treehouse_showcase_participants(event_id);
ALTER TABLE treehouse_showcase_participants ENABLE ROW LEVEL SECURITY;

-- ── Phase 3.1: kiosk devices (hashed device tokens for shared-device login) ──
CREATE TABLE IF NOT EXISTS treehouse_kiosk_devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  label           text NOT NULL,
  token_hash      text NOT NULL,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_treehouse_kiosk_devices_org ON treehouse_kiosk_devices(organization_id, is_active);
ALTER TABLE treehouse_kiosk_devices ENABLE ROW LEVEL SECURITY;
