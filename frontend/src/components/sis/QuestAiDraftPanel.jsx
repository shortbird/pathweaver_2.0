import React, { useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { SparklesIcon, DocumentArrowUpIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { blankTask } from './QuestDraftForm'

/**
 * Start a quest from material the school already has.
 *
 * iCreate, 2026-08-12: "Integrate an AI tool that allows you to paste context
 * (such as a list of tasks or document text) to automatically generate Quest
 * structures and tasks."
 *
 * It fills the form rather than replacing it. The draft lands in the same
 * fields staff would have typed into, and saving is still their separate,
 * deliberate click — so nothing a model wrote reaches a student unread. That is
 * also why this sits above the form instead of being a "generate quest" button
 * that creates one: the review step IS the feature.
 *
 * Filling is destructive to whatever is in the form, so it asks first once
 * there is something to lose.
 */

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

export default function QuestAiDraftPanel({ onDrafted, hasDraft, alwaysOpen = false }) {
  // Collapsed by default where it sits above a form somebody may already be
  // typing into; always open where it IS the container (the curriculum page).
  const [open, setOpen] = useState(alwaysOpen)
  const [context, setContext] = useState('')
  const [notes, setNotes] = useState('')
  const [taskCount, setTaskCount] = useState(4)
  // The chosen document is held until Generate is pressed rather than sent the
  // instant it is picked. Choosing a file used to start the run on the spot,
  // which meant the notes and task-count fields above it were whatever they
  // happened to be — iCreate: "when you upload the document, it starts
  // generating it automatically, it'd be better if it let me click the generate
  // draft button when I was ready."
  const [file, setFile] = useState(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const apply = (quest, sourceMaterial = '') => {
    const tasks = (quest.tasks || []).map((t) => ({ ...blankTask(), ...t }))
    onDrafted({
      title: quest.title || '',
      description: quest.description || '',
      tasks: tasks.length ? tasks : [blankTask()],
      // The text the draft was built from. A caller that lets learners generate
      // their own tasks keeps it, so those tasks are about the actual document
      // rather than a general version of the topic.
      sourceMaterial,
    })
    toast.success(`Draft ready — ${tasks.length} task${tasks.length === 1 ? '' : 's'} to review`)
    if (!alwaysOpen) setOpen(false)
    setContext(''); setNotes(''); setFileName(''); setFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const generate = async () => {
    if (!file && !context.trim()) {
      toast.error('Paste some context or choose a document first')
      return
    }
    if (hasDraft && !window.confirm('Replace what is currently in the form with the generated draft?')) return
    setBusy(true)
    try {
      let res
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('notes', notes)
        fd.append('task_count', String(taskCount))
        res = await api.post('/api/sis/quest-drafts/generate', fd,
          { headers: { 'Content-Type': 'multipart/form-data' } })
      } else {
        res = await api.post('/api/sis/quest-drafts/generate', {
          context: context.trim(), notes: notes.trim(), task_count: taskCount,
        })
      }
      if (!res.data?.quest) throw new Error()
      if (res.data.truncated) {
        toast('Only the first part of that document was used — it is very long.', { icon: 'ℹ️' })
      }
      apply(res.data.quest, res.data.source_material || '')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not build a quest from that')
    } finally {
      setBusy(false)
    }
  }

  const onFile = (e) => {
    const chosen = e.target.files?.[0]
    if (!chosen) return
    setFile(chosen)
    setFileName(chosen.name)
  }

  if (!open && !alwaysOpen) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-optio-purple hover:underline">
        <SparklesIcon className="w-4 h-4" /> Build it from something I already have
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-optio-purple/30 bg-optio-purple/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <SparklesIcon className="w-4 h-4 text-optio-purple" />
        <h5 className="text-sm font-semibold text-neutral-800">Build from something you have</h5>
        {!alwaysOpen && (
          <button type="button" onClick={() => setOpen(false)}
            className="ml-auto text-xs text-neutral-500 hover:underline">Close</button>
        )}
      </div>
      <p className="text-xs text-neutral-500">
        Paste a syllabus, a unit outline, or a list of activities — or upload the document — and
        it becomes a draft quest with tasks. Nothing is saved until you review it and click create.
      </p>

      <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={6}
        aria-label="Source material"
        placeholder={'Paste your material here.\n\nFor example: a week-by-week outline, the activities you already run, or the description you send families.'}
        className={`${inputCls} resize-y`} />

      <input value={notes} onChange={(e) => setNotes(e.target.value)}
        aria-label="What to emphasise"
        placeholder="Anything to emphasise? (optional — e.g. hands-on, ages 8-10)"
        className={inputCls} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          Tasks
          <select value={taskCount} onChange={(e) => setTaskCount(Number(e.target.value))}
            aria-label="How many tasks to generate"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>

        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,.csv"
          onChange={onFile} className="hidden" aria-label="Upload a document" />
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-neutral-700 hover:bg-gray-50 disabled:opacity-50">
          <DocumentArrowUpIcon className="w-4 h-4" />
          {fileName || 'Upload a document'}
        </button>

        <button type="button" disabled={busy || !(file || context.trim())} onClick={generate}
          className="ml-auto px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
          {busy ? 'Reading it…' : 'Generate draft'}
        </button>
      </div>
      {file && !busy && (
        <p className="text-xs text-neutral-600">
          Ready to read <span className="font-medium">{fileName}</span> — set the tasks and
          emphasis above, then press Generate draft.
        </p>
      )}
      <p className="text-[11px] text-neutral-400">
        PDF, Word, or text, up to 5MB. A scanned PDF is a picture of words, so its text has to be pasted.
      </p>
    </div>
  )
}
