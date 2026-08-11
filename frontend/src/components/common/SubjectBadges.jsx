/**
 * SubjectBadges - Reusable component for displaying diploma subject XP distribution
 *
 * Displays subject badges with XP amounts in a consistent style across the app.
 * Supports both compact and detailed display modes.
 */

import PropTypes from 'prop-types';

// Subject display names and colors
const SUBJECT_CONFIG = {
  'language_arts': { label: 'Language Arts', color: '#8B5CF6', icon: '📖' },
  'Language Arts': { label: 'Language Arts', color: '#8B5CF6', icon: '📖' },
  'math': { label: 'Math', color: '#3B82F6', icon: '🔢' },
  'Math': { label: 'Math', color: '#3B82F6', icon: '🔢' },
  'Mathematics': { label: 'Math', color: '#3B82F6', icon: '🔢' },
  'science': { label: 'Science', color: '#10B981', icon: '🔬' },
  'Science': { label: 'Science', color: '#10B981', icon: '🔬' },
  'social_studies': { label: 'Social Studies', color: '#F59E0B', icon: '🌍' },
  'Social Studies': { label: 'Social Studies', color: '#F59E0B', icon: '🌍' },
  'financial_literacy': { label: 'Financial Literacy', color: '#059669', icon: '💰' },
  'Financial Literacy': { label: 'Financial Literacy', color: '#059669', icon: '💰' },
  'health': { label: 'Health', color: '#EF4444', icon: '❤️' },
  'Health': { label: 'Health', color: '#EF4444', icon: '❤️' },
  'pe': { label: 'PE', color: '#F97316', icon: '🏃' },
  'PE': { label: 'PE', color: '#F97316', icon: '🏃' },
  'Physical Education': { label: 'PE', color: '#F97316', icon: '🏃' },
  'fine_arts': { label: 'Fine Arts', color: '#EC4899', icon: '🎨' },
  'Fine Arts': { label: 'Fine Arts', color: '#EC4899', icon: '🎨' },
  'cte': { label: 'CTE', color: '#6366F1', icon: '🔧' },
  'CTE': { label: 'CTE', color: '#6366F1', icon: '🔧' },
  'Career & Technical Education': { label: 'CTE', color: '#6366F1', icon: '🔧' },
  'digital_literacy': { label: 'Digital Literacy', color: '#0EA5E9', icon: '💻' },
  'Digital Literacy': { label: 'Digital Literacy', color: '#0EA5E9', icon: '💻' },
  'electives': { label: 'Electives', color: '#A855F7', icon: '✨' },
  'Electives': { label: 'Electives', color: '#A855F7', icon: '✨' }
};

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
