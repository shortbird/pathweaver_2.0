import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PlayCircleIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'

/**
 * Videos and documents the school set for its students, on the student's
 * /school page under their class materials, each with a Done button.
 *
 * "I would like to link to a video or document option in the 'for families'
 * (and students if it's not there too). For example, it'd be nice to be able to
 * upload the training from last friday without creating an entire quest."
 * (iCreate, Molly, 2026-09-22, ae16c5da.) Families got theirs on /family/forms;
 * this is the students'. A student training QUEST already reached them on their
 * account; a link has no account to land on, so it needs this list.
 *
 * Reads the self-scoped /api/sis/student/training: the server answers an empty
 * list for anybody who is not a student, so the card renders nothing on a
 * teacher's or a parent's page -- the same rule as MyClassMaterials. A school
 * with the training module off answers 404, which also renders nothing.
 */
const MySchoolTraining = () => {
  const [links, setLinks] = useState([])
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let active = true
    api.get('/api/sis/student/training')
      .then(({ data }) => { if (active && data?.success) setLinks(data.training || []) })
      .catch(() => { /* module off, or not a student: nothing to show */ })
    return () => { active = false }
  }, [])

  const toggleDone = async (link, done) => {
    setBusyId(link.id)
    try {
      const url = `/api/sis/student/training/${link.id}/done`
      // The empty object is required, not decoration: without a body axios
      // omits Content-Type and the CSRF middleware refuses the request
      // (src/__tests__/csrfRequestBody.test.js).
      const res = done ? await api.post(url, {}) : await api.delete(url)
      const updated = res.data?.training
      setLinks((prev) => prev.map((l) => (l.id === link.id ? (updated || l) : l)))
    } catch {
      toast.error('Could not save that')
    } finally {
      setBusyId(null)
    }
  }

  if (links.length === 0) return null

  return (
    <section aria-label="Watch or read"
      className="mb-4 bg-white border border-gray-200 rounded-xl px-3.5 py-3 sm:px-5 sm:py-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-9 h-9 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0">
          <PlayCircleIcon className="w-5 h-5 text-optio-purple" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">Watch or read</h2>
          <p className="text-xs text-gray-500">Open each one, then mark it done so your school knows you have seen it.</p>
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {links.map((l) => (
          <div key={l.id} className="py-2.5 flex items-center gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <a href={l.url} target="_blank" rel="noopener noreferrer"
                className="text-sm font-medium text-optio-purple hover:underline">
                {l.title}
              </a>
              {l.description && <p className="text-xs text-gray-500 mt-0.5">{l.description}</p>}
            </div>
            {l.is_required && !l.my_done && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
                Required
              </span>
            )}
            {l.my_done ? (
              <button type="button" onClick={() => toggleDone(l, false)} disabled={busyId === l.id}
                className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 shrink-0 disabled:opacity-50">
                Done — undo
              </button>
            ) : (
              <button type="button" onClick={() => toggleDone(l, true)} disabled={busyId === l.id}
                className="btn-primary text-xs px-3 py-1 shrink-0 disabled:opacity-50">
                {busyId === l.id ? 'Saving…' : 'Mark done'}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export default MySchoolTraining
