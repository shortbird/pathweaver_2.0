import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import SearchSelect from '../../components/ui/SearchSelect'

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
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [docs, setDocs] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('')

  // Upload form state
  const [file, setFile] = useState(null)
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [personId, setPersonId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [fileKey, setFileKey] = useState(0) // reset the <input type=file> after upload

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
    setDocs([]); setFilter(''); setFile(null); setCategory(''); setNote(''); setPersonId('')
  }, [orgId])

  const personLabel = useCallback((p) => {
    const role = p.is_student ? 'Student' : (p.role || 'Staff/Parent')
    return `${p.name} (${role})`
  }, [])

  const filteredDocs = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return docs
    return docs.filter((d) => (
      `${d.filename || ''} ${d.category || ''} ${d.owner_name || ''} ${d.student_name || ''} ${d.uploaded_by_name || ''}`
        .toLowerCase().includes(q)
    ))
  }, [docs, filter])

  const handleUpload = useCallback(async (e) => {
    e.preventDefault()
    if (!file || !orgId) return
    const person = people.find((p) => p.student_id === personId)
    const form = new FormData()
    form.append('file', file)
    form.append('organization_id', orgId)
    if (category.trim()) form.append('category', category.trim())
    if (note.trim()) form.append('note', note.trim())
    // A student attaches as student_user_id; anyone else as owner_user_id.
    if (person) {
      if (person.is_student) form.append('student_user_id', person.student_id)
      else form.append('owner_user_id', person.student_id)
    }
    setUploading(true)
    try {
      await api.post('/api/sis/secure-documents/upload', form)
      toast.success('Document uploaded')
      setFile(null); setCategory(''); setNote(''); setPersonId(''); setFileKey((k) => k + 1)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to upload document')
    } finally {
      setUploading(false)
    }
  }, [file, orgId, people, personId, category, note, load])

  const handleDownload = useCallback(async (doc) => {
    try {
      const res = await api.get(withOrg(`/api/sis/secure-documents/${doc.id}/url`, orgId))
      const url = res.data?.url
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      else toast.error('Could not open the document')
    } catch {
      toast.error('Could not open the document')
    }
  }, [orgId])

  const handleDelete = useCallback(async (doc) => {
    if (!window.confirm(`Delete "${doc.filename}"? This permanently removes the file.`)) return
    try {
      await api.delete(withOrg(`/api/sis/secure-documents/${doc.id}`, orgId))
      toast.success('Document deleted')
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    } catch {
      toast.error('Failed to delete document')
    }
  }, [orgId])

  const aboutLabel = (d) => d.student_name || d.owner_name || '—'

  // Sharing is per document and off by default — this store holds background
  // checks, so visibility to the person a file is about is always a decision
  // someone made on purpose.
  const toggleShare = useCallback(async (doc) => {
    const next = !doc.shared_with_owner
    if (next && !window.confirm(
      `Share "${doc.filename}" with ${doc.owner_name}? They'll see it in My Documents.`)) return
    try {
      await api.patch(`/api/sis/secure-documents/${doc.id}`, {
        organization_id: orgId, shared_with_owner: next,
      })
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, shared_with_owner: next } : d)))
      toast.success(next ? 'Shared with them' : 'No longer shared')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not change sharing')
    }
  }, [orgId])

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
                    Attach to a person <span className="text-neutral-400 font-normal">(optional)</span>
                  </label>
                  <SearchSelect
                    value={personId}
                    onChange={setPersonId}
                    options={people}
                    getId={(p) => p.student_id}
                    getLabel={personLabel}
                    placeholder="Search staff, parents, or students…"
                  />
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

            {!loading && !error && filteredDocs.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-gray-200">
                      <th className="py-3 px-4 font-semibold text-neutral-700">Document</th>
                      <th className="py-3 px-4 font-semibold text-neutral-700">Category</th>
                      <th className="py-3 px-4 font-semibold text-neutral-700">About</th>
                      <th className="py-3 px-4 font-semibold text-neutral-700">Shared</th>
                      <th className="py-3 px-4 font-semibold text-neutral-700">Uploaded by</th>
                      <th className="py-3 px-4 font-semibold text-neutral-700">Date</th>
                      <th className="py-3 px-4 font-semibold text-neutral-700 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map((d) => (
                      <tr key={d.id} className="border-b border-gray-100 align-top">
                        <td className="py-3 px-4 text-neutral-900">
                          <div className="font-medium">{d.filename}</div>
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
                              They sent this
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
                          <button
                            type="button"
                            onClick={() => handleDelete(d)}
                            className="ml-2 px-3 py-1.5 rounded-lg text-sm text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
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
