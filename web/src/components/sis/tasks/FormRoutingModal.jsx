import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import { withOrg } from '../../../pages/sis/useSisOrg'
import ModalOverlay from '../../ui/ModalOverlay'

/**
 * Where forms go — one default assignee per form type.
 *
 * iCreate, 2026-08-21: "Can we set up the forms so that they automatically go
 * to the appropriate person? For example, substitute requests from the teachers
 * could just be set up to go right to Julia. Otherwise they come to us first?"
 *
 * A form filed against a type with a rule arrives already assigned and the
 * assignee is notified, exactly as if a person had assigned it. It still lands
 * in the office queue — routing decides who owns it, not who can see it. Anyone
 * filing a task WITH an assignee still wins over the rule, and any submission
 * can be reassigned afterwards from the queue.
 *
 * The rules are org configuration (feature_flags.sis_settings.form_routing),
 * not a table: sixteen staff types and four family ones, one row each.
 */
const FormRoutingModal = ({ orgId, staff = [], onClose }) => {
  const [formTypes, setFormTypes] = useState({})
  const [rules, setRules] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    if (!orgId) return
    setLoading(true)
    api.get(withOrg('/api/sis/staff-admin/form-routing', orgId))
      .then((r) => {
        setFormTypes(r.data?.form_types || {})
        setRules(r.data?.routing || {})
      })
      .catch(() => toast.error('Could not load the routing rules'))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/api/sis/staff-admin/form-routing', {
        organization_id: orgId, routing: rules,
      })
      toast.success('Saved — new forms will go straight there')
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the routing rules')
    } finally {
      setSaving(false)
    }
  }

  const routed = Object.values(rules).filter(Boolean).length

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4"
        role="dialog" aria-modal="true" aria-label="Where forms go">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Where forms go</h2>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-800">Close</button>
        </div>
        <p className="text-sm text-neutral-500">
          Send a kind of form straight to the person who deals with it. Anything left on
          <span className="font-medium text-neutral-700"> the office </span>
          comes to the queue first, as it does today. Either way it stays in the queue and
          can be reassigned.
        </p>

        {loading ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : (
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {Object.entries(formTypes).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-neutral-800">{label}</span>
                <select
                  aria-label={`Who receives ${label}`}
                  value={rules[key] || ''}
                  onChange={(e) => setRules((p) => ({ ...p, [key]: e.target.value }))}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm max-w-[16rem]"
                >
                  <option value="">The office</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-neutral-500">
            {routed ? `${routed} ${routed === 1 ? 'form goes' : 'forms go'} straight to someone.`
              : 'Everything comes to the office first.'}
          </span>
          <button onClick={save} disabled={saving || loading}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default FormRoutingModal
