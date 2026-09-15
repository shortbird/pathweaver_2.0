import React, { useEffect, useState, useCallback } from 'react'
import * as moderation from '../../services/moderationAPI'

const STATUS_TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'actioned', label: 'Actioned' },
  { value: 'all', label: 'All' },
  // Not a report status: what the safety screen held between students
  // (Friends phase 3). Read-only; a hold was never delivered, so there is
  // nothing to restore. This is where a false positive gets noticed.
  { value: 'holds', label: 'Holds' },
]

const REASON_LABELS = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate',
  self_harm: 'Self-harm',
  other: 'Other',
}

const TARGET_LABELS = {
  learning_event: 'Learning moment',
  task_completion: 'Task completion',
  comment: 'Comment',
  user: 'User',
  peer_comment: "Friend's comment",
  message: 'Direct message',
}

// 'Action taken' takes these down (the comment is hidden, the message
// soft-deleted); for every other target it only records that a human acted.
const TAKEDOWN_TARGETS = new Set(['peer_comment', 'message'])

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ModerationQueue() {
  const [status, setStatus] = useState('pending')
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updating, setUpdating] = useState(null)

  const [holds, setHolds] = useState([])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (status === 'holds') {
        setHolds(await moderation.getHolds(100))
      } else {
        setReports(await moderation.getReports(status, 100))
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const updateStatus = async (id, newStatus) => {
    setUpdating(id)
    try {
      await moderation.updateReport(id, newStatus)
      // Remove from current view if no longer matching filter
      if (status !== 'all' && status !== newStatus) {
        setReports((prev) => prev.filter((r) => r.id !== id))
      } else {
        setReports((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)),
        )
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to update report')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Moderation Queue</h2>
          <p className="text-sm text-gray-500">Review user-filed reports, and what the safety screen held between students.</p>
        </div>
        <button
          onClick={fetchReports}
          className="px-3 py-2 text-sm rounded-lg bg-optio-purple text-white hover:opacity-90"
        >
          Refresh
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${
              status === tab.value
                ? 'border-optio-purple text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>}
      {error && <div className="text-sm text-red-600 py-4">{error}</div>}

      {status === 'holds' && !loading && !error && (
        holds.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center">The safety screen has not held anything.</div>
        ) : (
          <div className="space-y-3">
            {holds.map((h) => <HoldRow key={h.id} hold={h} />)}
          </div>
        )
      )}

      {status !== 'holds' && !loading && !error && reports.length === 0 && (
        <div className="text-sm text-gray-500 py-8 text-center">No reports in this view.</div>
      )}

      {status !== 'holds' && !loading && reports.length > 0 && (
        <div className="space-y-3">
          {reports.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              updating={updating === report.id}
              onUpdate={updateStatus}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function HoldRow({ hold }) {
  const what = hold.surface === 'message' ? 'Direct message' : "Friend's comment"
  const when = hold.stage === 'refused' ? 'held before it was sent' : 'hidden after it posted'
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="inline-block text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{what}</span>
        <span className="inline-block text-xs font-semibold bg-amber-50 text-amber-700 px-2 py-0.5 rounded">{when}</span>
        {hold.model && <span className="text-xs text-gray-400">{hold.model}</span>}
      </div>
      <div className="text-xs text-gray-500 mb-1">
        {formatDate(hold.created_at)} · {hold.author?.display_name} to {hold.recipient?.display_name}
      </div>
      <div className="text-sm text-gray-800 border border-gray-200 p-2 rounded">{hold.text}</div>
      {hold.reasons?.length > 0 && (
        <div className="text-xs text-gray-500 mt-1">{hold.reasons.join('; ')}</div>
      )}
    </div>
  )
}

function ReportRow({ report, updating, onUpdate }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="inline-block text-xs font-semibold bg-red-50 text-red-700 px-2 py-0.5 rounded">
              {REASON_LABELS[report.reason] || report.reason}
            </span>
            <span className="inline-block text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
              {TARGET_LABELS[report.target_type] || report.target_type}
            </span>
            <span className="inline-block text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
              {report.status}
            </span>
          </div>
          <div className="text-xs text-gray-500 mb-1">
            {formatDate(report.created_at)} · reporter {report.reporter_id?.slice(0, 8)} · target {report.target_id?.slice(0, 8)}
          </div>
          {report.notes && (
            <div className="text-sm text-gray-700 italic mt-2 bg-gray-50 p-2 rounded">
              "{report.notes}"
            </div>
          )}
          {report.preview && (
            <div className="text-sm text-gray-800 mt-2 border border-gray-200 p-2 rounded">
              {report.preview.gone ? (
                <span className="text-gray-500">This text no longer exists.</span>
              ) : (
                <>
                  <span className="text-xs text-gray-500 block">
                    Reported text{report.preview.author_id ? ` from ${report.preview.author_id.slice(0, 8)}` : ''}
                    {report.preview.hidden ? ' (already hidden)' : ''}
                  </span>
                  {report.preview.text}
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => onUpdate(report.id, 'dismissed')}
            disabled={updating || report.status === 'dismissed'}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Dismiss
          </button>
          <button
            onClick={() => onUpdate(report.id, 'reviewed')}
            disabled={updating || report.status === 'reviewed'}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Mark reviewed
          </button>
          <button
            onClick={() => onUpdate(report.id, 'actioned')}
            disabled={updating || report.status === 'actioned'}
            className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:opacity-90 disabled:opacity-40"
          >
            {TAKEDOWN_TARGETS.has(report.target_type) ? 'Take it down' : 'Action taken'}
          </button>
        </div>
      </div>
    </div>
  )
}
