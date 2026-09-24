import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../ui'
import SearchSelect from '../../ui/SearchSelect'
import { INPUT_CLASS as field } from '../../ui/Input'
import api from '../../../services/api'
import { withOrg } from '../../../pages/sis/useSisOrg'

/**
 * Report an incident -- any staff member, teachers included.
 *
 * Katrine Myers (iCreate), 2026-09-24, ticket a26d9daf: "Reporting an
 * incident used to be in task manager. I don't see it there anymore. Cameron
 * Stobbe is the second child to get his finger smashed in the big glass
 * doors. I need to get that in an incident report."
 *
 * Filing writes one task for the office person picked here (the school's
 * default from Settings, if it has one): the answers become labelled lines in
 * its description, and they get the usual new-task notice
 * (services/sis_incident_report_service.py). The reporter is recorded by the
 * server, never sent.
 */

const pad = (n) => String(n).padStart(2, '0')

/** Now, as an <input type=datetime-local> value in the viewer's own clock. */
export const localNow = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

const Label = ({ children, required = false }) => (
  <span className="block text-xs font-medium text-neutral-600 mb-1">
    {children}{required && <span className="text-red-600"> *</span>}
  </span>
)

const FieldError = ({ children }) => (children ? <span role="alert" className="block text-xs text-red-600 mt-1">{children}</span> : null)

/** Mounted only while open, so every report starts from a clean form. */
export default function IncidentReportModal({ isOpen, ...props }) {
  return isOpen ? <IncidentReportDialog {...props} /> : null
}

