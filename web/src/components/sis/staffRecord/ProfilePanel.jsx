import React, { useEffect, useState } from 'react'
import { PhotoIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import Button from '../../ui/Button'
import { Input, Textarea } from '../../ui/Input'
import { RolePill } from '../../ui/RolePill'
import { useAuth } from '../../../contexts/AuthContext'
import { canGrantAdmin, canEditRolesOf } from '../../../pages/sis/sisRole'

/**
 * The staff record's Profile tab: who this person is -- name, email, bio,
 * photo, phone -- and the role they hold at the school.
 *
 * Until M13c (2026-09-18) the name/email/bio/photo form was TeacherModal's
 * edit mode, a second dialog opened from the record's footer; it lives here
 * now and TeacherModal only adds. The phone number is edited HERE for
 * anybody else and on My Profile for yourself (the first half of M13c).
 */

const Label = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="block text-xs font-medium text-neutral-600 mb-1">{children}</label>
)

/**
 * The staff roles somebody can hold, most privileged first -- the same order
 * and membership as the backend's sis_service.STAFF_ORG_ROLES.
 *
 * The descriptions are here because the difference between an admin and a
 * campus coordinator is exactly one thing, and a role picker that doesn't say
 * what that thing is makes the choice a guess.
 */
const ASSIGNABLE_ROLES = [
  { key: 'org_admin', label: 'Admin',
    hint: 'The whole console, including tuition, invoices and pay rates.' },
  { key: 'campus_coordinator', label: 'Campus Coordinator',
    hint: 'Runs the campus — people, classes, registration, attendance, paperwork. No money: billing and pay rates stay hidden.' },
  { key: 'advisor', label: 'Teacher',
    hint: 'Their own classes, in the teacher portal.' },
]

const ProfilePanel = ({ orgId, staff, profile, onSaved }) => {
  const { user } = useAuth()
  const [form, setForm] = useState({
    first_name: staff.first_name || '',
    last_name: staff.last_name || '',
    email: staff.is_placeholder ? '' : (staff.email || ''),
    bio: staff.bio || '',
    phone_number: '',
  })
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(staff.avatar_url || null)
  const [saving, setSaving] = useState(false)
  const [roles, setRoles] = useState(staff.roles || [])
  const [editingRoles, setEditingRoles] = useState(false)
  const [savingRoles, setSavingRoles] = useState(false)

  // The phone lives on the employment profile row, which arrives after the
  // record opens; the roster row carries it too when the profile is absent.
  useEffect(() => {
    setForm((f) => ({ ...f, phone_number: profile?.phone_number || staff.phone_number || '' }))
  }, [profile, staff.phone_number])

  useEffect(() => () => { if (photoFile && photoPreview) URL.revokeObjectURL(photoPreview) },
    [photoFile, photoPreview])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const pickPhoto = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (photoFile && photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const save = async () => {
    if (!staff.is_placeholder && (!form.first_name.trim() || !form.last_name.trim())) {
      toast.error('First and last name are required')
      return
    }
    setSaving(true)
    try {
      await api.patch(`/api/sis/staff/${staff.id}`, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        // A placeholder's email is synthetic and is claimed on the Account
        // tab, not typed over here.
        ...(staff.is_placeholder ? {} : { email: form.email.trim() }),
        bio: form.bio,
        phone_number: form.phone_number.trim() || null,
        organization_id: orgId,
      })
      if (photoFile) {
        const body = new FormData()
        body.append('file', photoFile)
        await api.post(`/api/sis/staff/${staff.id}/photo?organization_id=${orgId}`, body)
      }
      toast.success('Profile saved')
      onSaved?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the profile')
    } finally {
      setSaving(false)
    }
  }

  const toggleRole = (key) => setRoles((prev) => (
    prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]
  ))

  const saveRoles = async () => {
    setSavingRoles(true)
    try {
      await api.put(`/api/sis/staff/${staff.id}/roles?organization_id=${orgId}`, { roles })
      toast.success(`${staff.name}'s role updated`)
      setEditingRoles(false)
      onSaved?.()
    } catch (e) {
      // The backend refuses the two lockout cases (last admin, your own admin
      // role) with a sentence that says what to do instead -- show it verbatim.
      toast.error(e?.response?.data?.error || 'Could not change their role')
      setRoles(staff.roles || [])
    } finally {
      setSavingRoles(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {photoPreview ? (
          <img src={photoPreview} alt="" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 flex items-center justify-center">
            <PhotoIcon className="w-7 h-7 text-optio-purple/40" />
          </div>
        )}
        <div>
          <label htmlFor="staff-photo"
            className="inline-block px-3 py-1.5 text-sm font-medium text-optio-purple border border-optio-purple/40 rounded-lg cursor-pointer hover:bg-optio-purple/5 transition-colors">
            {photoPreview ? 'Change photo' : 'Upload photo'}
          </label>
          <p className="text-xs text-neutral-400 mt-1">JPG or PNG, max 5MB</p>
          <input id="staff-photo" type="file" accept="image/*" onChange={pickPhoto} className="hidden" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="staff-first-name">First name</Label>
          <Input id="staff-first-name" value={form.first_name} onChange={set('first_name')} className="text-sm" />
        </div>
        <div>
          <Label htmlFor="staff-last-name">Last name</Label>
          <Input id="staff-last-name" value={form.last_name} onChange={set('last_name')} className="text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="staff-email">Email</Label>
          {staff.is_placeholder ? (
            <p className="text-sm text-neutral-500 py-2">No login yet. Link their account on the Account tab.</p>
          ) : (
            <Input id="staff-email" type="email" value={form.email} onChange={set('email')} className="text-sm" />
          )}
        </div>
        <div>
          <Label htmlFor="staff-phone">Phone number</Label>
          <Input id="staff-phone" type="tel" value={form.phone_number} onChange={set('phone_number')}
            placeholder="801-555-0100" className="text-sm" />
        </div>
      </div>
      <div>
        <Label htmlFor="staff-bio">Bio</Label>
        <Textarea id="staff-bio" value={form.bio} onChange={set('bio')} rows={3}
          placeholder="A short introduction families will see" className="text-sm resize-none" />
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} loading={saving}>Save profile</Button>
      </div>

      {/* Role. The campus coordinator role has existed since 2026-08-04 with
          no way to give it to anybody; this is where you do that.

          Any front-office member may change a role below admin, so a
          coordinator sees this too. What they do not see: the Admin option,
          and the control at all on an admin's record -- the backend refuses
          both writes, so neither is offered. */}
      {canEditRolesOf(user, staff.roles) && (
        <div className="border-t border-gray-100 pt-4">
          {!editingRoles ? (
            <div className="flex gap-2 text-sm items-center">
              <span className="w-32 shrink-0 text-neutral-400">Role</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {(staff.roles || []).map((r) => <RolePill key={r} role={r} />)}
                <button type="button"
                  onClick={() => { setRoles(staff.roles || []); setEditingRoles(true) }}
                  className="text-sm font-medium text-optio-purple hover:underline ml-1">
                  Change
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <p className="text-sm font-medium text-neutral-800">Role at this school</p>
              {ASSIGNABLE_ROLES.filter((r) => r.key !== 'org_admin' || canGrantAdmin(user)).map((r) => (
                <label key={r.key} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={roles.includes(r.key)}
                    onChange={() => toggleRole(r.key)}
                    className="mt-1 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-neutral-800">{r.label}</span>
                    <span className="block text-xs text-neutral-500">{r.hint}</span>
                  </span>
                </label>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={saveRoles} loading={savingRoles}>Save role</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingRoles(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ProfilePanel
