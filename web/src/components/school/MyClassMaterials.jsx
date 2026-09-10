import React from 'react'
import { DocumentTextIcon, LinkIcon } from '@heroicons/react/24/outline'
import { useMyClassMaterials } from '../../hooks/api/useMyClassMaterials'

/**
 * Handouts the signed-in student's own classes share, on the school page under
 * their schedule.
 *
 * A student could only reach class materials through ClassCurriculum on a QUEST
 * page, so a class with materials and no quest showed them to nobody at all.
 * iCreate's Musical Theater had two files, twenty-six students and zero quests
 * on the day its teacher told the parent chat that the dance videos were "under
 * class materials" (2026-09-10, 3e37d8b8). The parent's door was built first
 * (StudentClassMaterials); this is the student's, reading the same rows through
 * the self-scoped endpoint.
 *
 * Renders nothing when there is nothing to read -- including for everyone who
 * is not a student, who simply has no enrollments. A "no materials yet" card
 * would otherwise sit on every teacher's and every guardian's school page.
 */
const MyClassMaterials = () => {
  const { data } = useMyClassMaterials()
  const classes = data || []

  if (classes.length === 0) return null

  return (
    <section aria-label="Class materials"
      className="mb-4 bg-white border border-gray-200 rounded-xl px-3.5 py-3 sm:px-5 sm:py-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-9 h-9 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0">
          <DocumentTextIcon className="w-5 h-5 text-optio-purple" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">Class materials</h2>
          <p className="text-xs text-gray-500">Handouts, links and practice tracks from your teachers.</p>
        </div>
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

export default MyClassMaterials
