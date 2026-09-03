import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  DocumentTextIcon, LinkIcon, ArrowUpTrayIcon, EyeIcon,
} from '@heroicons/react/24/outline'
import { UserGroupIcon } from '@heroicons/react/24/solid'
import api from '../../services/api'

/**
 * ClassCurriculum — documents and links a teacher shares with one SIS class.
 *
 * Pass EITHER `classId` (org_classes.id — teacher portal, with manage controls)
 * OR `questId` (learning-app quest page — resolves the owning class the viewer
 * participates in; read-only for students). Access is enforced by the backend:
 * teacher(s), enrolled students, and org_admin/superadmin only. When the viewer
 * is not a participant (or the quest has no class) the backend returns 403/404
 * and this component renders nothing.
 */
export default function ClassCurriculum({ classId, questId, className = '', refreshSignal = 0, onMaterialsLoaded }) {
  const base = questId
    ? `/api/sis/classes/by-quest/${questId}/materials`
    : `/api/sis/classes/${classId}/materials`
  // Writes always target the class-id path (students never have a classId here).
  const writeBase = classId ? `/api/sis/classes/${classId}/materials` : null

  const [materials, setMaterials] = useState([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(false)

  const [showLink, setShowLink] = useState(false)
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [savingLink, setSavingLink] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    if (!classId && !questId) return
    setLoading(true)
    try {
      const { data } = await api.get(base)
      const list = data?.materials || []
      setMaterials(list)
      setCanManage(Boolean(data?.can_manage) && Boolean(writeBase))
      onMaterialsLoaded?.(list)
    } catch (err) {
      const status = err?.response?.status
      if (status === 403 || status === 404) setHidden(true)
    } finally {
      setLoading(false)
    }
    // onMaterialsLoaded is a stable setter from the parent; excluded to avoid churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, writeBase, classId, questId])

  // refreshSignal lets a sibling (Your curriculum) force a reload after it shares
  // an item into this class's materials.
  useEffect(() => { load() }, [load, refreshSignal])

  const addLink = async (e) => {
    e.preventDefault()
    const title = linkTitle.trim()
    let url = linkUrl.trim()
    if (!title || !url) return
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    setSavingLink(true)
    try {
      await api.post(writeBase, { title, url })
      setLinkTitle(''); setLinkUrl(''); setShowLink(false)
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not add the link')
    } finally {
      setSavingLink(false)
    }
  }

  const uploadFile = async (e) => {
    const file = e.target.files?.[0]
    if (file) e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    form.append('title', file.name)
    setUploading(true)
    try {
      await api.post(`${writeBase}/upload`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Document added')
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not upload the file')
    } finally {
      setUploading(false)
    }
  }

  // Hide/show one material. Any moderator may flip any of the class's materials
  // (unlike Remove, which stays with whoever added it): hiding is reversible and
  // is how a teacher stages next week's handout, so it isn't theirs alone.
  const setVisible = async (m, visible) => {
    if (!writeBase) return
    // Optimistic — the switch is the whole interaction, so it has to feel like one.
    setMaterials((prev) => prev.map((x) => (
      x.id === m.id ? { ...x, visible_to_students: visible } : x)))
    try {
      await api.patch(`${writeBase}/${m.id}`, { visible_to_students: visible })
    } catch (err) {
      setMaterials((prev) => prev.map((x) => (
        x.id === m.id ? { ...x, visible_to_students: !visible } : x)))
      toast.error(err?.response?.data?.error || 'Could not change who can see this')
    }
  }

  const remove = async (id) => {
    try {
      await api.delete(`${writeBase}/${id}`)
      const next = materials.filter((m) => m.id !== id)
      setMaterials(next)
      onMaterialsLoaded?.(next)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove this item')
    }
  }

  if (hidden) return null

  return (
    <div className={`bg-emerald-50/40 rounded-xl border-2 border-emerald-500/30 border-l-4 border-l-emerald-500 p-4 sm:p-6 ${className}`}>
      <div className="flex items-center gap-2.5 mb-4 min-w-0">
        <span className="shrink-0 w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
          <UserGroupIcon className="w-5 h-5 text-emerald-600" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-gray-900">Class materials</h2>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              <EyeIcon className="w-3 h-3" /> {canManage ? 'You choose what students see' : 'Shared with you'}
            </span>
          </div>
          <p className="text-xs text-neutral-500">
            {canManage
              ? 'Switch one off to keep it to staff while you get it ready.'
              : 'What your teacher shared with the class.'}
          </p>
        </div>
      </div>

      {canManage && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50"
          >
            <ArrowUpTrayIcon className="w-4 h-4" />
            {uploading ? 'Uploading…' : 'Upload document'}
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={uploadFile}
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv" />
          <button
            onClick={() => setShowLink((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-neutral-700 text-sm font-semibold hover:bg-gray-50"
          >
            <LinkIcon className="w-4 h-4" /> Add link
          </button>
        </div>
      )}

      {canManage && showLink && (
        <form onSubmit={addLink} className="mb-5 rounded-lg border border-gray-200 p-3 space-y-2">
          <input
            value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)}
            placeholder="Title (e.g. Week 1 slides)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
          <input
            value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowLink(false)}
              className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={savingLink || !linkTitle.trim() || !linkUrl.trim()}
              className="px-3 py-1.5 rounded-lg bg-optio-purple text-white text-sm font-semibold disabled:opacity-50">
              {savingLink ? 'Adding…' : 'Add link'}
            </button>
          </div>
        </form>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-6 text-gray-500">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-optio-purple" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {!loading && materials.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">
          {canManage ? 'Nothing here yet — upload a document or add a link to get started.' : 'No materials yet.'}
        </p>
      )}

      {!loading && materials.length > 0 && (
        <ul className="space-y-2">
          {materials.map((m) => (
            <li key={m.id}
              className={`rounded-lg border border-gray-200 bg-white p-3 flex items-center gap-3 ${
                canManage && m.visible_to_students === false ? 'opacity-60' : ''}`}>
              <span className="shrink-0 text-neutral-400">
                {m.kind === 'link' ? <LinkIcon className="w-5 h-5" /> : <DocumentTextIcon className="w-5 h-5" />}
              </span>
              <div className="flex-1 min-w-0">
                <a href={m.url} target="_blank" rel="noopener noreferrer"
                  className="block text-sm font-medium text-neutral-800 hover:text-optio-purple truncate">
                  {m.title}
                </a>
                {/* Inherited from the school's curriculum, so it is the library's
                    to change — say where it came from rather than offer controls
                    that would have to act on every class using it. */}
                {m.source === 'curriculum' && (
                  <p className="text-[11px] text-neutral-400 truncate">
                    From {m.curriculum_title || 'the curriculum'}
                  </p>
                )}
                {canManage && m.source !== 'curriculum' && (
                  <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-neutral-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={m.visible_to_students !== false}
                      onChange={(e) => setVisible(m, e.target.checked)}
                      className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                    />
                    Students see this
                  </label>
                )}
              </div>
              <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-neutral-500">
                {m.kind === 'link' ? 'Link' : 'Document'}
              </span>
              {m.can_delete && (
                <button onClick={() => remove(m.id)}
                  className="shrink-0 text-xs font-medium text-neutral-400 hover:text-neutral-700 hover:underline"
                  title="Remove from class materials — the original file stays untouched">
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
