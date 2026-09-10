/**
 * Extracted from sis/ReportsPage.jsx -- moved verbatim, only the address
 * changed. ReportsPage had grown past the 1000-line component-size ratchet and
 * this is the largest self-contained thing in it: a whole report with its own
 * day picker, print buttons and layout, coupled to the page by nothing but its
 * three props.
 */

import React from 'react'

import printSection from './printSection'


/**
 * Block rosters: one day at a time, one section per block, every class in that
 * block laid out across the page with its room and each student's age.
 *
 * iCreate (Marika), 2026-08-24, having built these by hand in Excel out of the
 * class roster page, the day roster page and the room assignments: "something
 * like the attached would be great for Tuesdays and Thursdays Blocks 1-5."
 * The day roster next door answers the same question a day at a time; this one
 * is the sheet you carry for one hour, so it is a day picker and a page per
 * block rather than a scroll.
 */
export const BlockRosters = ({ days, day, onDayChange }) => {
  if (!days?.length) return <p className="text-neutral-500">No classes are scheduled yet.</p>
  const current = days.find((d) => d.key === day) || days[0]

  return (
    <div>
      <div className="no-print flex items-center gap-1 flex-wrap border-b border-gray-200 mb-4 pb-2">
        {days.map((d) => (
          <button key={d.key} type="button" onClick={() => onDayChange(d.key)}
            className={`px-3 py-1.5 rounded-lg text-sm ${d.key === current.key
              ? 'bg-optio-purple/10 text-optio-purple font-medium'
              : 'text-neutral-600 hover:bg-gray-50'}`}>
            {d.label}
          </button>
        ))}
        {/* "Can we have an option to print an entire day instead of just a
            block?" (iCreate, 2026-09-01 — 48da8820). Every block was its own
            button, so a Tuesday meant five trips to the printer dialog. */}
        <button type="button" onClick={() => printSection(`sis-blocks-${current.key}`)}
          className="ml-auto px-2.5 py-1 rounded-lg border border-gray-300 text-xs text-neutral-700 hover:bg-gray-50">
          Print all of {current.label}
        </button>
      </div>
      <div id={`sis-blocks-${current.key}`} className="space-y-8">
        {current.blocks.map((b) => (
          <section key={b.key} id={`sis-block-${current.key}-${b.key}`} className="sis-block">
            {/* Sticky because a block of twelve classes scrolls its own heading
                off the top, and the heading is the only thing on the page that
                says which block you are reading -- "I always have to scroll
                upward to make sure I'm in the right time slot" (iCreate
                e64c4999). `print:static` so the sheet prints unchanged. */}
            <div className="sticky top-0 z-10 bg-white print:static flex items-center justify-between gap-2 border-b border-gray-200 pb-1 mb-3">
              <h4 className="font-semibold text-neutral-900">
                {current.label} · {b.label}
                <span className="text-sm font-normal text-neutral-500">
                  {' '}· {b.time} · {b.student_count} student{b.student_count === 1 ? '' : 's'}
                </span>
              </h4>
              <button type="button"
                onClick={() => printSection(`sis-block-${current.key}-${b.key}`)}
                className="no-print px-2.5 py-1 rounded-lg border border-gray-300 text-xs text-neutral-700 hover:bg-gray-50">
                Print {b.label}
              </button>
            </div>
            {b.classes.length === 0 ? (
              <p className="text-sm text-neutral-400">No classes in this block.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                {b.classes.map((c) => (
                  <div key={c.class_id} className="break-inside-avoid">
                    <div className="font-medium text-neutral-900 leading-tight">{c.name}</div>
                    <div className="text-xs text-neutral-500 mb-1.5">
                      <span className="font-medium text-optio-purple">{b.label}</span>
                      {' · '}
                      {[c.room || 'No room set', c.teacher].filter(Boolean).join(' · ')}
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-gray-200 text-xs text-neutral-500">
                          <th className="font-medium py-0.5">Student</th>
                          <th className="font-medium py-0.5 text-right w-10">Age</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.students.length === 0 ? (
                          <tr><td colSpan={2} className="py-1 text-xs text-neutral-400">Nobody enrolled.</td></tr>
                        ) : c.students.map((st) => (
                          <tr key={st.name} className="border-b border-gray-100">
                            <td className="py-0.5 text-neutral-800">{st.name}</td>
                            <td className="py-0.5 text-right text-neutral-600">{st.age || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
