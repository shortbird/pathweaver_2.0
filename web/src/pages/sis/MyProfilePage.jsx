import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { useSisOrg, withOrg } from './useSisOrg'
import { withPreview, getPreviewTeacher } from './teacherPreview'
import BackToDashboard from '../../components/sis/BackToDashboard'

/**
 * MyProfilePage — the teacher's own staff profile.
 *
 * Public profile (photo + bio) is what families and students see in the staff
 * directory; the teacher self-serves it here via the shared user endpoints
 * (PUT /api/users/profile, POST /api/users/avatar) rather than needing an admin.
 * Employment details (position, type, status) stay read-only (an admin maintains
 * them on the Staff page); the teacher also edits their own phone number and
 * their emergency contact — the self-service subset the SIS backend allows
 * (SELF_PROFILE_FIELDS). GET/PATCH /api/sis/teacher/profile.
 */

const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('')

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
  const { user, refreshUser } = useAuth()
  const preview = getPreviewTeacher()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  // The teacher's OWN number, distinct from the emergency contact's. The page
  // only ever offered the latter, so staff asked to "add your phone number" had
  // nowhere to put it and reported it as broken (iCreate, 2026-08-29, twice).
  // The backend already accepted it: phone_number is in SELF_PROFILE_FIELDS and
  // is written through to users.phone_number.
  const [myPhone, setMyPhone] = useState('')
  const [saving, setSaving] = useState(false)
  // Public profile (photo + bio). In preview, an admin sees the previewed
  // teacher's values read-only; otherwise it's the signed-in user's own.
  const [bio, setBio] = useState('')
  const [savingBio, setSavingBio] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withPreview(withOrg('/api/sis/teacher/profile', orgId), preview))
      .then((r) => {
        const p = r.data?.profile || {}
        setProfile(p)
        setName(p.emergency_contact_name || '')
        setPhone(p.emergency_contact_phone || '')
        setMyPhone(p.phone_number || '')
      })
      .catch((e) => toast.error(e?.response?.data?.error || 'Failed to load your profile'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, preview?.id])

  // Seed the public-profile fields from the previewed teacher (read-only) or the
  // signed-in user (editable).
  useEffect(() => {
    const src = preview || user || {}
    setBio(src.bio || '')
    setAvatarUrl(src.avatar_url || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.id, user?.id, user?.bio, user?.avatar_url])

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0]
    if (file) e.target.value = '' // allow re-selecting the same file
    if (!file) return
    const form = new FormData()
    form.append('avatar', file)
    setUploading(true)
    try {
      const r = await api.post('/api/users/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      if (r.data?.avatar_url) setAvatarUrl(r.data.avatar_url)
      await refreshUser()
      toast.success('Photo updated')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not upload your photo')
    } finally {
      setUploading(false)
    }
  }

  const saveBio = async () => {
    setSavingBio(true)
    try {
      await api.put('/api/users/profile', { bio: bio.trim() })
      await refreshUser()
      toast.success('Bio saved')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save your bio')
    } finally {
      setSavingBio(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const r = await api.patch(withOrg('/api/sis/teacher/profile', orgId), {
        organization_id: orgId,
        phone_number: myPhone.trim() || null,
        emergency_contact_name: name.trim() || null,
        emergency_contact_phone: phone.trim() || null,
      })
      if (r.data?.profile) setProfile(r.data.profile)
      toast.success('Contact details saved')
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
    (phone.trim() || '') !== (p.emergency_contact_phone || '') ||
    (myPhone.trim() || '') !== (p.phone_number || '')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <BackToDashboard className="mb-1" />
        <h1 className="text-2xl font-bold text-neutral-900">My profile</h1>
        <p className="text-neutral-500 mt-1">Your staff details and contact information.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-neutral-900 mb-1">Public profile</h2>
        <p className="text-xs text-neutral-400 mb-4">Your photo and bio, as families and students see them.</p>

        <div className="flex items-start gap-4">
          <div className="shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover border border-gray-200" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center text-2xl font-semibold">
                {initials(preview?.name || user?.display_name || user?.first_name)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {preview ? (
              <p className="text-sm text-neutral-500">
                {bio || 'No bio yet.'} Editing is disabled in preview.
              </p>
            ) : (
              <>
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-neutral-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">
                  <ArrowUpTrayIcon className="w-4 h-4" />
                  {uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload photo'}
                </button>
                <input ref={fileRef} type="file" className="hidden" onChange={uploadAvatar}
                  accept=".png,.jpg,.jpeg,.webp,.gif,.heic,.heif" />
                <p className="text-[11px] text-neutral-400 mt-1">JPEG, PNG, WebP, GIF or HEIC · up to 5MB</p>
              </>
            )}
          </div>
        </div>

        {!preview && (
          <>
            <label className="block text-xs font-medium text-neutral-500 mt-5 mb-1">Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4}
              className={`${field} resize-y`}
              placeholder="A short introduction — your background, what you teach, what you're excited about." />
            <div className="mt-3">
              <button onClick={saveBio} disabled={savingBio || (bio.trim() === ((user?.bio || '').trim()))}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
                {savingBio ? 'Saving…' : 'Save bio'}
              </button>
            </div>
          </>
        )}
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
        <h2 className="font-semibold text-neutral-900 mb-1">Contact details</h2>
        <p className="text-xs text-neutral-400 mb-4">Your own number, and who your school should call if something happens to you on site.</p>

        {preview ? (
          <>
            <p className="text-sm text-neutral-500 mb-1">
              {p.phone_number || 'No phone number on file'}
            </p>
            <p className="text-sm text-neutral-500">
              Emergency contact: {p.emergency_contact_name || 'none on file'}
              {p.emergency_contact_phone ? ` · ${p.emergency_contact_phone}` : ''}. Editing is disabled in preview.
            </p>
          </>
        ) : (
          <>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Your phone number</label>
            <input value={myPhone} onChange={(e) => setMyPhone(e.target.value)} className={`${field} mb-5`} placeholder="e.g. (555) 123-4567" />

            <p className="text-xs font-medium text-neutral-500 mb-2 border-t border-gray-100 pt-4">Emergency contact</p>

            <label className="block text-xs font-medium text-neutral-500 mb-1">Contact name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${field} mb-4`} placeholder="e.g. Jordan Lee" />

            <label className="block text-xs font-medium text-neutral-500 mb-1">Contact phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={`${field} mb-5`} placeholder="e.g. (555) 123-4567" />

            <button onClick={save} disabled={saving || !dirty}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
              {saving ? 'Saving…' : 'Save contact details'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default MyProfilePage
