import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import EmptyState from '../../../components/ui/EmptyState'
import {
  getContact,
  getGmailStatus,
  createTask,
  updateTask,
  createDraft,
  updateDraft,
  discardDraft,
  sendDraft,
} from './crmApi'
import { formatDateTime, formatMetOn } from './crmConstants'

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const primaryButtonClass =
  'px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]'
const secondaryButtonClass =
  'px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 min-h-[44px]'
const cardClass = 'bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6'

const errorText = (err, fallback) => err?.response?.data?.error || fallback

const todayIso = () => new Date().toLocaleDateString('en-CA')

/** One to-do row: complete it, or dismiss an AI suggestion. */
const TaskRow = ({ task, onChanged }) => {
  const [busy, setBusy] = useState(false)
  const set = async (status) => {
    setBusy(true)
    try {
      await updateTask(task.id, { status })
      onChanged()
    } catch (err) {
      toast.error(errorText(err, 'Could not update the to-do'))
    } finally {
      setBusy(false)
    }
  }
  const done = task.status === 'done'
  const overdue = !done && task.due_on && task.due_on < todayIso()
  return (
    <li className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        aria-label={`Done: ${task.title}`}
        checked={done}
        disabled={busy}
        onChange={() => set(done ? 'open' : 'done')}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{task.title}</p>
        <p className="text-xs text-gray-500">
          {task.due_on ? (
            <span className={overdue ? 'font-semibold text-red-600' : ''}>
              {overdue ? 'Overdue, was due ' : 'Due '}
              {formatMetOn(task.due_on)}
            </span>
          ) : (
            'No due date'
          )}
          {task.status === 'suggested' && ' · Suggested by AI'}
        </p>
      </div>
      {task.status === 'suggested' && (
        <button onClick={() => set('open')} disabled={busy} className="text-sm font-medium text-optio-purple hover:underline">
          Keep
        </button>
      )}
      {!done && (
        <button onClick={() => set('dismissed')} disabled={busy} className="text-sm text-gray-400 hover:text-gray-700">
          Dismiss
        </button>
      )}
    </li>
  )
}

/**
 * An editable draft. Send is the only way it leaves; the click is the
 * approval, and the latest edit goes with it.
 */
const DraftEditor = ({ draft, gmailConnected, onChanged }) => {
  const [toEmail, setToEmail] = useState(draft.to_email)
  const [subject, setSubject] = useState(draft.subject)
  const [bodyText, setBodyText] = useState(draft.body_text)
  const [busy, setBusy] = useState(null)
  const dirty = toEmail !== draft.to_email || subject !== draft.subject || bodyText !== draft.body_text

  const run = async (kind, fn, success) => {
    setBusy(kind)
    try {
      await fn()
      if (success) toast.success(success)
      onChanged()
    } catch (err) {
      toast.error(errorText(err, 'That did not work'))
    } finally {
      setBusy(null)
    }
  }

  const fields = { to_email: toEmail, subject, body_text: bodyText }
  const canSend = gmailConnected && toEmail.includes('@') && bodyText.trim() && draft.status === 'draft'

  return (
    <div className="rounded-lg border border-optio-purple/30 bg-optio-purple/5 p-3 sm:p-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-optio-purple">
        {draft.origin === 'ai' ? 'Draft by AI' : 'Draft'}
        {draft.thread_id ? ' · reply' : ''}
      </p>
      {draft.reason && <p className="text-sm text-gray-600">{draft.reason}</p>}
      <input
        aria-label="To"
        type="email"
        value={toEmail}
        onChange={(e) => setToEmail(e.target.value)}
        className={inputClass}
      />
      <input
        aria-label="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className={inputClass}
      />
      <textarea
        aria-label="Message"
        rows={8}
        value={bodyText}
        onChange={(e) => setBodyText(e.target.value)}
        className={`${inputClass} resize-vertical`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => run('send', () => sendDraft(draft.id, fields), `Sent to ${toEmail}`)}
          disabled={!canSend || busy !== null}
          className={primaryButtonClass}
        >
          {busy === 'send' ? 'Sending...' : `Send to ${toEmail || '...'}`}
        </button>
        <button
          onClick={() => run('save', () => updateDraft(draft.id, fields), 'Draft saved')}
          disabled={!dirty || busy !== null}
          className={secondaryButtonClass}
        >
          {busy === 'save' ? 'Saving...' : 'Save draft'}
        </button>
        <button
          onClick={() => run('discard', () => discardDraft(draft.id))}
          disabled={busy !== null}
          className="px-3 py-2 text-sm text-gray-500 hover:text-red-600 min-h-[44px]"
        >
          Discard
        </button>
        {!gmailConnected && (
          <span className="text-xs text-gray-500">
            Connect Gmail on the <Link to="/admin/crm/today" className="text-optio-purple hover:underline">Today</Link> tab to send.
          </span>
        )}
      </div>
    </div>
  )
}

/** Messages grouped into threads, newest thread first. */
const threadsOf = (messages) => {
  const byThread = new Map()
  messages.forEach((m) => {
    if (!byThread.has(m.thread_id)) byThread.set(m.thread_id, [])
    byThread.get(m.thread_id).push(m)
  })
  return [...byThread.entries()]
    .map(([threadId, items]) => ({
      threadId,
      items: [...items].sort((a, b) => (a.sent_at < b.sent_at ? -1 : 1)),
    }))
    .sort((a, b) => (a.items[a.items.length - 1].sent_at < b.items[b.items.length - 1].sent_at ? 1 : -1))
}

