import React from 'react'
import { progressLabel, progressStyle, words } from '../../pages/sis/trainingCopy'

/**
 * Who has done what: one row per person, one column per training item, in
 * the creator's order. The page's search narrows the ROWS by the person's
 * name -- every column stays, so one teacher's whole progress is in view at
 * once (Tanner, 2026-09-17). Lifted out of StaffTrainingPage the same day,
 * when that page crossed the size cap; the page owns the data (the two
 * report halves and the arranged column list) and this renders it.
 *
 * A quest cell is that person's progress; a link cell is done / not done, or
 * a dash where the link was never aimed at this person, so nobody reads "not
 * done" on a training they were not given.
 */
export default function TrainingProgressTable({
  report, reportColumns, linkCells, linkReport, audience, personMatches = () => true,
}) {
  const people = (report?.staff || []).filter((s) => personMatches(s.name))
  return (
  !report?.staff?.length
    ? <p className="text-neutral-500">No {words(audience).many} to report on yet.</p>
    : !people.length
      ? <p className="text-neutral-500">Nobody matches that search.</p> : (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
  <th className="text-left px-4 py-2.5 font-semibold text-neutral-700">
              {audience === 'family' ? 'Family' : audience === 'student' ? 'Student' : 'Staff'}
            </th>
            {reportColumns.map((t) => (
              <th key={t.quest_id || `link-${t.id}`} className="px-3 py-2.5 font-medium text-neutral-600 min-w-[7rem]">
                <span className="block truncate max-w-[10rem] mx-auto" title={t.title}>{t.title}</span>
                {t.is_required && <span className="block text-[11px] font-normal text-optio-purple">required</span>}
              </th>
            ))}
            <th className="px-3 py-2.5 font-medium text-neutral-600">Required done</th>
          </tr>
        </thead>
        <tbody>
          {people.map((s) => (
            <tr key={s.user_id} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-2.5 font-medium text-neutral-900">{s.name}</td>
              {/* Cells follow the header: the creator's order, narrowed
                  by the search. A quest cell is this person's progress;
                  a link cell is done / not done, or a dash where the
                  link was never aimed at this person, so nobody reads
                  "not done" on a training they were not given. */}
              {reportColumns.map((col) => {
                if (col._key.startsWith('quest:')) {
                  const c = (s.cells || []).find((cell) => cell.quest_id === col.quest_id)
                  return (
                    <td key={col._key} className="px-3 py-2.5 text-center">
                      {c ? (
                        <span className={`inline-block px-2 py-1 rounded-md text-xs ${progressStyle(c)}`}>
                          {progressLabel(c)}
                        </span>
                      ) : <span className="text-neutral-300">{'\u2014'}</span>}
                    </td>
                  )
                }
                const c = (linkCells[s.user_id]?.cells || []).find((cell) => cell.link_id === col.id)
                  || { applies: !linkCells[s.user_id], done: false }
                return (
                  <td key={col._key} className="px-3 py-2.5 text-center">
                    {!c.applies ? <span className="text-neutral-300">{'\u2014'}</span> : (
                      <span className={`inline-block px-2 py-1 rounded-md text-xs ${
                        c.done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-neutral-500'}`}>
                        {c.done ? 'Done' : 'Not done'}
                      </span>
                    )}
                  </td>
                )
              })}
              <td className="px-3 py-2.5 text-center text-neutral-600">
                {s.required_completed + (linkCells[s.user_id]?.required_completed || 0)}
                <span className="text-neutral-400">/{report.required_total + (linkReport?.required_total || 0)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  )
}
