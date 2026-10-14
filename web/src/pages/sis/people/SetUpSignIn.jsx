import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'

import Button from '../../../components/ui/Button'
import { INPUT_CLASS } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { sisPeopleApi } from '../../../hooks/api/useSisPeople'
import { sisStudentApi } from '../../../hooks/api/useSisStudentDetail'
import { getLearningOrigin } from '../../../utils/appSurface'
import { printCredentialCards } from '../../../utils/credentialCardsPrinter'
import { downloadCsv, toCsv } from '../../../utils/csv'

/**
 * "Set up sign-in" for a student whose parent manages their profile (ticket
 * cd61587c, Apogee Cache Valley).
 *
 * A child under 13 added through a family has no email and no login; only the
 * parent could give them one, from Family Settings. The school wanted its
 * students signing in without waiting on every family. This gives the profile
 * the same username + "PIN + word" password the office already makes for a
 * new no-email student (AddStudentForm), on the SAME account, so the parent
 * link, the work and the XP stay. No email goes on the child.
 *
 * Two doors: one student from their record (SetUpSignInPanel, in the
 * StudentDetailModal's Account section) and every such student at once from
 * People (BulkSetUpSignInModal), which prints the login cards the org admin
 * page already prints for username students.
 */

/** A managed profile with no sign-in of its own yet. */
export const needsSignIn = (person) => Boolean(
  person && person.is_student !== false && person.is_dependent && !person.username,
)

const loginHref = (path) => `${getLearningOrigin()}${path || '/login'}`

const errorOf = (e, fallback) => e?.response?.data?.error || fallback

export function SetUpSignInPanel({ student, orgId, onDone, onCancel }) {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [credentials, setCredentials] = useState(null)

  useEffect(() => {
    let live = true
    sisStudentApi.suggestSignIn(orgId, student.student_id)
      .then((r) => { if (live) setUsername(r.data?.suggested_username || '') })
      .catch((e) => { if (live) setError(errorOf(e, 'Could not load a username')) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [orgId, student.student_id])

  const submit = async () => {
    if (!username.trim()) { setError('Username is required'); return }
    setSaving(true)
    setError('')
    try {
      const r = await sisStudentApi.setupSignIn(orgId, student.student_id, username.trim())
      setCredentials({ ...r.data, loginUrl: loginHref(r.data.login_url) })
    } catch (e) {
      setError(errorOf(e, 'Could not set up sign-in'))
    } finally {
      setSaving(false)
    }
  }

  const copy = () => {
    navigator.clipboard?.writeText(`Login for ${student.name}\n\nLogin URL: ${credentials.loginUrl}\n`
      + `Username: ${credentials.username}\nPassword: ${credentials.password}`)
    toast.success('Copied')
  }

  if (credentials) {
    return (
      <div className="mt-3 space-y-3 rounded-lg border border-gray-200 p-3" data-testid="sign-in-credentials">
        <p className="text-sm text-neutral-700">
          {student.name} can sign in now.
          {credentials.parent_notified ? ' Their parent got a notice in Optio.' : ''}
        </p>
        <dl className="rounded-lg bg-neutral-50 p-3 space-y-2 text-sm">
          <div><dt className="text-xs text-neutral-500">Login URL</dt><dd className="break-all text-optio-purple">{credentials.loginUrl}</dd></div>
          <div><dt className="text-xs text-neutral-500">Username</dt><dd className="font-mono">{credentials.username}</dd></div>
          <div><dt className="text-xs text-neutral-500">Password</dt><dd className="font-mono">{credentials.password}</dd></div>
        </dl>
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          Copy this now. The password is not shown again, but you can reset it later.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={copy}>Copy all</Button>
          <Button size="sm" onClick={() => onDone?.(credentials)}>Done</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-gray-200 p-3">
      <p className="text-sm text-neutral-600">
        {student.name}&apos;s parent manages this profile. Give them a username and a password
        to sign in with. No email is added, and their parent still manages the account.
      </p>
      <label className="block text-xs text-neutral-500">Username
        <input className={`${INPUT_CLASS} mt-0.5`} value={username} disabled={loading}
          onChange={(e) => setUsername(e.target.value.toLowerCase())} aria-label="Username" />
      </label>
      <p className="text-xs text-neutral-500">The password is made for you and shown once.</p>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={saving || loading}>
          {saving ? 'Setting up…' : 'Create sign-in'}
        </Button>
      </div>
    </div>
  )
}

export function BulkSetUpSignInModal({ rows, orgId, orgName, onClose, onDone }) {
  const [chosen, setChosen] = useState(() => new Set(rows.map((r) => r.student_id)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const toggle = (id) => setChosen((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      const r = await sisPeopleApi.bulkSetupSignIn(orgId, [...chosen])
      setResult({ ...r.data, loginUrl: loginHref(r.data.login_url) })
      onDone?.()
    } catch (e) {
      setError(errorOf(e, 'Could not set up sign-in'))
    } finally {
      setSaving(false)
    }
  }

  const print = () => printCredentialCards({
    credentials: result.results, loginUrl: result.loginUrl, orgName: orgName || 'Your School',
  })

  const saveCsv = () => downloadCsv(
    toCsv(['name', 'username', 'password', 'login_url'],
      result.results.map((r) => [r.name, r.username, r.password, result.loginUrl])),
    'student-sign-ins.csv',
  )

  const nameOf = (id) => rows.find((r) => r.student_id === id)?.name || 'A student'

  return (
    <Modal isOpen onClose={onClose} title="Set up sign-in" size="lg" bodyClassName="overflow-y-auto">
      {result ? (
        <div className="space-y-4 text-sm">
          <p className="text-neutral-700">
            {result.results.length} {result.results.length === 1 ? 'student' : 'students'} can sign in now.
            {result.results.some((r) => r.parent_notified) ? ' Their parents got a notice in Optio.' : ''}
          </p>
          {result.results.length > 0 && (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {result.results.map((r) => (
                <li key={r.user_id} className="px-3 py-2 flex justify-between gap-2">
                  <span>{r.name}</span>
                  <span className="font-mono text-xs">{r.username} / {r.password}</span>
                </li>
              ))}
            </ul>
          )}
          {result.failed?.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900" role="alert">
              Not set up: {result.failed.map((f) => `${nameOf(f.user_id)} (${f.error})`).join('; ')}
            </div>
          )}
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
            Print or download these now. The passwords are not shown again.
          </p>
          <div className="flex justify-end gap-2">
            {result.results.length > 0 && <Button variant="outline" size="sm" onClick={saveCsv}>Download CSV</Button>}
            {result.results.length > 0 && <Button variant="outline" size="sm" onClick={print}>Print login cards</Button>}
            <Button size="sm" onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-neutral-600">
            These students have a profile their parent manages and no sign-in of their own. Each
            one you choose gets a username and a password. No email is added, their parents
            still manage the account, and each parent gets a notice in Optio.
          </p>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 max-h-80 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.student_id} className="px-3 py-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={chosen.has(r.student_id)} onChange={() => toggle(r.student_id)}
                    className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                  <span>{r.name}</span>
                  {r.household_name && <span className="text-xs text-neutral-400">{r.household_name}</span>}
                </label>
              </li>
            ))}
          </ul>
          {error && <p className="text-red-600" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={saving || chosen.size === 0}>
              {saving ? 'Setting up…' : `Set up sign-in for ${chosen.size}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
