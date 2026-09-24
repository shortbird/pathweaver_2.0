import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import Button from '../../ui/Button'
import { Input } from '../../ui/Input'
import { useConfirm } from '../../../contexts/ConfirmContext'

/**
 * The staff record's Account tab: whether this person can sign in, and the
 * things the office does about that -- link a placeholder to a real email,
 * resend the setup email, look at their portal, remove them.
 *
 * Linking was LinkStaffAccountModal, a third dialog opened from the record's
 * footer, until M13c (2026-09-18). The backend decides between two outcomes:
 * a brand-new email claims the placeholder in place (a set-password invite
 * goes out), while an email that already has an Optio account (a parent who
 * also teaches) absorbs the placeholder's class assignments and gains the
 * Teacher role.
 */

const Row = ({ label, children }) => (
  <div className="flex gap-2 text-sm">
    <span className="w-32 shrink-0 text-neutral-400">{label}</span>
    <span className="text-neutral-800 min-w-0">{children}</span>
  </div>
)

const fmtDate = (d) => {
  if (!d) return null
  try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return null }
}

const AccountPanel = ({ orgId, staff, onSaved, onViewPortal, onRemoved }) => {
  const confirm = useConfirm()
  const [email, setEmail] = useState('')
  const [linkError, setLinkError] = useState('')
  const [linking, setLinking] = useState(false)
  const [resending, setResending] = useState(false)
  const [removing, setRemoving] = useState(false)

  const link = async (e) => {
    e.preventDefault()
    setLinkError('')
    if (!email.trim()) { setLinkError('Email is required'); return }
    setLinking(true)
    try {
      const r = await api.post(`/api/sis/staff/${staff.id}/link`, { email: email.trim(), organization_id: orgId })
      const data = r.data || {}
      if (data.linked === 'merged') {
        toast.success(`${staff.name} is now linked to their existing Optio account`)
      } else if (data.email_sent === false) {
        toast.error('Account linked, but the set-password email could not be sent. Ask them to use "Forgot password" on the login page.',
          { duration: 8000 })
      } else {
        toast.success(`Invite sent — ${staff.name} will get an email with setup instructions`)
      }
      onSaved?.()
    } catch (err) {
      setLinkError(err?.response?.data?.error || 'Could not link the account')
    } finally {
      setLinking(false)
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

  /**
   * Remove this person. Asks the backend first what removal would affect, then
   * offers only what is actually safe: a clean placeholder can be deleted
   * outright, anyone with history can only be archived. The confirm names the
   * classes that will lose their teacher -- "unassigns 3 classes" is the part
   * people regret not being told.
   */
  const remove = async () => {
    setRemoving(true)
    try {
      const { data } = await api.get(`/api/sis/staff/${staff.id}/removal-preview?organization_id=${orgId}`)
      const classNames = (data.classes || []).map((c) => c.name).filter(Boolean)
      const classLine = classNames.length
        ? `\n\nThese classes will show no teacher until you reassign them:\n· ${classNames.join('\n· ')}`
        : ''
      if (data.can_delete) {
        const choice = await confirm({
          title: `Delete ${staff.name} permanently?`,
          body: `They have no attendance or finished tasks on record, so nothing is lost.${classLine}`,
          confirmLabel: 'Delete permanently',
          cancelLabel: 'Keep them',
        })
        if (!choice) { setRemoving(false); return }
        const r = await api.delete(`/api/sis/staff/${staff.id}?organization_id=${orgId}&mode=delete`)
        // The delete can still be refused by a record the preview never probed,
        // in which case the server archives them instead and explains why.
        if (r.data?.message) toast.success(r.data.message)
        else toast.success(`${r.data?.name || staff.name} deleted`)
      } else {
        const kinds = Object.keys(data.blocking || {}).join(', ')
        const choice = await confirm({
          title: `Archive ${staff.name}?`,
          body: `They can't be deleted because they have school records attached (${kinds}). `
            + 'Archiving hides them from staff lists and the directory without losing any history, '
            + `and can be undone.${classLine}`,
          confirmLabel: 'Archive',
          cancelLabel: 'Keep them',
        })
        if (!choice) { setRemoving(false); return }
        const r = await api.delete(`/api/sis/staff/${staff.id}?organization_id=${orgId}`)
        toast.success(`${r.data?.name || staff.name} archived`)
      }
      onRemoved?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove this person')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-4">
      {staff.is_placeholder ? (
        <form onSubmit={link} className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-3">
          <p className="text-sm text-amber-900">
            <span className="font-medium">No login yet.</span> Enter their real email address and
            we&apos;ll send them a setup email that explains their teacher account and walks them
            through choosing a password. If they already use Optio (for example as a parent), that
            account becomes the teacher account and keeps every class assignment.
          </p>
          <div>
            <label htmlFor="link-email" className="block text-sm font-medium text-neutral-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <Input id="link-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@example.com" className="text-sm" required autoFocus />
          </div>
          {linkError && <p className="text-sm text-red-600" role="alert">{linkError}</p>}
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={linking}>Link account</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          <Row label="Email">{staff.email}</Row>
          <Row label="Last active">{fmtDate(staff.last_active) || <span className="text-neutral-400">Never</span>}</Row>
          {staff.login_pending && (
            <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3">
              They&apos;ve been emailed a link to set up their account but haven&apos;t signed in
              yet. You can resend the setup email if it got lost.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {staff.login_pending && (
              <Button size="sm" variant="secondary" onClick={resendInvite} loading={resending}>Resend setup email</Button>
            )}
            {onViewPortal && (
              <Button size="sm" variant="secondary" onClick={onViewPortal}>View their portal</Button>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm text-neutral-600 mb-2">
          Removing hides them from staff lists and the directory. Anyone with school records
          attached is archived, not deleted, and can be brought back.
        </p>
        <Button size="sm" variant="danger" onClick={remove} loading={removing}>Remove from the school</Button>
      </div>
    </div>
  )
}

export default AccountPanel
