import React from 'react'
import PropTypes from 'prop-types'
import { DocumentTextIcon, LinkIcon } from '@heroicons/react/24/outline'
import { useStudentClassMaterials } from '../../hooks/api/useStudentClassMaterials'

/**
 * Handouts a student's teachers have shared with their classes, on the family
 * dashboard under the schedule.
 *
 * The teacher's half of this always worked and the student's half always
 * worked; the parent's half did not exist. So when the Musical Theater teacher
 * posted "the dance videos and music tracks are under class materials" to the
 * PARENT chat, every parent reading it had nowhere to go (iCreate, 2026-09-09).
 * The materials were sitting on the class, ticked visible, the whole time.
 *
 * Renders nothing at all when the family has no materials to read — including
 * for a school with no classes module, where the request 404s. A card that says
 * "no materials yet" would appear on every family dashboard in every school for
 * the sake of the few classes that use them.
 */
const StudentClassMaterials = ({ studentId }) => {
  const { data } = useStudentClassMaterials(studentId)
  const classes = data || []

  if (classes.length === 0) return null

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">Class materials</h2>
        <p className="text-sm text-neutral-500">
          Handouts, links and practice tracks shared by your student&apos;s teachers.
        </p>
      </div>

      <div className="space-y-5">
        {classes.map((c) => (
          <div key={c.class_id}>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">
              {c.class_name}
            </div>
            <div className="space-y-2">
              {(c.materials || []).map((m) => (
                <a
                  key={m.id}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-optio-purple/40 hover:shadow-sm transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0">
                    {m.kind === 'file'
                      ? <DocumentTextIcon className="w-5 h-5 text-optio-purple" />
                      : <LinkIcon className="w-5 h-5 text-optio-purple" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 truncate">{m.title}</h4>
                    {m.curriculum_title && (
                      <p className="text-sm text-gray-500 truncate">{m.curriculum_title}</p>
                    )}
                  </div>
                  <span className="text-sm font-medium text-optio-purple flex-shrink-0">Open</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

StudentClassMaterials.propTypes = {
  studentId: PropTypes.string.isRequired,
}

export default StudentClassMaterials
