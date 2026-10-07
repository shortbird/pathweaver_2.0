import React, { useState } from 'react'
import { BoltIcon } from '@heroicons/react/24/outline'
import { patchSisSettings } from '../../hooks/api/useSisSettings'

/**
 * The smallest XP one of this school's tasks may be worth. Optio's default is
 * 25; a school may lower it to anything from 1 (ticket a6f7b429, Jon England,
 * Horizon: "When we save a task, the XP minimum goes back to 25 and overrides
 * the custom XP we set for that task... Students are now seeing odd totals
 * like 100/65"). Owner decision on that ticket: organizations can override
 * the XP floor if they want.
 *
 * Stored at feature_flags.sis_settings.min_task_xp through the one settings
 * PATCH; the server refuses anything outside 1..25 (org_settings_service) and
 * every save path for a school's tasks reads it (backend/utils/org_task_xp.py).
 * Clearing the box goes back to 25.
 */
export const TASK_XP_FLOOR_DEFAULT = 25

export default function TaskXpFloorCard({ orgId, org, onUpdate }) {
  const stored = org?.feature_flags?.sis_settings?.min_task_xp
  const [value, setValue] = useState(stored == null ? String(TASK_XP_FLOOR_DEFAULT) : String(stored))
  const [saved, setSaved] = useState(stored == null ? TASK_XP_FLOOR_DEFAULT : stored)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    const n = Number(value)
    if (!Number.isInteger(n) || n < 1 || n > TASK_XP_FLOOR_DEFAULT) {
      setError(`Enter a whole number from 1 to ${TASK_XP_FLOOR_DEFAULT}.`)
      return
    }
    setError('')
    setSaving(true)
    try {
      // 25 is stored as "no setting", so the org reads as Optio's default and
      // follows it if it ever changes.
      await patchSisSettings(orgId, {
        sis_settings: { min_task_xp: n === TASK_XP_FLOOR_DEFAULT ? null : n },
      })
      setSaved(n)
      onUpdate?.()
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not save the smallest XP for a task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-2">Task XP</h2>
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-optio-purple/10">
            <BoltIcon className="w-5 h-5 text-optio-purple" />
          </div>
          <div className="flex-1">
            <label htmlFor="task-xp-floor" className="font-medium text-gray-900">
              Smallest XP for a task
            </label>
            <p className="text-sm text-gray-500 mb-3">
              Tasks can&apos;t be worth less than this. Optio&apos;s default is 25.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input id="task-xp-floor" type="number" min={1} max={TASK_XP_FLOOR_DEFAULT} step={1}
                value={value} onChange={(e) => setValue(e.target.value)}
                className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              <span className="text-sm text-gray-500">XP</span>
              <button type="button" onClick={save}
                disabled={saving || String(saved) === value}
                className="px-3 py-1.5 rounded-lg bg-optio-purple text-white text-sm font-semibold disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
