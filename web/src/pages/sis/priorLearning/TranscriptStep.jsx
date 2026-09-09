/**
 * Extracted from sis/PriorLearningPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import inputClass from './inputClass'
import parseCourseText from './parseCourseText'
import courseTotal from './courseTotal'

/**
 * The transcript step, shown once a record is accepted.
 *
 * Separate from Accept because they are separate decisions: the office accepts
 * when it believes the evidence, and transcribes when the credit is settled.
 * Keeping them apart is also what makes "already added" meaningful — the
 * backend refuses a second conversion, so once this has run the panel shows
 * what it produced instead of a button that would 409.
 *
 * Course names default to the AI's reading and stay editable; they must add up
 * to the subject credit or the backend refuses the save, because the transcript
 * prints both and a transcript that disagrees with itself is worse than one
 * with no line items.
 */
const TranscriptStep = ({ record, suggestion, busy, onSubmit }) => {
  const awarded = record.awarded_credits || {}
  const [school, setSchool] = useState(
    () => suggestion?.school_name || record.provider || ''
  )
  const [courses, setCourses] = useState(() => {
    const bySubject = {}
    for (const s of (suggestion?.subjects || [])) {
      if (!awarded[s.subject] || !(s.courses || []).length) continue
      bySubject[s.subject] = s.courses.map((c) => `${c.name} (${c.credits})`).join(', ')
    }
    return bySubject
  })

  if (record.transfer_credit) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
        <p className="text-sm text-green-800">
          On the transcript under <strong>{record.transfer_credit.school_name}</strong>.
        </p>
      </div>
    )
  }

  if (!Object.keys(awarded).length) {
    return (
      <p className="text-sm text-gray-500">
        Accepted without credit — nothing to add to the transcript.
      </p>
    )
  }

  const parsed = parseCourseText(courses)
  const mismatches = Object.keys(awarded).filter((subject) => {
    const list = parsed[subject]
    return list && Math.abs(courseTotal(list) - Number(awarded[subject])) > 0.01
  })

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 space-y-3">
      <p className="text-sm font-medium text-amber-900">
        Not on the transcript yet
      </p>
      <p className="text-xs text-amber-900">
        Accepting recorded the award on this record. It does not reach the
        student’s transcript, diploma credits or XP until you add it here.
      </p>
      <p className="text-xs text-gray-600">
        {Object.entries(awarded).map(([s, c]) => `${c} ${s}`).join(' · ')}
        {' — '}
        {Object.values(awarded).reduce((a, b) => a + Number(b), 0) * 2000} XP
      </p>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1"
               htmlFor={`school-${record.id}`}>School this credit came from</label>
        <input id={`school-${record.id}`} className={inputClass} value={school}
               onChange={(e) => setSchool(e.target.value)} />
        <p className="text-xs text-gray-500 mt-1">
          Records naming the same school merge into one transcript entry.
        </p>
      </div>

      {Object.keys(awarded).map((subject) => {
        const list = parsed[subject]
        const total = list ? courseTotal(list) : null
        const off = mismatches.includes(subject)
        return (
        <div key={subject}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <label className="text-xs font-medium text-gray-600"
                   htmlFor={`courses-${record.id}-${subject}`}>
              {subject} courses — must total {awarded[subject]}
            </label>
            <span className={`text-xs tabular-nums ${off ? 'text-red-700 font-medium' : 'text-gray-500'}`}>
              {total === null ? 'none' : `${total} / ${awarded[subject]}`}
            </span>
          </div>
          <input id={`courses-${record.id}-${subject}`}
                 aria-invalid={off || undefined}
                 className={off ? inputClass.replace('border-gray-300', 'border-red-400') : inputClass}
                 placeholder="US History (1.0), Government (0.5)"
                 value={courses[subject] || ''}
                 onChange={(e) => setCourses({ ...courses, [subject]: e.target.value })} />
          {off && (
            <p className="text-xs text-red-700 mt-1">
              These courses add up to {total}, but {subject} was awarded{' '}
              {awarded[subject]}. Fix a course, or{' '}
              <button type="button"
                      onClick={() => setCourses({ ...courses, [subject]: '' })}
                      className="underline font-medium">
                drop the course names
              </button>{' '}
              and transcribe the credit on its own.
            </p>
          )}
        </div>
      )})}

      <button type="button" disabled={busy || !school.trim() || mismatches.length > 0}
              onClick={() => onSubmit({
                school_name: school.trim(),
                subject_credits: awarded,
                course_names: parsed,
              })}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink disabled:opacity-50">
        Add to transcript
      </button>
    </div>
  )
}

export default TranscriptStep
