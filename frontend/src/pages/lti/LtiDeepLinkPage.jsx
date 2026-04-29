/**
 * Deep Linking 2.0 teacher form (v1).
 *
 * Reached after /lti/launch resolved an LtiDeepLinkingRequest and the
 * iframe exchanged its auth code. The teacher provides a title and
 * optional description; we POST it to the backend, which creates a blank
 * "personalize-your-own" Optio quest and signs an LtiDeepLinkingResponse
 * JWT. We auto-submit that JWT to Canvas's deep_link_return_url via a
 * hidden form — Canvas creates the assignment and closes the modal.
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../services/api'

export default function LtiDeepLinkPage() {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')

  const [context, setContext] = useState(null)
  const [contextError, setContextError] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  useEffect(() => {
    if (!code) {
      setContextError('Missing launch code.')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.get('/lti/deep-link/context', { params: { code } })
        if (!cancelled) setContext(data)
      } catch (e) {
        if (!cancelled) {
          setContextError(
            e?.response?.data?.error || e?.message || 'Could not load deep link context',
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code])

  async function onSubmit(e) {
    e.preventDefault()
    setSubmitError(null)
    if (!title.trim()) {
      setSubmitError('Give the assignment a title.')
      return
    }
    setSubmitting(true)
    try {
      const { data } = await api.post('/lti/deep-link/submit', {
        code,
        title: title.trim(),
        description: description.trim(),
      })

      // Auto-submit a real HTML form so the browser navigates to Canvas's
      // deep_link_return_url with the JWT in a POST body. Canvas reads the
      // JWT, creates the assignment, and closes the modal.
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = data.deep_link_return_url
      form.style.display = 'none'

      const jwtInput = document.createElement('input')
      jwtInput.type = 'hidden'
      jwtInput.name = 'JWT'
      jwtInput.value = data.jwt
      form.appendChild(jwtInput)

      document.body.appendChild(form)
      form.submit()
    } catch (e) {
      setSubmitError(e?.response?.data?.error || e?.message || 'Failed to create assignment')
      setSubmitting(false)
    }
  }

  if (contextError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-red-600">{contextError}</p>
      </div>
    )
  }
  if (!context) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-start justify-center px-6 py-10">
      <div className="w-full max-w-xl bg-white rounded-xl shadow-md p-8">
        <h1 className="text-2xl font-semibold text-gray-900">Add an Optio assignment</h1>
        <p className="mt-2 text-sm text-gray-600">
          Give it a title and a short prompt. Each student will see an AI
          wizard inside Canvas that helps them invent their own approach.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-optio-purple"
              placeholder="e.g. Design a sustainable city block"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <textarea
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-optio-purple"
              rows={4}
              placeholder="What you want students to grapple with..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {submitError && <p className="text-sm text-red-600">{submitError}</p>}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Add to Canvas'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
