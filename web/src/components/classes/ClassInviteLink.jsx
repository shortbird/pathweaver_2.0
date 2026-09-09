import React, { useState } from 'react'
import { LinkIcon, ClipboardDocumentIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import classService from '../../services/classService'

/**
 * ClassInviteLink - the class's standing join link (blocks P2)
 *
 * One button in the students-tab header. First click creates (or fetches) the
 * link and reveals it in a row with Copy and Reset. Anyone who opens the link
 * joins the org as a student (new accounts) or, if already a member, is simply
 * enrolled in this class. Reset rotates the code so a leaked link dies.
 */
export default function ClassInviteLink({ orgId, classId }) {
  const [link, setLink] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Invite link copied')
    } catch {
      toast.error('Could not copy — select the link text instead')
    }
  }

  const reveal = async () => {
    if (open) {
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      const response = await classService.createClassInviteLink(orgId, classId)
      if (response.success && response.link) {
        setLink(response.link)
        setOpen(true)
        copy(response.link)
      } else {
        toast.error(response.error || 'Failed to get invite link')
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to get invite link')
    } finally {
      setBusy(false)
    }
  }

  const rotate = async () => {
    if (!confirm('Reset the invite link? The current link will stop working.')) return
    setBusy(true)
    try {
      const response = await classService.createClassInviteLink(orgId, classId, { rotate: true })
      if (response.success && response.link) {
        setLink(response.link)
        toast.success('Invite link reset')
      } else {
        toast.error(response.error || 'Failed to reset invite link')
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to reset invite link')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={reveal}
        disabled={busy}
        className="flex items-center gap-2 px-4 py-2 text-optio-purple border border-optio-purple/30 rounded-lg hover:bg-optio-purple/5 transition-colors disabled:opacity-40"
        title="A shareable link that enrolls students in this class"
      >
        <LinkIcon className="w-5 h-5" />
        Invite link
      </button>

      {open && link && (
        <div className="absolute left-0 right-0 top-full mt-2 z-10 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700"
          />
          <button
            onClick={() => copy(link)}
            className="flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-optio-purple hover:bg-optio-purple/5"
          >
            <ClipboardDocumentIcon className="w-4 h-4" />
            Copy
          </button>
          <button
            onClick={rotate}
            disabled={busy}
            className="flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40"
            title="Invalidate this link and make a new one"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Reset
          </button>
        </div>
      )}
    </>
  )
}
