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

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import LtiShell from '../../components/lti/LtiShell'

// Backend's standard error envelope wraps `error` as an object
// `{code, message, debug, request_id, timestamp}`. Older code paths return
// `{error: "string"}`. Pull a renderable string out of either shape.
function extractErrorMessage(err, fallback) {
  const raw = err?.response?.data?.error
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') return raw.message || JSON.stringify(raw)
  return err?.message || fallback
}

export default function LtiDeepLinkPage() {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')

  const [context, setContext] = useState(null)
  const [contextError, setContextError] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  // XP target for credit. Optional — empty string means "no threshold".
  // Backend stores null in that case; the LtiQuestPage hides the progress
  // bar and the Submit button is enabled as soon as ≥1 task is complete.
  const [xpThreshold, setXpThreshold] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  // StrictMode guard — the GET is idempotent but it's good hygiene.
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!code) {
      setContextError('Missing launch code.')
      return
    }
    if (fetchedRef.current) return
    fetchedRef.current = true
    ;(async () => {
      try {
        const { data } = await api.get('/lti/deep-link/context', { params: { code } })
        setContext(data)
      } catch (e) {
        setContextError(extractErrorMessage(e, 'Could not load deep link context'))
      }
    })()
  }, [code])

  async function onSubmit(e) {
    e.preventDefault()
    setSubmitError(null)
    if (!title.trim()) {
      setSubmitError('Give the quest a title.')
      return
    }
    setSubmitting(true)
    try {
      const { data } = await api.post('/lti/deep-link/submit', {
        code,
        title: title.trim(),
        description: description.trim(),
        // Send only when set; empty string sends nothing so backend treats
        // it as "no threshold" (legacy behavior).
        ...(xpThreshold !== '' ? { xp_threshold: parseInt(xpThreshold, 10) } : {}),
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
      setSubmitError(extractErrorMessage(e, 'Failed to create quest'))
      setSubmitting(false)
    }
  }

  if (contextError) return <LtiShell error={contextError} />
  if (!context) return <LtiShell loading />

  return (
    <LtiShell
      title="Add an Optio Quest"
      subtitle="Give it a title and a short prompt. Each student will see an AI wizard inside Canvas that helps them invent their own approach."
      maxWidthClassName="max-w-xl"
    >
      <div className="bg-white rounded-xl shadow-md p-6">
        <form onSubmit={onSubmit} className="space-y-4">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              XP target (optional)
            </label>
            <input
              type="number"
              min="0"
              step="50"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-optio-purple"
              placeholder="e.g. 500"
              value={xpThreshold}
              onChange={(e) => setXpThreshold(e.target.value.replace(/[^0-9]/g, ''))}
            />
            <p className="mt-1 text-xs text-gray-500">
              Students must earn at least this many XP from their tasks before
              they can submit for grading. Leave blank to allow submission as
              soon as the student finishes one task.
            </p>
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
    </LtiShell>
  )
}
