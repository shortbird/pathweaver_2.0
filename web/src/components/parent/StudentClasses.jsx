import React, { useState } from 'react'
import {
  ChevronDownIcon, ChevronRightIcon, DocumentTextIcon, LinkIcon,
} from '@heroicons/react/24/outline'
import { useFamilyStudentClasses } from '../../hooks/api/useFamilyStudentClasses'

/**
 * A student's classes in one place, each with its own handouts inside it.
 *
 * A guardian's view of their child's classes was scattered across pages that
 * did not link to each other: the schedule page had the times and the teacher,
 * the Schedule Builder had add and drop, and the handouts were a separate list
 * further down the dashboard with class names as headings. So "what is my kid
 * doing in Ceramics, and where is the glaze chart" meant three places and a
 * guess (iCreate, 2026-09-10: "parents should see classes for their kid in one
 * place", "class materials into class").
 *
 * Each class opens to show its own materials. Collapsed by default: a family
 * with four classes wants to scan the week, and only one class at a time is the
 * one they came for.
 *
 * Renders nothing for a student outside a SIS school — most students
 * platform-wide, and not an error.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const formatTime = (value) => {
  if (!value) return ''
  const [h, m] = String(value).split(':')
  const hour = Number(h)
  if (Number.isNaN(hour)) return String(value)
  const suffix = hour >= 12 ? 'pm' : 'am'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return m && m !== '00' ? `${display}:${m}${suffix}` : `${display}${suffix}`
}

const meetingLabel = (meeting) => {
  const day = DAYS[meeting.day_of_week] || ''
  const start = formatTime(meeting.start_time)
  const end = formatTime(meeting.end_time)
  const when = [start, end].filter(Boolean).join('–')
  return [day, when].filter(Boolean).join(' ')
}

const teacherName = (cls) => {
  const t = cls.primary_instructor
  if (!t) return ''
  return t.name || [t.first_name, t.last_name].filter(Boolean).join(' ')
}

const ClassRow = ({ cls }) => {
  const [open, setOpen] = useState(false)
  const materials = cls.materials || []
  const meetings = cls.meetings || []
  const teacher = teacherName(cls)
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
      >
        <Chevron className="w-5 h-5 text-neutral-400 flex-shrink-0 mt-0.5" />
        <span className="flex-1 min-w-0">
          <span className="block font-medium text-neutral-900 truncate">{cls.name}</span>
          <span className="block text-xs text-neutral-500 truncate">
            {[
              meetings.map(meetingLabel).filter(Boolean).join(', '),
              teacher && `with ${teacher}`,
              cls.location,
            ].filter(Boolean).join(' · ')}
          </span>
        </span>
        {materials.length > 0 && (
          <span className="flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-optio-purple/10 text-optio-purple">
            {materials.length} {materials.length === 1 ? 'handout' : 'handouts'}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-3 bg-gray-50/60">
          {materials.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Nothing shared for this class yet.
            </p>
          ) : (
            <div className="space-y-2">
              {materials.map((m) => {
                const Icon = m.kind === 'file' ? DocumentTextIcon : LinkIcon
                return (
                  <a
                    key={m.id}
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-2.5 bg-white border border-gray-200 rounded-lg hover:border-optio-purple/40 hover:shadow-sm transition-all"
                  >
                    <Icon className="w-4 h-4 text-optio-purple flex-shrink-0" />
                    <span className="text-sm text-neutral-900 truncate">{m.title}</span>
                  </a>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const StudentClasses = ({ studentId, title = 'Classes' }) => {
  const { classes } = useFamilyStudentClasses(studentId)

  if (!classes.length) return null

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        <p className="text-sm text-neutral-500">
          Open a class to see what the teacher has shared with it.
        </p>
      </div>
      <div className="space-y-2">
        {classes.map((cls) => <ClassRow key={cls.id} cls={cls} />)}
      </div>
    </section>
  )
}

export default StudentClasses
