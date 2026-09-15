import { useEffect, useRef, useState } from 'react'
import { func, oneOf, string } from 'prop-types'
import { toast } from 'react-hot-toast'
import { FlagIcon } from '@heroicons/react/24/outline'
import { REPORT_REASONS, reportContent } from '../../services/friendsAPI'

/**
 * ReportButton — a flag that opens the reason list and files a report.
 *
 * Used on a friend's comment and on a direct message (Friends phase 3), the
 * two places the moderation queue can take something down. FeedItemMenu
 * carries the same reasons for a whole post; this is the small version for
 * one line of text inside a thread.
 */
export default function ReportButton({ targetType, targetId, label = 'Report', className = '', onReported }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const handle = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const send = async (reason) => {
    setBusy(true)
    try {
      await reportContent(targetType, targetId, reason)
      toast.success('Thanks. We received your report and will review it.')
      setOpen(false)
      onReported?.()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not send that report.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 text-gray-400 hover:text-optio-purple hover:bg-gray-100 rounded-full transition-colors"
      >
        <FlagIcon className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg z-20 py-1 text-sm">
          <p className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Why are you reporting this?</p>
          {REPORT_REASONS.map((r) => (
            <button key={r.value} role="menuitem" type="button" disabled={busy} onClick={() => send(r.value)} className="w-full text-left px-3 py-2 hover:bg-gray-50 disabled:opacity-50">
              {r.label}
            </button>
          ))}
          <button role="menuitem" type="button" onClick={() => setOpen(false)} className="w-full text-left px-3 py-2 text-gray-500 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

ReportButton.propTypes = {
  targetType: oneOf(['peer_comment', 'message']).isRequired,
  targetId: string.isRequired,
  label: string,
  className: string,
  onReported: func,
}
