import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  DocumentTextIcon, LinkIcon, ArrowUpTrayIcon, PlusIcon, TrashIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * CurriculumMaterials — the links and documents saved on one curriculum, each
 * with a switch for whether students see it.
 *
 * iCreate/Horizon, 2026-09-02: "youtube links, documents, all the same. it's
 * things that are saved in curriculum that teachers have the option to have
 * appear in the student class view so they can access some kind of resource."
 *
 * So a pasted link and an uploaded file are one list, and the only thing that
 * distinguishes a handout from a teacher's answer key is the switch. It reads as
 * "Students see this" rather than a checkbox labelled with a field name, because
 * the consequence is what the teacher is deciding — this list is inherited by
 * EVERY class on the curriculum, which is the reason to put it here.
 *
 * Adding checks the box: handing something over is the normal case, and the
 * silent version of this ("I added it and nothing happened") is the exact bug
 * this whole area just came out of.
 */
export default function CurriculumMaterials({ orgId, curriculumId }) {
  const base = `/api/sis/curriculum/${curriculumId}/materials`

  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [showLink, setShowLink] = useState(false)
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(withOrg(base, orgId))
      setMaterials(data?.materials || [])
    } catch {
      toast.error('Could not load this curriculum’s resources')
    } finally {
      setLoading(false)
    }
  }, [base, orgId])

  useEffect(() => { load() }, [load])

  const addLink = async (e) => {
    e.preventDefault()
    const title = linkTitle.trim()
    let url = linkUrl.trim()
    if (!title || !url) return
    // A pasted YouTube or Drive URL often arrives without a scheme; the backend
    // refuses anything that isn't http(s), so add the one it expects here
    // rather than bounce the teacher with an error about a colon.
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    setSaving(true)
    try {
      await api.post(withOrg(base, orgId), { title, url, visible_to_students: true })
      setLinkTitle(''); setLinkUrl(''); setShowLink(false)
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the link')
    } finally {
      setSaving(false)
    }
  }

  const uploadFile = async (e) => {
    const file = e.target.files?.[0]
    if (file) e.target.value = '' // let the same file be picked again later
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    form.append('title', file.name)
    form.append('visible_to_students', 'true')
    setUploading(true)
    try {
      await api.post(withOrg(`${base}/upload`, orgId), form,
        { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Document added')
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not upload the file')
    } finally {
      setUploading(false)
    }
  }

  const setVisible = async (m, visible) => {
    setBusyId(m.id)
    // Optimistic: the switch is the whole interaction, so it has to feel like one.
    setMaterials((prev) => prev.map((x) => (
      x.id === m.id ? { ...x, visible_to_students: visible } : x)))
    try {
      await api.patch(withOrg(`${base}/${m.id}`, orgId), { visible_to_students: visible })
    } catch (err) {
      setMaterials((prev) => prev.map((x) => (
        x.id === m.id ? { ...x, visible_to_students: !visible } : x)))
      toast.error(err?.response?.data?.error || 'Could not change who can see this')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (m) => {
    setBusyId(m.id)
    try {
      await api.delete(withOrg(`${base}/${m.id}`, orgId))
      setMaterials((prev) => prev.filter((x) => x.id !== m.id))
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove this resource')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-2 mb-1">
        <DocumentTextIcon className="w-4 h-4 text-optio-purple" />
        <h4 className="text-sm font-semibold text-neutral-800">Resources</h4>
      </div>
      <p className="text-xs text-neutral-400 mb-2">
        Videos, links and documents. Anything switched on appears on the class page for
        students in every class using this curriculum. Switch it off to keep it to staff.
      </p>

      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : !materials.length ? (
        <p className="text-sm text-neutral-400 py-1">Nothing saved yet.</p>
      ) : (
        <ul className="divide-y divide-gray-50 mb-2">
          {materials.map((m) => (
            <li key={m.id} className="py-2 flex items-start gap-2">
              {m.kind === 'file'
                ? <DocumentTextIcon className="w-4 h-4 mt-0.5 shrink-0 text-neutral-400" />
                : <LinkIcon className="w-4 h-4 mt-0.5 shrink-0 text-neutral-400" />}
              <div className="flex-1 min-w-0">
                <a href={m.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-neutral-800 hover:text-optio-purple truncate block">
                  {m.title}
                </a>
                <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-neutral-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(m.visible_to_students)}
                    disabled={busyId === m.id}
                    onChange={(e) => setVisible(m, e.target.checked)}
                    className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                  />
                  Students see this
                </label>
              </div>
              {m.can_delete && (
                <button type="button" disabled={busyId === m.id}
                  aria-label={`Remove ${m.title}`}
                  onClick={() => remove(m)}
                  className="text-neutral-400 hover:text-red-500 shrink-0 disabled:opacity-50">
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!showLink ? (
        <div className="flex flex-wrap gap-3 pt-1">
          <button type="button" onClick={() => setShowLink(true)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-optio-purple hover:underline">
            <PlusIcon className="w-4 h-4" /> Add a link
          </button>
          <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-optio-purple hover:underline disabled:opacity-50">
            <ArrowUpTrayIcon className="w-4 h-4" />
            {uploading ? 'Uploading…' : 'Upload a document'}
          </button>
          <input ref={fileRef} type="file" onChange={uploadFile} className="hidden" />
        </div>
      ) : (
        <form onSubmit={addLink} className="space-y-2 pt-1">
          <input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)}
            placeholder="What is it? (e.g. Intro to Human Anatomy video)"
            aria-label="Resource title"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Paste the link"
            aria-label="Resource link"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setShowLink(false); setLinkTitle(''); setLinkUrl('') }}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-neutral-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !linkTitle.trim() || !linkUrl.trim()}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
