import React, { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import EvidenceDisplay from '../evidence/EvidenceDisplay'

// Holistic review of student class submissions — a class shows as one unit
// (its title, subject, approved XP, and the tasks that built it), not as
// individual task credit requests. Used both on the standalone /admin/class-reviews
// page and as a tab inside the Credit Review Dashboard.

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
  const [rejectNotes, setRejectNotes] = useState('')
  const [acting, setActing] = useState(false)

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
    setRejectNotes('')
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

  const approve = async () => {
    if (!selectedId) return
    setActing(true)
    try {
      await api.post(`/api/admin/class-reviews/${selectedId}/approve`, {})
      toast.success('Class approved — transcript credit awarded')
      setSelectedId(null)
      setDetail(null)
      fetchItems()
      onReviewed?.()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Approve failed')
    } finally {
      setActing(false)
    }
  }

  const reject = async () => {
    if (!selectedId) return
    if (!rejectNotes.trim()) {
      toast.error('Notes are required to reject')
      return
    }
    setActing(true)
    try {
      await api.post(`/api/admin/class-reviews/${selectedId}/reject`, { notes: rejectNotes.trim() })
      toast.success('Class rejected — student notified')
      setSelectedId(null)
      setDetail(null)
      setRejectNotes('')
      fetchItems()
      onReviewed?.()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Reject failed')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Class submissions</h2>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1"
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-gray-500 text-sm">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">No class submissions</div>
          ) : items.map((it) => (
            <button
              key={it.quest_id}
              type="button"
              onClick={() => selectItem(it)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${selectedId === it.quest_id ? 'bg-purple-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-gray-900 truncate">{it.title}</div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_BADGE[it.review_status] || 'bg-gray-100 text-gray-700'}`}>
                  {it.review_status?.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="text-sm text-gray-500 mt-1">
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
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">
        {!selectedId ? (
          <div className="p-12 text-center text-gray-400">Select a class to review</div>
        ) : detailLoading ? (
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
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-purple-600 font-semibold">Approved XP</div>
                <div className="text-2xl font-bold text-purple-900">{detail.approved_subject_xp}</div>
                <div className="text-xs text-purple-700">in {detail.quest.transcript_subject_display}</div>
              </div>
              <div className="bg-pink-50 border border-pink-200 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-pink-600 font-semibold">Target</div>
                <div className="text-2xl font-bold text-pink-900">{detail.target_xp}</div>
                <div className="text-xs text-pink-700">per credit</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-green-600 font-semibold">Credits</div>
                <div className="text-2xl font-bold text-green-900">{detail.credits_earned}</div>
                <div className="text-xs text-green-700">earned</div>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Tasks &amp; evidence ({detail.tasks.length})</h4>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {detail.tasks.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">No completed tasks yet</div>
                ) : detail.tasks.map((t) => (
                  <div key={t.completion_id} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-gray-900 truncate">{t.title}</div>
                      <div className="text-xs text-gray-500 whitespace-nowrap">
                        {t.subject_xp_attributed} XP{t.xp_value !== t.subject_xp_attributed ? ` • ${t.xp_value} total` : ''}
                      </div>
                    </div>
                    {t.description && (
                      <div className="text-xs text-gray-500 mt-1">{t.description}</div>
                    )}
                    {t.evidence_blocks?.length > 0 && (
                      <div className="mt-3">
                        <EvidenceDisplay blocks={t.evidence_blocks} emptyMessage="" />
                      </div>
                    )}
                  </div>
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
              <div className="border-t border-gray-200 pt-4">
                <div className="flex flex-col gap-3">
                  <textarea
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
                    placeholder="If rejecting, write notes for the student (what to keep building, what to evidence better)…"
                    className="w-full text-sm border border-gray-300 rounded-md p-2 min-h-[80px]"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={reject}
                      disabled={acting || !rejectNotes.trim()}
                      className="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={approve}
                      disabled={acting}
                      className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-md disabled:opacity-50"
                    >
                      Approve credit
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default ClassReviewsSection
