import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ArrowLeftIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { useSentMessages, useSentMessage } from '../../hooks/api/useSisMessaging'
import { formatMessageTime } from '../communication/MessageParts'
import { Spinner } from '../ui/Spinner'

/**
 * What the office sent with Compose, and who has read it.
 *
 * iCreate, 2026-09-23 (9b46c748): "add read receipts." A message to forty
 * families is forty threads, and until each send was recorded
 * (message_sends) there was no way to ask "did they get it?" short of opening
 * every one. Each send says "Read by 12 of 40"; opening it lists who, unread
 * first, because they are who the office is looking for.
 *
 * A separate send is read when the person opens their thread; a group send
 * when they open the group past the message.
 */

const KIND_LABEL = { staff: 'Staff', family: 'Parent', student: 'Student' }

const preview = (s) => s.subject || (s.body || '').split('\n')[0] || 'Message'

export default function SentMessagesPanel({ orgId }) {
  const [open, setOpen] = useState(null)
  const sendsQuery = useSentMessages(orgId)
  const detailQuery = useSentMessage(orgId, open)
  const sends = sendsQuery.isError ? [] : (sendsQuery.data ?? null)
  const detail = detailQuery.data || null

  useEffect(() => {
    if (sendsQuery.isError) toast.error('Could not load sent messages')
  }, [sendsQuery.isError])
  useEffect(() => {
    if (detailQuery.isError) toast.error('Could not load who read it')
  }, [detailQuery.isError])

  if (sends === null) {
    return <div className="flex items-center justify-center h-40"><Spinner /></div>
  }

  if (open) {
    return (
      <div className="p-4">
        <button type="button" onClick={() => setOpen(null)}
          className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-optio-purple mb-3">
          <ArrowLeftIcon className="w-4 h-4" /> All sent messages
        </button>
        {!detail ? (
          <div className="flex items-center justify-center h-32"><Spinner /></div>
        ) : (
          <div>
            <h2 className="text-base font-semibold text-neutral-900">{preview(detail)}</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {formatMessageTime(detail.created_at)} · {detail.mode === 'group' ? 'One group thread' : 'A private thread each'}
              {detail.email ? ' · also emailed' : ''}{detail.push ? '' : ' · no push'}
            </p>
            <p className="text-sm text-neutral-700 whitespace-pre-wrap mt-3 bg-gray-50 rounded-lg p-3">{detail.body}</p>
            <p className="text-sm font-semibold text-neutral-800 mt-4 mb-2">
              Read by {detail.read_count} of {detail.recipient_count}
            </p>
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {detail.recipients.map((r) => (
                <li key={r.user_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {r.name}
                    <span className="ml-2 text-xs text-neutral-400">{KIND_LABEL[r.kind] || ''}</span>
                  </span>
                  <span className={`flex-shrink-0 text-xs ${r.status !== 'sent' ? 'text-red-600'
                    : r.read_at ? 'text-green-700' : 'text-neutral-500'}`}>
                    {r.status !== 'sent' ? 'Could not be reached'
                      : r.read_at ? `Read ${formatMessageTime(r.read_at)}` : 'Not read yet'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  if (!sends.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 p-4 text-center">
        <PaperAirplaneIcon className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-sm font-medium text-neutral-700 mb-1">Nothing sent yet</p>
        <p className="text-xs text-neutral-500">Messages you send with Compose show up here, with who has read them.</p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-gray-100">
      {sends.map((s) => (
        <li key={s.id}>
          <button type="button" onClick={() => setOpen(s.id)}
            className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-neutral-900 truncate">{preview(s)}</span>
              <span className="block text-xs text-neutral-500 truncate">
                {formatMessageTime(s.created_at)}{s.sent_by_name ? ` · by ${s.sent_by_name}` : ''}
                {' · '}{s.mode === 'group' ? 'group thread' : 'separately'}
              </span>
            </span>
            <span className="flex-shrink-0 text-xs font-semibold text-optio-purple">
              Read by {s.read_count} of {s.recipient_count}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
