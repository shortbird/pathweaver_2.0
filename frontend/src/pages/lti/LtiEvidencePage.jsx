/**
 * Teacher evidence review — Canvas SpeedGrader target (v1).
 *
 * Opened unauthenticated by the grading teacher. The only credential is
 * the signed `lti_token` in the URL (minted by grade-sync, scoped to one
 * user+quest). Hits GET {API}/lti/evidence?lti_token=... which derives
 * the (student, quest) from the token itself and returns ONLY that
 * quest's tasks + non-private evidence + earned XP — never the whole
 * portfolio (which was the pre-redesign behaviour).
 *
 * Direct fetch (not the api axios instance) so the unauthenticated
 * SpeedGrader context doesn't trip the 401 refresh interceptor on a
 * token-gated endpoint.
 *
 * Read-only. Renders inside LtiShell so it sizes the Canvas iframe and
 * stays width-constrained in the cramped SpeedGrader pane.
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import LtiShell from '../../components/lti/LtiShell'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function blockUrl(b) {
  const c = b?.content || {}
  return c.url || c.file_url || c.link || null
}

function EvidenceBlockView({ block }) {
  const type = (block.block_type || '').toLowerCase()
  const c = block.content || {}

  if (type === 'text') {
    return <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.text || ''}</p>
  }
  if (type === 'image') {
    const url = blockUrl(block)
    return url ? (
      <img
        src={url}
        alt="Student image evidence"
        className="w-full max-h-64 object-cover rounded-md"
      />
    ) : null
  }
  const url = blockUrl(block)
  if (!url) return null
  const label =
    type === 'video'
      ? '▶ Video evidence'
      : type === 'link'
        ? `🔗 ${c.title || url}`
        : `📄 ${c.file_name || c.title || 'Attached file'}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-optio-purple underline break-all"
    >
      {label}
    </a>
  )
}

export default function LtiEvidencePage() {
  const [searchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const token = searchParams.get('lti_token')
    if (!token) {
      setError('This evidence link is missing its access token.')
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/lti/evidence?lti_token=${encodeURIComponent(token)}`,
        )
        if (cancelled) return
        if (!res.ok) {
          setError(
            res.status === 401
              ? 'This evidence link is invalid or has expired. Re-open it from the Canvas gradebook.'
              : 'Could not load the student evidence.',
          )
          return
        }
        setData(await res.json())
      } catch {
        if (!cancelled) setError('Could not load the student evidence.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  if (loading) return <LtiShell loading />
  if (error || !data) return <LtiShell error={error || 'No evidence found.'} />

  const completed = (data.tasks || []).filter((t) => t.is_completed).length
  return (
    <LtiShell
      title={data.quest?.title || 'Quest'}
      subtitle={data.student?.display_name || undefined}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-optio-purple/10 px-3 py-1 text-xs font-semibold text-optio-purple">
            {data.earned_xp} XP earned
          </span>
          <span className="text-sm text-gray-500">
            {completed}/{(data.tasks || []).length} tasks complete
          </span>
        </div>
        <hr className="border-gray-200" />
        {(!data.tasks || data.tasks.length === 0) ? (
          <p className="text-sm text-gray-500">
            This student hasn't created any tasks for this quest yet.
          </p>
        ) : (
          data.tasks.map((task) => (
            <div
              key={task.id}
              className={`rounded-lg p-4 ${
                task.is_completed
                  ? 'border border-gray-200 bg-white'
                  : 'border border-transparent bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-gray-900 flex-1">
                  {task.title}
                </h2>
                <span className="shrink-0 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                  {task.xp_value ?? 0} XP
                </span>
              </div>
              <p
                className={`mt-1 text-xs ${
                  task.is_completed ? 'text-emerald-700' : 'text-gray-400'
                }`}
              >
                {task.is_completed ? 'Completed' : 'Not yet completed'}
              </p>
              {(task.evidence_blocks || []).length > 0 ? (
                <div className="mt-3 space-y-2">
                  {task.evidence_blocks.map((b, i) => (
                    <EvidenceBlockView key={i} block={b} />
                  ))}
                </div>
              ) : task.is_completed ? (
                <p className="mt-2 text-xs text-gray-400">
                  (No evidence attached)
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </LtiShell>
  )
}
