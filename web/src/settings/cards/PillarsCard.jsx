import React, { useState } from 'react'
import { Squares2X2Icon } from '@heroicons/react/24/outline'
import api from '../../services/api'

/**
 * Optio's five pillars (STEM / Wellness / Communication / Civics / Art). On by
 * default. A school that already classifies work by school subject is asking
 * families to label the same task twice, so it can switch the pillars off:
 * every picker, badge and breakdown disappears and the diploma credit stands
 * alone. Nothing is deleted — the pillar is still recorded, derived from the
 * credit (backend/utils/school_subjects.py::pillar_for_subject) — so turning
 * it back on restores the full view. Hearthwood Academy asked for this after a
 * parent wrote in that the pillars were impossible to make sense of
 * (2026-08-25).
 *
 * Lifted out of the legacy SettingsTab into the settings registry at the
 * blocks/backbone merge (2026-09-03) so both surfaces carry it, rather than
 * being lost with the monolith it lived in.
 */
export default function PillarsCard({ orgId, org, onUpdate }) {
  const [hidePillars, setHidePillars] = useState(org?.feature_flags?.hide_pillars ?? false)
  const [saving, setSaving] = useState(false)

  const toggle = async () => {
    const newValue = !hidePillars
    setSaving(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: { ...(org?.feature_flags || {}), hide_pillars: newValue },
      })
      setHidePillars(newValue)
      onUpdate?.()
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update the pillars setting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-2">Pillars</h2>
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-optio-purple/10">
            <Squares2X2Icon className="w-5 h-5 text-optio-purple" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-gray-900">Hide the five pillars</span>
              <button
                onClick={toggle}
                disabled={saving}
                aria-label="Hide the five pillars"
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  hidePillars ? 'bg-optio-purple' : 'bg-gray-300'
                } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    hidePillars ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <p className="text-sm text-gray-500">
              Turns off STEM / Wellness / Communication / Civics / Art everywhere your
              families and students see them — the picker when they create a task, the
              badges on tasks and evidence, and the pillar chart on the profile. Tasks are
              then classified only by the diploma credit they count toward. Nothing is
              lost: pillars come back exactly as they were if you switch this off.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
