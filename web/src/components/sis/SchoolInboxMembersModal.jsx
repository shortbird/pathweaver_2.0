import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import { Modal } from '../ui'
import { useStaffRecipients, useSetSchoolInboxMembers } from '../../hooks/api/useSisMessaging'

/**
 * Who can open the school inbox. Ticket 19047fd0, Molly (iCreate, org_admin):
 * org admins choose. Org admins are always in. "Everyone in the office" (an
 * empty list) is every campus coordinator, which is how every school started.
 * The server holds the same rule (school_inbox_service.inbox_access) and
 * refuses a coordinator who tries to change it.
 */
export default function SchoolInboxMembersModal({ isOpen, ...props }) {
  return isOpen ? <MembersDialog {...props} /> : null
}

function MembersDialog({ onClose, orgId, memberIds = [] }) {
  const staffQuery = useStaffRecipients(orgId)
  const save = useSetSchoolInboxMembers(orgId)
  const [everyone, setEveryone] = useState(memberIds.length === 0)
  const [picked, setPicked] = useState(() => new Set(memberIds))
  const staff = staffQuery.data || []
  const admins = staff.filter((p) => (p.roles || []).includes('org_admin'))
  const coordinators = staff.filter((p) => !(p.roles || []).includes('org_admin')
    && (p.roles || []).includes('campus_coordinator'))

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const submit = async () => {
    const ids = everyone ? [] : coordinators.map((p) => p.id).filter((id) => picked.has(id))
    if (!everyone && ids.length === 0) {
      toast.error('Pick at least one coordinator, or choose everyone in the office')
      return
    }
    try {
      await save.mutateAsync(ids)
      toast.success('Inbox access saved')
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Could not save inbox access')
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Who can open the school inbox" size="md"
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">Cancel</button>
          <button type="button" onClick={submit} disabled={save.isPending || staffQuery.isLoading}
            className="px-4 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}>
      <div className="space-y-4 text-sm text-neutral-700">
        <p className="text-xs text-neutral-500">
          The people you pick read and answer family messages, get the inbox alerts, and can be given inbox tasks.
          Org admins always have access.
        </p>
        <fieldset className="space-y-1.5">
          <legend className="sr-only">Who has access</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="inbox-access" checked={everyone} onChange={() => setEveryone(true)} />
            Everyone in the office (all campus coordinators)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="inbox-access" checked={!everyone} onChange={() => setEveryone(false)} />
            Only the coordinators I pick
          </label>
        </fieldset>
        {staffQuery.isLoading ? (
          <p className="text-neutral-500">Loading staff…</p>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-neutral-600 mb-1">Org admins (always)</p>
              <ul className="space-y-1">
                {admins.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-neutral-500">
                    <input type="checkbox" checked disabled aria-label={`${p.name} (org admin)`} /> {p.name}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-600 mb-1">Campus coordinators</p>
              {coordinators.length === 0 ? (
                <p className="text-neutral-500">This school has no campus coordinators.</p>
              ) : (
                <ul className="space-y-1">
                  {coordinators.map((p) => (
                    <li key={p.id}>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" disabled={everyone}
                          checked={everyone || picked.has(p.id)} onChange={() => toggle(p.id)} />
                        {p.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
