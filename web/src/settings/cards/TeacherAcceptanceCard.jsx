import React, { useState } from 'react'
import { CheckBadgeIcon } from '@heroicons/react/24/outline'
import { patchSisSettings } from '../../hooks/api/useSisSettings'

/**
 * "Teachers accept work first" (feature_flags.sis_settings.require_teacher_acceptance).
 *
 * Ticket 536a3018, Jackie Hill (Arete Academy org admin): "Can you also make
 * it so the evidence submissions are not on their portfolios until I approve
 * it? And also have the xp not be awarded until it's approved?" With it on, a
 * finished task's XP waits, and the work stays off the student's portfolio,
 * until a teacher accepts it in Submissions. Off for every school until it
 * turns it on. The backend reads only a stored true
 * (services/teacher_acceptance.py).
 *
 * Shown only where the submissions module is on (settingsRegistry): the
 * accept happens there, and the backend holds nothing without it.
 */
export const REQUIRE_ACCEPTANCE_KEY = 'require_teacher_acceptance'

export default function TeacherAcceptanceCard({ orgId, org, onUpdate }) {
  const [on, setOn] = useState(org?.feature_flags?.sis_settings?.[REQUIRE_ACCEPTANCE_KEY] === true)
  const [saving, setSaving] = useState(false)

  const toggle = async () => {
    const next = !on
    setSaving(true)
    try {
      await patchSisSettings(orgId, { sis_settings: { [REQUIRE_ACCEPTANCE_KEY]: next } })
      setOn(next)
      onUpdate?.()
    } catch (error) {
      alert(error.response?.data?.error || 'Could not save the setting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-2">Submissions</h2>
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-optio-purple/10">
            <CheckBadgeIcon className="w-5 h-5 text-optio-purple" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="font-medium text-gray-900">Teachers accept work first</span>
              <button
                onClick={toggle}
                disabled={saving}
                role="switch"
                aria-checked={on}
                aria-label="Teachers accept work first"
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                  on ? 'bg-optio-purple' : 'bg-gray-300'
                } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  on ? 'translate-x-4' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Students get XP for a task, and the work appears on their portfolio, only after a
              teacher accepts it in Submissions. Work already accepted or completed before you
              turn this on is not affected.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
