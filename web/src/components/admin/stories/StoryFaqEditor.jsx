import React from 'react'

/**
 * The FAQ rows under a story. Each one becomes a `<details>` on the page and
 * a `Question` in the FAQPage JSON-LD, so a question with no answer is worse
 * than no row: the editor lets a blank row exist while typing, and the
 * server's publish check is what refuses it.
 */
const StoryFaqEditor = ({ faq = [], onChange }) => {
  const rows = Array.isArray(faq) ? faq : []

  const patch = (index, changes) => {
    onChange?.(rows.map((row, i) => (i === index ? { ...row, ...changes } : row)))
  }
  const remove = (index) => onChange?.(rows.filter((_, i) => i !== index))
  const add = () => onChange?.([...rows, { q: '', a: '' }])

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <p className="text-sm text-gray-500">No questions yet.</p>
      )}
      {rows.map((row, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <input
              type="text"
              value={row.q || ''}
              onChange={e => patch(i, { q: e.target.value })}
              placeholder="Question"
              aria-label={`FAQ question ${i + 1}`}
              className="flex-1 text-sm font-medium rounded-lg border border-gray-300 px-3 py-1.5 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-xs font-medium text-gray-500 hover:text-red-700 min-h-[32px] px-1 touch-manipulation"
              aria-label={`Remove FAQ ${i + 1}`}
            >
              Remove
            </button>
          </div>
          <textarea
            value={row.a || ''}
            onChange={e => patch(i, { a: e.target.value })}
            placeholder="Answer"
            rows={2}
            aria-label={`FAQ answer ${i + 1}`}
            className="w-full text-sm rounded-lg border border-gray-300 px-3 py-1.5 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple"
          />
        </div>
      ))}
      <button type="button" onClick={add} className="btn-quiet">
        Add question
      </button>
    </div>
  )
}

export default StoryFaqEditor
