import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'

const STATUS_LABEL = {
  draft: 'Draft',
  pending_review: 'Pending review',
  published: 'Published',
  archived: 'Archived',
}

const STATUS_STYLE = {
  draft: 'bg-gray-100 text-gray-700',
  pending_review: 'bg-yellow-100 text-yellow-800',
  published: 'bg-green-100 text-green-800',
  archived: 'bg-red-100 text-red-700',
}

const formatDate = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const AdminClassReviewQueue = () => {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('pending_review')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const resp = await api.get('/api/courses', { params: { filter: 'admin_all' } })
        if (cancelled) return
        const all = resp.data?.courses || []
        setClasses(all.filter((c) => c.course_source === 'student_curated'))
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.error || e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(
    () => (statusFilter === 'all' ? classes : classes.filter((c) => c.status === statusFilter)),
    [classes, statusFilter]
  )

  const statusCounts = useMemo(() => {
    const counts = { all: classes.length, pending_review: 0, draft: 0, published: 0, archived: 0 }
    classes.forEach((c) => {
      if (counts[c.status] != null) counts[c.status] += 1
    })
    return counts
  }, [classes])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Student-curated classes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review student-authored classes. Open a class to fill in teacher-of-record details, then publish.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {['pending_review', 'draft', 'published', 'archived', 'all'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 text-sm rounded-full border ${
              statusFilter === s
                ? 'border-optio-purple bg-optio-purple/10 text-optio-purple font-medium'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {s === 'all' ? 'All' : STATUS_LABEL[s]} ({statusCounts[s] ?? 0})
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="p-8 text-center border border-dashed border-gray-300 rounded-lg text-gray-500">
          No classes in this state.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <ul className="space-y-2">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                to={`/classes/${c.id}/edit`}
                className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-optio-purple transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-gray-900 truncate">{c.title}</h2>
                    {c.description && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-1">{c.description}</p>
                    )}
                    <div className="mt-2 text-xs text-gray-500 flex items-center gap-3 flex-wrap">
                      {c.credit_subject && c.credit_amount && (
                        <span>
                          {Number(c.credit_amount).toFixed(2)} {c.credit_subject}
                        </span>
                      )}
                      {c.kickoff_at && <span>Kickoff {formatDate(c.kickoff_at)}</span>}
                      {c.quest_count != null && (
                        <span>{c.quest_count} {c.quest_count === 1 ? 'activity' : 'activities'}</span>
                      )}
                      {c.created_at && <span>Created {formatDate(c.created_at)}</span>}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded flex-shrink-0 ${STATUS_STYLE[c.status] || STATUS_STYLE.draft}`}
                  >
                    {STATUS_LABEL[c.status] || c.status}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default AdminClassReviewQueue
