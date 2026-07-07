import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import { SparklesIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

/**
 * AI schedule editor — staff describe a schedule change in plain English
 * ("move Art to 1-2 on Tuesdays", "add a Chess class in Room 3 MWF at 10:30"),
 * the backend proposes structured operations, and NOTHING is written until the
 * staff member reviews the proposal and clicks Apply.
 */
const ScheduleAiEditor = ({ orgId, onApplied }) => {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [proposal, setProposal] = useState(null) // { summary, operations, warnings }
  const [undo, setUndo] = useState(null)         // { operations, count } from the last apply
  const [busy, setBusy] = useState(false)

  const propose = async () => {
    if (!prompt.trim()) return toast.error('Describe the change you want')
    setBusy(true)
    setProposal(null)
    try {
      const { data } = await api.post('/api/sis/schedule-ai/propose', {
        organization_id: orgId, prompt: prompt.trim(),
      })
      setProposal(data)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not process that request')
    } finally { setBusy(false) }
  }

  const apply = async () => {
    setBusy(true)
    try {
      const { data } = await api.post('/api/sis/schedule-ai/apply', {
        organization_id: orgId, operations: proposal.operations,
      })
      const applied = data.applied?.length || 0
      toast.success(`Applied ${applied} change${applied === 1 ? '' : 's'}`)
      for (const err of data.errors || []) toast.error(err)
      setProposal(null)
      setPrompt('')
      setUndo((data.undo_operations || []).length ? { operations: data.undo_operations, count: applied } : null)
      onApplied && onApplied()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not apply the changes')
    } finally { setBusy(false) }
  }

  // Reverse the last apply: the backend returned the inverse operations
  // (prior values / un-archive), which go back through the same apply path.
  const undoLast = async () => {
    setBusy(true)
    try {
      const { data } = await api.post('/api/sis/schedule-ai/apply', {
        organization_id: orgId, operations: undo.operations,
      })
      for (const err of data.errors || []) toast.error(err)
      toast.success('Changes undone')
      setUndo(null)
      onApplied && onApplied()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not undo the changes')
    } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-optio-purple/40 text-optio-purple text-sm font-medium hover:bg-optio-purple/5 transition-colors">
        <SparklesIcon className="w-4 h-4" />
        Edit schedule with AI
      </button>
    )
  }

  return (
    <div className="w-full bg-white rounded-xl border border-optio-purple/30 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <SparklesIcon className="w-4 h-4 text-optio-purple" />
          AI schedule editor
        </div>
        <button onClick={() => { setOpen(false); setProposal(null) }}
          className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">×</button>
      </div>
      <p className="text-xs text-neutral-500 mb-2">
        Describe the change in plain English — e.g. "move Art to 1–2pm on Tuesdays",
        "add a Chess class in Room 3, MWF 10:30–11:30, max 10 kids". You'll review the
        exact changes before anything is saved.
      </p>
      <textarea rows={2} className={field} value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); propose() } }}
        placeholder="What should change?" />
      <div className="flex justify-end mt-2">
        <button onClick={propose} disabled={busy}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          {busy && !proposal ? 'Thinking…' : 'Propose changes'}
        </button>
      </div>

      {undo && !proposal && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-3 py-2">
          <span className="text-sm text-green-800">
            Applied {undo.count} change{undo.count === 1 ? '' : 's'}.
          </span>
          <button onClick={undoLast} disabled={busy}
            className="text-sm font-semibold text-optio-purple hover:underline disabled:opacity-50">
            {busy ? 'Undoing…' : 'Undo'}
          </button>
        </div>
      )}

      {proposal && (
        <div className="mt-3 rounded-lg border border-gray-200 p-3">
          {proposal.summary && <p className="text-sm text-neutral-700 mb-2">{proposal.summary}</p>}
          {proposal.operations.length === 0 ? (
            <p className="text-sm text-neutral-400">No changes proposed — try rephrasing the request.</p>
          ) : (
            <ul className="space-y-1 mb-2">
              {proposal.operations.map((op, i) => (
                <li key={i} className="text-sm text-neutral-800 flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-optio-purple shrink-0" />
                  {op.label || op.action}
                </li>
              ))}
            </ul>
          )}
          {(proposal.warnings || []).map((w, i) => (
            <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-1">{w}</p>
          ))}
          {proposal.operations.length > 0 && (
            <div className="flex items-center justify-end gap-3 mt-2">
              <button onClick={() => setProposal(null)} className="text-sm text-neutral-500 hover:underline">Discard</button>
              <button onClick={apply} disabled={busy}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {busy ? 'Applying…' : `Apply ${proposal.operations.length} change${proposal.operations.length === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ScheduleAiEditor
