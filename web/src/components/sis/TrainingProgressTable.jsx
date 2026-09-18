import React from 'react'
import { progressLabel, progressStyle, words } from '../../pages/sis/trainingCopy'

/**
 * Who has done what: one row per person, one column per training item, in
 * the creator's order. The page's search narrows the ROWS by the person's
 * name -- every column stays, so one teacher's whole progress is in view at
 * once (Tanner, 2026-09-17). Lifted out of the training page (now libraryPage/TrainingPanel) the same day,
 * when that page crossed the size cap; the page owns the data and this
 * renders it.
 *
 * One report for both kinds (M18): `report.training` lists quests and links
 * with `kind`, and each person's `cells` follow it, keyed by kind and id. A
 * quest cell is that person's progress; a link cell is done / not done; a
 * dash is where the training was never aimed at this person, so nobody
 * reads "not done" on a training they were not given. `ordered` is the
 * page's arranged list, so a row just moved shows in its new place here too.
 */
export default function TrainingProgressTable({ report, ordered = [], audience, personMatches = () => true }) {
  const people = (report?.staff || []).filter((s) => personMatches(s.name))
  const keyOf = (r) => `${r.kind}:${r.id}`
  const rank = new Map(ordered.map((r, i) => [keyOf(r), i]))
  const columns = [...(report?.training || [])]
    .sort((a, b) => (rank.get(keyOf(a)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(keyOf(b)) ?? Number.MAX_SAFE_INTEGER))
  const cellFor = (person, col) => (person.cells || [])
    .find((c) => c.kind === col.kind && c.id === col.id)

  const cell = (c) => {
    if (!c || c.applies === false) return <span className="text-neutral-300">{'\u2014'}</span>
    if (c.kind === 'link') {
      return (
        <span className={`inline-block px-2 py-1 rounded-md text-xs ${
          c.completed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-neutral-500'}`}>
          {c.completed ? 'Done' : 'Not done'}
        </span>
      )
    }
    return (
      <span className={`inline-block px-2 py-1 rounded-md text-xs ${progressStyle(c)}`}>
        {progressLabel(c)}
      </span>
    )
  }

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
            {columns.map((t) => (
              <th key={keyOf(t)} className="px-3 py-2.5 font-medium text-neutral-600 min-w-[7rem]">
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
              {columns.map((col) => (
                <td key={keyOf(col)} className="px-3 py-2.5 text-center">{cell(cellFor(s, col))}</td>
              ))}
              <td className="px-3 py-2.5 text-center text-neutral-600">
                {s.required_completed}
                <span className="text-neutral-400">/{report.required_total}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  )
}
