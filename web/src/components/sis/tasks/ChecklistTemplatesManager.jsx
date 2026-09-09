/**
 * The checklist template library, and the editor behind it.
 *
 * This used to live in pages/sis/OnboardingPage.jsx and be imported back OUT of
 * it by PaperworkTemplatesManager, which OnboardingPage imports in turn -- a
 * genuine runtime import cycle between a page and one of its own children. ES
 * modules resolve a cycle by handing the second module a partially-initialised
 * copy of the first, so which of the two got a complete module depended on
 * which one the bundler reached first. It worked, and it worked by luck.
 *
 * A component that a component imports belongs in components/. OnboardingPage
 * now imports it like everyone else, and the arrow points one way.
 *
 * Moved verbatim: no behaviour changed, only the file the code sits in.
 */
import React, { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import ModalOverlay from '../../ui/ModalOverlay'
import { useConfirm } from '../../../contexts/ConfirmContext'
import {
  useOnboardingTemplates, useOnboardingAssignments, sisOnboardingApi,
} from '../../../hooks/api/useSisOnboarding'

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent'

const emptyItem = () => ({ title: '', description: '', link: '', required: true,
  needs_document: false, needs_signature: false, needs_approval: false })

const TemplateEditor = ({ orgId, template, onSaved, onCancel }) => {
  const [name, setName] = useState(template?.name || '')
  const [roleType, setRoleType] = useState(template?.role_type || '')
  const [audience, setAudience] = useState(template?.audience || 'staff')
  const [description, setDescription] = useState(template?.description || '')
  const [items, setItems] = useState(template?.items?.length ? template.items : [emptyItem()])
  const [busy, setBusy] = useState(false)
  const [draggedIdx, setDraggedIdx] = useState(null)

  const setItem = (i, patch) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  const moveItem = (i, direction) => {
    const newIndex = i + direction
    if (newIndex < 0 || newIndex >= items.length) return
    setItems((prev) => {
      const updated = [...prev]
      const [moved] = updated.splice(i, 1)
      updated.splice(newIndex, 0, moved)
      return updated
    })
  }

  // The copy must NOT carry the original's key: two items sharing a key means
  // progress recorded against one lands on whichever the server finds first.
  // Dropping it here lets the server mint a fresh one (see _clean_items).
  const duplicateItem = (i) => setItems((prev) => {
    const { key, ...rest } = prev[i]
    const copy = { ...rest, title: `${prev[i].title} (copy)` }
    return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)]
  })

  const duplicateThisTemplate = async () => {
    if (!template?.id) return
    setBusy(true)
    try {
      // Through the same helper the list-level Duplicate uses. This branch was
      // cut before OnboardingPage moved onto hooks/api, so it called api.post
      // directly -- and that import is gone, so the button threw.
      await sisOnboardingApi.duplicateTemplate(template.id)
      toast.success('Template duplicated')
      onSaved()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not duplicate template')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!name.trim()) { toast.error('Template name is required'); return }
    const cleaned = items.filter((it) => it.title.trim())
    if (!cleaned.length) { toast.error('Add at least one item'); return }
    setBusy(true)
    try {
      const body = { organization_id: orgId, name: name.trim(), role_type: roleType.trim(), audience, description: description.trim(), items: cleaned }
      await sisOnboardingApi.saveTemplate(template?.id, body)
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name (e.g. Employee onboarding)" className={inputClass} />
        <input value={roleType} onChange={(e) => setRoleType(e.target.value)} placeholder="For role (e.g. employee, contractor)" className={inputClass} />
        <select value={audience} onChange={(e) => setAudience(e.target.value)} className={inputClass} aria-label="Who this is for">
          <option value="staff">For staff (their SIS checklist)</option>
          <option value="family">For families (their portal)</option>
        </select>
      </div>
      <label className="block">
        <span className="block text-xs font-medium text-neutral-500 mb-1">
          Directions (optional) — shown at the top of the checklist
        </span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          placeholder="Directions for completing this checklist"
          className={inputClass} aria-label="Directions" />
      </label>
      {items.map((it, i) => (
        <div key={i} draggable
          onDragStart={(e) => { setDraggedIdx(i); e.dataTransfer.effectAllowed = 'move' }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
          onDrop={(e) => {
            e.preventDefault()
            if (draggedIdx === null || draggedIdx === i) return
            setItems((prev) => {
              const updated = [...prev]
              const [moved] = updated.splice(draggedIdx, 1)
              updated.splice(i, 0, moved)
              return updated
            })
            setDraggedIdx(null)
          }}
          onDragEnd={() => setDraggedIdx(null)}
          className={`bg-white rounded-lg border p-3 space-y-2 transition-colors ${
            draggedIdx === i ? 'border-optio-purple bg-optio-purple/5 opacity-60' : 'border-gray-200'
          }`}>
          <div className="flex items-center gap-2">
            <span className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 px-1 select-none text-base font-bold shrink-0"
              title="Drag to reorder block">
              ⋮⋮
            </span>
            <input value={it.title} onChange={(e) => setItem(i, { title: e.target.value })}
              placeholder={`Item ${i + 1} title`} className={inputClass} />
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => moveItem(i, -1)} disabled={i === 0}
                className="px-2 py-1 text-xs font-medium rounded border border-gray-200 text-neutral-600 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Move section up">
                ↑ Up
              </button>
              <button type="button" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}
                className="px-2 py-1 text-xs font-medium rounded border border-gray-200 text-neutral-600 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Move section down">
                ↓ Down
              </button>
              <button type="button" onClick={() => duplicateItem(i)}
                className="px-2 py-1 text-xs font-medium rounded border border-gray-200 text-neutral-600 hover:bg-gray-50"
                title="Duplicate this item">
                Duplicate
              </button>
              <button onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                className="text-sm text-red-600 hover:underline ml-1">Remove</button>
            </div>
          </div>
          <input value={it.description || ''} onChange={(e) => setItem(i, { description: e.target.value })}
            placeholder="Instructions (optional — link out for sensitive documents)" className={inputClass} />
          <input value={it.link || ''} onChange={(e) => setItem(i, { link: e.target.value })}
            placeholder="Document or link we give THEM (optional) — e.g. the handbook, or a contract to print and sign" className={inputClass} />
          <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-600">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={it.required !== false} onChange={(e) => setItem(i, { required: e.target.checked })} /> Required
            </label>
            {/* "Needs document" read as "am I giving them one, or asking for one?" —
                it has only ever meant the latter, so say so. */}
            <label className="flex items-center gap-1.5"
              title="Adds an Upload button to their checklist. To hand them a document instead, use the link field above.">
              <input type="checkbox" checked={!!it.needs_document} onChange={(e) => setItem(i, { needs_document: e.target.checked })} />
              They upload a document to us
            </label>
            {/* The alternative to "print it, sign it, scan it, upload it". */}
            <label className="flex items-center gap-1.5"
              title="They type their name and confirm it counts as their signature — no printer, no scanner.">
              <input type="checkbox" checked={!!it.needs_signature} onChange={(e) => setItem(i, { needs_signature: e.target.checked })} />
              They sign it here
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!it.needs_approval} onChange={(e) => setItem(i, { needs_approval: e.target.checked })} /> Needs admin approval
            </label>
          </div>
          {it.needs_document && (
            <p className="text-xs text-neutral-400">
              They will see an Upload button on this item and the file comes back to you for review.
            </p>
          )}
          {it.needs_signature && (
            <p className="text-xs text-neutral-400">
              They type their full name and confirm it counts as their signature. Their name, the
              time and the account that signed are recorded. Put the thing they are agreeing to in
              the link field above.
            </p>
          )}
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button onClick={() => setItems((prev) => [...prev, emptyItem()])} className="text-sm text-optio-purple hover:underline">
          + Add item
        </button>
        <div className="ml-auto flex items-center gap-2">
          {template?.id && (
            <button type="button" onClick={duplicateThisTemplate} disabled={busy}
              className="px-3 py-1.5 rounded-lg border border-optio-purple text-optio-purple hover:bg-optio-purple/10 text-sm font-medium disabled:opacity-50">
              Duplicate template
            </button>
          )}
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

/** The checklist template library: a single collapsed row until opened.
 * Authoring is the rare act; it must not sit on top of the daily list. */
export const ChecklistTemplatesManager = ({ orgId, onChanged, embedded = false, onCount, open: externalOpen }) => {
  const confirm = useConfirm()
  const [editing, setEditing] = useState(null) // null | 'new' | template
  const [internalOpen, setInternalOpen] = useState(false)
  const templatesOpen = externalOpen !== undefined ? externalOpen : internalOpen
  const toggleTemplatesOpen = () => setInternalOpen((v) => !v)

  const query = useOnboardingTemplates(orgId)
  const templates = query.data || []
  const load = query.refetch
  // The same assignments list AdminOnboarding renders. Sync needs a count of
  // what it is about to rewrite; sharing the key means it does not re-ask.
  const assignmentsQuery = useOnboardingAssignments(orgId)

  // Report the count up to PaperworkTemplatesManager, which shows it on the
  // tab. An effect rather than a line in the fetch, because the fetch is the
  // query's now and may serve this render from cache without running.
  useEffect(() => { onCount?.(templates.length) }, [onCount, templates.length])

  useEffect(() => {
    if (query.isError) toast.error('Failed to load checklist templates')
  }, [query.isError])

  const duplicateTemplate = async (t) => {
    try {
      // Server-side: the copy has to keep blocks_access and drop the original's
      // per-person document bindings, neither of which the editor carries.
      await sisOnboardingApi.duplicateTemplate(t.id)
      toast.success('Template duplicated')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not duplicate the template')
    }
  }

  const syncTemplate = async (t) => {
    const assigned = assignmentsQuery.data
      ? assignmentsQuery.data.filter((a) => a.template_id === t.id).length
      : null
    const who = assigned === null ? 'the checklists already assigned'
      : `${assigned} assigned checklist${assigned === 1 ? '' : 's'}`
    if (!(await confirm(
      `Update ${who} to match "${t.name}"? Finished checklists are left alone, and `
      + 'nothing anyone has already done is changed.'))) return
    try {
      const r = await sisOnboardingApi.syncTemplate(t.id)
      const d = r.data || {}
      const parts = []
      if (d.added) parts.push(`${d.added} item${d.added === 1 ? '' : 's'} added`)
      if (d.updated) parts.push(`${d.updated} updated`)
      if (d.removed) parts.push(`${d.removed} removed`)
      const skipped = d.skipped_complete
        ? `, ${d.skipped_complete} finished checklist${d.skipped_complete === 1 ? '' : 's'} left alone` : ''
      toast.success(parts.length
        ? `${d.synced} checklist${d.synced === 1 ? '' : 's'} updated (${parts.join(', ')})${skipped}`
        : `Everything already matches${skipped}`)
      load()
      onChanged?.() // the sync rewrote assigned checklists — the list is stale
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not sync the checklists')
    }
  }

  const deleteTemplate = async (t, { force = false } = {}) => {
    if (!force && !(await confirm(`Delete the "${t.name}" template? This can't be undone.`))) return
    try {
      await sisOnboardingApi.deleteTemplate(t.id, orgId, force)
      toast.success('Template deleted')
      load()
    } catch (err) {
      // 409 = still assigned to people. Say who, then let them confirm.
      if (err?.response?.status === 409) {
        if (await confirm(`${err.response.data?.error}\n\nTheir checklists stay in place.`)) {
          deleteTemplate(t, { force: true })
        }
        return
      }
      toast.error(err?.response?.data?.error || 'Could not delete the template')
    }
  }

  const content = (
    <>
      {!embedded && (
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={toggleTemplatesOpen}
            aria-expanded={templatesOpen}
            className="flex items-center gap-2 font-semibold text-neutral-900">
            <span className={`text-neutral-400 text-xs transition-transform ${templatesOpen ? 'rotate-90' : ''}`}
              aria-hidden="true">▶</span>
            Checklist templates
            <span className="text-xs font-normal text-neutral-400">({templates.length})</span>
          </button>
          <button onClick={() => setEditing('new')} className="text-sm text-optio-purple font-medium hover:underline">
            + New template
          </button>
        </div>
      )}

      {embedded && templatesOpen && (
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-sm font-semibold text-neutral-800">Onboarding Checklist Templates</span>
          <button onClick={() => setEditing('new')} className="text-sm text-optio-purple font-medium hover:underline">
            + New template
          </button>
        </div>
      )}

      {templatesOpen && (
        <ul className="divide-y divide-gray-100 mt-3">
          {!templates.length && <p className="text-sm text-neutral-500">No templates yet.</p>}
          {templates.map((t) => (
            <li key={t.id} className="py-2.5 flex items-center gap-2 flex-wrap">
              {/* The wrapper and the description are HEAD's; their side of this
                  merge had dropped both, which would have hidden every
                  template's description from the list. */}
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-neutral-900">{t.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${t.audience === 'family' ? 'bg-optio-pink/10 text-optio-pink' : 'bg-optio-purple/10 text-optio-purple'}`}>
                  {t.audience === 'family' ? 'Family' : 'Staff'}
                </span>
                {t.role_type && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-neutral-600">{t.role_type}</span>}
                <span className="text-xs text-neutral-400">{(t.items || []).length} items</span>
                {t.description && (
                  <p className="text-xs text-neutral-500 mt-0.5 w-full">{t.description}</p>
                )}
              </div>
              <div className="ml-auto flex items-center gap-3">
                <button onClick={() => setEditing(t)} className="text-sm text-optio-purple hover:underline">Edit</button>
                <button onClick={() => duplicateTemplate(t)} className="text-sm text-optio-purple hover:underline">Duplicate</button>
                {/* Deliberately a button, not automatic on save: a half-finished
                    edit must not go out to everyone holding the checklist. */}
                <button onClick={() => syncTemplate(t)} className="text-sm text-optio-purple hover:underline">Sync assigned</button>
                <button onClick={() => deleteTemplate(t)} className="text-sm text-red-600 hover:underline">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )

  return (
    <>
      {embedded ? <div>{content}</div> : <div className="bg-white rounded-xl border border-gray-200 p-4">{content}</div>}

      {editing && (
        <ModalOverlay onClose={() => setEditing(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 space-y-4"
            role="dialog" aria-modal="true" aria-label="Checklist template">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">
                {editing === 'new' ? 'New checklist template' : `Edit "${editing.name}"`}
              </h2>
              <button onClick={() => setEditing(null)} className="text-sm text-neutral-500 hover:text-neutral-800">Close</button>
            </div>
            <TemplateEditor orgId={orgId} template={editing === 'new' ? null : editing}
              onSaved={() => { setEditing(null); setInternalOpen(true); load() }}
              onCancel={() => setEditing(null)} />
          </div>
        </ModalOverlay>
      )}
    </>
  )
}
