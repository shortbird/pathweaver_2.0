import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PageLoader } from '../../../components/ui'
import { listBroadcasts, getBroadcast } from './crmApi'
import { formatDate } from './crmConstants'

const secondaryButton =
  'px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 min-h-[44px]'

const STATUS_CLASS = {
  sent: 'text-green-700',
  failed: 'text-red-700',
  skipped: 'text-gray-500',
  queued: 'text-amber-700',
}

/**
 * Every mail-merge send, newest first, and who got each one. "Use again"
 * opens the composer with that email's subject, body and billing sheet,
 * addressed to whichever list is open now.
 */
const BroadcastHistory = ({ onClose, onReuse }) => {
  const [broadcasts, setBroadcasts] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    listBroadcasts()
      .then((r) => setBroadcasts(r.data.broadcasts || []))
      .catch(() => {
        toast.error('Could not load sent emails')
        setBroadcasts([])
      })
  }, [])

  const show = (id) =>
    getBroadcast(id)
      .then((r) => setOpen(r.data))
      .catch(() => toast.error('Could not load that email'))

  if (!broadcasts) return <PageLoader />

  if (open) {
    const b = open.broadcast
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setOpen(null)} className={secondaryButton}>
            All sent emails
          </button>
          <button type="button" onClick={() => onReuse(b)} className={secondaryButton}>
            Use again
          </button>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
          <h3 className="text-lg font-semibold break-words">{b.subject}</h3>
          <p className="text-sm text-gray-500">
            {formatDate(b.created_at)}
            {b.list_name ? ` to "${b.list_name}"` : ''}: {b.sent_count} sent, {b.failed_count} failed, {b.skipped_count}{' '}
            skipped{b.status === 'sending' ? ' (still sending)' : ''}
          </p>
          <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans bg-gray-50 rounded-lg p-3">{b.body}</pre>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Person</th>
                <th className="px-3 py-3">Subject they got</th>
                <th className="px-3 pr-4 py-3">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {open.recipients.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium text-gray-900">{r.name}</div>
                    <div className="break-all text-gray-500">{r.email}</div>
                  </td>
                  <td className="px-3 py-3 text-sm">{r.subject || '-'}</td>
                  <td className={`px-3 pr-4 py-3 text-sm ${STATUS_CLASS[r.status] || ''}`}>
                    {r.status}
                    {r.reason ? `: ${r.reason}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h2 className="text-2xl font-bold flex-1">Sent emails</h2>
        <button type="button" onClick={onClose} className={secondaryButton}>
          Back to the list
        </button>
      </div>
      {broadcasts.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing sent from here yet.</p>
      ) : (
        <ul className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-200">
          {broadcasts.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => show(b.id)} className="w-full text-left px-4 py-3 hover:bg-gray-50 min-h-[44px]">
                <div className="font-medium text-gray-900 break-words">{b.subject}</div>
                <div className="text-sm text-gray-500">
                  {formatDate(b.created_at)}
                  {b.list_name ? ` to "${b.list_name}"` : ''}: {b.sent_count} sent
                  {b.failed_count ? `, ${b.failed_count} failed` : ''}
                  {b.status === 'sending' ? ' (sending)' : ''}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default BroadcastHistory
