import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../../contexts/ConfirmContext'
import Button from '../../ui/Button'
import { INPUT_CLASS } from '../../ui/Input'
import { studentWorkApi, studentWorkKeys, useStudentNotes } from '../../../hooks/api/useStudentWork'

/**
 * A teacher's private notes on one student: what they are working on, what
 * helped, what to try next. Only the teacher who wrote a note sees it -- not
 * the student, not the family, not other teachers. Stored as the platform's
 * advisor notes (routes/advisor_notes.py), which any staff member of the
 * student's school may write (2026-10-07).
 */

const when = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export default function StudentNotes({ student }) {
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { data: notes = [], isLoading } = useStudentNotes(student.id)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: studentWorkKeys.notes(student.id) })

  const add = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setSaving(true)
    try {
      await studentWorkApi.addNote(student.id, text.trim())
      setText('')
      await refresh()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the note')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (note) => {
    if (!(await confirm('Delete this note? This cannot be undone.'))) return
    try {
      await studentWorkApi.deleteNote(note.id)
      await refresh()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not delete the note')
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4" aria-label="Private notes">
      <h2 className="font-semibold text-neutral-900">My notes</h2>
      <p className="text-xs text-neutral-500 mb-3">Only you can see these.</p>
      <form onSubmit={add} className="space-y-2 mb-4">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
          placeholder={`What is ${(student.name || '').split(' ')[0] || 'this student'} working on? What helped?`}
          aria-label="New note" className={INPUT_CLASS} />
        <Button size="xs" type="submit" disabled={saving || !text.trim()}>Save note</Button>
      </form>
      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      {!isLoading && !notes.length && <p className="text-sm text-neutral-400">No notes yet.</p>}
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="text-sm">
            <p className="text-neutral-800 whitespace-pre-wrap">{n.note_text}</p>
            <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-3">
              {when(n.created_at)}
              <button type="button" onClick={() => remove(n)} className="hover:text-red-600">Delete</button>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
