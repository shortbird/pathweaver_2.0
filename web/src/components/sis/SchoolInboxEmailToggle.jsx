import React from 'react'
import { toast } from 'react-hot-toast'
import { useSetSchoolInboxEmailMe } from '../../hooks/api/useSisMessaging'

/**
 * "Email me every message" on the school inbox (2026-10-09).
 *
 * Optio Academy's inbox has no org admin or coordinator, so nobody heard about
 * its messages. Each reader can now have every message emailed to them, and
 * answer by replying to the email: the reply goes out here, as the school.
 *
 * `access` is the GET /api/school-inbox/access answer; the switch stays
 * disabled until it arrives, because that is what says whether it is on.
 *
 * `onManageAccess` set shows the org admins' "Inbox access" button beside it
 * (19047fd0); it lives here so the page stays under its size cap.
 */
const SchoolInboxEmailToggle = ({ orgId, orgName, access, onManageAccess = null }) => {
  const mutation = useSetSchoolInboxEmailMe(orgId)
  const on = access?.email_me === true
  const replies = access?.email_replies === true

  const toggle = () => mutation.mutate(!on, {
    onSuccess: () => toast.success(on
      ? 'You will no longer get these emails.'
      : `You will get an email for every message to the ${orgName || 'school'} inbox.`),
    onError: () => toast.error('Could not save that. Try again.'),
  })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" role="switch" aria-checked={on}
        disabled={mutation.isPending || !access}
        onClick={toggle}
        title={replies ? 'Reply to an email and your reply goes out here, as the school.' : undefined}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm disabled:opacity-60 ${on
          ? 'border-optio-purple bg-optio-purple/10 text-optio-purple'
          : 'border-gray-300 text-neutral-700 hover:border-optio-purple hover:text-optio-purple'}`}>
        {on ? 'Emailing me every message' : 'Email me every message'}
      </button>
      {onManageAccess && (
        <button type="button" onClick={onManageAccess}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:border-optio-purple hover:text-optio-purple">
          Inbox access
        </button>
      )}
    </div>
  )
}

export default SchoolInboxEmailToggle
