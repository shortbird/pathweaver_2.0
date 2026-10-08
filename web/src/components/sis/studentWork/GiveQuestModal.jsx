import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import ModalOverlay from '../../ui/ModalOverlay'
import Button from '../../ui/Button'
import { Input, INLINE_INPUT_CLASS } from '../../ui/Input'
import { studentWorkApi } from '../../../hooks/api/useStudentWork'

/**
 * Give one student a quest: pick one, optionally a due date, Assign.
 *
 * With nothing typed the list is the teacher's own quests and the school's
 * newest; typing also reaches the shared Optio library -- the class picker's
 * rule (a flat list of every library quest buries the school's own). A quest
 * the student is already working on says so and cannot be picked again.
 */

const SCOPE_LABEL = { mine: 'Yours', school: 'School', library: 'Optio library' }

export default function GiveQuestModal({ orgId, student, onClose, onGiven, onWriteNew }) {
  const first = (student.name || '').split(' ')[0] || 'this student'
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState(null)
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    let live = true
    setLoading(true)
    studentWorkApi.assignableQuests(orgId, student.id, search)
      .then((rows) => { if (live) setQuests(rows) })
      .catch(() => { if (live) toast.error('Could not load quests') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [orgId, student.id, search])

  const give = async () => {
    if (!picked) return
    setSaving(true)
    try {
      const out = await studentWorkApi.give(orgId, student.id, picked.id, due)
      toast.success(out?.already_had_it
        ? `${first} already had “${picked.title}”. It is now assigned to them.`
        : `Assigned “${picked.title}” to ${first}`)
      onGiven?.()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not assign the quest')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col"
        role="dialog" aria-label={`Assign a quest to ${student.name}`}>
        <div className="flex items-start justify-between p-4 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="font-semibold text-neutral-900">Assign a quest to {first}</h3>
            <p className="text-sm text-neutral-500">Only {first} gets it. Their family is told.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-1 text-neutral-400 hover:text-neutral-700">✕</button>
        </div>

        <div className="p-4 border-b border-gray-100 shrink-0">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
            placeholder="Search your school's quests and the Optio library…" aria-label="Search quests" />
        </div>

        <ul className="flex-1 overflow-y-auto p-2" aria-label="Quests">
          {loading && <li className="p-3 text-sm text-neutral-500">Loading…</li>}
          {!loading && !quests.length && (
            <li className="p-3 text-sm text-neutral-500">
              {search ? 'No quests match that search.' : 'Your school has no quests yet. Search the Optio library, or write a new one.'}
            </li>
          )}
          {!loading && quests.map((q) => {
            const chosen = picked?.id === q.id
            return (
              <li key={q.id}>
                <button type="button" disabled={q.has_it} onClick={() => setPicked(q)}
                  aria-pressed={chosen}
                  className={`w-full text-left rounded-lg p-3 flex items-start gap-3 ${
                    chosen ? 'bg-optio-purple/10 ring-1 ring-optio-purple' : 'hover:bg-gray-50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-neutral-900">{q.title}</span>
                    {q.description && (
                      <span className="block text-xs text-neutral-500 line-clamp-2">{q.description}</span>
                    )}
                  </span>
                  <span className="text-[11px] text-neutral-500 whitespace-nowrap">
                    {q.has_it ? `${first} has it` : q.finished_it ? 'Finished before' : SCOPE_LABEL[q.scope]}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="p-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {onWriteNew ? (
            <button type="button" onClick={() => { onClose(); onWriteNew() }}
              className="text-sm font-medium text-optio-purple hover:underline">
              Write a new quest instead
            </button>
          ) : <span />}
          <div className="flex items-center gap-3">
            <label className="text-sm text-neutral-600 flex items-center gap-2">
              Due
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
                className={INLINE_INPUT_CLASS} aria-label="Due date (optional)" />
            </label>
            <Button size="sm" onClick={give} disabled={!picked || saving} loading={saving}>
              Assign
            </Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
