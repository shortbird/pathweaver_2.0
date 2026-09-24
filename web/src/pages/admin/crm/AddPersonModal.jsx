import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { createPerson } from './crmApi'
import { Modal, FormFooter } from '../../../components/ui'
import { NoteFields } from './PersonFile'

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const EMPTY = { first_name: '', last_name: '', email: '', phone: '' }

/**
 * Add someone to the CRM by hand, e.g. right after meeting them. The server
 * decides what they are: a person with an Optio account opens their file; a
 * person without one becomes a lead that is in no funnel, so they get no
 * email. Either way the optional note lands in their file.
 */
const AddPersonModal = ({ isOpen, onClose, initialQuery = '' }) => {
  const navigate = useNavigate()
  const [fields, setFields] = useState(EMPTY)
  const [note, setNote] = useState('')
  const [metOn, setMetOn] = useState('')
  const [saving, setSaving] = useState(false)

  // Prefill from the search box: an email goes to email, anything else to name.
  useEffect(() => {
    if (!isOpen) return
    const q = initialQuery.trim()
    if (q.includes('@')) {
      setFields({ ...EMPTY, email: q })
    } else {
      const [first = '', ...rest] = q.split(/\s+/)
      setFields({ ...EMPTY, first_name: first, last_name: rest.join(' ') })
    }
    setNote('')
    setMetOn('')
  }, [isOpen, initialQuery])

  const set = (key) => (e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))
  const emailOk = /\S+@\S+/.test(fields.email.trim())

  const handleSave = async () => {
    if (!emailOk) return
    setSaving(true)
    try {
      const { data } = await createPerson({
        ...fields,
        note: note.trim() || null,
        met_on: note.trim() && metOn ? metOn : null,
      })
      if (data.kind === 'user') {
        toast.success('They already have an Optio account. Opened their file.')
        navigate(`/admin/crm/people/${data.id}`)
      } else {
        toast.success(data.existing ? 'Already in the CRM. Opened their file.' : 'Person added')
        navigate(`/admin/crm/leads/${data.id}`)
      }
      onClose()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add person')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add person" size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          For someone who is not in Optio yet. They are not added to any funnel, so they get no
          email. If they sign up later with this email, these notes show in their file.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="add-person-first" className="block text-sm font-medium text-gray-700 mb-1">
              First name
            </label>
            <input id="add-person-first" value={fields.first_name} onChange={set('first_name')} className={inputClass} />
          </div>
          <div>
            <label htmlFor="add-person-last" className="block text-sm font-medium text-gray-700 mb-1">
              Last name
            </label>
            <input id="add-person-last" value={fields.last_name} onChange={set('last_name')} className={inputClass} />
          </div>
          <div>
            <label htmlFor="add-person-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="add-person-email"
              type="email"
              value={fields.email}
              onChange={set('email')}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="add-person-phone" className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input id="add-person-phone" type="tel" value={fields.phone} onChange={set('phone')} className={inputClass} />
          </div>
        </div>
        <div>
          <p className="block text-sm font-medium text-gray-700 mb-1">First note (optional)</p>
          <NoteFields idPrefix="add-person" body={note} metOn={metOn} onBody={setNote} onMetOn={setMetOn} />
        </div>
        <FormFooter
          onCancel={onClose}
          onSubmit={handleSave}
          submitText="Add person"
          isSubmitting={saving}
          disabled={!emailOk}
        />
      </div>
    </Modal>
  )
}

export default AddPersonModal
