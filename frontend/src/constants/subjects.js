/**
 * The 11 platform school subjects from backend/utils/school_subjects.py.
 * Display names match SCHOOL_SUBJECT_DISPLAY_NAMES so the transcript line reads
 * the same on web and mobile. Keep this list aligned with the backend
 * SCHOOL_SUBJECTS enum and the v2 mobile SUBJECTS metadata.
 */

export const SUBJECTS = [
  { key: 'language_arts', name: 'Language Arts', description: 'Reading, writing, storytelling, journalism', accent: '#6D469B' },
  { key: 'math', name: 'Math', description: 'Numbers, patterns, budgeting, problem solving', accent: '#0F766E' },
  { key: 'science', name: 'Science', description: 'Curiosity about how the world works', accent: '#1D4ED8' },
  { key: 'social_studies', name: 'Social Studies', description: 'History, civics, world cultures, languages', accent: '#B45309' },
  { key: 'financial_literacy', name: 'Financial Literacy', description: 'Money, investing, building a business', accent: '#15803D' },
  { key: 'health', name: 'Health', description: 'Wellness, nutrition, mental health', accent: '#BE123C' },
  { key: 'pe', name: 'PE', description: 'Sports, dance, training, outdoor skills', accent: '#C2410C' },
  { key: 'fine_arts', name: 'Fine Arts', description: 'Visual art, music, theater, dance', accent: '#A21CAF' },
  { key: 'cte', name: 'CTE', description: 'Trades, internships, real-world work', accent: '#525252' },
  { key: 'digital_literacy', name: 'Digital Literacy', description: 'Coding, design, technology skills', accent: '#0369A1' },
  { key: 'electives', name: 'Electives', description: 'Anything else that sparks your interest', accent: '#7E22CE' },
];

export function getSubject(key) {
  if (!key) return null;
  return SUBJECTS.find((s) => s.key === key) || null;
}

export function getSubjectName(key) {
  return getSubject(key)?.name || key || '';
}
