/**
 * The CLP meeting itself: one student's header and school of record, the staff
 * notes, what the family is still waiting on, the weekly schedule, and every
 * class still available to them.
 *
 * The props list is wide because the page's state is wide -- nineteen pieces of
 * state, most of which this region reads. Grouping them into objects would hide
 * that rather than reduce it.
 */
import React from 'react'
import Button from '../../../components/ui/Button'
import { Pill, CheckIcon, LEARNING_DAY_LABELS, FUNDING_LABELS } from './clpHelpers'
import ClassCard from './ClassCard'
import ScheduleGrid from './ScheduleGrid'

const StudentDetail = ({
  allAges, setAllAges, availableClasses, busyId, classSearch, setClassSearch,
  confirm, drop, enroll, enrollFromWaitlist, fitsOnly, setFitsOnly,
  hideFull, setHideFull, joinWaitlist, leaveWaitlist, lowEnrollmentClasses,
  notesDraft, notesStatus, offerOtherSection, onNotesChange, openRequests,
  presentation, removeWaitlistEntry, resolveException, saveNotes, schedule,
  scheduleDays, schoolBusy, selectStudent, student, studentAge, studentLoading,
  timeFocus, setTimeFocus, toggleFinished, togglePrivateSchool,
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
  const s = student.student
  return (
    <div>
      {/* Student header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className={`font-bold text-neutral-900 ${presentation ? 'text-3xl' : 'text-2xl'}`}>
            {s.name}
            {s.age != null && <span className="font-normal text-neutral-400"> · {s.age}</span>}
          </h2>
          <div className="text-neutral-500 mt-0.5 text-sm">
            {student.family?.name && <span>{student.family.name}</span>}
          </div>
          {/* Guardian phone right here — building a schedule meant switching
              to the family directory and back for every call (iCreate,
              2026-09-02). Hidden with the screen turned to the family: they
              know their own number, and it is one more thing on the page. */}
          {!presentation && student.family?.guardians?.length > 0 && (
            <div className="text-sm text-neutral-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {student.family.guardians.map((g) => (
                <span key={g.name + (g.phone || g.email || '')}>
                  <span className="text-neutral-600">{g.name}</span>
                  {g.phone
                    ? <a href={`tel:${g.phone}`} className="ml-1.5 text-optio-purple hover:underline">{g.phone}</a>
                    : <span className="ml-1.5 text-neutral-300">no phone on file</span>}
                </span>
              ))}
            </div>
          )}
          {/* School of record. Read-only with the screen turned to the family;
              staff can set it right here during the meeting, which is what
              iCreate asked for ("maybe we could check the box during the
              CLP") — it used to be editable only on the Families page. */}
          {student.family?.school_name && (student.family?.enrolled_private_school || !presentation) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className="text-xs text-neutral-400">School:</span>
              {presentation ? (
                <Pill className="bg-emerald-100 text-emerald-700">{student.family.school_name}</Pill>
              ) : (
                <button type="button" onClick={togglePrivateSchool} disabled={schoolBusy}
                  className={`text-[11px] font-medium rounded-full px-2 py-0.5 shadow-sm transition-colors disabled:opacity-50 ${
                    student.family.enrolled_private_school
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-gray-100 text-neutral-500 hover:bg-gray-200'}`}
                  title={student.family.enrolled_private_school
                    ? `Enrolled in ${student.family.school_name} — click to unset`
                    : `Not enrolled in ${student.family.school_name} — click to set`}>
                  {student.family.enrolled_private_school
                    ? `✓ ${student.family.school_name}`
                    : `Not ${student.family.school_name}`}
                </button>
              )}
            </div>
          )}
          {(student.family?.funding_source || student.family?.payment_intent?.length > 0 || student.family?.ufa_private) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className="text-xs text-neutral-400">Form of payment:</span>
              {student.family?.funding_source ? (
                // Explicit funding source is the source of truth (staff-set or
                // funnel-derived); distinguishes UFA vs UFA-Private at a glance.
                <Pill className="bg-indigo-100 text-indigo-700">{FUNDING_LABELS[student.family.funding_source] || student.family.funding_source}</Pill>
              ) : (
                <>
                  {(student.family.payment_intent || []).map((p) => (
                    p === 'Utah Fits All' && student.family.ufa_private
                      ? <Pill key={p} className="bg-indigo-100 text-indigo-700">UFA · Private School</Pill>
                      : <Pill key={p} className="bg-sky-100 text-sky-700">{p}</Pill>
                  ))}
                  {student.family.ufa_private && !(student.family.payment_intent || []).includes('Utah Fits All') && (
                    <Pill className="bg-indigo-100 text-indigo-700">UFA · Private School</Pill>
                  )}
                </>
              )}
            </div>
          )}
          {student.learning_day?.choice && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className="text-xs text-neutral-400">Learning day:</span>
              <Pill className="bg-violet-100 text-violet-700">
                {LEARNING_DAY_LABELS[student.learning_day.choice] || student.learning_day.choice}
              </Pill>
            </div>
          )}
          {student.siblings?.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className="text-xs text-neutral-400">Siblings:</span>
              {student.siblings.map((sib) => (
                <button
                  key={sib.student_id}
                  type="button"
                  onClick={() => selectStudent(sib.student_id)}
                  className="text-xs font-medium rounded-full px-2.5 py-1 bg-[#F3EFF4] text-optio-purple hover:bg-optio-purple/20"
                >
                  {sib.name}
                  {sib.age != null && <span className="text-optio-purple/60"> · {sib.age}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* CLP finished: visible in presentation too — marking it at the end
            of the meeting, screen still turned to the family, is the flow. */}
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {student.clp_record?.finished ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                <CheckIcon className="w-4 h-4" /> CLP done
              </span>
              <button type="button" onClick={toggleFinished}
                className="text-xs text-neutral-400 underline hover:text-neutral-600">
                Reopen
              </button>
            </>
          ) : (
            <Button size="sm" onClick={toggleFinished}>Mark CLP done</Button>
          )}
        </div>
      </div>

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
