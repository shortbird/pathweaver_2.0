-- OEA credit evidence: proof attached to a self-attested course credit.
--
-- PRD V2 section 4.4: each OEA credit can carry uploads (work samples, project
-- documentation, certificates, external completions) as text notes, links, or
-- files. This gives the parent's self-attested A-F grade something concrete
-- behind it and gives OEA oversight staff something to review.
--
-- Kept as a dedicated, lightweight block table (mirroring evidence_document_blocks
-- but scoped to oea_credits) rather than overloading the task-bound
-- user_task_evidence_documents -- consistent with the deliberately isolated OEA
-- credit path. Files are uploaded via the existing /api/uploads/evidence endpoint;
-- only the resulting URL/metadata is stored here.
--
-- student_id is denormalized from the parent oea_credit so the manages-student
-- ownership check (users.managed_by_parent_id) works without a join. RLS enabled
-- with no public policies: admin-client only, same as the other oea_* tables.

CREATE TABLE IF NOT EXISTS oea_credit_evidence (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id   uuid NOT NULL REFERENCES oea_credits(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_type  text NOT NULL CHECK (block_type IN ('text', 'link', 'file')),
  -- content shape by type:
  --   text -> { "text": "..." }
  --   link -> { "url": "...", "title": "..." }
  --   file -> { "url": "...", "name": "...", "mime": "...", "size": 123 }
  content     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oea_credit_evidence_credit ON oea_credit_evidence(credit_id);
CREATE INDEX IF NOT EXISTS idx_oea_credit_evidence_student ON oea_credit_evidence(student_id);

ALTER TABLE oea_credit_evidence ENABLE ROW LEVEL SECURITY;
