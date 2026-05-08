import React, { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import {
  fetchQueue,
  fetchEvidenceDetail,
  updateEvidenceStatus,
  recordPost,
  updatePost,
  fetchPendingTakedowns,
} from '../services/showcaseService'

const PILLARS = ['creativity', 'critical_thinking', 'practical_skills', 'community', 'stem']
const STATUSES = ['new', 'saved', 'scheduled', 'posted', 'dismissed']
const PLATFORMS = ['instagram', 'tiktok', 'x', 'linkedin', 'facebook', 'youtube', 'other']

const STATUS_PILL_CLASS = {
  new: 'bg-blue-100 text-blue-800',
  saved: 'bg-yellow-100 text-yellow-800',
  scheduled: 'bg-purple-100 text-purple-800',
  posted: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-600',
}
const STATUS_RANK = { new: 0, saved: 1, scheduled: 2, posted: 3, dismissed: 4 }
function sortItemsByStatusThenDate(items) {
  return [...items].sort((a, b) => {
    const sa = (statusOf(a) || {}).status || 'new'
    const sb = (statusOf(b) || {}).status || 'new'
    if (STATUS_RANK[sa] !== STATUS_RANK[sb]) return STATUS_RANK[sa] - STATUS_RANK[sb]
    const da = a.completed_at || ''
    const db = b.completed_at || ''
    return db.localeCompare(da)  // newest first
  })
}

function statusOf(item) {
  const s = item?.showcase_evidence_status
  if (Array.isArray(s)) return s[0]
  return s
}

function studentDisplay(detail, consent) {
  if (!consent || !consent.consent_first_name) return 'Student'
  const u = detail?.users || {}
  return u.first_name || u.display_name || 'Student'
}

function formatPillar(p) {
  if (!p) return ''
  if (p.toLowerCase() === 'stem') return 'STEM'
  return p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Strip out the "Multi-format evidence document (Document ID: ...)" placeholder
// (legacy evidence_text content) -- prefer synthesized text from blocks.
function previewText(item) {
  const synth = item.evidence_text_synthesized
  if (synth) return synth.slice(0, 140)
  const raw = item.evidence_text || ''
  if (raw.startsWith('Multi-format evidence document')) return ''
  return raw.slice(0, 140)
}

const EvidenceBlock = ({ block }) => {
  const c = block.content || {}
  if (block.block_type === 'text') {
    return (
      <div className="p-3 bg-gray-50 border rounded text-sm whitespace-pre-wrap">
        {c.text || ''}
      </div>
    )
  }
  if (block.block_type === 'image') {
    const items = c.items || []
    return (
      <div className="space-y-2">
        {items.map((it, i) => (
          <figure key={i} className="border rounded overflow-hidden">
            <img src={it.url} alt={it.caption || it.title || ''} className="w-full max-h-96 object-contain bg-gray-50" />
            {(it.caption || it.title) && (
              <figcaption className="px-3 py-1 text-xs text-gray-500 bg-white">
                {it.caption || it.title}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    )
  }
  if (block.block_type === 'link') {
    const items = c.items || []
    return (
      <div className="space-y-1">
        {items.map((it, i) => (
          <a
            key={i}
            href={it.url}
            target="_blank"
            rel="noreferrer"
            className="block p-2 border rounded text-sm text-optio-purple hover:bg-purple-50 truncate"
          >
            {it.title ? `${it.title} — ${it.url}` : it.url}
          </a>
        ))}
      </div>
    )
  }
  if (block.block_type === 'video') {
    const items = c.items || []
    return (
      <div className="space-y-2">
        {items.map((it, i) => (
          <video key={i} src={it.url} controls className="w-full max-h-96 rounded border" />
        ))}
      </div>
    )
  }
  if (block.block_type === 'file') {
    const items = c.items || []
    return (
      <div className="space-y-1">
        {items.map((it, i) => (
          <a
            key={i}
            href={it.url}
            target="_blank"
            rel="noreferrer"
            className="block p-2 border rounded text-sm text-optio-purple hover:bg-purple-50"
          >
            {it.filename || it.title || it.url}
          </a>
        ))}
      </div>
    )
  }
  // Unknown block type — render minimally
  return (
    <div className="p-2 border rounded text-xs text-gray-500">
      Unrecognized block: {block.block_type}
    </div>
  )
}

const EvidenceRender = ({ detail }) => {
  const blocks = detail.evidence_blocks
  if (Array.isArray(blocks) && blocks.length > 0) {
    return (
      <div className="space-y-3">
        {blocks.map((b) => <EvidenceBlock key={b.id} block={b} />)}
      </div>
    )
  }
  // Legacy single-format fallback
  return (
    <div className="space-y-3">
      {detail.evidence_url && (
        <img src={detail.evidence_url} alt="" className="w-full max-h-96 object-contain rounded border" />
      )}
      {detail.evidence_text && !detail.evidence_text.startsWith('Multi-format evidence document') && (
        <div className="p-3 bg-gray-50 border rounded text-sm whitespace-pre-wrap">{detail.evidence_text}</div>
      )}
    </div>
  )
}

const Section = ({ title, children, defaultOpen = false }) => {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <div className="border-t pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-sm font-bold text-gray-700 hover:text-gray-900"
      >
        <span>{title}</span>
        <span className="text-xs text-gray-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  )
}

const Pill = ({ children, className = '' }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}>{children}</span>
)

const FilterRail = ({ filters, setFilters, takedownCount }) => (
  <div className="space-y-6 p-4 bg-white border border-gray-200 rounded-lg">
    {takedownCount > 0 && (
      <button
        onClick={() => setFilters({ ...filters, takedownsOnly: !filters.takedownsOnly })}
        className={`w-full text-left p-3 rounded-md border-2 ${
          filters.takedownsOnly ? 'border-red-500 bg-red-50' : 'border-red-200 bg-red-50/50'
        }`}
      >
        <div className="text-sm font-bold text-red-700">Take-down required</div>
        <div className="text-xs text-red-600 mt-1">
          {takedownCount} post{takedownCount === 1 ? '' : 's'} need{takedownCount === 1 ? 's' : ''} removal
        </div>
      </button>
    )}

    <div>
      <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">Status</h3>
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="status"
            checked={!filters.status}
            onChange={() => setFilters({ ...filters, status: '' })}
          />
          All
        </label>
        {STATUSES.map((s) => (
          <label key={s} className="flex items-center gap-2 text-sm capitalize">
            <input
              type="radio"
              name="status"
              checked={filters.status === s}
              onChange={() => setFilters({ ...filters, status: s })}
            />
            {s}
          </label>
        ))}
      </div>
    </div>

    <div>
      <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">Pillar</h3>
      <select
        value={filters.pillar}
        onChange={(e) => setFilters({ ...filters, pillar: e.target.value })}
        className="w-full px-2 py-1 text-sm border rounded"
      >
        <option value="">All pillars</option>
        {PILLARS.map((p) => (
          <option key={p} value={p}>
            {formatPillar(p)}
          </option>
        ))}
      </select>
    </div>

    <div>
      <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">Has image</h3>
      <select
        value={filters.hasImage === undefined ? '' : filters.hasImage ? '1' : '0'}
        onChange={(e) => {
          const v = e.target.value
          setFilters({ ...filters, hasImage: v === '' ? undefined : v === '1' })
        }}
        className="w-full px-2 py-1 text-sm border rounded"
      >
        <option value="">Any</option>
        <option value="1">With image</option>
        <option value="0">Text only</option>
      </select>
    </div>
  </div>
)

const QueueListItem = ({ item, isSelected, onSelect }) => {
  const stat = statusOf(item) || { status: 'new' }
  const task = item.user_quest_tasks || {}
  const quest = item.quests || {}
  const user = item.users || {}
  const showName = item.consent?.consent_first_name
  const text = previewText(item)
  // For the thumbnail, prefer the first image block; fall back to evidence_url for legacy
  let thumb = item.evidence_url
  if (!thumb && Array.isArray(item.evidence_blocks)) {
    const imgBlock = item.evidence_blocks.find((b) => b.block_type === 'image')
    thumb = imgBlock?.content?.items?.[0]?.url
  }
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 border-l-4 ${
        isSelected ? 'border-l-optio-purple bg-purple-50' : 'border-l-transparent hover:bg-gray-50'
      } border-b border-gray-200 transition`}
    >
      <div className="flex items-start gap-3">
        {thumb && (
          <img src={thumb} alt="" className="w-16 h-16 object-cover rounded flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Pill className={STATUS_PILL_CLASS[stat.status] || ''}>{stat.status}</Pill>
            {task.pillar && <Pill className="bg-gray-100 text-gray-700">{formatPillar(task.pillar)}</Pill>}
          </div>
          <div className="font-medium text-sm text-gray-900 truncate">{task.title || 'Untitled task'}</div>
          <div className="text-xs text-gray-500 truncate">{quest.title || ''}</div>
          {text && <div className="text-xs text-gray-600 mt-1 line-clamp-2">{text}</div>}
          <div className="text-xs text-gray-400 mt-1">
            {showName ? user.first_name || user.display_name : 'Anonymous student'}
            {' · '}
            {item.completed_at ? new Date(item.completed_at).toLocaleDateString() : ''}
          </div>
        </div>
      </div>
    </button>
  )
}

const ConsentBadge = ({ consent }) => {
  if (!consent) return <Pill className="bg-red-100 text-red-700">No consent</Pill>
  if (!consent.consent_active) return <Pill className="bg-red-100 text-red-700">Revoked</Pill>
  const flags = []
  if (consent.consent_work) flags.push('work')
  if (consent.consent_first_name) flags.push('name')
  if (consent.consent_face) flags.push('face')
  if (consent.consent_age) flags.push('age')
  return <Pill className="bg-green-100 text-green-700">Consent: {flags.join(', ') || 'none'}</Pill>
}

const PostRecorder = ({ evidenceId, onRecorded }) => {
  const [platform, setPlatform] = useState('instagram')
  const [url, setUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!url.startsWith('http')) {
      toast.error('Post URL must start with http(s)')
      return
    }
    setBusy(true)
    try {
      await recordPost(evidenceId, { platform, postUrl: url, captionUsed: caption })
      toast.success('Post recorded')
      setUrl('')
      setCaption('')
      onRecorded?.()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to record')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-md p-3 space-y-2 bg-gray-50">
      <div className="text-sm font-bold text-gray-700">Record a post</div>
      <div className="flex gap-2">
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="px-2 py-1 text-sm border rounded">
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          type="url"
          placeholder="https://..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 px-2 py-1 text-sm border rounded"
        />
      </div>
      <textarea
        placeholder="Caption used (optional)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={2}
        className="w-full px-2 py-1 text-sm border rounded"
      />
      <button
        disabled={busy || !url}
        onClick={submit}
        className="px-3 py-1.5 text-sm rounded bg-optio-purple text-white disabled:opacity-50"
      >
        {busy ? 'Recording...' : 'Record post'}
      </button>
    </div>
  )
}

const PostHistoryRow = ({ post, onRefresh }) => {
  const markTakenDown = async () => {
    if (!confirm('Mark this post as taken down?')) return
    try {
      await updatePost(post.id, { marked_taken_down: true })
      toast.success('Marked taken down')
      onRefresh()
    } catch (e) {
      toast.error('Failed')
    }
  }
  return (
    <div className={`p-2 border rounded text-sm flex items-center gap-2 ${post.take_down_required ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
      <Pill className="bg-gray-100 text-gray-700">{post.platform}</Pill>
      <a href={post.post_url} target="_blank" rel="noreferrer" className="flex-1 truncate text-optio-purple hover:underline">
        {post.post_url}
      </a>
      <span className="text-xs text-gray-500">{new Date(post.posted_at).toLocaleDateString()}</span>
      {post.take_down_required && !post.take_down_at && (
        <button onClick={markTakenDown} className="px-2 py-0.5 text-xs rounded bg-red-600 text-white">
          Mark removed
        </button>
      )}
    </div>
  )
}

const ComposerPane = ({ evidenceId, onClose, onChanged }) => {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scheduleDate, setScheduleDate] = useState('')
  const [notes, setNotes] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetchEvidenceDetail(evidenceId)
      setDetail(d)
      const sr = d.status_row || {}
      setNotes(sr.notes || '')
      setScheduleDate(sr.scheduled_for ? sr.scheduled_for.slice(0, 10) : '')
    } catch (e) {
      toast.error('Failed to load evidence')
    } finally {
      setLoading(false)
    }
  }, [evidenceId])

  useEffect(() => {
    reload()
  }, [reload])

  if (loading || !detail) {
    return (
      <div className="p-6 text-center text-gray-500">Loading…</div>
    )
  }

  const consent = detail.consent
  const task = detail.user_quest_tasks || {}
  const quest = detail.quests || {}

  const setStatus = async (status) => {
    try {
      await updateEvidenceStatus(evidenceId, { status })
      toast.success(status === 'dismissed' ? 'Skipped' : `Marked ${status}`)
      // Notify parent of status change. For dismiss the item is about to be removed
      // from the queue + we'll auto-advance — no need to reload composer.
      onChanged?.({ status })
      if (status !== 'dismissed') reload()
    } catch (e) {
      toast.error('Failed')
    }
  }

  const saveScheduledNotes = async () => {
    try {
      const body = { notes }
      let newStatus = (statusOf(detail) || {}).status
      if (scheduleDate) {
        body.scheduled_for = new Date(scheduleDate).toISOString()
        if (newStatus !== 'posted') {
          body.status = 'scheduled'
          newStatus = 'scheduled'
        }
      }
      await updateEvidenceStatus(evidenceId, body)
      toast.success('Saved')
      onChanged?.({ status: newStatus })
      reload()
    } catch (e) {
      toast.error('Failed')
    }
  }

  return (
    <div className="h-full overflow-y-auto p-5 space-y-4 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{task.title || 'Evidence'}</h2>
          <div className="text-sm text-gray-500">{quest.title}</div>
        </div>
        <button onClick={onClose} className="px-2 text-gray-500 hover:text-gray-900">×</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <ConsentBadge consent={consent} />
        {task.pillar && <Pill className="bg-gray-100 text-gray-700">{formatPillar(task.pillar)}</Pill>}
        <Pill className={STATUS_PILL_CLASS[(detail.status_row || {}).status] || ''}>
          {(detail.status_row || {}).status || 'new'}
        </Pill>
      </div>

      <div className="text-xs text-gray-500">
        Student: {studentDisplay(detail, consent)}
        {consent && !consent.consent_face && (
          <div className="mt-1 px-2 py-1 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
            Consent does NOT cover showing face. Skip if image shows the student's face.
          </div>
        )}
      </div>

      {/* Evidence (multi-format blocks or legacy) */}
      <EvidenceRender detail={detail} />

      <Section title="Schedule & notes" defaultOpen>
        <div className="flex gap-2 items-center">
          <label className="text-xs text-gray-500">Scheduled for:</label>
          <input
            type="date"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
            className="px-2 py-1 text-sm border rounded"
          />
        </div>
        <textarea
          rows={2}
          value={notes}
          placeholder="Notes (private to marketing)"
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-2 py-1 text-sm border rounded"
        />
        <div className="flex flex-wrap gap-2">
          <button onClick={saveScheduledNotes} className="px-3 py-1.5 text-sm rounded bg-optio-purple text-white">
            Save changes
          </button>
          <button onClick={() => setStatus('saved')} className="px-3 py-1.5 text-sm rounded border">
            Bookmark for later
          </button>
          <button onClick={() => setStatus('dismissed')} className="px-3 py-1.5 text-sm rounded border text-red-600 border-red-300">
            Skip
          </button>
        </div>
        <div className="text-xs text-gray-500 leading-relaxed">
          <strong>Save changes</strong>: persists the date and notes above. If you set a date, the item moves to the "Scheduled" status.<br />
          <strong>Bookmark for later</strong>: marks this for future use without picking a date yet.<br />
          <strong>Skip</strong>: hides this from the queue (won't be featured).
        </div>
      </Section>

      <Section title="Record a post" defaultOpen>
        <p className="text-xs text-gray-500">
          Paste the URL of the post here for tracking purposes.
        </p>
        <PostRecorder evidenceId={evidenceId} onRecorded={() => { onChanged?.({ status: 'posted' }); reload(); }} />
      </Section>

      {(detail.posts || []).length > 0 && (
        <Section title={`Post history (${detail.posts.length})`} defaultOpen>
          <div className="space-y-1">
            {detail.posts.map((p) => (
              <PostHistoryRow key={p.id} post={p} onRefresh={() => { onChanged?.({ takedown: true }); reload(); }} />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

const ShowcasePage = () => {
  const [items, setItems] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, pages: 1 })
  const [filters, setFilters] = useState({ status: '', pillar: '', hasImage: undefined, takedownsOnly: false })
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [takedowns, setTakedowns] = useState([])

  const consentByUser = useMemo(() => {
    // Build a map of user_id -> consent (extracted from list items if available)
    const map = {}
    items.forEach((i) => {
      if (i.user_id && i.users) map[i.user_id] = i.consent
    })
    return map
  }, [items])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchQueue({
        page: pagination.page,
        limit: pagination.limit,
        status: filters.status,
        pillar: filters.pillar,
        hasImage: filters.hasImage,
      })
      setItems(filters.takedownsOnly ? [] : r.items)
      setPagination((p) => ({ ...p, total: r.pagination.total, pages: r.pagination.pages }))
    } catch (e) {
      toast.error('Failed to load queue')
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pagination.limit, filters.status, filters.pillar, filters.hasImage, filters.takedownsOnly])

  const reloadTakedowns = useCallback(async () => {
    try {
      const r = await fetchPendingTakedowns()
      setTakedowns(r.items || [])
    } catch (e) {
      // non-fatal
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    reloadTakedowns()
  }, [reloadTakedowns])

  const visibleItems = filters.takedownsOnly
    ? []  // takedown view rendered separately below
    : items

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Marketing Showcase</h1>
        <p className="text-sm text-gray-500">Approved student work, ready to post.</p>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Filter rail */}
        <aside className="col-span-12 md:col-span-3 lg:col-span-2">
          <FilterRail filters={filters} setFilters={setFilters} takedownCount={takedowns.length} />
        </aside>

        {/* Queue list — internal scroll on desktop so the page doesn't scroll past the composer */}
        <main className="col-span-12 md:col-span-9 lg:col-span-5 bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col lg:h-[calc(100vh-10rem)]">
          {filters.takedownsOnly ? (
            <div className="p-4 overflow-y-auto">
              <h2 className="text-sm font-bold text-red-700 mb-2">Take-down required</h2>
              {takedowns.length === 0 ? (
                <div className="text-sm text-gray-500">No pending take-downs.</div>
              ) : (
                <div className="space-y-2">
                  {takedowns.map((t) => (
                    <div key={t.id} className="p-3 border border-red-300 rounded bg-red-50">
                      <div className="flex items-center gap-2">
                        <Pill className="bg-gray-100 text-gray-700">{t.platform}</Pill>
                        <a href={t.post_url} target="_blank" rel="noreferrer" className="flex-1 truncate text-optio-purple hover:underline">
                          {t.post_url}
                        </a>
                        <button
                          onClick={async () => {
                            await updatePost(t.id, { marked_taken_down: true })
                            reloadTakedowns()
                            toast.success('Marked removed')
                          }}
                          className="px-2 py-1 text-xs rounded bg-red-600 text-white"
                        >
                          Mark removed
                        </button>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {t.users?.first_name || t.users?.display_name || 'Student'} · posted {new Date(t.posted_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="p-12 text-center text-gray-500">Loading…</div>
          ) : visibleItems.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="text-sm">No evidence in this view.</div>
              <div className="text-xs text-gray-400 mt-1">Try clearing filters or wait for new student submissions.</div>
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-500 px-4 py-2 bg-gray-50 border-b flex-shrink-0">
                {pagination.total} total · page {pagination.page} of {pagination.pages}
              </div>
              <div className="flex-1 overflow-y-auto">
                {visibleItems.map((item) => (
                  <QueueListItem
                    key={item.id}
                    item={item}
                    isSelected={selectedId === item.id}
                    onSelect={() => setSelectedId(item.id)}
                  />
                ))}
              </div>
              {pagination.pages > 1 && (
                <div className="flex items-center justify-between p-3 border-t flex-shrink-0">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                    className="px-3 py-1 text-sm rounded border disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-500">
                    {pagination.page} / {pagination.pages}
                  </span>
                  <button
                    disabled={pagination.page >= pagination.pages}
                    onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                    className="px-3 py-1 text-sm rounded border disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </main>

        {/* Composer pane */}
        <section className="col-span-12 lg:col-span-5 bg-white border border-gray-200 rounded-lg min-h-[400px] overflow-hidden flex flex-col lg:h-[calc(100vh-10rem)]">
          {selectedId ? (
            <ComposerPane
              evidenceId={selectedId}
              onClose={() => setSelectedId(null)}
              onChanged={(change) => {
                if (change?.takedown) {
                  // Take-down marking can affect the takedowns view but not the queue list
                  reloadTakedowns()
                  return
                }
                if (change?.status === 'dismissed') {
                  // Remove from visible queue and auto-select the next item
                  setItems((prev) => {
                    const idx = prev.findIndex((i) => i.id === selectedId)
                    const remaining = prev.filter((i) => i.id !== selectedId)
                    if (remaining.length === 0) {
                      setSelectedId(null)
                    } else {
                      const nextIdx = Math.min(idx, remaining.length - 1)
                      setSelectedId(remaining[nextIdx].id)
                    }
                    return remaining
                  })
                  setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
                  return
                }
                if (change?.status) {
                  // Update in place AND re-sort so Bookmark sinks below new items
                  setItems((prev) => {
                    const updated = prev.map((i) => {
                      if (i.id !== selectedId) return i
                      const cur = statusOf(i) || {}
                      return { ...i, showcase_evidence_status: [{ ...cur, status: change.status }] }
                    })
                    return sortItemsByStatusThenDate(updated)
                  })
                  return
                }
                // Fallback: full reload (shouldn't normally hit this path)
                reload()
                reloadTakedowns()
              }}
            />
          ) : (
            <div className="p-12 text-center text-gray-400 text-sm">
              Select an item from the queue to compose a post.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default ShowcasePage
