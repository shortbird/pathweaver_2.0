import React, { useEffect, useRef, useState } from 'react'
import { XP_PER_CREDIT } from '../../../utils/creditRequirements'
import inputClass from './inputClass'
import transcriptRows from './transcriptRows'
import AccreditedCheckbox from './AccreditedCheckbox'
import { formatCents } from '../../../utils/money'

const round = (n) => Math.round(n * 100) / 100

const rowsFrom = (suggestion) => {
  const rows = transcriptRows(suggestion)
    .filter((r) => Number(r.credits) > 0)
    .map((r) => ({ name: r.name === '—' ? '' : r.name, subject: r.subject, credits: String(r.credits) }))
  return rows.length ? rows : [{ name: '', subject: '', credits: '' }]
}

/**
 * What one approval sends: credit per subject, and course line items for every
 * subject whose rows all carry a name. A subject with an unnamed row goes on
 * the transcript as credit alone -- its named rows would not add up to the
 * subject total, and the backend refuses a transcript that disagrees with
 * itself.
 */
export const awardFromRows = (rows) => {
  const subjectCredits = {}
  const courses = {}
  const unnamed = new Set()
  for (const row of rows) {
    const credits = parseFloat(row.credits)
    if (!row.subject || !Number.isFinite(credits) || credits <= 0) continue
    subjectCredits[row.subject] = round((subjectCredits[row.subject] || 0) + credits)
    if (row.name.trim()) {
      (courses[row.subject] = courses[row.subject] || []).push({ name: row.name.trim(), credits })
    } else {
      unnamed.add(row.subject)
    }
  }
  for (const subject of unnamed) delete courses[subject]
  return { subject_credits: subjectCredits, course_names: courses }
}

/**
 * Approve: accept the record and put it on the transcript in one step.
 *
 * The rows start as the AI's reading and every cell is editable. Nothing is
 * awarded until the reviewer presses Approve with the numbers on screen; the
 * suggestion only saves typing. If the AI reads the record again while the
 * reviewer has not touched the rows, the new reading replaces the old one;
 * once they have edited, their numbers stay.
 */
const usd = (cents) => formatCents(cents, { compact: true })

/**
 * What approving costs, before the reviewer approves. `pricing` is the
 * student's price list from the workspace ({price_list, credit_cents}, from
 * shared/data/pricing.json); the backend stores the same figure on approve
 * (sis_prior_learning_queue.record_fee).
 */
export const feeFor = (pricing, credits, accredited) => (
  accredited || !pricing ? 0 : Math.round(credits * pricing.credit_cents)
)

const ApprovePanel = ({ record, subjects, busy, onApprove, pricing = null }) => {
  const suggestion = record.ai_suggestion
  const [rows, setRows] = useState(() => rowsFrom(suggestion))
  const [school, setSchool] = useState(() => suggestion?.school_name || record.provider || '')
  const [notes, setNotes] = useState('')
  const [accredited, setAccredited] = useState(false)
  const edited = useRef(false)

  useEffect(() => {
    if (edited.current || !suggestion) return
    setRows(rowsFrom(suggestion))
    if (suggestion.school_name) setSchool(suggestion.school_name)
  }, [suggestion])

  const change = (i, key, value) => {
    edited.current = true
    setRows(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)))
  }
  const award = awardFromRows(rows)
  const total = round(Object.values(award.subject_credits).reduce((a, b) => a + b, 0))
  const id = record.id

  return (
    <div className="rounded-lg border border-optio-purple/30 bg-white px-3 py-3 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">Approve and add to transcript</p>
        <p className="text-xs text-gray-500 tabular-nums">
          {total} credit{total === 1 ? '' : 's'} · {Math.round(total * XP_PER_CREDIT)} XP
        </p>
      </div>
      {!suggestion && (
        <p className="text-xs text-gray-500">
          No AI reading yet. Enter the credit by hand, or press Read with AI above.
        </p>
      )}

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <input aria-label={`Course ${i + 1} name`} placeholder="Course name (optional)"
                   className={`${inputClass} sm:flex-1`} value={row.name}
                   onChange={(e) => change(i, 'name', e.target.value)} />
            <select aria-label={`Course ${i + 1} subject`} value={row.subject}
                    onChange={(e) => change(i, 'subject', e.target.value)}
                    className="rounded-lg border border-gray-300 px-2 py-2 text-sm">
              <option value="">Subject…</option>
              {subjects.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
            <input aria-label={`Course ${i + 1} credits`} type="number" min="0" step="0.25"
                   placeholder="0" value={row.credits}
                   onChange={(e) => change(i, 'credits', e.target.value)}
                   className="w-20 rounded-lg border border-gray-300 px-2 py-2 text-sm" />
            <button type="button" aria-label={`Remove course ${i + 1}`}
                    onClick={() => { edited.current = true; setRows(rows.filter((_, j) => j !== i)) }}
                    className="text-sm text-gray-400 hover:text-red-600 px-1">×</button>
          </div>
        ))}
        <button type="button" className="text-sm text-optio-purple font-medium"
                onClick={() => { edited.current = true; setRows([...rows, { name: '', subject: '', credits: '' }]) }}>
          + Add a course
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`approve-school-${id}`}>
            School this credit came from
          </label>
          <input id={`approve-school-${id}`} className={inputClass} value={school}
                 onChange={(e) => setSchool(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`approve-notes-${id}`}>
            Note for the family (optional)
          </label>
          <input id={`approve-notes-${id}`} className={inputClass} value={notes}
                 onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <AccreditedCheckbox id={`approve-accredited-${id}`} checked={accredited} onChange={setAccredited} />
      {/* OpenEd families buy through OpenEd, which pays Optio; the platform
          never shows them a price (Tanner, 2026-10-13). */}
      {pricing?.price_list === 'opened' && (
        <p className="text-xs text-gray-600">Purchased through OpenEd. No fee is charged here.</p>
      )}
      {pricing && pricing.price_list !== 'opened' && (
        <p className="text-xs text-gray-600 tabular-nums">
          Fee: <span className="font-semibold text-gray-900">{usd(feeFor(pricing, total, accredited))}</span>
          {!accredited && total > 0 && (
            <> ({total} × {usd(pricing.credit_cents)},{' '}
              {pricing.price_list === 'licensed' ? 'licensed school price' : 'Optio Academy price'})</>
          )}
        </p>
      )}

      <button type="button" disabled={busy || !school.trim() || total <= 0}
              onClick={() => onApprove({
                school_name: school.trim(),
                ...award,
                source_accredited: accredited,
                review_notes: notes.trim() || undefined,
              })}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-primary disabled:opacity-50">
        Approve {total > 0 ? `${total} credit${total === 1 ? '' : 's'}` : ''}
      </button>
    </div>
  )
}

export default ApprovePanel
