import React, { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import ClassTaskReview from './ClassTaskReview'
import ClassReviewEmail from './ClassReviewEmail'
import { isRunningAiStatus } from './aiReview'

// Holistic review of student class submissions — a class shows as one unit
// (its title, subject, approved XP, and the tasks that built it). Each task is
// still accepted or sent back on its own, with the same AI review as the
// credit queue (ClassTaskReview). Rendered as a tab inside the Credit Review
// Dashboard.

// How often, and for how long, to re-read a class while its AI reviews run.
// Bounded like useAiReviewPolling: past this the reviewer presses Re-run.
const AI_POLL_MS = 5000
const AI_POLL_MAX = 36

const STATUS_OPTIONS = [
  { value: 'submitted_for_review', label: 'Awaiting Review' },
  { value: 'credit_awarded', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

const STATUS_BADGE = {
  submitted_for_review: 'bg-amber-100 text-amber-800',
  credit_awarded: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

const ClassReviewsSection = ({ onReviewed }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('submitted_for_review')
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/api/admin/class-reviews', { params: { status } })
      const data = res.data?.data || res.data
      setItems(data.items || [])
    } catch (err) {
      toast.error('Failed to load class reviews')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { fetchItems() }, [fetchItems])

  const selectItem = async (item) => {
    setSelectedId(item.quest_id)
    try {
      setDetailLoading(true)
      const res = await api.get(`/api/admin/class-reviews/${item.quest_id}`)
      setDetail(res.data?.data || res.data)
    } catch (err) {
      toast.error('Failed to load detail')
    } finally {
      setDetailLoading(false)
    }
  }

  // Silent: a decision or a finished AI review must not blank the evidence
  // the reviewer is reading.
  const selectedRef = useRef(selectedId)
  useEffect(() => { selectedRef.current = selectedId }, [selectedId])
  const refreshDetail = useCallback(async () => {
    const questId = selectedRef.current
    if (!questId) return
    try {
      const res = await api.get(`/api/admin/class-reviews/${questId}`)
      if (selectedRef.current === questId) setDetail(res.data?.data || res.data)
    } catch {
      // The next poll or decision tries again.
    }
  }, [])

  const aiRunning = (detail?.tasks || []).some(t => isRunningAiStatus(t.ai?.status))
  useEffect(() => {
    if (!aiRunning) return undefined
    let polls = 0
    const timer = setInterval(() => {
      polls += 1
      if (polls > AI_POLL_MAX) { clearInterval(timer); return }
      refreshDetail()
    }, AI_POLL_MS)
    return () => clearInterval(timer)
  }, [aiRunning, selectedId, refreshDetail])

  const returnedCount = detail?.task_review_counts?.returned || 0

  const finished = () => {
    setSelectedId(null)
    setDetail(null)
    fetchItems()
    onReviewed?.()
  }

  // The queue and the review never share the screen. The queue is short and a
  // review is long, so a sidebar beside the review was mostly blank while it
  // squeezed the evidence. Opening a class trades the list for a slim bar.
  const selectedIndex = items.findIndex(it => it.quest_id === selectedId)
  const backToList = () => { setSelectedId(null); setDetail(null) }

  if (!selectedId) {
    return (
      <div className="relative bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Class submissions</h2>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
            className="text-sm border border-gray-300 rounded-md px-2 py-1"
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-500 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No class submissions</div>
        ) : (
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((it) => (
              <button
                key={it.quest_id}
                type="button"
                onClick={() => selectItem(it)}
                className="text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-optio-purple/40 hover:bg-gray-50 min-w-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-gray-900 truncate">{it.title}</div>
                  <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${STATUS_BADGE[it.review_status] || 'bg-gray-100 text-gray-700'}`}>
                    {it.review_status?.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="text-sm text-gray-500 mt-1 truncate">
                  {it.student_name} • {it.transcript_subject_display}
                </div>
                {it.submitted_at && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    Submitted {new Date(it.submitted_at).toLocaleDateString()}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    // relative: the AI verdicts carry screen-reader text (sr-only, which is
    // position:absolute). With no positioned ancestor inside the scroll area
    // it anchored to the page instead, and a long review stretched the page
    // ~40,000px past the email box as blank scroll.
    <div className="relative space-y-3">
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
        <button type="button" onClick={backToList} className="btn-quiet px-3 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All classes
        </button>
        <div className="flex-1" />
        {items.length > 1 && selectedIndex >= 0 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => selectItem(items[selectedIndex - 1])}
              disabled={selectedIndex <= 0}
              className="btn-quiet px-2.5"
              aria-label="Previous class"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm text-gray-500 tabular-nums px-1">{selectedIndex + 1} / {items.length}</span>
            <button
              type="button"
              onClick={() => selectItem(items[selectedIndex + 1])}
              disabled={selectedIndex >= items.length - 1}
              className="btn-quiet px-2.5"
              aria-label="Next class"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl min-w-0 break-words">
        {detailLoading ? (
          <div className="p-12 text-center text-gray-500">Loading…</div>
        ) : detail ? (
          <div className="p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{detail.quest.title}</h3>
                <div className="text-sm text-gray-600 mt-1">
                  {detail.student?.display_name} • <span className="font-medium">{detail.quest.transcript_subject_display}</span>
                </div>
              </div>
              <span className={`text-xs px-3 py-1 rounded-full ${STATUS_BADGE[detail.quest.review_status] || 'bg-gray-100 text-gray-700'}`}>
                {detail.quest.review_status?.replace(/_/g, ' ')}
              </span>
            </div>

            {detail.quest.description && (
              <div className="mb-4 text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
                {detail.quest.description}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-optio-purple/5 border border-optio-purple/20 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-optio-purple font-semibold">Approved XP</div>
                <div className="text-2xl font-bold text-optio-purple-dark">{detail.approved_subject_xp}</div>
                <div className="text-xs text-optio-purple-dark">
                  in {detail.quest.transcript_subject_display}
                  {detail.total_subject_xp > detail.approved_subject_xp && ` (${detail.total_subject_xp - detail.approved_subject_xp} sent back)`}
                </div>
              </div>
              <div className="bg-optio-pink/5 border border-optio-pink/20 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-optio-pink font-semibold">Target</div>
                <div className="text-2xl font-bold text-optio-pink-dark">{detail.target_xp}</div>
                <div className="text-xs text-optio-pink-dark">for 0.5 credit</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-green-600 font-semibold">Credits</div>
                <div className="text-2xl font-bold text-green-900">{detail.credits_earned}</div>
                <div className="text-xs text-green-700">earned</div>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <h4 className="text-sm font-semibold text-gray-900">Tasks &amp; evidence ({detail.tasks.length})</h4>
                {detail.task_review_counts && detail.tasks.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {detail.task_review_counts.accepted} of {detail.tasks.length} accepted
                    {returnedCount > 0 && ` • ${returnedCount} sent back`}
                  </span>
                )}
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {detail.tasks.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">No completed tasks yet</div>
                ) : detail.tasks.map((t) => (
                  <ClassTaskReview
                    key={t.completion_id}
                    questId={detail.quest.id}
                    task={t}
                    canDecide={detail.quest.review_status === 'submitted_for_review'}
                    onChanged={refreshDetail}
                  />
                ))}
              </div>
            </div>

            {detail.quest.review_notes && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="text-xs font-semibold text-amber-900 mb-1">Previous review notes:</div>
                <div className="text-sm text-amber-900">{detail.quest.review_notes}</div>
              </div>
            )}

            {detail.quest.review_status === 'submitted_for_review' && (
              <ClassReviewEmail detail={detail} onSent={finished} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default ClassReviewsSection
