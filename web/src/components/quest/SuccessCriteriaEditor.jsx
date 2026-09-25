import { arrayOf, bool, func, string } from 'prop-types';
import { CheckCircleIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';

/**
 * The Definition of Done, as a family writes it.
 *
 * `success_criteria` on a task: one to five short lines a reviewer can check
 * the work against. Same name and the same green-check list as where it is
 * read (TaskDetailsSection, TaskDetailModal, the wizard's TaskReviewStep), so
 * the thing a family writes here looks like the thing they will see later.
 *
 * Lines are kept as typed (blank ones included) while editing; callers trim
 * and drop the blanks on save with `cleanCriteria`.
 */
export const MAX_CRITERIA = 5;
export const MAX_CRITERION_LENGTH = 200;

export const cleanCriteria = (lines) =>
  (Array.isArray(lines) ? lines : [])
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter(Boolean)
    .slice(0, MAX_CRITERIA);

const PLACEHOLDERS = [
  'e.g., You played 5 games',
  'e.g., You wrote down what you would change next time',
  'e.g., You showed it to someone and explained how it works',
  'e.g., You took a photo of the finished piece',
  'e.g., You listed what you learned',
];

export default function SuccessCriteriaEditor({
  value, onChange, required = false, readOnly = false, lockedNote = '', error = '', idPrefix = 'dod',
}) {
  const lines = Array.isArray(value) && value.length > 0 ? value : [''];
  const labelId = `${idPrefix}-label`;
  const hintId = `${idPrefix}-hint`;
  const errorId = `${idPrefix}-error`;

  if (readOnly) {
    const kept = cleanCriteria(value);
    return (
      <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
        <p id={labelId} className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Definition of Done
        </p>
        {kept.length > 0 ? (
          <ul className="space-y-1.5" aria-labelledby={labelId}>
            {kept.map((criterion, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircleIcon className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" />
                <span>{criterion}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No criteria were set.</p>
        )}
        {lockedNote && <p className="mt-2 text-xs text-gray-500">{lockedNote}</p>}
      </div>
    );
  }

  const setLine = (index, text) => {
    const next = [...lines];
    next[index] = text;
    onChange(next);
  };
  const addLine = () => {
    if (lines.length < MAX_CRITERIA) onChange([...lines, '']);
  };
  const removeLine = (index) => {
    const next = lines.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : ['']);
  };

  return (
    <div role="group" aria-labelledby={labelId}>
      <p id={labelId} className="block text-sm font-semibold text-gray-700 mb-1">
        Definition of Done{required ? ' *' : ''}
      </p>
      <p id={hintId} className="text-xs text-gray-500 mb-2">
        How will you know this task is finished? One short line each, up to {MAX_CRITERIA}.
      </p>
      <ul className="space-y-2">
        {lines.map((line, i) => (
          <li key={i} className="flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" aria-hidden="true" />
            <input
              type="text"
              value={line}
              maxLength={MAX_CRITERION_LENGTH}
              onChange={(e) => setLine(i, e.target.value)}
              placeholder={PLACEHOLDERS[i] || PLACEHOLDERS[0]}
              aria-label={`Definition of Done line ${i + 1}`}
              aria-describedby={error ? errorId : hintId}
              aria-invalid={error ? 'true' : undefined}
              className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple min-h-[40px]"
            />
            {(lines.length > 1 || line !== '') && (
              <button
                type="button"
                onClick={() => removeLine(i)}
                aria-label={`Remove line ${i + 1}`}
                className="p-2 text-gray-400 hover:text-red-600 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {lines.length < MAX_CRITERIA && (
        <button
          type="button"
          onClick={addLine}
          className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-optio-purple hover:underline"
        >
          <PlusIcon className="w-4 h-4" />
          Add a line
        </button>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

SuccessCriteriaEditor.propTypes = {
  value: arrayOf(string),
  onChange: func,
  required: bool,
  readOnly: bool,
  lockedNote: string,
  error: string,
  idPrefix: string,
};
