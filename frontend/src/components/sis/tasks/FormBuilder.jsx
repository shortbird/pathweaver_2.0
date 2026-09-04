import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import { withOrg } from '../../../pages/sis/useSisOrg'
import { useConfirm } from '../../../contexts/ConfirmContext'
import SearchSelect from '../../ui/SearchSelect'

/**
 * Build the school's own forms — the editor checklists always had and forms
 * never did (iCreate, 16b736f3).
 *
 * Deliberately the same shape as the checklist template editor next to it: a
 * name, a list of things, and the same Duplicate / Retire / Delete row. Molly
 * went looking for this by analogy with checklists, so it should look like the
 * thing she was looking for.
 */

const FIELD_TYPES = [
  ['short_text', 'Short answer'],
  ['long_text', 'Paragraph'],
  ['date', 'Date'],
  ['number', 'Number'],
  ['select', 'Choose one'],
  ['checkbox', 'Tick box'],
  ['student', 'Pick a student'],
  ['class', 'Pick a class'],
  ['staff', 'Pick a staff member'],
]

const PRIORITIES = [['', 'Normal (default)'], ['low', 'Low'], ['normal', 'Normal'],
  ['high', 'High'], ['urgent', 'Urgent']]

const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const emptyField = () => ({ label: '', type: 'short_text', required: false, options: [], help: '' })

