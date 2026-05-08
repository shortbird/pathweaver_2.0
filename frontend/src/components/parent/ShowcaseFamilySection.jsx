import React, { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { fetchStudentPosts, parentRevokeConsent } from '../../services/showcaseService'

/**
 * Family-dashboard "Optio Showcase" section.
 *
 * Renders one collapsible block per dependent/linked-student. Shows:
 *   - Current consent state
 *   - List of posts featuring that student (clickable to live URL)
 *   - "Revoke consent" button (asymmetric: parent can revoke, but re-enabling requires admin)
 */
const StudentShowcaseBlock = ({ student }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchStudentPosts(student.id)
      setData(r)
    } catch (e) {
      // 403 means we don't have parent access for this student — quietly hide the block
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [student.id])

  useEffect(() => {
    load()
  }, [load])

  const handleRevoke = async () => {
    const reason = window.prompt(
      `Revoke ${student.first_name || student.display_name || 'this student'}'s showcase consent?\n\n` +
      `This is a one-way action. Their work will be removed from the marketing queue ` +
      `and any existing posts will be flagged for take-down. To re-enable, contact Optio support.\n\n` +
      `Optional: tell us why (this is for our records).`
    )
    if (reason === null) return

    setBusy(true)
    try {
      await parentRevokeConsent(student.id, reason || 'parent revoked')
      toast.success('Consent revoked. Optio has been notified.')
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to revoke')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 border-t border-gray-100 text-sm text-gray-500">
        Loading {student.first_name || student.display_name}…
      </div>
    )
  }
  if (!data) return null  // hidden (403 etc.)

  const consent = data.consent
  const active = data.consent_active
  const studentName = student.first_name || student.display_name || 'Student'
  const posts = data.posts || []

  return (
    <div className="p-4 border-t border-gray-100">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium text-gray-900">{studentName}</div>
          {!consent ? (
            <div className="text-xs text-gray-500 mt-1">
              Not currently part of the Optio Showcase. Contact Optio if you'd like to opt in.
            </div>
          ) : active ? (
            <div className="text-xs text-green-700 mt-1">
              Showcase consent active. Featured {posts.length} time{posts.length === 1 ? '' : 's'}.
            </div>
          ) : (
            <div className="text-xs text-red-700 mt-1">
              Showcase consent has been revoked.
            </div>
          )}
        </div>
        {active && (
          <button
            onClick={handleRevoke}
            disabled={busy}
            className="flex-shrink-0 px-3 py-1.5 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {busy ? 'Revoking…' : 'Revoke consent'}
          </button>
        )}
      </div>

      {posts.length > 0 && (
        <div className="mt-3 space-y-1">
          {posts.map((p) => (
            <a
              key={p.id}
              href={p.post_url}
              target="_blank"
              rel="noreferrer"
              className={`block p-2 border rounded text-sm flex items-center gap-2 hover:bg-gray-50 ${
                p.take_down_required && !p.take_down_at ? 'border-red-200 bg-red-50' : 'border-gray-200'
              }`}
            >
              <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 capitalize">{p.platform}</span>
              <span className="flex-1 truncate text-optio-purple">{p.post_url}</span>
              <span className="text-xs text-gray-400">{new Date(p.posted_at).toLocaleDateString()}</span>
              {p.take_down_required && !p.take_down_at && (
                <span className="text-xs text-red-600 font-medium">Pending removal</span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

const ShowcaseFamilySection = ({ students = [] }) => {
  if (!students || students.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="p-4 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-900">Optio Showcase</h2>
        <p className="text-xs text-gray-600 mt-1">
          See where your child's work has been featured on Optio's social media.
          You can revoke consent at any time.
        </p>
      </div>
      <div>
        {students.map((s) => (
          <StudentShowcaseBlock key={s.id} student={s} />
        ))}
      </div>
    </div>
  )
}

export default ShowcaseFamilySection
