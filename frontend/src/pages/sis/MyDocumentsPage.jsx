import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  DocumentTextIcon, ArrowUpTrayIcon, ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import BackToDashboard from '../../components/sis/BackToDashboard'
import { getPreviewTeacher, withPreview } from './teacherPreview'

/**
 * MyDocumentsPage — a staff member's own documents.
 *
 * Shows only two things: documents the school explicitly shared with them (a
 * contract to sign, a copy of their agreement) and documents they sent in
 * themselves. Anything else the office holds about them — background checks
 * above all — is not visible here, and the backend enforces that rather than
 * relying on this page to filter.
 *
 * Under the teacher-portal preview this is the teacher's page, not the admin's:
 * every read carries ?teacher_id=. Without it the office walked the staff list
 * and saw its OWN documents under each teacher's name — one admin's background
 * check, nineteen times (iCreate, 2026-08-19). Sending a document in stays
 * caller-bound, so the upload box is hidden in preview rather than filing the
 * admin's file against the teacher.
 */

const formatSize = (bytes) => {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const MyDocumentsPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [preview] = useState(() => getPreviewTeacher())
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const fileRef = useRef(null)
  const who = preview ? preview.name : null

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    api.get(withPreview(withOrg('/api/sis/teacher/my-documents', orgId), preview))
      .then((r) => { setDocs(r.data?.documents || []); setError(null) })
      .catch((err) => {
        setDocs([])
        // 403 is the one refusal worth spelling out: a campus coordinator
        // previewing a teacher may not see employment paperwork, and an empty
        // list would read as "the office never sent them anything".
        setError(err?.response?.status === 403
          ? (err?.response?.data?.error || 'You cannot view this person\u2019s documents.')
          : 'Failed to load documents')
      })
      .finally(() => setLoading(false))
  }, [orgId, preview])

  useEffect(() => { load() }, [load])

  const upload = async (e) => {
    const file = e.target.files?.[0]
    if (file) e.target.value = ''
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    form.append('organization_id', orgId)
    if (name.trim()) form.append('title', name.trim())
    if (note.trim()) form.append('note', note.trim())
    setUploading(true)
    try {
      await api.post('/api/sis/teacher/my-documents/upload', form)
      toast.success('Sent to the school office')
      setName(''); setNote('')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not upload the document')
    } finally {
      setUploading(false)
    }
  }

  const open = async (doc) => {
    try {
      const r = await api.get(
        withPreview(withOrg(`/api/sis/teacher/my-documents/${doc.id}/url`, orgId), preview))
      if (r.data?.url) window.open(r.data.url, '_blank', 'noopener,noreferrer')
      else toast.error('Could not open the document')
    } catch {
      toast.error('Could not open the document')
    }
  }

  const fromSchool = docs.filter((d) => !d.uploaded_by_owner)
  const fromMe = docs.filter((d) => d.uploaded_by_owner)

  const List = ({ title, items, empty }) => (
    <div className="mb-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">{title}</h2>
      {!items.length ? (
        <p className="text-sm text-neutral-500">{empty}</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {items.map((d) => (
            <div key={d.id} className="p-4 flex items-center gap-3">
              <DocumentTextIcon className="w-5 h-5 text-neutral-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">{d.title || d.filename}</p>
                <p className="text-xs text-neutral-400">
                  {d.category || 'Document'}
                  {d.size_bytes ? ` · ${formatSize(d.size_bytes)}` : ''}
                  {d.created_at ? ` · ${new Date(d.created_at).toLocaleDateString()}` : ''}
                </p>
                {d.note && <p className="text-xs text-neutral-500 mt-0.5">{d.note}</p>}
              </div>
              <button onClick={() => open(d)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50">
                <ArrowDownTrayIcon className="w-4 h-4" /> Open
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div>
      <BackToDashboard className="mb-1" />
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-neutral-900">
          {who ? `${who}'s documents` : 'My Documents'}
        </h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>
      <p className="text-sm text-neutral-500 mb-6">
        {who
          ? `What ${who} sees here: the documents the school has shared with them, and anything they have sent back.`
          : 'Documents the school has shared with you, and anything you send back. '
            + 'Print a contract, sign it, photograph it, and upload it here — no need to drop off paper.'}
      </p>

      {preview && (
        <p className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800 mb-6">
          Previewing {who}&apos;s documents. Sending a document in is hidden here — an upload
          would be filed as yours, not theirs.
        </p>
      )}

      {!preview && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <p className="text-sm font-semibold text-neutral-900 mb-2">Send a document to the office</p>
          {/* Naming it here is the whole point: the office would otherwise get
              "IMG_4021.jpg" and have to rename it by hand. */}
          <input value={name} onChange={(e) => setName(e.target.value)}
            aria-label="Document name"
            placeholder="Name this file (optional — e.g. Smith - Contract 2026)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="What is it? (optional — e.g. signed contract)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading || !orgId}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
            <ArrowUpTrayIcon className="w-4 h-4" />
            {uploading ? 'Uploading…' : 'Choose a file'}
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={upload}
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" />
          <p className="text-xs text-neutral-400 mt-2">PDF, Word, or a photo. Up to 10MB.</p>
        </div>
      )}

      {loading && <p className="text-neutral-500">Loading…</p>}
      {error && !loading && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && (
        <>
          <List title={who ? `Shared with ${who}` : 'Shared with you'} items={fromSchool}
            empty={who ? `Nothing shared with ${who} yet.` : 'Nothing shared with you yet.'} />
          <List title={who ? `${who} sent` : 'You sent'} items={fromMe}
            empty={who ? `${who} hasn't sent anything in yet.` : "You haven't sent anything in yet."} />
        </>
      )}
    </div>
  )
}

export default MyDocumentsPage
