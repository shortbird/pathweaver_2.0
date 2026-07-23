import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { safeHref } from '../../utils/safeHref'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import SearchSelect from '../../components/ui/SearchSelect'
import CreditFeedbackThread from '../../components/credit/CreditFeedbackThread'

/**
 * Submissions inbox — one unified queue of everything newly submitted by
 * students in the teacher's classes. Left rail lists the queue (New/Reviewed,
 * filterable by class); the main pane shows the selected submission with its
 * evidence, the feedback thread, an XP adjustment control, and Accept — which
 * marks it reviewed and auto-advances to the next item. j/k also navigate.
 */

const timeAgo = (iso) => {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

// Evidence block content mirrors the credit dashboard's shapes: content is a
// string or an object ({text} / {url,...} / {items: [...]}). The dashboard's
// renderer lives inside ItemDetail.jsx (not exported), so this is a compact
// read-only equivalent.
const blockText = (content) => {
  if (typeof content === 'string') return content
  if (content && typeof content === 'object') return content.text || content.url || JSON.stringify(content)
  return String(content ?? '')
}
const blockItems = (content) => {
  if (!content || typeof content !== 'object') return []
  if (Array.isArray(content.items)) return content.items
  if (content.url) return [content]
  return []
}

const EvidenceBlock = ({ block }) => {
  switch (block.block_type) {
    case 'text':
      return <p className="text-sm text-gray-700 whitespace-pre-wrap">{blockText(block.content)}</p>
    case 'image':
      return (
        <div className="space-y-2">
          {blockItems(block.content).map((item, j) => (
            <div key={j}>
              <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" className="block">
                <img src={item.url} alt={item.alt || 'Evidence'} loading="lazy"
                     className="max-w-full max-h-72 object-contain rounded border" />
              </a>
              {item.caption && <p className="text-xs text-gray-500 mt-1">{item.caption}</p>}
            </div>
          ))}
        </div>
      )
    case 'video':
      return (
        <div className="space-y-2">
          {blockItems(block.content).map((item, j) => (
            <a key={j} href={safeHref(item.url)} target="_blank" rel="noopener noreferrer"
               className="text-sm text-optio-purple hover:underline">
              Video: {item.title || item.url}
            </a>
          ))}
        </div>
      )
    case 'link':
    case 'file':
    case 'document':
      return (
        <div className="space-y-2">
          {blockItems(block.content).map((item, j) => (
            <a key={j} href={safeHref(item.url)} target="_blank" rel="noopener noreferrer"
               className="block text-sm text-optio-purple hover:underline">
              {item.title || item.filename || item.url}
            </a>
          ))}
        </div>
      )
    default:
      return <p className="text-sm text-gray-500">{blockText(block.content)}</p>
  }
}

/**
 * Inline XP adjustment. Calls PUT /api/sis/completions/<id>/xp (built by the
 * gradebook endpoint) with {xp_value, reason}; hides itself when the endpoint
 * is missing (404/501).
 */
const XpAdjust = ({ completionId, orgId, xpValue, onChanged }) => {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(xpValue ?? 0)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [available, setAvailable] = useState(true)

  useEffect(() => {
    setOpen(false)
    setValue(xpValue ?? 0)
    setReason('')
  }, [completionId, xpValue])

  const save = async () => {
    if (!reason.trim()) { toast.error('A reason is required'); return }
    setSaving(true)
    try {
      const { data } = await api.put(`/api/sis/completions/${completionId}/xp`, {
        xp_value: Number(value),
        reason: reason.trim(),
        organization_id: orgId,
      })
      onChanged(data?.xp_value ?? Number(value))
      toast.success('XP updated')
      setOpen(false)
    } catch (e) {
      const status = e.response?.status
      if (status === 404 || status === 501) {
        setAvailable(false)
        toast.error('XP adjustment is not available')
      } else {
        toast.error(e.response?.data?.error || 'Could not update XP')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-gray-900">{xpValue ?? 0} XP</span>
      {available && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-optio-purple hover:text-optio-pink underline"
        >
          Adjust XP
        </button>
      )}
      {available && open && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="New XP value"
            className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            aria-label="Reason for XP change"
            className="w-52 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || !reason.trim()}
            className="rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save XP'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-neutral-500 hover:text-neutral-700"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

const SubmissionsPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [scope, setScope] = useState('new')
  const [classId, setClassId] = useState('')
  const [classes, setClasses] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [counts, setCounts] = useState({ new: 0, reviewed: 0 })
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    if (!orgId) return
    api.get(withOrg('/api/sis/classes', orgId))
      .then((r) => setClasses(r.data?.classes || []))
      .catch(() => { /* class filter stays empty */ })
  }, [orgId])

  const load = useCallback(() => {
    if (!orgId) return
    setLoading(true)
    const params = `scope=${scope}${classId ? `&class_id=${classId}` : ''}`
    api.get(withOrg(`/api/sis/submissions?${params}`, orgId))
      .then((r) => {
        const list = r.data?.submissions || []
        setSubmissions(list)
        setCounts(r.data?.counts || { new: 0, reviewed: 0 })
        setSelectedId((prev) =>
          list.some((s) => s.completion_id === prev) ? prev : (list[0]?.completion_id || null))
      })
      .catch(() => toast.error('Failed to load submissions'))
      .finally(() => setLoading(false))
  }, [orgId, scope, classId])

  useEffect(() => { load() }, [load])

  const selected = useMemo(
    () => submissions.find((s) => s.completion_id === selectedId) || null,
    [submissions, selectedId],
  )
  const selectedIndex = submissions.findIndex((s) => s.completion_id === selectedId)

  const move = useCallback((delta) => {
    if (!submissions.length) return
    const idx = submissions.findIndex((s) => s.completion_id === selectedId)
    const next = Math.min(Math.max((idx < 0 ? 0 : idx) + delta, 0), submissions.length - 1)
    setSelectedId(submissions[next].completion_id)
  }, [submissions, selectedId])

  // j/k keyboard navigation (ignored while typing)
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return
      if (e.key === 'j') move(1)
      if (e.key === 'k') move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move])

  // Accept: mark reviewed, drop it from the New queue, advance to the next item.
  const accept = async (sub) => {
    try {
      await api.post(`/api/sis/submissions/${sub.completion_id}/review`, {
        action: 'accepted',
        organization_id: orgId,
      })
      const idx = submissions.findIndex((s) => s.completion_id === sub.completion_id)
      const next = submissions.filter((s) => s.completion_id !== sub.completion_id)
      setSubmissions(next)
      setSelectedId(next[Math.min(idx, next.length - 1)]?.completion_id || null)
      setCounts((c) => ({ new: Math.max(0, c.new - 1), reviewed: c.reviewed + 1 }))
      toast.success('Accepted')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not accept submission')
    }
  }

  // Un-review an accidental accept (Reviewed scope only).
  const unreview = async (sub) => {
    try {
      await api.delete(withOrg(`/api/sis/submissions/${sub.completion_id}/review`, orgId))
      const idx = submissions.findIndex((s) => s.completion_id === sub.completion_id)
      const next = submissions.filter((s) => s.completion_id !== sub.completion_id)
      setSubmissions(next)
      setSelectedId(next[Math.min(idx, next.length - 1)]?.completion_id || null)
      setCounts((c) => ({ new: c.new + 1, reviewed: Math.max(0, c.reviewed - 1) }))
      toast.success('Moved back to New')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not un-review submission')
    }
  }

  const setXp = (completionId, xp) => {
    setSubmissions((subs) => subs.map((s) =>
      s.completion_id === completionId ? { ...s, task: { ...s.task, xp_value: xp } } : s))
  }

  const classOptions = useMemo(
    () => [{ id: '', name: 'All classes' }, ...classes],
    [classes],
  )

  const scopeTab = (key, label) => (
    <button
      key={key}
      type="button"
      onClick={() => setScope(key)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        scope === key
          ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
          : 'bg-white border border-gray-200 text-neutral-600 hover:border-optio-purple/50'
      }`}
    >
      {label} ({counts[key] ?? 0})
    </button>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Submissions</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        {scopeTab('new', 'New')}
        {scopeTab('reviewed', 'Reviewed')}
        <SearchSelect
          className="w-64"
          value={classId}
          onChange={setClassId}
          options={classOptions}
          getId={(c) => c.id}
          getLabel={(c) => c.name}
          placeholder="Filter by class…"
        />
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}

      {!loading && submissions.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-lg font-semibold text-neutral-800">You're all caught up.</p>
          <p className="text-sm text-neutral-500 mt-1">
            {scope === 'new'
              ? 'No new submissions from your classes.'
              : 'Nothing has been reviewed yet.'}
          </p>
        </div>
      )}

      {!loading && submissions.length > 0 && (
        <div className="flex flex-col md:flex-row gap-4">
          {/* Left rail: queue */}
          <div className="md:w-80 shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden md:max-h-[70vh] md:overflow-y-auto">
            {submissions.map((s) => (
              <button
                key={s.completion_id}
                type="button"
                onClick={() => setSelectedId(s.completion_id)}
                className={`block w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                  s.completion_id === selectedId
                    ? 'bg-optio-purple/5 border-l-4 border-l-optio-purple'
                    : 'hover:bg-neutral-50'
                }`}
              >
                <div className="text-sm font-semibold text-neutral-900 truncate">{s.student?.name}</div>
                <div className="text-sm text-neutral-600 truncate">{s.task?.title}</div>
                <div className="text-xs text-neutral-400 mt-0.5">
                  {[s.class_name, timeAgo(s.completed_at)].filter(Boolean).join(' · ')}
                </div>
              </button>
            ))}
          </div>

          {/* Main pane: selected submission */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 p-5">
            {!selected ? (
              <p className="text-neutral-500">Select a submission from the list.</p>
            ) : (
              <div className="space-y-5">
                {/* Student header + prev/next */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    {selected.student?.avatar_url ? (
                      <img src={selected.student.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink text-white flex items-center justify-center text-sm font-semibold">
                        {(selected.student?.name || '?').slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-neutral-900">{selected.student?.name}</div>
                      <div className="text-xs text-neutral-500">
                        Submitted {timeAgo(selected.completed_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => move(-1)}
                      disabled={selectedIndex <= 0}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-neutral-600 hover:border-optio-purple/50 disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => move(1)}
                      disabled={selectedIndex >= submissions.length - 1}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-neutral-600 hover:border-optio-purple/50 disabled:opacity-40"
                    >
                      Next
                    </button>
                    {scope === 'new' ? (
                      <button
                        type="button"
                        onClick={() => accept(selected)}
                        className="rounded-lg bg-green-600 hover:bg-green-700 px-4 py-1.5 text-sm font-semibold text-white"
                      >
                        Accept
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => unreview(selected)}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
                      >
                        Move back to New
                      </button>
                    )}
                  </div>
                </div>

                {/* Context: class / quest / task */}
                <div>
                  <div className="text-xs text-neutral-400 uppercase tracking-wide font-semibold mb-1">
                    {[selected.class_name, selected.quest_title].filter(Boolean).join(' · ')}
                  </div>
                  <h2 className="text-lg font-semibold text-neutral-900">{selected.task?.title}</h2>
                  {selected.task?.description && (
                    <p className="text-sm text-neutral-600 mt-1">{selected.task.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3 flex-wrap">
                    {selected.task?.pillar && (
                      <span className="text-xs rounded-full bg-optio-purple/10 text-optio-purple px-2 py-0.5 capitalize">
                        {String(selected.task.pillar).replace(/_/g, ' ')}
                      </span>
                    )}
                    <XpAdjust
                      completionId={selected.completion_id}
                      orgId={orgId}
                      xpValue={selected.task?.xp_value}
                      onChanged={(xp) => setXp(selected.completion_id, xp)}
                    />
                  </div>
                </div>

                {selected.review && (
                  <div className="text-xs text-neutral-500 bg-neutral-50 rounded-lg px-3 py-2">
                    Reviewed by {selected.review.reviewed_by_name || 'staff'}
                    {selected.review.reviewed_at ? ` on ${new Date(selected.review.reviewed_at).toLocaleDateString()}` : ''}
                  </div>
                )}

                {/* Evidence */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Evidence ({(selected.evidence_blocks || []).length} block{(selected.evidence_blocks || []).length === 1 ? '' : 's'})
                  </h3>
                  {(selected.evidence_blocks || []).length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No evidence submitted</p>
                  ) : (
                    <div className="space-y-3">
                      {selected.evidence_blocks.map((b, i) => (
                        <div key={b.id || i} className="border border-gray-200 rounded-lg p-3">
                          <EvidenceBlock block={b} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Two-way feedback thread with the student */}
                <CreditFeedbackThread completionId={selected.completion_id} />

                <p className="text-xs text-neutral-300">Tip: j / k move through the queue.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default SubmissionsPage
