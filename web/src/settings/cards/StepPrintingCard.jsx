import React, { useState } from 'react'
import { PrinterIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'

/**
 * Step printing: schools with a kiosk receipt printer opt in to a "Print my
 * steps" button on the AI step breakdown (TaskStepsModal). Off by default.
 *
 * Extracted from the legacy SettingsTab (blocks P3, settings unification) so
 * SIS-console orgs get the control too — it only ever lived on the legacy tab.
 */
export default function StepPrintingCard({ orgId, org, onUpdate }) {
  const [stepPrinting, setStepPrinting] = useState(
    org?.feature_flags?.step_printing ?? false
  )
  const [saving, setSaving] = useState(false)

  const toggle = async () => {
    const newValue = !stepPrinting
    setSaving(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: { ...(org?.feature_flags || {}), step_printing: newValue },
      })
      setStepPrinting(newValue)
      onUpdate?.()
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update step printing setting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-2">Printing</h2>
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-optio-purple/10">
            <PrinterIcon className="w-5 h-5 text-optio-purple" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-gray-900">Print task steps</span>
              <button
                onClick={toggle}
                disabled={saving}
                role="switch"
                aria-checked={stepPrinting}
                aria-label="Print task steps"
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  stepPrinting ? 'bg-optio-purple' : 'bg-gray-300'
                } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  stepPrinting ? 'translate-x-4' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Adds a Print button to the AI step breakdown so students can print their
              checklist and carry it to a work station. Formatted for an 80mm receipt
              printer; works on any printer the device can reach.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
