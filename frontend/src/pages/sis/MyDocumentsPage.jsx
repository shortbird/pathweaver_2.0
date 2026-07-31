import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  DocumentTextIcon, ArrowUpTrayIcon, ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import BackToDashboard from '../../components/sis/BackToDashboard'

/**
 * MyDocumentsPage — a staff member's own documents.
 *
 * Shows only two things: documents the school explicitly shared with them (a
 * contract to sign, a copy of their agreement) and documents they sent in
 * themselves. Anything else the office holds about them — background checks
 * above all — is not visible here, and the backend enforces that rather than
 * relying on this page to filter.
 */

const formatSize = (bytes) => {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const MyDocumentsPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [note, setNote] = useState('')
  const fileRef = useRef(null)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg('/api/sis/teacher/my-documents', orgId))
      .then((r) => setDocs(r.data?.documents || []))
      .catch(() => toast.error('Failed to load your documents'))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const upload = async (e) => {
    const file = e.target.files?.[0]
    if (file) e.target.value = ''
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    form.append('organization_id', orgId)
    if (note.trim()) form.append('note', note.trim())
    setUploading(true)
    try {
      await api.post('/api/sis/teacher/my-documents/upload', form)
      toast.success('Sent to the school office')
      setNote('')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not upload the document')
    } finally {
      setUploading(false)
    }
  }

  const open = async (doc) => {
    try {
      const r = await api.get(withOrg(`/api/sis/teacher/my-documents/${doc.id}/url`, orgId))
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
                <p className="text-sm font-medium text-neutral-900 truncate">{d.filename}</p>
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
        <h1 className="text-2xl font-bold text-neutral-900">My Documents</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>
      <p className="text-sm text-neutral-500 mb-6">
        Documents the school has shared with you, and anything you send back.
        Print a contract, sign it, photograph it, and upload it here — no need to drop off paper.
      </p>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <p className="text-sm font-semibold text-neutral-900 mb-2">Send a document to the office</p>
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

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && (
        <>
          <List title="Shared with you" items={fromSchool}
            empty="Nothing shared with you yet." />
          <List title="You sent" items={fromMe}
            empty="You haven't sent anything in yet." />
        </>
      )}
    </div>
  )
}

export default MyDocumentsPage
