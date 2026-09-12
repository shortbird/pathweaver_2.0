import React from 'react'
import { sectionByKind, updateSection } from './storyEditorState'

const isIncluded = (row) => row?.included !== false

const ToggleRow = ({ included, onToggle, label, children }) => (
  <li className={`flex gap-3 rounded-lg border border-gray-200 p-3 ${included ? 'bg-white' : 'bg-gray-50 text-gray-400'}`}>
    <input
      type="checkbox"
      checked={included}
      onChange={onToggle}
      aria-label={label}
      className="mt-0.5 rounded text-optio-purple focus:ring-optio-purple shrink-0"
    />
    <div className="min-w-0 flex-1 text-sm">{children}</div>
  </li>
)

/**
 * The parts of a story copied verbatim from the review: the criteria the
 * teacher checked and (for a quest story) the tasks. None of it is editable
 * here. The rows are the record of what happened, and a story that
 * paraphrased the teacher would stop being one. What a superadmin can do is
 * leave a row out.
 *
 * The review rounds are not here. They stopped being part of the page on
 * 2026-09-12: a visitor is here for the work, not the paperwork behind the
 * credit. Older rows still carry a `how_it_went` section; nothing reads it.
 */
const StoryCriteriaRounds = ({ story, onChange }) => {
  const criteria = sectionByKind(story, 'what_reviewer_looked_for')?.criteria || []
  const tasks = sectionByKind(story, 'tasks')?.rows || []

  const toggle = (kind, listKey, index) => {
    const rows = sectionByKind(story, kind)?.[listKey] || []
    const next = rows.map((row, i) => (
      i === index ? { ...row, included: !isIncluded(row) } : row
    ))
    onChange?.(updateSection(story, kind, { [listKey]: next }))
  }

  return (
    <div className="space-y-5">
      {tasks.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">The tasks</h4>
          <ul className="space-y-2">
            {tasks.map((row, i) => (
              <ToggleRow
                key={i}
                included={isIncluded(row)}
                onToggle={() => toggle('tasks', 'rows', i)}
                label={`Include task ${row.title || i + 1}`}
              >
                <p className="font-medium text-gray-900">{row.title}</p>
                <p className="text-xs text-gray-500">
                  {[
                    row.subject,
                    row.xp != null && `${row.xp} XP`,
                    row.criteria_total != null && `${row.criteria_met ?? 0} of ${row.criteria_total} criteria`,
                  ].filter(Boolean).join(' · ')}
                </p>
              </ToggleRow>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">What the teacher checked</h4>
        {criteria.length === 0 ? (
          <p className="text-sm text-gray-500">No criteria on this story.</p>
        ) : (
          <ul className="space-y-2">
            {criteria.map((row, i) => (
              <ToggleRow
                key={i}
                included={isIncluded(row)}
                onToggle={() => toggle('what_reviewer_looked_for', 'criteria', i)}
                label={`Include criterion ${i + 1}`}
              >
                <p className="text-gray-900">{row.text}</p>
                <p className="text-xs text-gray-500">
                  {row.verdict === 'met' ? 'Met' : row.verdict === 'partial' ? 'Partly met' : row.verdict}
                  {row.note && ` · ${row.note}`}
                </p>
              </ToggleRow>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default StoryCriteriaRounds
