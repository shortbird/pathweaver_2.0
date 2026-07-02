import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

/**
 * SIS Resources — the org's document library (family guidebook, student
 * contract, links). Staff add documents or links here; the org's families see
 * them on the learning app's Resources page any time after registration.
 */
const ResourcesPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [resources, setResources] = useState([])
  const [paperwork, setPaperwork] = useState([]) // registration-form documents (linkable)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null) // resource being edited

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg('/api/sis/resources', orgId))
      .then((r) => {
        setResources(r.data?.resources || [])
        setPaperwork(r.data?.paperwork || [])
      })
      .catch(() => toast.error('Failed to load resources'))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const remove = async (r) => {
    if (!window.confirm(`Remove "${r.title}"? Families will no longer see it.`)) return
    try {
      await api.delete(`/api/sis/resources/${r.id}?organization_id=${orgId}`)
      toast.success('Resource removed')
      load()
    } catch { toast.error('Could not remove resource') }
  }

  const grouped = resources.reduce((acc, r) => {
    const key = r.category || 'General'
    ;(acc[key] = acc[key] || []).push(r)
    return acc
  }, {})

  const paperworkLabel = (key) => paperwork.find((p) => p.key === key)?.label || 'Registration form'
  const linkedKeys = new Set(resources.map((r) => r.paperwork_key).filter(Boolean))
  // Registration documents not yet in the library that already have a file — one-click import.
  const importable = paperwork.filter((p) => !linkedKeys.has(p.key) && p.doc_url)

  const importFromForm = async (p) => {
    try {
      await api.post('/api/sis/resources', {
        organization_id: orgId,
        title: p.label,
        url: p.doc_url,
        category: 'Registration',
        paperwork_key: p.key,
      })
      toast.success(`"${p.label}" added and linked to the registration form`)
      load()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not add') }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Resources</h1>
        <div className="flex items-center gap-3">
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
          {!adding && <Button size="sm" onClick={() => setAdding(true)}>Add resource</Button>}
        </div>
      </div>

      <p className="text-sm text-neutral-500 mb-5 max-w-2xl">
        Documents and links your families can refer back to any time — the family guidebook, student
        contract, calendars, forms. Families find these under "Resources" in their app.
      </p>

      {(adding || editing) && (
        <ResourceForm
          orgId={orgId}
          resource={editing}
          paperwork={paperwork}
          onDone={() => { setAdding(false); setEditing(null); load() }}
          onCancel={() => { setAdding(false); setEditing(null) }}
        />
      )}

      {importable.length > 0 && !adding && !editing && (
        <div className="mb-6 rounded-xl border border-optio-purple/20 bg-optio-purple/5 p-4">
          <div className="text-sm font-medium text-neutral-900 mb-1">From your registration form</div>
          <p className="text-xs text-neutral-500 mb-2">
            These documents are already on the registration form — add them here so families can find them
            anytime. Once linked, this library is the single source: updating the resource updates the form.
          </p>
          <div className="flex flex-wrap gap-2">
            {importable.map((p) => (
              <button key={p.key} onClick={() => importFromForm(p)}
                className="rounded-full border border-optio-purple/40 bg-white px-3 py-1.5 text-sm text-optio-purple hover:bg-optio-purple/10">
                + {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !resources.length && !adding && (
        <p className="text-neutral-500">No resources yet. Add the family guidebook, student contract, and anything else families should keep handy.</p>
      )}

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">{category}</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {items.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-optio-purple hover:underline">{r.title}</a>
                    {r.paperwork_key && (
                      <span
                        className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-optio-purple/10 text-optio-purple"
                        title={`The registration form serves this resource as "${paperworkLabel(r.paperwork_key)}" — update it here and the form updates too.`}
                      >
                        Registration form
                      </span>
                    )}
                  </span>
                  {r.description && <div className="text-xs text-neutral-500 truncate">{r.description}</div>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button onClick={() => { setAdding(false); setEditing(r) }} className="text-sm text-neutral-500 hover:text-optio-purple">Edit</button>
                  <button onClick={() => remove(r)} className="text-sm text-red-500 hover:underline">Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const ResourceForm = ({ orgId, resource, paperwork = [], onDone, onCancel }) => {
  const [f, setF] = useState({
    title: resource?.title || '', description: resource?.description || '',
    url: resource?.url || '', category: resource?.category || '',
    paperwork_key: resource?.paperwork_key || '',
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const upload = async (file) => {
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const r = await api.post(`/api/sis/resources/upload?organization_id=${orgId}`, form)
      set('url', r.data?.url || '')
      toast.success('File uploaded — save to publish')
    } catch (e) { toast.error(e?.response?.data?.error || 'Upload failed') }
    finally { setUploading(false) }
  }

  const save = async () => {
    if (!f.title.trim()) return toast.error('Title is required')
    if (!f.url.trim()) return toast.error('Add a link or upload a file')
    setSaving(true)
    try {
      if (resource) {
        await api.patch(`/api/sis/resources/${resource.id}`, { ...f, organization_id: orgId })
      } else {
        await api.post('/api/sis/resources', { ...f, organization_id: orgId })
      }
      toast.success(resource ? 'Resource updated' : 'Resource added')
      onDone()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not save') }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-neutral-500 block">Title
          <input value={f.title} onChange={(e) => set('title', e.target.value)} className={field} placeholder="Family Guidebook" autoFocus />
        </label>
        <label className="text-xs text-neutral-500 block">Category <span className="text-neutral-400">(optional, groups the list)</span>
          <input value={f.category} onChange={(e) => set('category', e.target.value)} className={field} placeholder="Policies" />
        </label>
      </div>
      <label className="text-xs text-neutral-500 block">Description <span className="text-neutral-400">(optional)</span>
        <input value={f.description} onChange={(e) => set('description', e.target.value)} className={field} placeholder="What families will find inside" />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-neutral-500 block flex-1 min-w-[240px]">Link
          <input value={f.url} onChange={(e) => set('url', e.target.value)} className={field} placeholder="https://… or upload a file" />
        </label>
        <label className="text-sm font-medium text-optio-purple hover:underline cursor-pointer pb-2">
          {uploading ? 'Uploading…' : 'Upload file'}
          <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" className="hidden" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      </div>
      {paperwork.length > 0 && (
        <label className="text-xs text-neutral-500 block">
          Registration form document <span className="text-neutral-400">(optional — links this resource as the form's copy)</span>
          <select value={f.paperwork_key} onChange={(e) => set('paperwork_key', e.target.value)} className={field}>
            <option value="">Not on the registration form</option>
            {paperwork.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          {f.paperwork_key && (
            <span className="block mt-1 text-[11px] text-neutral-400">
              Single source of truth: the registration form will show THIS resource's file/link for
              "{paperwork.find((p) => p.key === f.paperwork_key)?.label}". Update it here and the form updates too.
            </span>
          )}
        </label>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} loading={saving}>{resource ? 'Save changes' : 'Add resource'}</Button>
        <button onClick={onCancel} className="text-sm text-neutral-500 hover:underline">Cancel</button>
      </div>
    </div>
  )
}

export default ResourcesPage
