import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import ChecklistSignature from '../ChecklistSignature'
import StatusPill from '../ui/StatusPill'
import AnnouncementBody from '../../announcements/AnnouncementBody'
import { itemDocuments } from '../../../pages/sis/checklistDocuments'
import { useConfirm } from '../../../contexts/ConfirmContext'

/**
 * One task, as the person it is assigned to sees it: its steps, done in
 * place, and the conversation about it.
 *
 * Every task in the school is one record since 2026-09-24 (iCreate meeting
 * 2026-09-23) -- the "do this" the office types, the multi-step list that was
 * a checklist, a document to sign, a daily duty, a follow-up on a message a
 * family sent. So there is one card for all of them, rendered on the staff
 * console's My tasks, the family To do page, a student's To do on /school and
 * the required-documents hold screen.
 *
 * A step is completed by doing it: a plain step by ticking it, a document
 * step by uploading (the server refuses a bare tick with nothing attached), a
 * signature step by signing (no checkbox at all), a link step by following
 * the link and ticking it. An approved step cannot be unticked; the office
 * decided it.
 *
 * `api` is taskApi or familyTaskApi (hooks/api/useTasks): the same calls
 * through the door the caller may use.
 */

const PRIORITY_STYLES = {
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

const fmtDay = (ymd) => {
  if (!ymd) return ''
  try {
    return new Date(`${String(ymd).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch { return String(ymd) }
}

const fmtWhen = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return '' }
}

function TaskStep({ task, item, api, statement, busy, onPatch, readOnly }) {
  const confirm = useConfirm()
  const done = ['complete', 'approved'].includes(item.status)
  const docs = itemDocuments(item)
  const needsUpload = item.needs_document && !done && !docs.length

  const upload = async (file) => {
    try {
      const path = await api.upload(task, file)
      await onPatch(item.key, { add_document: { path, filename: file.name }, status: 'complete' })
      toast.success('Document sent')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Upload failed')
    }
  }

  const removeDoc = async (doc) => {
    if (!(await confirm(`Remove ${doc.filename || 'this document'}?`))) return
    await onPatch(item.key, { remove_document: doc.path })
  }

  const open = async (getUrl) => {
    try {
      const url = await getUrl()
      if (url) window.open(url, '_blank', 'noopener')
      else toast.error('Could not open the document')
    } catch {
      toast.error('Could not open the document')
    }
  }

  return (
    <li className="py-2.5 flex items-start gap-3">
      {item.needs_signature ? (
        <span className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <input type="checkbox" checked={done}
          aria-label={`Done: ${item.title}`}
          disabled={busy || readOnly || item.status === 'approved' || needsUpload}
          title={needsUpload ? 'Upload the document to finish this step' : undefined}
          onChange={(e) => onPatch(item.key, { status: e.target.checked ? 'complete' : 'pending' })}
          className="mt-1 h-4 w-4 accent-purple-700" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm ${done ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
            {item.title}
          </span>
          {!item.required && <span className="text-xs text-neutral-400">optional</span>}
          {item.due_date && !task.due_date && (
            <span className="text-xs text-neutral-400">due {fmtDay(item.due_date)}</span>
          )}
          {item.status !== 'pending' && (
            <StatusPill domain="checklist_item" status={item.status} fallback="pending" />
          )}
          {item.needs_approval && item.status === 'complete' && (
            <span className="text-xs text-neutral-400">waiting for the office to approve</span>
          )}
        </div>
        {item.description && item.description !== task.description && (
          <div className="text-sm text-neutral-500 mt-0.5">
            <AnnouncementBody text={item.description} className="inline" />
          </div>
        )}
        {item.admin_notes && (
          <div className="text-sm text-amber-700 mt-0.5">
            Note: <AnnouncementBody text={item.admin_notes} className="inline text-amber-700" />
          </div>
        )}
        {item.link && (
          <a href={item.link} target="_blank" rel="noopener noreferrer"
            className="mt-1 inline-block text-sm text-optio-purple hover:underline">
            Open link
          </a>
        )}
        {item.needs_signature && (
          <ChecklistSignature item={item} statement={statement} busy={busy} disabled={readOnly}
            onSign={(fields) => onPatch(item.key, fields)}
            onOpenDoc={(doc) => open(() => api.signDocUrl(task, doc.id))} />
        )}
        {item.needs_document && (
          <div className="mt-1.5 space-y-1">
            {docs.map((doc) => (
              <div key={doc.secure_document_id || doc.path} className="flex items-center gap-3">
                {doc.secure_document_id ? (
                  // Filed by the office out of its own store: not this
                  // person's to open or take back.
                  <span className="text-sm text-neutral-600">
                    {doc.title || doc.filename || 'Document'}
                    <span className="text-xs text-neutral-400"> (on file with the office)</span>
                  </span>
                ) : (
                  <>
                    <button type="button" onClick={() => open(() => api.docUrl(task, doc.path))}
                      className="text-sm text-optio-purple hover:underline">
                      {doc.filename || 'View document'}
                    </button>
                    {!readOnly && item.status !== 'approved' && (
                      <button type="button" onClick={() => removeDoc(doc)}
                        className="text-xs text-red-600 hover:underline">Remove</button>
                    )}
                  </>
                )}
              </div>
            ))}
            {!readOnly && item.status !== 'approved' && (
              <label className="inline-block text-sm text-optio-purple hover:underline cursor-pointer">
                {docs.length ? 'Add another document' : 'Upload document'}
                <input type="file" className="hidden" disabled={busy}
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

/** The conversation under a task: the assignee, the person who assigned it
 *  and the school's admins. Loaded when opened. */
export function TaskComments({ taskId, api, count = 0 }) {
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || comments !== null) return
    api.comments(taskId).then(setComments).catch(() => setComments([]))
  }, [open, comments, api, taskId])

  const send = async (e) => {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    try {
      const c = await api.addComment(taskId, body.trim())
      setComments((prev) => [...(prev || []), c].filter(Boolean))
      setBody('')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not send that')
    } finally {
      setBusy(false)
    }
  }

  const shown = comments ?? []
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="text-sm text-optio-purple hover:underline">
        {open ? 'Hide comments' : `Comments${count ? ` (${count})` : ''}`}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {comments === null && <p className="text-sm text-neutral-400">Loading…</p>}
          {comments !== null && !shown.length && (
            <p className="text-sm text-neutral-400">No comments yet.</p>
          )}
          <ul className="space-y-2">
            {shown.map((c) => (
              <li key={c.id} className="rounded-lg bg-neutral-50 border border-gray-100 px-3 py-2">
                <div className="text-xs text-neutral-500">
                  <span className="font-medium text-neutral-700">{c.author_name || 'Someone'}</span>
                  {' '}{fmtWhen(c.created_at)}
                </div>
                <p className="text-sm text-neutral-800 whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
          <form onSubmit={send} className="flex items-start gap-2">
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2}
              aria-label="Write a comment" placeholder="Write a comment"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none" />
            <button type="submit" disabled={busy || !body.trim()}
              className="px-3 py-2 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
              {busy ? 'Sending…' : 'Send'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

export default function TaskCard({
  task, api, statement, onChanged, highlighted = false, showComments = true,
  showThreadLink = false,
}) {
  const [busyKey, setBusyKey] = useState(null)
  const ref = useRef(null)
  const readOnly = task.status === 'expired'

  // Opened from a notification (?task=<id>): bring the card into view once.
  useEffect(() => {
    if (highlighted && ref.current?.scrollIntoView) ref.current.scrollIntoView({ block: 'center' })
  }, [highlighted])

  const patch = async (itemKey, fields) => {
    setBusyKey(itemKey)
    try {
      await api.patchItem(task, itemKey, fields)
      onChanged?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update the task')
    } finally {
      setBusyKey(null)
    }
  }

  const items = task.items || []
  const single = items.length === 1 && items[0].title === task.title
  return (
    <article ref={ref} id={`task-${task.id}`}
      className={`bg-white rounded-xl border p-4 ${highlighted ? 'border-optio-purple ring-2 ring-optio-purple/30' : 'border-gray-200'}`}>
      <div className="flex items-start gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-neutral-900 flex-1 min-w-0">{task.title}</h3>
        {PRIORITY_STYLES[task.priority] && (
          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${PRIORITY_STYLES[task.priority]}`}>
            {task.priority}
          </span>
        )}
        <StatusPill domain="task" status={task.status} fallback="todo" />
      </div>
      <div className="mt-0.5 flex items-center gap-2 flex-wrap text-xs text-neutral-500">
        {task.occurrence_date && <span>For {fmtDay(task.occurrence_date)}</span>}
        {task.due_date && !task.occurrence_date && (
          <span className={task.overdue ? 'text-red-600 font-medium' : ''}>
            {task.overdue ? 'Overdue, due' : 'Due'} {fmtDay(task.due_date)}
          </span>
        )}
        {task.assigned_by_name && <span>From {task.assigned_by_name}</span>}
        {items.length > 1 && <span>{task.done_count} of {task.total_count} done</span>}
      </div>
      {task.description && (
        <div className="mt-2 text-sm text-neutral-600 whitespace-pre-line">
          <AnnouncementBody text={task.description} />
        </div>
      )}
      {task.action === 'reply' && (
        <div className="mt-2 rounded-lg bg-optio-purple/5 border border-optio-purple/20 px-3 py-2 text-sm text-neutral-700 flex items-center gap-3 flex-wrap">
          <span>This task is a reply: answer the message it came from.</span>
          {showThreadLink && task.thread_link && (
            <Link to={task.thread_link} className="font-medium text-optio-purple hover:underline">
              Open the thread
            </Link>
          )}
        </div>
      )}
      {readOnly && (
        <p className="mt-2 text-sm text-neutral-500">This was for {fmtDay(task.occurrence_date || task.due_date)} and has expired.</p>
      )}
      <ul className={`${single ? '' : 'mt-1 divide-y divide-gray-100'}`}>
        {items.map((item) => (
          <TaskStep key={item.key} task={task} item={item} api={api}
            statement={statement || task.signature_statement}
            busy={busyKey === item.key} onPatch={patch} readOnly={readOnly} />
        ))}
      </ul>
      {showComments && <TaskComments taskId={task.id} api={api} count={task.comment_count || 0} />}
    </article>
  )
}
