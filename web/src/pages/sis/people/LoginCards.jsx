import React, { useMemo, useState } from 'react'

import Button from '../../../components/ui/Button'
import { INPUT_CLASS } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { sisPeopleApi } from '../../../hooks/api/useSisPeople'
import { getLearningOrigin } from '../../../utils/appSurface'
import { printCredentialCards } from '../../../utils/credentialCardsPrinter'
import { downloadCsv, toCsv } from '../../../utils/csv'

/**
 * Login cards for students who sign in with a username, in the SIS console
 * (2026-10-15). Two doors, both from the web organization console that went
 * away when every org became an SIS org:
 *
 *   ReprintLoginCardsModal  People > "Login cards": new passwords for the
 *                           username students you choose, then print.
 *   BulkUsernamesForm       + Add > "Many students, no email": paste a list of
 *                           names, get an account and a card for each.
 *
 * The login address is the LEARNING app's (getLearningOrigin), never this
 * page's. The console built it from window.location.origin, which on
 * sis.optioeducation.com is a host with no /login/<slug>, so every card
 * printed from the SIS console sent the child to the wrong place (the same
 * bug SchoolLoginLinkCard fixed on 2026-10-06).
 */

export const schoolLoginUrl = (slug) => `${getLearningOrigin()}/login${slug ? `/${slug}` : ''}`

/** A student who signs in with a username and has no email to reset by. */
export const hasUsernameSignIn = (r) => Boolean(r && r.is_student && r.username && !r.email)

const errorOf = (e, fallback) => {
  const d = e?.response?.data
  const msg = d?.error || d?.message
  return typeof msg === 'string' ? msg : fallback
}

/** The one-time moment: the passwords exist only on this screen. */
function CredentialResults({ results, failedNote, loginUrl, orgName, onDone, doneLabel = 'Done' }) {
  const print = () => printCredentialCards({ credentials: results, loginUrl, orgName: orgName || 'Your School' })
  const saveCsv = () => downloadCsv(
    toCsv(['name', 'username', 'password', 'login_url'], results.map((r) => [r.name, r.username, r.password, loginUrl])),
    'student-login-cards.csv',
  )
  return (
    <div className="space-y-4 text-sm" data-testid="login-card-results">
      {results.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 max-h-80 overflow-y-auto">
          {results.map((r) => (
            <li key={r.user_id || r.username} className="px-3 py-2 flex justify-between gap-2">
              <span>{r.name}</span>
              <span className="font-mono text-xs">{r.username} / {r.password}</span>
            </li>
          ))}
        </ul>
      )}
      {failedNote && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900" role="alert">{failedNote}</div>
      )}
      <p className="text-xs text-neutral-500">
        Students sign in at <span className="font-mono break-all">{loginUrl}</span>
      </p>
      {results.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          Print or download these now. The passwords are not shown again.
        </p>
      )}
      <div className="flex justify-end gap-2">
        {results.length > 0 && <Button variant="outline" size="sm" onClick={saveCsv}>Download CSV</Button>}
        {results.length > 0 && <Button variant="outline" size="sm" onClick={print}>Print login cards</Button>}
        <Button size="sm" onClick={onDone}>{doneLabel}</Button>
      </div>
    </div>
  )
}

