import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useMutation } from '@tanstack/react-query'

import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import { isStaffUser } from '../../utils/userRoles'
import { getAppSurface } from '../../utils/appSurface'
import { setReporterPanelOpen } from './reporterOpen'

/**
 * The staff issue reporter: the button in the corner that files a ticket.
 *
 * It replaced the Perch widget on 2026-09-14. Perch (perch.shortbird.dev) was
 * a separate app with its own database; a report filed there was invisible to
 * the admin console and to anyone reading this repository's data. This posts
 * to /api/bug-reports -- the same table the mobile app's shake sheet writes to
 * -- and the ticket shows up in /admin/tickets.
 *
 * Audience is the same as the widget's was: school staff (teachers, org
 * admins, campus coordinators) and superadmin. Families and students never
 * see it. The rule is isStaffUser, the one definition; the tests hold the
 * teacher and coordinator cases because those are the ones that get lost.
 *
 * Nothing is sent to the reporter afterwards. Tracking only, by decision.
 */
const TYPES = {
  bug: { label: 'Something is broken', heading: 'Report a bug', placeholder: 'What happened? What did you expect instead?' },
  feature: { label: 'Suggest an improvement', heading: 'Suggest an improvement', placeholder: 'What would make this more useful for your school?' },
  question: { label: 'I have a question', heading: 'Ask a question', placeholder: 'Which page are you on, and what is unclear?' },
}

const TITLE_MAX = 120

export default function IssueReporter() {
  const { user } = useAuth()
  const { organization } = useOrganization()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(null)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const file = useMutation({
    mutationFn: (body) => api.post('/api/bug-reports', body),
  })

  // Tell any open modal to let go of focus while the panel is up; see
  // ./reporterOpen. Cleared on unmount too, or a modal would stay unpaused
  // after a route change closed the reporter with it.
  useEffect(() => {
    setReporterPanelOpen(open)
    return () => setReporterPanelOpen(false)
  }, [open])

  if (!isStaffUser(user)) return null

  // Bottom-right corner, on both surfaces (owner's call, 2026-09-14). The
  // first cut stacked it above the web platform's capture button on the
  // learning surface, and that read as floating mid-screen. The capture
  // button only mounts on the student dashboard and the learning journal
  // (DashboardPage, LearningJournalPage), which staff rarely have open, so the
  // corner is effectively free for this audience.
  const buttonPosition = 'bottom-4 right-4'
  const panelPosition = 'bottom-20 right-4'

  const reset = () => { setOpen(false); setType(null); setTitle(''); setMessage('') }

  const submit = async () => {
    if (!message.trim()) { toast.error('Please add a short description'); return }
    const surface = getAppSurface()
    try {
      await file.mutateAsync({
        title: title.trim().slice(0, TITLE_MAX) || undefined,
        message: message.trim(),
        type,
        source: 'web',
        current_route: window.location.pathname + window.location.search,
        platform: surface === 'sis' ? 'web-sis' : 'web',
        app_version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
        extra: {
          surface,
          url: window.location.href,
          user_agent: navigator.userAgent,
          viewport: { w: window.innerWidth, h: window.innerHeight },
          language: navigator.language,
          referrer: document.referrer || null,
          organization_slug: organization?.slug || null,
          organization_name: organization?.name || null,
        },
      })
      toast.success('Thank you. Your report is in.')
      reset()
    } catch {
      toast.error('Could not send the report. Please try again.')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Report an issue"
        title="Report an issue"
        className={`fixed ${buttonPosition} z-[10000] flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5`}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>

      {open && (
        <>
          {/* The backdrop is a button, not a clickable div, so it is reachable
              by keyboard and counted by nothing (a11y.test.jsx). Escape on the
              panel closes it too. */}
          <button
            type="button"
            aria-label="Close the report panel"
            className="fixed inset-0 z-[10001] cursor-default bg-transparent"
            onClick={reset}
          />
          <div
            role="dialog"
            aria-label="Report an issue"
            className={`fixed ${panelPosition} z-[10002] w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4`}
            onKeyDown={(e) => { if (e.key === 'Escape') reset() }}
          >
            {!type ? (
              <>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Report an issue</h3>
                <p className="text-sm text-gray-500 mb-3">What would you like to tell us?</p>
                <div className="space-y-2">
                  {Object.entries(TYPES).map(([key, t]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setType(key)}
                      className="w-full text-left rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-800 transition-all duration-200 hover:border-optio-purple hover:bg-optio-purple/5"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <button type="button" onClick={() => setType(null)} className="text-gray-400 hover:text-gray-700" aria-label="Back">
                    &larr;
                  </button>
                  <h3 className="text-sm font-semibold text-gray-900">{TYPES[type].heading}</h3>
                </div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={TITLE_MAX}
                  placeholder="Short title (optional)"
                  aria-label="Title"
                  className="input-field px-3 py-2 text-sm w-full mb-2"
                />
                <textarea
                  autoFocus
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder={TYPES[type].placeholder}
                  aria-label="Description"
                  className="input-field px-3 py-2 text-sm w-full mb-1"
                />
                <p className="text-xs text-gray-400 mb-3">
                  We also record the page you are on and basic technical details.
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={reset} className="btn-ghost">Cancel</button>
                  <button type="button" onClick={submit} disabled={file.isPending} className="btn-primary">
                    {file.isPending ? 'Sending' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
