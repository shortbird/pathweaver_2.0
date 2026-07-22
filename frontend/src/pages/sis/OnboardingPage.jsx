import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import { getPreviewTeacher, withPreview } from './teacherPreview'

/**
 * OnboardingPage — role-switched.
 * Teachers: their checklist(s) — mark items complete, attach documents.
 * Admins: templates (create/edit item lists), assign to staff, review items
 * that need approval. Sensitive documents (tax, background checks) are NOT
 * collected here by design — items should link to the appropriate external
 * system instead.
 */

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent'

const ITEM_BADGE = {
  pending: 'bg-gray-100 text-neutral-600',
  complete: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const ItemBadge = ({ status }) => (
  <span className={`text-xs px-2 py-0.5 rounded-full capitalize shrink-0 ${ITEM_BADGE[status] || ITEM_BADGE.pending}`}>
    {status || 'pending'}
  </span>
)

// ── Teacher view ──────────────────────────────────────────────────────────────

const MyChecklists = ({ orgId, preview = null }) => {
  const [assignments, setAssignments] = useState([])
  const [busyKey, setBusyKey] = useState(null)

  const load = useCallback(() => {
    api.get(withPreview(withOrg('/api/sis/teacher/onboarding', orgId), preview))
      .then((r) => setAssignments(r.data?.assignments || []))
      .catch(() => toast.error('Failed to load your onboarding'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, preview?.id])

  useEffect(() => { if (orgId) load() }, [load, orgId])

  const patchItem = async (assignmentId, itemKey, fields) => {
    setBusyKey(`${assignmentId}:${itemKey}`)
    try {
      await api.patch(`/api/sis/teacher/onboarding/${assignmentId}/items/${itemKey}`, {
        organization_id: orgId, ...fields,
      })
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update the item')
    } finally {
      setBusyKey(null)
    }
  }

  const uploadDoc = async (assignmentId, itemKey, file) => {
    const form = new FormData()
    form.append('file', file)
    setBusyKey(`${assignmentId}:${itemKey}`)
    try {
      const r = await api.post(withOrg('/api/sis/teacher/onboarding/upload', orgId), form)
      await patchItem(assignmentId, itemKey, { document_url: r.data?.path, status: 'complete' })
      toast.success('Document attached')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Upload failed')
      setBusyKey(null)
    }
  }

  const openDoc = async (path) => {
    try {
      const r = await api.get(withOrg(`/api/sis/teacher/onboarding/doc-url?path=${encodeURIComponent(path)}`, orgId))
      if (r.data?.url) window.open(r.data.url, '_blank', 'noopener')
    } catch {
      toast.error('Could not open the document')
    }
  }

  if (!assignments.length) {
    return (
      <p className="text-neutral-500">
        {preview ? `No onboarding checklist assigned to ${preview.name}.` : 'No onboarding checklist assigned to you.'}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {assignments.map((a) => (
        <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-neutral-900">{a.template_name || 'Onboarding'}</h2>
            <span className="text-sm text-neutral-500">{a.done_count}/{a.total_count} complete</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {(a.items || []).map((item) => {
              const busy = busyKey === `${a.id}:${item.key}`
              const done = ['complete', 'approved'].includes(item.status)
              return (
                <li key={item.key} className="py-3 flex items-start gap-3">
                  <input type="checkbox" checked={done} disabled={busy || item.status === 'approved' || Boolean(preview)}
                    onChange={(e) => patchItem(a.id, item.key, { status: e.target.checked ? 'complete' : 'pending' })}
                    className="mt-1 h-4 w-4 accent-purple-700" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${done ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
                        {item.title}
                      </span>
                      {!item.required && <span className="text-xs text-neutral-400">optional</span>}
                      {item.due_date && <span className="text-xs text-neutral-400">due {item.due_date}</span>}
                      <ItemBadge status={item.status} />
                    </div>
                    {item.description && <p className="text-sm text-neutral-500 mt-0.5">{item.description}</p>}
                    {item.admin_notes && <p className="text-sm text-amber-700 mt-0.5">Note: {item.admin_notes}</p>}
                    {item.needs_document && (
                      <div className="mt-1.5 flex items-center gap-3">
                        {item.document_url ? (
                          <button onClick={() => openDoc(item.document_url)} className="text-sm text-optio-purple hover:underline">
                            View document
                          </button>
                        ) : null}
                        <label className={`text-sm text-optio-purple hover:underline cursor-pointer ${preview ? 'hidden' : ''}`}>
                          {item.document_url ? 'Replace document' : 'Upload document'}
                          <input type="file" className="hidden" disabled={busy}
                            onChange={(e) => e.target.files?.[0] && uploadDoc(a.id, item.key, e.target.files[0])} />
                        </label>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

// ── Admin view ────────────────────────────────────────────────────────────────

const emptyItem = () => ({ title: '', description: '', required: true, needs_document: false, needs_approval: false })

const TemplateEditor = ({ orgId, template, onSaved, onCancel }) => {
  const [name, setName] = useState(template?.name || '')
  const [roleType, setRoleType] = useState(template?.role_type || '')
  const [items, setItems] = useState(template?.items?.length ? template.items : [emptyItem()])
  const [busy, setBusy] = useState(false)

  const setItem = (i, patch) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  const save = async () => {
    if (!name.trim()) { toast.error('Template name is required'); return }
    const cleaned = items.filter((it) => it.title.trim())
    if (!cleaned.length) { toast.error('Add at least one item'); return }
    setBusy(true)
    try {
      const body = { organization_id: orgId, name: name.trim(), role_type: roleType.trim(), items: cleaned }
      if (template?.id) await api.put(`/api/sis/staff-admin/onboarding/templates/${template.id}`, body)
      else await api.post('/api/sis/staff-admin/onboarding/templates', body)
      toast.success('Template saved')
      onSaved()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the template')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-optio-purple/30 rounded-xl p-4 space-y-3 bg-optio-purple/5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name (e.g. Employee onboarding)" className={inputClass} />
        <input value={roleType} onChange={(e) => setRoleType(e.target.value)} placeholder="For role (e.g. employee, contractor)" className={inputClass} />
      </div>
      {items.map((it, i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input value={it.title} onChange={(e) => setItem(i, { title: e.target.value })}
              placeholder={`Item ${i + 1} title`} className={inputClass} />
            <button onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
              className="text-sm text-red-600 hover:underline shrink-0">Remove</button>
          </div>
          <input value={it.description || ''} onChange={(e) => setItem(i, { description: e.target.value })}
            placeholder="Instructions (optional — link out for sensitive documents)" className={inputClass} />
          <div className="flex items-center gap-4 text-sm text-neutral-600">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={it.required !== false} onChange={(e) => setItem(i, { required: e.target.checked })} /> Required
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!it.needs_document} onChange={(e) => setItem(i, { needs_document: e.target.checked })} /> Needs document
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!it.needs_approval} onChange={(e) => setItem(i, { needs_approval: e.target.checked })} /> Needs admin approval
            </label>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button onClick={() => setItems((prev) => [...prev, emptyItem()])} className="text-sm text-optio-purple hover:underline">
          + Add item
        </button>
        <div className="ml-auto flex gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">Cancel</button>
          <button onClick={save} disabled={busy}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
            Save template
          </button>
        </div>
      </div>
    </div>
  )
}

const AdminOnboarding = ({ orgId }) => {
  const [templates, setTemplates] = useState([])
  const [assignments, setAssignments] = useState([])
  const [staff, setStaff] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | template
  const [assignTemplate, setAssignTemplate] = useState('')
  const [assignUser, setAssignUser] = useState('')

  const load = useCallback(() => {
    Promise.all([
      api.get(withOrg('/api/sis/staff-admin/onboarding/templates', orgId)),
      api.get(withOrg('/api/sis/staff-admin/onboarding/assignments', orgId)),
      api.get(withOrg('/api/sis/staff', orgId)),
    ]).then(([t, a, s]) => {
      setTemplates(t.data?.templates || [])
      setAssignments(a.data?.assignments || [])
      setStaff(s.data?.staff || [])
    }).catch(() => toast.error('Failed to load onboarding admin'))
  }, [orgId])

  useEffect(() => { if (orgId) load() }, [load, orgId])

  const assign = async () => {
    if (!assignTemplate || !assignUser) { toast.error('Pick a template and a staff member'); return }
    try {
      await api.post('/api/sis/staff-admin/onboarding/assignments', {
        organization_id: orgId, template_id: assignTemplate, user_id: assignUser,
      })
      toast.success('Checklist assigned')
      setAssignUser('')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not assign')
    }
  }

  const reviewItem = async (assignmentId, itemKey, status) => {
    try {
      await api.patch(`/api/sis/teacher/onboarding/${assignmentId}/items/${itemKey}`, {
        organization_id: orgId, status,
      })
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update')
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-neutral-900">Templates</h2>
          {!editing && (
            <button onClick={() => setEditing('new')} className="text-sm text-optio-purple font-medium hover:underline">
              + New template
            </button>
          )}
        </div>
        {editing && (
          <TemplateEditor orgId={orgId} template={editing === 'new' ? null : editing}
            onSaved={() => { setEditing(null); load() }} onCancel={() => setEditing(null)} />
        )}
        <ul className="divide-y divide-gray-100 mt-2">
          {templates.map((t) => (
            <li key={t.id} className="py-2.5 flex items-center gap-2">
              <span className="text-sm font-medium text-neutral-900">{t.name}</span>
              {t.role_type && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-neutral-600">{t.role_type}</span>}
              <span className="text-xs text-neutral-400">{(t.items || []).length} items</span>
              <button onClick={() => setEditing(t)} className="text-sm text-optio-purple hover:underline ml-auto">Edit</button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
          <select value={assignTemplate} onChange={(e) => setAssignTemplate(e.target.value)} className={inputClass}>
            <option value="">Assign template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={assignUser} onChange={(e) => setAssignUser(e.target.value)} className={inputClass}>
            <option value="">To staff member…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={assign}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold shrink-0">
            Assign
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-neutral-900 mb-3">Staff progress</h2>
        {!assignments.length && <p className="text-sm text-neutral-500">No checklists assigned yet.</p>}
        <div className="space-y-3">
          {assignments.map((a) => (
            <details key={a.id} className="border border-gray-200 rounded-lg">
              <summary className="px-3 py-2.5 cursor-pointer flex items-center gap-2 text-sm">
                <span className="font-medium text-neutral-900">{a.user_name}</span>
                <span className="text-neutral-500">{a.template_name}</span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                  a.status === 'complete' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
                  {a.done_count}/{a.total_count}
                </span>
              </summary>
              <ul className="px-3 pb-3 divide-y divide-gray-100">
                {(a.items || []).map((item) => (
                  <li key={item.key} className="py-2 flex items-center gap-2 text-sm">
                    <span className="text-neutral-800">{item.title}</span>
                    <ItemBadge status={item.status} />
                    {item.needs_approval && item.status === 'complete' && (
                      <span className="ml-auto flex gap-2">
                        <button onClick={() => reviewItem(a.id, item.key, 'approved')}
                          className="px-2.5 py-1 rounded bg-green-600 text-white text-xs">Approve</button>
                        <button onClick={() => reviewItem(a.id, item.key, 'rejected')}
                          className="px-2.5 py-1 rounded bg-red-600 text-white text-xs">Reject</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}

const OnboardingPage = () => {
  const { user } = useAuth()
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const admin = isSisAdmin(user)
  const [preview] = useState(() => (isSisAdmin(user) ? getPreviewTeacher() : null))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Onboarding</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>
      {admin && !preview
        ? <AdminOnboarding orgId={orgId} />
        : <MyChecklists orgId={orgId} preview={preview} />}
    </div>
  )
}

export default OnboardingPage
