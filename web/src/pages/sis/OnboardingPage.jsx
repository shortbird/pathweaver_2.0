import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import { getPreviewTeacher } from './teacherPreview'
import BackToDashboard from '../../components/sis/BackToDashboard'
import ChecklistSignature from '../../components/sis/ChecklistSignature'
import AssignChecklistModal from '../../components/sis/tasks/AssignChecklistModal'
import PaperworkTemplatesManager from '../../components/sis/tasks/PaperworkTemplatesManager'
import { ChecklistTemplatesManager } from '../../components/sis/tasks/ChecklistTemplatesManager'
import { useConfirm } from '../../contexts/ConfirmContext'
import { itemDocuments } from './checklistDocuments'
import {
  useMyOnboarding, useOnboardingAssignments, sisOnboardingApi,
} from '../../hooks/api/useSisOnboarding'

/**
 * OnboardingPage — role-switched.
 * Teachers: their checklist(s) — mark items complete, attach documents.
 * Admins: templates (create/edit item lists), assign to staff, review items
 * that need approval. Sensitive documents (tax, background checks) are NOT
 * collected here by design — items should link to the appropriate external
 * system instead.
 */

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
  const [busyKey, setBusyKey] = useState(null)

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

// Re-exported from its own module rather than defined here. Defining it here
// and letting PaperworkTemplatesManager import it back out was an import cycle;
// see components/sis/tasks/ChecklistTemplatesManager.jsx.
export { ChecklistTemplatesManager }


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
  await sisOnboardingApi.patchItem(assignmentId, itemKey, orgId, fields)
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
      const r = await sisOnboardingApi.attachableDocuments(a.id, orgId)
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
      await sisOnboardingApi.unassign(a.id, orgId)
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
      const r = await sisOnboardingApi.signedUrl(url)
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


export const AdminOnboarding = ({ orgId, onCount = null }) => {
  const [assigningOpen, setAssigningOpen] = useState(false)

  const query = useOnboardingAssignments(orgId)
  const assignments = query.data || []
  const load = query.refetch

  useEffect(() => {
    if (query.isError) toast.error('Failed to load onboarding admin')
  }, [query.isError])

  const awaiting = awaitingReviewOf(assignments).length
  useEffect(() => { onCount?.(awaiting) }, [awaiting, onCount])

  return (
    <div className="space-y-6">
      <ReviewStrip orgId={orgId} assignments={assignments} onChanged={load} />
      <PaperworkTemplatesManager orgId={orgId} onChanged={load} defaultTab="checklists" />

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
