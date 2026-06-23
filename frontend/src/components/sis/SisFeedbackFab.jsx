import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useOrganization } from '../../contexts/OrganizationContext'

/**
 * Beta feedback FAB for the SIS console (iCreate pilot).
 *
 * Three intents — report a bug, suggest a feature idea, or "I don't understand
 * what this is for." All post to the existing /api/bug-reports endpoint, which
 * stores the row AND forwards to Sentry (optio-backend) with full web context
 * (route, org, user agent, viewport) tagged by report_type, so triage can tell a
 * crash from an idea from a confusion.
 */
const TYPES = {
  bug: {
    label: 'Report a bug',
    emoji: '🐞',
    heading: 'Report a bug',
    placeholder: 'What happened? What did you expect to happen instead?',
  },
  idea: {
    label: 'Suggest an idea',
    emoji: '💡',
    heading: 'Suggest a feature or improvement',
    placeholder: 'What would make this more useful for your school?',
  },
  confusion: {
    label: "I don't understand this",
    emoji: '🤔',
    heading: "Tell us what's unclear",
    placeholder: "Which page are you on, and what's confusing or unclear about it?",
  },
}

const SisFeedbackFab = () => {
  const { organization } = useOrganization()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(null)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reset = () => { setOpen(false); setType(null); setMessage('') }

  const submit = async () => {
    if (!message.trim()) { toast.error('Please add a short description'); return }
    setSubmitting(true)
    try {
      await api.post('/api/bug-reports', {
        message: `[${TYPES[type].label}] ${message.trim()}`,
        current_route: window.location.pathname + window.location.search,
        platform: 'web-sis',
        extra: {
          report_type: type,
          surface: 'sis',
          url: window.location.href,
          user_agent: navigator.userAgent,
          viewport: { w: window.innerWidth, h: window.innerHeight },
          language: navigator.language,
          referrer: document.referrer || null,
          organization_id: organization?.id || null,
          organization_name: organization?.name || null,
        },
      })
      toast.success('Thanks — your feedback was sent')
      reset()
    } catch {
      toast.error('Could not send feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Send beta feedback"
        className="fixed bottom-6 right-6 z-[90] flex items-center gap-2 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink text-white shadow-lg px-5 py-3 font-semibold hover:opacity-90 transition"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-[91]" onClick={reset}>
          <div
            className="absolute bottom-24 right-6 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {!type ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-neutral-900">Beta feedback</h3>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-optio-purple bg-optio-purple/10 rounded-full px-2 py-0.5">Beta</span>
                </div>
                <p className="text-sm text-neutral-500 mb-3">What would you like to tell us?</p>
                <div className="space-y-2">
                  {Object.entries(TYPES).map(([key, t]) => (
                    <button
                      key={key}
                      onClick={() => setType(key)}
                      className="w-full flex items-center gap-3 text-left rounded-xl border border-gray-200 px-3 py-2.5 hover:border-optio-purple hover:bg-[#F3EFF4] transition"
                    >
                      <span className="text-xl">{t.emoji}</span>
                      <span className="text-sm font-medium text-neutral-800">{t.label}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => setType(null)} className="text-neutral-400 hover:text-neutral-700">←</button>
                  <h3 className="font-semibold text-neutral-900">{TYPES[type].emoji} {TYPES[type].heading}</h3>
                </div>
                <textarea
                  autoFocus
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder={TYPES[type].placeholder}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple mb-1"
                />
                <p className="text-[11px] text-neutral-400 mb-3">
                  We also capture the page you're on and basic technical details to help us fix it.
                </p>
                <div className="flex justify-end gap-2">
                  <button onClick={reset} className="px-3 py-2 text-sm text-neutral-600 hover:text-neutral-900">Cancel</button>
                  <button
                    onClick={submit}
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 disabled:opacity-50"
                  >
                    {submitting ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default SisFeedbackFab
