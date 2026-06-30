-- OEA HS Diploma Phase 2: per-course grade periods (quarter / semester / annual).
--
-- The existing single oea_credits.letter_grade is the AUTHORITATIVE transcript
-- grade for a course (keeps compute_gpa unchanged). This table records the
-- periodic detail:
--   quarter rows  -> the in-progress quarter grade + parent summary that back the
--                    printable quarterly progress report (the coach report card).
--                    Quarter grades are progress-only; they NEVER feed the GPA.
--   semester rows -> the transcript grade for a semester. Writing one derives
--                    oea_credits.letter_grade (semester overrides quarter; it does
--                    NOT average quarters). Gated on the course's quarterly upload
--                    minimums being met.
--   annual rows   -> the final-year transcript grade; wins over semester.
--
-- One row per (credit, term_type, term_index, school_year). student_id is
-- denormalized from the parent credit so the manages-student ownership check works
-- without a join. RLS enabled, no public policies: admin-client only, same as the
-- other oea_* tables. Default data-API grants handled by the 2026-05-27 migration.

CREATE TABLE IF NOT EXISTS oea_credit_grade_periods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id    uuid NOT NULL REFERENCES oea_credits(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_year  text NOT NULL,
  term_type    text NOT NULL CHECK (term_type IN ('quarter','semester','annual')),
  term_index   smallint NOT NULL,
  grade        text CHECK (grade IN ('A','B','C','D','F')),
  summary      text,
  entered_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  entered_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (credit_id, term_type, term_index, school_year)
);

CREATE INDEX IF NOT EXISTS idx_oea_grade_periods_credit ON oea_credit_grade_periods(credit_id);
CREATE INDEX IF NOT EXISTS idx_oea_grade_periods_student ON oea_credit_grade_periods(student_id);

ALTER TABLE oea_credit_grade_periods ENABLE ROW LEVEL SECURITY;
