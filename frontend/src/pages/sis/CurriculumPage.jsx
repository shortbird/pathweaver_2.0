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
import CurriculumFields, { curriculumFieldsOf } from '../../components/sis/CurriculumFields'
import CurriculumResources from '../../components/sis/CurriculumResources'

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

const CurriculumEditor = ({ orgId, entry, classes, onSaved, onCancel }) => {
  const [f, setF] = useState(() => (entry ? {
    ...curriculumFieldsOf(entry),
    class_ids: (entry.classes || []).map((c) => c.class_id),
  } : { title: '', subject: '', description: '', drive_url: '', notes: '', class_ids: [] }))
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
      <CurriculumFields f={f} set={set} />

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

// A curriculum's age span is the span of the classes teaching it — the library
// itself has no ages, and an entry nobody teaches this term has none to show.
const ageRange = (classes = []) => {
  const mins = classes.map((c) => c.min_age).filter((a) => a != null)
  const maxes = classes.map((c) => c.max_age).filter((a) => a != null)
  if (!mins.length && !maxes.length) return '—'
  if (!maxes.length) return `${Math.min(...mins)}+`
  if (!mins.length) return `Up to ${Math.max(...maxes)}`
  return `${Math.min(...mins)}–${Math.max(...maxes)}`
}

// "3 quests · 1 course" — what a class inherits from this curriculum.
const carriesText = (e) => [
  e.quest_count ? `${e.quest_count} quest${e.quest_count === 1 ? '' : 's'}` : null,
  e.course_count ? `${e.course_count} course${e.course_count === 1 ? '' : 's'}` : null,
].filter(Boolean).join(' · ')

const SortHeader = ({ label, col, sort, onSort }) => (
  <th className="px-4 py-3 font-medium">
    <button onClick={() => onSort(col)}
      className={`inline-flex items-center hover:text-neutral-800 ${sort.key === col ? 'text-neutral-800' : ''}`}>
      {label}{sort.key === col ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  </th>
)

const CurriculumPage = () => {
  const { user } = useAuth()
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const admin = isSisAdmin(user)
  const [entries, setEntries] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | entry
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'title', dir: 'asc' })
  const [expanded, setExpanded] = useState(null) // entry id whose detail row is open

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

  // Sorted, flat rows. The library outgrew the grouped card list fast — iCreate
  // asked for it to read like the class list: one row per entry, sortable by the
  // things they scan for, with the detail behind a disclosure.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? entries.filter((e) => `${e.title} ${e.subject || ''} ${e.description || ''}`.toLowerCase().includes(q))
      : entries
    const dir = sort.dir === 'asc' ? 1 : -1
    const value = (e) => {
      if (sort.key === 'subject') return (e.subject || '').toLowerCase()
      if (sort.key === 'ages') {
        const mins = (e.classes || []).map((c) => c.min_age).filter((a) => a != null)
        return mins.length ? Math.min(...mins) : 999   // no age info sorts last
      }
      if (sort.key === 'classes') return (e.classes || []).length
      // Sorted by how much it carries, so the curricula that still need
      // building sort to one end.
      if (sort.key === 'carries') return (e.quest_count || 0) + (e.course_count || 0)
      if (sort.key === 'folder') return e.drive_url ? 0 : 1
      return (e.title || '').toLowerCase()
    }
    return [...filtered].sort((a, b) => {
      const av = value(a); const bv = value(b)
      let cmp = 0
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av).localeCompare(String(bv))
      if (cmp === 0) cmp = (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase())
      return cmp * dir
    })
  }, [entries, search, sort])

  const toggleSort = (key) => setSort((prev) => (
    prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
  ))

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

      {!loading && rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-left">
              <tr>
                <SortHeader label="Title" col="title" sort={sort} onSort={toggleSort} />
                <SortHeader label="Ages" col="ages" sort={sort} onSort={toggleSort} />
                <SortHeader label="Subject" col="subject" sort={sort} onSort={toggleSort} />
                <SortHeader label="Classes" col="classes" sort={sort} onSort={toggleSort} />
                <SortHeader label="Carries" col="carries" sort={sort} onSort={toggleSort} />
                <SortHeader label="Folder" col="folder" sort={sort} onSort={toggleSort} />
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((e) => {
                const open = expanded === e.id
                const classes = e.classes || []
                // Always expandable now: the row opens onto what the curriculum
                // carries, which is the point of it, and an entry with nothing
                // attached is exactly the one somebody needs to open.
                const hasDetail = true
                return (
                  <React.Fragment key={e.id}>
                    <tr className={`hover:bg-neutral-50 ${hasDetail ? 'cursor-pointer' : ''}`}
                      onClick={() => hasDetail && setExpanded(open ? null : e.id)}>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <BookOpenIcon className="w-4 h-4 text-optio-purple shrink-0" />
                          <span className="font-medium text-neutral-900">{e.title}</span>
                          {hasDetail && <span className="text-neutral-300 text-xs">{open ? '▾' : '▸'}</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">{ageRange(classes)}</td>
                      <td className="px-4 py-3 text-neutral-600">{e.subject || <span className="text-neutral-300">—</span>}</td>
                      <td className="px-4 py-3 text-neutral-600">
                        {classes.length || (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-neutral-500">
                            Not taught this term
                          </span>
                        )}
                      </td>
                      {/* What a teacher inherits by being given this class. An
                          empty cell is the signal that somebody still has to
                          build it from scratch. */}
                      <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">
                        {carriesText(e) || <span className="text-neutral-300">—</span>}
                      </td>
                      <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                        {e.drive_url ? (
                          <a href={e.drive_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-optio-purple hover:underline">
                            <LinkIcon className="w-4 h-4" /> Open
                          </a>
                        ) : <span className="text-neutral-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                        {admin && (
                          <span className="inline-flex items-center gap-1">
                            <button onClick={() => setEditing(e)} className="p-1.5 text-gray-400 hover:text-optio-purple"
                              aria-label={`Edit ${e.title}`}>
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                            <button onClick={() => remove(e)} className="p-1.5 text-gray-400 hover:text-red-500"
                              aria-label={`Remove ${e.title}`}>
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-neutral-50/60">
                        <td colSpan={7} className="px-4 py-3 space-y-3">
                          {e.description && <p className="text-sm text-neutral-600">{e.description}</p>}
                          {classes.length > 0 && (
                            <p className="text-xs text-neutral-500">
                              Used by {classes.map((c) => c.name).join(' · ')}
                            </p>
                          )}
                          {admin && e.notes && <p className="text-xs text-amber-700">Note: {e.notes}</p>}
                          <CurriculumResources
                            orgId={orgId}
                            curriculumId={e.id}
                            canManage={admin}
                            onChanged={load}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && entries.length > 0 && !rows.length && (
        <p className="text-neutral-500">No curriculum matches your search.</p>
      )}
    </div>
  )
}

export default CurriculumPage
