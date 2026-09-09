/**
 * Extracted from sis/BillingPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import Button from '../../../components/ui/Button'
import SearchSelect from '../../../components/ui/SearchSelect'
import api from '../../../services/api'
import { toast } from 'react-hot-toast'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import field from './field'
import Modal from './Modal'

const AddChargeModal = ({ orgId, households, onClose, onSaved }) => {
  const [householdId, setHouseholdId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [description, setDescription] = useState('')
  // Defaults to a plain fee. Naming it here is what lets the charge-detail
  // report answer "was that $50 a supply fee or a registration fee?" later.
  const [kind, setKind] = useState('fee')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const students = useMemo(() => {
    const hh = households.find((h) => h.id === householdId)
    return (hh?.members || []).filter((m) => m.relationship === 'student')
  }, [households, householdId])

  const submit = async () => {
    if (!householdId) { toast.error('Pick a family'); return }
    if (!description.trim()) { toast.error('Description required'); return }
    const amount_cents = Math.round(parseFloat(amount) * 100)
    if (!amount_cents || amount_cents <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      await api.post('/api/sis/billing/charges', {
        organization_id: orgId,
        household_id: householdId,
        student_user_id: studentId || null,
        description: description.trim(),
        kind,
        amount_cents,
        due_date: dueDate || null,
      })
      toast.success('Charge added')
      onSaved()
    } catch { toast.error('Could not add charge') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Add charge" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Family</label>
          <SearchSelect
            value={householdId}
            onChange={(id) => { setHouseholdId(id); setStudentId('') }}
            options={households} getId={(h) => h.id} getLabel={(h) => h.display_name || h.name || 'Unnamed family'}
            placeholder="Search families…"
          />
        </div>
        {students.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Student (optional)</label>
            <SearchSelect
              value={studentId} onChange={setStudentId}
              options={students} getId={(s) => s.user_id} getLabel={(s) => s.name || 'Student'}
              placeholder="Whole family…"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Description</label>
          <input className={field} placeholder="e.g. Fall tuition" value={description}
            onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Type</label>
          <select className={field} value={kind} onChange={(e) => setKind(e.target.value)}
            aria-label="Charge type">
            <option value="tuition">Tuition</option>
            <option value="supply">Supply fee</option>
            <option value="registration">Registration fee</option>
            <option value="fee">Other fee</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Amount ($)</label>
            <input className={field} type="number" min="0" step="0.01" placeholder="0.00"
              value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Due date (optional)</label>
            <input className={field} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? 'Adding…' : 'Add charge'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Correct a recorded payment ───────────────────────────────────────────────

export default AddChargeModal
