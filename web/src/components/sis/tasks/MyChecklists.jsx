import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import ChecklistSignature from '../ChecklistSignature'
import StatusPill from '../ui/StatusPill'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { itemDocuments } from '../../../pages/sis/checklistDocuments'
import { useMyOnboarding, sisOnboardingApi } from '../../../hooks/api/useSisOnboarding'

/**
 * A person's own onboarding checklist(s): every item, done and not done --
 * mark items complete, attach documents, sign.
 *
 * This is the Checklist tab of My Tasks (M9). It was the teacher half of
 * /onboarding, a page that role-switched between this and the office's
 * template manager; the office half is the Task Center's Assigned list
 * and /onboarding now redirects here. The tab exists as
 * well as the task inbox because the inbox answers "what is outstanding"
 * and hides finished items, while the question people bring to a checklist
 * is "which of my documents are in, and which do I still owe" (iCreate,
 * 2026-09-10).
 *
 * Sensitive documents (tax, background checks) are NOT collected here by
 * design -- items should link to the appropriate external system instead.
 */

const ItemBadge = ({ status }) => <StatusPill domain="checklist_item" status={status} fallback="pending" />

// hideWhenEmpty: on the admin view this renders above the template manager, and
// an admin with no checklist of their own shouldn't see an empty-state for it.
export default function MyChecklists({ orgId, preview = null, hideWhenEmpty = false, heading = null, openItemKey = null }) {
  const [busyKey, setBusyKey] = useState(null)
  const confirm = useConfirm()

  const mine = useMyOnboarding(orgId, preview)
  const assignments = mine.data || []
  const load = mine.refetch

  useEffect(() => {
    if (mine.isError) toast.error('Failed to load your onboarding')
  }, [mine.isError])

  const patchItem = async (assignmentId, itemKey, fields) => {
    setBusyKey(`${assignmentId}:${itemKey}`)
    try {
      await sisOnboardingApi.patchItem(assignmentId, itemKey, orgId, fields)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update the item')
    } finally {
      setBusyKey(null)
    }
  }

  const uploadDoc = async (assignmentId, itemKey, file) => {
    setBusyKey(`${assignmentId}:${itemKey}`)
    try {
      const r = await sisOnboardingApi.upload(orgId, file)
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
      const r = await sisOnboardingApi.docUrl(orgId, path)
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
      const r = await sisOnboardingApi.signDocUrl(orgId, doc.id, preview)
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
                  {/* A signature item is completed by signing it, and a document
                      item by uploading — the backend refuses a tick with nothing
                      signed or attached, so a live checkbox here would only
                      ever produce an error. Unticking stays live. */}
                  <input type="checkbox" checked={done}
                    disabled={busy || item.status === 'approved' || Boolean(preview) || item.needs_signature
                      || (item.needs_document && !done && !itemDocuments(item).length)}
                    title={item.needs_document && !done && !itemDocuments(item).length
                      ? 'Upload the document to complete this item' : undefined}
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
