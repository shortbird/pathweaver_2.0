import React, { useEffect, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import ModalOverlay from '../../components/ui/ModalOverlay'
import { RolePill } from '../../components/ui/RolePill'
import { useAuth } from '../../contexts/AuthContext'
import { canSeeFinance } from '../../pages/sis/sisRole'

/**
 * StaffDetailModal — opens when a Staff card is clicked (same pattern as the
 * student and family detail modals). Shows the person + their employment
 * summary, with the actions (View portal, Link account, Employment, Edit)
 * as footer buttons that hand off to the existing modals.
 */

const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('')

const fmtDate = (d) => {
  if (!d) return null
  try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return null }
}

const Row = ({ label, value }) => (
  value ? (
    <div className="flex gap-2 text-sm">
      <span className="w-32 shrink-0 text-neutral-400">{label}</span>
      <span className="text-neutral-800">{value}</span>
    </div>
  ) : null
)

const actionBtn = 'px-3 py-2 rounded-lg text-sm font-medium transition-colors'

export default function StaffDetailModal({ orgId, staff, onClose, onEdit, onEmployment, onLink, onViewPortal, onRemoved }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [resending, setResending] = useState(false)
  const [removing, setRemoving] = useState(false)

  /**
   * Remove this person. Asks the backend first what removal would affect, then
   * offers only what is actually safe: a clean placeholder can be deleted
   * outright, anyone with history can only be archived. The confirm names the
   * classes that will lose their teacher — "unassigns 3 classes" is the part
   * people regret not being told.
   */
  const remove = async () => {
    setRemoving(true)
    try {
      const { data } = await api.get(
        `/api/sis/staff/${staff.id}/removal-preview?organization_id=${orgId}`)
      const classNames = (data.classes || []).map((c) => c.name).filter(Boolean)
      const classLine = classNames.length
        ? `\n\nThese classes will show no teacher until you reassign them:\n· ${classNames.join('\n· ')}`
        : ''

      if (data.can_delete) {
        const choice = window.confirm(
          `Delete ${staff.name} permanently?${classLine}\n\n`
          + 'They have no attendance, timesheets, forms, or onboarding on record, so nothing is lost.\n\n'
          + 'OK to delete, Cancel to keep them.')
        if (!choice) { setRemoving(false); return }
        const r = await api.delete(
          `/api/sis/staff/${staff.id}?organization_id=${orgId}&mode=delete`)
        toast.success(`${r.data?.name || staff.name} deleted`)
      } else {
        const kinds = Object.keys(data.blocking || {}).join(', ')
        const choice = window.confirm(
          `Archive ${staff.name}?${classLine}\n\n`
          + `They can't be deleted because they have school records attached (${kinds}). `
          + 'Archiving hides them from staff lists and the directory without losing any history, '
          + 'and can be undone.\n\nOK to archive, Cancel to keep them.')
        if (!choice) { setRemoving(false); return }
        const r = await api.delete(`/api/sis/staff/${staff.id}?organization_id=${orgId}`)
        toast.success(`${r.data?.name || staff.name} archived`)
      }
      onRemoved && onRemoved()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove this person')
    } finally {
      setRemoving(false)
    }
  }

  const resendInvite = async () => {
    setResending(true)
    try {
      await api.post(`/api/sis/staff/${staff.id}/resend-invite`, { organization_id: orgId })
      toast.success(`Setup email sent to ${staff.email}`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not resend the invite')
    } finally {
      setResending(false)
    }
  }

  useEffect(() => {
    api.get(`/api/sis/staff-admin/profiles/${staff.id}?organization_id=${orgId}`)
      .then((r) => setProfile(r.data?.profile || {}))
      .catch(() => setProfile({}))
  }, [orgId, staff.id])

  const seesFinance = canSeeFinance(user)
  const employment = profile && [
    profile.position,
    profile.staff_type === 'contractor' ? 'Independent contractor' : profile.staff_type === 'employee' ? 'Employee' : null,
    seesFinance ? profile.pay_type : null,
  ].filter(Boolean).join(' · ')

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            {staff.avatar_url ? (
              <img src={staff.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center text-lg font-semibold shrink-0">
                {initials(staff.name)}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">{staff.name}</h2>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(staff.roles || []).map((r) => <RolePill key={r} role={r} />)}
                {staff.is_placeholder && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                    No login yet
                  </span>
                )}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-2 overflow-y-auto">
          {!staff.is_placeholder && <Row label="Email" value={staff.email} />}
          <Row label="Employment" value={employment} />
          <Row label="Schedule" value={profile?.work_schedule} />
          {/* The API drops pay fields for a campus coordinator; an empty row
              would read as "this person has no payroll ID". */}
          {seesFinance && <Row label="Payroll ID" value={profile?.payroll_id} />}
          <Row label="Start date" value={profile?.start_date} />
          <Row label="Last active" value={fmtDate(staff.last_active)} />
          {profile && profile.is_active === false && (
            <p className="text-sm font-medium text-red-600">Inactive</p>
          )}
          {staff.bio && <p className="text-sm text-neutral-600 pt-2">{staff.bio}</p>}
          {staff.is_placeholder && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
              This teacher can&apos;t sign in yet. Link their real email so they can access their portal.
            </p>
          )}
          {staff.login_pending && (
            <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
              They&apos;ve been emailed a link to set up their account but haven&apos;t
              signed in yet. You can resend the setup email if it got lost.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 p-4 border-t border-gray-200 shrink-0">
          <button onClick={remove} disabled={removing}
            className={`${actionBtn} text-red-600 hover:bg-red-50 mr-auto disabled:opacity-50`}>
            {removing ? 'Working…' : 'Remove'}
          </button>
          <button onClick={onViewPortal} className={`${actionBtn} text-neutral-700 hover:bg-gray-100`}>
            View portal
          </button>
          {staff.is_placeholder && (
            <button onClick={onLink} className={`${actionBtn} text-white bg-amber-600 hover:bg-amber-700`}>
              Link their account
            </button>
          )}
          {staff.login_pending && (
            <button onClick={resendInvite} disabled={resending}
              className={`${actionBtn} text-blue-700 border border-blue-300 hover:bg-blue-50 disabled:opacity-50`}>
              {resending ? 'Sending…' : 'Resend setup email'}
            </button>
          )}
          <button onClick={onEmployment} className={`${actionBtn} text-neutral-700 border border-gray-300 hover:bg-gray-50`}>
            Employment
          </button>
          <button onClick={onEdit}
            className={`${actionBtn} text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90`}>
            Edit profile
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
