import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import RecordCard from './RecordCard'
import ApprovePanel from './ApprovePanel'
import RecordHistory from './RecordHistory'
import DiplomaProgress from './DiplomaProgress'
import inputClass from './inputClass'
import { downloadBlob } from '../../../utils/csv'
import { formatCents } from '../../../utils/money'
import useRecordActions from './useRecordActions'

const WAITING = ['submitted', 'under_review']
const ORDER = { submitted: 0, under_review: 0, accepted: 1, needs_info: 2, rejected: 3 }

// While the AI is reading a record in the background, look again this often.
const POLL_MS = 8000

const SendBack = ({ busy, onSend }) => {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
              className="text-sm font-medium text-gray-700 hover:text-gray-900">
        Send back for more…
      </button>
    )
  }
  return (
    <div className="space-y-2 w-full">
      <textarea aria-label="What the family needs to send" rows={2} className={inputClass}
                placeholder="What is missing? The family sees this, by email and in the app."
                value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" disabled={busy || !message.trim()}
                onClick={async () => { if (await onSend(message.trim())) { setOpen(false); setMessage('') } }}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-gray-800 disabled:opacity-50">
          Send to family
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-gray-600">
          Cancel
        </button>
      </div>
    </div>
  )
}

const Overlaps = ({ items }) => (
  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
    <p className="text-xs font-semibold text-amber-900 mb-1">Check before approving</p>
    <ul className="list-disc pl-4 space-y-0.5">
      {items.map((o, i) => <li key={i} className="text-xs text-amber-900">{o.message}</li>)}
    </ul>
  </div>
)

const priceLabel = (cents) => (cents ? formatCents(cents, { compact: true }) : 'Free')

