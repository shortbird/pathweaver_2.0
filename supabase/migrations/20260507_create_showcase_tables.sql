-- Marketing Showcase: tables + permission flag.
--
-- Adds the data layer for the marketing showcase feature:
-- - users.can_view_showcase: per-user permission flag granting access to /showcase
-- - showcase_consent: tiered consent state per student (parent-signed legal doc)
-- - showcase_consent_history: append-only audit trail of every consent change
-- - showcase_evidence_status: marketer's queue state per piece of evidence
-- - showcase_posts: record of where a piece of evidence was actually posted
--
-- Consent is admin-managed (legal doc is the source of truth). Parents can self-revoke
-- but cannot self-restore -- restore requires admin re-confirmation of the doc.

-- 1. Permission flag on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_view_showcase boolean NOT NULL DEFAULT false;

-- 2. Tiered consent state (1:1 with student users)
CREATE TABLE IF NOT EXISTS showcase_consent (
  user_id              uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  consent_active       boolean NOT NULL DEFAULT false,
  consent_work         boolean NOT NULL DEFAULT false,
  consent_first_name   boolean NOT NULL DEFAULT false,
  consent_face         boolean NOT NULL DEFAULT false,
  consent_age          boolean NOT NULL DEFAULT false,
  consent_doc_url      text,
  consent_signed_date  date,
  recorded_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  revoked_at           timestamptz,
  revoked_reason       text,
  revoked_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_showcase_consent_active
  ON showcase_consent(consent_active) WHERE consent_active = true;

-- 3. Append-only audit trail
CREATE TABLE IF NOT EXISTS showcase_consent_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action        text NOT NULL CHECK (action IN ('create','update','revoke','restore')),
  source        text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin','parent_self_revoke')),
  changed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  changed_at    timestamptz NOT NULL DEFAULT now(),
  before_state  jsonb,
  after_state   jsonb
);

CREATE INDEX IF NOT EXISTS idx_showcase_consent_history_user
  ON showcase_consent_history(user_id, changed_at DESC);

-- 4. Per-evidence marketer queue state
CREATE TABLE IF NOT EXISTS showcase_evidence_status (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id     uuid NOT NULL REFERENCES quest_task_completions(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','saved','scheduled','dismissed','posted')),
  scheduled_for   timestamptz,
  notes           text,
  caption_final   text,
  updated_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_showcase_evidence_status_user
  ON showcase_evidence_status(user_id);
CREATE INDEX IF NOT EXISTS idx_showcase_evidence_status_status
  ON showcase_evidence_status(status);
CREATE INDEX IF NOT EXISTS idx_showcase_evidence_status_scheduled
  ON showcase_evidence_status(scheduled_for) WHERE scheduled_for IS NOT NULL;

-- 5. Record of where evidence was posted (one row per platform post)
CREATE TABLE IF NOT EXISTS showcase_posts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_status_id  uuid NOT NULL REFERENCES showcase_evidence_status(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform            text NOT NULL
                      CHECK (platform IN ('instagram','tiktok','x','linkedin','facebook','youtube','other')),
  post_url            text NOT NULL,
  posted_at           timestamptz NOT NULL DEFAULT now(),
  posted_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  caption_used        text,
  take_down_required  boolean NOT NULL DEFAULT false,
  take_down_at        timestamptz,
  taken_down_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_showcase_posts_user
  ON showcase_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_showcase_posts_takedown
  ON showcase_posts(take_down_required) WHERE take_down_required = true;
CREATE INDEX IF NOT EXISTS idx_showcase_posts_evidence_status
  ON showcase_posts(evidence_status_id);

-- 6. Audit trigger: any insert/update on showcase_consent writes a history row
CREATE OR REPLACE FUNCTION fn_showcase_consent_audit() RETURNS TRIGGER AS $$
DECLARE
  v_action text;
  v_source text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    INSERT INTO showcase_consent_history (user_id, action, source, changed_by, before_state, after_state)
    VALUES (NEW.user_id, v_action, 'admin', NEW.recorded_by, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.consent_active = true AND NEW.consent_active = false THEN
      v_action := 'revoke';
    ELSIF OLD.consent_active = false AND NEW.consent_active = true THEN
      v_action := 'restore';
    ELSE
      v_action := 'update';
    END IF;
    -- Default to admin; backend overrides via setting on the row before update if parent self-revoke
    v_source := 'admin';
    INSERT INTO showcase_consent_history (user_id, action, source, changed_by, before_state, after_state)
    VALUES (
      NEW.user_id,
      v_action,
      v_source,
      COALESCE(NEW.revoked_by, NEW.recorded_by),
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_showcase_consent_audit ON showcase_consent;
CREATE TRIGGER trg_showcase_consent_audit
  AFTER INSERT OR UPDATE ON showcase_consent
  FOR EACH ROW EXECUTE FUNCTION fn_showcase_consent_audit();

-- 7. RLS: enable on all new tables. Backend uses admin client (RLS bypass) for marketer
-- routes; these policies just keep direct/anon access locked down and let students/parents
-- read their own data if needed (e.g. for the family dashboard surface).
ALTER TABLE showcase_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE showcase_consent_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE showcase_evidence_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE showcase_posts ENABLE ROW LEVEL SECURITY;

-- Students see their own consent state
DROP POLICY IF EXISTS "students_read_own_showcase_consent" ON showcase_consent;
CREATE POLICY "students_read_own_showcase_consent" ON showcase_consent
  FOR SELECT USING (auth.uid() = user_id);

-- Parents see their dependent's consent state (managed_by_parent_id link)
DROP POLICY IF EXISTS "parents_read_dependent_showcase_consent" ON showcase_consent;
CREATE POLICY "parents_read_dependent_showcase_consent" ON showcase_consent
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = showcase_consent.user_id
        AND u.managed_by_parent_id = auth.uid()
    )
  );

-- Parents see their linked student's consent state (parent_student_links table)
DROP POLICY IF EXISTS "parents_read_linked_showcase_consent" ON showcase_consent;
CREATE POLICY "parents_read_linked_showcase_consent" ON showcase_consent
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_student_links psl
      WHERE psl.student_user_id = showcase_consent.user_id
        AND psl.parent_user_id = auth.uid()
        AND psl.status = 'active'
    )
  );

-- Students see posts of their own work
DROP POLICY IF EXISTS "students_read_own_showcase_posts" ON showcase_posts;
CREATE POLICY "students_read_own_showcase_posts" ON showcase_posts
  FOR SELECT USING (auth.uid() = user_id);

-- Parents see posts of their dependent's work
DROP POLICY IF EXISTS "parents_read_dependent_showcase_posts" ON showcase_posts;
CREATE POLICY "parents_read_dependent_showcase_posts" ON showcase_posts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = showcase_posts.user_id
        AND u.managed_by_parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "parents_read_linked_showcase_posts" ON showcase_posts;
CREATE POLICY "parents_read_linked_showcase_posts" ON showcase_posts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_student_links psl
      WHERE psl.student_user_id = showcase_posts.user_id
        AND psl.parent_user_id = auth.uid()
        AND psl.status = 'active'
    )
  );

-- showcase_evidence_status and showcase_consent_history have no read policies for non-admin
-- users -- they are marketer/admin-only and accessed via the admin client.
