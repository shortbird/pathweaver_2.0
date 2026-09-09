import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  LinkIcon, PencilSquareIcon, TrashIcon, PlusIcon, LockClosedIcon,
  AcademicCapIcon, SparklesIcon,
} from '@heroicons/react/24/outline'
import { FolderIcon } from '@heroicons/react/24/solid'
import api from '../../services/api'
import CurriculumFields, { blankCurriculum, curriculumFieldsOf } from './CurriculumFields'
import { useConfirm } from '../../contexts/ConfirmContext'

/**
 * ClassCurriculumLibrary — the school's curriculum for this class, as the
 * teacher sees it.
 *
 * Staff-only, and separate from the class materials below it: materials are
 * what the teacher shares WITH students, this is what the school gives the
 * teacher to teach from.
 *
 * Curriculum itself is ADMIN-ONLY: only an org admin can add, edit, or remove
 * entries here (same form as the library page, via CurriculumFields, scoped to
 * this class). Teachers see the curriculum read-only — what they add to a class
 * is QUESTS (the Quests tab), which attach to the class's curriculum via
 * to-curriculum. iCreate, 2026-08-31: teachers were creating whole curriculum
 * entries from this button; the school wants curriculum defined by the office.
 *
 * There is deliberately NO "share with students" here. Curriculum stays
 * staff-side only; students get their files through a different channel
 * (iCreate, 2026-08-31 — and the 2026-08-24 incident where a teacher's whole
 * curriculum folder ended up in front of students argues for the same).
 */
export default function ClassCurriculumLibrary({ classId }) {
  const confirm = useConfirm()
  const [entries, setEntries] = useState([])
  const [canManage, setCanManage] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(null) // null | 'new' | entry

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

  // Curriculum entries are admin-managed; teachers see them read-only.
  const canEditEntry = () => isAdmin

  const remove = async (e) => {
    if (!(await confirm(`Remove "${e.title}" from this class? The Drive folder itself is untouched.`))) return
    try {
      await api.delete(`/api/sis/classes/${classId}/curriculum/${e.id}`)
      toast.success('Curriculum removed')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove it')
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
        {isAdmin && !editing && (
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
          {isAdmin
            ? 'No curriculum yet. Add an entry and paste the Drive folder where it lives.'
            : 'No curriculum attached yet. Your school’s administrator attaches curriculum to the class; you can add quests from the Quests tab.'}
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
              {/* Courses the school attached to this curriculum. The whole point
                  of the container: a teacher given this class finds the school's
                  course already here rather than being expected to build one
                  (iCreate, 2026-08-06). Linked, not copied, so this is always
                  what the library currently says. */}
              {/* The curriculum's saved quest set — including quests this
                  class's teacher added on the Quests tab, which auto-attach to
                  the curriculum (iCreate, 2026-08-31: "if teachers add quests
                  it should appear there as well"). Managed from the Quests tab
                  and the admin library; listed here so the curriculum reads as
                  one whole. */}
              {e.quests?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">
                    Quests in this curriculum
                  </p>
                  <ul className="space-y-0.5">
                    {e.quests.map((q) => (
                      <li key={q.id} className="flex items-center gap-1.5 text-sm text-neutral-700">
                        <SparklesIcon className="w-4 h-4 text-optio-purple shrink-0" /> {q.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {e.courses?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">
                    Courses for this curriculum
                  </p>
                  <ul className="space-y-1">
                    {e.courses.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 flex-wrap">
                        <Link to={`/courses/${c.id}`}
                          className="inline-flex items-center gap-1.5 text-sm text-optio-purple hover:underline">
                          <AcademicCapIcon className="w-4 h-4" /> {c.title}
                        </Link>
                        {c.status && c.status !== 'published' && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-neutral-500 capitalize">
                            {c.status}
                          </span>
                        )}
                        {/* "if we connect courses, we need to have a way for the
                            teachers to edit those" (iCreate, 2026-07-25). The
                            builder already admits an advisor from the course's
                            own org; it refuses cleanly for library courses. */}
                        {canManage && (
                          <Link to={`/courses/${c.id}/edit`} className="text-xs text-neutral-500 hover:underline">
                            Edit
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
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
