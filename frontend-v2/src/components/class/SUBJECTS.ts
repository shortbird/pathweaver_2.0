/**
 * The 11 platform school subjects.
 *
 * Keys, names, descriptions and accents come from `@shared/subjects`, shared
 * with the web app and pinned to backend/utils/school_subjects.py by a test on
 * each side. Only the ICON is decided here: an Ionicons name is a property of
 * this platform, not of the subject, exactly as the NativeWind classes are in
 * config/pillars.ts.
 *
 * Mobile naming choices vs marketing copy:
 *   - "Language Arts" includes English / Reading / Writing + world-language study (marketing: English)
 *   - "Social Studies" covers history / civics / geography / world languages
 *   - "Fine Arts" covers visual art, music, theater, dance (marketing: Visual Arts + Music)
 *   - Other six (PE, Math, Science, CTE, Financial Literacy, Health, Digital Literacy, Electives) match
 */

import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { SUBJECTS as SHARED_SUBJECTS } from '@shared/subjects';

export type SubjectKey =
  | 'language_arts'
  | 'math'
  | 'science'
  | 'social_studies'
  | 'financial_literacy'
  | 'health'
  | 'pe'
  | 'fine_arts'
  | 'cte'
  | 'digital_literacy'
  | 'electives';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface SubjectMeta {
  key: SubjectKey;
  name: string;
  description: string;
  icon: IconName;
  accent: string;
}


const ICONS: Record<SubjectKey, IconName> = {
  language_arts: 'book-outline',
  math: 'calculator-outline',
  science: 'flask-outline',
  social_studies: 'earth-outline',
  financial_literacy: 'cash-outline',
  health: 'heart-outline',
  pe: 'fitness-outline',
  fine_arts: 'color-palette-outline',
  cte: 'hammer-outline',
  digital_literacy: 'code-slash-outline',
  electives: 'sparkles-outline',
};

export const SUBJECTS: SubjectMeta[] = SHARED_SUBJECTS.map((s) => ({
  key: s.key as SubjectKey,
  name: s.name,
  description: s.description,
  accent: s.accent,
  icon: ICONS[s.key as SubjectKey],
}));


export function getSubject(key: string | null | undefined): SubjectMeta | null {
  if (!key) return null;
  return SUBJECTS.find((s) => s.key === key) || null;
}
