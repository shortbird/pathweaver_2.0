import React, { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import ChecklistAssignments from '../components/sis/ChecklistAssignments'
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
 * The list itself is ChecklistAssignments, the family portal's own, so a
 * signature collected here is the same record, with the same affirmation and
 * the same evidence, as one collected there. The hold is a routing decision
 * layered on top of the existing flow, not a second way to sign. (This page
 * carried its own copy of the list, with its own PATCH, until 2026-09-15.)
 */

const RequiredDocumentsPage = () => {
  const navigate = useNavigate()
  const { user, logout, isAuthenticated, loading: authLoading } = useAuth()
  const [state, setState] = useState({ loading: true, assignments: [], orgId: null })

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

  // After any change, re-ask the server rather than deciding locally that
  // this was the last one: the school may have added another while this page
  // was open. Dropping the cached gate answer lets PrivateRoute re-check too.
  const onChanged = () => {
    clearRequiredDocumentsGate()
    load()
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

        <ChecklistAssignments
          orgId={state.orgId}
          assignments={state.assignments}
          onChanged={onChanged}
        />

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
