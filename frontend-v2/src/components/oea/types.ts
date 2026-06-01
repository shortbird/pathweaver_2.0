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
}
