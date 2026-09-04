import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import { Link } from 'react-router-dom'
import { AcademicCapIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import BackToSchool from '../components/navigation/BackToSchool'
import ChecklistSignature from '../components/sis/ChecklistSignature'
import { itemDocuments } from './sis/checklistDocuments'

/**
 * Family portal (Learning app) — the checklists a school assigns to a guardian.
 *
 * Backed by /api/sis/parent/onboarding (authorized by family relationship). A
 * guardian marks items complete, follows any linked step, attaches a document to
 * items that need one, and signs items that need signing by typing their name.
 * Distinct from the staff SIS console, which is where admins build the templates
 * and assign them.
 */

const ITEM_BADGE = {
  pending: 'bg-gray-100 text-gray-600',
  complete: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

// Same wording the staff training page uses, so a parent who is also a teacher
// reads one vocabulary across both portals.
const questProgressLabel = (p) => {
  if (!p?.started) return 'Not started'
  if (p.completed) return 'Complete'
  if (!p.total) return 'In progress'
  return `${p.done} of ${p.total} tasks`
}

const questProgressStyle = (p) => {
  if (!p?.started) return 'bg-gray-100 text-gray-500'
  if (p.completed) return 'bg-green-100 text-green-700'
  return 'bg-amber-100 text-amber-800'
}

const FamilyPortalPage = () => {
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState([])
  const [orgId, setOrgId] = useState('')
  const [assignments, setAssignments] = useState([])
  const [quests, setQuests] = useState([])
  const [busyKey, setBusyKey] = useState(null)

  useEffect(() => {
    api.get('/api/sis/parent/context')
      .then((r) => {
        const list = r.data?.orgs || []
        setOrgs(list)
        if (list.length) setOrgId(list[0].organization_id)
      })
      .catch(() => toast.error('Could not load your portal'))
      .finally(() => setLoading(false))
  }, [])

  const load = useCallback(() => {
    if (!orgId) return
    api.get(`/api/sis/parent/onboarding?organization_id=${orgId}`)
      .then((r) => setAssignments(r.data?.assignments || []))
      .catch(() => toast.error('Could not load your checklists'))
    // A school with no family quests set is the normal case, so this failing
    // must not take the checklists down with it.
    api.get(`/api/sis/parent/quests?organization_id=${orgId}`)
      .then((r) => setQuests(r.data?.quests || []))
      .catch(() => setQuests([]))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const patchItem = async (assignmentId, itemKey, fields) => {
    setBusyKey(`${assignmentId}:${itemKey}`)
    try {
      await api.patch(`/api/sis/parent/onboarding/${assignmentId}/items/${itemKey}`, {
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
    if (!window.confirm(`Remove ${doc.filename || 'this document'}?`)) return
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
    } catch {
      toast.error('Could not open the document')
    }
  }

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-8"><p className="text-gray-500">Loading…</p></div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <BackToSchool className="mb-3" />
      <div className="flex items-center justify-between mb-1 gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Your portal</h1>
        {orgs.length > 1 && (
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization_name || 'School'}</option>)}
          </select>
        )}
      </div>
      <p className="text-gray-500 mb-6">Checklists shared with your family. Mark each step done as you finish it.</p>

      {/* Quests the school set for families — back to school night and the like.
          Yours, on your own account: this is not your child's work. */}
      {quests.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Quests from your school</h2>
          <p className="text-sm text-gray-500 mb-3">
            These are yours to do. Open one to start it, and your progress shows up here.
          </p>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {quests.map((q) => (
              <div key={q.quest_id} className="p-4 flex items-start gap-3">
                {q.progress?.completed
                  ? <CheckCircleIcon className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  : <AcademicCapIcon className="w-5 h-5 text-optio-purple shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{q.title}</span>
                    {q.is_required && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-optio-purple/10 text-optio-purple">
                        Required
                      </span>
                    )}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${questProgressStyle(q.progress)}`}>
                      {questProgressLabel(q.progress)}
                    </span>
                  </div>
                  {q.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{q.description}</p>}
                  <Link to={`/quests/${q.quest_id}`}
                    className="inline-block text-sm text-optio-purple hover:underline mt-1">
                    {q.progress?.started ? 'Continue' : 'Start this quest'}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!assignments.length ? (
        !quests.length && <p className="text-gray-400">Nothing to complete right now.</p>
      ) : (
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
                      {/* Signature items complete by being signed, not ticked. */}
                      <input type="checkbox" checked={done}
                        disabled={busy || item.status === 'approved' || item.needs_signature}
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
      )}
    </div>
  )
}

export default FamilyPortalPage
