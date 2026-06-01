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
