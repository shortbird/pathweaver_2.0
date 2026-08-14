-- Prior learning records — a guardian's evidence of learning that happened
-- before (or outside) Optio, filed so it can become Optio high-school credit.
--
-- A family arriving from a homeschool co-op, a charter, or four years of piano
-- lessons has a real transcript's worth of learning and no way to hand it to
-- us. Today that conversation happens over email and lands in an admin's head.
-- This gives it a queue: the guardian files a record per body of learning,
-- attaches the SAME evidence kinds a student attaches to a task (text, link,
-- video, image, document), and submits it. Staff review, then award credit.
--
-- Two tables rather than one because the evidence is a list, and it is the
-- same list shape task evidence already has — a record is one claim ("Algebra
-- I at Riverside Co-op, 2024-25"), and it may be backed by a transcript scan, a
-- photo of a finished project, and a paragraph the parent wrote.
--
-- The ai_* columns are the seam for the analyzer that will read a record's
-- evidence and PROPOSE a subject/credit split (services/sis_prior_learning_ai.py).
-- They are deliberately separate from awarded_credits: a suggestion is never an
-- award. Staff copy a suggestion into the award, or ignore it.
--
-- Enabled per-org, opt-in, via feature_flags.sis_settings.prior_learning_enabled
-- (same idiom as community_enabled). Turned on below for Optio Academy only.

CREATE TABLE IF NOT EXISTS public.prior_learning_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Which kid. A guardian with several children picks one per record; the API
  -- verifies the pick against their own registerable students.
  student_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES public.users(id),

  title text NOT NULL,
  description text,
  -- Where the learning happened, in the family's own words ("Riverside Co-op",
  -- "self-taught", "Mrs. Alvarez, private piano").
  provider text,
  -- The parent's guess at a school subject, if they have one. A hint for the
  -- reviewer and for the future analyzer, never the award itself.
  subject_hint text,
  started_on date,
  ended_on date,
  hours_estimate numeric(7,1),

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'under_review', 'accepted', 'rejected')),
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  review_notes text,

  -- What staff actually granted: {school_subject: credits}, e.g. {"math": 1.0}.
  -- Empty until a reviewer accepts.
  awarded_credits jsonb NOT NULL DEFAULT '{}'::jsonb,
  credited_at timestamptz,
  credited_by uuid REFERENCES public.users(id),

  -- ── AI seam (nothing writes these yet) ──────────────────────────────────
  ai_status text NOT NULL DEFAULT 'not_run'
    CHECK (ai_status IN ('not_run', 'queued', 'running', 'complete', 'failed')),
  -- {subjects: [{subject, credits, confidence, rationale}], summary, flags: []}
  ai_suggestion jsonb,
  ai_model text,
  ai_analyzed_at timestamptz,
  ai_error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prior_learning_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.prior_learning_records(id) ON DELETE CASCADE,
  -- Exactly the set routes/tasks/completion.py accepts, so a parent's upload and
  -- a student's task evidence are the same artifact in the portfolio.
  evidence_type text NOT NULL
    CHECK (evidence_type IN ('text', 'link', 'video', 'image', 'document')),
  content text,       -- text evidence
  url text,           -- link/video URL, or the public URL of an uploaded file
  title text,         -- link title, or the original file name
  file_name text,
  file_size integer,
  content_type text,
  sequence_order integer NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The staff queue reads by org + status; the portfolio and the family list read
-- by student. Both are org-sized, so both are indexed.
CREATE INDEX IF NOT EXISTS idx_prior_learning_records_org_status
  ON public.prior_learning_records (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prior_learning_records_student
  ON public.prior_learning_records (student_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prior_learning_records_submitter
  ON public.prior_learning_records (submitted_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prior_learning_evidence_record
  ON public.prior_learning_evidence (record_id, sequence_order);

DROP TRIGGER IF EXISTS set_prior_learning_records_updated_at ON public.prior_learning_records;
CREATE TRIGGER set_prior_learning_records_updated_at
  BEFORE UPDATE ON public.prior_learning_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS on with no policies: service-role only, same as every other SIS table.
-- Both surfaces (family and staff) go through role/relationship checks in the
-- Flask layer, so nothing should reach these rows through the Data API.
ALTER TABLE public.prior_learning_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prior_learning_evidence ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.prior_learning_records IS
  'Guardian-submitted records of learning done before/outside Optio, reviewed by '
  'school staff and awarded as Optio high-school credit. Opt-in per org via '
  'feature_flags.sis_settings.prior_learning_enabled.';
COMMENT ON COLUMN public.prior_learning_records.ai_suggestion IS
  'Proposed subject/credit split from the future analyzer. A suggestion, never an '
  'award — awarded_credits is what counts.';

-- Optio Academy only, for now.
UPDATE public.organizations
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb) || jsonb_build_object(
  'sis_settings',
  COALESCE(feature_flags -> 'sis_settings', '{}'::jsonb)
    || jsonb_build_object('prior_learning_enabled', true)
)
WHERE id = '8ee22671-6e38-473c-a326-90ff86460310';
