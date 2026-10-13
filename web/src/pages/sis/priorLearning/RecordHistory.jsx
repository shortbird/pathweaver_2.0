import React, { useState } from 'react'
import inputClass from './inputClass'

const STATUS_WORDS = {
  submitted: 'New', under_review: 'In review', needs_info: 'Sent back',
  accepted: 'Accepted', rejected: 'Not accepted',
}

const describe = (e) => {
  switch (e.kind) {
    case 'submitted': return 'Sent in by the family'
    case 'resubmitted': return 'Sent again by the family'
    case 'filed': return 'Filed by the office'
    case 'evidence_added': return `Document added${e.body ? `: ${e.body}` : ''}`
    case 'evidence_removed': return 'Document removed'
    case 'analyzed': return `AI read the evidence${e.body ? ` — ${e.body}` : ''}`
    case 'analysis_failed': return 'AI could not read the evidence'
    case 'info_requested': return 'Sent back to the family'
    case 'transcribed': return `Added to the transcript${e.metadata?.school_name ? ` under ${e.metadata.school_name}` : ''}`
    case 'status_changed': return `Marked ${STATUS_WORDS[e.metadata?.to] || e.metadata?.to || 'changed'}`
    case 'note': return 'Private note'
    default: return e.kind
  }
}

/**
 * A record's history and the reviewer's private notes.
 *
 * Notes are for the office only; the family sees review_notes, which is a
 * different field. Collapsed by default so a long history does not push the
 * next record off the screen.
 */
const RecordHistory = ({ record, onNote }) => {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const events = record.events || []
  const notes = events.filter((e) => e.kind === 'note').length

  const save = async () => {
    if (!note.trim()) return
    setSaving(true)
    if (await onNote(note.trim())) setNote('')
    setSaving(false)
  }

  return (
    <div className="border-t border-gray-100 pt-2">
      <button type="button" onClick={() => setOpen(!open)}
              className="text-xs font-medium text-gray-500 hover:text-gray-800">
        {open ? 'Hide history' : `History (${events.length})${notes ? ` · ${notes} note${notes === 1 ? '' : 's'}` : ''}`}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <ol className="space-y-1.5">
            {events.map((e) => (
              <li key={e.id} className={`text-xs ${e.kind === 'note' ? 'bg-yellow-50 rounded-lg px-2 py-1.5' : ''}`}>
                <span className="text-gray-400 tabular-nums">{new Date(e.created_at).toLocaleString()}</span>
                {' · '}
                <span className="text-gray-700">{describe(e)}</span>
                {e.actor_name && <span className="text-gray-400"> · {e.actor_name}</span>}
                {e.body && ['note', 'info_requested', 'status_changed'].includes(e.kind) && (
                  <span className="block text-gray-800 whitespace-pre-wrap mt-0.5">{e.body}</span>
                )}
              </li>
            ))}
            {!events.length && <li className="text-xs text-gray-400">Nothing recorded yet.</li>}
          </ol>
          <div className="flex gap-2">
            <input aria-label="Private note" placeholder="Add a private note (the family never sees these)"
                   className={inputClass} value={note} onChange={(e) => setNote(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
            <button type="button" disabled={saving || !note.trim()} onClick={save}
                    className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 disabled:opacity-50">
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default RecordHistory
