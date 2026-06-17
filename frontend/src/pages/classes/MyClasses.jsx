import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { getSubjectName } from '../../constants/subjects'
import CreateCreditClassModal from '../../components/classes/CreateCreditClassModal'

const REVIEW_STATUS_LABEL = {
  submitted_for_review: { label: 'In review', style: 'bg-yellow-100 text-yellow-800' },
  credit_awarded: { label: 'Credit awarded', style: 'bg-green-100 text-green-800' },
  rejected: { label: 'Needs more work', style: 'bg-red-100 text-red-700' },
}

const MyClasses = () => {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const loadClasses = useCallback(async () => {
    setLoading(true)
    try {
      // Dedicated endpoint: includes credit-awarded (completed) classes, which the
      // dashboard's active_quests filters out.
      const res = await api.get('/api/quests/my-classes')
      const list = res.data?.data?.classes || []
      setClasses(
        list.map((c) => ({
          questId: c.quest_id,
          title: c.title,
          transcript_subject: c.transcript_subject,
          image: c.header_image_url || c.image_url || null,
          progress: c,
        }))
      )
    } catch {
      setClasses([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadClasses()
  }, [loadClasses])

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {showCreate && (
        <CreateCreditClassModal
          onClose={() => setShowCreate(false)}
          onCreated={() => setShowCreate(false)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">High School Classes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Earn a transcript credit by working toward a single subject. Everything you do in a
            class counts toward that credit.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 flex-shrink-0"
        >
          Start a class
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
        </div>
      ) : classes.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-gray-300 rounded-lg">
          <p className="text-gray-600 mb-4">
            You haven't started a class yet. Pick a subject and start earning credit toward it.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-block px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90"
          >
            Start your first class
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {classes.map((c) => {
            const p = c.progress
            const awarded = p?.review_status === 'credit_awarded'
            const target = p?.target_xp || 1000
            const xpToNext = p?.xp_toward_next_credit ?? p?.approved_xp ?? 0
            const percent = awarded ? 100 : Math.min(100, Math.round((xpToNext / target) * 100))
            const subjectName =
              p?.transcript_subject_display || getSubjectName(c.transcript_subject)
            const reviewMeta = p?.review_status ? REVIEW_STATUS_LABEL[p.review_status] : null
            return (
              <li key={c.questId}>
                <Link
                  to={`/quests/${c.questId}`}
                  className="block p-4 border border-gray-200 rounded-lg bg-white hover:border-optio-purple transition"
                >
                  <div className="flex items-start justify-between">
                    {c.image && (
                      <div className="mr-3 flex-shrink-0 w-20 h-14 rounded-md border border-gray-100 bg-white flex items-center justify-center overflow-hidden">
                        <img
                          src={c.image}
                          alt={`${c.title} logo`}
                          className="max-w-full max-h-full object-contain p-1"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h2 className="font-semibold text-gray-900 truncate">{c.title}</h2>
                      <div className="mt-1 text-xs text-gray-500 flex items-center gap-3">
                        <span className="font-medium text-optio-purple">{subjectName}</span>
                        {!!(p?.credits_earned) && (
                          <span className="text-green-700 font-medium">
                            {p.credits_earned} credit{p.credits_earned > 1 ? 's' : ''} earned
                          </span>
                        )}
                      </div>
                      {p && (
                        <div className="mt-2">
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-optio-purple to-optio-pink rounded-full"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            {awarded ? 'Credit earned' : `${xpToNext} / ${target} XP toward next credit`}
                          </p>
                        </div>
                      )}
                    </div>
                    {reviewMeta && (
                      <span
                        className={`ml-3 px-2 py-1 text-xs font-medium rounded flex-shrink-0 ${reviewMeta.style}`}
                      >
                        {reviewMeta.label}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default MyClasses
