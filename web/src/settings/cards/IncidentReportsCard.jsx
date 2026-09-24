import React, { useEffect, useState } from 'react'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import SearchSelect from '../../components/ui/SearchSelect'
import { patchSisSettings } from '../../hooks/api/useSisSettings'

/**
 * Who gets incident reports by default.
 *
 * Any staff member can file an incident report from the Tasks page or the
 * teacher home, and it lands as a task on one office person's list (ticket
 * a26d9daf, 2026-09-24). This sets who that is unless the reporter picks
 * someone else. With nobody set, the reporter has to choose each time.
 *
 * Stored as sis_settings.incident_report_recipient_id; the server refuses
 * anybody who is not an org admin or campus coordinator of this school.
 */
const KEY = 'incident_report_recipient_id'

export default function IncidentReportsCard({ orgId, org, onUpdate }) {
  const [recipients, setRecipients] = useState(null)
  const [value, setValue] = useState(org?.feature_flags?.sis_settings?.[KEY] || '')
  // A draft, saved by the button: the combobox clears its value on the first
  // keystroke of a search, and that must not clear the school's setting.
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!orgId) return undefined
    let cancelled = false
    api.get(withOrg('/api/sis/incident-reports/options?students=0', orgId))
      .then((r) => { if (!cancelled) setRecipients(r.data?.recipients || []) })
      .catch(() => { if (!cancelled) setRecipients([]) })
    return () => { cancelled = true }
  }, [orgId])

  const save = async (next) => {
    setSaving(true)
    setError('')
    try {
      await patchSisSettings(orgId, { sis_settings: { [KEY]: next || null } })
      setValue(next || '')
      setDraft(next || '')
      onUpdate?.()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not save that')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-2">Incident reports</h2>
      <p className="text-sm text-gray-600 mb-3">
        Any staff member can report an incident from Tasks or their home page. It arrives as a
        task for the person chosen here, unless the reporter picks someone else.
      </p>
      <span className="block text-xs font-medium text-gray-600 mb-1">Send incident reports to</span>
      {recipients === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="flex items-start gap-2 flex-wrap">
          <SearchSelect value={draft} onChange={setDraft} options={recipients} className="flex-1 min-w-[16rem]"
            getId={(p) => p.id}
            getLabel={(p) => ((p.role_labels || []).length ? `${p.name} (${p.role_labels.join(', ')})` : p.name)}
            placeholder="Nobody by default (the reporter chooses)"
            emptyLabel="Nobody by default (the reporter chooses)" />
          <button type="button" onClick={() => save(draft)} disabled={saving || draft === value}
            className="px-4 py-2 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}
