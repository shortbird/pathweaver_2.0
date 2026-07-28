import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  BookOpenIcon, DocumentTextIcon, LinkIcon, ArrowUpTrayIcon, TrashIcon,
} from '@heroicons/react/24/outline'
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
export default function ClassCurriculum({ classId, questId, className = '' }) {
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
      setMaterials(data?.materials || [])
      setCanManage(Boolean(data?.can_manage) && Boolean(writeBase))
    } catch (err) {
      const status = err?.response?.status
      if (status === 403 || status === 404) setHidden(true)
    } finally {
      setLoading(false)
    }
  }, [base, writeBase, classId, questId])

  useEffect(() => { load() }, [load])

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

  const remove = async (id) => {
    try {
      await api.delete(`${writeBase}/${id}`)
      setMaterials((prev) => prev.filter((m) => m.id !== id))
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove this item')
    }
  }

  if (hidden) return null

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 sm:p-6 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <BookOpenIcon className="w-5 h-5 text-optio-purple" />
        <h2 className="text-lg font-bold text-gray-900">Curriculum</h2>
      </div>
      <p className="text-sm text-neutral-500 mb-4">
        {canManage
          ? 'Documents and links for this class. Everything you add here is visible to enrolled students.'
          : 'Documents and links your teacher shared with this class.'}
      </p>

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
        <ul className="divide-y divide-gray-100">
          {materials.map((m) => (
            <li key={m.id} className="py-2.5 flex items-center gap-3">
              <span className="shrink-0 text-neutral-400">
                {m.kind === 'link' ? <LinkIcon className="w-5 h-5" /> : <DocumentTextIcon className="w-5 h-5" />}
              </span>
              <a href={m.url} target="_blank" rel="noopener noreferrer"
                className="flex-1 min-w-0 text-sm font-medium text-neutral-800 hover:text-optio-purple truncate">
                {m.title}
              </a>
              <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-neutral-500">
                {m.kind === 'link' ? 'Link' : 'Document'}
              </span>
              {m.can_delete && (
                <button onClick={() => remove(m.id)} className="shrink-0 p-1 text-gray-400 hover:text-red-500"
                  aria-label="Remove" title="Remove">
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
