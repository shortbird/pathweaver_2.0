import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listMyClasses } from '../../services/studentClassService'

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

const MyClasses = () => {
  const navigate = useNavigate()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const list = await listMyClasses()
        if (!cancelled) setClasses(list)
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Classes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Design a class your friends can sign up for with a shareable link.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/classes/new')}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90"
        >
          Create a class
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {!loading && classes.length === 0 && (
        <div className="p-8 text-center border border-dashed border-gray-300 rounded-lg">
          <p className="text-gray-600 mb-4">You haven't created any classes yet.</p>
          <Link
            to="/classes/new"
            className="inline-block px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90"
          >
            Create your first class
          </Link>
        </div>
      )}

      {!loading && classes.length > 0 && (
        <ul className="space-y-3">
          {classes.map((c) => (
            <li key={c.id}>
              <Link
                to={`/classes/${c.id}/edit`}
                className="block p-4 border border-gray-200 rounded-lg bg-white hover:border-optio-purple transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-gray-900 truncate">{c.title}</h2>
                    {c.description && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{c.description}</p>
                    )}
                    <div className="mt-2 text-xs text-gray-500 flex items-center gap-3">
                      {c.credit_subject && c.credit_amount && (
                        <span>
                          {Number(c.credit_amount).toFixed(2)} {c.credit_subject}
                        </span>
                      )}
                      {c.quest_count != null && (
                        <span>{c.quest_count} {c.quest_count === 1 ? 'activity' : 'activities'}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`ml-3 px-2 py-1 text-xs font-medium rounded flex-shrink-0 ${STATUS_STYLE[c.status] || STATUS_STYLE.draft}`}
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

export default MyClasses