const FormEditor = ({ orgId, template, staff, onSaved, onCancel }) => {
  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [audience, setAudience] = useState(template?.audience || 'staff')
  const [assignee, setAssignee] = useState(template?.default_assignee_id || '')
  const [priority, setPriority] = useState(template?.default_priority || '')
  const [fields, setFields] = useState(
    template?.fields?.length ? template.fields : [emptyField()])
  const [busy, setBusy] = useState(false)

  const setField = (i, patch) =>
    setFields((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  const moveField = (i, dir) => setFields((prev) => {
    const j = i + dir
    if (j < 0 || j >= prev.length) return prev
    const next = [...prev]
    const [moved] = next.splice(i, 1)
    next.splice(j, 0, moved)
    return next
  })

  // No key on the copy: the server mints a fresh one, so answers recorded
  // against the original can never land on the duplicate.
  const duplicateField = (i) => setFields((prev) => {
    const { key, ...rest } = prev[i]
    return [...prev.slice(0, i + 1), { ...rest, label: `${prev[i].label} (copy)` }, ...prev.slice(i + 1)]
  })

  const save = async () => {
    if (!name.trim()) { toast.error('The form needs a name'); return }
    setBusy(true)
    try {
      const body = {
        organization_id: orgId,
        name: name.trim(),
        description: description.trim(),
        audience,
        default_assignee_id: assignee || null,
        default_priority: priority || null,
        fields: fields.filter((f) => f.label.trim()),
      }
      if (template?.id) await api.put(`/api/sis/staff-admin/form-templates/${template.id}`, body)
      else await api.post('/api/sis/staff-admin/form-templates', body)
      toast.success('Form saved')
      onSaved()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the form')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-optio-purple/30 rounded-xl p-4 space-y-3 bg-optio-purple/5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} className={input}
          placeholder="Form name (e.g. Incident report)" aria-label="Form name" />
        <select value={audience} onChange={(e) => setAudience(e.target.value)} className={input}
          aria-label="Who can file this">
          <option value="staff">Staff file this</option>
          <option value="family">Families file this</option>
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={input}
          aria-label="Priority it opens at">
          {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
        className={input} aria-label="Directions"
        placeholder="Directions (optional) — shown above the questions" />

      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1">
          Send it straight to (optional)
        </label>
        <SearchSelect
          value={assignee}
          onChange={setAssignee}
          options={staff}
          getId={(s) => s.id}
          getLabel={(s) => s.name || s.display_name || s.email}
          placeholder="Nobody — it waits in the queue"
          emptyLabel="Nobody — it waits in the queue"
        />
      </div>

      {fields.map((f, i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input value={f.label} onChange={(e) => setField(i, { label: e.target.value })}
              placeholder={`Question ${i + 1}`} className={input} />
            <select value={f.type} onChange={(e) => setField(i, { type: e.target.value })}
              className={`${input} w-44 shrink-0`} aria-label={`Type of question ${i + 1}`}>
              {FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => moveField(i, -1)} disabled={i === 0}
                title="Move question up"
                className="px-2 py-1 text-xs rounded border border-gray-200 text-neutral-600 hover:bg-gray-50 disabled:opacity-30">↑</button>
              <button type="button" onClick={() => moveField(i, 1)} disabled={i === fields.length - 1}
                title="Move question down"
                className="px-2 py-1 text-xs rounded border border-gray-200 text-neutral-600 hover:bg-gray-50 disabled:opacity-30">↓</button>
              <button type="button" onClick={() => duplicateField(i)} title="Duplicate this question"
                className="px-2 py-1 text-xs rounded border border-gray-200 text-neutral-600 hover:bg-gray-50">Duplicate</button>
              <button type="button" onClick={() => setFields((p) => p.filter((_, j) => j !== i))}
                className="text-sm text-red-600 hover:underline ml-1">Remove</button>
            </div>
          </div>
          <input value={f.help || ''} onChange={(e) => setField(i, { help: e.target.value })}
            placeholder="Hint under the question (optional)" className={input} />
          {f.type === 'select' && (
            <textarea rows={3} className={input}
              aria-label={`Choices for question ${i + 1}`}
              placeholder={'One choice per line'}
              value={Array.isArray(f.options) ? f.options.join('\n') : (f.options || '')}
              onChange={(e) => setField(i, { options: e.target.value.split('\n') })} />
          )}
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={!!f.required} className="accent-optio-purple"
              onChange={(e) => setField(i, { required: e.target.checked })} />
            Required
          </label>
        </div>
      ))}

      <button onClick={() => setFields((p) => [...p, emptyField()])}
        className="text-sm text-optio-purple font-medium hover:underline">+ Add question</button>

      <div className="flex items-center gap-3 pt-1">
        <button onClick={save} disabled={busy}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-60">
          {busy ? 'Saving…' : 'Save form'}
        </button>
        <button onClick={onCancel} className="text-sm text-neutral-500 hover:text-neutral-800">Cancel</button>
      </div>
    </div>
  )
}

const FormBuilder = ({ orgId, staff = [], onCount, embedded = false, open: externalOpen }) => {
  const confirm = useConfirm()
  const [templates, setTemplates] = useState([])
  // The shared built-in forms, with whether this school hides each one. They
  // cannot be edited or deleted (every school has them), only switched off
  // here (iCreate, 2026-09-02: "remove the purchase requests, class prep,
  // reimbursement request, etc.").
  const [builtins, setBuiltins] = useState([])
  const [editing, setEditing] = useState(null)
  const [internalOpen, setInternalOpen] = useState(false)
  const open = externalOpen !== undefined ? externalOpen : internalOpen
  const toggleOpen = () => setInternalOpen((v) => !v)

  const load = useCallback(() => {
    if (!orgId) return
    api.get(withOrg('/api/sis/staff-admin/form-templates', orgId))
      .then((r) => {
        const rows = r.data?.templates || []
        setTemplates(rows)
        setBuiltins(r.data?.builtins || [])
        onCount?.(rows.length)
      })
      .catch(() => toast.error('Could not load your forms'))
  }, [orgId, onCount])

  useEffect(() => { load() }, [load])

  const duplicate = async (t) => {
    try {
      await api.post(`/api/sis/staff-admin/form-templates/${t.id}/duplicate`, {})
      toast.success('Form duplicated — the copy is retired until you publish it')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not duplicate the form')
    }
  }

  const setActive = async (t, isActive) => {
    try {
      await api.put(`/api/sis/staff-admin/form-templates/${t.id}`, {
        organization_id: orgId, name: t.name, description: t.description,
        audience: t.audience, fields: t.fields,
        default_assignee_id: t.default_assignee_id, default_priority: t.default_priority,
        is_active: isActive,
      })
      toast.success(isActive ? 'Form published' : 'Form retired')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update the form')
    }
  }

  const setBuiltinHidden = async (b, hidden) => {
    try {
      await api.patch(withOrg(`/api/sis/staff-admin/form-templates/builtin/${b.key}`, orgId),
        { organization_id: orgId, hidden })
      toast.success(hidden ? `${b.name} hidden from staff` : `${b.name} is back`)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update the form')
    }
  }

  const remove = async (t, { force = false } = {}) => {
    if (!force && !(await confirm(`Delete "${t.name}"? This can't be undone.`))) return
    try {
      await api.delete(withOrg(`/api/sis/staff-admin/form-templates/${t.id}${force ? '?force=1' : ''}`, orgId))
      toast.success('Form deleted')
      load()
    } catch (err) {
      const filed = err?.response?.data?.submission_count
      if (err?.response?.status === 409 && filed) {
        if (await confirm(err.response.data.error)) remove(t, { force: true })
        return
      }
      toast.error(err?.response?.data?.error || 'Could not delete the form')
    }
  }

  const content = (
    <>
      {!embedded && (
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={toggleOpen} aria-expanded={open}
            className="flex items-center gap-2 font-semibold text-neutral-900">
            <span className={`text-neutral-400 text-xs transition-transform ${open ? 'rotate-90' : ''}`}
              aria-hidden="true">▶</span>
            Forms
            <span className="text-xs font-normal text-neutral-400">({templates.length})</span>
          </button>
          <button onClick={() => { setInternalOpen(true); setEditing('new') }}
            className="text-sm text-optio-purple font-medium hover:underline">+ New form</button>
        </div>
      )}

      {embedded && open && (
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-sm font-semibold text-neutral-800">Request Form Templates</span>
          <button onClick={() => setEditing('new')}
            className="text-sm text-optio-purple font-medium hover:underline">+ New form</button>
        </div>
      )}

      {editing && (
        <div className="mt-3">
          <FormEditor orgId={orgId} staff={staff}
            template={editing === 'new' ? null : editing}
            onSaved={() => { setEditing(null); load() }}
            onCancel={() => setEditing(null)} />
        </div>
      )}

      {open && (
        <ul className="divide-y divide-gray-100 mt-3">
          {!templates.length && (
            <p className="text-sm text-neutral-500">
              No forms of your own yet. The built-in ones below still work — build one
              here to ask your own questions.
            </p>
          )}
          {templates.map((t) => (
            <li key={t.id} className="py-2.5 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-neutral-900">{t.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${t.audience === 'family'
                ? 'bg-optio-pink/10 text-optio-pink' : 'bg-optio-purple/10 text-optio-purple'}`}>
                {t.audience === 'family' ? 'Family' : 'Staff'}
              </span>
              {!t.is_active && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-neutral-600">Retired</span>
              )}
              <span className="text-xs text-neutral-400">
                {(t.fields || []).length} question{(t.fields || []).length === 1 ? '' : 's'}
              </span>
              <div className="ml-auto flex items-center gap-3">
                <button onClick={() => setEditing(t)} className="text-sm text-optio-purple hover:underline">Edit</button>
                <button onClick={() => duplicate(t)} className="text-sm text-optio-purple hover:underline">Duplicate</button>
                <button onClick={() => setActive(t, !t.is_active)} className="text-sm text-neutral-600 hover:underline">
                  {t.is_active ? 'Retire' : 'Publish'}
                </button>
                <button onClick={() => remove(t)} className="text-sm text-red-600 hover:underline">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && builtins.length > 0 && (
        <div className="mt-5 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">
            Built-in forms
          </p>
          <p className="text-sm text-neutral-500 mb-2">
            Every school gets these. Hide the ones yours does not use and they leave the
            staff picker; nothing already filed is affected.
          </p>
          <ul className="divide-y divide-gray-100">
            {builtins.map((b) => (
              <li key={b.key} className="py-2 flex items-center gap-2 flex-wrap">
                <span className={`text-sm ${b.hidden ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
                  {b.name}
                </span>
                {b.hidden && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-neutral-600">Hidden</span>
                )}
                <button onClick={() => setBuiltinHidden(b, !b.hidden)}
                  className="ml-auto text-sm text-neutral-600 hover:underline">
                  {b.hidden ? 'Show' : 'Hide'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )

  if (embedded) return <div>{content}</div>
  return <div className="bg-white rounded-xl border border-gray-200 p-4">{content}</div>
}

export default FormBuilder
export { FormEditor }
