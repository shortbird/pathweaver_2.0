-- Secure documents (2026-07-24). A private, admin-managed store for sensitive
-- SIS files (contracts, background checks, custody/medical docs) that can be
-- attached to a staff member/parent (owner_user_id) OR a student
-- (student_user_id). v1 is admin-only; per-person visibility comes later.
--
-- Additive, org-generic, RLS-locked to the backend (no policies: the Flask
-- backend's service role is the only reader). Blobs live in the PRIVATE
-- 'sis-secure-documents' storage bucket; this table only stores metadata + path.
-- Data API grants are inherited via the 20260527 default-privileges migration.

CREATE TABLE IF NOT EXISTS sis_secure_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,    -- staff/parent the doc is ABOUT (nullable)
  student_user_id uuid REFERENCES users(id) ON DELETE SET NULL,  -- or the student it pertains to (nullable)
  uploaded_by uuid NOT NULL REFERENCES users(id),
  storage_path text NOT NULL,
  filename text NOT NULL,
  content_type text,
  size_bytes integer,
  category text,               -- free text e.g. 'Background check', 'Contract', 'Medical'
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sis_secure_documents_org_owner
  ON sis_secure_documents(organization_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_sis_secure_documents_org_student
  ON sis_secure_documents(organization_id, student_user_id);

ALTER TABLE sis_secure_documents ENABLE ROW LEVEL SECURITY;