function IncidentReportDialog({ orgId, onClose, onFiled }) {
  const [options, setOptions] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [studentIds, setStudentIds] = useState([])
  const [occurredAt, setOccurredAt] = useState(() => localNow())
  const [location, setLocation] = useState('')
  const [whatHappened, setWhatHappened] = useState('')
  const [injury, setInjury] = useState('')
  const [response, setResponse] = useState('')
  const [parentNotified, setParentNotified] = useState('')
  const [parentDetail, setParentDetail] = useState('')
  const [witnesses, setWitnesses] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState('')
  const [filed, setFiled] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.get(withOrg('/api/sis/incident-reports/options', orgId))
      .then((r) => {
        if (cancelled) return
        const data = r.data || {}
        setOptions({ recipients: data.recipients || [], students: data.students || [] })
        if (data.default_recipient_id) setRecipientId(data.default_recipient_id)
      })
      .catch(() => { if (!cancelled) setLoadError('Could not load the form. Try again in a moment.') })
    return () => { cancelled = true }
  }, [orgId])

  const studentsById = useMemo(
    () => Object.fromEntries((options?.students || []).map((s) => [s.id, s])), [options])
  const pickable = useMemo(
    () => (options?.students || []).filter((s) => !studentIds.includes(s.id)), [options, studentIds])

  const errors = {
    whatHappened: whatHappened.trim() ? '' : 'Say what happened.',
    occurredAt: occurredAt ? '' : 'Give the date and time it happened.',
    recipientId: recipientId ? '' : 'Choose who in the office gets this report.',
  }
  const invalid = Object.values(errors).some(Boolean)

  const submit = async () => {
    setTried(true)
    setServerError('')
    if (invalid) return
    setBusy(true)
    try {
      const r = await api.post('/api/sis/incident-reports', {
        organization_id: orgId,
        student_ids: studentIds,
        occurred_at: occurredAt,
        location: location.trim(),
        what_happened: whatHappened.trim(),
        injury: injury.trim(),
        response: response.trim(),
        parent_notified: parentNotified,
        parent_notified_detail: parentDetail.trim(),
        witnesses: witnesses.trim(),
        recipient_id: recipientId,
      })
      const result = { task: r.data?.task, recipientName: r.data?.recipient_name }
      setFiled(result)
      onFiled?.(result)
    } catch (err) {
      setServerError(err?.response?.data?.error || 'Could not file the report')
    } finally {
      setBusy(false)
    }
  }

  const footer = filed ? (
    <div className="flex justify-end">
      <button type="button" onClick={onClose}
        className="px-4 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold">Done</button>
    </div>
  ) : (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onClose}
        className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">Cancel</button>
      <button type="button" onClick={submit} disabled={busy || !options}
        className="px-4 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
        {busy ? 'Filing…' : 'File report'}
      </button>
    </div>
  )

  return (
    <Modal isOpen onClose={onClose} title="Report an incident" size="lg" footer={footer}>
      {filed ? (
        <div className="space-y-2" data-testid="incident-filed">
          <p className="text-sm font-semibold text-neutral-900">Report filed.</p>
          <p className="text-sm text-neutral-700">
            It is on {filed.recipientName || 'the office'}&apos;s task list as
            {' '}&quot;{filed.task?.title || 'Incident report'}&quot;, and they have been notified.
          </p>
          <p className="text-sm text-neutral-700">
            You can find it again under{' '}
            <Link to="/tasks" onClick={onClose} className="text-optio-purple hover:underline">
              Incident reports you filed
            </Link>{' '}on the Tasks page.
          </p>
        </div>
      ) : loadError ? (
        <p className="text-sm text-red-600">{loadError}</p>
      ) : !options ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <Label>Student(s) involved</Label>
            {studentIds.length > 0 && (
              <ul className="flex flex-wrap gap-2 mb-2" aria-label="Students on this report">
                {studentIds.map((id) => (
                  <li key={id} className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 px-3 py-1 text-sm text-optio-purple">
                    {studentsById[id]?.name || 'Student'}
                    <button type="button" aria-label={`Remove ${studentsById[id]?.name || 'student'}`}
                      onClick={() => setStudentIds((prev) => prev.filter((s) => s !== id))}
                      className="ml-1 text-optio-purple/70 hover:text-optio-purple">&times;</button>
                  </li>
                ))}
              </ul>
            )}
            <SearchSelect value="" options={pickable}
              onChange={(id) => { if (id) setStudentIds((prev) => (prev.includes(id) ? prev : [...prev, id])) }}
              getId={(s) => s.id} getLabel={(s) => s.name} placeholder="Find a student" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <Label required>When it happened</Label>
              <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)}
                aria-label="When it happened" className={field} />
              <FieldError>{tried && errors.occurredAt}</FieldError>
            </label>
            <label className="block">
              <Label>Where</Label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300}
                aria-label="Where" placeholder="For example, the front glass doors" className={field} />
            </label>
          </div>

          <label className="block">
            <Label required>What happened</Label>
            <textarea value={whatHappened} onChange={(e) => setWhatHappened(e.target.value)} rows={4}
              maxLength={5000} aria-label="What happened" className={field} />
            <FieldError>{tried && errors.whatHappened}</FieldError>
          </label>

          <label className="block">
            <Label>Injury or body part (if any)</Label>
            <input value={injury} onChange={(e) => setInjury(e.target.value)} maxLength={1000}
              aria-label="Injury or body part" className={field} />
          </label>

          <label className="block">
            <Label>First aid or response given</Label>
            <textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={2}
              maxLength={2000} aria-label="First aid or response given" className={field} />
          </label>

          <fieldset>
            <legend className="text-xs font-medium text-neutral-600 mb-1">Was a parent or guardian notified?</legend>
            <div className="flex items-center gap-4 text-sm text-neutral-700 mb-2">
              {[['yes', 'Yes'], ['no', 'No']].map(([value, label]) => (
                <label key={value} className="inline-flex items-center gap-1.5">
                  <input type="radio" name="parent-notified" checked={parentNotified === value}
                    onChange={() => setParentNotified(value)} />
                  {label}
                </label>
              ))}
            </div>
            <input value={parentDetail} onChange={(e) => setParentDetail(e.target.value)} maxLength={1000}
              aria-label="How and when the parent was notified"
              placeholder={parentNotified === 'no' ? 'Why not, or who will' : 'How and when'} className={field} />
          </fieldset>

          <label className="block">
            <Label>Witnesses</Label>
            <input value={witnesses} onChange={(e) => setWitnesses(e.target.value)} maxLength={1000}
              aria-label="Witnesses" className={field} />
          </label>

          <div>
            <Label required>Send to</Label>
            {options.recipients.length ? (
              <SearchSelect value={recipientId} onChange={setRecipientId} options={options.recipients}
                getId={(p) => p.id}
                getLabel={(p) => ((p.role_labels || []).length ? `${p.name} (${p.role_labels.join(', ')})` : p.name)}
                placeholder="Search the office staff" />
            ) : (
              <p className="text-sm text-neutral-500">This school has no office staff to send a report to.</p>
            )}
            <span className="block text-xs text-neutral-500 mt-1">
              They get it as a task. Your name is recorded as the reporter.
            </span>
            <FieldError>{tried && errors.recipientId}</FieldError>
          </div>

          {serverError && <p role="alert" className="text-sm text-red-600">{serverError}</p>}
        </div>
      )}
    </Modal>
  )
}
