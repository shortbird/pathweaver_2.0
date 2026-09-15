import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import ChecklistSignature from './ChecklistSignature'
import { itemDocuments } from '../../pages/sis/checklistDocuments'
import { useConfirm } from '../../contexts/ConfirmContext'

/**
 * A guardian's checklists: the items the school assigned to the family, each
 * completed by ticking it, following its link, attaching a document, or
 * signing it by typed name (ChecklistSignature).
 *
 * The one rendering, on two pages. The family portal (/family/portal) shows
 * every checklist; the paperwork hold (/family/required-documents) shows only
 * the required, unsigned ones and nothing else on the screen. Until
 * 2026-09-15 the hold page carried its own copy of this list, with its own
 * PATCH and its own "Mark as done" button, over the same endpoints -- two
 * ways to sign the same record, one of them the thinner. Now the hold page is
 * this component in a chrome-less shell.
 *
 * Every write goes through PATCH /api/sis/parent/onboarding/<a>/items/<key>
 * for the given org, and `onChanged` fires after each so the page can re-ask
 * the server (a signature may have been the last one; the school may have
 * added another meanwhile).
 */

const ITEM_BADGE = {
  pending: 'bg-gray-100 text-gray-600',
  complete: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function ChecklistAssignments({ orgId, assignments, onChanged }) {
  const confirm = useConfirm()
  const [busyKey, setBusyKey] = useState(null)

  const patchItem = async (assignmentId, itemKey, fields) => {
    setBusyKey(`${assignmentId}:${itemKey}`)
    try {
      await api.patch(`/api/sis/parent/onboarding/${assignmentId}/items/${itemKey}`, {
        organization_id: orgId, ...fields,
      })
      onChanged?.()
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
      const r = await api.post(`/api/sis/parent/onboarding/upload?organization_id=${orgId}`, form)
      // add_document, not document_url: the item holds a list, so a second file
      // is an addition rather than a replacement.
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
      const r = await api.get(`/api/sis/parent/onboarding/doc-url?organization_id=${orgId}&path=${encodeURIComponent(path)}`)
      if (r.data?.url) window.open(r.data.url, '_blank', 'noopener')
    } catch {
      toast.error('Could not open the document')
    }
  }

  // A document the school put in this family's portal to sign (item.sign_docs) —
  // a different store from the family's own uploads above, so a different door.
  const openSignDoc = async (doc) => {
    try {
      const r = await api.get(`/api/sis/parent/my-documents/${doc.id}/url?organization_id=${orgId}`)
      if (r.data?.url) window.open(r.data.url, '_blank', 'noopener')
      else toast.error('Could not open that document')
    } catch {
      toast.error('Could not open the document')
    }
  }

  return (
    <div className="space-y-4">
      {assignments.map((a) => (
        <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">{a.template_name || 'Checklist'}</h2>
            <span className="text-sm text-gray-500">{a.done_count}/{a.total_count} complete</span>
          </div>
          {a.description && (
            <p className="text-sm text-gray-600 whitespace-pre-line mb-3 -mt-1">{a.description}</p>
          )}
          <ul className="divide-y divide-gray-100">
            {(a.items || []).map((item) => {
              const busy = busyKey === `${a.id}:${item.key}`
              const done = ['complete', 'approved'].includes(item.status)
              return (
                <li key={item.key} className="py-3 flex items-start gap-3">
                  {/* Signature items complete by being signed, document items
                      by uploading — not by ticking. Unticking stays live. */}
                  <input type="checkbox" checked={done}
                    disabled={busy || item.status === 'approved' || item.needs_signature
                      || (item.needs_document && !done && !itemDocuments(item).length)}
                    title={item.needs_document && !done && !itemDocuments(item).length
                      ? 'Upload the document to complete this item' : undefined}
                    onChange={(e) => patchItem(a.id, item.key, { status: e.target.checked ? 'complete' : 'pending' })}
                    className="mt-1 h-4 w-4 accent-optio-purple" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                        {item.title}
                      </span>
                      {!item.required && <span className="text-xs text-gray-400">optional</span>}
                      {item.due_date && <span className="text-xs text-gray-400">due {item.due_date}</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize shrink-0 ${ITEM_BADGE[item.status] || ITEM_BADGE.pending}`}>
                        {item.status || 'pending'}
                      </span>
                    </div>
                    {item.description && <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>}
                    {item.admin_notes && <p className="text-sm text-amber-700 mt-0.5">Note: {item.admin_notes}</p>}
                    {item.needs_signature && (
                      <ChecklistSignature
                        item={item}
                        statement={a.signature_statement}
                        busy={busy}
                        onSign={(fields) => patchItem(a.id, item.key, fields)}
                        onOpenDoc={openSignDoc}
                      />
                    )}
                    <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                      {item.link && (
                        <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-sm text-optio-purple hover:underline">
                          Open link
                        </a>
                      )}
                      {item.needs_document && (
                        <div className="mt-1.5 space-y-1">
                          {itemDocuments(item).map((doc) => (
                            <div key={doc.path} className="flex items-center gap-3">
                              <button onClick={() => openDoc(doc.path)} className="text-sm text-optio-purple hover:underline">
                                {doc.filename || 'View document'}
                              </button>
                              <button onClick={() => removeDoc(a.id, item.key, doc)}
                                className="text-xs text-red-600 hover:underline">Remove</button>
                            </div>
                          ))}
                          <label className="inline-block text-sm text-optio-purple hover:underline cursor-pointer">
                            {itemDocuments(item).length ? 'Add another document' : 'Upload document'}
                            <input type="file" className="hidden" disabled={busy}
                              onChange={(e) => e.target.files?.[0] && uploadDoc(a.id, item.key, e.target.files[0])} />
                          </label>
                        </div>
                      )}
                    </div>
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

ChecklistAssignments.propTypes = {
  orgId: PropTypes.string,
  assignments: PropTypes.array.isRequired,
  onChanged: PropTypes.func,
}
