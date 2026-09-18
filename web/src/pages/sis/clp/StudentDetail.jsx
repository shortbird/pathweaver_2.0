/**
 * The CLP meeting itself: the staff notes, what the family is still waiting
 * on, the weekly schedule, and every class still available to the student.
 * Who the student is sits above this in StudentHeader, which opens the one
 * student record for anything about them (M13a).
 *
 * The props list is wide because the page's state is wide -- nineteen pieces of
 * state, most of which this region reads. Grouping them into objects would hide
 * that rather than reduce it.
 */
import React from 'react'
import { Pill } from './clpHelpers'
import ClassCard from './ClassCard'
import ScheduleGrid from './ScheduleGrid'

const StudentDetail = ({
  allAges, setAllAges, availableClasses, busyId, classSearch, setClassSearch,
  confirm, drop, enroll, enrollFromWaitlist, fitsOnly, setFitsOnly,
  hideFull, setHideFull, joinWaitlist, leaveWaitlist, lowEnrollmentClasses,
  notesDraft, notesStatus, offerOtherSection, onNotesChange, openRequests,
  presentation, removeWaitlistEntry, resolveException, saveNotes, schedule,
  scheduleDays, student, studentAge, studentLoading, timeFocus, setTimeFocus,
  waitlistedClasses,
}) => {
  if (studentLoading) return <p className="text-neutral-500">Loading student…</p>
  if (!student) {
    return (
      <div>
        <div className="flex items-center justify-center py-10 text-neutral-400 text-center">
          <div>
            <p className="font-medium">Search for a student to begin their learning plan.</p>
            <p className="text-sm mt-1">Their schedule and every available class will appear here.</p>
          </div>
        </div>
        {(waitlistedClasses.length > 0 || lowEnrollmentClasses.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-neutral-900 mb-1">Classes with a waitlist</h3>
              <p className="text-xs text-neutral-400 mb-3">Students waiting for a seat — open the class to offer it.</p>
              {waitlistedClasses.length === 0
                ? <p className="text-sm text-neutral-400">No classes have a waitlist.</p>
                : (
                  <ul className="divide-y divide-gray-100">
                    {waitlistedClasses.map((c) => (
                      <li key={c.id} className="py-2 flex items-center justify-between gap-2">
                        <span className="text-sm text-neutral-800 truncate">{c.name}</span>
                        <Pill className="bg-amber-100 text-amber-700 shrink-0">{c.waitlist_count} waiting</Pill>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-neutral-900 mb-1">Low enrollment</h3>
              <p className="text-xs text-neutral-400 mb-3">Fewer than 4 students — may be in danger of being dropped.</p>
              {lowEnrollmentClasses.length === 0
                ? <p className="text-sm text-neutral-400">Every class has 4 or more students.</p>
                : (
                  <ul className="divide-y divide-gray-100">
                    {lowEnrollmentClasses.map((c) => (
                      <li key={c.id} className="py-2 flex items-center justify-between gap-2">
                        <span className="text-sm text-neutral-800 truncate">{c.name}</span>
                        <Pill className={`shrink-0 ${(c.enrolled_count ?? 0) === 0 ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'}`}>
                          {c.enrolled_count ?? 0} enrolled
                        </Pill>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </div>
        )}
      </div>
    )
  }
  return (
    <div>
      {/* Staff meeting notes — never rendered in presentation (parent-safe). */}
      {!presentation && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-neutral-900 text-sm">
              Meeting notes <span className="text-xs font-normal text-neutral-400">· staff only</span>
            </h3>
            <span className={`text-xs ${notesStatus === 'dirty' ? 'text-amber-600' : 'text-neutral-400'}`}>
              {notesStatus === 'saving' ? 'Saving…' : notesStatus === 'dirty' ? 'Unsaved' : 'Saved'}
            </span>
          </div>
          <textarea
            rows={3}
            value={notesDraft}
            onChange={(e) => onNotesChange(e.target.value)}
            onBlur={() => { if (notesStatus === 'dirty') saveNotes(notesDraft) }}
            placeholder="Notes from the CLP meeting…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
        </div>
      )}

      {/* What the family has asked for and is still waiting on. These lived on
          two other pages, so a CLP meeting could finish without anyone
          noticing an open request (iCreate, 2026-07-31). */}
      {!presentation && (openRequests.waitlist.length > 0 || openRequests.age_exceptions.length > 0) && (
        <div className="bg-white rounded-xl border border-amber-200 p-4 mb-6">
          <h3 className="font-semibold text-neutral-900 text-sm mb-2">
            Open requests <span className="text-xs font-normal text-neutral-400">· staff only</span>
          </h3>
          <div className="space-y-1.5">
            {openRequests.waitlist.map((w) => (
              <div key={w.entry_id}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-neutral-700 min-w-0 truncate">
                    Waitlist · {w.class_name}
                    <span className="ml-1.5 text-xs text-neutral-400">
                      {w.status === 'offered' ? 'seat offered' : `#${w.position}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0 text-xs">
                    <button onClick={() => enrollFromWaitlist(w)} disabled={busyId === w.entry_id}
                      className="text-optio-purple hover:underline disabled:opacity-50">Enroll now</button>
                    <button onClick={() => removeWaitlistEntry(w)} disabled={busyId === w.entry_id}
                      className="text-neutral-400 hover:text-red-500 hover:underline disabled:opacity-50">Remove</button>
                  </span>
                </div>
                {/* The answer to a waitlist place is often a seat at another
                    time — say so here, where the meeting is happening. */}
                {(w.sections || []).length > 0 && (
                  <div className="mt-0.5 ml-3 text-xs text-neutral-500">
                    Other sections with room:{' '}
                    {w.sections.map((sec, i) => (
                      <span key={sec.class_id}>
                        {i > 0 && ', '}
                        <button onClick={() => offerOtherSection(w, sec)} disabled={busyId === w.entry_id}
                          className="text-optio-purple hover:underline disabled:opacity-50">
                          offer {sec.name}
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {openRequests.age_exceptions.map((r) => (
              <div key={r.request_id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-700 min-w-0 truncate">
                  Age exception · {r.class_name}
                  {r.message && <span className="ml-1.5 text-xs text-neutral-400">“{r.message}”</span>}
                </span>
                <span className="flex items-center gap-2 shrink-0 text-xs">
                  <button onClick={() => resolveException(r, 'approve')} disabled={busyId === r.request_id}
                    className="text-optio-purple hover:underline disabled:opacity-50">Approve</button>
                  <button onClick={() => resolveException(r, 'decline')} disabled={busyId === r.request_id}
                    className="text-neutral-400 hover:text-red-500 hover:underline disabled:opacity-50">Decline</button>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            Approve or decline each age exception here; waitlist places are kept until you enroll
            or remove them.
          </p>
        </div>
      )}

      {/* Weekly schedule */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-neutral-900">Weekly schedule</h3>
            <span className="text-sm text-neutral-400">{schedule.length} class{schedule.length === 1 ? '' : 'es'}</span>
          </div>
        </div>
        {<ScheduleGrid {...{ busyId, confirm, drop, schedule, scheduleDays, setTimeFocus, timeFocus }} />}
      </div>

      {/* Available classes */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h3 className="font-semibold text-neutral-900">
            Available classes
            {studentAge != null && !allAges && (
              <span className="ml-2 text-xs font-normal text-neutral-400">for age {studentAge}</span>
            )}
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              value={classSearch}
              onChange={(e) => setClassSearch(e.target.value)}
              placeholder="Search classes…"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
            />
            <label className="flex items-center gap-1.5 text-sm text-neutral-600">
              <input type="checkbox" checked={fitsOnly} onChange={(e) => setFitsOnly(e.target.checked)}
                className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
              Fits schedule
            </label>
            <label className="flex items-center gap-1.5 text-sm text-neutral-600">
              <input type="checkbox" checked={hideFull} onChange={(e) => setHideFull(e.target.checked)}
                className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
              Hide full
            </label>
            {studentAge != null && (
              <label className="flex items-center gap-1.5 text-sm text-neutral-600">
                <input type="checkbox" checked={allAges} onChange={(e) => setAllAges(e.target.checked)}
                  className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                All ages
              </label>
            )}
          </div>
        </div>

        {timeFocus && (
          <div className="flex items-center justify-between gap-3 mb-3 rounded-lg bg-optio-purple/10 border border-optio-purple/30 px-3 py-2">
            <span className="text-sm text-optio-purple font-medium">
              Showing classes that overlap <strong>{timeFocus.label}</strong>’s time
            </span>
            <button onClick={() => setTimeFocus(null)} className="text-sm text-optio-purple hover:underline">Clear</button>
          </div>
        )}

        <div className="space-y-2">
          {availableClasses.map((cls) => <ClassCard key={cls.class_id} {...{ cls, busyId, drop, enroll, joinWaitlist, leaveWaitlist }} />)}
          {!availableClasses.length && (
            <p className="text-sm text-neutral-400 py-4 text-center">
              {timeFocus ? 'No other classes meet during this time.' : 'No classes match these filters.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default StudentDetail
