import PropTypes from 'prop-types';

/**
 * "Only these subjects" — turns the selected diploma subjects from a
 * preference into a hard constraint on generated tasks.
 *
 * Finn O'Neill, 2026-09-07: "especially right now if I only have these three
 * courses, there's no need when it generates tasks for it to say oh half of it
 * gives social studies, half of it gives financial literacy... have like some
 * sort of toggle where it's say strictly this one."
 *
 * Off by default: cross-curricular tasks are the point for most learners. It
 * earns its place for the ones finishing a specific credit, who otherwise
 * cannot tell how close they are — every task paying a slice into a subject
 * they did not pick makes the progress bar unreadable.
 *
 * Lives in its own file because QuestPersonalizationWizard is already at the
 * size cap (src/__tests__/componentSize.test.js).
 */
const SubjectLockToggle = ({ checked, onChange, subjectNames }) => (
  <label className="mt-4 flex items-start gap-3 p-3 rounded-xl border-2 border-gray-200 hover:border-gray-300 cursor-pointer transition-colors">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 w-5 h-5 rounded accent-optio-purple flex-shrink-0"
    />
    <span>
      <span className="block font-semibold text-gray-800 text-sm">
        Only these subjects
      </span>
      <span className="block text-xs text-gray-500 mt-0.5">
        Every task earns credit in {subjectNames} and nothing else. Leave this
        off for tasks that span several subjects.
      </span>
    </span>
  </label>
);

SubjectLockToggle.propTypes = {
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  subjectNames: PropTypes.string.isRequired,
};

export default SubjectLockToggle;
