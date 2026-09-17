import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import { withOrg } from '../../../pages/sis/useSisOrg'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { itemDocuments } from '../../../pages/sis/checklistDocuments'
import { sisOnboardingApi } from '../../../hooks/api/useSisOnboarding'
import StatusPill from '../ui/StatusPill'

/**
 * The office's view of one assigned checklist: the card with the person's
 * items (approve, reject, attach a filed document, unassign) and the strip
 * of finished items waiting on the office. Both are rendered by the Task
 * Center's Assigned list (AssignedWork).
 *
 * Until M9 these lived in pages/sis/OnboardingPage.jsx under a second
 * "Checklist progress" list that only /onboarding showed admins -- the same
 * rows the Task Center already listed, with a better search box. The search
 * moved into AssignedWork and the page went; the person's own checklist is
 * now the Checklist tab of My Tasks (MyChecklists).
 */

const ItemBadge = ({ status }) => <StatusPill domain="checklist_item" status={status} fallback="pending" />

// The office's approve/reject on a finished item. Shared by the review strip
// and the per-assignment card.
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
/** `openOn`: item keys the list's search named. A non-empty list opens the
 * card and marks those items, so a search for "W-4" shows the W-4 line of
 * every person rather than a row of collapsed names. */
export const AssignmentCard = ({ orgId, assignment: a, onChanged, badge = null, openOn = [] }) => {
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

  const named = new Set(openOn)
  return (
    <details className="border border-gray-200 rounded-lg" open={named.size ? true : undefined}>
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
          <li key={item.key}
            className={`py-2 flex items-center gap-2 text-sm flex-wrap ${named.has(item.key) ? 'bg-amber-50 -mx-3 px-3' : ''}`}>
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
