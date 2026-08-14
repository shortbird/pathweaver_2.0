import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg } from './useSisOrg'

/**
 * Prior Learning review (SIS console).
 *
 * The office's queue of guardian-submitted prior-learning records: what a family
 * says their child already learned, the evidence they attached, and the credit
 * decision. Accepting IS awarding — the two always happen in one thought ("yes,
 * and that's 1.0 math"), so the award boxes live inside the accept action rather
 * than behind a second screen.
 *
 * ADMIN_ROLES on the backend (front-office paperwork, not money), so a campus
 * coordinator runs this alongside registration and attendance.
 *
 * The AI panel renders `ai_suggestion` when a record has one. Nothing produces
 * them yet — the analyzer is future work (services/sis_prior_learning_ai.py) —
 * and the panel is deliberately labelled as a suggestion so nobody mistakes it
 * for a decision the school already made.
 */

const STATUS_TABS = [
  ['submitted', 'New'],
  ['under_review', 'In review'],
  ['accepted', 'Accepted'],
  ['rejected', 'Not accepted'],
]

const STATUS_STYLES = {
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-amber-100 text-amber-800',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const dateRange = (record) => (
  [record.started_on, record.ended_on].filter(Boolean).join(' – ') || null
)

const PriorLearningPage = () => {
  const { orgId } = useSisOrg()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('submitted')
  const [records, setRecords] = useState([])
  const [counts, setCounts] = useState({})
  const [subjects, setSubjects] = useState([])
  const [openId, setOpenId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [disabled, setDisabled] = useState(false)

  const query = useMemo(() => {
    const params = new URLSearchParams({ status })
    if (orgId) params.set('organization_id', orgId)
    return params.toString()
  }, [status, orgId])

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/api/sis/prior-learning?${query}`)
      .then((r) => {
        setRecords(r.data?.records || [])
        setCounts(r.data?.counts || {})
        setSubjects(r.data?.subjects || [])
        setDisabled(false)
      })
      .catch((err) => {
        if (err.response?.status === 403) { setDisabled(true); return }
        toast.error('Could not load prior learning records')
      })
      .finally(() => setLoading(false))
  }, [query])

  useEffect(() => { load() }, [load])

  const review = async (recordId, payload) => {
    setBusy(true)
    try {
      await api.post(`/api/sis/prior-learning/${recordId}/review`,
        { organization_id: orgId || undefined, ...payload })
      toast.success('Saved')
      setOpenId(null)
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save this review')
    } finally {
      setBusy(false)
    }
  }

  if (disabled) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-gray-900 font-poppins">Prior Learning</h1>
        <p className="text-sm text-gray-600 mt-2">
          Prior learning records aren’t enabled for this school.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 font-poppins">Prior Learning</h1>
        <p className="text-sm text-gray-600 mt-1">
          Learning families did before or outside Optio, submitted with evidence for
          high-school credit.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setStatus(key)}
                  className={`text-sm px-3 py-1.5 rounded-full border ${
                    status === key
                      ? 'border-optio-purple text-optio-purple bg-purple-50'
                      : 'border-gray-300 text-gray-600'}`}>
            {label}{counts[key] ? ` (${counts[key]})` : ''}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {!loading && !records.length && (
        <p className="text-sm text-gray-500">Nothing here.</p>
      )}

      <div className="space-y-4">
        {records.map((record) => (
          <div key={record.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-gray-900">{record.title}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[record.status]}`}>
                    {record.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {[record.student_name, record.provider, dateRange(record),
                    record.hours_estimate ? `${record.hours_estimate} hrs` : null]
                    .filter(Boolean).join(' · ')}
                </p>
              </div>
              <button type="button" onClick={() => setOpenId(openId === record.id ? null : record.id)}
                      className="text-sm text-optio-purple font-medium shrink-0">
                {openId === record.id ? 'Close' : 'Review'}
              </button>
            </div>

            {record.description && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.description}</p>
            )}

            <EvidenceList evidence={record.evidence} />

            {record.ai_suggestion && <AiSuggestion suggestion={record.ai_suggestion} />}

            {openId === record.id && (
              <ReviewForm record={record} subjects={subjects} busy={busy}
                          onSubmit={(payload) => review(record.id, payload)} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Which inline viewer a file gets. Decided from the stored content_type first
 * and the file name second — a file uploaded from a phone often arrives with a
 * generic octet-stream type, and the extension is then the only honest signal.
 */
export const previewKindFor = (item) => {
  const type = (item.content_type || '').toLowerCase()
  // The stored file name first, then the URL — both really carry an extension.
  // `title` is deliberately not consulted: it's a human label ("Transcript"),
  // and letting it win means a real PDF falls through to the download fallback
  // just because the parent gave it a name without a dot in it.
  const ext = [item.file_name, item.url]
    .map((candidate) => {
      const name = (candidate || '').toLowerCase().split('?')[0].split('#')[0]
      return name.includes('.') ? name.split('.').pop() : ''
    })
    .find(Boolean) || ''
  if (type.startsWith('image/') || item.evidence_type === 'image'
      || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'jfif', 'tiff', 'tif'].includes(ext)) {
    return 'image'
  }
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (type.startsWith('text/') || ['csv', 'txt'].includes(ext)) return 'text'
  // doc/docx and anything else: no browser can render it in place, and pretending
  // otherwise gives the reviewer an empty grey box instead of a working link.
  return 'download'
}

const EvidenceList = ({ evidence }) => {
  if (!evidence?.length) return <p className="text-sm text-gray-500">No evidence attached.</p>
  return (
    <div className="space-y-2">
      {evidence.map((item) => <EvidenceItem key={item.id} item={item} />)}
    </div>
  )
}

/**
 * One piece of evidence, shown in place.
 *
 * A reviewer deciding whether four years of piano is worth 1.0 fine arts should
 * not be opening tabs to find out — the document is the decision. So each file
 * renders inline: images as images, PDFs in the browser's own viewer (which
 * scrolls through every page inside the frame), CSV and text fetched and shown
 * in a scrolling block. Everything gets a fixed-height, scrollable window rather
 * than a page-length expansion, so a queue of twenty records stays navigable.
 *
 * Previews are lazy — a browser only fetches the ones scrolled into view.
 */
const EvidenceItem = ({ item }) => {
  const [open, setOpen] = useState(true)
  const kind = previewKindFor(item)
  const label = item.title || item.file_name || item.url

  // Typed evidence has no file; it IS the text.
  if (!item.url) {
    return (
      <div className="text-sm bg-gray-50 rounded-lg px-3 py-2">
        <span className="text-gray-500 capitalize mr-2">{item.evidence_type}</span>
        <span className="text-gray-700 whitespace-pre-wrap">{item.content}</span>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-gray-50 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
          {/* The parent's own note about this file — often the only thing that
              says which year a scanned report card belongs to. */}
          {item.content && <p className="text-xs text-gray-500 truncate">{item.content}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button type="button" onClick={() => setOpen(!open)}
                  className="text-xs text-optio-purple font-medium">
            {open ? 'Collapse' : 'Expand'}
          </button>
          <a href={item.url} target="_blank" rel="noreferrer"
             className="text-xs text-gray-500 hover:text-optio-purple">
            Open
          </a>
        </div>
      </div>

      {open && (
        <div className="bg-white">
          {kind === 'image' && (
            <div className="max-h-[70vh] overflow-auto">
              <img src={item.url} alt={label} loading="lazy" className="w-full h-auto" />
            </div>
          )}
          {kind === 'pdf' && (
            // The browser's PDF viewer paginates and scrolls inside the frame,
            // which is what makes a 12-page transcript readable without a tab.
            <iframe src={item.url} title={label} loading="lazy"
                    className="w-full h-[70vh] border-0" />
          )}
          {kind === 'text' && <TextPreview url={item.url} />}
          {kind === 'download' && (
            <p className="text-sm text-gray-500 px-3 py-4">
              This file type can’t be shown here.{' '}
              <a href={item.url} target="_blank" rel="noreferrer"
                 className="text-optio-purple hover:underline">Open it</a> to read it.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * CSV and plain text, fetched and shown as-is.
 *
 * Deliberately NOT parsed into a table: an export from another school's system
 * has whatever shape it has, and a half-right table would hide columns a
 * reviewer needs. Monospaced and scrollable shows all of it, honestly.
 */
const TextPreview = ({ url }) => {
  const [state, setState] = useState({ status: 'loading', text: '' })

  useEffect(() => {
    let cancelled = false
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => { if (!cancelled) setState({ status: 'ready', text }) })
      .catch(() => { if (!cancelled) setState({ status: 'error', text: '' }) })
    return () => { cancelled = true }
  }, [url])

  if (state.status === 'loading') {
    return <p className="text-sm text-gray-500 px-3 py-4">Loading…</p>
  }
  if (state.status === 'error') {
    return (
      <p className="text-sm text-gray-500 px-3 py-4">
        Couldn’t load this file here.{' '}
        <a href={url} target="_blank" rel="noreferrer"
           className="text-optio-purple hover:underline">Open it</a> instead.
      </p>
    )
  }
  return (
    <pre className="max-h-[70vh] overflow-auto text-xs text-gray-800 p-3 whitespace-pre font-mono">
      {state.text}
    </pre>
  )
}

const AiSuggestion = ({ suggestion }) => (
  <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 space-y-1">
    <p className="text-xs font-semibold text-optio-purple uppercase tracking-wide">
      Suggested — not a decision
    </p>
    {suggestion.summary && <p className="text-sm text-gray-700">{suggestion.summary}</p>}
    {(suggestion.subjects || []).map((s, i) => (
      <p key={i} className="text-sm text-gray-700">
        {s.credits} {s.subject}
        {s.confidence != null && <span className="text-gray-500"> ({Math.round(s.confidence * 100)}%)</span>}
        {s.rationale && <span className="text-gray-500"> — {s.rationale}</span>}
      </p>
    ))}
    {(suggestion.flags || []).map((flag, i) => (
      <p key={i} className="text-sm text-amber-800">Check: {flag}</p>
    ))}
  </div>
)

const ReviewForm = ({ record, subjects, busy, onSubmit }) => {
  const [notes, setNotes] = useState(record.review_notes || '')
  const [credits, setCredits] = useState(() => (
    Object.fromEntries(Object.entries(record.awarded_credits || {}).map(([k, v]) => [k, String(v)]))
  ))

  const awarded = () => Object.fromEntries(
    Object.entries(credits)
      .map(([subject, value]) => [subject, parseFloat(value)])
      .filter(([, value]) => Number.isFinite(value) && value > 0)
  )

  return (
    <div className="pt-3 border-t border-gray-100 space-y-3">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-1.5">Credit to award</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {subjects.map((subject) => (
            <label key={subject.key} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-gray-600">{subject.name}</span>
              <input type="number" min="0" step="0.25" placeholder="0"
                     aria-label={`${subject.name} credits`}
                     value={credits[subject.key] || ''}
                     onChange={(e) => setCredits({ ...credits, [subject.key]: e.target.value })}
                     className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={`notes-${record.id}`}>
          Notes for the family
        </label>
        <textarea id={`notes-${record.id}`} rows={2} className={inputClass} value={notes}
                  onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy}
                onClick={() => onSubmit({ status: 'accepted', review_notes: notes, awarded_credits: awarded() })}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink disabled:opacity-50">
          Accept &amp; award
        </button>
        {record.status === 'submitted' && (
          <button type="button" disabled={busy}
                  onClick={() => onSubmit({ status: 'under_review', review_notes: notes })}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 disabled:opacity-50">
            Mark in review
          </button>
        )}
        <button type="button" disabled={busy}
                onClick={() => onSubmit({ status: 'rejected', review_notes: notes })}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-red-300 text-red-700 disabled:opacity-50">
          Don’t accept
        </button>
      </div>
    </div>
  )
}

export default PriorLearningPage
