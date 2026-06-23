import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'

/**
 * Per-student detail: enrollment lifecycle fields (status/grade/dates) plus
 * emergency contacts CRUD. Simple controlled overlay (no external modal dep).
 */
const StudentDetailModal = ({ student, orgId, onClose, onSaved }) => {
  const [grade, setGrade] = useState(student.grade_level || '')
  const [startDate, setStartDate] = useState(student.start_date || '')
  const [status, setStatus] = useState(
    student.enrollment_status === 'unassigned' ? 'enrolled' : student.enrollment_status
  )
  const [contacts, setContacts] = useState([])
  const [newContact, setNewContact] = useState({ name: '', relationship: '', phone: '', email: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get(`/api/sis/students/${student.student_id}/emergency-contacts`)
      .then((r) => setContacts(r.data?.contacts || []))
      .catch(() => { /* non-fatal */ })
  }, [student.student_id])

  const saveEnrollment = async () => {
    setSaving(true)
    try {
      await api.patch(`/api/sis/enrollments/${student.student_id}`, {
        status, grade_level: grade, start_date: startDate || null, organization_id: orgId,
      })
      toast.success('Saved')
      onSaved?.()
    } catch {
      toast.error('Save failed')
    } finally {
      setSaving(false)
    }
  }

  const addContact = async () => {
    if (!newContact.name.trim()) { toast.error('Contact name required'); return }
    try {
      const r = await api.post(
        `/api/sis/students/${student.student_id}/emergency-contacts`,
        { ...newContact, organization_id: orgId }
      )
      setContacts((c) => [...c, r.data.contact])
      setNewContact({ name: '', relationship: '', phone: '', email: '' })
    } catch {
      toast.error('Could not add contact')
    }
  }

  const removeContact = async (id) => {
    try {
      await api.delete(`/api/sis/emergency-contacts/${id}`)
      setContacts((c) => c.filter((x) => x.id !== id))
    } catch {
      toast.error('Could not remove contact')
    }
  }

  const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">{student.name}</h2>
            <p className="text-sm text-neutral-400">{student.email || student.username}</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
        </div>

        <section className="mb-6">
          <h3 className="text-sm font-semibold text-neutral-700 mb-3">Enrollment</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
                {['applicant', 'enrolled', 'withdrawn', 'graduated'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Grade level
              <input value={grade} onChange={(e) => setGrade(e.target.value)} className={field} placeholder="e.g. 9th" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Start date
              <input type="date" value={startDate || ''} onChange={(e) => setStartDate(e.target.value)} className={field} />
            </label>
          </div>
          <div className="mt-3">
            <Button size="sm" onClick={saveEnrollment} loading={saving}>Save enrollment</Button>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-neutral-700 mb-3">Emergency contacts</h3>
          <div className="space-y-2 mb-3">
            {contacts.length === 0 && <p className="text-sm text-neutral-400">No contacts yet.</p>}
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium text-neutral-800">{c.name}</span>
                  {c.relationship && <span className="text-neutral-400"> · {c.relationship}</span>}
                  <div className="text-xs text-neutral-400">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
                </div>
                <button onClick={() => removeContact(c.id)} className="text-red-500 text-sm hover:underline">Remove</button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} className={field} placeholder="Name" />
            <input value={newContact.relationship} onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })} className={field} placeholder="Relationship" />
            <input value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} className={field} placeholder="Phone" />
            <input value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} className={field} placeholder="Email" />
          </div>
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={addContact}>Add contact</Button>
          </div>
        </section>
      </div>
    </div>
  )
}

export default StudentDetailModal
