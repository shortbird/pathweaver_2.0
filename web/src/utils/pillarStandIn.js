/**
 * What a student-facing surface shows in the pillar's place when
 * useHidePillars() says the pillars are hidden (a learner 13 or older, or a
 * school that switched them off; see hooks/useHidePillars.js).
 *
 *  - The label becomes the task's diploma subject ("Language Arts" rather
 *    than "Communication"): the subject it mostly counts toward.
 *  - Anything the pillar's colour tinted takes optio-purple instead, so the
 *    tint itself does not keep sorting work into five invisible groups.
 */
import { getSubjectName } from '../constants/subjects';

// optio-purple, for inline styles that need a hex (`${color}20` and the like).
export const BRAND_PURPLE = '#6d469b';

// Stands in for a config/pillars.js getPillarGradient() class pair.
export const BRAND_GRADIENT = 'from-optio-purple to-optio-purple-dark';

// Stands in for the bg / text / border classes of utils/pillarMappings.js.
export const BRAND_CHIP = {
  bg: 'bg-optio-purple/10',
  text: 'text-optio-purple',
  border: 'border-optio-purple/30',
};

/**
 * The subject a task mostly counts toward: the largest share of a
 * {subject: xp} split, or the first of a plain list.
 */
export function leadSubject(credits) {
  if (Array.isArray(credits)) return credits[0] || null;
  if (!credits || typeof credits !== 'object') return null;
  const [top] = Object.entries(credits).sort((a, b) => Number(b[1]) - Number(a[1]));
  return top ? top[0] : null;
}

const nonEmpty = (credits) =>
  Array.isArray(credits) ? credits.length > 0 : !!credits && typeof credits === 'object' && Object.keys(credits).length > 0;

/**
 * Display name of a task's lead subject, or '' when it carries none. Reads the
 * shapes the API sends a task's credit in: subject_xp_distribution (quest
 * tasks), diploma_subjects (task library, portfolio evidence) and
 * school_subjects (a plain list).
 */
export function leadSubjectName(task) {
  if (!task) return '';
  const credits = [task.subject_xp_distribution, task.diploma_subjects, task.school_subjects].find(nonEmpty);
  const key = leadSubject(credits);
  return key ? getSubjectName(key) : '';
}

/** pillarMappings data with its colours swapped for the brand's. */
export function brandPillarData(pillarData) {
  return { ...pillarData, color: BRAND_PURPLE, ...BRAND_CHIP };
}
