import React, { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import ChecklistSignature from '../components/sis/ChecklistSignature'
import { clearRequiredDocumentsGate } from '../hooks/useRequiredDocumentsGate'

/**
 * The one screen a family sees while required school paperwork is unsigned.
 *
 * Deliberately standalone — no sidebar, no navigation, nothing to click except
 * the documents and the signature box. A held account that still renders the
 * app chrome invites the family to try every link in it and meet a 403 behind
 * each one; showing them the single thing that lifts the hold is both more
 * honest and faster to get through.
 *
 * Signing reuses ChecklistSignature, so a signature collected here is the same
 * record, with the same affirmation and the same evidence, as one collected in
 * the family portal. The hold is a routing decision layered on top of the
 * existing signature flow, not a second way to sign.
 */

const RequiredDocumentsPage = () => {
  const navigate = useNavigate()
  const { user, logout, isAuthenticated, loading: authLoading } = useAuth()
  const [state, setState] = useState({ loading: true, assignments: [], orgId: null })
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.get('/api/sis/parent/required-documents')
      .then((r) => {
        if (!r.data?.blocked) {
          // Nothing outstanding: they either finished or the school released
          // the hold. Drop the cached gate answer so PrivateRoute stops
          // redirecting, and send them on.
          clearRequiredDocumentsGate()
          navigate('/dashboard', { replace: true })
          return
        }
        setState({
          loading: false,
          assignments: r.data.assignments || [],
          orgId: r.data.organization_id || null,
        })
      })
      .catch(() => setState((s) => ({ ...s, loading: false })))
  }, [navigate])

  useEffect(() => {
    // Standalone route (like /enroll/resume): it is not behind PrivateRoute, so
    // it does its own auth check rather than asking the API and rendering an
    // empty page when the answer is 401.
    if (!authLoading && isAuthenticated) load()
  }, [load, authLoading, isAuthenticated])

  const sign = async (assignmentId, itemKey, fields) => {
    if (!state.orgId) return
    setBusy(true)
    try {
      await api.patch(
        `/api/sis/parent/onboarding/${assignmentId}/items/${itemKey}?organization_id=${state.orgId}`,
        fields,
      )
      toast.success('Signed')
      // Re-ask the server rather than deciding locally that this was the last
      // one: the school may have added another while this page was open.
      clearRequiredDocumentsGate()
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not record your signature')
    } finally {
      setBusy(false)
    }
  }

  const openDoc = async (doc) => {
    if (!state.orgId) return
    try {
      const r = await api.get(
        `/api/sis/parent/my-documents/${doc.id}/url?organization_id=${state.orgId}`)
      if (r.data?.url) window.open(r.data.url, '_blank', 'noopener')
      else toast.error('Could not open that document')
    } catch {
      toast.error('Could not open that document')
    }
  }

  if (!authLoading && !isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (authLoading || state.loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-neutral-900">
            Your school needs a signature
          </h1>
          <p className="mt-2 text-neutral-600">
            {state.assignments.length === 1
              ? 'There is one document waiting for you.'
              : `There are ${state.assignments.length} documents waiting for you.`}
            {' '}Sign below and the rest of Optio opens back up.
          </p>
        </div>

        <div className="space-y-4">
          {state.assignments.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-neutral-900">
                {a.template_name || 'Document'}
              </h2>
              <div className="mt-3 space-y-4">
                {(a.items || []).map((item) => (
                  <div key={item.key}>
                    <p className="text-sm font-medium text-neutral-800">{item.title}</p>
                    {item.description && (
                      <p className="text-sm text-neutral-600 mt-0.5">{item.description}</p>
                    )}
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noopener noreferrer"
                        className="inline-block mt-1 text-sm text-optio-purple hover:underline">
                        Open the form
                      </a>
                    )}
                    {item.needs_signature ? (
                      <ChecklistSignature
                        item={item}
                        statement={a.signature_statement}
                        busy={busy}
                        onSign={(fields) => sign(a.id, item.key, fields)}
                        onOpenDoc={openDoc}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={busy || item.status === 'complete' || item.status === 'approved'}
                        onClick={() => sign(a.id, item.key, { status: 'complete' })}
                        className="mt-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50 disabled:opacity-50">
                        {item.status === 'complete' || item.status === 'approved'
                          ? 'Done' : 'Mark as done'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* The way out for a family who genuinely cannot sign. Nobody should be
            stuck on a screen whose only escape is the one action they can't
            take — the office can lift the hold from the Sent-paperwork page. */}
        <p className="mt-8 text-center text-sm text-neutral-500">
          Can&rsquo;t sign this? Contact your school&rsquo;s office and they can release it for you.
        </p>
        <p className="mt-3 text-center">
          <button onClick={logout} className="text-sm text-neutral-500 hover:text-neutral-800 underline">
            Sign out{user?.email ? ` (${user.email})` : ''}
          </button>
        </p>
      </div>
    </div>
  )
}

export default RequiredDocumentsPage
