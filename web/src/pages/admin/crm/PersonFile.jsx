import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { getPerson, addPersonNote, updatePersonNote, deletePersonNote } from './crmApi'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { PageLoader } from '../../../components/ui'
import EmptyState from '../../../components/ui/EmptyState'
import {
  CONTACT_TYPE_LABELS,
  LEAD_STATUS_BADGES,
  formatDate,
  formatDateTime,
  formatMetOn,
} from './crmConstants'

export const personName = (p) =>
  [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.display_name || p?.email || 'Unknown'

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const primaryButtonClass =
  'px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]'
const secondaryButtonClass =
  'px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]'

/** Body + meeting date fields, shared by the composer and the inline editor. */
export const NoteFields = ({ idPrefix, body, metOn, onBody, onMetOn }) => (
  <div className="space-y-2">
    <textarea
      id={`${idPrefix}-body`}
      aria-label="Note"
      rows={5}
      value={body}
      onChange={(e) => onBody(e.target.value)}
      placeholder="What did you talk about? What happens next?"
      className={`${inputClass} resize-vertical`}
    />
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`${idPrefix}-met-on`} className="text-sm text-gray-600">
        Meeting date
      </label>
      <input
        id={`${idPrefix}-met-on`}
        type="date"
        value={metOn}
        onChange={(e) => onMetOn(e.target.value)}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
      />
      <span className="text-xs text-gray-400">Optional</span>
    </div>
  </div>
)

const NoteItem = ({ note, onSaved, onDeleted }) => {
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(note.body)
  const [metOn, setMetOn] = useState(note.met_on || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!body.trim()) return
    setSaving(true)
    try {
      await updatePersonNote(note.id, { body: body.trim(), met_on: metOn || null })
      setEditing(false)
      onSaved()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save note')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this note?',
      body: 'The note is removed from this person\'s file for good.',
      confirmLabel: 'Delete note',
    })
    if (!ok) return
    try {
      await deletePersonNote(note.id)
      onDeleted()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete note')
    }
  }

  const edited = note.updated_at && note.created_at &&
    new Date(note.updated_at) - new Date(note.created_at) > 60 * 1000

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">
          {note.met_on ? `Meeting on ${formatMetOn(note.met_on)}` : 'Note'}
        </p>
        <p className="text-xs text-gray-400">
          {note.author_name ? `${note.author_name} · ` : ''}
          {formatDateTime(note.created_at)}
          {edited ? ' · edited' : ''}
        </p>
      </div>
      {editing ? (
        <div className="mt-2">
          <NoteFields
            idPrefix={`note-${note.id}`}
            body={body}
            metOn={metOn}
            onBody={setBody}
            onMetOn={setMetOn}
          />
          <div className="mt-2 flex gap-2">
            <button onClick={save} disabled={!body.trim() || saving} className={primaryButtonClass}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setBody(note.body)
                setMetOn(note.met_on || '')
                setEditing(false)
              }}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{note.body}</p>
          <div className="mt-2 flex gap-4">
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-medium text-optio-purple hover:underline"
            >
              Edit
            </button>
            <button onClick={remove} className="text-xs font-medium text-red-600 hover:underline">
              Delete
            </button>
          </div>
        </>
      )}
    </li>
  )
}

/**
 * One person's CRM file: internal notes about any Optio user (meetings,
 * calls), plus the notes on any CRM lead that is the same person. Rendered as
 * a page in the CRM People tab and as the Notes tab of the admin user modal,
 * so both places read and write one list.
 */
const PersonFile = ({ personId, showHeader = false }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [metOn, setMetOn] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await getPerson(personId)
      setData(response.data)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load notes')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [personId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const add = async () => {
    if (!body.trim()) return
    setAdding(true)
    try {
      await addPersonNote(personId, { body: body.trim(), met_on: metOn || null })
      toast.success('Note added')
      setBody('')
      setMetOn('')
      load()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add note')
    } finally {
      setAdding(false)
    }
  }

  if (loading) return <PageLoader label="Loading notes" />
  if (!data) return <EmptyState title="User not found" />

  const { person, notes = [], leads = [] } = data
  const leadNotes = leads.flatMap((lead) =>
    (lead.notes || []).map((n) => ({ ...n, lead }))
  )

  return (
    <div className="space-y-6">
      {showHeader && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{personName(person)}</h2>
          <p className="mt-1 text-sm text-gray-500 break-all">
            {[
              person.email,
              person.phone_number,
              person.org_role || person.role,
              person.organization_name,
              `Joined ${formatDate(person.created_at)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Add note</h3>
        <NoteFields
          idPrefix={`new-note-${personId}`}
          body={body}
          metOn={metOn}
          onBody={setBody}
          onMetOn={setMetOn}
        />
        <button onClick={add} disabled={!body.trim() || adding} className={`mt-3 ${primaryButtonClass}`}>
          {adding ? 'Adding...' : 'Add note'}
        </button>
        <p className="mt-2 text-xs text-gray-400">Only superadmins can see these notes.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Notes</h3>
        {notes.length === 0 ? (
          <EmptyState plain title="No notes yet" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {notes.map((note) => (
              <NoteItem key={note.id} note={note} onSaved={load} onDeleted={load} />
            ))}
          </ul>
        )}
      </div>

      {leads.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-3">As a lead</h3>
          <ul className="space-y-2 mb-4">
            {leads.map((lead) => (
              <li key={lead.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Link
                  to={`/admin/crm/leads/${lead.id}`}
                  className="font-medium text-optio-purple hover:underline break-all"
                >
                  {lead.email}
                </Link>
                <span
                  className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                    LEAD_STATUS_BADGES[lead.status] || 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {lead.status}
                </span>
                <span className="text-gray-500">
                  {CONTACT_TYPE_LABELS[lead.lead_source] || lead.lead_source} · {formatDate(lead.created_at)}
                </span>
              </li>
            ))}
          </ul>
          {leadNotes.length > 0 && (
            <ul className="divide-y divide-gray-100 border-t border-gray-100 pt-4">
              {leadNotes.map((note) => (
                <li key={note.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-xs text-gray-400">
                    {note.detail?.met_on
                      ? `Lead note · meeting on ${formatMetOn(note.detail.met_on)}`
                      : 'Lead note'}{' · '}
                    {formatDateTime(note.created_at)}
                  </p>
                  <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">
                    {note.detail?.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default PersonFile
