import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  LinkIcon, PencilSquareIcon, TrashIcon, PlusIcon, LockClosedIcon,
  ArrowRightCircleIcon, CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { FolderIcon } from '@heroicons/react/24/solid'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import CurriculumFields, { blankCurriculum, curriculumFieldsOf } from './CurriculumFields'

/**
 * ClassCurriculumLibrary — the school's curriculum for this class, as the
 * teacher sees it.
 *
 * Staff-only, and separate from the class materials below it: materials are
 * what the teacher shares WITH students, this is what the school gives the
 * teacher to teach from.
 *
 * Teachers get the SAME curriculum form admins use (via CurriculumFields),
 * scoped to this class: they add curriculum here and edit/remove the entries
 * they created. Admin-created entries shared onto the class stay read-only to a
 * teacher (the pencil/trash only show on their own). This keeps routine
 * curriculum upkeep off admins.
 *
 * Each entry with a Drive link can be pushed straight into Class materials
 * ("Share with students") — this copies the LINK, so nothing is downloaded and
 * re-uploaded. `sharedUrls` is the set of material URLs already on the class, so
 * an already-shared entry shows as done; `onSharedToClass` tells the parent to
 * refresh the materials column.
 */
export default function ClassCurriculumLibrary({ classId, sharedUrls, onSharedToClass }) {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [canManage, setCanManage] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(null) // null | 'new' | entry
  const [sharing, setSharing] = useState(null)  // entry id currently being shared

  const load = useCallback(() => {
    if (!classId) return undefined
    let active = true
    api.get(`/api/sis/classes/${classId}/curriculum`)
      .then((r) => {
        if (!active) return
        setEntries(r.data?.curriculum || [])
        setCanManage(!!r.data?.can_manage)
        setIsAdmin(!!r.data?.is_admin)
      })
      .catch(() => { /* not staff on this class, or none attached */ })
      .finally(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [classId])

  useEffect(() => load(), [load])

  const canEditEntry = (e) => isAdmin || e.created_by === user?.id

  const remove = async (e) => {
    if (!window.confirm(`Remove "${e.title}" from this class? The Drive folder itself is untouched.`)) return
    try {
      await api.delete(`/api/sis/classes/${classId}/curriculum/${e.id}`)
      toast.success('Curriculum removed')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove it')
    }
  }

  // Push a curriculum entry's Drive link into Class materials, where students
  // see it. Copies the link only — no download/re-upload.
  const isShared = (e) => !!(e.drive_url && sharedUrls?.has(e.drive_url))
  const shareToClass = async (e) => {
    if (!e.drive_url || isShared(e)) return
    setSharing(e.id)
    try {
      await api.post(`/api/sis/classes/${classId}/materials`, { title: e.title, url: e.drive_url })
      toast.success('Shared with students')
      onSharedToClass?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not share it')
    } finally {
      setSharing(null)
    }
  }

  // Hidden entirely for non-staff (the GET 403s, canManage stays false, no
  // entries). Staff always see the section so they can add the first entry.
  if (!loaded) return null
  if (!canManage && !entries.length) return null

  return (
    <div className="bg-optio-purple/[0.04] rounded-xl border-2 border-optio-purple/30 border-l-4 border-l-optio-purple p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0 w-9 h-9 rounded-lg bg-optio-purple/10 flex items-center justify-center">
            <FolderIcon className="w-5 h-5 text-optio-purple" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900">Your curriculum</h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-optio-purple/10 text-optio-purple">
                <LockClosedIcon className="w-3 h-3" /> Only staff
              </span>
            </div>
            <p className="text-xs text-neutral-500">What you teach from — students never see this.</p>
          </div>
        </div>
        {canManage && !editing && (
          <button onClick={() => setEditing('new')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold shrink-0">
            <PlusIcon className="w-4 h-4" /> Add curriculum
          </button>
        )}
      </div>
      <div className="mb-4" />

      {editing && (
        <div className="mb-4">
          <CurriculumEditor
            classId={classId}
            entry={editing === 'new' ? null : editing}
            onSaved={() => { setEditing(null); load() }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {!entries.length && !editing && (
        <p className="text-sm text-neutral-400">
          No curriculum yet. Add an entry and paste the Drive folder where it lives.
        </p>
      )}

      <ul className="space-y-3">
        {entries.map((e) => (
          <li key={e.id} className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-neutral-900">{e.title}</p>
              {e.description && <p className="text-sm text-neutral-500 mt-0.5">{e.description}</p>}
              {e.drive_url && (
                <a href={e.drive_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-optio-purple hover:underline mt-1">
                  <LinkIcon className="w-4 h-4" /> Open the folder
                </a>
              )}
              {e.notes && <p className="text-xs text-amber-700 mt-1">Note: {e.notes}</p>}
              {/* Send this resource to students — copies the link, no re-upload.
                  Available for any entry with a link, including admin-shared ones. */}
              {canManage && e.drive_url && (
                <div className="mt-2">
                  {isShared(e) ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                      <CheckCircleIcon className="w-4 h-4" /> Shared with students
                    </span>
                  ) : (
                    <button onClick={() => shareToClass(e)} disabled={sharing === e.id}
                      title="Add this to Class materials so students can see it"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                      <ArrowRightCircleIcon className="w-4 h-4" />
                      {sharing === e.id ? 'Sharing…' : 'Share with students'}
                    </button>
                  )}
                </div>
              )}
            </div>
            {canEditEntry(e) && (
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
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The per-class curriculum form — the same fields as the admin library editor,
 * minus the multi-class selector (the class is implied). Creates or edits an
 * entry attached to this class.
 */
const CurriculumEditor = ({ classId, entry, onSaved, onCancel }) => {
  const [f, setF] = useState(() => (entry ? curriculumFieldsOf(entry) : blankCurriculum()))
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const save = async () => {
    if (!f.title.trim()) { toast.error('A title is required'); return }
    setBusy(true)
    try {
      const body = {
        title: f.title.trim(),
        subject: f.subject.trim(),
        description: f.description.trim(),
        drive_url: f.drive_url.trim(),
        notes: f.notes.trim(),
      }
      if (entry?.id) {
        await api.patch(`/api/sis/classes/${classId}/curriculum/${entry.id}`, body)
      } else {
        await api.post(`/api/sis/classes/${classId}/curriculum`, body)
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
