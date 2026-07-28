import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  BookOpenIcon, LinkIcon, PencilSquareIcon, TrashIcon, PlusIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'

/**
 * CurriculumPage — the school's curriculum library.
 *
 * Deliberately independent of the timetable: an entry can exist for a subject
 * nobody is teaching this semester, and one entry (e.g. Reading Workshop) can
 * back several class sections at once. Each entry points at the Google Drive
 * folder where the real material lives, so staff keep refining the folder
 * without re-uploading anything here.
 *
 * Staff-only. Teachers see the curriculum for the classes they teach on their
 * class page; students never see it — that's what class materials are for.
 */

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent'

const blankForm = () => ({
  title: '', subject: '', description: '', drive_url: '', notes: '', class_ids: [],
})

const CurriculumEditor = ({ orgId, entry, classes, onSaved, onCancel }) => {
  const [f, setF] = useState(() => (entry ? {
    title: entry.title || '',
    subject: entry.subject || '',
    description: entry.description || '',
    drive_url: entry.drive_url || '',
    notes: entry.notes || '',
    class_ids: (entry.classes || []).map((c) => c.class_id),
  } : blankForm()))
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const toggleClass = (id) => setF((prev) => ({
    ...prev,
    class_ids: prev.class_ids.includes(id)
      ? prev.class_ids.filter((c) => c !== id)
      : [...prev.class_ids, id],
  }))

  const save = async () => {
    if (!f.title.trim()) { toast.error('A title is required'); return }
    setBusy(true)
    try {
      const body = {
        organization_id: orgId,
        title: f.title.trim(),
        subject: f.subject.trim(),
        description: f.description.trim(),
        drive_url: f.drive_url.trim(),
        notes: f.notes.trim(),
      }
      const id = entry?.id
        ? (await api.patch(`/api/sis/curriculum/${entry.id}`, body), entry.id)
        : (await api.post('/api/sis/curriculum', body)).data?.curriculum?.id
      if (id) {
        await api.put(`/api/sis/curriculum/${id}/classes`, {
          organization_id: orgId, class_ids: f.class_ids,
        })
      }
      toast.success(entry ? 'Curriculum updated' : 'Curriculum added')
      onSaved()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the curriculum')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-optio-purple/30 rounded-xl p-4 space-y-3 bg-optio-purple/5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input value={f.title} onChange={(e) => set('title', e.target.value)}
          placeholder="Title (e.g. Reading Workshop)" className={inputClass} />
        <input value={f.subject} onChange={(e) => set('subject', e.target.value)}
          placeholder="Subject (optional — e.g. Language Arts)" className={inputClass} />
      </div>
      <input value={f.drive_url} onChange={(e) => set('drive_url', e.target.value)}
        placeholder="Google Drive folder link (optional)" className={inputClass} />
      <input value={f.description} onChange={(e) => set('description', e.target.value)}
        placeholder="Short description teachers will see (optional)" className={inputClass} />
      <textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2}
        placeholder="Staff notes (optional)" className={inputClass} />

      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">
          Classes using this curriculum
        </p>
        <p className="text-xs text-neutral-400 mb-2">
          Attach it to every section that uses it — teachers see it on those classes.
          Leave empty for curriculum you aren't teaching right now.
        </p>
        {!classes.length ? (
          <p className="text-sm text-neutral-400">No classes yet.</p>
        ) : (
          <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
            {classes.map((c) => (
              <label key={c.id} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={f.class_ids.includes(c.id)}
                  onChange={() => toggleClass(c.id)}
                  className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                <span className="text-neutral-800">{c.name}</span>
                {c.instructor_name && <span className="text-xs text-neutral-400">{c.instructor_name}</span>}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">
          Cancel
        </button>
        <button onClick={save} disabled={busy}
          className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
          {busy ? 'Saving…' : 'Save curriculum'}
        </button>
      </div>
    </div>
  )
}

const CurriculumPage = () => {
  const { user } = useAuth()
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const admin = isSisAdmin(user)
  const [entries, setEntries] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | entry
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg('/api/sis/curriculum', orgId))
      .then((r) => setEntries(r.data?.curriculum || []))
      .catch(() => toast.error('Failed to load the curriculum library'))
      .finally(() => setLoading(false))
    api.get(withOrg('/api/sis/classes', orgId))
      .then((r) => setClasses(r.data?.classes || []))
      .catch(() => setClasses([]))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const remove = async (entry) => {
    if (!window.confirm(`Remove "${entry.title}" from the library? The Drive folder itself is untouched.`)) return
    try {
      await api.delete(withOrg(`/api/sis/curriculum/${entry.id}`, orgId))
      toast.success('Curriculum removed')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove it')
    }
  }

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? entries.filter((e) => `${e.title} ${e.subject || ''} ${e.description || ''}`.toLowerCase().includes(q))
      : entries
    return filtered.reduce((acc, e) => {
      const key = e.subject || 'Other'
      ;(acc[key] = acc[key] || []).push(e)
      return acc
    }, {})
  }, [entries, search])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-neutral-900">Curriculum</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>
      <p className="text-sm text-neutral-500 mb-6">
        Your curriculum library. Link the Drive folder once and attach it to the classes that use it —
        their teachers see it on the class page. Students never see this.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search curriculum…"
          className="flex-1 min-w-[14rem] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
        {admin && !editing && (
          <button onClick={() => setEditing('new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold shrink-0">
            <PlusIcon className="w-4 h-4" /> Add curriculum
          </button>
        )}
      </div>

      {editing && (
        <div className="mb-6">
          <CurriculumEditor
            orgId={orgId}
            entry={editing === 'new' ? null : editing}
            classes={classes}
            onSaved={() => { setEditing(null); load() }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {loading && <p className="text-neutral-500">Loading…</p>}

      {!loading && !entries.length && !editing && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <BookOpenIcon className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
          <p className="text-sm text-neutral-600 font-medium">No curriculum yet.</p>
          <p className="text-sm text-neutral-500 mt-1">
            Add your first entry and paste the Drive folder where it lives.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([subject, items]) => (
          <div key={subject}>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">{subject}</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {items.map((e) => (
                <div key={e.id} className="p-4 flex items-start gap-3">
                  <BookOpenIcon className="w-5 h-5 text-optio-purple shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-neutral-900">{e.title}</span>
                      {!(e.classes || []).length && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-neutral-500">
                          Not taught this term
                        </span>
                      )}
                    </div>
                    {e.description && <p className="text-sm text-neutral-500 mt-0.5">{e.description}</p>}
                    {e.drive_url && (
                      <a href={e.drive_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-optio-purple hover:underline mt-1">
                        <LinkIcon className="w-4 h-4" /> Open the folder
                      </a>
                    )}
                    {(e.classes || []).length > 0 && (
                      <p className="text-xs text-neutral-400 mt-1">
                        Used by {e.classes.map((c) => c.name).join(' · ')}
                      </p>
                    )}
                    {admin && e.notes && <p className="text-xs text-amber-700 mt-1">Note: {e.notes}</p>}
                  </div>
                  {admin && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditing(e)} className="p-1.5 text-gray-400 hover:text-optio-purple"
                        aria-label={`Edit ${e.title}`}>
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(e)} className="p-1.5 text-gray-400 hover:text-red-500"
                        aria-label={`Remove ${e.title}`}>
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CurriculumPage
