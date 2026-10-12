import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { AuthContext } from '../../../contexts/AuthContext'
import { useConfirm } from '../../../contexts/ConfirmContext'
import {
  getBroadcastVariables,
  getSchoolSheet,
  previewBroadcast,
  sendTestBroadcast,
  sendBroadcast,
  getBroadcast,
} from './crmApi'
import { columnKey, isReservedKey, nextMonth, rowAmount, computeAmount, sheetPayload, schoolsOf } from './broadcastRules'

const DRAFT_KEY = 'optio.crm.broadcastDraft'

const inputClass =
  'w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-optio-purple text-base'
const cellInput =
  'w-full px-2 py-1.5 min-h-[40px] border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-optio-purple text-sm'
const primaryButton =
  'px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]'
const secondaryButton =
  'px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]'

const GROUP_LABEL = { person: 'Person', family: 'Family', school: 'School billing', custom: 'Your columns' }

const STARTER_BODY = `Hi {{first_name}},

Here is what {{school}} will be billed for {{billing_month}}.

Students: {{student_count}}
Price per student: {{price_per_student}}
Total: {{amount_due}}

{{billing_note}}

Let me know if anything looks off.

Tanner`

const loadDraft = () => {
  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null') || {}
  } catch {
    return {}
  }
}

const saveDraft = (draft) => {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // A blocked store only loses the convenience; the page works without it.
  }
}

const errorText = (error, fallback) => error.response?.data?.error || fallback

/**
 * Mail merge: one email, one personal copy per person on the list.
 *
 * The subject and body take {{variables}}; the billing sheet holds one row per
 * school on the list (live student count, price, amount, note, plus any
 * column you add, each its own variable). The preview is the server's render
 * for one real person at a time, so what you see is what they get. Sending
 * asks you to confirm the count, and the server refuses if the list has moved
 * since.
 */
