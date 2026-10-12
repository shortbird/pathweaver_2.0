import React, { useEffect, useState } from 'react'
import { ChevronUpIcon, ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline'
import SearchSelect from '../../components/ui/SearchSelect'
import { INLINE_INPUT_CLASS } from '../../components/ui/Input'
import { patchSisSettings } from '../../hooks/api/useSisSettings'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * Who to contact -- the list families see on their home page.
 *
 * Ticket c58b7c0b (iCreate, org admin): "On parent dashboards, could we create
 * a section where there is who to contact info? So they can get in touch with
 * the right person for what they need without having to go through multiple
 * people... e.g. a question about something in the building message Becky;
 * late pick-up; general concern about classes message Sharmaine."
 *
 * Each row is a topic and a person: a staff member of the school (families
 * then get a Message button) or a typed name for someone without an account,
 * with an optional phone and email. Stored in
 * sis_settings.family_contacts; the server checks every row and refuses the
 * whole list if one is bad (services/sis_family_contacts_service.py).
 */
export const KEY = 'family_contacts'
const MAX = 20
const field = INLINE_INPUT_CLASS

const blank = () => ({ topic: '', staff_user_id: '', name: '', phone: '', email: '' })

const fromStored = (rows) => (Array.isArray(rows) ? rows : []).map((r) => ({
  topic: r.topic || '',
  staff_user_id: r.staff_user_id || '',
  name: r.name || '',
  phone: r.phone || '',
  email: r.email || '',
}))

export default function FamilyContactsCard({ orgId, org, onUpdate }) {
  const [rows, setRows] = useState(() => fromStored(org?.feature_flags?.sis_settings?.[KEY]))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  // A plain read, not the react-query staff hook: the settings pages render
  // their cards outside a QueryClientProvider in tests and in the web app's
  // Organization tab alike. A failure leaves the picker empty (typed names
  // still work).
  const [staff, setStaff] = useState([])
  useEffect(() => {
    if (!orgId) return undefined
    let cancelled = false
    api.get(withOrg('/api/sis/staff', orgId))
      .then((r) => { if (!cancelled) setStaff(r.data?.staff || []) })
      .catch(() => { if (!cancelled) setStaff([]) })
    return () => { cancelled = true }
  }, [orgId])

  const edit = (i, patch) => {
    setSaved(false)
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }
  const move = (i, by) => {
    setSaved(false)
    setRows((rs) => {
      const j = i + by
      if (j < 0 || j >= rs.length) return rs
      const next = [...rs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  const remove = (i) => { setSaved(false); setRows((rs) => rs.filter((_, j) => j !== i)) }

  const save = async () => {
    // A row with nothing typed is an unused "Add" press, not a mistake.
    const cleaned = rows
      .map((r) => ({
        topic: r.topic.trim(),
        staff_user_id: r.staff_user_id || undefined,
        name: r.name.trim() || undefined,
        phone: r.phone.trim() || undefined,
        email: r.email.trim() || undefined,
      }))
      .filter((r) => r.topic || r.staff_user_id || r.name || r.phone || r.email)
    setSaving(true)
    setError('')
    try {
      await patchSisSettings(orgId, { sis_settings: { [KEY]: cleaned.length ? cleaned : null } })
      setRows(fromStored(cleaned))
      setSaved(true)
      onUpdate?.()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not save the contacts')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-2">Who to contact</h2>
      <p className="text-sm text-gray-600 mb-3">
        Shown to families on their home page, so they reach the right person the first time.
        Add a topic and the person for it. Pick a staff member to give families a Message
        button, or type a name.
      </p>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2" data-testid="family-contact-row">
            <div className="flex items-center gap-2">
              <input className={`${field} flex-1`} value={r.topic} maxLength={80}
                onChange={(e) => edit(i, { topic: e.target.value })}
                placeholder="Topic, e.g. Building questions" aria-label={`Topic ${i + 1}`} />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                className="btn-quiet p-1 disabled:opacity-30" aria-label={`Move contact ${i + 1} up`}>
                <ChevronUpIcon className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                className="btn-quiet p-1 disabled:opacity-30" aria-label={`Move contact ${i + 1} down`}>
                <ChevronDownIcon className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => remove(i)}
                className="btn-quiet p-1 hover:text-red-600" aria-label={`Remove contact ${i + 1}`}>
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <SearchSelect value={r.staff_user_id} onChange={(id) => edit(i, { staff_user_id: id })}
                options={staff} getId={(p) => p.id} getLabel={(p) => p.name}
                placeholder="Staff member" emptyLabel="No staff member (type a name)" />
              <input className={field} value={r.name} maxLength={80}
                onChange={(e) => edit(i, { name: e.target.value })}
                placeholder={r.staff_user_id ? 'Name (the staff member’s name is used)' : 'Name'}
                aria-label={`Name ${i + 1}`} />
              <input className={field} value={r.phone} maxLength={40} inputMode="tel"
                onChange={(e) => edit(i, { phone: e.target.value })}
                placeholder="Phone (optional)" aria-label={`Phone ${i + 1}`} />
              <input className={field} value={r.email} maxLength={120} type="email"
                onChange={(e) => edit(i, { email: e.target.value })}
                placeholder="Email (optional)" aria-label={`Email ${i + 1}`} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button type="button" onClick={() => { setSaved(false); setRows((rs) => [...rs, blank()]) }}
          disabled={rows.length >= MAX}
          className="text-sm font-medium text-optio-purple hover:underline disabled:opacity-50">+ Add contact</button>
        {saved && <span className="text-sm text-green-700">Saved</span>}
        <button type="button" onClick={save} disabled={saving}
          className="ml-auto px-4 py-2 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}
