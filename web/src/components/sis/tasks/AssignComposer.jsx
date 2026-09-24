import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import ModalOverlay from '../../ui/ModalOverlay'
import PeoplePicker from '../ui/PeoplePicker'
import { withOrg } from '../../../pages/sis/useSisOrg'
import { INPUT_CLASS } from '../../ui/Input'
import ClassRecipientFilter from './ClassRecipientFilter'
import { officeTaskApi } from '../../../hooks/api/useTasks'
import { useOnboardingTemplates } from '../../../hooks/api/useSisOnboarding'

/**
 * Assign -- the one way to ask anybody at the school to do something.
 *
 * Everything is a task since 2026-09-24 (iCreate meeting 2026-09-23), so the
 * admin never picks a noun first. It opens as the simplest thing -- a title
 * and some people, ticking it off is the whole job -- and the options change
 * what it is:
 *
 *   - "Add steps"                 several steps, each of which can ask for an
 *                                 upload, a typed signature or the office's
 *                                 approval (what a checklist was)
 *   - "Start from a template"     a saved task, filled in
 *   - "Attach a document to sign" each person gets their own copy to sign
 *   - "Repeat"                    a daily duty on chosen weekdays; each day's
 *                                 task is due that day and expires at the end
 *                                 of it
 *
 * Staff, families and students are three lists because the roster each comes
 * from is different and so is the page each works tasks on; one send may mix
 * them.
 */

const inputClass = INPUT_CLASS
const DAYS = [['Mon', 0], ['Tue', 1], ['Wed', 2], ['Thu', 3], ['Fri', 4], ['Sat', 5], ['Sun', 6]]
const AUDIENCES = [['staff', 'Staff'], ['family', 'Families'], ['student', 'Students']]
const PRIORITIES = [['', 'Normal'], ['low', 'Low'], ['high', 'High'], ['urgent', 'Urgent']]

const emptyStep = () => ({ title: '', needs_document: false, needs_signature: false,
  needs_approval: false, required: true })

const todayYmd = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function useRecipients(orgId, audience) {
  const [people, setPeople] = useState([])
  useEffect(() => {
    if (!orgId) return
    api.get(withOrg(`/api/sis/staff-admin/onboarding/recipients?audience=${audience}`, orgId))
      .then((r) => setPeople(r.data?.recipients || [])).catch(() => setPeople([]))
  }, [orgId, audience])
  return people
}

