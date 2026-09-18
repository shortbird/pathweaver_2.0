/**
 * The student at the top of a CLP meeting: who they are, who to call, the
 * school of record, how the family pays, learning day, siblings, and the
 * "CLP done" mark. What the meeting is about is below it (StudentDetail).
 *
 * This is the meeting's view of the student, not a second editor: anything
 * about the student themself -- name, birthday, family, emergency contacts,
 * the school's record -- is edited in the one student record, which "Open
 * record" opens over the meeting (M13a, 2026-09-18). Two facts stay editable
 * here because iCreate asked to set them during the meeting: the school of
 * record and CLP done.
 */
import React from 'react'
import Button from '../../../components/ui/Button'
import { Pill, CheckIcon, LEARNING_DAY_LABELS, FUNDING_LABELS } from './clpHelpers'
import { useRecordDoors } from '../../../components/sis/RecordDoors'

const StudentHeader = ({
  student, presentation, selectStudent, toggleFinished, togglePrivateSchool, schoolBusy, onRecordSaved,
}) => {
  const { openStudent } = useRecordDoors()
  const s = student.student
  return (
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
        {!presentation && (
          <Button size="sm" variant="outline"
            onClick={() => openStudent(s.student_id, { onSaved: onRecordSaved })}>
            Open record
          </Button>
        )}
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
  )
}

export default StudentHeader
