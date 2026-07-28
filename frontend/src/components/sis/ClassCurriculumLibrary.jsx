import React, { useEffect, useState } from 'react'
import { BookOpenIcon, LinkIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'

/**
 * ClassCurriculumLibrary — the school's curriculum for this class, as the
 * teacher sees it.
 *
 * Staff-only, and separate from the class materials below it: materials are
 * what the teacher shares WITH students, this is what the school gives the
 * teacher to teach from. Renders nothing when no curriculum is attached, so a
 * class without one doesn't grow an empty section.
 */
export default function ClassCurriculumLibrary({ classId }) {
  const [entries, setEntries] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!classId) return
    let active = true
    api.get(`/api/sis/classes/${classId}/curriculum`)
      .then((r) => { if (active) setEntries(r.data?.curriculum || []) })
      .catch(() => { /* not a teacher of this class, or none attached */ })
      .finally(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [classId])

  if (!loaded || !entries.length) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <BookOpenIcon className="w-5 h-5 text-optio-purple" />
        <h2 className="text-lg font-bold text-gray-900">Your curriculum</h2>
      </div>
      <p className="text-sm text-neutral-500 mb-4">
        Provided by the school for this class. Students don't see this — it's for your planning.
      </p>
      <ul className="divide-y divide-gray-100">
        {entries.map((e) => (
          <li key={e.id} className="py-3">
            <p className="text-sm font-semibold text-neutral-900">{e.title}</p>
            {e.description && <p className="text-sm text-neutral-500 mt-0.5">{e.description}</p>}
            {e.drive_url && (
              <a href={e.drive_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-optio-purple hover:underline mt-1">
                <LinkIcon className="w-4 h-4" /> Open the folder
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
