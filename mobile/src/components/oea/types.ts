/**
 * OEA Diploma Plan shared types. Mirror backend/utils/oea_pathways.py — the
 * /api/oea/pathways endpoint is the single source of truth, these just type its
 * response.
 */

export type PathwayKey = 'open_balanced' | 'traditional' | 'college_bound';

export interface PathwayRequirement {
  key: string;
  label: string;
  category: 'foundation' | 'elective';
  credits: number;
  subject_key: string | null;
}

export interface Pathway {
  key: PathwayKey;
  name: string;
  tagline: string;
  description: string;
  best_for: string;
  total_credits: number;
  foundation_credits: number;
  elective_credits: number;
  requirements: PathwayRequirement[];
}

export interface OEAEnrollment {
  id: string;
  student_id: string;
  parent_id: string | null;
  program_key: string;
  pathway_key: PathwayKey;
  status: 'active' | 'withdrawn' | 'completed';
  pathway?: Pathway | null;
}

export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface OEACredit {
  id: string;
  student_id: string;
  requirement_key: string;
  category: 'foundation' | 'elective';
  subject_key: string | null;
  course_name: string;
  credits: number;
  status: 'in_progress' | 'complete';
  letter_grade: LetterGrade | null;
  is_weighted: boolean;
  completed_at: string | null;
  // The student's Optio quest for this course (work + evidence live there).
  quest_id: string | null;
  evidence_count?: number;
  quarter_compliance?: QuarterCompliance;
}

// Current-quarter upload counts vs the program minimums for one course
// (present on direct in-progress credits while a quarter is open).
export interface QuarterCompliance {
  term_index: number;
  school_year: string;
  logs: number;
  logs_required: number;
  artifacts: number;
  artifacts_required: number;
  summaries: number;
  summaries_required: number;
  missing: { logs: number; artifacts: number; summaries: number };
  is_compliant: boolean;
}

export type EvidenceBlockType = 'text' | 'link' | 'file';

export interface OEACreditEvidence {
  id: string;
  credit_id: string;
  block_type: EvidenceBlockType;
  content: {
    text?: string;
    url?: string;
    title?: string;
    name?: string;
    mime?: string;
    size?: number;
  };
  created_at: string;
}

export interface RequirementProgress {
  key: string;
  label: string;
  category: 'foundation' | 'elective';
  subject_key: string | null;
  required: number;
  earned: number;
  in_progress: number;
  is_met: boolean;
}

export interface CreditProgress {
  pathway_key: PathwayKey;
  total_required: number;
  total_earned: number;
  total_in_progress: number;
  foundation_required: number;
  foundation_earned: number;
  elective_required: number;
  elective_earned: number;
  percent_complete: number;
  is_complete: boolean;
  requirements: RequirementProgress[];
}

export interface GPA {
  unweighted: number | null;
  weighted: number | null;
  graded_credits: number;
}

export interface CreditsResponse {
  enrollment: OEAEnrollment | null;
  credits: OEACredit[];
  progress: CreditProgress | null;
  gpa: GPA;
  // Program guidance for the dashboard (Hearthwood parent-onboarding feedback).
  current_quarter?: number | null;
  current_quarter_end?: string | null;
  minimums_text?: string | null;
  help_video_url?: string | null;
}