// Accredited decides what the credit costs (pricing.json) and the credit
// report prints it. Credit from a prior-learning record took the reviewer's
// call on Approve; only a school the office typed in by hand is marked here.
const TransferCredits = ({ rows, cost, subjects, onAccredited, saving }) => {
  if (!rows?.length) {
    return (
      <section className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900">Already on the transcript</h3>
        <p className="text-sm text-gray-500 mt-1">No credit from other schools yet.</p>
      </section>
    )
  }
  const name = (key) => subjects.find((s) => s.key === key)?.name || key
  const lineFor = (id) => (cost?.lines || []).find((l) => l.transfer_credit_id === id)
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Already on the transcript</h3>
        {/* OpenEd families buy through OpenEd and see no price. */}
        {cost?.price_list === 'opened' && (
          <span className="text-xs text-gray-500">Purchased through OpenEd</span>
        )}
        {cost && cost.price_list !== 'opened' && (
          <span className="text-xs text-gray-500">
            Transfer cost <span className="font-semibold text-gray-900 tabular-nums">{priceLabel(cost.total_cents)}</span>
            {' · '}{priceLabel(cost.unaccredited_rate_cents)} per unaccredited credit
          </span>
        )}
      </div>
      <ul className="divide-y divide-gray-100">
        {rows.map((t) => {
          const line = lineFor(t.id)
          return (
            <li key={t.id} className="text-sm py-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <span className="min-w-0">
                <span className="font-medium text-gray-800">{t.school_name}</span>
                <span className="text-gray-500">
                  {' — '}{Object.entries(t.credits).map(([s, c]) => `${c} ${name(s)}`).join(', ')}
                </span>
                {Object.values(t.course_names || {}).flat().length > 0 && (
                  <span className="block text-xs text-gray-500">
                    {Object.values(t.course_names).flat().map((c) => c.name).join(' · ')}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3 shrink-0">
                {t.from_prior_learning ? (
                  <span className="text-xs text-gray-500">
                    {line?.accredited === true ? 'Accredited'
                      : line?.accredited === false ? 'Not accredited' : 'Partly accredited'}
                  </span>
                ) : (
                  <label className="flex items-center gap-1.5 text-xs text-gray-700">
                    <input type="checkbox" checked={!!t.accredited} disabled={saving === t.id}
                           aria-label={`${t.school_name} is accredited`}
                           onChange={(e) => onAccredited(t.id, e.target.checked)} />
                    Accredited
                  </label>
                )}
                {line && <span className="text-xs tabular-nums text-gray-700 w-14 text-right">{priceLabel(line.cost_cents)}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * One student's prior learning, start to finish: diploma progress, what is
 * already on the transcript, and every record with its evidence, the AI's
 * reading, the one-step Approve, Send back, and history.
 */
const StudentWorkspace = ({ orgId, studentId, onChanged }) => {
  const [data, setData] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [reporting, setReporting] = useState(false)
  const [savingAccredited, setSavingAccredited] = useState(null)

  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true)
    return api.get(`/api/sis/prior-learning/students/${studentId}/workspace`,
      { params: { organization_id: orgId || undefined } })
      .then((r) => {
        setData(r.data)
        setRecords([...(r.data?.records || [])].sort(
          (a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9)))
      })
      .catch((err) => {
        if (!quiet) toast.error(err.response?.data?.error || 'Could not load this student')
      })
      .finally(() => setLoading(false))
  }, [orgId, studentId])

  useEffect(() => { load() }, [load])

  // The AI reads a submission in the background; show its answer when it lands.
  const reading = records.some((r) => ['queued', 'running'].includes(r.ai_status))
  useEffect(() => {
    if (!reading) return undefined
    const t = setInterval(() => load(true), POLL_MS)
    return () => clearInterval(t)
  }, [reading, load])

  const reload = useCallback(() => { load(true); onChanged?.() }, [load, onChanged])
  const actions = useRecordActions({ orgId, setRecords, reload })
  const review = async (recordId, payload) => {
    if (await actions.review(recordId, payload)) setOpenId(null)
  }

  if (loading && !data) return <p className="text-sm text-gray-500 p-4">Loading…</p>
  if (!data) return null
  const subjects = data.subjects || []
  const { student } = data

  // Still the office's to do: waiting records, and accepted credit that never
  // reached the transcript (the record is decided, the student has nothing).
  const needsReview = (record) => WAITING.includes(record.status)
    || (record.status === 'accepted' && !record.transfer_credit
      && Object.keys(record.awarded_credits || {}).length > 0)
  const open = records.filter(needsReview)
  const done = records.filter((r) => !needsReview(r))

  const setAccredited = async (transferCreditId, accredited) => {
    setSavingAccredited(transferCreditId)
    try {
      await api.put(`/api/sis/prior-learning/transfer-credits/${transferCreditId}/accredited`,
        { accredited, organization_id: orgId || undefined })
      await load(true)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save')
    } finally {
      setSavingAccredited(null)
    }
  }

  const downloadReport = async () => {
    setReporting(true)
    try {
      const res = await api.get(`/api/sis/prior-learning/students/${studentId}/report`,
        { params: { organization_id: orgId || undefined }, responseType: 'blob' })
      const slug = (student.name || 'student').replace(/[^A-Za-z0-9]+/g, '-')
      downloadBlob(res.data, `Optio-credit-report-${slug}.pdf`)
    } catch {
      toast.error('Could not generate the report')
    } finally {
      setReporting(false)
    }
  }

  const card = (record) => {
    const reviewable = record.can_review !== false
    const waiting = WAITING.includes(record.status)
    return (
      <div key={record.id} id={`record-${record.id}`} className="scroll-mt-4">
      <RecordCard record={record} subjects={subjects}
                  showStudent={false} showReview={false}
                  actions={{ ...actions, review }}
                  open={openId === record.id}
                  onToggle={() => setOpenId(openId === record.id ? null : record.id)}>
        {reviewable && waiting && record.overlaps?.length > 0 && <Overlaps items={record.overlaps} />}
        {reviewable && waiting && !record.transfer_credit && (
          <>
            <ApprovePanel record={record} subjects={subjects} busy={actions.busy}
                          pricing={data.pricing}
                          onApprove={(payload) => actions.approve(record.id, payload)} />
            <div className="flex flex-wrap items-start gap-4">
              {record.source === 'family' && (
                <SendBack busy={actions.busy}
                          onSend={(message) => actions.requestInfo(record.id, message)} />
              )}
              <button type="button" onClick={() => setOpenId(openId === record.id ? null : record.id)}
                      className="text-sm font-medium text-gray-700 hover:text-gray-900">
                {openId === record.id ? 'Hide other decisions' : 'Other decisions…'}
              </button>
            </div>
          </>
        )}
        {reviewable && (
          <RecordHistory record={record} onNote={(body) => actions.addNote(record.id, body)} />
        )}
      </RecordCard>
      </div>
    )
  }

  // Layout (Tanner, 2026-10-13): what still needs review at the top, with
  // diploma progress beside it; everything already reviewed below; the
  // transfer credit on the transcript last.
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 font-poppins">{student.name}</h2>
          <p className="text-sm text-gray-500">{(student.schools || []).join(', ')}</p>
        </div>
        <button type="button" onClick={downloadReport} disabled={reporting}
                className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50">
          {reporting ? 'Generating…' : 'Generate report'}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 items-start">
        <section aria-labelledby="needs-review"
                 className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <h3 id="needs-review" className="text-sm font-semibold text-gray-900">
            Needs review{open.length ? ` (${open.length})` : ''}
          </h3>
          {open.length ? (
            <ul className="divide-y divide-gray-100">
              {open.map((r) => {
                const days = r.created_at ? Math.floor((Date.now() - new Date(r.created_at)) / 86400000) : null
                const toTranscript = r.status === 'accepted'
                return (
                  <li key={r.id}>
                    <a href={`#record-${r.id}`} className="flex items-start justify-between gap-3 py-2 group">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 group-hover:text-optio-purple truncate">
                          {r.title}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {toTranscript ? 'Accepted — add to the transcript'
                            : r.ai_suggestion ? 'AI reading ready' : 'Waiting for AI reading'}
                          {r.source === 'staff' ? ' · filed by the office' : ''}
                        </span>
                      </span>
                      {days !== null && (
                        <span className={`text-xs tabular-nums shrink-0 ${days >= 7 ? 'text-red-700 font-medium' : 'text-gray-500'}`}>
                          {days === 0 ? 'today' : `${days}d`}
                        </span>
                      )}
                    </a>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm font-medium text-gray-700">Nothing to review</p>
              <p className="text-xs text-gray-500 mt-1">Every record has a decision.</p>
            </div>
          )}
        </section>
        <DiplomaProgress progress={data.progress} />
      </div>

      {open.length > 0 && (
        <section aria-label="Records to review" className="space-y-3">
          {open.map(card)}
        </section>
      )}

      {done.length > 0 && (
        <section aria-labelledby="reviewed" className="space-y-3">
          <h3 id="reviewed" className="text-sm font-semibold text-gray-900">
            Previously reviewed ({done.length})
          </h3>
          {done.map(card)}
        </section>
      )}

      <TransferCredits rows={data.transfer_credits} cost={data.transfer_cost} subjects={subjects}
                       onAccredited={setAccredited} saving={savingAccredited} />
    </div>
  )
}

export default StudentWorkspace