export function ReprintLoginCardsModal({ rows, orgId, orgName, orgSlug, onClose }) {
  const [chosen, setChosen] = useState(() => new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const loginUrl = schoolLoginUrl(orgSlug)

  const toggle = (id) => setChosen((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const allChosen = chosen.size === rows.length && rows.length > 0
  const toggleAll = () => setChosen(allChosen ? new Set() : new Set(rows.map((r) => r.student_id)))

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      const ids = [...chosen]
      const r = await sisPeopleApi.reprintLoginCards(orgId, ids)
      const results = r.data?.results || []
      // The server resets only username accounts in this org; anyone else
      // it skipped silently, so say who, not just how many.
      const answered = new Set([...results, ...(r.data?.failed || [])].map((x) => x.user_id))
      const nameOf = (id) => rows.find((x) => x.student_id === id)?.name || 'A student'
      const notReset = [
        ...(r.data?.failed || []).map((f) => f.name || nameOf(f.user_id)),
        ...ids.filter((id) => !answered.has(id)).map(nameOf),
      ]
      setResult({ results, notReset })
    } catch (e) {
      setError(errorOf(e, 'Could not make new passwords'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Print login cards" size="lg" bodyClassName="overflow-y-auto">
      {result ? (
        <CredentialResults results={result.results} loginUrl={loginUrl} orgName={orgName} onDone={onClose}
          failedNote={result.notReset.length
            ? `No new password for: ${result.notReset.join(', ')}. Their old password still works.` : ''} />
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-neutral-600">
            For students who sign in with a username. Optio cannot show a password again after it is
            made, so a card needs a <strong>new password</strong>. The old password of each student you
            choose stops working.
          </p>
          {rows.length === 0 ? (
            <p className="text-neutral-400">No student signs in with a username yet.</p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-neutral-600">
                <input type="checkbox" checked={allChosen} onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                Choose all ({rows.length})
              </label>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 max-h-80 overflow-y-auto">
                {rows.map((r) => (
                  <li key={r.student_id} className="px-3 py-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={chosen.has(r.student_id)} onChange={() => toggle(r.student_id)}
                        className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                      <span>{r.name}</span>
                      <span className="text-xs font-mono text-neutral-400">{r.username}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          {error && <p className="text-red-600" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={saving || chosen.size === 0}>
              {saving ? 'Making passwords…' : `New passwords for ${chosen.size}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** "First Last" per line. A comma or tab between the names works too. */
export const parseNames = (text) => (text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
  const parts = line.split(/[\s,\t]+/).filter(Boolean)
  return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') }
})

export function BulkUsernamesForm({ orgId, orgName, onBack, onDone, onCreated }) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rowErrors, setRowErrors] = useState([])
  const [result, setResult] = useState(null)
  const students = useMemo(() => parseNames(text), [text])

  const submit = async () => {
    setError('')
    setRowErrors([])
    const missing = students.findIndex((s) => !s.last_name)
    if (missing !== -1) { setError(`Line ${missing + 1} needs a first and a last name.`); return }
    if (students.length > 100) { setError('Up to 100 students at a time. Split the list.'); return }
    setSaving(true)
    try {
      const r = await sisPeopleApi.bulkCreateUsernames(orgId, students)
      const rows = r.data?.results || []
      setResult({
        created: rows.filter((x) => x.status === 'created'),
        failed: rows.filter((x) => x.status !== 'created'),
        slug: r.data?.organization_slug,
      })
      onCreated?.()
    } catch (e) {
      const d = e?.response?.data
      if (d?.validation_errors) {
        setRowErrors(d.validation_errors)
        setError('Fix these lines first. No account was made.')
      } else {
        setError(errorOf(e, 'Could not make the accounts'))
      }
    } finally {
      setSaving(false)
    }
  }

  if (result) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-700">
          {result.created.length} {result.created.length === 1 ? 'student' : 'students'} can sign in now.
        </p>
        <CredentialResults results={result.created} loginUrl={schoolLoginUrl(result.slug)} orgName={orgName}
          onDone={onDone}
          failedNote={result.failed.length
            ? `Not made: ${result.failed.map((f) => `${f.name} (${f.error})`).join('; ')}` : ''} />
      </div>
    )
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-neutral-600">
        Paste your class list, one student per line, first name then last name. Each student gets a
        username and a password to sign in with. No email is needed.
      </p>
      <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} aria-label="Student names"
        placeholder={'Maya Jones\nLiam Smith\nOlivia Nguyen'} className={`${INPUT_CLASS} font-mono`} />
      <p className="text-xs text-neutral-500">
        {students.length
          ? `${students.length} student${students.length === 1 ? '' : 's'} ready.`
          : 'Passwords are a number and a word, like "1234apple".'}
      </p>
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700" role="alert">
          {error}
          {rowErrors.length > 0 && (
            <ul className="mt-1 list-disc list-inside">
              {rowErrors.map((v) => <li key={v.row}>Line {v.row} ({v.name}): {(v.errors || []).join(', ')}</li>)}
            </ul>
          )}
        </div>
      )}
      <div className="flex justify-between gap-2">
        <button type="button" onClick={onBack} className="text-sm text-neutral-500 hover:underline">Back</button>
        <Button size="sm" onClick={submit} disabled={saving || !students.length}>
          {saving ? 'Making accounts…' : `Make ${students.length || ''} account${students.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}
