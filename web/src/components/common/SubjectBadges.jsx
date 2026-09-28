/**
 * SubjectBadges - Reusable component for displaying diploma subject XP distribution
 *
 * Displays subject badges with XP amounts in a consistent style across the app.
 * Supports both compact and detailed display modes.
 */

import PropTypes from 'prop-types';
import { SUBJECTS as SHARED_SUBJECTS } from '@shared/subjects';
import { TRANSCRIPT_SUBJECT_NAMES } from '@shared/credits';

// The icon each subject wears here. Web-only presentation, so it lives here
// rather than in the shared vocabulary. The colour does NOT: it is the
// subject's shared accent, the one standard colour per subject on every
// surface (2026-09-28). This file used to keep a brighter set of its own, so
// Fine Arts was pink on a badge and magenta on a class.
const SUBJECT_ICON = {
  language_arts: '📖',
  math: '🔢',
  science: '🔬',
  social_studies: '🌍',
  financial_literacy: '💰',
  health: '❤️',
  pe: '🏃',
  fine_arts: '🎨',
  cte: '🔧',
  digital_literacy: '💻',
  electives: '✨',
};

// A subject reaches this component as a key ('cte'), a picker name ('CTE') or a
// transcript name ('Career & Technical Education') depending on which endpoint
// produced it, so the badge has to answer to all three. That was twenty-five
// hand-written entries, three per subject, and adding a twelfth subject meant
// remembering all three or getting a grey fallback badge.
const SUBJECT_CONFIG = Object.fromEntries(
  SHARED_SUBJECTS.flatMap((s) => {
    // A subject with no accent is left OUT of the map on purpose, so it falls
    // through to the grey default below. Emitting a config with an undefined
    // colour would render a badge with no colour instead.
    if (!s.accent) return [];
    const config = { label: s.name, color: s.accent, icon: SUBJECT_ICON[s.key] || '📚' };
    const spellings = new Set([s.key, s.name, TRANSCRIPT_SUBJECT_NAMES[s.key] || s.name]);
    return [...spellings].map((spelling) => [spelling, config]);
  })
);

// Get config for a subject, with fallback
const getSubjectConfig = (subject) => {
  return SUBJECT_CONFIG[subject] || {
    label: subject,
    color: '#6B7280',
    icon: '📚'
  };
};

/**
 * SubjectBadges component
 *
 * @param {Object} subjectXpDistribution - Object mapping subject names to XP amounts
 * @param {boolean} compact - If true, shows abbreviated version without XP amounts
 * @param {boolean} showIcon - If true, shows emoji icon for each subject
 * @param {number} maxDisplay - Maximum number of subjects to display before showing "+X more"
 * @param {string} className - Additional CSS classes
 */
export default function SubjectBadges({
  subjectXpDistribution,
  compact = false,
  showIcon = false,
  maxDisplay = 10,
  className = ''
}) {
  if (!subjectXpDistribution) return null;

  // Handle both object and array formats
  let entries = [];
  if (typeof subjectXpDistribution === 'object' && !Array.isArray(subjectXpDistribution)) {
    entries = Object.entries(subjectXpDistribution);
  } else if (Array.isArray(subjectXpDistribution)) {
    // Legacy array format - convert to entries with no XP
    entries = subjectXpDistribution.map(subject => [subject, null]);
  }

  if (entries.length === 0) return null;

  const displayEntries = entries.slice(0, maxDisplay);
  const remainingCount = entries.length - maxDisplay;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {displayEntries.map(([subject, xp]) => {
        const config = getSubjectConfig(subject);

        return (
          <div
            key={subject}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: `${config.color}15`,
              color: config.color
            }}
          >
            {showIcon && <span className="text-xs">{config.icon}</span>}
            <span>{config.label}</span>
            {!compact && xp !== null && (
              <span style={{ opacity: 0.7 }}>({xp} XP)</span>
            )}
          </div>
        );
      })}
      {remainingCount > 0 && (
        <span className="text-xs text-gray-500 font-medium">
          +{remainingCount} more
        </span>
      )}
    </div>
  );
}

SubjectBadges.propTypes = {
  subjectXpDistribution: PropTypes.oneOfType([
    PropTypes.object,
    PropTypes.array
  ]),
  compact: PropTypes.bool,
  showIcon: PropTypes.bool,
  maxDisplay: PropTypes.number,
  className: PropTypes.string
};

// Export subject config for use in other components
export { SUBJECT_CONFIG, getSubjectConfig };
