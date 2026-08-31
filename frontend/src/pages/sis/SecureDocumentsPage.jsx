import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import SearchSelect from '../../components/ui/SearchSelect'
import { useConfirm } from '../../contexts/ConfirmContext'

/**
 * Secure documents — a private, admin-managed store for sensitive SIS files
 * (contracts, background checks, custody/medical docs). v1 is admin-only; files
 * are uploaded to a private bucket and opened via short-lived signed URLs.
 */

const ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp'

const formatDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

const formatSize = (bytes) => {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const SecureDocumentsPage = () => {
  const confirm = useConfirm()
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [docs, setDocs] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('')

  // Upload form state
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [personIds, setPersonIds] = useState([])
  // Deliberately NOT reset after an upload. A school files contracts in one
  // sitting, and re-ticking this 19 times is how 19 contracts ended up private
  // (iCreate, 2026-08-18). It is on screen and unticked on every fresh load, so
  // it stays a visible choice rather than a hidden default.
  const [shareOnUpload, setShareOnUpload] = useState(false)
  // "They must sign this" — the tick that tells a checklist signature item
  // which of somebody's documents is the contract. Sticky for the same reason
  // as the one above: a sitting of nineteen contracts is one decision.
  const [signOnUpload, setSignOnUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileKey, setFileKey] = useState(0) // reset the <input type=file> after upload

  // Inline rename: the id being renamed, and the text being typed.
  const [renamingId, setRenamingId] = useState(null)
  const [renameText, setRenameText] = useState('')

  // Documents ticked for a bulk share. Ids rather than rows so the set survives
  // a reload of the list.
  const [selectedIds, setSelectedIds] = useState([])
  const [sharingBulk, setSharingBulk] = useState(false)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    api.get(withOrg('/api/sis/secure-documents', orgId))
      .then((res) => setDocs(res.data?.documents || []))
      .catch(() => setError('Failed to load secure documents'))
      .finally(() => setLoading(false))
    // Roster feeds the "attach to" picker (everyone in the org).
    api.get(withOrg('/api/sis/roster', orgId))
      .then((res) => setPeople(res.data?.roster || []))
      .catch(() => setPeople([]))
  }, [orgId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    setDocs([]); setFilter(''); setFile(null); setTitle(''); setCategory(''); setNote('')
    setPersonIds([]); setRenamingId(null); setSelectedIds([])
  }, [orgId])

  const personLabel = useCallback((p) => {
    const role = p.is_student ? 'Student' : (p.role || 'Staff/Parent')
    return `${p.name} (${role})`
  }, [])

  // What the office calls this document. Older rows predate titles, so the
  // filename it arrived under is still the fallback everywhere it's shown.
  const docName = useCallback((d) => d.title || d.filename || 'Untitled document', [])

  const filteredDocs = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return docs
    return docs.filter((d) => (
      `${d.title || ''} ${d.filename || ''} ${d.category || ''} ${d.owner_name || ''} ${d.student_name || ''} ${d.uploaded_by_name || ''}`
        .toLowerCase().includes(q)
    ))
  }, [docs, filter])

  const handleUpload = useCallback(async (e) => {
    e.preventDefault()
    if (!file || !orgId) return
    const form = new FormData()
    form.append('file', file)
    form.append('organization_id', orgId)
    if (title.trim()) form.append('title', title.trim())
    if (category.trim()) form.append('category', category.trim())
    if (note.trim()) form.append('note', note.trim())
    // A student attaches as student_user_id; anyone else as owner_user_id.
    // Both fields repeat — the upload is filed once per person selected, so
    // each of them gets their own copy to share, annotate or delete.
    personIds.forEach((id) => {
      const person = people.find((p) => p.student_id === id)
      if (!person) return
      form.append(person.is_student ? 'student_user_id' : 'owner_user_id', person.student_id)
    })
    if (shareOnUpload || signOnUpload) form.append('shared_with_owner', 'true')
    if (signOnUpload) form.append('requires_signature', 'true')
    setUploading(true)
    try {
      const res = await api.post('/api/sis/secure-documents/upload', form)
      const n = res.data?.documents?.length || 1
      toast.success(n > 1 ? `Document filed for ${n} people` : 'Document uploaded')
      setFile(null); setTitle(''); setCategory(''); setNote(''); setPersonIds([])
      setFileKey((k) => k + 1)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to upload document')
    } finally {
      setUploading(false)
    }
  }, [file, orgId, people, personIds, title, category, note, shareOnUpload, signOnUpload, load])

  const handleRename = useCallback(async (doc) => {
    const next = renameText.trim()
    setRenamingId(null)
    if (!next || next === docName(doc)) return
    const previous = doc.title
    setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, title: next } : d)))
    try {
      await api.patch(`/api/sis/secure-documents/${doc.id}`, {
        organization_id: orgId, title: next,
      })
      toast.success('Renamed')
    } catch (err) {
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, title: previous } : d)))
      toast.error(err?.response?.data?.error || 'Could not rename the document')
    }
  }, [orgId, renameText, docName])

  const handleDownload = useCallback(async (doc) => {
    try {
      // A checklist attachment has no store row — its blob lives in a
      // checklist bucket, reached through the admin onboarding door.
      const res = await api.get(doc.source === 'checklist'
        ? withOrg(`/api/sis/staff-admin/onboarding/doc-url?path=${encodeURIComponent(doc.storage_path)}&audience=${doc.audience || 'staff'}`, orgId)
        : withOrg(`/api/sis/secure-documents/${doc.id}/url`, orgId))
      const url = res.data?.url
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      else toast.error('Could not open the document')
    } catch {
      toast.error('Could not open the document')
    }
  }, [orgId])

  const handleDelete = useCallback(async (doc) => {
    if (!(await confirm(`Delete "${docName(doc)}"? This permanently removes the file.`))) return
    try {
      await api.delete(withOrg(`/api/sis/secure-documents/${doc.id}`, orgId))
      toast.success('Document deleted')
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    } catch {
      toast.error('Failed to delete document')
    }
  }, [orgId, docName])

  const aboutLabel = (d) => d.student_name || d.owner_name || '—'

  // Sharing is per document and off by default — this store holds background
  // checks, so visibility to the person a file is about is always a decision
  // someone made on purpose.
  const toggleShare = useCallback(async (doc) => {
    const next = !doc.shared_with_owner
    if (next && !(await confirm(
      `Share "${docName(doc)}" with ${doc.owner_name}? They'll see it in My Documents.`))) return
    try {
      await api.patch(`/api/sis/secure-documents/${doc.id}`, {
        organization_id: orgId, shared_with_owner: next,
      })
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, shared_with_owner: next } : d)))
      toast.success(next ? 'Shared with them' : 'No longer shared')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not change sharing')
    }
  }, [orgId, docName])

  // The second per-row decision: is this the document their checklist is
  // waiting for? Turning it on shares the document as well, because an item
  // waiting on a file its owner cannot open never completes.
  const toggleSign = useCallback(async (doc) => {
    const next = !doc.requires_signature
    try {
      await api.patch(`/api/sis/secure-documents/${doc.id}`, {
        organization_id: orgId, requires_signature: next,
      })
      setDocs((prev) => prev.map((d) => (d.id === doc.id
        ? { ...d, requires_signature: next, shared_with_owner: next || d.shared_with_owner }
        : d)))
      toast.success(next ? 'They will be asked to sign it' : 'No longer needs their signature')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not change that')
    }
  }, [orgId])

  // A document can only be shared with somebody it is filed against, and one
  // they sent in themselves is already theirs — both are unselectable rather
  // than silently skipped by the server.
  const canShare = useCallback((d) => Boolean(d.owner_user_id) && !d.uploaded_by_owner, [])
  const shareableDocs = useMemo(() => filteredDocs.filter(canShare), [filteredDocs, canShare])
  const selectedDocs = useMemo(
    () => shareableDocs.filter((d) => selectedIds.includes(d.id)), [shareableDocs, selectedIds])
  const allSelected = shareableDocs.length > 0 && selectedDocs.length === shareableDocs.length

  const toggleSelected = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  // Select-all covers what the filter is showing, not the whole store — the
  // filter is how you narrow to "this year's contracts" before sharing them.
  const toggleSelectAll = useCallback(() => {
    setSelectedIds(allSelected ? [] : shareableDocs.map((d) => d.id))
  }, [allSelected, shareableDocs])

  const bulkShare = useCallback(async (share) => {
    const ids = selectedDocs.map((d) => d.id)
    if (ids.length === 0) return
    const who = selectedDocs.length === 1
      ? (selectedDocs[0].owner_name || 'that person')
      : `${ids.length} people`
    if (share && !(await confirm(
      `Share ${ids.length === 1 ? 'this document' : `these ${ids.length} documents`} with ${who}? `
      + 'They will be able to open and sign what belongs to them.'))) return
    setSharingBulk(true)
    try {
      const res = await api.patch('/api/sis/secure-documents', {
        organization_id: orgId, document_ids: ids, shared_with_owner: share,
      })
      const n = res.data?.updated ?? ids.length
      setDocs((prev) => prev.map((d) => (
        ids.includes(d.id) ? { ...d, shared_with_owner: share } : d)))
      setSelectedIds([])
      toast.success(share
        ? `Shared with ${n} ${n === 1 ? 'person' : 'people'}`
        : `No longer shared (${n})`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not change sharing')
    } finally {
      setSharingBulk(false)
    }
  }, [confirm, orgId, selectedDocs])

  // Marking the batch as the thing to sign — the counterpart of the bulk share,
  // and how a school that has already filed a contract per teacher tells the
  // checklists which file that is, in one action rather than twenty-three.
  const bulkSign = useCallback(async (sign) => {
    const ids = selectedDocs.map((d) => d.id)
    if (ids.length === 0) return
    if (sign && !(await confirm(
      `Ask for a signature on ${ids.length === 1 ? 'this document' : `these ${ids.length} documents`}? `
      + 'It becomes what their "sign your contract" checklist item asks for, and they will be '
      + 'able to open it.'))) return
    setSharingBulk(true)
    try {
      const res = await api.patch('/api/sis/secure-documents', {
        organization_id: orgId, document_ids: ids, requires_signature: sign,
      })
      const n = res.data?.updated ?? ids.length
      setDocs((prev) => prev.map((d) => (ids.includes(d.id)
        ? { ...d, requires_signature: sign, shared_with_owner: sign || d.shared_with_owner }
        : d)))
      setSelectedIds([])
      toast.success(sign
        ? `${n} ${n === 1 ? 'document' : 'documents'} to sign`
        : `No longer waiting on a signature (${n})`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not change that')
    } finally {
      setSharingBulk(false)
    }
  }, [confirm, orgId, selectedDocs])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Secure documents</h1>
          <p className="text-sm text-neutral-500 mt-1">
            A private, admin-only store for sensitive files — contracts, background checks,
            custody and medical documents. Files are encrypted at rest and opened through
            short-lived links.
          </p>
        </div>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {!orgId && (
        <p className="text-neutral-500">Select an organization to manage its secure documents.</p>
      )}

      {orgId && (
        <div className="space-y-8">
          {/* Upload */}
          <section className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-semibold text-neutral-900 mb-3">Upload a document</h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">File</label>
                  <input
                    key={fileKey}
                    type="file"
                    accept={ACCEPT}
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-neutral-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-optio-purple file:text-white hover:file:opacity-90"
                  />
                  <p className="text-xs text-neutral-400 mt-1">PDF, Word, or image up to 15MB.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Document name <span className="text-neutral-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    aria-label="Document name"
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={file?.name || 'Defaults to the file name'}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
                  />
                  <p className="text-xs text-neutral-400 mt-1">
                    What this file is called in the list. You can rename it later.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Background check, Contract, Medical"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Attach to people <span className="text-neutral-400 font-normal">(optional)</span>
                  </label>
                  {personIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-1.5">
                      {personIds.map((id) => {
                        const p = people.find((x) => x.student_id === id)
                        return (
                          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 text-optio-purple text-xs font-medium px-2.5 py-1">
                            {p ? p.name : 'Person'}
                            <button type="button" aria-label={`Remove ${p ? p.name : 'person'}`}
                              onClick={() => setPersonIds((prev) => prev.filter((x) => x !== id))}
                              className="hover:text-optio-pink font-bold leading-none">×</button>
                          </span>
                        )
                      })}
                    </div>
                  )}
                  <SearchSelect
                    value=""
                    onChange={(id) => {
                      if (id) setPersonIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
                    }}
                    options={people.filter((p) => !personIds.includes(p.student_id))}
                    getId={(p) => p.student_id}
                    getLabel={personLabel}
                    placeholder="Search staff, parents, or students…"
                  />
                  <p className="text-xs text-neutral-400 mt-1">
                    Pick as many as you need — each person gets their own copy, shared and
                    deleted separately.
                  </p>
                  {/* The decision that makes a contract signable, made where the
                      document is filed instead of as a second pass over the
                      list afterwards. Students are attached as the subject of a
                      document, never as its owner, so sharing does not apply to
                      them — see _attach_targets in routes/sis/secure_documents.py. */}
                  <label className="flex items-start gap-2 mt-3 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareOnUpload || signOnUpload}
                      disabled={signOnUpload}
                      onChange={(e) => setShareOnUpload(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-purple-700 disabled:opacity-60"
                    />
                    <span>
                      Let them see it
                      <span className="block text-xs text-neutral-400">
                        Staff and parents get it in their own documents, and can sign it if
                        something is waiting on it. Leave this off for background checks and
                        anything else they should not read. Students are never given the
                        documents filed about them.
                      </span>
                    </span>
                  </label>
                  {/* The second decision, and the one a checklist reads. An item
                      like "Review & Sign Your Contract" names no document — it
                      signs whatever the office has given that person — so
                      without this tick a shared background check is offered as
                      the contract (iCreate, 2026-08-19). */}
                  <label className="flex items-start gap-2 mt-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={signOnUpload}
                      onChange={(e) => setSignOnUpload(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-purple-700"
                    />
                    <span>
                      They must sign this
                      <span className="block text-xs text-neutral-400">
                        For contracts and agreements. It becomes the document their
                        &quot;sign your contract&quot; checklist item asks for, and they can see it
                        either way — nobody can sign what they cannot open.
                      </span>
                    </span>
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Note <span className="text-neutral-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Short description or reference"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={!file || uploading}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Upload document'}
              </button>
            </form>
          </section>

          {/* List */}
          <section>
            <div className="flex items-center justify-between mb-3 gap-4">
              <h2 className="font-semibold text-neutral-900">Documents</h2>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter documents…"
                className="w-64 max-w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
              />
            </div>

            {loading && <p className="text-neutral-500">Loading…</p>}
            {error && !loading && <p className="text-red-600">{error}</p>}

            {!loading && !error && filteredDocs.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-neutral-500">
                {docs.length === 0
                  ? 'No secure documents yet. Upload one above to get started.'
                  : 'No documents match your filter.'}
              </div>
            )}

            {/* Only once something is ticked, so the page is unchanged for
                everyone who never needs it. */}
            {selectedDocs.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-optio-purple/30 bg-optio-purple/5 px-4 py-3">
                <span className="text-sm font-medium text-neutral-800">
                  {selectedDocs.length} selected
                </span>
                <button
                  type="button"
                  onClick={() => bulkShare(true)}
                  disabled={sharingBulk}
                  className="px-3 py-1.5 rounded-lg text-white text-sm font-medium bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 disabled:opacity-50"
                >
                  {sharingBulk ? 'Working…' : 'Let them see it'}
                </button>
                <button
                  type="button"
                  onClick={() => bulkSign(true)}
                  disabled={sharingBulk}
                  className="px-3 py-1.5 rounded-lg border border-optio-purple/40 text-sm font-medium text-optio-purple hover:bg-white disabled:opacity-50"
                >
                  Ask for a signature
                </button>
                <button
                  type="button"
                  onClick={() => bulkShare(false)}
                  disabled={sharingBulk}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-white disabled:opacity-50"
                >
                  Make private
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-sm text-neutral-500 hover:underline"
                >
                  Clear
                </button>
              </div>
            )}

            {!loading && !error && filteredDocs.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-gray-200">
                      <th className="py-3 pl-4 pr-0 w-8">
                        <input
                          type="checkbox"
                          aria-label="Select all documents"
                          checked={allSelected}
                          disabled={shareableDocs.length === 0}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-gray-300 accent-purple-700 disabled:opacity-40"
                        />
                      </th>
                      <th className="py-3 px-4 font-semibold text-neutral-700">Document</th>
                      <th className="py-3 px-4 font-semibold text-neutral-700">Category</th>
                      <th className="py-3 px-4 font-semibold text-neutral-700">About</th>
                      <th className="py-3 px-4 font-semibold text-neutral-700">Shared</th>
                      <th className="py-3 px-4 font-semibold text-neutral-700">To sign</th>
                      <th className="py-3 px-4 font-semibold text-neutral-700">Uploaded by</th>
                      <th className="py-3 px-4 font-semibold text-neutral-700">Date</th>
                      <th className="py-3 px-4 font-semibold text-neutral-700 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map((d) => (
                      <tr key={d.id} className="border-b border-gray-100 align-top">
                        <td className="py-3 pl-4 pr-0">
                          <input
                            type="checkbox"
                            aria-label={`Select ${docName(d)}`}
                            checked={selectedIds.includes(d.id)}
                            disabled={!canShare(d)}
                            onChange={() => toggleSelected(d.id)}
                            className="mt-1 h-4 w-4 rounded border-gray-300 accent-purple-700 disabled:opacity-40"
                          />
                        </td>
                        <td className="py-3 px-4 text-neutral-900">
                          {renamingId === d.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                type="text"
                                value={renameText}
                                aria-label={`Rename ${docName(d)}`}
                                onChange={(e) => setRenameText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRename(d)
                                  if (e.key === 'Escape') setRenamingId(null)
                                }}
                                className="w-48 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
                              />
                              <button type="button" onClick={() => handleRename(d)}
                                className="px-2 py-1 text-xs font-medium text-optio-purple hover:underline">Save</button>
                              <button type="button" onClick={() => setRenamingId(null)}
                                className="px-1 py-1 text-xs text-neutral-500 hover:underline">Cancel</button>
                            </div>
                          ) : (
                            <div className="font-medium">{docName(d)}</div>
                          )}
                          {/* The name it arrived under, once it is no longer what
                              the office calls it — provenance for the person
                              matching a paper file against the system. */}
                          {d.title && d.filename && d.title !== d.filename && (
                            <div className="text-xs text-neutral-400 mt-0.5">File: {d.filename}</div>
                          )}
                          {d.note && <div className="text-xs text-neutral-500 mt-0.5">{d.note}</div>}
                          {d.size_bytes != null && (
                            <div className="text-xs text-neutral-400 mt-0.5">{formatSize(d.size_bytes)}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-neutral-700">{d.category || '—'}</td>
                        <td className="py-3 px-4 text-neutral-700">{aboutLabel(d)}</td>
                        <td className="py-3 px-4">
                          {d.uploaded_by_owner ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              {d.source === 'checklist' ? 'From their checklist' : 'They sent this'}
                            </span>
                          ) : !d.owner_user_id ? (
                            <span className="text-xs text-neutral-400">—</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleShare(d)}
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                d.shared_with_owner
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : 'bg-gray-100 text-neutral-500 hover:bg-gray-200'}`}
                              title={d.shared_with_owner
                                ? 'They can see this in My Documents — click to stop sharing'
                                : 'Only admins can see this — click to share it with them'}
                            >
                              {d.shared_with_owner ? 'Shared with them' : 'Private'}
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {/* What a "sign your contract" checklist item looks for.
                              Off means the document is theirs to read, not to sign. */}
                          {!d.owner_user_id || d.uploaded_by_owner ? (
                            <span className="text-xs text-neutral-400">—</span>
                          ) : d.signed_at ? (
                            // The outcome, not the ask: once their checklist has
                            // recorded a signature against this document, "Needs
                            // signature" is the wrong thing to say about it.
                            <span
                              className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700"
                              title={`Signed${d.signed_by_name ? ` by ${d.signed_by_name}` : ''} on ${formatDate(d.signed_at)}`}
                            >
                              Signed {formatDate(d.signed_at)}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleSign(d)}
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                d.requires_signature
                                  ? 'bg-optio-purple/10 text-optio-purple hover:bg-optio-purple/20'
                                  : 'bg-gray-100 text-neutral-500 hover:bg-gray-200'}`}
                              title={d.requires_signature
                                ? 'Their checklist asks them to sign this — click to stop asking'
                                : 'Not something they sign — click to ask for their signature'}
                            >
                              {d.requires_signature ? 'Needs signature' : 'No signature'}
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4 text-neutral-700">{d.uploaded_by_name || '—'}</td>
                        <td className="py-3 px-4 text-neutral-700 whitespace-nowrap">{formatDate(d.created_at)}</td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleDownload(d)}
                            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50"
                          >
                            Open
                          </button>
                          {/* A checklist attachment is managed on the checklist
                              (removing it there deletes the file) — nothing here
                              to rename or delete. */}
                          {d.source !== 'checklist' && (
                            <>
                              <button
                                type="button"
                                onClick={() => { setRenamingId(d.id); setRenameText(docName(d)) }}
                                className="ml-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50"
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(d)}
                                className="ml-2 px-3 py-1.5 rounded-lg text-sm text-red-600 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default SecureDocumentsPage
