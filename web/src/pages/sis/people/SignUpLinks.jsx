import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'

import { RolePill } from '../../../components/ui/RolePill'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { sisPeopleApi } from '../../../hooks/api/useSisPeople'
import { getLearningOrigin } from '../../../utils/appSurface'

/**
 * + Add > "Sign-up links": the school's standing join link for each role, and
 * the email invitations nobody has accepted yet (2026-10-15).
 *
 * Both were the web organization console's "Account Creation Links" card,
 * which went away when every org became an SIS org. The links are one per
 * role and never expire; the backend makes them on first read
 * (user_invitations.get_standing_invitation_links). Anyone holding a link can
 * make an account at this school with that role, which is why the copy says
 * so beside them.
 *
 * Links point at the learning app (getLearningOrigin), not at this page's
 * host: /invitation/<code> is a learning-app page, and the console built the
 * address from window.location.origin.
 */

const ROLE_ORDER = ['student', 'parent', 'advisor']
const ROLE_LABEL = { student: 'Students', parent: 'Parents', advisor: 'Teachers' }

// What org_invitations calls a standing link: a placeholder email, not a person.
const isLinkRow = (inv) => (inv.email || '').startsWith('link-invite-') && (inv.email || '').endsWith('@pending.optio.local')

const fmtDate = (d) => {
  try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '' }
}

export const signUpUrl = (code) => `${getLearningOrigin()}/invitation/${code}`

export default function SignUpLinks({ orgId, onBack }) {
  const confirm = useConfirm()
  const [links, setLinks] = useState(null)
  const [pending, setPending] = useState(null)
  const [copied, setCopied] = useState(null)

  const loadPending = useCallback(() => {
    sisPeopleApi.pendingInvitations(orgId)
      .then((r) => setPending((r.data?.invitations || []).filter((i) => !isLinkRow(i))))
      .catch(() => setPending([]))
  }, [orgId])

  useEffect(() => {
    sisPeopleApi.signUpLinks(orgId)
      .then((r) => setLinks(r.data?.links || []))
      .catch(() => setLinks([]))
    loadPending()
  }, [orgId, loadPending])

  const copy = async (link) => {
    try {
      await navigator.clipboard.writeText(signUpUrl(link.invitation_code))
      setCopied(link.role)
      toast.success('Link copied')
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error('Your browser blocked the clipboard. Select the link and copy it.')
    }
  }

  const cancel = async (inv) => {
    if (!(await confirm(`Cancel the invitation to ${inv.email}? The link in their email stops working.`))) return
    try {
      await sisPeopleApi.cancelInvitation(orgId, inv.id)
      toast.success('Invitation cancelled')
      loadPending()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not cancel the invitation')
    }
  }

  const sorted = (links || []).slice().sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))

  return (
    <div className="space-y-5 text-sm">
      <section>
        <p className="text-neutral-600 mb-2">
          Anyone with one of these links can make their own account at your school with that role.
          The links do not expire. Share them only with the people they are for.
        </p>
        {links === null ? <p className="text-neutral-400">Loading…</p>
          : sorted.length === 0 ? <p className="text-neutral-400">No sign-up links are available.</p>
          : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200" aria-label="Sign-up links">
              {sorted.map((l) => (
                <li key={l.role} className="px-3 py-2.5 flex items-center gap-3">
                  <span className="w-20 shrink-0 font-medium text-neutral-800">{ROLE_LABEL[l.role] || l.role}</span>
                  <span className="flex-1 min-w-0 font-mono text-xs text-neutral-500 break-all select-all">
                    {signUpUrl(l.invitation_code)}
                  </span>
                  <button type="button" onClick={() => copy(l)}
                    className="shrink-0 text-xs font-medium text-optio-purple hover:underline">
                    {copied === l.role ? 'Copied' : 'Copy'}
                  </button>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Waiting email invitations</h4>
        {pending === null ? <p className="text-neutral-400">Loading…</p>
          : pending.length === 0 ? <p className="text-neutral-400">Nobody has an unanswered email invitation.</p>
          : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200" aria-label="Waiting email invitations">
              {pending.map((inv) => (
                <li key={inv.id} className="px-3 py-2 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium text-neutral-800 break-all">{inv.email}</span>
                    {inv.invited_name && <span className="text-neutral-500 ml-2">{inv.invited_name}</span>}
                    <span className="ml-2 inline-flex"><RolePill role={inv.role} /></span>
                    {inv.expires_at && <span className="block text-xs text-neutral-400">Expires {fmtDate(inv.expires_at)}</span>}
                  </span>
                  <button type="button" onClick={() => cancel(inv)}
                    className="shrink-0 text-xs font-medium text-red-600 hover:underline">Cancel</button>
                </li>
              ))}
            </ul>
          )}
      </section>

      {onBack && <button type="button" onClick={onBack} className="text-sm text-neutral-500 hover:underline">Back</button>}
    </div>
  )
}
