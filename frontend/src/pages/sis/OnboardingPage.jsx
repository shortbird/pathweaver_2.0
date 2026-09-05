import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import { getPreviewTeacher, withPreview } from './teacherPreview'
import BackToDashboard from '../../components/sis/BackToDashboard'
import ChecklistSignature from '../../components/sis/ChecklistSignature'
import ModalOverlay from '../../components/ui/ModalOverlay'
import AssignChecklistModal from '../../components/sis/tasks/AssignChecklistModal'
import { useConfirm } from '../../contexts/ConfirmContext'
import { itemDocuments } from './checklistDocuments'

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

// hideWhenEmpty: on the admin view this renders above the template manager, and
// an admin with no checklist of their own shouldn't see an empty-state for it.
export const MyChecklists = ({ orgId, preview = null, hideWhenEmpty = false, heading = null, openItemKey = null }) => {
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
      // add_document, not document_url: an item holds a list now, so a second
      // file is an addition rather than a replacement (iCreate asked for an ID
      // and a birth certificate on one I-9 item and had nowhere to put the second).
      await patchItem(assignmentId, itemKey, {
        add_document: { path: r.data?.path, filename: file.name }, status: 'complete',
      })
      toast.success('Document attached')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Upload failed')
      setBusyKey(null)
    }
  }

  const removeDoc = async (assignmentId, itemKey, doc) => {
    if (!(await confirm(`Remove ${doc.filename || 'this document'}?`))) return
    await patchItem(assignmentId, itemKey, { remove_document: doc.path })
  }

  const openDoc = async (path) => {
    try {
      const r = await api.get(withOrg(`/api/sis/teacher/onboarding/doc-url?path=${encodeURIComponent(path)}`, orgId))
      if (r.data?.url) window.open(r.data.url, '_blank', 'noopener')
    } catch {
      toast.error('Could not open the document')
    }
  }

  // A document the office shared to the signer's portal (item.sign_docs) — the
  // thing a signature item signs. Same signed-URL door as My Documents, preview
  // included: an admin checking a teacher's checklist has to be able to open the
  // contract that checklist is waiting on, not just read its name.
  const openSignDoc = async (doc) => {
    try {
      const r = await api.get(
        withPreview(withOrg(`/api/sis/teacher/my-documents/${doc.id}/url`, orgId), preview))
      if (r.data?.url) window.open(r.data.url, '_blank', 'noopener')
    } catch {
      toast.error('Could not open the document')
    }
  }

  if (!assignments.length) {
    if (hideWhenEmpty) return null
    return (
      <p className="text-neutral-500">
        {preview ? `No onboarding checklist assigned to ${preview.name}.` : 'No onboarding checklist assigned to you.'}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {heading && <h2 className="text-lg font-semibold text-neutral-900">{heading}</h2>}
      {assignments.map((a) => (
        <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-neutral-900">{a.template_name || 'Onboarding'}</h2>
            <span className="text-sm text-neutral-500">{a.done_count}/{a.total_count} complete</span>
          </div>
          {a.description && (
            <p className="text-sm text-neutral-600 whitespace-pre-line mb-3 -mt-1">{a.description}</p>
          )}
          <ul className="divide-y divide-gray-100">
            {(a.items || []).map((item) => {
              const busy = busyKey === `${a.id}:${item.key}`
              const done = ['complete', 'approved'].includes(item.status)
              // Opened from the task inbox: mark the item they clicked so it is
              // findable in a checklist of fifteen.
              const highlighted = openItemKey && item.key === openItemKey
              return (
                <li key={item.key}
                  className={`py-3 flex items-start gap-3 ${highlighted ? 'ring-2 ring-optio-purple rounded-lg px-2' : ''}`}>
                  {/* A signature item is completed by signing it, not by ticking
                      it — the backend refuses a tick with nothing signed, so a
                      live checkbox here would only ever produce an error. */}
                  <input type="checkbox" checked={done}
                    disabled={busy || item.status === 'approved' || Boolean(preview) || item.needs_signature}
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
                    {/* The document or link the office gives THEM (the family
                        portal always showed it; this view never did — teachers
                        had no way to reach the I-9 they were asked to fill). */}
                    {item.link && (
                      <div className="mt-1.5">
                        <a href={item.link} target="_blank" rel="noopener noreferrer"
                          className="text-sm text-optio-purple hover:underline">
                          Open link
                        </a>
                      </div>
                    )}
                    {item.needs_signature && (
                      <ChecklistSignature
                        item={item}
                        statement={a.signature_statement}
                        disabled={Boolean(preview)}
                        busy={busy}
                        onSign={(fields) => patchItem(a.id, item.key, fields)}
                        onOpenDoc={openSignDoc}
                      />
                    )}
                    {item.needs_document && (
                      <div className="mt-1.5 space-y-1">
                        {itemDocuments(item).map((doc) => (
                          <div key={doc.secure_document_id || doc.path} className="flex items-center gap-3">
                            {doc.secure_document_id ? (
                              // The office filed this out of their own store; it
                              // is not in this person's portal and is not theirs
                              // to open or take back. Saying so beats a link that
                              // 403s and a Remove button that does nothing.
                              <span className="text-sm text-neutral-600">
                                {doc.title || doc.filename || 'Document'}
                                <span className="text-xs text-neutral-400"> — on file with the office</span>
                              </span>
                            ) : (
                              <>
                                <button onClick={() => openDoc(doc.path)} className="text-sm text-optio-purple hover:underline">
                                  {doc.filename || 'View document'}
                                </button>
                                {!preview && (
                                  <button onClick={() => removeDoc(a.id, item.key, doc)}
                                    className="text-xs text-red-600 hover:underline">Remove</button>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                        <label className={`inline-block text-sm text-optio-purple hover:underline cursor-pointer ${preview ? 'hidden' : ''}`}>
                          {itemDocuments(item).length ? 'Add another document' : 'Upload document'}
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

const emptyItem = () => ({ title: '', description: '', link: '', required: true,
  needs_document: false, needs_signature: false, needs_approval: false })

const TemplateEditor = ({ orgId, template, onSaved, onCancel }) => {
  const [name, setName] = useState(template?.name || '')
  const [roleType, setRoleType] = useState(template?.role_type || '')
  const [audience, setAudience] = useState(template?.audience || 'staff')
  const [description, setDescription] = useState(template?.description || '')
  const [items, setItems] = useState(template?.items?.length ? template.items : [emptyItem()])
  const [busy, setBusy] = useState(false)

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

  const save = async () => {
    if (!name.trim()) { toast.error('Template name is required'); return }
    const cleaned = items.filter((it) => it.title.trim())
    if (!cleaned.length) { toast.error('Add at least one item'); return }
    setBusy(true)
    try {
      const body = { organization_id: orgId, name: name.trim(), role_type: roleType.trim(), audience, description: description.trim(), items: cleaned }
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
        <div key={i} className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="flex items-center gap-2">
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

// Exported: the Task Center's Checklists tab is this component.
//
// Ordered by how often an admin does each thing, which is the reverse of how it
// used to read. Reviewing is daily and was buried inside collapsed rows — the
// only way to learn that somebody was waiting on approval was to open every
// person's checklist in turn — so it leads. Assigning is weekly and is a dialog.
// Authoring templates is rare, so it sits at the bottom, collapsed, and its
// editor opens over the page instead of pushing everything else off screen.
// The office's approve/reject on a finished item. Shared by the review strip
// and the per-assignment card, and exported so the Task Center's unified
// Assigned list can reuse both without re-deriving the PATCH.
const patchAssignmentItem = async (orgId, assignmentId, itemKey, fields) => {
  await api.patch(`/api/sis/teacher/onboarding/${assignmentId}/items/${itemKey}`, {
    organization_id: orgId, ...fields,
  })
}

// Everything somebody has finished and is now waiting on the office for.
export const awaitingReviewOf = (assignments) => assignments.flatMap((a) => (a.items || [])
  .filter((item) => item.needs_approval && item.status === 'complete')
  .map((item) => ({ assignment: a, item })))

/** "Needs your review" — approvals lifted out of the collapsed rows below,
 * because an approval nobody can see is an approval that does not happen. */
export const ReviewStrip = ({ orgId, assignments, onChanged }) => {
  const awaitingReview = awaitingReviewOf(assignments)
  if (!awaitingReview.length) return null

  const review = async (assignmentId, itemKey, status) => {
    try {
      await patchAssignmentItem(orgId, assignmentId, itemKey, { status })
      onChanged?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 p-4">
      <h2 className="font-semibold text-neutral-900 mb-3">
        Needs your review ({awaitingReview.length})
      </h2>
      <ul className="divide-y divide-gray-100">
        {awaitingReview.map(({ assignment: a, item }) => (
          <li key={`${a.id}:${item.key}`} className="py-2.5 flex items-center gap-2 text-sm flex-wrap">
            <span className="font-medium text-neutral-900">{a.user_name}</span>
            <span className="text-neutral-600">{item.title}</span>
            <span className="text-xs text-neutral-400">{a.template_name}</span>
            <span className="ml-auto flex items-center gap-2">
              <button onClick={() => review(a.id, item.key, 'approved')}
                className="px-2.5 py-1 rounded bg-green-600 text-white text-xs">Approve</button>
              <button onClick={() => review(a.id, item.key, 'rejected')}
                className="px-2.5 py-1 rounded bg-red-600 text-white text-xs">Reject</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One assigned checklist or ad-hoc task: person, progress, and the expanded
 * per-item view with the office's actions. Self-contained so any list —
 * the onboarding roll-up or the Task Center's Assigned tab — can render it. */
export const AssignmentCard = ({ orgId, assignment: a, onChanged, badge = null }) => {
  const confirm = useConfirm()
  // The store's documents for this person, fetched once the office first opens
  // the picker. Null = not asked yet, [] = asked and they hold nothing.
  const [filed, setFiled] = useState(null)
  const [attachingKey, setAttachingKey] = useState(null)

  const openAttach = async (itemKey) => {
    setAttachingKey(itemKey)
    if (filed !== null) return
    try {
      const r = await api.get(withOrg(
        `/api/sis/staff-admin/onboarding/assignments/${a.id}/attachable-documents`, orgId))
      setFiled(r.data?.documents || [])
    } catch {
      setFiled([])
      toast.error('Could not load this person\'s documents')
    }
  }

  // Filing a document the office already holds against the item it satisfies.
  // It completes the item in the same breath: an admin who picks the background
  // check for the "Background check" item has answered the item, and making
  // them tick it separately is how 14 people stayed "pending" with the document
  // already on file (c23105fa).
  const attachFiled = async (itemKey, doc) => {
    try {
      await patchAssignmentItem(orgId, a.id, itemKey, {
        attach_document_id: doc.id, status: 'complete',
      })
      toast.success(`Attached ${doc.title}`)
      setAttachingKey(null)
      onChanged?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not attach the document')
    }
  }

  const detach = async (itemKey, doc) => {
    try {
      await patchAssignmentItem(orgId, a.id, itemKey, {
        remove_document: doc.secure_document_id || doc.path,
      })
      onChanged?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove the document')
    }
  }

  const review = async (itemKey, status) => {
    try {
      await patchAssignmentItem(orgId, a.id, itemKey, { status })
      onChanged?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update')
    }
  }

  const clearSignature = async (itemKey, signerName) => {
    if (!(await confirm(`Clear ${signerName ? `${signerName}'s` : 'the'} signature on this item? They will need to sign again.`))) return
    try {
      await patchAssignmentItem(orgId, a.id, itemKey, { clear_signature: true })
      toast.success('Signature cleared')
      onChanged?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not clear signature')
    }
  }

  const unassign = async () => {
    const done = a.done_count || 0
    const warning = done
      ? `\n\n${done} of ${a.total_count} items are already done. Any documents they uploaded are kept.`
      : ''
    if (!(await confirm(`Remove "${a.template_name}" from ${a.user_name}?${warning}`))) return
    try {
      await api.delete(withOrg(`/api/sis/staff-admin/onboarding/assignments/${a.id}`, orgId))
      toast.success('Removed')
      onChanged?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove it')
    }
  }

  // The admin-side door to a checklist attachment. Not the teacher doc-url:
  // that one only signs the staff bucket, and this list also holds family
  // checklists (audience picks the bucket server-side).
  const openItemDoc = async (doc) => {
    // Two kinds of attachment, two stores. An upload is a blob in the checklist
    // bucket, addressed by path; a filed document belongs to the secure store
    // and is signed by its own id — the checklist never holds a copy of it.
    const url = doc.secure_document_id
      ? withOrg(`/api/sis/secure-documents/${doc.secure_document_id}/url`, orgId)
      : withOrg(`/api/sis/staff-admin/onboarding/doc-url?path=${encodeURIComponent(doc.path)}&audience=${a.audience || 'staff'}`, orgId)
    try {
      const r = await api.get(url)
      if (r.data?.url) window.open(r.data.url, '_blank', 'noopener')
    } catch {
      toast.error('Could not open the document')
    }
  }

  return (
    <details className="border border-gray-200 rounded-lg">
      {/* Unassign is NOT in here: a destructive action one pixel from
          the expand target is a mis-click waiting to happen. */}
      <summary className="px-3 py-2.5 cursor-pointer flex items-center gap-2 text-sm flex-wrap">
        <span className="font-medium text-neutral-900">{a.user_name}</span>
        <span className="text-neutral-500">{a.template_name}</span>
        {badge}
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
          a.status === 'complete' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
          {a.done_count}/{a.total_count}
        </span>
      </summary>
      {a.description && (
        <p className="px-3 py-2 text-sm text-neutral-600 border-t border-b border-gray-100 bg-neutral-50/50 whitespace-pre-line">
          {a.description}
        </p>
      )}
      <ul className="px-3 divide-y divide-gray-100">
        {(a.items || []).map((item) => {
          const docs = itemDocuments(item)
          return (
          <li key={item.key} className="py-2 flex items-center gap-2 text-sm flex-wrap">
            <span className="text-neutral-800">{item.title}</span>
            <ItemBadge status={item.status} />
            {item.signature?.name && (
              <span className="text-xs text-neutral-500">
                Signed by <span className="font-medium text-neutral-700">{item.signature.name}</span>
                {item.signature.signed_at ? ` on ${new Date(item.signature.signed_at).toLocaleDateString()}` : ''}
              </span>
            )}
            {docs.map((doc, i) => (
              <span key={doc.secure_document_id || doc.path} className="inline-flex items-center gap-1">
                <button onClick={() => openItemDoc(doc)}
                  className="text-xs text-optio-purple hover:underline"
                  title={doc.secure_document_id
                    ? 'Open the document the office filed against this item'
                    : 'Open the document they attached'}>
                  {doc.title || doc.filename || (docs.length > 1 ? `Document ${i + 1}` : 'View document')}
                </button>
                {doc.secure_document_id && (
                  <button onClick={() => detach(item.key, doc)}
                    className="text-xs text-neutral-400 hover:text-red-600"
                    title="Unlink this document — the file stays in Documents">×</button>
                )}
              </span>
            ))}
            {/* The office files a background check in Documents and then finds
                the person's onboarding still saying "pending" — this is the way
                back (c23105fa). Only where an attachment is what the item is
                waiting for, and never on one that is already answered. */}
            {item.needs_document && item.status === 'pending' && (
              attachingKey === item.key ? (
                <span className="inline-flex items-center gap-1">
                  <select className="text-xs border border-gray-300 rounded px-1.5 py-0.5"
                    aria-label={`Attach a filed document to ${item.title}`}
                    defaultValue=""
                    onChange={(e) => {
                      const doc = (filed || []).find((d) => d.id === e.target.value)
                      if (doc) attachFiled(item.key, doc)
                    }}>
                    <option value="" disabled>
                      {filed === null ? 'Loading…'
                        : filed.length ? 'Choose a document…'
                          : 'Nothing on file for them'}
                    </option>
                    {(filed || []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}{d.category ? ` — ${d.category}` : ''}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => setAttachingKey(null)}
                    className="text-xs text-neutral-400 hover:text-neutral-700">Cancel</button>
                </span>
              ) : (
                <button onClick={() => openAttach(item.key)}
                  className="text-xs text-neutral-500 hover:text-optio-purple hover:underline"
                  title="Attach a document already filed under this person">
                  Attach filed document
                </button>
              )
            )}
            <span className="ml-auto flex items-center gap-2">
              {item.signature && (
                <button onClick={() => clearSignature(item.key, item.signature.name)}
                  className="text-xs text-red-600 font-medium hover:underline">
                  Clear signature
                </button>
              )}
              {item.needs_approval && item.status === 'complete' && (
                <>
                  <button onClick={() => review(item.key, 'approved')}
                    className="px-2.5 py-1 rounded bg-green-600 text-white text-xs">Approve</button>
                  <button onClick={() => review(item.key, 'rejected')}
                    className="px-2.5 py-1 rounded bg-red-600 text-white text-xs">Reject</button>
                </>
              )}
            </span>
          </li>
          )
        })}
      </ul>
      <div className="px-3 pb-3 pt-1 border-t border-gray-100">
        <button onClick={unassign}
          className="text-xs text-red-600 hover:underline"
          title="Remove this — any documents they uploaded are kept">
          Unassign
        </button>
      </div>
    </details>
  )
}

/** The checklist template library: a single collapsed row until opened.
 * Authoring is the rare act; it must not sit on top of the daily list. */
export const ChecklistTemplatesManager = ({ orgId, onChanged }) => {
  const confirm = useConfirm()
  const [templates, setTemplates] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | template
  const [templatesOpen, setTemplatesOpen] = useState(false)

  const load = useCallback(() => {
    api.get(withOrg('/api/sis/staff-admin/onboarding/templates', orgId))
      .then((t) => setTemplates(t.data?.templates || []))
      .catch(() => toast.error('Failed to load checklist templates'))
  }, [orgId])

  useEffect(() => { if (orgId) load() }, [load, orgId])

  const duplicateTemplate = async (t) => {
    try {
      // Server-side: the copy has to keep blocks_access and drop the original's
      // per-person document bindings, neither of which the editor carries.
      await api.post(`/api/sis/staff-admin/onboarding/templates/${t.id}/duplicate`, {})
      toast.success('Template duplicated')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not duplicate the template')
    }
  }

  const syncTemplate = async (t) => {
    const assigned = await api.get(withOrg('/api/sis/staff-admin/onboarding/assignments', orgId))
      .then((r) => (r.data?.assignments || []).filter((a) => a.template_id === t.id).length)
      .catch(() => null)
    const who = assigned === null ? 'the checklists already assigned'
      : `${assigned} assigned checklist${assigned === 1 ? '' : 's'}`
    if (!(await confirm(
      `Update ${who} to match "${t.name}"? Finished checklists are left alone, and `
      + 'nothing anyone has already done is changed.'))) return
    try {
      const r = await api.post(`/api/sis/staff-admin/onboarding/templates/${t.id}/sync`, {})
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
      await api.delete(withOrg(`/api/sis/staff-admin/onboarding/templates/${t.id}${force ? '?force=1' : ''}`, orgId))
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

  return (
    <>
      {/* Collapsed until asked for, so sitting above the progress list costs it
          a single row rather than a screenful. */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setTemplatesOpen((v) => !v)}
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
        {templatesOpen && (
          <ul className="divide-y divide-gray-100 mt-3">
            {!templates.length && <p className="text-sm text-neutral-500">No templates yet.</p>}
            {templates.map((t) => (
              <li key={t.id} className="py-2.5 flex items-center gap-2 flex-wrap">
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
      </div>

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
              onSaved={() => { setEditing(null); setTemplatesOpen(true); load() }}
              onCancel={() => setEditing(null)} />
          </div>
        </ModalOverlay>
      )}
    </>
  )
}

export const AdminOnboarding = ({ orgId, onCount = null }) => {
  const [assignments, setAssignments] = useState([])
  const [assigningOpen, setAssigningOpen] = useState(false)

  const load = useCallback(() => {
    api.get(withOrg('/api/sis/staff-admin/onboarding/assignments', orgId))
      .then((a) => setAssignments(a.data?.assignments || []))
      .catch(() => toast.error('Failed to load onboarding admin'))
  }, [orgId])

  useEffect(() => { if (orgId) load() }, [load, orgId])

  const awaiting = awaitingReviewOf(assignments).length
  useEffect(() => { onCount?.(awaiting) }, [awaiting, onCount])

  return (
    <div className="space-y-6">
      <ReviewStrip orgId={orgId} assignments={assignments} onChanged={load} />
      <ChecklistTemplatesManager orgId={orgId} onChanged={load} />

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-semibold text-neutral-900">Checklist progress</h2>
          <button onClick={() => setAssigningOpen(true)}
            className="text-sm text-optio-purple font-medium hover:underline">
            Assign a checklist
          </button>
        </div>
        {!assignments.length && <p className="text-sm text-neutral-500">No checklists assigned yet.</p>}
        <div className="space-y-2">
          {assignments.map((a) => (
            <AssignmentCard key={a.id} orgId={orgId} assignment={a} onChanged={load} />
          ))}
        </div>
      </div>

      {assigningOpen && (
        <AssignChecklistModal orgId={orgId} onClose={() => setAssigningOpen(false)} onAssigned={load} />
      )}
    </div>
  )
}

const OnboardingPage = () => {
  const { user } = useAuth()
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [searchParams] = useSearchParams()
  const openItemKey = searchParams.get('item')
  const admin = isSisAdmin(user)
  const [preview] = useState(() => (isSisAdmin(user) ? getPreviewTeacher() : null))

  return (
    <div className="space-y-6">
      <div>
        <BackToDashboard className="mb-1" />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900">Onboarding</h1>
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
        </div>
      </div>
      {admin && !preview ? (
        <>
          {/* An admin assigned a checklist of their own could only ever see the
              template manager here, so they had no Upload button and no way to
              complete their own items (reported 2026-08-05). */}
          <MyChecklists orgId={orgId} hideWhenEmpty heading="Your checklist" openItemKey={openItemKey} />
          <AdminOnboarding orgId={orgId} />
        </>
      ) : (
        <MyChecklists orgId={orgId} preview={preview} openItemKey={openItemKey} />
      )}
    </div>
  )
}

export default OnboardingPage
