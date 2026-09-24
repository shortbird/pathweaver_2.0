import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Modal } from '../ui'
import SearchSelect from '../ui/SearchSelect'
import { useStaffRecipients, useMakeThreadTask } from '../../hooks/api/useSisMessaging'
import { INPUT_CLASS as field } from '../ui/Input'

/**
 * "Make a task" from a school-inbox thread, or from one message in it.
 *
 * iCreate, 2026-09-23 (bf8b754d): "Replies in messaging can be turned into
 * tasks and assigned to school staff. these show in the assignee's tasks page.
 * if the task is to reply, they click the task and are directed to the message
 * thread to reply. otherwise they can mark the task as done." And d93b24d2:
 * the person given the task may be a teacher with no school inbox -- "they get
 * the whole thread and can reply."
 *
 * The server writes the task and gives the assignee the thread until the task
 * is done (thread_task_service). Their reply goes out as the school with their
 * name shown to the family.
 */

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

/** Mounted only while open, so each task starts from a clean form. */
export default function MakeTaskModal({ isOpen, ...props }) {
  return isOpen ? <MakeTaskDialog {...props} /> : null
}

function MakeTaskDialog({ onClose, orgId, conversationId = null, groupId = null,
  message = null, threadLabel = '', onCreated }) {
  const staffQuery = useStaffRecipients(orgId)
  const staff = staffQuery.isError ? [] : (staffQuery.data ?? null)
  const makeTask = useMakeThreadTask(orgId)
  const [assignee, setAssignee] = useState('')
  const [action, setAction] = useState('reply')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('normal')
  const [note, setNote] = useState('')
  const busy = makeTask.isPending

  useEffect(() => {
    if (staffQuery.isError) toast.error('Could not load the staff list')
  }, [staffQuery.isError])

  const save = async () => {
    if (!assignee) { toast.error('Choose who the task is for'); return }
    try {
      await makeTask.mutateAsync({
        conversationId,
        groupId,
        assignee_id: assignee,
        action,
        priority,
        due_date: dueDate || undefined,
        note: note.trim() || undefined,
        message_id: message?.id || undefined,
      })
      const who = staff?.find((p) => p.id === assignee)?.name || 'them'
      toast.success(`Task made for ${who}. They can open this thread from their tasks.`)
      onCreated?.()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Could not make the task')
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Make a task" size="md"
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">Cancel</button>
          <button type="button" onClick={save} disabled={busy || !assignee}
            className="px-4 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'Saving…' : 'Make task'}
          </button>
        </div>
      )}>
      <div className="space-y-4">
        {(message?.message_content || threadLabel) && (
          <div className="rounded-lg bg-gray-50 p-3 text-sm text-neutral-700">
            {message?.message_content
              ? <p className="whitespace-pre-wrap line-clamp-4">{message.message_content}</p>
              : <p>The whole thread with {threadLabel}.</p>}
          </div>
        )}
        <div>
          <span className="block text-xs font-medium text-neutral-600 mb-1">Who</span>
          {staff === null ? (
            <p className="text-sm text-neutral-500">Loading staff…</p>
          ) : (
            <SearchSelect value={assignee} onChange={setAssignee} options={staff}
              getId={(p) => p.id}
              getLabel={(p) => ((p.role_labels || []).length ? `${p.name} (${p.role_labels.join(', ')})` : p.name)}
              placeholder="Search staff" />
          )}
          <span className="block text-xs text-neutral-500 mt-1">
            They can read the whole thread and answer it as the school until the task is done.
          </span>
        </div>
        <fieldset>
          <legend className="text-xs font-medium text-neutral-600 mb-1">What to do</legend>
          <div className="space-y-1.5 text-sm text-neutral-700">
            <label className="flex items-start gap-2">
              <input type="radio" name="task-action" className="mt-0.5"
                checked={action === 'reply'} onChange={() => setAction('reply')} />
              <span>Reply in this thread
                <span className="block text-xs text-neutral-500">The task opens the thread. The family sees their name with the school&apos;s.</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="task-action" className="mt-0.5"
                checked={action === 'do'} onChange={() => setAction('do')} />
              <span>Do something about it
                <span className="block text-xs text-neutral-500">They mark the task done when it is handled.</span>
              </span>
            </label>
          </div>
        </fieldset>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs font-medium text-neutral-600 block">Due (optional)
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="text-xs font-medium text-neutral-600 block">Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={`${field} mt-1`}>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
        </div>
        <label className="text-xs font-medium text-neutral-600 block">Note (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000}
            placeholder="Anything they should know" className={`${field} mt-1`} />
        </label>
      </div>
    </Modal>
  )
}