const BroadcastComposer = ({ recipients, orgName, list, initial, onClose, onSent }) => {
  const confirm = useConfirm()
  const auth = useContext(AuthContext)
  const me = auth?.user
  const saved = useMemo(() => (initial ? {} : loadDraft()), [initial])
  const seed = initial || saved

  const [subject, setSubject] = useState(seed.subject ?? 'Your {{billing_month}} bill from Optio')
  const [body, setBody] = useState(seed.body ?? STARTER_BODY)
  const [senderName, setSenderName] = useState(
    seed.sender_name ?? [me?.first_name, me?.last_name].filter(Boolean).join(' ')
  )
  const [replyTo, setReplyTo] = useState(seed.reply_to ?? me?.email ?? '')
  const [month, setMonth] = useState(seed.sheet?.month || nextMonth())
  const [columns, setColumns] = useState(seed.sheet?.columns || [])
  const [defaultPrice, setDefaultPrice] = useState(saved.defaultPrice ?? '')
  const [rows, setRows] = useState({})
  const [rosters, setRosters] = useState({})
  const [newColumn, setNewColumn] = useState('')
  const [variables, setVariables] = useState([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [preview, setPreview] = useState(null)
  const [summary, setSummary] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const bodyRef = useRef(null)
  const subjectRef = useRef(null)
  const lastField = useRef('body')

  const schools = useMemo(() => schoolsOf(recipients, orgName), [recipients, orgName])

  useEffect(() => {
    getBroadcastVariables()
      .then((r) => setVariables(r.data.variables || []))
      .catch(() => toast.error('Could not load the variables'))
  }, [])

  // Start each school's row from its live roster, keeping anything typed.
  useEffect(() => {
    if (!schools.length) return
    let cancelled = false
    getSchoolSheet(schools)
      .then((r) => {
        if (cancelled) return
        const live = r.data.schools || {}
        setRosters(live)
        setRows((current) => {
          const seeded = initial?.sheet?.schools || {}
          const next = {}
          schools.forEach((orgId) => {
            const old = current[orgId] || seeded[orgId]
            next[orgId] = old
              ? { ...old, amount_edited: old.amount_edited ?? Boolean(seeded[orgId]?.amount_due) }
              : {
                  student_count: String(live[orgId]?.student_count ?? ''),
                  price_per_student: defaultPrice,
                  amount_due: '',
                  amount_edited: false,
                  billing_note: '',
                }
          })
          return next
        })
      })
      .catch(() => toast.error('Could not load the school rosters'))
    return () => {
      cancelled = true
    }
    // defaultPrice is read only to seed new rows, so it is not a dependency.
  }, [schools, initial])

  const draft = useMemo(
    () => ({
      subject,
      body,
      sender_name: senderName,
      reply_to: replyTo,
      recipient_ids: recipients.map((p) => p.id),
      include_suppressed: Boolean(list?.filters?.include_suppressed),
      sheet: sheetPayload({ month, columns, rows }),
    }),
    [subject, body, senderName, replyTo, recipients, list, month, columns, rows]
  )

  useEffect(() => {
    if (!initial) saveDraft({ subject, body, sender_name: senderName, reply_to: replyTo, sheet: { month, columns }, defaultPrice })
  }, [initial, subject, body, senderName, replyTo, month, columns, defaultPrice])

  const person = recipients[Math.min(previewIndex, recipients.length - 1)]

  // The server's render for one real person, refreshed as you type.
  useEffect(() => {
    if (!person || !subject.trim() || !body.trim()) return undefined
    const timer = setTimeout(() => {
      previewBroadcast({ ...draft, person_id: person.id })
        .then((r) => {
          setPreview(r.data.preview)
          setSummary(r.data.summary)
          setPreviewError(null)
        })
        .catch((error) => setPreviewError(errorText(error, 'Could not build the preview')))
    }, 500)
    return () => clearTimeout(timer)
  }, [draft, person, subject, body])

  const setRow = (orgId, patch) => setRows((r) => ({ ...r, [orgId]: { ...r[orgId], ...patch } }))

  const applyPriceToAll = () =>
    setRows((r) =>
      Object.fromEntries(Object.entries(r).map(([id, row]) => [id, { ...row, price_per_student: defaultPrice }]))
    )

  const addColumn = () => {
    const key = columnKey(newColumn)
    if (!key) return toast.error('Use letters in the column name')
    if (isReservedKey(key) || columns.some((c) => c.key === key)) return toast.error(`{{${key}}} already exists`)
    setColumns((c) => [...c, { key, label: newColumn.trim() }])
    setNewColumn('')
  }

  const insertToken = (token) => {
    const isSubject = lastField.current === 'subject'
    const el = isSubject ? subjectRef.current : bodyRef.current
    const value = isSubject ? subject : body
    const set = isSubject ? setSubject : setBody
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    set(value.slice(0, start) + token + value.slice(end))
    setTimeout(() => {
      if (!el) return
      el.focus()
      el.selectionStart = el.selectionEnd = start + token.length
    }, 0)
  }

  const chips = useMemo(() => {
    const all = [
      ...variables,
      ...columns.map((c) => ({ name: c.key, token: `{{${c.key}}}`, label: c.label, group: 'custom' })),
    ]
    return Object.entries(GROUP_LABEL)
      .map(([group, label]) => ({ group, label, items: all.filter((v) => v.group === group) }))
      .filter((g) => g.items.length)
  }, [variables, columns])

  const sendTest = async () => {
    setBusy(true)
    try {
      const r = await sendTestBroadcast({ ...draft, person_id: person?.id })
      toast.success(`Test sent to ${r.data.sent_to}, filled in as ${person?.name}`)
    } catch (error) {
      toast.error(errorText(error, 'The test did not send'))
    } finally {
      setBusy(false)
    }
  }

  const poll = (id) => {
    getBroadcast(id)
      .then((r) => {
        setProgress(r.data)
        if (r.data.broadcast.status === 'sending') setTimeout(() => poll(id), 2000)
        else onSent?.(r.data.broadcast)
      })
      .catch(() => setTimeout(() => poll(id), 4000))
  }

  const send = async () => {
    const count = summary?.sendable || 0
    if (!count) return
    const ok = await confirm({
      title: `Send to ${count} ${count === 1 ? 'person' : 'people'}?`,
      body: 'Each person gets their own copy now. You cannot unsend it.',
      confirmLabel: `Send ${count}`,
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await sendBroadcast({ ...draft, expected_count: count, list_id: list?.id || null, list_name: list?.name || '' })
      if (!initial) saveDraft({})
      setProgress({ broadcast: r.data.broadcast, recipients: [] })
      poll(r.data.broadcast.id)
    } catch (error) {
      toast.error(errorText(error, 'The email did not send'))
    } finally {
      setBusy(false)
    }
  }

  if (progress) {
    const b = progress.broadcast
    const failed = (progress.recipients || []).filter((r) => r.status === 'failed')
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="text-xl font-semibold">{b.status === 'sending' ? 'Sending...' : 'Sent'}</h3>
        <p className="text-sm text-gray-700">
          {b.sent_count} sent, {b.failed_count} failed, {b.skipped_count} skipped.
        </p>
        {failed.length > 0 && (
          <p className="text-sm text-red-700">Did not send: {failed.map((r) => r.email).join(', ')}</p>
        )}
        <button type="button" onClick={onClose} className={secondaryButton}>
          Back to the list
        </button>
      </div>
    )
  }

  const sendable = summary?.sendable ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold">Write an email</h2>
          <p className="text-sm text-gray-500">
            To {recipients.length} {recipients.length === 1 ? 'person' : 'people'}
            {list?.name ? ` on "${list.name}"` : ''}. Each person gets their own copy, filled in for them.
          </p>
        </div>
        <button type="button" onClick={onClose} className={secondaryButton}>
          Back to the list
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="bc-from" className="block text-sm font-medium text-gray-700 mb-1">
              From name
            </label>
            <input id="bc-from" value={senderName} onChange={(e) => setSenderName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="bc-reply" className="block text-sm font-medium text-gray-700 mb-1">
              Replies go to
            </label>
            <input id="bc-reply" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label htmlFor="bc-subject" className="block text-sm font-medium text-gray-700 mb-1">
            Subject
          </label>
          <input
            id="bc-subject"
            ref={subjectRef}
            value={subject}
            onFocus={() => (lastField.current = 'subject')}
            onChange={(e) => setSubject(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          {chips.map((g) => (
            <div key={g.group} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500 w-28 flex-shrink-0">{g.label}</span>
              {g.items.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => insertToken(v.token)}
                  title={v.label}
                  className="px-2 py-1 text-xs font-mono rounded-md bg-optio-purple/10 text-optio-purple hover:bg-optio-purple/20"
                >
                  {v.token}
                </button>
              ))}
            </div>
          ))}
          <p className="text-xs text-gray-500">A variable goes where your cursor was, in the subject or the email.</p>
        </div>
        <div>
          <label htmlFor="bc-body" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <textarea
            id="bc-body"
            ref={bodyRef}
            value={body}
            onFocus={() => (lastField.current = 'body')}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            className={`${inputClass} font-sans`}
          />
          <p className="text-xs text-gray-500 mt-1">Plain text. A blank line starts a new paragraph. Links become clickable.</p>
        </div>
      </div>

      {schools.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Billing sheet</h3>
            <p className="text-sm text-gray-500">
              One row per school on the list. The student count starts from the live roster. Amount is students times
              price until you type over it. The admins of each school see their own row.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div>
              <label htmlFor="bc-month" className="block text-sm font-medium text-gray-700 mb-1">
                Billing month
              </label>
              <input id="bc-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="bc-price" className="block text-sm font-medium text-gray-700 mb-1">
                Price per student
              </label>
              <input
                id="bc-price"
                inputMode="decimal"
                value={defaultPrice}
                onChange={(e) => setDefaultPrice(e.target.value)}
                placeholder="25"
                className={inputClass}
              />
            </div>
            <button type="button" onClick={applyPriceToAll} className={secondaryButton}>
              Use for every school
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2">School</th>
                  <th className="px-2 py-2 w-24">Students</th>
                  <th className="px-2 py-2 w-28">Price</th>
                  <th className="px-2 py-2 w-32">Amount</th>
                  <th className="px-2 py-2">Note</th>
                  {columns.map((c) => (
                    <th key={c.key} className="px-2 py-2">
                      <span className="normal-case font-mono">{`{{${c.key}}}`}</span>{' '}
                      <button
                        type="button"
                        onClick={() => setColumns((cs) => cs.filter((x) => x.key !== c.key))}
                        aria-label={`Remove column ${c.label}`}
                        className="text-gray-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {schools.map((orgId) => {
                  const row = rows[orgId]
                  if (!row) return null
                  const live = rosters[orgId]
                  const auto = computeAmount(row.student_count, row.price_per_student)
                  return (
                    <tr key={orgId} className="align-top">
                      <td className="px-3 py-2 text-sm">
                        <div className="font-medium text-gray-900">{orgName[orgId] || 'Unknown school'}</div>
                        {live && (
                          <details className="text-xs text-gray-500">
                            <summary className="cursor-pointer">{live.student_count} on the roster</summary>
                            <p className="mt-1">{live.students.join(', ') || 'No students'}</p>
                          </details>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          aria-label={`Students at ${orgName[orgId]}`}
                          inputMode="numeric"
                          value={row.student_count}
                          onChange={(e) => setRow(orgId, { student_count: e.target.value })}
                          className={cellInput}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          aria-label={`Price at ${orgName[orgId]}`}
                          inputMode="decimal"
                          value={row.price_per_student}
                          onChange={(e) => setRow(orgId, { price_per_student: e.target.value })}
                          className={cellInput}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          aria-label={`Amount at ${orgName[orgId]}`}
                          inputMode="decimal"
                          value={rowAmount(row)}
                          onChange={(e) => setRow(orgId, { amount_due: e.target.value, amount_edited: true })}
                          className={cellInput}
                        />
                        {row.amount_edited && (
                          <button
                            type="button"
                            onClick={() => setRow(orgId, { amount_edited: false })}
                            className="text-xs text-optio-purple hover:underline mt-1"
                          >
                            Use {auto || 'students x price'}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          aria-label={`Note for ${orgName[orgId]}`}
                          value={row.billing_note}
                          onChange={(e) => setRow(orgId, { billing_note: e.target.value })}
                          className={cellInput}
                        />
                      </td>
                      {columns.map((c) => (
                        <td key={c.key} className="px-2 py-2">
                          <input
                            aria-label={`${c.label} for ${orgName[orgId]}`}
                            value={row[c.key] || ''}
                            onChange={(e) => setRow(orgId, { [c.key]: e.target.value })}
                            className={cellInput}
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <label htmlFor="bc-newcol" className="sr-only">
              New column name
            </label>
            <input
              id="bc-newcol"
              value={newColumn}
              onChange={(e) => setNewColumn(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addColumn()}
              placeholder="Add a column, e.g. Due date"
              className={`${inputClass} sm:max-w-xs`}
            />
            <button type="button" onClick={addColumn} className={secondaryButton}>
              Add column
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <h3 className="text-lg font-semibold flex-1">Preview</h3>
          {recipients.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                disabled={previewIndex === 0}
                className={secondaryButton}
                aria-label="Previous person"
              >
                ‹
              </button>
              <label htmlFor="bc-person" className="sr-only">
                Preview as
              </label>
              <select
                id="bc-person"
                value={person?.id || ''}
                onChange={(e) => setPreviewIndex(recipients.findIndex((p) => p.id === e.target.value))}
                className={`${inputClass} sm:w-72`}
              >
                {recipients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.email})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setPreviewIndex((i) => Math.min(recipients.length - 1, i + 1))}
                disabled={previewIndex >= recipients.length - 1}
                className={secondaryButton}
                aria-label="Next person"
              >
                ›
              </button>
            </div>
          )}
        </div>
        {previewError && <p className="text-sm text-red-700">{previewError}</p>}
        {preview && (
          <>
            <div className="text-sm space-y-1">
              <p>
                <span className="text-gray-500">To:</span> {preview.to}
              </p>
              <p>
                <span className="text-gray-500">Subject:</span> <span className="font-medium">{preview.subject}</span>
              </p>
            </div>
            {preview.unknown.length > 0 && (
              <p className="text-sm text-red-700">
                Not a variable: {preview.unknown.map((t) => `{{${t}}}`).join(', ')}. It will be sent as typed.
              </p>
            )}
            {preview.blank.length > 0 && (
              <p className="text-sm text-amber-700">
                Blank for this person: {preview.blank.map((t) => `{{${t}}}`).join(', ')}
              </p>
            )}
            <iframe
              sandbox=""
              srcDoc={preview.html}
              title="Email preview"
              className="w-full min-h-[420px] border border-gray-200 rounded-lg bg-white"
            />
          </>
        )}
        {summary && (
          <div className="text-sm space-y-1">
            {summary.blank.map((b) => (
              <p key={b.variable} className="text-amber-700">
                {`{{${b.variable}}}`} is blank for {b.count} {b.count === 1 ? 'person' : 'people'}: {b.names.join(', ')}
                {b.count > b.names.length ? ' and more' : ''}
              </p>
            ))}
            {summary.skipped.length > 0 && (
              <p className="text-gray-500">
                Skipped: {summary.skipped.map((s) => `${s.name} (${s.reason.toLowerCase()})`).join(', ')}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="flex-1 text-sm text-gray-700">
          {summary ? `${sendable} ${sendable === 1 ? 'person' : 'people'} will get this.` : 'Building the preview...'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={sendTest} disabled={busy || !preview} className={secondaryButton}>
            Send me a test
          </button>
          <button type="button" onClick={send} disabled={busy || !sendable} className={primaryButton}>
            Send to {sendable}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BroadcastComposer
