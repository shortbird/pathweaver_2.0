import React, { useState } from 'react'
import { InboxArrowDownIcon } from '@heroicons/react/24/outline'
import { patchSisSettings } from '../../hooks/api/useSisSettings'

/**
 * "Skip work Bloomy already verified" (feature_flags.sis_settings.skip_bloomy_in_inbox).
 *
 * Ticket bc68a12e, Apogee Cache Valley's org admin: "Bloomy submissions are
 * the only ones that I'd prefer not to review." Bloomy marks a skill mastered
 * only after its own assessment, and the sync stamps the completion verified
 * by Bloomy, so a school may leave that work out of the Submissions inbox.
 * Off for every school until it turns it on. The backend reads only a stored
 * true (routes/sis/submissions.py, _skips_bloomy).
 *
 * Shown only where the bloomy module is on (settingsRegistry).
 */
export const SKIP_BLOOMY_KEY = 'skip_bloomy_in_inbox'

export default function BloomyInboxCard({ orgId, org, onUpdate }) {
  const [skip, setSkip] = useState(org?.feature_flags?.sis_settings?.[SKIP_BLOOMY_KEY] === true)
  const [saving, setSaving] = useState(false)

  const toggle = async () => {
    const next = !skip
    setSaving(true)
    try {
      await patchSisSettings(orgId, { sis_settings: { [SKIP_BLOOMY_KEY]: next } })
      setSkip(next)
      onUpdate?.()
    } catch (error) {
      alert(error.response?.data?.error || 'Could not save the Bloomy setting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-2">Bloomy</h2>
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-optio-purple/10">
            <InboxArrowDownIcon className="w-5 h-5 text-optio-purple" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="font-medium text-gray-900">Skip work Bloomy already verified</span>
              <button
                onClick={toggle}
                disabled={saving}
                role="switch"
                aria-checked={skip}
                aria-label="Skip work Bloomy already verified"
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                  skip ? 'bg-optio-purple' : 'bg-gray-300'
                } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  skip ? 'translate-x-4' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              When on, Bloomy lessons your students mastered stay out of the Submissions inbox.
              Bloomy already checked that work, so there is nothing for a teacher to review.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
