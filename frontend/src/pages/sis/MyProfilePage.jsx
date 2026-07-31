import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import { withPreview, getPreviewTeacher } from './teacherPreview'
import BackToDashboard from '../../components/sis/BackToDashboard'

/**
 * MyProfilePage — the teacher's own staff profile. Employment details
 * (position, type, status) are read-only here (an admin maintains them on the
 * Staff page); the teacher can edit only their emergency contact — the
 * self-service subset the backend allows (SELF_PROFILE_FIELDS).
 * GET/PATCH /api/sis/teacher/profile.
 */

const STAFF_TYPE_LABEL = { employee: 'Employee', contractor: 'Contractor', family: 'Family' }
const PAY_TYPE_LABEL = { hourly: 'Hourly', salaried: 'Salaried', stipend: 'Stipend', unpaid: 'Unpaid' }

const ReadRow = ({ label, value }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
    <span className="text-sm text-neutral-500">{label}</span>
    <span className="text-sm font-medium text-neutral-900">{value || '—'}</span>
  </div>
)

const MyProfilePage = () => {
  const { orgId } = useSisOrg()
  const preview = getPreviewTeacher()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withPreview(withOrg('/api/sis/teacher/profile', orgId), preview))
      .then((r) => {
        const p = r.data?.profile || {}
        setProfile(p)
        setName(p.emergency_contact_name || '')
        setPhone(p.emergency_contact_phone || '')
      })
      .catch((e) => toast.error(e?.response?.data?.error || 'Failed to load your profile'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, preview?.id])

  const save = async () => {
    setSaving(true)
    try {
      const r = await api.patch(withOrg('/api/sis/teacher/profile', orgId), {
        organization_id: orgId,
        emergency_contact_name: name.trim() || null,
        emergency_contact_phone: phone.trim() || null,
      })
      if (r.data?.profile) setProfile(r.data.profile)
      toast.success('Emergency contact saved')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save your changes')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-neutral-500">Loading…</p>

  const p = profile || {}
  const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
  const dirty = (name.trim() || '') !== (p.emergency_contact_name || '') ||
    (phone.trim() || '') !== (p.emergency_contact_phone || '')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <BackToDashboard className="mb-1" />
        <h1 className="text-2xl font-bold text-neutral-900">My profile</h1>
        <p className="text-neutral-500 mt-1">Your staff details and emergency contact.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-neutral-900 mb-2">Employment</h2>
        <p className="text-xs text-neutral-400 mb-3">Managed by your administrator. Reach out to them to change any of these.</p>
        <ReadRow label="Position" value={p.position} />
        <ReadRow label="Staff type" value={STAFF_TYPE_LABEL[p.staff_type]} />
        <ReadRow label="Pay type" value={PAY_TYPE_LABEL[p.pay_type]} />
        <ReadRow label="Status" value={p.is_active === false ? 'Inactive' : 'Active'} />
        <ReadRow label="Time clock" value={p.uses_time_clock ? 'Enabled' : 'Not used'} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-neutral-900 mb-1">Emergency contact</h2>
        <p className="text-xs text-neutral-400 mb-4">Who your school should call if something happens to you on site.</p>

        {preview ? (
          <p className="text-sm text-neutral-500">
            {p.emergency_contact_name || 'No contact on file'}
            {p.emergency_contact_phone ? ` · ${p.emergency_contact_phone}` : ''}. Editing is disabled in preview.
          </p>
        ) : (
          <>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Contact name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${field} mb-4`} placeholder="e.g. Jordan Lee" />

            <label className="block text-xs font-medium text-neutral-500 mb-1">Contact phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={`${field} mb-5`} placeholder="e.g. (555) 123-4567" />

            <button onClick={save} disabled={saving || !dirty}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
              {saving ? 'Saving…' : 'Save emergency contact'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default MyProfilePage