const Thread = ({ thread, onReply, replying }) => {
  const [open, setOpen] = useState(false)
  const last = thread.items[thread.items.length - 1]
  return (
    <li className="py-3">
      <button onClick={() => setOpen(!open)} className="w-full text-left" aria-expanded={open}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-gray-900">
            {last.subject || '(no subject)'}
            {thread.items.length > 1 && <span className="ml-1 text-gray-400">({thread.items.length})</span>}
          </p>
          <p className="text-xs text-gray-500">{formatDateTime(last.sent_at)}</p>
        </div>
        <p className="text-xs text-gray-500">
          {last.direction === 'inbound' ? `From ${last.from_email}` : 'You wrote'}: {last.snippet}
        </p>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {thread.items.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg p-3 text-sm ${m.direction === 'inbound' ? 'bg-gray-50' : 'bg-blue-50'}`}
            >
              <p className="text-xs text-gray-500 mb-1">
                {m.direction === 'inbound' ? m.from_email : 'You'} · {formatDateTime(m.sent_at)}
              </p>
              <p className="whitespace-pre-line text-gray-800 break-words">{m.body_text || m.snippet}</p>
            </div>
          ))}
          <button onClick={() => onReply(thread.threadId)} disabled={replying} className={secondaryButtonClass}>
            Reply
          </button>
        </div>
      )}
    </li>
  )
}

/**
 * A contact's working file: to-dos, drafts and email with them. Keyed by
 * email, so a lead and the user account behind it share one history.
 */
const ContactWorkspace = ({ email }) => {
  const [data, setData] = useState(null)
  const [gmail, setGmail] = useState(null)
  const [title, setTitle] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [adding, setAdding] = useState(false)
  const [starting, setStarting] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await getContact(email)
      const d = res.data || {}
      setData({ ...d, messages: d.messages || [], tasks: d.tasks || [], drafts: d.drafts || [] })
    } catch (err) {
      toast.error(errorText(err, 'Could not load email and to-dos'))
    }
  }, [email])

  useEffect(() => {
    if (!email) return
    load()
    getGmailStatus()
      .then((res) => setGmail(res.data))
      .catch(() => setGmail({ connected: false }))
  }, [email, load])

  const threads = useMemo(() => threadsOf(data?.messages || []), [data])

  if (!email) return null
  if (!data) return null

  const addTask = async () => {
    setAdding(true)
    try {
      await createTask({ email, title: title.trim(), due_on: dueOn || null })
      setTitle('')
      setDueOn('')
      load()
    } catch (err) {
      toast.error(errorText(err, 'Could not add the to-do'))
    } finally {
      setAdding(false)
    }
  }

  const startDraft = async (threadId) => {
    setStarting(true)
    try {
      await createDraft({ email, thread_id: threadId })
      load()
    } catch (err) {
      toast.error(errorText(err, 'Could not start a draft'))
    } finally {
      setStarting(false)
    }
  }

  const openTasks = data.tasks.filter((t) => t.status !== 'done')
  const doneTasks = data.tasks.filter((t) => t.status === 'done').slice(0, 5)

  return (
    <div className="space-y-6">
      {data.client_org && (
        <p className="inline-block rounded-full bg-optio-purple/10 px-3 py-1 text-xs font-semibold text-optio-purple">
          Microschool client · {data.client_org}
        </p>
      )}

      <div className={cardClass}>
        <h3 className="text-lg font-bold text-gray-900 mb-3">To-dos</h3>
        {openTasks.length === 0 && doneTasks.length === 0 ? (
          <p className="text-sm text-gray-400 mb-3">Nothing to do for this contact.</p>
        ) : (
          <ul className="divide-y divide-gray-100 mb-3">
            {[...openTasks, ...doneTasks].map((task) => (
              <TaskRow key={task.id} task={task} onChanged={load} />
            ))}
          </ul>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            aria-label="New to-do"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && title.trim() && addTask()}
            placeholder="e.g. Send the pricing sheet"
            className={inputClass}
          />
          <input
            aria-label="Due date"
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
          <button onClick={addTask} disabled={!title.trim() || adding} className={primaryButtonClass}>
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-lg font-bold text-gray-900">Email</h3>
          <button onClick={() => startDraft(null)} disabled={starting} className={secondaryButtonClass}>
            New email
          </button>
        </div>
        {data.drafts.length > 0 && (
          <div className="space-y-3 mb-4">
            {data.drafts.map((draft) => (
              <DraftEditor
                key={`${draft.id}-${draft.updated_at}`}
                draft={draft}
                gmailConnected={!!gmail?.connected}
                onChanged={load}
              />
            ))}
          </div>
        )}
        {threads.length === 0 ? (
          <EmptyState
            plain
            title="No email yet"
            hint={gmail?.connected ? undefined : 'Connect Gmail on the Today tab to see your email with this contact.'}
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {threads.map((thread) => (
              <Thread key={thread.threadId} thread={thread} onReply={startDraft} replying={starting} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default ContactWorkspace
