import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import ModalOverlay from '../../ui/ModalOverlay'
import { withOrg } from '../../../pages/sis/useSisOrg'

/**
 * Assign a checklist to people.
 *
 * This used to live inline at the bottom of the template manager, which put a
 * weekly action underneath a rare one (authoring templates) and above the daily
 * one (tracking progress). It is a dialog now so the Task Center header can
 * offer it alongside the other two ways of asking somebody to do something, and
 * so the Checklists tab can lead with the work that needs attention instead.
 *
 * Recipients follow the selected template's audience: a staff template lists
 * staff, a family template lists the org's guardians. Picking the template first
 * is what makes that unambiguous, so the list stays hidden until one is chosen.
 */

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent'

export default function AssignChecklistModal({ orgId, onClose, onAssigned, templateId = '' }) {
  const [templates, setTemplates] = useState([])
  const [assignTemplate, setAssignTemplate] = useState(templateId)
  const [recipients, setRecipients] = useState([])
  const [userIds, setUserIds] = useState([])
  const [q, setQ] = useState('')
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    if (!orgId) return
    api.get(withOrg('/api/sis/staff-admin/onboarding/templates', orgId))
      .then((r) => setTemplates(r.data?.templates || []))
      .catch(() => setTemplates([]))
  }, [orgId])

  const selected = templates.find((t) => t.id === assignTemplate)
  const audience = selected?.audience === 'family' ? 'family' : 'staff'

  useEffect(() => {
    setUserIds([])
    if (!orgId || !assignTemplate) { setRecipients([]); return }
    api.get(withOrg(`/api/sis/staff-admin/onboarding/recipients?audience=${audience}`, orgId))
      .then((r) => setRecipients(r.data?.recipients || []))
      .catch(() => setRecipients([]))
  }, [orgId, assignTemplate, audience])

  const toggle = (id) => setUserIds((prev) => (
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  ))
  const allSelected = recipients.length > 0 && userIds.length === recipients.length
  const shown = q.trim()
    ? recipients.filter((r) => (r.name || '').toLowerCase().includes(q.trim().toLowerCase()))
    : recipients

  const assign = async () => {
    if (!assignTemplate || !userIds.length) { toast.error('Pick a template and at least one recipient'); return }
    setAssigning(true)
    try {
      const r = await api.post('/api/sis/staff-admin/onboarding/assignments', {
        organization_id: orgId, template_id: assignTemplate, user_ids: userIds,
      })
      const n = r.data?.assigned ?? userIds.length
      toast.success(`Assigned to ${n} ${audience === 'family' ? 'famil' + (n === 1 ? 'y' : 'ies') : 'staff'}`)
      onAssigned?.()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not assign')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4"
        role="dialog" aria-modal="true" aria-label="Assign a checklist">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Assign a checklist</h2>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-800">Close</button>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-neutral-500 mb-1">Checklist</span>
          <select value={assignTemplate} onChange={(e) => setAssignTemplate(e.target.value)}
            className={inputClass} aria-label="Checklist">
            <option value="">Choose a checklist…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.audience === 'family' ? 'family' : 'staff'})
              </option>
            ))}
          </select>
          {selected?.description && (
            <p className="text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-gray-200 mt-2 whitespace-pre-line">
              <span className="font-medium text-neutral-700 block mb-0.5">Directions:</span>
              {selected.description}
            </p>
          )}
        </label>

        {assignTemplate && (
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {audience === 'family' ? 'Assign to families' : 'Assign to staff'}
              </span>
              {recipients.length > 0 && (
                <button onClick={() => setUserIds(allSelected ? [] : recipients.map((r) => r.id))}
                  className="text-xs text-optio-purple hover:underline">
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>
            {recipients.length === 0 ? (
              <p className="text-sm text-neutral-400">No {audience === 'family' ? 'families' : 'staff'} to assign to yet.</p>
            ) : (
              <>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name"
                  className={`${inputClass} mb-2`} aria-label="Search recipients" />
                <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
                  {shown.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={userIds.includes(r.id)} onChange={() => toggle(r.id)}
                        className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                      <span className="text-neutral-800">{r.name}</span>
                    </label>
                  ))}
                  {!shown.length && <p className="text-sm text-neutral-400 py-2">No match.</p>}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-neutral-500">{userIds.length} selected</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">Cancel</button>
            <button onClick={assign} disabled={assigning || !userIds.length}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
              {assigning ? 'Assigning…' : 'Assign checklist'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
