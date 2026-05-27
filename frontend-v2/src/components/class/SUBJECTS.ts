/**
 * The 11 platform school subjects from backend/utils/school_subjects.py.
 * Display names match the backend SCHOOL_SUBJECT_DISPLAY_NAMES dict so the
 * transcript line reads the same on web and mobile.
 *
 * Mobile naming choices vs marketing copy:
 *   - "Language Arts" includes English / Reading / Writing (marketing: English)
 *   - "Social Studies" covers history / civics / geography / world languages
 *   - "Fine Arts" covers visual art, music, theater, dance (marketing: Visual Arts + Music)
 *   - Other six (PE, Math, Science, CTE, Financial Literacy, Health, Digital Literacy, Electives) match
 */

import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

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

export const SUBJECTS: SubjectMeta[] = [
  {
    key: 'language_arts',
    name: 'Language Arts',
    description: 'Reading, writing, storytelling, journalism',
    icon: 'book-outline',
    accent: '#6D469B',
  },
  {
    key: 'math',
    name: 'Math',
    description: 'Numbers, patterns, budgeting, problem solving',
    icon: 'calculator-outline',
    accent: '#0F766E',
  },
  {
    key: 'science',
    name: 'Science',
    description: 'Curiosity about how the world works',
    icon: 'flask-outline',
    accent: '#1D4ED8',
  },
  {
    key: 'social_studies',
    name: 'Social Studies',
    description: 'History, civics, world cultures, languages',
    icon: 'earth-outline',
    accent: '#B45309',
  },
  {
    key: 'financial_literacy',
    name: 'Financial Literacy',
    description: 'Money, investing, building a business',
    icon: 'cash-outline',
    accent: '#15803D',
  },
  {
    key: 'health',
    name: 'Health',
    description: 'Wellness, nutrition, mental health',
    icon: 'heart-outline',
    accent: '#BE123C',
  },
  {
    key: 'pe',
    name: 'PE',
    description: 'Sports, dance, training, outdoor skills',
    icon: 'fitness-outline',
    accent: '#C2410C',
  },
  {
    key: 'fine_arts',
    name: 'Fine Arts',
    description: 'Visual art, music, theater, dance',
    icon: 'color-palette-outline',
    accent: '#A21CAF',
  },
  {
    key: 'cte',
    name: 'CTE',
    description: 'Trades, internships, real-world work',
    icon: 'hammer-outline',
    accent: '#525252',
  },
  {
    key: 'digital_literacy',
    name: 'Digital Literacy',
    description: 'Coding, design, technology skills',
    icon: 'code-slash-outline',
    accent: '#0369A1',
  },
  {
    key: 'electives',
    name: 'Electives',
    description: 'Anything else that sparks your interest',
    icon: 'sparkles-outline',
    accent: '#7E22CE',
  },
];

export function getSubject(key: string | null | undefined): SubjectMeta | null {
  if (!key) return null;
  return SUBJECTS.find((s) => s.key === key) || null;
}
