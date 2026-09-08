-- FERPA Compliance: Private-by-Default Educational Records
-- Date: 2026-01-02
-- Purpose: Change educational records (portfolios/diplomas) from public-by-default to private-by-default
--          with explicit opt-in consent flow and parental approval for minors

-- =============================================================================
-- PHASE 1: Add consent tracking columns to diplomas table
-- =============================================================================

-- Add columns for tracking explicit public consent
ALTER TABLE diplomas
  ADD COLUMN IF NOT EXISTS public_consent_given BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS public_consent_given_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_consent_given_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS pending_parent_approval BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS parent_approval_denied BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS parent_approval_denied_at TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN diplomas.public_consent_given IS 'User explicitly consented to make portfolio public (FERPA compliance)';
COMMENT ON COLUMN diplomas.public_consent_given_at IS 'Timestamp when consent was given';
COMMENT ON COLUMN diplomas.public_consent_given_by IS 'Who gave consent: user themselves or parent (for minors under 18)';
COMMENT ON COLUMN diplomas.pending_parent_approval IS 'Minor requested public visibility, waiting for parent approval';
COMMENT ON COLUMN diplomas.parent_approval_denied IS 'Parent denied the public visibility request';
COMMENT ON COLUMN diplomas.parent_approval_denied_at IS 'Timestamp when parent denied the request';

-- =============================================================================
-- PHASE 2: Change default visibility to FALSE for new records
-- =============================================================================

-- IMPORTANT: This only affects NEW records. Existing public portfolios stay public.
ALTER TABLE diplomas ALTER COLUMN is_public SET DEFAULT FALSE;

-- =============================================================================
-- PHASE 3: Create parent approval requests table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public_visibility_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  denial_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE public_visibility_requests IS 'Track parent approval requests for minors making portfolio public (FERPA/COPPA compliance)';
COMMENT ON COLUMN public_visibility_requests.student_user_id IS 'The minor who wants to make their portfolio public';
COMMENT ON COLUMN public_visibility_requests.parent_user_id IS 'The parent who must approve the request';
COMMENT ON COLUMN public_visibility_requests.status IS 'pending = awaiting response, approved = parent approved, denied = parent denied';
COMMENT ON COLUMN public_visibility_requests.denial_reason IS 'Optional reason provided by parent when denying';

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_visibility_requests_student
  ON public_visibility_requests(student_user_id);

CREATE INDEX IF NOT EXISTS idx_visibility_requests_parent
  ON public_visibility_requests(parent_user_id);

CREATE INDEX IF NOT EXISTS idx_visibility_requests_pending
  ON public_visibility_requests(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_diplomas_consent
  ON diplomas(user_id) WHERE public_consent_given = TRUE;

-- Unique constraint: only one pending request per student at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_visibility_requests_one_pending
  ON public_visibility_requests(student_user_id) WHERE status = 'pending';

-- =============================================================================
-- PHASE 4: Enable RLS on public_visibility_requests
-- =============================================================================

ALTER TABLE public_visibility_requests ENABLE ROW LEVEL SECURITY;

-- Students can view their own requests
CREATE POLICY student_view_own_visibility_requests
  ON public_visibility_requests
  FOR SELECT
  USING (student_user_id = auth.uid());

-- Parents can view requests for their children
CREATE POLICY parent_view_child_visibility_requests
  ON public_visibility_requests
  FOR SELECT
  USING (parent_user_id = auth.uid());

-- Parents can update (respond to) requests for their children
CREATE POLICY parent_respond_to_visibility_requests
  ON public_visibility_requests
  FOR UPDATE
  USING (parent_user_id = auth.uid())
  WITH CHECK (parent_user_id = auth.uid());

-- Service role (backend) can insert new requests
CREATE POLICY service_insert_visibility_requests
  ON public_visibility_requests
  FOR INSERT
  WITH CHECK (auth.uid() IS NULL OR student_user_id = auth.uid());

-- Admins can view all requests (for support purposes)
CREATE POLICY admin_view_all_visibility_requests
  ON public_visibility_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('superadmin', 'org_admin')
    )
  );

-- =============================================================================
-- PHASE 5: Create helper function to check if user is a minor
-- =============================================================================

CREATE OR REPLACE FUNCTION is_minor(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_dependent BOOLEAN;
  v_dob DATE;
  v_age NUMERIC;
BEGIN
  -- Get user info
  SELECT is_dependent, date_of_birth::DATE INTO v_is_dependent, v_dob
  FROM users WHERE id = p_user_id;

  -- If marked as dependent, always considered a minor
  IF v_is_dependent = TRUE THEN
    RETURN TRUE;
  END IF;

  -- If no DOB provided, cannot determine age - assume not a minor
  -- (they would have given consent at registration)
  IF v_dob IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Calculate age in years
  v_age := DATE_PART('year', AGE(CURRENT_DATE, v_dob));

  -- Under 18 is a minor
  RETURN v_age < 18;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_minor(UUID) IS 'Returns TRUE if user is under 18 OR is_dependent=true. Used for FERPA parental consent requirements.';

-- =============================================================================
-- PHASE 6: Create function to get parent user ID for a minor
-- =============================================================================

CREATE OR REPLACE FUNCTION get_parent_for_minor(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_parent_id UUID;
BEGIN
  -- First check managed_by_parent_id (for dependents)
  SELECT managed_by_parent_id INTO v_parent_id
  FROM users WHERE id = p_user_id AND managed_by_parent_id IS NOT NULL;

  IF v_parent_id IS NOT NULL THEN
    RETURN v_parent_id;
  END IF;

  -- Then check parent_student_links table
  SELECT parent_id INTO v_parent_id
  FROM parent_student_links
  WHERE student_id = p_user_id AND status = 'approved'
  LIMIT 1;

  RETURN v_parent_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_parent_for_minor(UUID) IS 'Returns the parent user ID for a minor, checking managed_by_parent_id and parent_student_links';

-- =============================================================================
-- VERIFICATION QUERIES (run after migration to verify success)
-- =============================================================================

-- Verify new columns exist:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'diplomas' AND column_name LIKE 'public_%' OR column_name LIKE 'pending_%' OR column_name LIKE 'parent_approval_%';

-- Verify new table exists:
-- SELECT * FROM information_schema.tables WHERE table_name = 'public_visibility_requests';

-- Verify is_public default is now FALSE:
-- SELECT column_name, column_default FROM information_schema.columns
-- WHERE table_name = 'diplomas' AND column_name = 'is_public';

-- Verify helper functions exist:
-- SELECT proname FROM pg_proc WHERE proname IN ('is_minor', 'get_parent_for_minor');
