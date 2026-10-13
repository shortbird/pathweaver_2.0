import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ArrowLeftIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { useSentMessages, useSentMessage, useChangeSentMessage } from '../../hooks/api/useSisMessaging'
import { useAuth } from '../../contexts/AuthContext'
import { formatMessageTime } from '../communication/MessageParts'
import { Spinner } from '../ui/Spinner'
import ConfirmDialog from '../ui/ConfirmDialog'

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
 *
 * iCreate, 2026-10-13: a coordinator's question for Marika went out with an
 * announcement to 334 people, and nothing in the console could take it back.
 * Whoever sent it can now Edit or Delete it here, for every copy at once.
 * Push notifications and email copies already went out and stay as they were.
 */

const errorText = (e, fallback) => e?.response?.data?.error || fallback

const KIND_LABEL = { staff: 'Staff', family: 'Parent', student: 'Student' }

const preview = (s) => s.subject || (s.body || '').split('\n')[0] || 'Message'

/**
 * `search` is the page's thread-name search, already lower-cased: it matches
 * the subject (or first line) and who sent it, never the body (80d52c32).
 */
export default function SentMessagesPanel({ orgId, search = '' }) {
  const [open, setOpen] = useState(null)
  const [draft, setDraft] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { user } = useAuth()
  const sendsQuery = useSentMessages(orgId)
  const detailQuery = useSentMessage(orgId, open)
  const change = useChangeSentMessage(orgId)
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

  const saveEdit = async () => {
    try {
      const res = await change.mutateAsync({ sendId: open, subject: draft.subject, body: draft.body })
      toast.success(`Updated for ${res.changed ?? 'every'} ${res.changed === 1 ? 'person' : 'people'}`)
      setDraft(null)
    } catch (e) {
      toast.error(errorText(e, 'Could not update the message'))
    }
  }

  const deleteSend = async () => {
    try {
      const res = await change.mutateAsync({ sendId: open })
      toast.success(`Deleted for ${res.removed ?? 'every'} ${res.removed === 1 ? 'person' : 'people'}`)
    } catch (e) {
      toast.error(errorText(e, 'Could not delete the message'))
      throw e
    }
  }

  if (open) {
    const mine = detail && user?.id && detail.sent_by === user.id && !detail.deleted_at
    const deliveredNote = detail?.email
      ? 'Push notifications and the email copies already went out and will not change.'
      : 'Push notifications already went out and will not change.'
    return (
      <div className="p-4">
        <button type="button" onClick={() => { setOpen(null); setDraft(null) }}
          className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-optio-purple mb-3">
          <ArrowLeftIcon className="w-4 h-4" /> All sent messages
        </button>
        {!detail ? (
          <div className="flex items-center justify-center h-32"><Spinner /></div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-neutral-900 min-w-0">{preview(detail)}</h2>
              {mine && !draft && (
                <div className="flex-shrink-0 flex gap-2">
                  <button type="button" className="btn-quiet text-sm"
                    onClick={() => setDraft({ subject: detail.subject || '', body: detail.body || '' })}>
                    Edit
                  </button>
                  <button type="button" className="btn-quiet text-sm text-red-600"
                    onClick={() => setConfirmDelete(true)}>
                    Delete
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              {formatMessageTime(detail.created_at)} · {detail.mode === 'group' ? 'One group thread' : 'A private thread each'}
              {detail.email ? ' · also emailed' : ''}{detail.push ? '' : ' · no push'}
              {detail.edited_at && !detail.deleted_at ? ` · edited ${formatMessageTime(detail.edited_at)}` : ''}
            </p>
            {detail.deleted_at && (
              <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-3">
                Deleted for everyone {formatMessageTime(detail.deleted_at)}. Only the office sees this copy.
              </p>
            )}
            {draft ? (
              <div className="mt-3 space-y-2">
                <input type="text" value={draft.subject} placeholder="Subject (optional)"
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <textarea value={draft.body} rows={10}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <p className="text-xs text-neutral-500">
                  Saving changes the message for all {detail.recipient_count} people. {deliveredNote}
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-quiet text-sm" disabled={change.isPending}
                    onClick={() => setDraft(null)}>Cancel</button>
                  <button type="button" className="btn-primary text-sm"
                    disabled={change.isPending || !draft.body.trim()} onClick={saveEdit}>
                    {change.isPending ? 'Saving...' : 'Save for everyone'}
                  </button>
                </div>
              </div>
            ) : (
              <p className={`text-sm whitespace-pre-wrap mt-3 bg-gray-50 rounded-lg p-3 ${detail.deleted_at ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>{detail.body}</p>
            )}
            <ConfirmDialog isOpen={confirmDelete} onClose={() => setConfirmDelete(false)}
              title="Delete for everyone?" confirmLabel="Delete for everyone" destructive
              onConfirm={deleteSend}>
              <p>This removes the message from all {detail.recipient_count} people&apos;s threads. Replies they already wrote stay.</p>
              <p>{deliveredNote}</p>
            </ConfirmDialog>
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

  const shown = search
    ? sends.filter((s) => [preview(s), s.sent_by_name].some((n) => (n || '').toLowerCase().includes(search)))
    : sends
  if (!shown.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 p-4 text-center">
        <PaperAirplaneIcon className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-sm font-medium text-neutral-700 mb-1">No conversations match</p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-gray-100">
      {shown.map((s) => (
        <li key={s.id}>
          <button type="button" onClick={() => setOpen(s.id)}
            className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-neutral-900 truncate">
                {s.deleted_at && <span className="mr-1.5 text-xs font-semibold text-red-600">Deleted</span>}
                {preview(s)}
              </span>
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
