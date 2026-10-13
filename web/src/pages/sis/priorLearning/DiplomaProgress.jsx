import React from 'react'

const showCredits = (n) => (Math.round(n * 100) / 100).toString()

/**
 * Where the student stands against the diploma, per subject.
 *
 * Optio-earned and transfer credit are drawn as solid bars, credit approved
 * but not yet on the transcript as a lighter bar, and the AI's reading of
 * records still waiting as a dashed outline -- so a reviewer sees what this
 * approval would add before making it, and which subjects are already full.
 */
const DiplomaProgress = ({ progress }) => {
  if (!progress) return null
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Diploma progress</h3>
        <p className="text-xs text-gray-500 tabular-nums">
          {showCredits(progress.total_counted)} of {showCredits(progress.total_required)} credits
        </p>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-optio-purple" />Optio</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-blue-500" />Transfer</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-amber-400" />Approved, not on transcript</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm border border-dashed border-gray-500" />AI suggests</span>
      </div>
      <ul className="space-y-1.5">
        {progress.subjects.map((s) => {
          const scale = Math.max(s.required, s.earned + s.pending + s.suggested, 0.01)
          const pct = (n) => `${Math.min(100, (n / scale) * 100)}%`
          const met = s.earned + s.pending >= s.required
          return (
            <li key={s.subject} className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-2 text-xs">
              <span className="text-gray-700 truncate" title={s.name}>{s.name}</span>
              <div className="relative h-2.5 rounded-full bg-gray-100 overflow-hidden flex">
                <span className="h-full bg-optio-purple" style={{ width: pct(s.optio) }} />
                <span className="h-full bg-blue-500" style={{ width: pct(s.transfer) }} />
                <span className="h-full bg-amber-400" style={{ width: pct(s.pending) }} />
                <span className="h-full border border-dashed border-gray-500 rounded-r-full" style={{ width: pct(s.suggested) }} />
                <span className="absolute top-0 bottom-0 w-px bg-gray-700"
                      style={{ left: pct(s.required) }} aria-hidden="true" />
              </div>
              <span className={`text-right tabular-nums ${met ? 'text-green-700 font-medium' : 'text-gray-600'}`}>
                {showCredits(s.earned + s.pending)}/{showCredits(s.required)}
                {s.suggested > 0 && (
                  <span className="block text-[11px] text-optio-purple">+{showCredits(s.suggested)} AI</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default DiplomaProgress