export default function AssignComposer({ orgId, sigEndpoint, allowHr = false, onClose, onAssigned }) {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('')
  const [needsDocument, setNeedsDocument] = useState(false)
  const [steps, setSteps] = useState(null) // null = a single task; a list once "Add steps"
  const [templateId, setTemplateId] = useState('')
  const [saveTemplate, setSaveTemplate] = useState(false)
  const [signFile, setSignFile] = useState(null)
  const [sensitivity, setSensitivity] = useState('general')
  const [blocksAccess, setBlocksAccess] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [days, setDays] = useState([0, 1, 2, 3, 4])
  const [startDate, setStartDate] = useState(todayYmd())
  const [endDate, setEndDate] = useState('')
  const [tab, setTab] = useState('staff')
  const [selected, setSelected] = useState({ staff: [], family: [], student: [] })
  // "Pick a class" (ticket a19d5660) per list: null shows everybody; a list
  // shows that class's people. The selection from before the pick comes back
  // when the class is cleared.
  const [classPeople, setClassPeople] = useState({ family: null, student: null })
  const [beforeClass, setBeforeClass] = useState({ family: null, student: null })
  const [classIds, setClassIds] = useState({ family: '', student: '' })
  const [busy, setBusy] = useState(false)

  const lists = {
    staff: useRecipients(orgId, 'staff'),
    family: useRecipients(orgId, 'family'),
    student: useRecipients(orgId, 'student'),
  }
  const { data: templates = [] } = useOnboardingTemplates(orgId)

  const total = selected.staff.length + selected.family.length + selected.student.length
  const signing = Boolean(signFile)
  const multiStep = Array.isArray(steps)
  // The hold is a family rule: a teacher is not locked out of their classroom
  // over paperwork, and neither is a student. It exists once a family is on
  // the list and the task is more than a tick; a daily duty never holds.
  const requireable = selected.family.length > 0 && !repeat && (signing || multiStep || needsDocument)
  useEffect(() => { if (!requireable) setBlocksAccess(false) }, [requireable])

  const toggle = (audience) => (id) => setSelected((prev) => ({
    ...prev,
    [audience]: prev[audience].includes(id)
      ? prev[audience].filter((x) => x !== id) : [...prev[audience], id],
  }))

  const pickClass = (audience) => (people, id) => {
    setClassIds((p) => ({ ...p, [audience]: id }))
    if (people === null) {
      setClassPeople((p) => ({ ...p, [audience]: null }))
      setSelected((p) => ({ ...p, [audience]: beforeClass[audience] || [] }))
      setBeforeClass((p) => ({ ...p, [audience]: null }))
      return
    }
    if (classPeople[audience] === null) setBeforeClass((p) => ({ ...p, [audience]: selected[audience] }))
    setClassPeople((p) => ({ ...p, [audience]: people }))
    setSelected((p) => ({ ...p, [audience]: people.map((x) => x.id) }))
  }

  const applyTemplate = (id) => {
    setTemplateId(id)
    const t = templates.find((x) => x.id === id)
    if (!t) return
    setTitle(t.name || '')
    setNote(t.description || '')
    setSteps((t.items || []).map((i) => ({
      title: i.title || '', description: i.description || '', link: i.link || '',
      needs_document: !!i.needs_document, needs_signature: !!i.needs_signature,
      needs_approval: !!i.needs_approval, required: i.required !== false,
    })))
    setSaveTemplate(false)
    if (t.audience && t.audience !== tab) setTab(t.audience)
  }

  const setStep = (i, fields) => setSteps((prev) =>
    prev.map((s, idx) => (idx === i ? { ...s, ...fields } : s)))
  const filledSteps = useMemo(() => (steps || []).filter((s) => s.title.trim()), [steps])

  const toggleDay = (d) => setDays((prev) => (prev.includes(d)
    ? prev.filter((x) => x !== d) : [...prev, d].sort()))

  const recipients = () => AUDIENCES.flatMap(([audience]) =>
    selected[audience].map((id) => ({ id, audience })))

  const sendForSignature = async () => {
    // A document to sign rides the signature-request flow: each recipient gets
    // their own copy and a task to sign it, tracked per person.
    const form = new FormData()
    form.append('file', signFile)
    form.append('organization_id', orgId)
    form.append('title', title.trim())
    if (note.trim()) form.append('message', note.trim())
    if (dueDate) form.append('due_date', dueDate)
    form.append('sensitivity', allowHr ? sensitivity : 'general')
    if (requireable && blocksAccess) form.append('blocks_access', 'true')
    selected.staff.forEach((id) => form.append('staff_user_id', id))
    selected.family.forEach((id) => form.append('family_user_id', id))
    const r = await api.post(withOrg(sigEndpoint, orgId), form)
    const sent = r.data?.sent ?? total
    toast.success(r.data?.blocks_access
      ? `Sent to ${sent} ${sent === 1 ? 'person' : 'people'}, required before they can use Optio`
      : `Sent to ${sent} ${sent === 1 ? 'person' : 'people'} to sign`)
  }

  const assign = async () => {
    if (!title.trim()) { toast.error('Give it a title'); return }
    if (!total) { toast.error('Pick at least one person'); return }
    if (multiStep && !filledSteps.length) { toast.error('Add at least one step'); return }
    if (repeat && !days.length) { toast.error('Pick at least one day'); return }
    // A document sent for signature lands on a staff member's or a family's
    // copy in the secure store; a student has no such portal to sign from.
    if (signing && selected.student.length) {
      toast.error('A document to sign goes to staff and families, not students')
      return
    }
    setBusy(true)
    try {
      if (signing) {
        await sendForSignature()
      } else {
        const body = {
          title: title.trim(),
          description: note.trim() || null,
          priority: priority || null,
          recipients: recipients(),
          blocks_access: requireable && blocksAccess,
        }
        if (multiStep) {
          body.items = filledSteps.map((s) => ({
            title: s.title.trim(), description: (s.description || '').trim() || null,
            link: (s.link || '').trim() || null, required: s.required !== false,
            needs_document: s.needs_document, needs_signature: s.needs_signature,
            needs_approval: s.needs_approval,
          }))
        } else {
          body.needs_document = needsDocument
        }
        if (repeat) {
          body.repeat = { days_of_week: days, start_date: startDate, end_date: endDate || null }
        } else {
          body.due_date = dueDate || null
        }
        if (saveTemplate && !templateId) body.save_as_template = true
        const r = await officeTaskApi.assign(orgId, body)
        const n = r.data?.assigned
        const already = r.data?.already_assigned || 0
        if (repeat) {
          toast.success(r.data?.created_today
            ? `Repeating task saved; today's went to ${r.data.created_today}`
            : 'Repeating task saved')
        } else {
          toast.success(already
            ? `Assigned to ${n}; ${already} already had it`
            : `Assigned to ${n} ${n === 1 ? 'person' : 'people'}`)
        }
        if (r.data?.template) toast.success('Saved as a template too')
      }
      onAssigned?.()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not assign it')
    } finally {
      setBusy(false)
    }
  }

  const listFor = (audience) => classPeople[audience] ?? lists[audience]
  const emptyLabel = {
    staff: 'No staff to assign to yet.',
    family: classPeople.family ? 'No families in this class yet.' : 'No families to assign to yet.',
    student: classPeople.student ? 'No students in this class yet.' : 'No students to assign to yet.',
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4"
        role="dialog" aria-modal="true" aria-label="Assign a task">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Assign a task</h2>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-800">Close</button>
        </div>

        {templates.length > 0 && !signing && (
          <label className="block">
            <span className="block text-xs font-medium text-neutral-500 mb-1">
              Start from a template <span className="font-normal text-neutral-400">(optional)</span>
            </span>
            <select value={templateId} onChange={(e) => applyTemplate(e.target.value)}
              className={inputClass} aria-label="Start from a template">
              <option value="">A new task</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="block text-xs font-medium text-neutral-500 mb-1">What needs doing</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Turn in your field trip roster" className={inputClass}
            aria-label="Title" autoFocus />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-neutral-500 mb-1">
            {multiStep ? 'Directions' : 'Note for them'} <span className="font-normal text-neutral-400">(optional)</span>
          </span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="Anything they need to know" className={inputClass}
            aria-label={multiStep ? 'Directions' : 'Note'} />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {!repeat && (
            <label className="block">
              <span className="block text-xs font-medium text-neutral-500 mb-1">
                Due date <span className="font-normal text-neutral-400">(optional)</span>
              </span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className={inputClass} aria-label="Due date" />
            </label>
          )}
          {!signing && (
            <label className="block">
              <span className="block text-xs font-medium text-neutral-500 mb-1">Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}
                className={inputClass} aria-label="Priority">
                {PRIORITIES.map(([v, l]) => <option key={v || 'normal'} value={v}>{l}</option>)}
              </select>
            </label>
          )}
        </div>

        {/* What kind of task this is, decided by what you add. */}
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          {!signing && !multiStep && (
            <label className="flex items-start gap-2 text-sm text-neutral-700 cursor-pointer">
              <input type="checkbox" checked={needsDocument}
                onChange={(e) => setNeedsDocument(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-purple-700" />
              <span>
                They send a file back
                <span className="block text-xs text-neutral-400">
                  Done when they upload it, e.g. a signed permission slip or a photo of a page.
                </span>
              </span>
            </label>
          )}

          {multiStep && (
            <div className="space-y-2">
              <span className="block text-xs font-medium text-neutral-500">Steps</span>
              {steps.map((s, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input value={s.title} onChange={(e) => setStep(i, { title: e.target.value })}
                      placeholder={`Step ${i + 1}`} className={inputClass}
                      aria-label={`Step ${i + 1}`} />
                    <button type="button" onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={`Remove step ${i + 1}`}
                      className="text-neutral-400 hover:text-red-600 font-bold px-1">×</button>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap text-xs text-neutral-600">
                    {[['needs_document', 'They upload a file'], ['needs_signature', 'They sign it'],
                      ['needs_approval', 'Office approves it']].map(([field, label]) => (
                      <label key={field} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={!!s[field]}
                          onChange={(e) => setStep(i, { [field]: e.target.checked })}
                          aria-label={`Step ${i + 1}: ${label}`}
                          className="h-4 w-4 rounded border-gray-300 accent-purple-700" />
                        {label}
                      </label>
                    ))}
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={s.required === false}
                        onChange={(e) => setStep(i, { required: !e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 accent-purple-700" />
                      Optional
                    </label>
                  </div>
                  {s.needs_signature && (
                    <input value={s.link || ''} onChange={(e) => setStep(i, { link: e.target.value })}
                      placeholder="Link to what they are signing (optional)"
                      className={inputClass} aria-label={`Step ${i + 1} link`} />
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setSteps((prev) => [...prev, emptyStep()])}
                className="text-sm text-optio-purple hover:underline">+ Another step</button>
            </div>
          )}

          <div className="flex items-center gap-4 flex-wrap text-sm">
            {!signing && !multiStep && (
              <button type="button" onClick={() => setSteps([emptyStep()])}
                className="text-optio-purple hover:underline">+ Add steps</button>
            )}
            {multiStep && !templateId && (
              <button type="button" onClick={() => setSteps(null)}
                className="text-neutral-500 hover:underline">Back to a single task</button>
            )}
            {!multiStep && !repeat && (
              <label className="text-optio-purple hover:underline cursor-pointer">
                {signing ? 'Change the document' : '+ Attach a document to sign'}
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setSignFile(e.target.files?.[0] || null)} />
              </label>
            )}
            {signing && (
              <>
                <span className="text-xs text-neutral-500">{signFile.name}</span>
                <button type="button" onClick={() => setSignFile(null)}
                  className="text-neutral-500 hover:underline">Remove</button>
              </>
            )}
          </div>

          {signing && (
            <>
              <p className="text-xs text-neutral-500">
                Each person gets their own copy and signs it by typing their name.
                You track who has signed from the Assigned list.
              </p>
              {allowHr && (
                <label className="block">
                  <span className="block text-xs font-medium text-neutral-500 mb-1">Sensitivity</span>
                  <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value)} className={inputClass}>
                    <option value="general">Campus paperwork: the front office can see and track it</option>
                    <option value="hr">HR paperwork: administrators only</option>
                  </select>
                </label>
              )}
            </>
          )}

          {requireable && (
            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 cursor-pointer">
              <input type="checkbox" checked={blocksAccess}
                onChange={(e) => setBlocksAccess(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-purple-700" />
              <span className="text-sm text-neutral-800">
                <span className="font-medium">Require this before they can use Optio</span>
                <span className="block text-xs text-neutral-600 mt-0.5">
                  The {selected.family.length === 1 ? 'family' : 'families'} you selected will see
                  only this until it is done. Students and staff are not affected, and you can
                  release the hold at any time from the Assigned list.
                </span>
              </span>
            </label>
          )}
        </div>

        {!signing && (
          <div className="rounded-lg border border-gray-200 p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
              <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-purple-700" aria-label="Repeat" />
              Repeat
              <span className="text-xs text-neutral-400">Each day&apos;s task is due that day and expires at the end of it.</span>
            </label>
            {repeat && (
              <>
                <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Days">
                  {DAYS.map(([label, d]) => (
                    <button key={d} type="button" onClick={() => toggleDay(d)} aria-pressed={days.includes(d)}
                      className={`px-2.5 py-1 rounded-lg text-sm border ${days.includes(d)
                        ? 'bg-optio-purple text-white border-optio-purple'
                        : 'border-gray-300 text-neutral-600 hover:bg-gray-50'}`}>
                      {label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}
                    className="text-xs text-optio-purple hover:underline ml-2">Every day</button>
                  <button type="button" onClick={() => setDays([0, 1, 2, 3, 4])}
                    className="text-xs text-optio-purple hover:underline">Weekdays</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs font-medium text-neutral-500 mb-1">Starts</span>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                      className={inputClass} aria-label="Starts" />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-neutral-500 mb-1">
                      Ends <span className="font-normal text-neutral-400">(optional)</span>
                    </span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                      className={inputClass} aria-label="Ends" />
                  </label>
                </div>
              </>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-2">
            {AUDIENCES.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setTab(key)}
                className={`px-3 py-1.5 rounded-lg text-sm ${tab === key ? 'bg-optio-purple/10 text-optio-purple font-semibold' : 'text-neutral-600 hover:bg-gray-100'}`}>
                {label}{selected[key].length ? ` (${selected[key].length})` : ''}
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            {tab !== 'staff' && lists[tab].length > 0 && (
              <ClassRecipientFilter key={tab} orgId={orgId} audience={tab} value={classIds[tab]}
                onPick={pickClass(tab)} />
            )}
            <PeoplePicker people={listFor(tab)} selected={selected[tab]} onToggle={toggle(tab)}
              searchLabel="Search recipients" maxHeight="max-h-44" emptyLabel={emptyLabel[tab]} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500">{total} selected</span>
            {!signing && !templateId && (
              <label className="flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer">
                <input type="checkbox" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-purple-700" />
                Save as a template
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">Cancel</button>
            <button type="button" onClick={assign} disabled={busy || !total || !title.trim()}
              className="px-4 py-2 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
              {busy ? 'Assigning…' : signing ? 'Send for signature' : repeat ? 'Save repeating task' : 'Assign'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
